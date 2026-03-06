# DocuIntelli AI — Product Overview

> **Your intelligent legal document companion.**
> Store, understand, and manage all your legal and financial documents in one secure place. Never miss another expiration date or struggle with complex legal language.

---

## Branding & Theme

### Identity
- **Brand Name**: DocuIntelli AI
- **Tagline**: "Your intelligent legal document companion"
- **Domain**: docuintelli.com
- **Contact**: support@docuintelli.com
- **Social**: @docuintelli (Twitter, LinkedIn, GitHub)

### Color Palette

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| **Primary** | Emerald 600 | `#059669` | CTAs, active states, brand accent |
| **Primary Dark** | Emerald 700 | `#047857` | Hover states |
| **Primary Light** | Emerald 50 | `#ecfdf5` | Backgrounds, badges |
| **Secondary** | Teal 600 | `#0d9488` | Gradients, accents |
| **Text** | Slate 900 | `#0f172a` | Primary text |
| **Text Secondary** | Slate 500 | `#64748b` | Muted text |
| **Background** | Slate 50 | `#f8fafc` | Page backgrounds |
| **Success** | Green 500 | `#22c55e` | Success indicators |
| **Error** | Red 500 | `#ef4444` | Errors, destructive actions |
| **Warning** | Amber 500 | `#f59e0b` | Warnings, expiring items |
| **Info** | Blue 500 | `#3b82f6` | Informational badges |

**Brand Gradient**: `#059669` → `#0d9488` (Emerald → Teal)

### Document Category Colors

| Category | Background | Text | Border |
|----------|-----------|------|--------|
| Insurance | `#dbeafe` | `#1e40af` | `#93c5fd` |
| Warranty | `#dcfce7` | `#166534` | `#86efac` |
| Lease | `#f3e8ff` | `#6b21a8` | `#c4b5fd` |
| Employment | `#fef9c3` | `#854d0e` | `#fde047` |
| Contract | `#e0e7ff` | `#3730a3` | `#a5b4fc` |
| Other | `#f1f5f9` | `#475569` | `#cbd5e1` |

### Typography
- **Font**: Inter (Google Fonts) — weights 300–800
- **Fallback**: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif
- **Rendering**: Antialiased on all platforms

### Logo
- **Icon**: ShieldCheck (Lucide) on emerald-to-teal gradient background
- **Symbolism**: Security, protection, trust
- **Formats**: SVG (favicon, OG images), PNG (apple-touch-icon)

### UI Patterns
- **Cards**: White background, `border-slate-200`, rounded-xl, shadow on hover
- **Buttons**: Emerald→Teal gradient fill, white text, subtle shadow
- **Navigation**: Sticky header with backdrop blur, emerald hover states
- **Gradient text**: `bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600`

---

## Subscription Plans

| | Free | Starter ($9/mo) | Pro ($15/mo) |
|---|---|---|---|
| **Documents** | 3 | 25 | 100 |
| **Monthly Uploads** | 3 | 30 | 150 |
| **AI Questions** | 5/month | Unlimited | Unlimited |
| **Devices** | 1 | 2 | 5 |
| **File Upload** | Files only | Files + URLs | Files + URLs |
| **OCR (Image Text)** | — | Yes | Yes |
| **Auto-Tagging** | — | Yes | Yes |
| **Email Notifications** | — | Yes | Yes |
| **Weekly Audit** | — | Yes | Yes |
| **LLM Priority** | Standard | Medium | Highest |
| **Financial Insights** | — | 3 bank accounts | Unlimited |
| **Life Events** | — | — | Yes |
| **Document Health** | — | — | Yes |
| **Global Search** | — | — | Yes |
| **Emergency Access** | — | — | Yes |
| **Priority Support** | — | — | Yes |

**Yearly pricing**: 17% discount ($90/yr Starter, $150/yr Pro)

---

## Core Features

### 1. Secure Document Vault
The central hub for all personal documents. Upload PDFs, Word docs, images, or plain text. Documents are encrypted at rest and in transit.

**Capabilities:**
- Multi-format upload (PDF, DOCX, images with OCR, plain text)
- URL ingestion — paste a link and DocuIntelli extracts the content (Starter+)
- Automatic category assignment (Insurance, Warranty, Lease, Employment, Contract, Other)
- Expiration date detection and tracking
- Document renewal workflow — link new versions to old documents
- Original-format download
- Dual-tab view: Documents tab + Health tab

