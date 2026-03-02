import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { query } from '../services/db';
import { loadSubscription } from '../middleware/subscriptionGuard';
import { sendNotificationEmail, resolveUserInfo } from '../services/emailService';
import { listBlobs, deleteFromStorage } from '../services/storage';

const router = Router();

router.use(loadSubscription);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration in account routes');
}

// Keep Supabase client ONLY for auth.admin.deleteUser (auth management)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * DELETE /api/account
 * Cascading account deletion: chunks → storage → documents → profile → subscription → auth user
 */
router.delete('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    console.log(`🗑️ Account deletion requested for user: ${userId}`);

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
      console.error('⚠️ Error deleting document chunks:', chunksErr);
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
      console.error('⚠️ Error deleting documents:', docsErr);
    }

    // 5. Delete user profile
    try {
      await query(
        `DELETE FROM user_profiles WHERE id = $1`,
        [userId]
      );
    } catch (profileErr) {
      console.error('⚠️ Error deleting user profile:', profileErr);
    }

    // 6. Delete user subscription
    try {
      await query(
        `DELETE FROM user_subscriptions WHERE user_id = $1`,
        [userId]
      );
    } catch (subErr) {
      console.error('⚠️ Error deleting user subscription:', subErr);
    }

    // 7. Send account deletion email (before deleting auth user)
    if (userInfo) {
      try {
        await sendNotificationEmail(userId, 'account_deleted', {
          userName: userInfo.userName,
          email: userInfo.email,
          documentCount: documents?.length || 0,
          deletedAt: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        });
      } catch (emailErr) {
        console.error('⚠️ Account deletion email failed:', emailErr);
      }
    }

    // 8. Delete the auth user (Supabase auth admin)
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) {
      console.error('⚠️ Error deleting auth user:', authError);
    }

    console.log(`✅ Account fully deleted for user: ${userId}`);

    res.json({ success: true });
  } catch (err: any) {
    console.error('❌ Account deletion error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete account' });
  }
});

export default router;
