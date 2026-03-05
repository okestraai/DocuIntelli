/**
 * Support Ticket Service
 *
 * Business logic for user support tickets and admin triage.
 * Keeps route handlers thin — all validation, queries, and side effects live here.
 */

import { query } from './db';
import { sendNotificationEmail } from './emailService';

// ─── Types ───────────────────────────────────────────────────────────────────

export type TicketCategory = 'general' | 'billing' | 'technical' | 'account' | 'feature_request' | 'bug_report';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in_progress' | 'waiting_on_user' | 'resolved' | 'closed';

export interface SupportTicket {
  id: string;
  ticket_number: string;
  user_id: string;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assigned_to: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  user_last_seen_at?: string;
  // enriched (joined / computed)
  user_email?: string;
  user_name?: string;
  assigned_name?: string;
  message_count?: number;
  latest_message_at?: string;
  resolution_hours?: number;
  has_unread?: boolean;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  is_admin: boolean;
  body: string;
  created_at: string;
  // enriched
  sender_name?: string;
  sender_email?: string;
}

// ─── Validation helpers ──────────────────────────────────────────────────────

const VALID_CATEGORIES: TicketCategory[] = ['general', 'billing', 'technical', 'account', 'feature_request', 'bug_report'];

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  general: 'General',
  billing: 'Billing',
  technical: 'Technical',
  account: 'Account',
  feature_request: 'Feature Request',
  bug_report: 'Bug Report',
};
const VALID_PRIORITIES: TicketPriority[] = ['low', 'medium', 'high', 'urgent'];
const VALID_STATUSES: TicketStatus[] = ['open', 'in_progress', 'waiting_on_user', 'resolved', 'closed'];

// ─── User-facing functions ───────────────────────────────────────────────────