### 2. AI-Powered Document Chat
Ask questions about any document in plain English. Get instant, cited answers powered by vector search and LLM.

**Capabilities:**
- Natural language Q&A with source citations
- Streaming token-by-token responses
- Context-aware suggested questions (e.g., "What's my deductible?", "When does this expire?")
- Per-document chat history with timestamps
- Priority queue by plan tier (Free = standard, Starter = medium, Pro = highest)
- Cold-start optimization for instant first response

### 3. Smart Expiration Reminders
Never miss a deadline. DocuIntelli scans documents for dates and alerts you before anything expires.

**Capabilities:**
- Automatic date extraction from document content
- Daily expiration checks
- 30-day advance email notifications (Starter+)
- Dashboard alerts for expiring and expired documents
- Weekly audit email summaries (Starter+)
- Configurable notification preferences

### 4. Financial Insights
Connect bank accounts via Plaid to get a complete picture of your financial life alongside your documents.

**Capabilities:**
- Bank account linking (12,000+ institutions via Plaid)
- Transaction categorization and spending analysis
- Monthly spending breakdowns with category drilldowns
- Recurring bill detection
- Income stream tracking
- Financial goal setting and progress tracking
- Loan analysis with payoff projections
- Account limits: Free (0), Starter (3), Pro (unlimited)

### 5. Life Events Planner (Pro)
Prepare for major life milestones with AI-generated checklists of required documents.

**Capabilities:**
- Pre-built templates: Home Purchase, Travel/Relocation, Starting a Business, Getting Married, New Employment, Lawsuit/Legal
- Custom event creation with custom requirements
- Readiness scoring — visual progress ring showing completion percentage
- Auto-match vault documents to requirements
- Manual document linking
- Section-based organization (Legal, Financial, Custom, etc.)
- Event export as checklist/report
- Status tracking per requirement (complete, missing, expiring, needs update)

### 6. Emergency Access & Trusted Contacts (Pro)
Designate trusted people who can access your documents in emergencies, with full control over how and when.

**Capabilities:**
- Trusted contact management with relationship types (Spouse, Parent, Sibling, Attorney, Accountant, etc.)
- Three access policies:
  - **Immediate** — instant access when requested
  - **Time-Delayed** — access granted after a configurable waiting period (1–168 hours)
  - **Approval** — requires your explicit approval for each request
- Event-specific grants (not global access)
- Multi-contact invite flow (up to 5 contacts)
- Instructions/notes per grant
- Email invitation system with acceptance tracking
- Full audit trail of all access requests, grants, denials, and vetoes
- Shared document viewer for trusted contacts

### 7. Document Health Dashboard (Pro)
A comprehensive view of your vault's completeness and organization.

**Capabilities:**
- Coverage gap detection
- Expiration risk scoring
- Organization recommendations
- Actionable insights to improve vault health

### 8. Global Search (Pro)
Search across all documents by name, category, or content.

**Capabilities:**
- Full-text semantic search
- Keyboard shortcut (Ctrl+K / Cmd+K)
- Quick navigation to document view or chat

### 9. Weekly Vault Audit (Starter+)
Automated weekly summary of your document vault status.

**Capabilities:**
- Recently uploaded documents
- Upcoming expirations
- Recommendations for action
- Delivered via email digest

### 10. Support Ticket System
In-app support with categorized tickets and real-time messaging.

**Capabilities:**
- Categories: General, Billing, Technical, Account, Feature Request, Bug Report
- Priority levels: Low, Medium, High, Urgent
- Status tracking: Open → In Progress → Awaiting Reply → Resolved → Closed
- Threaded conversation with support staff
- Admin triage dashboard

---

## Mobile App Features

Available on iOS and Android via Expo/React Native.

- **Full feature parity** with web app (vault, chat, financial insights, life events, emergency access)
- **Biometric authentication** — Face ID / fingerprint unlock via device security
- **Camera document upload** — scan and upload directly from phone
- **Push notifications** — real-time alerts for expirations, processing, and security events
- **Device management** — view active sessions, remote sign-out
- **Offline-capable architecture** — AsyncStorage-backed session persistence
- **Tab navigation** — Dashboard, Vault, Chat, Settings

---

## Security

### Authentication
- Custom JWT system with access tokens (15-min) and refresh tokens (7-day, rotated)
- Email/password with OTP verification (6-digit, 30-min expiry)
- Google OAuth (PKCE flow)
- Biometric unlock on mobile (Face ID / Fingerprint)
- Rate-limited OTP attempts (5 max)
- Device session tracking with remote sign-out

