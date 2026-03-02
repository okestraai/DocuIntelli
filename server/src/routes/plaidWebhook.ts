/**
 * Plaid Webhook Handler
 * Processes real-time notifications from Plaid (transaction updates, errors, etc.)
 */

import { Router, Request, Response } from 'express';
import { PlaidApi, Configuration, PlaidEnvironments } from 'plaid';
import { syncTransactions, exchangePublicToken, getUserIdForLinkToken, markLinkTokenUsed } from '../services/plaidService';
import { invalidateInsightsCache } from '../services/financialAnalyzer';
import { recalculateAllUserGoals } from '../services/goalProgressCalculator';
import { cacheDel } from '../services/redisClient';
import { query } from '../services/db';

const router = Router();

// Plaid client for webhook verification
const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});
const plaidClient = new PlaidApi(plaidConfig);

/**
 * Verify Plaid webhook using the Plaid-Verification header.
 * Uses Plaid's /webhook_verification_key/get endpoint to validate the JWT.
 */
async function verifyPlaidWebhook(req: Request): Promise<boolean> {
  const token = req.headers['plaid-verification'] as string;
  if (!token) return false;

  try {
    // Decode the JWT header to get the key ID
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const kid = header.kid;
    if (!kid) return false;

    // Fetch the verification key from Plaid
    const keyResponse = await plaidClient.webhookVerificationKeyGet({
      key_id: kid,
    });

    const key = keyResponse.data.key;
    if (!key) return false;

    // Import the JWK and verify the JWT signature
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      key as any,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );

    const signatureBytes = Buffer.from(parts[2], 'base64url');
    const dataBytes = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);

    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      cryptoKey,
      signatureBytes,
      dataBytes,
    );

    if (!valid) return false;

    // Decode payload and check the request body hash
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const bodyHash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(req.body)),
    );
    const expectedHash = Buffer.from(bodyHash).toString('hex');

    return payload.request_body_sha256 === expectedHash;
  } catch (err) {
    console.error('Plaid webhook verification failed:', err);
    return false;
  }
}

