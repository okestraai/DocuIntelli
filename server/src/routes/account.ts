import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { loadSubscription } from '../middleware/subscriptionGuard';
import { sendNotificationEmail, resolveUserInfo } from '../services/emailService';

const router = Router();

router.use(loadSubscription);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration in account routes');
}

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
    const { data: documents } = await supabase
      .from('documents')
      .select('id, file_path')
      .eq('user_id', userId);

    // 2. Delete document chunks
    const { error: chunksError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('user_id', userId);

    if (chunksError) {
      console.error('⚠️ Error deleting document chunks:', chunksError);
    }

    // 3. Delete storage files
    if (documents && documents.length > 0) {
      const filePaths = documents
        .map(d => d.file_path)
        .filter((p): p is string => !!p);

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
    const { error: docsError } = await supabase
      .from('documents')
      .delete()
      .eq('user_id', userId);

    if (docsError) {
      console.error('⚠️ Error deleting documents:', docsError);
    }

    // 5. Delete user profile
    const { error: profileError } = await supabase
      .from('user_profiles')
      .delete()
      .eq('id', userId);

    if (profileError) {
      console.error('⚠️ Error deleting user profile:', profileError);
    }

    // 6. Delete user subscription
    const { error: subError } = await supabase
      .from('user_subscriptions')
      .delete()
      .eq('user_id', userId);

    if (subError) {
      console.error('⚠️ Error deleting user subscription:', subError);
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

    // 8. Delete the auth user
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
