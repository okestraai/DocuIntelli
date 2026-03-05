/**
 * Emergency Access Service
 *
 * Business logic for Trusted Contacts & Emergency Access grants.
 * Keeps route handlers thin — all validation, queries, and side effects live here.
 */

import crypto from 'crypto';
import { query } from './db';
import { sendNotificationEmail, sendDirectEmail, resolveUserInfo } from './emailService';
import { getSignedUrl } from './storage';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_TRUSTED_CONTACTS = 5;
const MAX_EMERGENCY_EVENTS = 10;
const INVITE_TOKEN_BYTES = 32;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TrustedContact {
  id: string;
  owner_id: string;
  contact_email: string;
  contact_user_id: string | null;
  display_name: string;
  relationship: string | null;
  status: 'pending' | 'accepted' | 'revoked';
  invite_sent_at: string | null;
  accepted_at: string | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
  // enriched fields (joined)
  grant_count?: number;
}

export interface EmergencyAccessGrant {
  id: string;
  life_event_id: string;
  trusted_contact_id: string;
  access_policy: 'immediate' | 'time_delayed' | 'approval';
  delay_hours: number;
  is_active: boolean;
  request_status: 'none' | 'pending' | 'approved' | 'denied' | 'auto_granted' | 'vetoed';
  access_requested_at: string | null;
  access_granted_at: string | null;
  cooldown_ends_at: string | null;
  owner_action_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // enriched fields (joined)
  contact_name?: string;
  contact_email?: string;
  contact_status?: string;
  event_title?: string;
  owner_name?: string;
}

export interface AuditEntry {
  id: string;
  grant_id: string;
  actor_user_id: string;
  action: string;
  document_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  actor_name?: string;
  document_name?: string;
}

export interface SharedEventSummary {
  grant_id: string;
  life_event_id: string;
  event_title: string;
  template_id: string;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  access_policy: string;
  delay_hours: number;
  request_status: string;
  access_granted_at: string | null;
  cooldown_ends_at: string | null;
  document_count: number;
}

export interface AccessibleDocument {
  id: string;
  name: string;
  category: string;
  type: string;
  size: string;
  upload_date: string;
  expiration_date: string | null;
  status: string;
}

// ─── Token Helpers ───────────────────────────────────────────────────────────

function generateInviteToken(): { raw: string; hashed: string } {
  const raw = crypto.randomBytes(INVITE_TOKEN_BYTES).toString('hex');
  const hashed = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hashed };
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// ─── Audit Logger ────────────────────────────────────────────────────────────