export async function createTicket(
  userId: string,
  subject: string,
  description: string,
  category: TicketCategory = 'general',
  priority: TicketPriority = 'medium'
): Promise<SupportTicket> {
  if (!subject?.trim()) throw new Error('Subject is required');
  if (!description?.trim()) throw new Error('Description is required');
  if (subject.length > 200) throw new Error('Subject must be 200 characters or less');
  if (description.length > 5000) throw new Error('Description must be 5000 characters or less');
  if (!VALID_CATEGORIES.includes(category)) throw new Error('Invalid category');
  if (!VALID_PRIORITIES.includes(priority)) throw new Error('Invalid priority');

  const result = await query(
    `INSERT INTO support_tickets (user_id, subject, description, category, priority)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, subject.trim(), description.trim(), category, priority]
  );
  const ticket = result.rows[0] as SupportTicket;

  // Send confirmation email (non-blocking)
  sendNotificationEmail(userId, 'support_ticket_created', {
    ticketNumber: ticket.ticket_number,
    subject: ticket.subject,
    category: CATEGORY_LABELS[category],
    priority: priority.charAt(0).toUpperCase() + priority.slice(1),
  }).catch(() => {});

  return ticket;
}

export async function getUserTickets(
  userId: string,
  status?: TicketStatus
): Promise<SupportTicket[]> {
  let sql = `SELECT st.*,
                    (SELECT COUNT(*)::int FROM support_ticket_messages stm WHERE stm.ticket_id = st.id) AS message_count,
                    (SELECT MAX(stm.created_at) FROM support_ticket_messages stm WHERE stm.ticket_id = st.id) AS latest_message_at,
                    CASE WHEN st.resolved_at IS NOT NULL
                      THEN ROUND(EXTRACT(EPOCH FROM (st.resolved_at - st.created_at)) / 3600, 1)
                      ELSE NULL END AS resolution_hours,
                    EXISTS(
                      SELECT 1 FROM support_ticket_messages stm
                      WHERE stm.ticket_id = st.id AND stm.is_admin = true
                      AND (st.user_last_seen_at IS NULL OR stm.created_at > st.user_last_seen_at)
                    ) AS has_unread
             FROM support_tickets st
             WHERE st.user_id = $1`;
  const params: unknown[] = [userId];

  if (status && VALID_STATUSES.includes(status)) {
    sql += ` AND st.status = $2`;
    params.push(status);
  }

  sql += ` ORDER BY st.updated_at DESC`;

  const result = await query(sql, params);
  return result.rows;
}

export async function getUserTicketById(
  userId: string,
  ticketId: string
): Promise<SupportTicket | null> {
  const result = await query(
    `SELECT st.*,
            (SELECT COUNT(*)::int FROM support_ticket_messages stm WHERE stm.ticket_id = st.id) AS message_count,
            CASE WHEN st.resolved_at IS NOT NULL
              THEN ROUND(EXTRACT(EPOCH FROM (st.resolved_at - st.created_at)) / 3600, 1)
              ELSE NULL END AS resolution_hours
     FROM support_tickets st
     WHERE st.id = $1 AND st.user_id = $2`,
    [ticketId, userId]
  );
  return result.rows[0] || null;
}

export async function getTicketMessages(
  ticketId: string,
  userId: string
): Promise<TicketMessage[]> {
  // Verify ownership first
  const ticket = await query(
    'SELECT id FROM support_tickets WHERE id = $1 AND user_id = $2',
    [ticketId, userId]
  );
  if (!ticket.rows[0]) throw new Error('Ticket not found');

  const result = await query(
    `SELECT stm.*,
            COALESCE(up.full_name, up.display_name, au.email) AS sender_name,
            au.email AS sender_email
     FROM support_ticket_messages stm
     JOIN auth_users au ON au.id = stm.sender_id
     LEFT JOIN user_profiles up ON up.id = stm.sender_id
     WHERE stm.ticket_id = $1
     ORDER BY stm.created_at ASC`,
    [ticketId]
  );
  return result.rows;
}

export async function addUserMessage(
  userId: string,
  ticketId: string,
  body: string
): Promise<TicketMessage> {
  if (!body?.trim()) throw new Error('Message body is required');
  if (body.length > 5000) throw new Error('Message must be 5000 characters or less');

  // Verify ownership and check status
  const ticket = await query(
    'SELECT id, status FROM support_tickets WHERE id = $1 AND user_id = $2',
    [ticketId, userId]
  );
  if (!ticket.rows[0]) throw new Error('Ticket not found');
  if (['closed', 'resolved'].includes(ticket.rows[0].status)) {
    throw new Error('Cannot reply to a closed or resolved ticket');
  }

  const result = await query(
    `INSERT INTO support_ticket_messages (ticket_id, sender_id, is_admin, body)
     VALUES ($1, $2, false, $3)
     RETURNING *`,
    [ticketId, userId, body.trim()]
  );

  // If ticket was waiting_on_user, move it back to open
  if (ticket.rows[0].status === 'waiting_on_user') {
    await query(
      `UPDATE support_tickets SET status = 'open' WHERE id = $1`,
      [ticketId]
    );
  }

  return result.rows[0];
}

// ─── Admin functions ─────────────────────────────────────────────────────────

export async function getAllTickets(params: {
  status?: TicketStatus;
  category?: TicketCategory;
  priority?: TicketPriority;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ tickets: SupportTicket[]; total: number }> {
  const { status, category, priority, search, page = 1, limit = 20 } = params;
  const offset = (page - 1) * limit;

  const whereClauses: string[] = [];
  const queryParams: unknown[] = [];
  let idx = 1;

  if (status && VALID_STATUSES.includes(status)) {
    whereClauses.push(`st.status = $${idx}`);
    queryParams.push(status);
    idx++;
  }
  if (category && VALID_CATEGORIES.includes(category)) {
    whereClauses.push(`st.category = $${idx}`);
    queryParams.push(category);
    idx++;
  }
  if (priority && VALID_PRIORITIES.includes(priority)) {
    whereClauses.push(`st.priority = $${idx}`);
    queryParams.push(priority);
    idx++;
  }
  if (search) {
    whereClauses.push(`(st.subject ILIKE $${idx} OR au.email ILIKE $${idx})`);
    queryParams.push(`%${search}%`);
    idx++;
  }

  const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Count total
  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM support_tickets st
     JOIN auth_users au ON au.id = st.user_id
     ${where}`,
    queryParams
  );
  const total = countResult.rows[0].total;

  // Fetch page
  const dataParams = [...queryParams, limit, offset];
  const result = await query(
    `SELECT st.*,
            au.email AS user_email,
            COALESCE(up.full_name, up.display_name) AS user_name,
            COALESCE(admin_up.full_name, admin_up.display_name) AS assigned_name,
            (SELECT COUNT(*)::int FROM support_ticket_messages stm WHERE stm.ticket_id = st.id) AS message_count,
            (SELECT MAX(stm.created_at) FROM support_ticket_messages stm WHERE stm.ticket_id = st.id) AS latest_message_at,
            CASE WHEN st.resolved_at IS NOT NULL
              THEN ROUND(EXTRACT(EPOCH FROM (st.resolved_at - st.created_at)) / 3600, 1)
              ELSE NULL END AS resolution_hours
     FROM support_tickets st
     JOIN auth_users au ON au.id = st.user_id
     LEFT JOIN user_profiles up ON up.id = st.user_id
     LEFT JOIN user_profiles admin_up ON admin_up.id = st.assigned_to
     ${where}
     ORDER BY
       CASE st.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       st.updated_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    dataParams
  );

  return { tickets: result.rows, total };
}

export async function getAdminTicketById(ticketId: string): Promise<SupportTicket | null> {
  const result = await query(
    `SELECT st.*,
            au.email AS user_email,
            COALESCE(up.full_name, up.display_name) AS user_name,
            COALESCE(admin_up.full_name, admin_up.display_name) AS assigned_name,
            (SELECT COUNT(*)::int FROM support_ticket_messages stm WHERE stm.ticket_id = st.id) AS message_count,
            CASE WHEN st.resolved_at IS NOT NULL
              THEN ROUND(EXTRACT(EPOCH FROM (st.resolved_at - st.created_at)) / 3600, 1)
              ELSE NULL END AS resolution_hours
     FROM support_tickets st
     JOIN auth_users au ON au.id = st.user_id
     LEFT JOIN user_profiles up ON up.id = st.user_id
     LEFT JOIN user_profiles admin_up ON admin_up.id = st.assigned_to
     WHERE st.id = $1`,
    [ticketId]
  );
  return result.rows[0] || null;
}

export async function getAdminTicketMessages(ticketId: string): Promise<TicketMessage[]> {
  const result = await query(
    `SELECT stm.*,
            COALESCE(up.full_name, up.display_name, au.email) AS sender_name,
            au.email AS sender_email
     FROM support_ticket_messages stm
     JOIN auth_users au ON au.id = stm.sender_id
     LEFT JOIN user_profiles up ON up.id = stm.sender_id
     WHERE stm.ticket_id = $1
     ORDER BY stm.created_at ASC`,
    [ticketId]
  );
  return result.rows;
}

export async function updateTicketStatus(
  ticketId: string,
  status: TicketStatus
): Promise<SupportTicket> {
  if (!VALID_STATUSES.includes(status)) throw new Error('Invalid status');

  const updates: string[] = [`status = $1`];
  const params: unknown[] = [status];

  if (status === 'resolved') {
    updates.push(`resolved_at = now()`);
  }
  if (status === 'closed') {
    updates.push(`closed_at = now()`);
  }

  params.push(ticketId);
  const result = await query(
    `UPDATE support_tickets SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!result.rows[0]) throw new Error('Ticket not found');
  return result.rows[0];
}

