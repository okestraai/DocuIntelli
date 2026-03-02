import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { query } from '../services/db';
import { loadSubscription } from '../middleware/subscriptionGuard';
import { sendNotificationEmail, resolveUserInfo } from '../services/emailService';

const router = Router();

router.use(loadSubscription);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration in account routes');
}

// Keep Supabase client ONLY for auth.admin and storage operations (Phase 2 migration)
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

    // 3. Delete storage files (uses Supabase storage — Phase 2 migration)
    if (documents && documents.length > 0) {
      const filePaths = documents
        .map((d: any) => d.file_path)
        .filter((p: string | null): p is string => !!p);

      if (filePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('documents')
          .remove(filePaths);

        if (storageError) {
          console.error('⚠️ Error deleting storage files:', storageError);
        }
      }

      // Also try listing and deleting from user folder
      try {
        const { data: folderFiles } = await supabase.storage
          .from('documents')
          .list(userId);

        if (folderFiles && folderFiles.length > 0) {
          const folderPaths = folderFiles.map(f => `${userId}/${f.name}`);
          await supabase.storage.from('documents').remove(folderPaths);
        }
      } catch (e) {
        console.error('⚠️ Error cleaning user storage folder:', e);
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

    // 8. Delete the auth user (uses Supabase auth admin — Phase 2 migration)
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
