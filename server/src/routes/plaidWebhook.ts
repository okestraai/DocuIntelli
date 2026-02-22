/**
 * Plaid Webhook Handler
 * Processes real-time notifications from Plaid (transaction updates, errors, etc.)
 */

import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { syncTransactions, exchangePublicToken, getUserIdForLinkToken, markLinkTokenUsed } from '../services/plaidService';
import { invalidateInsightsCache } from '../services/financialAnalyzer';
import { cacheDel } from '../services/redisClient';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    const {
      webhook_type,
      webhook_code,
      item_id,
      new_transactions,
      removed_transactions,
      error: plaidError,
    } = req.body;

    console.log(`📩 Plaid webhook: ${webhook_type}/${webhook_code} for item ${item_id}`);

    // ── LINK webhooks (Hosted Link flow) ─────────────────────────
    // Handle BEFORE item_id lookup — the item doesn't exist yet at this point.
    if (webhook_type === 'LINK') {
      if (webhook_code === 'ITEM_ADD_RESULT') {
        console.log(`🔗 LINK/ITEM_ADD_RESULT full body:`, JSON.stringify(req.body, null, 2));
        const { public_token, link_token, status, institution_name } = req.body;
        console.log(`🔗 LINK/ITEM_ADD_RESULT: status=${status}, public_token=${public_token ? 'present' : 'missing'}, link_token=${link_token ? 'present' : 'missing'}`);

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
          const { count: bankCount } = await supabase
            .from('plaid_items')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);
          const { data: userSub } = await supabase
            .from('user_subscriptions')
            .select('bank_account_limit')
            .eq('user_id', userId)
            .single();
          const bankLimit = userSub?.bank_account_limit ?? 0;

          if (bankLimit === 0) {
            console.warn(`⚠️ LINK webhook: user ${userId} on free plan (bank_account_limit=0) — skipping exchange`);
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
            console.log(`✅ Hosted Link exchange complete: item=${result.itemId}, accounts=${result.accounts.length}`);
            await markLinkTokenUsed(link_token);
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
    const { data: item } = await supabase
      .from('plaid_items')
      .select('user_id, access_token')
      .eq('item_id', item_id)
      .single();

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
              console.log(`✅ Synced ${result.added} transactions for item ${item_id}`);
            } catch (syncErr) {
              console.error(`Failed to sync transactions for item ${item_id}:`, syncErr);
            }
            break;

          case 'TRANSACTIONS_REMOVED':
            // Remove specific transactions
            if (removed_transactions && removed_transactions.length > 0) {
              const { error: deleteErr } = await supabase
                .from('plaid_transactions')
                .delete()
                .eq('user_id', item.user_id)
                .in('transaction_id', removed_transactions);

              if (deleteErr) {
                console.error('Failed to remove transactions:', deleteErr);
              } else {
                console.log(`🗑️  Removed ${removed_transactions.length} transactions`);
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
            console.error(`⚠️  Plaid item error for ${item_id}:`, plaidError);
            await supabase
              .from('plaid_items')
              .update({
                last_synced_at: new Date().toISOString(),
              })
              .eq('item_id', item_id)
              .eq('user_id', item.user_id);
            break;

          case 'PENDING_EXPIRATION':
            // Access token will expire soon — user needs to re-link
            console.warn(`⏳ Plaid item ${item_id} access token expiring soon`);
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