### Data Protection
- AES-256 encryption at rest (Azure PostgreSQL)
- TLS 1.2+ encryption in transit
- Row-Level Security (RLS) — users can only access their own data
- Documents never used for AI model training
- Zero-knowledge processing architecture

### Access Control
- Plan-based feature gating enforced at API level
- Device limits per subscription tier
- Admin impersonation with HMAC-signed proof tokens (24-hour TTL)
- Emergency access audit trail

### Compliance
- Complete admin audit log
- Data retention policies
- Account deletion with full data removal (including Stripe cleanup)
- Vulnerability disclosure process
- Security policy documentation

---

## Admin Panel

Available to users with `role: admin` in app metadata.

| Tab | Purpose |
|-----|---------|
| **Overview** | System stats, user counts by plan, recent signups, health indicators |
| **Users** | Search/filter users, plan management, account investigation, impersonation |
| **Activity** | Feature usage breakdown, limit violations, time-range filtering |
| **System Health** | Database metrics, processing queue, email delivery, embedding coverage |
| **Audit Log** | Paginated admin action history with timestamps and IP addresses |
| **Coupons** | Create/manage promotion codes with plan restrictions and usage limits |
| **Support** | Triage support tickets, respond to users, manage ticket status |

---

## Integrations

| Service | Purpose |
|---------|---------|
| **Stripe** | Payment processing, subscriptions, billing portal, promotion codes, dunning recovery |
| **Plaid** | Bank account linking, transaction sync, recurring bill detection, income streams |
| **Mailjet** | Transactional email (OTP, welcome, password reset, notifications, weekly audit) |
| **OpenAI** | LLM for document Q&A, AI tagging, content analysis |
| **Azure PostgreSQL** | Primary database with RLS |
| **Azure Blob Storage** | Document file storage |
| **Google OAuth** | Third-party authentication |
| **Redis** | Caching, rate limiting, admin auth caching |

---

## Use Cases

### For Individuals & Families
- **Warranty tracking** — Upload purchase receipts and warranties, get alerts before they expire
- **Insurance management** — Store all policies, chat with AI to understand coverage and deductibles
- **Lease & rental agreements** — Track renewal dates, understand terms and obligations
- **Employment contracts** — Keep offer letters, NDAs, and benefits documents organized
- **Tax preparation** — Store W-2s, 1099s, and receipts; use AI to find specific figures
- **Estate planning** — Use emergency access to ensure trusted contacts can access critical documents

### For Life Milestones
- **Buying a home** — Checklist of required documents (pre-approval, title insurance, inspection reports)
- **Getting married** — Track marriage license, name change documents, prenuptial agreements
- **Starting a business** — Organize articles of incorporation, EIN, licenses, contracts
- **New job** — Manage offer letters, I-9, benefits enrollment, relocation documents
- **Legal proceedings** — Organize evidence, court filings, attorney correspondence

### For Financial Health
- **Spending awareness** — Connect bank accounts to visualize where money goes
- **Bill tracking** — Automatically detect recurring subscriptions and bills
- **Goal setting** — Create savings goals and track progress
- **Loan management** — Analyze loan terms and project payoff timelines

---

## Technical Architecture

| Layer | Technology |
|-------|-----------|
| **Web Frontend** | React + TypeScript, Vite, Tailwind CSS |
| **Mobile App** | React Native (Expo), TypeScript |
| **API Server** | Express.js, TypeScript |
| **Database** | Azure PostgreSQL with RLS |
| **File Storage** | Azure Blob Storage |
| **Cache** | Redis 7 |
| **Reverse Proxy** | Nginx with SSL termination |
| **Deployment** | Docker Compose (self-hosted) |
| **Auth** | Custom JWT (access + refresh tokens) |
| **Payments** | Stripe (subscriptions, webhooks, portal) |
| **Banking** | Plaid (Link, transactions, webhooks) |
| **Email** | Mailjet SMTP |
| **AI/LLM** | OpenAI API |
| **Icons** | Lucide React |

---

## Platform Availability

| Platform | Status |
|----------|--------|
| Web (desktop & mobile browsers) | Live |
| iOS (iPhone & iPad) | In development (Expo) |
| Android | In development (Expo) |

---

*DocuIntelli AI — Organize, understand, and act on your important documents.*