# Time-Aware Engagement Engine

## Architecture Overview

The Engagement Engine adds 7 core capabilities to DocuIntelli AI, all operating on a **compute-on-read** pattern (no background jobs needed for health/score computation).

### Core Ideas

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Document Health Decay** | Per-document health score (0-100) mapped to states: Healthy/Watch/Risk/Critical |
| 2 | **Preparedness Index** | User-level 0-100 score across 4 factors (metadata, expirations, reviews, health) |
| 3 | **Gap Detection** | Rule-based suggestions for missing sibling documents |
| 4 | **Time-Based Insights** | Deterministic per-document insights (expiration warnings, review due, metadata gaps) |
| 5 | **Weekly Vault Audit** | In-app audit report with expandable sections |
| 6 | **Action Triggers** | Micro-actions: confirm reviewed, confirm expiration, add metadata, set cadence |
| 7 | **Review Cadence** | Per-document recurring review schedules with category-based defaults |

### Data Flow

```
User opens Dashboard/Audit/DocumentViewer
  → Frontend hook calls backend API
    → Backend fetches user's documents from Supabase
    → Pure functions compute health, preparedness, gaps, insights
    → Results returned to frontend
    → UI renders feed items, health panels, audit cards
  → User takes micro-action (mark reviewed, add metadata, etc.)
    → Backend updates document row in Supabase
    → Frontend refreshes data
```

## Files Created/Modified

### Database Migration
- `supabase/migrations/20260212000000_engagement_engine.sql`
  - New columns on `documents`: `last_reviewed_at`, `review_cadence_days`, `issuer`, `owner_name`, `effective_date`, `health_state`, `health_computed_at`, `insights_cache`
  - New tables: `review_events`, `gap_dismissals`, `document_relationships`, `preparedness_snapshots`
  - RLS policies for all new tables

### Backend (server/src/)
- `services/engagementEngine.ts` — Pure computation engine (all deterministic, no DB calls)
  - `computeDocumentHealth()` — Health state from expiration, cadence, metadata
  - `computePreparedness()` — User-level score with 4 factors × 25 points
  - `detectGaps()` — Rule-based gap suggestions from `GAP_RULES` config
  - `generateDocumentInsights()` — Per-document time-based insights
  - `generateTodayFeed()` — Today feed compilation
  - `compileWeeklyAudit()` — Weekly audit data compilation
  - `suggestReviewCadence()` / `getNextReviewDate()` — Cadence helpers

- `services/engagementEngine.test.ts` — 43 unit tests for all pure functions

- `routes/engagement.ts` — REST API endpoints mounted at `/api/engagement`
  - `GET /today-feed` — Feed items + preparedness + health summary
  - `GET /weekly-audit` — Full audit data
  - `GET /preparedness` — Score + snapshot persistence
  - `GET /documents/:id/health` — Single document health + insights + relationships
  - `POST /documents/:id/review` — Mark as reviewed
  - `POST /documents/:id/confirm-expiration` — Confirm expiration is valid
  - `POST /documents/:id/metadata` — Update tags/issuer/owner/dates
  - `POST /documents/:id/cadence` — Set review cadence
  - `POST /documents/:id/link-related` — Link related documents
  - `GET /gap-suggestions` — Gap suggestions for user
  - `POST /gap-suggestions/:key/dismiss` — Dismiss a gap suggestion
  - `GET /documents/:id/relationships` — Document relationships

### Frontend (src/)
- `lib/engagementApi.ts` — API client with all types and fetch functions
- `hooks/useEngagement.ts` — React hooks: `useTodayFeed`, `useWeeklyAudit`, `useDocumentHealth`, `useEngagementActions`
- `components/TodayFeed.tsx` — Preparedness score, health summary, feed items with micro-actions
- `components/WeeklyAudit.tsx` — Full audit view with expandable sections
- `components/DocumentHealthPanel.tsx` — Document detail sidebar with health, insights, metadata form, cadence form

### Modified Files
- `server/src/index.ts` — Added engagement routes registration
- `src/App.tsx` — Added `'audit'` page type, WeeklyAudit route, wired `onViewDocument` and `onChatWithDocument`
- `src/components/Dashboard.tsx` — Integrated TodayFeed section + `onViewDocument` prop
- `src/components/Header.tsx` — Added Audit nav item (ClipboardCheck icon)
- `src/components/DocumentViewer.tsx` — Added health panel sidebar with toggle

## How to Run

### 1. Apply the migration
```sql
-- Run in Supabase SQL editor or via CLI:
-- File: supabase/migrations/20260212000000_engagement_engine.sql
```

### 2. Start the backend
```bash
cd server
npm run dev
```

### 3. Start the frontend
```bash
npm run dev
```

### 4. Run tests
```bash
npx tsx server/src/services/engagementEngine.test.ts
```

## Health Scoring Breakdown

| Factor | Deduction | Condition |
|--------|-----------|-----------|
| Expiration | -50 | Expired |
| Expiration | -40 | Expires within 7 days |
| Expiration | -25 | Expires within 30 days |
| Expiration | -10 | Expires within 90 days |
| Review cadence | -30 | Overdue by 60+ days |
| Review cadence | -15 | Overdue (any amount) |
| Review cadence | -5 | Due within 14 days |
| No exp + no cadence | -20 | Not reviewed in 1+ year |
| No exp + no cadence | -10 | Not reviewed in 6+ months |
| Metadata (3+ missing) | -15 | Missing tags + issuer + owner + exp/cadence |
| Metadata (per field) | -5 each | Individual missing fields |

**State thresholds:** Healthy ≥ 75 | Watch ≥ 50 | Risk ≥ 25 | Critical < 25

## Gap Detection Rules

Rules are defined in `GAP_RULES` array inside `engagementEngine.ts`. Current rules:

- **Insurance + auto tags** → Vehicle Registration, Vehicle Title, Maintenance Records
- **Insurance + home tags** → Property Deed, Home Inventory
- **Insurance + health tags** → Medical Records, Prescription List
- **Insurance (general)** → Insurance Declarations Page
- **Lease** → Lease Addendum, Move-in Report, Renter's Insurance
- **Employment** → Offer Letter, Benefits Summary, W-2, NDA
- **Contract** → Contract Amendments, Statement of Work
- **Warranty** → Purchase Receipt, Product Manual

To add new rules, append to the `GAP_RULES` array. No other code changes needed.

## Preparedness Index Factors

| Factor (25 pts each) | Calculation |
|----------------------|-------------|
| Metadata Completeness | Weighted: 35% exp dates + 25% tags + 20% categories + 20% issuers |
| Expiration Coverage | Coverage of critical categories (insurance/lease/contract) + overall |
| Review Freshness | % of docs reviewed/uploaded within last 6 months |
| Health Distribution | Weighted: healthy=25, watch=15, risk=5, critical=0 per doc |
