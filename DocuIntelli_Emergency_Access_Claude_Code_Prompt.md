# Claude Code Prompt: Emergency Access & Trusted Contacts (Scoped to Life Events)

## Context

DocuIntelli is an AI-powered document intelligence platform. It already has a **Life Events** feature where users group documents under life event categories (e.g., "Buying a Home," "New Baby," "Retirement Planning"). Each Life Event contains associated documents.

We are adding **Emergency Access & Trusted Contacts** as a layer on top of the existing Life Events feature. This is NOT a standalone feature — it extends Life Events by allowing users to designate trusted individuals who can request access to documents within a specific Life Event group.

**Critical scope rule:** Trusted Contact access is scoped to individual Life Event groups, NOT the user's entire document vault. A Trusted Contact assigned to "Financial Planning" cannot see documents in "New Baby." Each Life Event has its own independent access configuration.

## Tech Stack

- **Backend:** Node.js / Express (or whatever the current DocuIntelli backend uses — check the existing codebase first)
- **Database:** Supabase (PostgreSQL) — extend the existing schema
- **Auth:** Existing DocuIntelli auth system (Supabase Auth)
- **Frontend:** React (check existing codebase for component patterns, styling approach, and state management)
- **Notifications:** Email (existing email service), push notifications if already implemented

## Before You Start

1. **Read the existing codebase first.** Understand the current Life Events data model, API routes, and frontend components before writing anything. Find the Life Events table/entity and understand its schema, relationships, and how documents are associated with Life Events.
2. **Follow existing patterns.** Match the project's coding style, file structure, naming conventions, error handling patterns, and API response format.
3. **Do not refactor existing code** unless necessary for integration. This is an additive feature.

---

## Database Schema

Create the following new tables. The `life_event_id` foreign key references whatever the existing Life Events table/entity is — find the correct table name and primary key column from the current schema.

### `trusted_contacts`

Stores the global list of people a user has designated as trusted contacts. Contacts are managed centrally but assigned per Life Event.

```sql
CREATE TABLE trusted_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_email VARCHAR(255) NOT NULL,
  contact_name VARCHAR(100) NOT NULL,
  relationship_label VARCHAR(50), -- e.g., 'Spouse', 'Sibling', 'Attorney', 'Business Partner'
  status VARCHAR(20) NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'revoked')),
  invite_token UUID DEFAULT gen_random_uuid(),
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, contact_email)
);
```

### `life_event_access_policies`

Defines what access a specific trusted contact has to a specific Life Event. This is the join table that scopes access to Life Events — NOT to the entire vault.

```sql
CREATE TABLE life_event_access_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  life_event_id UUID NOT NULL REFERENCES <life_events_table>(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES trusted_contacts(id) ON DELETE CASCADE,
  policy_type VARCHAR(20) NOT NULL DEFAULT 'approval_only' CHECK (policy_type IN ('approval_only', 'time_delayed', 'immediate')),
  cooldown_days INTEGER DEFAULT 7 CHECK (cooldown_days >= 1 AND cooldown_days <= 90),
  permission_level VARCHAR(20) NOT NULL DEFAULT 'read_only' CHECK (permission_level IN ('read_only')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(life_event_id, contact_id)
);
```

### `access_requests`

Tracks when a trusted contact requests access to a Life Event's documents.

```sql
CREATE TABLE access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES life_event_access_policies(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES trusted_contacts(id) ON DELETE CASCADE,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'auto_granted')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  cooldown_expires_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(30) CHECK (resolved_by IN ('owner_approved', 'owner_denied', 'auto_granted', 'expired', 'owner_revoked'))
);
```

### `access_audit_log`

Immutable log of every document view by a trusted contact.