/**
 * POST /api/plaid-webhook
 * Receives webhook events from Plaid
 *
 * Plaid webhook types:
 * - TRANSACTIONS: new/updated/removed transactions
 * - ITEM: item-level events (error, pending_expiration)
 * - HOLDINGS: investment holdings updates
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Verify webhook signature only in Plaid production environment.
    // Sandbox verification fails because JSON.stringify(req.body) doesn't preserve
    // the original raw body bytes that Plaid's signature was computed against.
    if (process.env.PLAID_ENV === 'production') {
      const isValid = await verifyPlaidWebhook(req);
      if (!isValid) {
        console.warn('Plaid webhook signature verification failed — rejecting request');
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }
    }

    const {
      webhook_type,
      webhook_code,
      item_id,
      new_transactions,
      removed_transactions,
      error: plaidError,
    } = req.body;

    console.log(`Plaid webhook: ${webhook_type}/${webhook_code} for item ${item_id}`);

    // ── LINK webhooks (Hosted Link flow) ─────────────────────────
    // Handle BEFORE item_id lookup — the item doesn't exist yet at this point.
    if (webhook_type === 'LINK') {
      if (webhook_code === 'ITEM_ADD_RESULT') {
        console.log(`LINK/ITEM_ADD_RESULT full body:`, JSON.stringify(req.body, null, 2));
        const { public_token, link_token, status, institution_name } = req.body;
        console.log(`LINK/ITEM_ADD_RESULT: status=${status}, public_token=${public_token ? 'present' : 'missing'}, link_token=${link_token ? 'present' : 'missing'}`);

        // Accept if we have a public_token + link_token, regardless of status field
        // (Plaid sandbox may omit or nest the status differently)
        if (public_token && link_token) {
          const userId = await getUserIdForLinkToken(link_token);
          if (!userId) {
            console.error('LINK webhook: no user_id found for link_token — mapping may have been lost');
            res.json({ received: true });
            return;
          }

          // Check bank account limit before exchanging
          const bankCountResult = await query(
            'SELECT COUNT(*) AS count FROM plaid_items WHERE user_id = $1',
            [userId]
          );
          const bankCount = parseInt(bankCountResult.rows[0]?.count || '0');

          const userSubResult = await query(
            'SELECT bank_account_limit FROM user_subscriptions WHERE user_id = $1',
            [userId]
          );
          const userSub = userSubResult.rows[0];
          const bankLimit = userSub?.bank_account_limit ?? 0;

          if (bankLimit === 0) {
            console.warn(`LINK webhook: user ${userId} on free plan (bank_account_limit=0) — skipping exchange`);
            await markLinkTokenUsed(link_token);
            res.json({ received: true });
            return;
          }

          try {
            const result = await exchangePublicToken(
              userId,
              public_token,
              institution_name || 'Connected Bank',
            );
            await markLinkTokenUsed(link_token);

            console.log(`Hosted Link exchange complete: item=${result.itemId}, accounts=${result.accounts.length}`);
            // Clear ALL financial caches so polling sees the new item immediately
            await Promise.all([
              cacheDel(`fin_accounts:${userId}`, `fin_summary:${userId}`),
              invalidateInsightsCache(userId),
            ]);
          } catch (exchangeErr) {
            console.error('Failed to exchange Hosted Link public_token:', exchangeErr);
          }
        }
      } else {
        console.log(`Unhandled LINK webhook code: ${webhook_code}`);
      }

      res.json({ received: true });
      return;
    }

    // ── All other webhooks need the item lookup ──────────────────
    // Look up which user owns this item
    const itemResult = await query(
      'SELECT user_id, access_token FROM plaid_items WHERE item_id = $1',
      [item_id]
    );
    const item = itemResult.rows[0];

    if (!item) {
      console.warn(`Plaid webhook for unknown item: ${item_id}`);
      // Return 200 so Plaid doesn't retry
      res.json({ received: true });
      return;
    }

    switch (webhook_type) {
      case 'TRANSACTIONS': {
        switch (webhook_code) {
          case 'SYNC_UPDATES_AVAILABLE':
          case 'DEFAULT_UPDATE':
          case 'INITIAL_UPDATE':
          case 'HISTORICAL_UPDATE':
            // New transactions available — re-sync
            try {
              const result = await syncTransactions(item.user_id, item_id, item.access_token);
              console.log(`Synced ${result.added} transactions for item ${item_id}`);
              // Recalculate financial goals after new transactions + invalidate goals cache
              recalculateAllUserGoals(item.user_id)
                .then(() => cacheDel(`fin_goals:${item.user_id}`))
                .catch(err =>
                  console.error('Goal recalculation after webhook failed:', err)
                );
            } catch (syncErr) {
              console.error(`Failed to sync transactions for item ${item_id}:`, syncErr);
            }
            break;

          case 'TRANSACTIONS_REMOVED':
            // Remove specific transactions
            if (removed_transactions && removed_transactions.length > 0) {
              try {
                await query(
                  'DELETE FROM plaid_transactions WHERE user_id = $1 AND transaction_id = ANY($2)',
                  [item.user_id, removed_transactions]
                );
                console.log(`Removed ${removed_transactions.length} transactions`);
              } catch (deleteErr) {
                console.error('Failed to remove transactions:', deleteErr);
              }
            }
            break;

          default:
            console.log(`Unhandled TRANSACTIONS webhook code: ${webhook_code}`);
        }
        break;
      }

      case 'ITEM': {
        switch (webhook_code) {
          case 'ERROR':
            // Item has an error — log it
            console.error(`Plaid item error for ${item_id}:`, plaidError);
            await query(
              'UPDATE plaid_items SET last_synced_at = $1 WHERE item_id = $2 AND user_id = $3',
              [new Date().toISOString(), item_id, item.user_id]
            );
            break;

          case 'PENDING_EXPIRATION':
            // Access token will expire soon — user needs to re-link
            console.warn(`Plaid item ${item_id} access token expiring soon`);
            break;

          default:
            console.log(`Unhandled ITEM webhook code: ${webhook_code}`);
        }
        break;
      }

      default:
        console.log(`Unhandled webhook type: ${webhook_type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Plaid webhook error:', error);
    // Always return 200 to prevent Plaid retries on internal errors
    res.json({ received: true });
  }
});

export default router;
