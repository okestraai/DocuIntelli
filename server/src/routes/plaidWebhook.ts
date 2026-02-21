/**
 * Plaid Webhook Handler
 * Processes real-time notifications from Plaid (transaction updates, errors, etc.)
 */

import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { syncTransactions } from '../services/plaidService';

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
