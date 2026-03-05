/**
 * Support Ticket API routes
 *
 * User endpoints: create, list, detail, messages, reply
 * Admin endpoints: list all, detail, update status, assign, reply
 *
 * IMPORTANT: Admin routes (/admin/*) are registered BEFORE wildcard /:id
 * routes to prevent Express from matching "admin" as a ticket UUID.
 */

import { Router, Request, Response } from 'express';
import { loadSubscription } from '../middleware/subscriptionGuard';
import { requireAdmin } from '../middleware/requireAdmin';
import * as svc from '../services/supportTicketService';

const router = Router();

// All routes require authentication
router.use(loadSubscription);

// =============================================================================
// ADMIN ROUTES — registered first to avoid /:id wildcard conflict
// =============================================================================

// GET /api/support-tickets/admin/all — list all tickets with filters
router.get('/admin/all', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, category, priority, search, page, limit } = req.query;
    const result = await svc.getAllTickets({
      status: status as any,
      category: category as any,
      priority: priority as any,
      search: search as string,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20,
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Admin list tickets error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/support-tickets/admin/:id — admin ticket detail + messages
router.get('/admin/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const ticket = await svc.getAdminTicketById(req.params.id);
    if (!ticket) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }
    const messages = await svc.getAdminTicketMessages(req.params.id);
    res.json({ success: true, ticket, messages });
  } catch (err: any) {
    console.error('Admin ticket detail error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/support-tickets/admin/:id/status — update ticket status
router.patch('/admin/:id/status', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.body;
    if (!status) {
      res.status(400).json({ success: false, error: 'status is required' });
      return;
    }
    const ticket = await svc.updateTicketStatus(req.params.id, status);
    res.json({ success: true, ticket });
  } catch (err: any) {
    console.error('Update status error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// PATCH /api/support-tickets/admin/:id/assign — assign ticket
router.patch('/admin/:id/assign', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { assigned_to } = req.body;
    const ticket = await svc.assignTicket(req.params.id, assigned_to || null);
    res.json({ success: true, ticket });
  } catch (err: any) {
    console.error('Assign ticket error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/support-tickets/admin/:id/messages — admin reply
router.post('/admin/:id/messages', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { body } = req.body;
    if (!body) {
      res.status(400).json({ success: false, error: 'body is required' });
      return;
    }
    const message = await svc.addAdminMessage(req.userId!, req.params.id, body);
    res.json({ success: true, message });
  } catch (err: any) {
    console.error('Admin reply error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// =============================================================================
// USER ROUTES
// =============================================================================

// GET /api/support-tickets — list user's tickets
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    const tickets = await svc.getUserTickets(req.userId!, status as any);
    res.json({ success: true, tickets });
  } catch (err: any) {
    console.error('List tickets error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/support-tickets — create ticket
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { subject, description, category, priority } = req.body;
    if (!subject || !description) {
      res.status(400).json({ success: false, error: 'subject and description are required' });
      return;
    }
    const ticket = await svc.createTicket(req.userId!, subject, description, category, priority);
    res.json({ success: true, ticket });
  } catch (err: any) {
    console.error('Create ticket error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/support-tickets/unread-count — count tickets with unread admin messages
router.get('/unread-count', async (req: Request, res: Response): Promise<void> => {
  try {
    const count = await svc.getUnreadTicketCount(req.userId!);
    res.json({ success: true, count });
  } catch (err: any) {
    console.error('Unread count error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/support-tickets/:id/seen — mark ticket as seen by user
router.post('/:id/seen', async (req: Request, res: Response): Promise<void> => {
  try {
    await svc.markTicketSeen(req.userId!, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Mark seen error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/support-tickets/:id — get ticket detail
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const ticket = await svc.getUserTicketById(req.userId!, req.params.id);
    if (!ticket) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }
    res.json({ success: true, ticket });
  } catch (err: any) {
    console.error('Get ticket error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/support-tickets/:id/messages — get ticket messages
router.get('/:id/messages', async (req: Request, res: Response): Promise<void> => {
  try {
    const messages = await svc.getTicketMessages(req.params.id, req.userId!);
    res.json({ success: true, messages });
  } catch (err: any) {
    console.error('Get messages error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/support-tickets/:id/messages — add user message
router.post('/:id/messages', async (req: Request, res: Response): Promise<void> => {
  try {
    const { body } = req.body;
    if (!body) {
      res.status(400).json({ success: false, error: 'body is required' });
      return;
    }
    const message = await svc.addUserMessage(req.userId!, req.params.id, body);
    res.json({ success: true, message });
  } catch (err: any) {
    console.error('Add message error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