```sql
CREATE TABLE access_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  life_event_id UUID NOT NULL REFERENCES <life_events_table>(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES trusted_contacts(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES <documents_table>(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL DEFAULT 'viewed' CHECK (action IN ('viewed')),
  ip_address INET,
  accessed_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Row Level Security (RLS)

Enable RLS on all new tables. Policies:

- `trusted_contacts`: Owner can CRUD their own contacts. A user can read their own record where they are the `contact_user_id`.
- `life_event_access_policies`: Owner of the Life Event can CRUD. Trusted contact can read policies where they are the contact.
- `access_requests`: Owner can read/update (approve/deny). Contact can read and create.
- `access_audit_log`: Owner can read. Contact can read their own entries. Insert allowed by system/service role only.

### Indexes

```sql
CREATE INDEX idx_trusted_contacts_owner ON trusted_contacts(owner_id);
CREATE INDEX idx_trusted_contacts_contact_user ON trusted_contacts(contact_user_id);
CREATE INDEX idx_trusted_contacts_email ON trusted_contacts(contact_email);
CREATE INDEX idx_life_event_access_policies_life_event ON life_event_access_policies(life_event_id);
CREATE INDEX idx_life_event_access_policies_contact ON life_event_access_policies(contact_id);
CREATE INDEX idx_access_requests_policy ON access_requests(policy_id);
CREATE INDEX idx_access_requests_contact ON access_requests(contact_id);
CREATE INDEX idx_access_requests_status ON access_requests(status);
CREATE INDEX idx_access_audit_log_life_event ON access_audit_log(life_event_id);
CREATE INDEX idx_access_audit_log_contact ON access_audit_log(contact_id);
```

---

## Backend API Endpoints

Implement the following REST endpoints. Follow the existing API pattern (check for middleware, auth guards, error handling, response format).

### Trusted Contacts (Global Management)

```
GET    /api/trusted-contacts              → List all contacts for authenticated user
POST   /api/trusted-contacts              → Create/invite a new trusted contact
PATCH  /api/trusted-contacts/:id          → Update contact details (name, relationship)
DELETE /api/trusted-contacts/:id          → Revoke a trusted contact (set status to 'revoked', cancel all pending requests)
POST   /api/trusted-contacts/:id/resend   → Resend invitation email
```

**POST /api/trusted-contacts body:**
```json
{
  "contact_name": "string, required",
  "contact_email": "string, required, valid email",
  "relationship_label": "string, optional"
}
```

**Business rules for trusted contacts:**
- Max 5 active trusted contacts per user (Pro tier only — check subscription status)
- Cannot invite yourself
- Cannot invite the same email twice (unique constraint handles this)
- Sending an invitation emails the contact with a unique invite link
- When a contact accepts the invitation and has/creates a DocuIntelli account, set `contact_user_id` and status to 'active'
- Revoking a contact: set status to 'revoked', cancel all pending access_requests for that contact, remove all life_event_access_policies for that contact

### Invitation Acceptance

```
GET    /api/trusted-contacts/invite/:token → Validate invite token and return invite details (no auth required)
POST   /api/trusted-contacts/accept        → Accept an invitation (authenticated, by invite token)
```

**POST body:** `{ "invite_token": "uuid" }`

**Invitation flow (critical — this is an acquisition channel):**

1. Owner adds a trusted contact → system sends an invitation email to the contact's email address
2. Email contains a link to `/invite/:token`
3. When the contact clicks the link:
   - **If not logged in and has no account:** Show a landing page explaining what DocuIntelli is, who invited them, and what they're being granted access to (Life Event name, owner name, policy type). Prompt them to **create an account first** (free tier is fine). After signup, redirect back to accept the invitation.
   - **If not logged in but has an account:** Prompt login. After login, redirect back to accept the invitation.
   - **If logged in:** Accept the invitation immediately, link their `user_id` to the `trusted_contacts` record, redirect to their Shared Access dashboard.
4. The invitation email and landing page should clearly communicate: "You need a DocuIntelli account to access shared documents. Creating an account is free."

**What the contact sees after accepting (depends on access policy):**

- **Immediate access:** Contact can view all documents in the Life Event right away.
- **Time-delayed auto-grant:** Contact can see the Life Event and a **list of document names/types, but each document is locked** with a visual lock icon. They see the cooldown timer and a message: "Access will be granted in X days unless [Owner Name] denies the request." They cannot open, preview, or download any document until the cooldown expires or the owner approves early.
- **Approval only:** Contact can see the Life Event name and document count, but documents are hidden entirely until the owner approves. They see a "Request Access" button and the request status after submitting.

### Life Event Access Policies (Per Life Event)

```
GET    /api/life-events/:lifeEventId/access          → List all access policies for a Life Event
POST   /api/life-events/:lifeEventId/access          → Add a trusted contact to a Life Event with a policy
PATCH  /api/life-events/:lifeEventId/access/:policyId → Update policy type or cooldown
DELETE /api/life-events/:lifeEventId/access/:policyId → Remove a contact's access to this Life Event
```

**POST body:**
```json
{
  "contact_id": "uuid, required — must be an active trusted contact owned by this user",
  "policy_type": "approval_only | time_delayed | immediate",
  "cooldown_days": "integer 1-90, required if policy_type is time_delayed"
}
```

**Business rules:**
- Only the Life Event owner can manage access policies
- A contact can only be assigned once per Life Event (unique constraint)
- Validate that the contact_id belongs to the authenticated user and has status 'active'
- Max 10 Life Events with emergency access enabled per user

### Access Requests (Contact-Side)

```
GET    /api/access-requests/mine           → List all access requests for the authenticated contact
POST   /api/access-requests                → Submit a new access request
```

**POST body:**
```json
{
  "policy_id": "uuid, required",
  "reason": "string, optional"
}
```

**Business rules:**
- Only the designated contact_user_id on the policy's contact record can create a request
- Only one pending request per policy at a time
- Rate limit: one request per policy per 30 days (even if the previous one was denied)
- For `approval_only`: set status to 'pending', notify owner, request expires after 14 days with no response
- For `time_delayed`: set status to 'pending', set `cooldown_expires_at` to NOW() + cooldown_days, notify owner
- For `immediate`: skip request creation, grant access directly, log the event, notify owner

### Access Request Management (Owner-Side)

```
GET    /api/access-requests/pending        → List all pending requests for the authenticated owner
PATCH  /api/access-requests/:id/approve    → Approve a pending request
PATCH  /api/access-requests/:id/deny       → Deny a pending request
```

**Business rules:**
- Only the Life Event owner can approve/deny
- Approving: set status to 'approved', set resolved_at, set resolved_by to 'owner_approved', notify contact
- Denying: set status to 'denied', set resolved_at, set resolved_by to 'owner_denied', notify contact

### Document Access (Contact Accessing Documents)

```
GET    /api/access/:lifeEventId/documents  → List documents in a Life Event the contact has been granted access to
GET    /api/access/:lifeEventId/documents/:docId → View/download a specific document
```

**Business rules:**
- Verify the contact has an approved or auto_granted access request for this Life Event
- All document views are logged to access_audit_log
- Read-only access — no mutations allowed

### Audit Log

```
GET    /api/life-events/:lifeEventId/audit-log → List audit log entries for a Life Event (owner only)
```

---

## Background Jobs

### Auto-Grant Job

Create a scheduled job (cron or Supabase pg_cron) that runs every hour:

```
1. SELECT all access_requests WHERE status = 'pending' AND cooldown_expires_at <= NOW()
2. For each: set status to 'auto_granted', resolved_at = NOW(), resolved_by = 'auto_granted'
3. Send notification to both owner and contact
```

### Request Expiration Job

Create a scheduled job that runs every hour:

```
1. SELECT all access_requests WHERE status = 'pending' AND policy_type = 'approval_only' AND requested_at + INTERVAL '14 days' <= NOW()
2. For each: set status to 'expired', resolved_at = NOW(), resolved_by = 'expired'
3. Send notification to contact
```

### Annual Re-Verification Job

Create a scheduled job that runs daily:

```
1. SELECT all trusted_contacts WHERE status = 'active' AND (last_verified_at IS NULL OR last_verified_at + INTERVAL '1 year' <= NOW() + INTERVAL '30 days')
2. Send reminder emails at 30 days before, 7 days before, and day-of
3. If last_verified_at + INTERVAL '1 year' < NOW(): set status to 'revoked', cancel pending requests
```

---

## Frontend Components

Build these within the existing React component structure. Match the existing styling system (check if Tailwind, CSS modules, styled-components, etc.).

### 1. Trusted Contacts Settings Page

**Location:** Settings → Trusted Contacts (new settings section)

**Components:**
- `TrustedContactsList` — shows all contacts with status badges (invited/active/revoked)
- `AddContactModal` — form to invite a new contact (name, email, relationship dropdown)
- `ContactCard` — individual contact with actions: edit, revoke, resend invite
- Empty state: explain what Trusted Contacts are, why the user should set them up

**Tier gating:** If user is not on Pro, show locked state with upgrade CTA. Do not render the functional UI.

### 2. Life Event "Share Access" Section

**Location:** Within the existing Life Event detail view — add a new tab or collapsible section called "Share Access" or "Emergency Access"

**Components:**
- `LifeEventAccessSection` — wrapper that appears within the Life Event detail page
- `AssignContactModal` — dropdown of active trusted contacts + policy type selector + cooldown config
- `AccessPolicyCard` — shows each assigned contact with their policy type, cooldown setting, and actions (edit policy, remove)
- `AccessAuditTimeline` — chronological log of access events for this Life Event

**Behavior:**
- If user has no trusted contacts yet, show a prompt: "Add trusted contacts in Settings first" with a link
- If user is not Pro, show locked upgrade prompt in context: "Want someone you trust to access these documents? Upgrade to Pro."
- Show a count badge on the tab: "Share Access (2)" indicating how many contacts have access

### 3. Contact Dashboard (Trusted Contact's View)

**Location:** New section in the main nav or under a "Shared With Me" area. **This section is ALWAYS visible regardless of the contact's subscription tier.**

**Components:**
- `SharedAccessDashboard` — lists all Life Events the user has been granted or can request access to. Grouped by owner (e.g., "From Bukky Odumosu")
- `SharedLifeEventCard` — shows the Life Event name, owner name, policy type, and current access state
- `LockedDocumentList` — for time-delayed policies: shows document names/types with a lock icon overlay. Each row displays the document name and file type but is not clickable. Shows cooldown timer at the top: "Access unlocks in X days, Y hours"
- `RequestAccessModal` — confirm action with optional reason field
- `GrantedAccessView` — read-only document list for an approved Life Event, with clear "read-only" indicators on every document
- `AccessRequestCard` — shows request status with timeline (requested → pending → approved/denied/auto-granted)

**State-dependent rendering per Life Event:**
- **Immediate policy, accepted:** Show full document list, all viewable
- **Time-delayed, cooldown active:** Show document names with lock icons, cooldown progress bar, message: "Access will be granted in X days unless [Owner] denies"
- **Time-delayed, cooldown expired / approved:** Show full document list, all viewable
- **Approval only, no request submitted:** Show document count only (e.g., "5 documents"), "Request Access" button
- **Approval only, request pending:** Show "Waiting for [Owner]'s approval" status
- **Approval only, approved:** Show full document list, all viewable
- **Denied:** Show "Access denied by [Owner]" with option to request again after 30 days

**Tier-independent behavior:** A Free-tier contact viewing shared Life Events should see a subtle upsell banner: "You're viewing [Owner]'s shared documents. Want to organize your own documents by life events? Upgrade to get started." This does NOT block any shared access functionality.

### 4. Notification Components

- `AccessRequestNotification` — in-app notification with approve/deny action buttons
- `CooldownProgressBar` — visual countdown showing time remaining before auto-grant
- `AccessGrantedBanner` — confirmation shown to the contact when access is approved

### 5. Invitation Landing Page

**Route:** `/invite/:token`

This is often the first time someone encounters DocuIntelli. It needs to be clean, trustworthy, and clearly explain what's happening.

**Flow:**
- **Step 1:** Fetch invite details via `GET /api/trusted-contacts/invite/:token` (no auth required). Display: who invited them, the Life Event name, the access policy type, and a brief explanation of what DocuIntelli is.
- **Step 2: Account gate.** The contact MUST be a DocuIntelli user to proceed. No anonymous or guest access.
  - If logged in → show "Accept Invitation" button → accept → redirect to Shared Access dashboard
  - If not logged in, has account → show "Log in to accept" → login → accept → redirect
  - If no account → show "Create a free account to accept" → signup flow (free tier) → accept → redirect
- **Step 3:** After acceptance, redirect to `SharedAccessDashboard` where they'll see the Life Event with the appropriate locked/unlocked state based on the access policy.

**Design notes:**
- Show the owner's name prominently: "Bukky Odumosu has shared access to their 'Financial Planning' documents with you"
- Explain the policy in plain language: "You'll be able to view these documents after a 7-day waiting period" (time-delayed) or "You'll need to request access and wait for approval" (approval only)
- For the signup prompt, emphasize it's free: "Create your free DocuIntelli account to continue. No credit card required."
- Invalid or expired tokens show a clear error state

---

## Notification Implementation

Use the existing email/notification service. Add the following notification types:

| Event | Recipients | Channels | Template Needed |
|-------|-----------|----------|----------------|
| Contact invited | Contact | Email | `trusted-contact-invitation` |
| Contact accepted | Owner | Email, In-app | `contact-accepted` |
| Access requested | Owner | Email, In-app | `access-requested` |
| Cooldown 75% elapsed | Owner | Email, In-app | `cooldown-warning` |
| Cooldown 90% elapsed | Owner | Email, In-app | `cooldown-final-warning` |
| Access auto-granted | Owner + Contact | Email, In-app | `access-auto-granted` |
| Access approved | Contact | Email, In-app | `access-approved` |
| Access denied | Contact | Email, In-app | `access-denied` |
| Document viewed | Owner | In-app | `document-viewed` |
| Re-verification due | Contact | Email | `reverification-reminder` |

---

## Tier Enforcement

Check the user's subscription tier before allowing access to this feature. Find the existing subscription/tier check pattern in the codebase and follow it.

### Owner-Side (Creating and Managing Emergency Access)

| Capability | Free | Starter ($9) | Pro ($15) |
|-----------|------|-------------|-----------|
| Manage Trusted Contacts | No | No | Yes |
| Configure Life Event access policies | No | No | Yes |
| View audit log | No | No | Yes |

- Free and Starter users who navigate to the Emergency Access section within a Life Event should see a locked state with an upgrade CTA
- All tier checks should happen both on the frontend (UI gating) and backend (API validation)

### Contact-Side (Receiving Shared Access) — CRITICAL: NO TIER RESTRICTIONS

| Capability | Free | Starter ($9) | Pro ($15) |
|-----------|------|-------------|-----------|
| Accept invitation and become a Trusted Contact | Yes | Yes | Yes |
| See shared Life Events from others | Yes | Yes | Yes |
| Request access / view granted documents | Yes | Yes | Yes |

**This is critical:** Shared access is completely independent of the contact's subscription tier. A Free-tier user who receives a trusted contact invitation can:
- Accept the invitation
- See the shared Life Event in their "Shared With Me" section
- See locked documents during a cooldown period
- View documents once access is granted

**Even if the contact is on a tier that does not support creating their own Life Events, they can still see and access Life Events shared with them.** The "Shared With Me" section is always visible regardless of tier. This is intentional — it exposes Free/Starter users to the Life Events feature and creates organic upgrade motivation.

**What contacts CANNOT do (regardless of tier):**
- Create their own Life Events or Emergency Access configurations (tier-gated to Pro on the owner side)
- Edit, delete, or modify documents in a shared Life Event
- Share the Life Event with others (only the owner can designate contacts)

**UI distinction for contacts on lower tiers:** When a Free or Starter contact views a shared Life Event, show a subtle banner: "You're viewing [Owner Name]'s shared documents. Want to organize your own documents by life events? Upgrade to [appropriate tier]." This is a soft upsell, not a gate.

---

## Implementation Order

Follow this order to build incrementally and test as you go:

1. **Database migration** — create all tables, indexes, RLS policies
2. **Trusted Contacts API + Settings UI** — CRUD for contacts, invitation flow
3. **Invitation acceptance flow** — landing page, account linking
4. **Life Event Access Policies API + UI** — assign contacts to Life Events within the Life Event detail view
5. **Access Request API + Contact Dashboard** — request submission, owner approve/deny
6. **Background jobs** — auto-grant, expiration, re-verification
7. **Notification system** — email templates, in-app notifications
8. **Audit log API + UI** — timeline view within Life Event detail
9. **Tier enforcement** — gate all owner-side functionality to Pro
10. **Document access API + read-only view** — contact viewing documents

---

## Testing Requirements

- **Unit tests** for all API endpoint business logic (especially access control validation)
- **Integration tests** for the full access request lifecycle: invite → accept → assign to Life Event → request → cooldown → auto-grant
- **RLS tests** — verify that contacts cannot access Life Events they are not assigned to
- **Tier enforcement tests** — verify Free/Starter users cannot create contacts or policies via API
- **Shared access tier independence tests** — verify that a Free-tier contact can accept invitations, see shared Life Events, and view granted documents without any tier-related blocks
- **Edge cases to test:**
  - Contact requests access to a Life Event, owner revokes contact during cooldown — request should be cancelled
  - Owner deletes a Life Event that has active access grants — cascade delete should clean up policies and requests
  - Contact tries to request access to a Life Event they are not assigned to — should be rejected
  - Contact submits two requests for the same policy within 30 days — second should be rejected with clear error message
  - Owner has 5 contacts, tries to add a 6th — should be rejected with clear error message
  - Free-tier user receives invitation, creates account, accepts — should see shared Life Event in "Shared With Me" immediately
  - Free-tier contact views shared Life Event with time-delayed policy during cooldown — should see document names with lock icons, cannot open any document
  - Free-tier contact with granted access views documents — no tier gate, full read-only access
  - Contact is on Starter tier (no Life Events feature) — "Shared With Me" section is still visible and functional, upgrade banner is shown but does not block access
  - Invitation link clicked by someone not logged in — must create account or log in before acceptance proceeds, no guest/anonymous access
  - Invitation token is reused after acceptance — should return error, token is single-use
  - Owner changes policy type while a request is pending — pending request should be cancelled, contact must re-request under new policy
