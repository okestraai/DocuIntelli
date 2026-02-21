# Financial Insights — Web Implementation

> **Status:** Web-only implementation. Mobile app version TBD.
> **Branch:** `feature/financial-insights-web`
> **Restore point:** `git tag restore-point-before-financial-insights`

## Overview

AI-powered financial analysis using Plaid bank account integration. Users connect their bank accounts via Plaid Link, and DocuIntelli pulls 6 months of transaction history to provide:

- Spending breakdown by category
- Recurring bill detection
- Income stream analysis (salary detection)
- Monthly trends
- AI-generated insights and recommendations (via vLLM)
- Personalized 30-day action plan

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌───────────┐
│  React UI   │────▶│  Express API     │────▶│  Plaid    │
│  (Plaid     │     │  /api/financial/* │     │  Sandbox  │
│   Link SDK) │     │  /api/plaid-wh   │     │  API      │
└─────────────┘     └───────┬──────────┘     └───────────┘
                            │
                    ┌───────┴──────────┐
                    │  Supabase        │
                    │  - plaid_items   │
                    │  - plaid_accounts│
                    │  - plaid_txns    │
                    │  - fin_insights  │
                    └───────┬──────────┘
                            │
                    ┌───────┴──────────┐
                    │  vLLM Chat       │
                    │  (AI Analysis)   │
                    └──────────────────┘
```

## File Map

### Backend (server/src/)
| File | Purpose |
|------|---------|
| `services/plaidService.ts` | Plaid SDK integration — link tokens, token exchange, transaction sync, rule-based analysis |
| `services/financialAnalyzer.ts` | vLLM-powered AI financial analysis, insight caching |
| `routes/financialInsights.ts` | API routes: link-token, exchange-token, summary, accounts, sync, disconnect |
| `routes/plaidWebhook.ts` | Plaid webhook handler for real-time transaction updates |

### Frontend (src/)
| File | Purpose |
|------|---------|
| `components/FinancialInsightsPage.tsx` | Main page with Plaid Link, KPI cards, spending breakdown, bills, income, trends, AI insights, action plan |
| `lib/financialApi.ts` | API helpers with TypeScript types for all financial data structures |

### Database
| File | Purpose |
|------|---------|
| `supabase/migrations/20260224000000_plaid_financial_insights.sql` | Schema: plaid_items, plaid_accounts, plaid_transactions, financial_insights |

### Config
| File | Change |
|------|--------|
| `server/src/index.ts` | Routes mounted at `/api/financial` and `/api/plaid-webhook` |
| `src/App.tsx` | `'financial-insights'` added to Page type, route rendering, ProFeatureGate |
| `src/components/Header.tsx` | Nav item added with Landmark icon |
| `.env` / `.env.example` | PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV vars |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/financial/link-token` | JWT | Create Plaid Link token |
| POST | `/api/financial/exchange-token` | JWT | Exchange public token, store access token, fetch balances, sync transactions |
| GET | `/api/financial/summary` | JWT | Full financial analysis with AI insights |
| GET | `/api/financial/accounts` | JWT | List connected accounts |
| POST | `/api/financial/sync` | JWT | Manual transaction re-sync |
| DELETE | `/api/financial/disconnect/:itemId` | JWT | Remove bank connection and all data |
| POST | `/api/plaid-webhook` | None | Plaid webhook receiver |

## Database Schema

### plaid_items
Stores Plaid access tokens per bank connection. One row per institution per user.

### plaid_accounts
Individual bank accounts (checking, savings, credit) within each Plaid item. Stores `initial_balance` fetched once at connection time.

### plaid_transactions
All transactions from the last 6 months. Upserted by transaction_id for idempotency.

### financial_insights
Cached AI-generated reports. Expires after 24 hours. Stores parsed insights, action plan, and raw AI recommendation text.

## Balance Calculation

```
current_balance = initial_balance - sum(transaction_amounts)
```

Plaid convention: positive amounts = money out (debit), negative = money in (credit).

The initial balance is fetched once via `accountsBalanceGet` when the user first connects. Subsequent balance is derived from the initial balance plus/minus all transaction amounts.

## Recurring Bill Detection

Algorithm:
1. Group transactions by merchant name (case-insensitive)
2. Filter groups with 2+ transactions
3. Check amount consistency (within 15% of average)
4. Calculate frequency from average date gaps:
   - ≤10 days → weekly
   - ≤20 days → biweekly
   - ≤45 days → monthly
   - ≤100 days → quarterly
   - >100 days → yearly

## Income Stream Detection

1. Filter negative-amount transactions (credits)
2. Group by source/merchant
3. Detect salary: regular payments >$1,000, biweekly or monthly

## AI Analysis (vLLM)

When vLLM is configured (VLLM_CHAT_URL + Cloudflare Access), the summary endpoint enhances rule-based analysis with LLM-powered insights:

- Uses `Meta-Llama-3.1-8B-Instruct-AWQ-INT4` model
- System prompt acts as financial advisor
- Receives full financial snapshot as structured input
- Returns structured insights, action plan, and recommendation paragraph
- Results cached for 24 hours in `financial_insights` table
- Falls back to rule-based analysis if vLLM is unavailable

## Feature Gating

- **Free plan:** ProFeatureGate blocks access (shows upgrade prompt)
- **Starter/Pro plans:** Full access

## Plaid Webhook

Receives real-time notifications from Plaid:
- `TRANSACTIONS/SYNC_UPDATES_AVAILABLE` → triggers transaction re-sync
- `TRANSACTIONS/TRANSACTIONS_REMOVED` → deletes specific transactions
- `ITEM/ERROR` → logs error, updates item metadata
- `ITEM/PENDING_EXPIRATION` → logs warning (user needs to re-link)

Webhook URL to configure in Plaid Dashboard: `https://app.docuintelli.com/api/plaid-webhook`

## Environment Variables

```env
PLAID_CLIENT_ID=your-plaid-client-id
PLAID_SECRET=your-plaid-secret
PLAID_ENV=sandbox  # sandbox | development | production
```

## Testing Checklist

### Plaid Link Flow
- [ ] Link token creation succeeds
- [ ] Plaid Link modal opens with sandbox credentials
- [ ] Public token exchange works
- [ ] Initial balance is fetched and stored
- [ ] 6-month transactions sync on connection

### Financial Analysis
- [ ] Spending breakdown shows all categories with percentages
- [ ] Recurring bills are detected (test with sandbox data)
- [ ] Income streams are identified
- [ ] Salary detection works for regular large deposits
- [ ] Monthly trends display correctly
- [ ] Balance calculation: initial_balance - sum(transactions)

### AI Insights
- [ ] vLLM-powered analysis generates recommendations
- [ ] Fallback to rule-based works when vLLM is down
- [ ] Insights are cached and re-used within 24 hours
- [ ] AI recommendations section renders in UI

### UI/UX
- [ ] Onboarding screen (no accounts) displays correctly
- [ ] KPI cards show balance, income, expenses, savings rate
- [ ] Collapsible sections work
- [ ] Sync button refreshes data
- [ ] Disconnect confirmation dialog works
- [ ] Responsive on desktop and tablet
- [ ] Navigation badge shows STARTER for free users
- [ ] ProFeatureGate blocks free users

### Error Handling
- [ ] Missing Plaid env vars → graceful error message
- [ ] Failed bank connection → error display
- [ ] Expired access token → appropriate error
- [ ] Network errors → try-catch prevents crashes

### Webhook
- [ ] POST /api/plaid-webhook returns 200 for valid events
- [ ] Transaction sync triggers on SYNC_UPDATES_AVAILABLE
- [ ] Unknown items handled gracefully (200, logged)

## Rollback

```bash
git checkout restore-point-before-financial-insights
```

This restores the codebase to the exact state before any Financial Insights changes.
