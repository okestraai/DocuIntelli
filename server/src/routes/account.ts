import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { query } from '../services/db';
import { loadSubscription } from '../middleware/subscriptionGuard';
import { sendNotificationEmail, resolveUserInfo } from '../services/emailService';
import { listBlobs, deleteFromStorage } from '../services/storage';
import { revokeAllUserTokens } from '../services/authService';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const router = Router();

router.use(loadSubscription);

/**
 * DELETE /api/account
 * Cascading account deletion: chunks -> storage -> documents -> profile -> stripe -> subscription -> refresh tokens -> auth user
 */
router.delete('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    console.log(`Account deletion requested for user: ${userId}`);

    // Resolve user info for email BEFORE deleting anything
    const userInfo = await resolveUserInfo(userId);

    // 1. Get document file paths for storage cleanup
    const docsResult = await query(
      `SELECT id, file_path FROM documents WHERE user_id = $1`,
      [userId]
    );
    const documents = docsResult.rows;

    // 2. Delete document chunks
    try {
      await query(
        `DELETE FROM document_chunks WHERE user_id = $1`,
        [userId]
      );
    } catch (chunksErr) {
      console.error('Error deleting document chunks:', chunksErr);
    }

    // 3. Delete storage files (Azure Blob Storage)
    if (documents && documents.length > 0) {
      const filePaths = documents
        .map((d: any) => d.file_path)
        .filter((p: string | null): p is string => !!p);

      for (const fp of filePaths) {
        try {
          await deleteFromStorage(fp);
        } catch (e) {
          console.error(`Warning: Error deleting storage file ${fp}:`, e);
        }
      }

      // Also try listing and deleting any remaining blobs in user folder
      try {
        const blobs = await listBlobs(userId + '/');
        for (const blobName of blobs) {
          await deleteFromStorage(blobName);
        }
      } catch (e) {
        console.error('Warning: Error cleaning user storage folder:', e);
      }
    }

    // 4. Delete documents
    try {
      await query(
        `DELETE FROM documents WHERE user_id = $1`,
        [userId]
      );
    } catch (docsErr) {
      console.error('Error deleting documents:', docsErr);
    }

    // 5. Delete user profile
    try {
      await query(
        `DELETE FROM user_profiles WHERE id = $1`,
        [userId]
      );
    } catch (profileErr) {
      console.error('Error deleting user profile:', profileErr);
    }

    // 6. Cancel Stripe subscription (before deleting local record)
    try {
      const subResult = await query(
        `SELECT stripe_subscription_id, stripe_customer_id FROM user_subscriptions WHERE user_id = $1`,
        [userId]
      );
      const sub = subResult.rows[0];
      if (sub?.stripe_subscription_id) {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id);
        console.log(`Stripe subscription ${sub.stripe_subscription_id} cancelled for user ${userId}`);
      }
      if (sub?.stripe_customer_id) {
        await stripe.customers.del(sub.stripe_customer_id);
        console.log(`Stripe customer ${sub.stripe_customer_id} deleted for user ${userId}`);
      }
    } catch (stripeErr: any) {
      console.error('Error cancelling Stripe subscription:', stripeErr.message);
    }

    // 7. Delete user subscription record
    try {
      await query(
        `DELETE FROM user_subscriptions WHERE user_id = $1`,
        [userId]
      );
    } catch (subErr) {
      console.error('Error deleting user subscription:', subErr);
    }

    // 8. Send account deletion email (before deleting auth user)
    if (userInfo) {
      try {
        await sendNotificationEmail(userId, 'account_deleted', {
          userName: userInfo.userName,
          email: userInfo.email,
          documentCount: documents?.length || 0,
          deletedAt: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        });
      } catch (emailErr) {
        console.error('Account deletion email failed:', emailErr);
      }
    }

    // 9. Revoke all refresh tokens
    try {
      await revokeAllUserTokens(userId);
    } catch (tokenErr) {
      console.error('Error revoking refresh tokens:', tokenErr);
    }

    // 10. Delete the auth user from auth_users table
    try {
      await query('DELETE FROM auth_users WHERE id = $1', [userId]);
    } catch (authErr) {
      console.error('Error deleting auth user:', authErr);
    }

    console.log(`Account fully deleted for user: ${userId}`);

    res.json({ success: true });
  } catch (err: any) {
    console.error('Account deletion error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete account' });
  }
});

export default router;