async function logAudit(
  grantId: string,
  actorUserId: string,
  action: string,
  opts?: { documentId?: string; metadata?: Record<string, unknown>; ip?: string; ua?: string }
): Promise<void> {
  try {
    await query(
      `INSERT INTO emergency_access_audit_log (grant_id, actor_user_id, action, document_id, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        grantId,
        actorUserId,
        action,
        opts?.documentId || null,
        JSON.stringify(opts?.metadata || {}),
        opts?.ip || null,
        opts?.ua?.slice(0, 500) || null,
      ]
    );
  } catch (err) {
    console.error('Emergency access audit log error:', err);
  }
}

// ─── Trusted Contacts ────────────────────────────────────────────────────────

export async function getContactsForOwner(ownerId: string): Promise<TrustedContact[]> {
  const result = await query(
    `SELECT tc.*,
            (SELECT COUNT(*)::int FROM emergency_access_grants eag
             WHERE eag.trusted_contact_id = tc.id AND eag.is_active = true) AS grant_count
     FROM trusted_contacts tc
     WHERE tc.owner_id = $1
     ORDER BY tc.created_at DESC`,
    [ownerId]
  );
  return result.rows;
}

export async function createContact(
  ownerId: string,
  email: string,
  displayName: string,
  relationship?: string
): Promise<{ contact: TrustedContact; rawToken: string }> {
  // Check owner email — cannot invite yourself
  const ownerResult = await query('SELECT email FROM auth_users WHERE id = $1', [ownerId]);
  if (ownerResult.rows[0]?.email?.toLowerCase() === email.toLowerCase()) {
    throw new Error('You cannot add yourself as a trusted contact');
  }

  // Check limit
  const countResult = await query(
    `SELECT COUNT(*)::int AS count FROM trusted_contacts
     WHERE owner_id = $1 AND status != 'revoked'`,
    [ownerId]
  );
  if (countResult.rows[0].count >= MAX_TRUSTED_CONTACTS) {
    throw new Error(`You can have at most ${MAX_TRUSTED_CONTACTS} active trusted contacts`);
  }

  // Generate invite token
  const { raw, hashed } = generateInviteToken();

  // Check if invitee already has a DocuIntelli account
  const existingUser = await query(
    'SELECT id FROM auth_users WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  const contactUserId = existingUser.rows[0]?.id || null;

  // Check if an active or pending contact already exists for this email
  const existingResult = await query(
    `SELECT id, status FROM trusted_contacts WHERE owner_id = $1 AND LOWER(contact_email) = LOWER($2) AND status IN ('pending', 'accepted')`,
    [ownerId, email]
  );
  if (existingResult.rows[0]) {
    const status = existingResult.rows[0].status;
    throw new Error(
      status === 'pending'
        ? 'An invitation has already been sent to this email address'
        : 'This email is already an accepted trusted contact'
    );
  }

  // Check if a previously revoked contact exists for this email — reactivate instead of inserting
  const revokedResult = await query(
    `SELECT id FROM trusted_contacts WHERE owner_id = $1 AND LOWER(contact_email) = LOWER($2) AND status = 'revoked'`,
    [ownerId, email]
  );

  let contact;
  if (revokedResult.rows[0]) {
    const updateResult = await query(
      `UPDATE trusted_contacts
       SET status = 'pending', display_name = $1, relationship = $2, invite_token = $3,
           invite_sent_at = $4, contact_user_id = $5, accepted_at = NULL, last_verified_at = NULL
       WHERE id = $6
       RETURNING *`,
      [displayName, relationship || null, hashed, new Date().toISOString(), contactUserId, revokedResult.rows[0].id]
    );
    contact = updateResult.rows[0];
  } else {
    const insertResult = await query(
      `INSERT INTO trusted_contacts (owner_id, contact_email, contact_user_id, display_name, relationship, invite_token, invite_sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [ownerId, email.toLowerCase(), contactUserId, displayName, relationship || null, hashed, new Date().toISOString()]
    );
    contact = insertResult.rows[0];
  }

  // Send invite email (non-blocking)
  const ownerInfo = await resolveUserInfo(ownerId);
  sendDirectEmail(email, 'emergency_contact_invite', {
    ownerName: ownerInfo?.userName || 'A DocuIntelli user',
    contactName: displayName,
    inviteToken: raw,
    relationship: relationship || null,
  }).catch(err => console.error('Invite email failed:', err));

  return { contact, rawToken: raw };
}

export async function resendInvite(ownerId: string, contactId: string): Promise<string> {
  const contactResult = await query(
    `SELECT * FROM trusted_contacts WHERE id = $1 AND owner_id = $2`,
    [contactId, ownerId]
  );
  const contact = contactResult.rows[0];
  if (!contact) throw new Error('Contact not found');
  if (contact.status !== 'pending') throw new Error('Can only resend invites for pending contacts');

  // Regenerate token
  const { raw, hashed } = generateInviteToken();
  await query(
    `UPDATE trusted_contacts SET invite_token = $1, invite_sent_at = $2 WHERE id = $3`,
    [hashed, new Date().toISOString(), contactId]
  );

  const ownerInfo = await resolveUserInfo(ownerId);
  sendDirectEmail(contact.contact_email, 'emergency_contact_invite', {
    ownerName: ownerInfo?.userName || 'A DocuIntelli user',
    contactName: contact.display_name,
    inviteToken: raw,
    relationship: contact.relationship,
  }).catch(err => console.error('Resend invite email failed:', err));

  return raw;
}

export async function validateInviteToken(rawToken: string): Promise<{
  contact: TrustedContact;
  ownerName: string;
  ownerEmail: string;
} | null> {
  const hashed = hashToken(rawToken);
  const result = await query(
    `SELECT tc.*,
            COALESCE(up.full_name, up.display_name) AS owner_display_name,
            au.email AS owner_email
     FROM trusted_contacts tc
     JOIN auth_users au ON au.id = tc.owner_id
     LEFT JOIN user_profiles up ON up.id = tc.owner_id
     WHERE tc.invite_token = $1 AND tc.status = 'pending'`,
    [hashed]
  );
  if (!result.rows[0]) return null;

  const row = result.rows[0];
  return {
    contact: row,
    ownerName: row.owner_display_name || row.owner_email,
    ownerEmail: row.owner_email,
  };
}

export async function acceptInvite(rawToken: string, acceptingUserId: string): Promise<TrustedContact> {
  const hashed = hashToken(rawToken);

  const contactResult = await query(
    `SELECT * FROM trusted_contacts WHERE invite_token = $1 AND status = 'pending'`,
    [hashed]
  );
  const contact = contactResult.rows[0];
  if (!contact) throw new Error('Invalid or expired invitation');

  // Ensure the accepting user's email matches (or allow any user)
  // For flexibility, we allow any authenticated user to accept — the token is the auth
  await query(
    `UPDATE trusted_contacts
     SET contact_user_id = $1, status = 'accepted', accepted_at = $2, invite_token = NULL, last_verified_at = $2
     WHERE id = $3`,
    [acceptingUserId, new Date().toISOString(), contact.id]
  );

  // Auto-activate any immediate-access grants for this contact
  const now = new Date().toISOString();
  await query(
    `UPDATE emergency_access_grants
     SET request_status = 'approved', access_granted_at = $1, access_requested_at = $1
     WHERE trusted_contact_id = $2 AND is_active = true
       AND access_policy = 'immediate' AND request_status = 'none'`,
    [now, contact.id]
  );

  // Notify the owner
  sendNotificationEmail(contact.owner_id, 'emergency_invite_accepted', {
    contactName: contact.display_name,
    contactEmail: contact.contact_email,
  }).catch(err => console.error('Invite accepted email failed:', err));

  const updated = await query('SELECT * FROM trusted_contacts WHERE id = $1', [contact.id]);
  return updated.rows[0];
}

export async function revokeContact(ownerId: string, contactId: string): Promise<void> {
  const contactResult = await query(
    `SELECT * FROM trusted_contacts WHERE id = $1 AND owner_id = $2`,
    [contactId, ownerId]
  );
  if (!contactResult.rows[0]) throw new Error('Contact not found');

  // Revoke contact
  await query(
    `UPDATE trusted_contacts SET status = 'revoked', invite_token = NULL WHERE id = $1`,
    [contactId]
  );

  // Deactivate all grants for this contact
  await query(
    `UPDATE emergency_access_grants SET is_active = false WHERE trusted_contact_id = $1`,
    [contactId]
  );
}

// ─── Emergency Access Grants ─────────────────────────────────────────────────

export async function getGrantsForEvent(ownerId: string, lifeEventId: string): Promise<EmergencyAccessGrant[]> {
  // Verify ownership
  const eventResult = await query(
    'SELECT id FROM life_events WHERE id = $1 AND user_id = $2',
    [lifeEventId, ownerId]
  );
  if (!eventResult.rows[0]) throw new Error('Life event not found');

  const result = await query(
    `SELECT eag.*,
            tc.display_name AS contact_name,
            tc.contact_email,
            tc.status AS contact_status
     FROM emergency_access_grants eag
     JOIN trusted_contacts tc ON tc.id = eag.trusted_contact_id
     WHERE eag.life_event_id = $1
     ORDER BY eag.created_at DESC`,
    [lifeEventId]
  );
  return result.rows;
}

export async function createGrant(
  ownerId: string,
  lifeEventId: string,
  contactId: string,
  accessPolicy: 'immediate' | 'time_delayed' | 'approval',
  delayHours?: number,
  notes?: string
): Promise<EmergencyAccessGrant> {
  // Verify event ownership
  const eventResult = await query(
    'SELECT id, title FROM life_events WHERE id = $1 AND user_id = $2',
    [lifeEventId, ownerId]
  );
  if (!eventResult.rows[0]) throw new Error('Life event not found');

  // Verify contact belongs to this user (pending or accepted — grant pre-creation allowed)
  const contactResult = await query(
    `SELECT id FROM trusted_contacts WHERE id = $1 AND owner_id = $2 AND status IN ('pending', 'accepted')`,
    [contactId, ownerId]
  );
  if (!contactResult.rows[0]) throw new Error('Contact not found or has been revoked');

  // Check for existing grant for this contact on this life event
  const existingGrant = await query(
    `SELECT id, is_active FROM emergency_access_grants
     WHERE life_event_id = $1 AND trusted_contact_id = $2`,
    [lifeEventId, contactId]
  );
  if (existingGrant.rows[0]) {
    if (existingGrant.rows[0].is_active) {
      throw new Error('This contact already has access to this life event');
    }
    // Reactivate previously revoked grant with new policy
    const effectiveDelay = accessPolicy === 'time_delayed' ? (delayHours || 72) : null;
    const reactivated = await query(
      `UPDATE emergency_access_grants
       SET is_active = true, access_policy = $1, delay_hours = $2, notes = $3,
           request_status = 'none', access_requested_at = NULL, access_granted_at = NULL, cooldown_ends_at = NULL
       WHERE id = $4
       RETURNING *`,
      [accessPolicy, effectiveDelay, notes || null, existingGrant.rows[0].id]
    );
    await logAudit(existingGrant.rows[0].id, ownerId, 'grant_reactivated', {
      metadata: { access_policy: accessPolicy, delay_hours: effectiveDelay },
    });
    return reactivated.rows[0];
  }

  // Check max emergency events
  const countResult = await query(
    `SELECT COUNT(DISTINCT life_event_id)::int AS count
     FROM emergency_access_grants eag
     JOIN life_events le ON le.id = eag.life_event_id
     WHERE le.user_id = $1 AND eag.is_active = true`,
    [ownerId]
  );
  if (countResult.rows[0].count >= MAX_EMERGENCY_EVENTS) {
    throw new Error(`You can enable emergency access on at most ${MAX_EMERGENCY_EVENTS} life events`);
  }

  const effectiveDelay = accessPolicy === 'time_delayed' ? (delayHours || 72) : null;

  const insertResult = await query(
    `INSERT INTO emergency_access_grants (life_event_id, trusted_contact_id, access_policy, delay_hours, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [lifeEventId, contactId, accessPolicy, effectiveDelay, notes || null]
  );

  const grant = insertResult.rows[0];

  // Audit log
  await logAudit(grant.id, ownerId, 'grant_created', {
    metadata: { access_policy: accessPolicy, delay_hours: effectiveDelay },
  });

  return grant;
}

export async function updateGrant(
  ownerId: string,
  grantId: string,
  updates: { access_policy?: string; delay_hours?: number; notes?: string }
): Promise<EmergencyAccessGrant> {
  // Verify ownership chain: grant → life_event → owner
  const grantResult = await query(
    `SELECT eag.* FROM emergency_access_grants eag
     JOIN life_events le ON le.id = eag.life_event_id
     WHERE eag.id = $1 AND le.user_id = $2`,
    [grantId, ownerId]
  );
  if (!grantResult.rows[0]) throw new Error('Grant not found');

  const grant = grantResult.rows[0];

  // If changing policy while a request is pending, cancel the pending request
  if (updates.access_policy && updates.access_policy !== grant.access_policy && grant.request_status === 'pending') {
    await query(
      `UPDATE emergency_access_grants
       SET request_status = 'none', access_requested_at = NULL, cooldown_ends_at = NULL
       WHERE id = $1`,
      [grantId]
    );
  }

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (updates.access_policy) {
    setClauses.push(`access_policy = $${idx}`);
    params.push(updates.access_policy);
    idx++;
  }
  if (updates.delay_hours !== undefined) {
    setClauses.push(`delay_hours = $${idx}`);
    params.push(updates.delay_hours);
    idx++;
  }
  if (updates.notes !== undefined) {
    setClauses.push(`notes = $${idx}`);
    params.push(updates.notes);
    idx++;
  }

  if (setClauses.length === 0) throw new Error('Nothing to update');

  params.push(grantId);
  const result = await query(
    `UPDATE emergency_access_grants SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );

  await logAudit(grantId, ownerId, 'grant_updated', { metadata: updates });

  return result.rows[0];
}

export async function revokeGrant(ownerId: string, grantId: string): Promise<void> {
  const grantResult = await query(
    `SELECT eag.id FROM emergency_access_grants eag
     JOIN life_events le ON le.id = eag.life_event_id
     WHERE eag.id = $1 AND le.user_id = $2`,
    [grantId, ownerId]
  );
  if (!grantResult.rows[0]) throw new Error('Grant not found');

  await query(
    `UPDATE emergency_access_grants SET is_active = false WHERE id = $1`,
    [grantId]
  );

  await logAudit(grantId, ownerId, 'grant_revoked');
}

// ─── Access Request Flow ─────────────────────────────────────────────────────

export async function requestAccess(
  contactUserId: string,
  grantId: string,
  opts?: { ip?: string; ua?: string }
): Promise<{ status: string; cooldownEndsAt?: string }> {
  // Validate: this user is the contact on this grant
  const grantResult = await query(
    `SELECT eag.*, tc.contact_user_id, tc.owner_id, tc.display_name AS contact_name,
            le.title AS event_title, le.user_id AS event_owner_id
     FROM emergency_access_grants eag
     JOIN trusted_contacts tc ON tc.id = eag.trusted_contact_id
     JOIN life_events le ON le.id = eag.life_event_id
     WHERE eag.id = $1 AND eag.is_active = true`,
    [grantId]
  );
  const grant = grantResult.rows[0];
  if (!grant) throw new Error('Grant not found');
  if (grant.contact_user_id !== contactUserId) throw new Error('Unauthorized');
  if (grant.request_status === 'approved' || grant.request_status === 'auto_granted') {
    throw new Error('Access already granted');
  }
  if (grant.request_status === 'pending') {
    throw new Error('Access request already pending');
  }

  const now = new Date().toISOString();

  if (grant.access_policy === 'immediate') {
    // Grant immediately
    await query(
      `UPDATE emergency_access_grants
       SET request_status = 'approved', access_requested_at = $1, access_granted_at = $1
       WHERE id = $2`,
      [now, grantId]
    );
    await logAudit(grantId, contactUserId, 'access_requested', opts);
    await logAudit(grantId, contactUserId, 'access_granted', opts);

    // Notify owner
    sendNotificationEmail(grant.event_owner_id, 'emergency_access_requested', {
      contactName: grant.contact_name,
      eventTitle: grant.event_title,
      accessPolicy: 'immediate',
      message: `${grant.contact_name} has been granted immediate access to your "${grant.event_title}" documents.`,
    }).catch(err => console.error('Access notification failed:', err));

    return { status: 'approved' };
  }

  if (grant.access_policy === 'time_delayed') {
    const cooldownEndsAt = new Date(Date.now() + (grant.delay_hours || 72) * 3600000).toISOString();
    await query(
      `UPDATE emergency_access_grants
       SET request_status = 'pending', access_requested_at = $1, cooldown_ends_at = $2
       WHERE id = $3`,
      [now, cooldownEndsAt, grantId]
    );
    await logAudit(grantId, contactUserId, 'access_requested', { ...opts, metadata: { cooldown_ends_at: cooldownEndsAt } });

    // Notify owner
    sendNotificationEmail(grant.event_owner_id, 'emergency_access_requested', {
      contactName: grant.contact_name,
      eventTitle: grant.event_title,
      accessPolicy: 'time_delayed',
      delayHours: grant.delay_hours,
      message: `${grant.contact_name} is requesting access to your "${grant.event_title}" documents. Access will be auto-granted in ${grant.delay_hours} hours unless you veto.`,
    }).catch(err => console.error('Access notification failed:', err));

    return { status: 'pending', cooldownEndsAt };
  }

  // approval policy
  await query(
    `UPDATE emergency_access_grants
     SET request_status = 'pending', access_requested_at = $1
     WHERE id = $2`,
    [now, grantId]
  );
  await logAudit(grantId, contactUserId, 'access_requested', opts);

  // Notify owner
  sendNotificationEmail(grant.event_owner_id, 'emergency_access_requested', {
    contactName: grant.contact_name,
    eventTitle: grant.event_title,
    accessPolicy: 'approval',
    message: `${grant.contact_name} is requesting access to your "${grant.event_title}" documents. Please approve or deny this request.`,
  }).catch(err => console.error('Access notification failed:', err));

  return { status: 'pending' };
}

export async function approveAccess(ownerId: string, grantId: string): Promise<void> {
  const grantResult = await query(
    `SELECT eag.*, tc.display_name AS contact_name, tc.contact_user_id,
            le.title AS event_title
     FROM emergency_access_grants eag
     JOIN trusted_contacts tc ON tc.id = eag.trusted_contact_id
     JOIN life_events le ON le.id = eag.life_event_id
     WHERE eag.id = $1 AND le.user_id = $2 AND eag.request_status = 'pending'`,
    [grantId, ownerId]
  );
  if (!grantResult.rows[0]) throw new Error('Pending request not found');

  const grant = grantResult.rows[0];
  const now = new Date().toISOString();

  await query(
    `UPDATE emergency_access_grants
     SET request_status = 'approved', access_granted_at = $1, owner_action_at = $1
     WHERE id = $2`,
    [now, grantId]
  );

  await logAudit(grantId, ownerId, 'access_granted');

  // Notify contact
  if (grant.contact_user_id) {
    sendNotificationEmail(grant.contact_user_id, 'emergency_access_granted', {
      contactName: grant.contact_name,
      eventTitle: grant.event_title,
    }).catch(err => console.error('Access granted email failed:', err));
  }
}

export async function denyAccess(ownerId: string, grantId: string): Promise<void> {
  const grantResult = await query(
    `SELECT eag.*, tc.display_name AS contact_name, tc.contact_user_id,
            le.title AS event_title
     FROM emergency_access_grants eag
     JOIN trusted_contacts tc ON tc.id = eag.trusted_contact_id
     JOIN life_events le ON le.id = eag.life_event_id
     WHERE eag.id = $1 AND le.user_id = $2 AND eag.request_status = 'pending'`,
    [grantId, ownerId]
  );
  if (!grantResult.rows[0]) throw new Error('Pending request not found');

  const grant = grantResult.rows[0];
  const now = new Date().toISOString();

  await query(
    `UPDATE emergency_access_grants
     SET request_status = 'denied', owner_action_at = $1
     WHERE id = $2`,
    [now, grantId]
  );

  await logAudit(grantId, ownerId, 'access_denied');

  if (grant.contact_user_id) {
    sendNotificationEmail(grant.contact_user_id, 'emergency_access_denied', {
      contactName: grant.contact_name,
      eventTitle: grant.event_title,
    }).catch(err => console.error('Access denied email failed:', err));
  }
}

export async function vetoAccess(ownerId: string, grantId: string): Promise<void> {
  const grantResult = await query(
    `SELECT eag.*, tc.display_name AS contact_name, tc.contact_user_id,
            le.title AS event_title
     FROM emergency_access_grants eag
     JOIN trusted_contacts tc ON tc.id = eag.trusted_contact_id
     JOIN life_events le ON le.id = eag.life_event_id
     WHERE eag.id = $1 AND le.user_id = $2
       AND eag.request_status = 'pending'
       AND eag.access_policy = 'time_delayed'`,
    [grantId, ownerId]
  );
  if (!grantResult.rows[0]) throw new Error('No pending time-delayed request to veto');

  const grant = grantResult.rows[0];
  const now = new Date().toISOString();

  await query(
    `UPDATE emergency_access_grants
     SET request_status = 'vetoed', owner_action_at = $1, cooldown_ends_at = NULL
     WHERE id = $2`,
    [now, grantId]
  );

  await logAudit(grantId, ownerId, 'access_vetoed');

  if (grant.contact_user_id) {
    sendNotificationEmail(grant.contact_user_id, 'emergency_access_denied', {
      contactName: grant.contact_name,
      eventTitle: grant.event_title,
    }).catch(err => console.error('Veto email failed:', err));
  }
}

export async function getPendingApprovals(ownerId: string): Promise<EmergencyAccessGrant[]> {
  const result = await query(
    `SELECT eag.*, tc.display_name AS contact_name, tc.contact_email,
            le.title AS event_title
     FROM emergency_access_grants eag
     JOIN trusted_contacts tc ON tc.id = eag.trusted_contact_id
     JOIN life_events le ON le.id = eag.life_event_id
     WHERE le.user_id = $1 AND eag.request_status = 'pending' AND eag.is_active = true
     ORDER BY eag.access_requested_at ASC`,
    [ownerId]
  );
  return result.rows;
}

// ─── Document Access (Contact-side) ──────────────────────────────────────────

export async function getSharedWithMe(contactUserId: string): Promise<SharedEventSummary[]> {
  const result = await query(
    `SELECT eag.id AS grant_id,
            eag.life_event_id,
            le.title AS event_title,
            le.template_id,
            le.user_id AS owner_id,
            COALESCE(up.full_name, up.display_name, au.email) AS owner_name,
            au.email AS owner_email,
            eag.access_policy,
            eag.delay_hours,
            eag.request_status,
            eag.access_granted_at,
            eag.cooldown_ends_at,
            (SELECT COUNT(*)::int FROM life_event_requirement_matches lerm WHERE lerm.life_event_id = le.id) AS document_count
     FROM emergency_access_grants eag
     JOIN trusted_contacts tc ON tc.id = eag.trusted_contact_id
     JOIN life_events le ON le.id = eag.life_event_id
     JOIN auth_users au ON au.id = le.user_id
     LEFT JOIN user_profiles up ON up.id = le.user_id
     WHERE tc.contact_user_id = $1
       AND tc.status = 'accepted'
       AND eag.is_active = true
       AND le.status = 'active'
     ORDER BY eag.created_at DESC`,
    [contactUserId]
  );
  return result.rows;
}

export async function getSharedEventDetail(contactUserId: string, grantId: string): Promise<{
  grant: EmergencyAccessGrant;
  documents: AccessibleDocument[];
}> {
  const grantResult = await query(
    `SELECT eag.*, tc.contact_user_id, le.title AS event_title,
            COALESCE(up.full_name, up.display_name, au.email) AS owner_name
     FROM emergency_access_grants eag
     JOIN trusted_contacts tc ON tc.id = eag.trusted_contact_id
     JOIN life_events le ON le.id = eag.life_event_id
     JOIN auth_users au ON au.id = le.user_id
     LEFT JOIN user_profiles up ON up.id = le.user_id
     WHERE eag.id = $1 AND tc.contact_user_id = $2 AND eag.is_active = true`,
    [grantId, contactUserId]
  );
  if (!grantResult.rows[0]) throw new Error('Grant not found');

  const grant = grantResult.rows[0];
  const hasAccess = grant.request_status === 'approved' || grant.request_status === 'auto_granted';

  let documents: AccessibleDocument[] = [];
  if (hasAccess) {
    // Fetch documents linked to the life event via requirement matches
    const docsResult = await query(
      `SELECT DISTINCT d.id, d.name, d.category, d.type, d.size, d.upload_date, d.expiration_date, d.status
       FROM documents d
       JOIN life_event_requirement_matches lerm ON lerm.document_id = d.id
       WHERE lerm.life_event_id = $1
       ORDER BY d.name ASC`,
      [grant.life_event_id]
    );

    // Also include custom requirement docs
    const customDocsResult = await query(
      `SELECT DISTINCT d.id, d.name, d.category, d.type, d.size, d.upload_date, d.expiration_date, d.status
       FROM documents d
       JOIN life_event_custom_requirements lecr ON lecr.document_id = d.id
       WHERE lecr.life_event_id = $1 AND lecr.document_id IS NOT NULL`,
      [grant.life_event_id]
    );

    const docMap = new Map<string, AccessibleDocument>();
    for (const doc of [...docsResult.rows, ...customDocsResult.rows]) {
      docMap.set(doc.id, doc);
    }
    documents = Array.from(docMap.values());
  }

  return { grant, documents };
}

export async function getDocumentUrl(
  contactUserId: string,
  grantId: string,
  documentId: string,
  opts?: { ip?: string; ua?: string }
): Promise<string> {
  // Validate access chain
  const grantResult = await query(
    `SELECT eag.*, tc.contact_user_id
     FROM emergency_access_grants eag
     JOIN trusted_contacts tc ON tc.id = eag.trusted_contact_id
     WHERE eag.id = $1 AND tc.contact_user_id = $2 AND eag.is_active = true
       AND eag.request_status IN ('approved', 'auto_granted')`,
    [grantId, contactUserId]
  );
  if (!grantResult.rows[0]) throw new Error('Access not granted');

  const grant = grantResult.rows[0];

  // Verify document belongs to the life event
  const docResult = await query(
    `SELECT d.file_path FROM documents d
     WHERE d.id = $1
       AND (
         EXISTS (SELECT 1 FROM life_event_requirement_matches lerm WHERE lerm.document_id = d.id AND lerm.life_event_id = $2)
         OR EXISTS (SELECT 1 FROM life_event_custom_requirements lecr WHERE lecr.document_id = d.id AND lecr.life_event_id = $2)
       )`,
    [documentId, grant.life_event_id]
  );
  if (!docResult.rows[0]) throw new Error('Document not found in this life event');

  const filePath = docResult.rows[0].file_path;
  if (!filePath) throw new Error('Document file not available');

  // Generate signed URL
  const url = await getSignedUrl(filePath, 3600);

  // Audit log
  await logAudit(grantId, contactUserId, 'document_viewed', {
    documentId,
    ip: opts?.ip,
    ua: opts?.ua,
  });

  return url;
}

// ─── Audit Log ───────────────────────────────────────────────────────────────

export async function getAuditLog(ownerId: string, grantId?: string): Promise<AuditEntry[]> {
  let sql: string;
  let params: unknown[];

  if (grantId) {
    sql = `SELECT eal.*,
                  COALESCE(up.full_name, up.display_name, au.email) AS actor_name,
                  d.name AS document_name
           FROM emergency_access_audit_log eal
           JOIN auth_users au ON au.id = eal.actor_user_id
           LEFT JOIN user_profiles up ON up.id = eal.actor_user_id
           LEFT JOIN documents d ON d.id = eal.document_id
           JOIN emergency_access_grants eag ON eag.id = eal.grant_id
           JOIN life_events le ON le.id = eag.life_event_id
           WHERE eal.grant_id = $1 AND le.user_id = $2
           ORDER BY eal.created_at DESC
           LIMIT 100`;
    params = [grantId, ownerId];
  } else {
    sql = `SELECT eal.*,
                  COALESCE(up.full_name, up.display_name, au.email) AS actor_name,
                  d.name AS document_name
           FROM emergency_access_audit_log eal
           JOIN auth_users au ON au.id = eal.actor_user_id
           LEFT JOIN user_profiles up ON up.id = eal.actor_user_id
           LEFT JOIN documents d ON d.id = eal.document_id
           JOIN emergency_access_grants eag ON eag.id = eal.grant_id
           JOIN life_events le ON le.id = eag.life_event_id
           WHERE le.user_id = $1
           ORDER BY eal.created_at DESC
           LIMIT 200`;
    params = [ownerId];
  }

  const result = await query(sql, params);
  return result.rows;
}

// ─── Cron Job Helpers (called by scheduler) ──────────────────────────────────

export async function autoGrantExpiredCooldowns(): Promise<number> {
  const result = await query(
    `SELECT eag.id, eag.trusted_contact_id, tc.contact_user_id, tc.display_name AS contact_name,
            le.title AS event_title, le.user_id AS owner_id
     FROM emergency_access_grants eag
     JOIN trusted_contacts tc ON tc.id = eag.trusted_contact_id
     JOIN life_events le ON le.id = eag.life_event_id
     WHERE eag.access_policy = 'time_delayed'
       AND eag.request_status = 'pending'
       AND eag.cooldown_ends_at <= NOW()
       AND eag.access_granted_at IS NULL
       AND eag.is_active = true`
  );

  const now = new Date().toISOString();
  let granted = 0;

  for (const row of result.rows) {
    await query(
      `UPDATE emergency_access_grants
       SET request_status = 'auto_granted', access_granted_at = $1
       WHERE id = $2`,
      [now, row.id]
    );
    await logAudit(row.id, row.contact_user_id || row.owner_id, 'access_auto_granted');

    // Notify contact
    if (row.contact_user_id) {
      sendNotificationEmail(row.contact_user_id, 'emergency_access_granted', {
        contactName: row.contact_name,
        eventTitle: row.event_title,
      }).catch(() => {});
    }

    // Notify owner
    sendNotificationEmail(row.owner_id, 'emergency_access_granted', {
      contactName: row.contact_name,
      eventTitle: row.event_title,
    }).catch(() => {});

    granted++;
  }

  return granted;
}

export async function sendCooldownReminders(): Promise<number> {
  // Find grants where cooldown ends within 25 hours and reminder hasn't been sent
  const result = await query(
    `SELECT eag.id, eag.cooldown_ends_at, tc.display_name AS contact_name,
            le.title AS event_title, le.user_id AS owner_id
     FROM emergency_access_grants eag
     JOIN trusted_contacts tc ON tc.id = eag.trusted_contact_id
     JOIN life_events le ON le.id = eag.life_event_id
     WHERE eag.access_policy = 'time_delayed'
       AND eag.request_status = 'pending'
       AND eag.cooldown_ends_at BETWEEN NOW() AND NOW() + INTERVAL '25 hours'
       AND eag.access_granted_at IS NULL
       AND eag.is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM emergency_access_audit_log eal
         WHERE eal.grant_id = eag.id AND eal.action = 'access_auto_granted'
       )`
  );

  let sent = 0;
  for (const row of result.rows) {
    const hoursLeft = Math.max(1, Math.round(
      (new Date(row.cooldown_ends_at).getTime() - Date.now()) / 3600000
    ));

    sendNotificationEmail(row.owner_id, 'emergency_cooldown_reminder', {
      contactName: row.contact_name,
      eventTitle: row.event_title,
      hoursRemaining: hoursLeft,
    }).catch(() => {});

    sent++;
  }

  return sent;
}

export async function reverifyStaleContacts(): Promise<number> {
  const result = await query(
    `SELECT tc.id, tc.owner_id, tc.display_name
     FROM trusted_contacts tc
     WHERE tc.status = 'accepted'
       AND (tc.last_verified_at IS NULL OR tc.last_verified_at < NOW() - INTERVAL '90 days')`
  );

  // For now, just log — re-verification emails can be added later
  // In production, this would send an email to the owner asking them to re-verify
  return result.rows.length;
}
