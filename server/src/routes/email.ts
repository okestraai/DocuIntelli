/**
 * Email Notification API Routes
 *
 * Endpoints for triggering email notifications from the frontend
 * and for email service administration.
 */

import { Router, Request, Response } from 'express';
import { loadSubscription } from '../middleware/subscriptionGuard';
import {
  sendNotificationEmail,
  sendDirectEmail,
  verifyEmailConnection,
  resolveUserInfo,
} from '../services/emailService';

const router = Router();
router.use(loadSubscription);

// ─── POST /email/welcome — Send welcome email (called after signup) ────────

router.post('/welcome', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const userInfo = await resolveUserInfo(userId);
    if (!userInfo) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const result = await sendNotificationEmail(userId, 'welcome', {
      userName: userInfo.userName,
      email: userInfo.email,
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Welcome email error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /email/password-changed — Send password changed notification ─────

router.post('/password-changed', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const userInfo = await resolveUserInfo(userId);
    if (!userInfo) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const result = await sendNotificationEmail(userId, 'password_changed', {
      userName: userInfo.userName,
      email: userInfo.email,
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Password changed email error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /email/account-deleted — Send account deletion confirmation ──────

router.post('/account-deleted', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, userName, documentCount } = req.body;

    if (!email) {
      res.status(400).json({ success: false, error: 'email is required' });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ success: false, error: 'Invalid email format' });
      return;
    }

    // Verify email matches the authenticated user to prevent sending to arbitrary addresses
    const userId = req.userId!;
    const userInfo = await resolveUserInfo(userId);
    if (!userInfo || userInfo.email !== email) {
      res.status(403).json({ success: false, error: 'Email does not match authenticated user' });
      return;
    }

    const result = await sendDirectEmail(email, 'account_deleted', {
      userName: userName || '',
      email,
      documentCount: documentCount || 0,
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Account deleted email error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /email/document-processing-failed ────────────────────────────────

router.post('/document-processing-failed', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { documentName, errorMessage } = req.body;

    const userInfo = await resolveUserInfo(userId);
    if (!userInfo) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const result = await sendNotificationEmail(userId, 'document_processing_failed', {
      userName: userInfo.userName,
      documentName: documentName || 'Unknown document',
      errorMessage: errorMessage || 'An unexpected error occurred during processing.',
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Document processing failed email error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /email/document-expiring — Send expiration reminders ─────────────

router.post('/document-expiring', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { documents } = req.body;

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      res.status(400).json({ success: false, error: 'documents array is required' });
      return;
    }

    const userInfo = await resolveUserInfo(userId);
    if (!userInfo) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const result = await sendNotificationEmail(userId, 'document_expiring', {
      userName: userInfo.userName,
      documents,
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Document expiring email error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /email/weekly-audit — Send weekly audit digest ───────────────────

router.post('/weekly-audit', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { auditData } = req.body;

    if (!auditData) {
      res.status(400).json({ success: false, error: 'auditData is required' });
      return;
    }

    const userInfo = await resolveUserInfo(userId);
    if (!userInfo) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const result = await sendNotificationEmail(userId, 'weekly_audit', {
      userName: userInfo.userName,
      ...auditData,
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Weekly audit email error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /email/profile-updated — Send profile update confirmation ──────

router.post('/profile-updated', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { changes } = req.body;

    const userInfo = await resolveUserInfo(userId);
    if (!userInfo) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const result = await sendNotificationEmail(userId, 'profile_updated', {
      userName: userInfo.userName,
      changes: changes || [],
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Profile updated email error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /email/preferences-updated — Send preferences change confirmation ─

router.post('/preferences-updated', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { changes } = req.body;

    const userInfo = await resolveUserInfo(userId);
    if (!userInfo) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const result = await sendNotificationEmail(userId, 'preferences_updated', {
      userName: userInfo.userName,
      changes: changes || [],
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Preferences updated email error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /email/test — Send a test email (for admin/debug) ───────────────

router.post('/test', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const userInfo = await resolveUserInfo(userId);
    if (!userInfo) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    // Send a welcome email as a test
    const result = await sendNotificationEmail(userId, 'welcome', {
      userName: userInfo.userName,
      email: userInfo.email,
    });

    res.json({
      success: true,
      message: 'Test email sent',
      recipient: userInfo.email,
      ...result,
    });
  } catch (err: any) {
    console.error('Test email error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /email/verify — Verify SMTP connection ───────────────────────────

router.get('/verify', async (_req: Request, res: Response): Promise<void> => {
  try {
    const connected = await verifyEmailConnection();
    res.json({
      success: true,
      smtp_connected: connected,
      host: process.env.SMTP_HOST || 'in-v3.mailjet.com',
      port: process.env.SMTP_PORT || '587',
    });
  } catch (err: any) {
    res.json({
      success: false,
      smtp_connected: false,
      error: err.message,
    });
  }
});

export default router;