export async function assignTicket(
  ticketId: string,
  adminUserId: string | null
): Promise<SupportTicket> {
  const result = await query(
    `UPDATE support_tickets SET assigned_to = $1 WHERE id = $2 RETURNING *`,
    [adminUserId, ticketId]
  );
  if (!result.rows[0]) throw new Error('Ticket not found');
  return result.rows[0];
}

export async function addAdminMessage(
  adminUserId: string,
  ticketId: string,
  body: string
): Promise<TicketMessage> {
  if (!body?.trim()) throw new Error('Message body is required');
  if (body.length > 5000) throw new Error('Message must be 5000 characters or less');

  const result = await query(
    `INSERT INTO support_ticket_messages (ticket_id, sender_id, is_admin, body)
     VALUES ($1, $2, true, $3)
     RETURNING *`,
    [ticketId, adminUserId, body.trim()]
  );

  // Auto-set status to in_progress if still open
  await query(
    `UPDATE support_tickets SET status = 'in_progress'
     WHERE id = $1 AND status = 'open'`,
    [ticketId]
  );

  return result.rows[0];
}

// ─── Notification helpers ───────────────────────────────────────────────────

export async function markTicketSeen(
  userId: string,
  ticketId: string
): Promise<void> {
  const result = await query(
    `UPDATE support_tickets SET user_last_seen_at = now()
     WHERE id = $1 AND user_id = $2`,
    [ticketId, userId]
  );
  if (result.rowCount === 0) throw new Error('Ticket not found');
}

export async function getUnreadTicketCount(userId: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*)::int AS count
     FROM support_tickets st
     WHERE st.user_id = $1
       AND st.status NOT IN ('closed')
       AND EXISTS(
         SELECT 1 FROM support_ticket_messages stm
         WHERE stm.ticket_id = st.id AND stm.is_admin = true
         AND (st.user_last_seen_at IS NULL OR stm.created_at > st.user_last_seen_at)
       )`,
    [userId]
  );
  return result.rows[0].count;
}
