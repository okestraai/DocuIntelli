# DocuIntelli-Azure Backend Code Audit Report

**Audit Date**: 2026-03-02
**Scope**: `server/src/` -- All route, service, and middleware files
**Focus**: pg driver type coercion, Supabase-to-Azure migration remnants, missing error handling

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL (runtime bugs) | 2 |
| HIGH (incorrect math / comparisons) | 8 |
| MEDIUM (data type issues, inconsistencies) | 9 |
| LOW (minor / cosmetic) | 3 |
| **Total** | **22** |

---

## CRITICAL Issues

### 1. `errorLog.ts` line 19 -- Wrong property for user ID (always 401)

**File**: `server/src/routes/errorLog.ts`
**Line**: 19
**Code**:
```ts
const userId = (req as any).user?.id;
```

**Issue**: The `loadSubscription` middleware (applied on line 15) sets `req.userId`, NOT `req.user.id`. Since `req.user` is never set by any middleware, this expression always evaluates to `undefined`, causing the `if (!userId)` check on line 20 to always return 401. **Every client error log request fails silently.**

**Fix**:
```ts
const userId = req.userId;
```

---

### 2. `financialInsights.ts` line 478 -- Transactions passed to loan detector with string amounts

**File**: `server/src/routes/financialInsights.ts`
**Lines**: 467-478
**Code**:
```ts
const transactionsResult = await query(
  'SELECT * FROM plaid_transactions WHERE user_id = $1 AND pending = false AND amount > 0 ORDER BY date DESC',
  [userId]
);
const transactions = transactionsResult.rows;
// ...
const detected = detectLoanPayments(transactions);
```

**Issue**: `plaid_transactions.amount` is `numeric(14,2)` -- pg returns this as a string (e.g., `"1200.00"`). The `detectLoanPayments()` function in `loanDetector.ts` line 69 does `t.amount >= 300`, which becomes string comparison (`"1200.00" >= "300"` is `false` because `"1"` < `"3"` lexicographically). Also, the `date` column is type `date`, which pg returns as a JavaScript `Date` object, but `loanDetector.ts` does string operations on dates (sorting by `new Date(a.date)` which works with Date objects, but comparisons like `t.date >= periodStart` in `goalProgressCalculator.ts` would be Date-vs-string).

**Impact**: Loan detection silently fails to detect ANY loans. All `t.amount >= 300` comparisons are broken for amounts with leading digits < 3 (e.g., "1200.00", "2500.00").

**Fix**: Normalize transactions before passing to `detectLoanPayments`:
```ts
const transactions = transactionsResult.rows.map((t: any) => ({
  ...t,
  amount: Number(t.amount),
  date: typeof t.date === 'object' ? t.date.toISOString().split('T')[0] : t.date,
}));
```

---

## HIGH Issues

### 3. `financialGoals.ts` line 76 -- Activity amounts parsed inconsistently

**File**: `server/src/routes/financialGoals.ts`
**Line**: 76
**Code**:
```ts
goalActivityMap[a.goal_id].total += parseFloat(a.amount);
```

**Issue**: `financial_goal_activities.amount` is `numeric(14,2)`, returned as string by pg. While `parseFloat` works here, it is inconsistent with the `Number()` pattern used elsewhere in the codebase (e.g., `goalProgressCalculator.ts` lines 203-214). More importantly, `parseFloat` can silently return `NaN` for edge-case strings without the `|| 0` fallback that `Number()` has.

**Fix**: Use `Number(a.amount) || 0` for consistency and safety.

---

### 4. `financialGoals.ts` lines 645-646 -- Goal amounts from DB used in arithmetic without normalization

**File**: `server/src/routes/financialGoals.ts`
**Lines**: 645-646
**Code**:
```ts
const progressPct = goal.target_amount > 0
  ? Math.round((goal.current_amount / goal.target_amount) * 100)
  : 0;
```

**Issue**: `goal.target_amount` and `goal.current_amount` are `numeric(14,2)` columns read directly from the DB without `Number()` normalization. The `>` comparison on string `"0.00"` against number `0` may work due to JS coercion, but the division `goal.current_amount / goal.target_amount` on strings returns `NaN` (string / string = NaN).

**Affected lines**: 645 (`goal.target_amount > 0`), 646 (`goal.current_amount / goal.target_amount`), 660 (`goal.current_amount` passed to email template), 661 (`goal.target_amount` passed to email template).

**Fix**: Normalize when reading from DB:
```ts
const currentAmount = Number(goal.current_amount) || 0;
const targetAmount = Number(goal.target_amount) || 0;
const progressPct = targetAmount > 0
  ? Math.round((currentAmount / targetAmount) * 100)
  : 0;
```

---

### 5. `financialGoals.ts` line 553 -- Date comparison between Date object and string

**File**: `server/src/routes/financialGoals.ts`
**Line**: 553
**Code**:
```ts
if (dateToUse < goal.start_date) {
```

**Issue**: `goal.start_date` comes from the `financial_goals` table where `start_date` is a `date` column. The `pg` driver returns `date` columns as JavaScript `Date` objects. `dateToUse` is a string like `"2026-03-02"`. Comparing a string with `<` against a `Date` object gives unreliable results (the Date is coerced to a number via `valueOf()`, while the string is compared lexicographically against that number, typically returning `false`).

**Fix**: Convert `goal.start_date` to a comparable string:
```ts
const startDateStr = goal.start_date instanceof Date
  ? goal.start_date.toISOString().split('T')[0]
  : goal.start_date;
if (dateToUse < startDateStr) {
```

---

### 6. `goalProgressCalculator.ts` lines 515-516 -- Division on string numeric values in `expireOverdueGoals`

**File**: `server/src/services/goalProgressCalculator.ts`
**Lines**: 515-516
**Code**:
```ts
const progressPct = fullGoal.target_amount > 0
  ? Math.round((fullGoal.current_amount / fullGoal.target_amount) * 100)
  : 0;
```

**Issue**: `fullGoal.current_amount` and `fullGoal.target_amount` are fetched from the DB on line 509 without `Number()` normalization. These are `numeric(14,2)` columns returned as strings. String division returns `NaN`, so `progressPct` will always be `NaN`, and `Math.round(NaN)` is `NaN`. This propagates to the email template as `NaN`.

**Fix**: Normalize before use:
```ts
const currentAmt = Number(fullGoal.current_amount) || 0;
const targetAmt = Number(fullGoal.target_amount) || 0;
const progressPct = targetAmt > 0
  ? Math.round((currentAmt / targetAmt) * 100)
  : 0;
```

---

### 7. `goalProgressCalculator.ts` line 434 -- String subtraction in dirty-check comparison

**File**: `server/src/services/goalProgressCalculator.ts`
**Line**: 434
**Code**:
```ts
if (Math.abs(current_amount - goal.current_amount) > 0.01) {
```

**Issue**: `goal.current_amount` is read directly from the DB (`numeric(14,2)`, string). `current_amount` is a calculated number. The expression `number - string` works in JS due to coercion BUT is fragile and type-unsafe. If `goal.current_amount` is ever `null` or an unexpected value, this silently produces `NaN`.

**Fix**: Use `Number(goal.current_amount)`:
```ts
if (Math.abs(current_amount - Number(goal.current_amount)) > 0.01) {
```

---

### 8. `financialInsights.ts` line 603 -- Loan estimated_monthly_payment passed to analyzer without normalization

**File**: `server/src/routes/financialInsights.ts`
**Line**: 603
**Code**:
```ts
analyzeLoanDocument(userId, id, document_id, loan.loan_type, loan.estimated_monthly_payment)
```

**Issue**: `loan.estimated_monthly_payment` comes from the `detected_loans` table where it is `numeric(14,2)`. The pg driver returns it as a string. The `analyzeLoanDocument` function receives a string where it expects a number for formatting in AI prompts.

**Same issue on line 668**:
```ts
const result = await analyzeLoanDocument(
  userId, detectedLoanId, loan.document_id, loan.loan_type, loan.estimated_monthly_payment
);
```

**Fix**: Normalize: `Number(loan.estimated_monthly_payment)`

---

### 9. `financialInsights.ts` lines 443-464 / 506-515 -- detected_loans returned with string amounts

**File**: `server/src/routes/financialInsights.ts`
**Lines**: 443-464 (existing check) and 506-515 (active results)

**Issue**: Both queries on `detected_loans` table return `estimated_monthly_payment` as a string (it is `numeric(14,2)`). These rows are returned directly to the frontend via `res.json()`. The frontend may expect numeric values for formatting and comparison.

**Also affects** the `GET /analyzed-loans` endpoint (lines 621-626) which returns `estimated_monthly_payment` directly.

**Fix**: Normalize `estimated_monthly_payment` in the response:
```ts
const prompts = (active || []).map((l: any) => ({
  ...l,
  estimated_monthly_payment: Number(l.estimated_monthly_payment),
  prompt_text: PROMPT_TEXTS[l.loan_type] || PROMPT_TEXTS.other,
}));
```

---

### 10. `billing.ts` lines 42-44 -- Billing data returned with string amounts (bigint)

**File**: `server/src/routes/billing.ts`
**Lines**: 40-45
**Code**:
```ts
res.json({
  success: true,
  paymentMethods: pmResult.rows,
  invoices: invResult.rows,
  transactions: txResult.rows,
});
```

**Issue**: The `invoices` table has `amount_due`, `amount_paid`, `amount_remaining`, `subtotal`, `tax`, `total` as `bigint` columns. The `transactions` table has `amount` and `refund_amount` as `bigint` columns. The `pg` driver returns `bigint` values as strings (because JS `Number` cannot safely represent all 64-bit integers). These string values are sent directly to the frontend without numeric conversion.

**Impact**: Frontend code doing arithmetic on these values (e.g., `invoice.amount_due / 100` for dollar display) would get string concatenation instead of division.

**Fix**: Normalize bigint fields before returning:
```ts
invoices: invResult.rows.map((inv: any) => ({
  ...inv,
  amount_due: Number(inv.amount_due),
  amount_paid: Number(inv.amount_paid),
  amount_remaining: Number(inv.amount_remaining),
  subtotal: Number(inv.subtotal),
  tax: Number(inv.tax),
  total: Number(inv.total),
})),
transactions: txResult.rows.map((tx: any) => ({
  ...tx,
  amount: Number(tx.amount),
  refund_amount: Number(tx.refund_amount),
})),
```

---

## MEDIUM Issues

### 11. `engagement.ts` lines 39-45 -- Date columns returned as Date objects to engagement engine

**File**: `server/src/routes/engagement.ts`
**Lines**: 39-45
**Code**:
```ts
async function fetchUserDocuments(userId: string): Promise<DocumentForHealth[]> {
  const result = await query(
    'SELECT id, user_id, name, category, type, tags, expiration_date, upload_date, last_reviewed_at, review_cadence_days, ...',
    [userId]
  );
  return (result.rows || []) as DocumentForHealth[];
}
```

**Issue**: `expiration_date`, `upload_date`, and `effective_date` are `date` type columns, returned as JavaScript `Date` objects by pg. `last_reviewed_at` is `timestamptz`, also returned as a `Date` object. The `DocumentForHealth` interface likely expects strings. If the engagement engine does string comparisons like `doc.expiration_date > today`, this would compare a `Date` object against a string, yielding unreliable results.

**Impact**: Depends on how `engagementEngine.ts` uses these fields. If it does string comparisons or `.split('T')` operations, it would fail.

**Fix**: Convert date fields to ISO strings:
```ts
return (result.rows || []).map((row: any) => ({
  ...row,
  expiration_date: row.expiration_date instanceof Date ? row.expiration_date.toISOString().split('T')[0] : row.expiration_date,
  upload_date: row.upload_date instanceof Date ? row.upload_date.toISOString().split('T')[0] : row.upload_date,
  effective_date: row.effective_date instanceof Date ? row.effective_date.toISOString().split('T')[0] : row.effective_date,
  last_reviewed_at: row.last_reviewed_at instanceof Date ? row.last_reviewed_at.toISOString() : row.last_reviewed_at,
})) as DocumentForHealth[];
```

---

### 12. `engagement.ts` line 220 -- Document date fields in response as Date objects

**File**: `server/src/routes/engagement.ts`
**Line**: 220
**Code**:
```ts
metadata: {
  issuer: doc.issuer || '',
  ownerName: doc.owner_name || '',
  expirationDate: doc.expiration_date || '',
},
```

**Issue**: `doc.expiration_date` is a `Date` object from pg. When sent via `res.json()`, it will be serialized as a full ISO timestamp string (e.g., `"2026-05-15T00:00:00.000Z"`) rather than a date-only string (`"2026-05-15"`). This may not match frontend expectations.

**Fix**: Convert explicitly:
```ts
expirationDate: doc.expiration_date instanceof Date
  ? doc.expiration_date.toISOString().split('T')[0]
  : (doc.expiration_date || ''),
```

---

### 13. `dunningService.ts` lines 602-611 -- Timestamp columns returned as Date objects

**File**: `server/src/services/dunningService.ts`
**Lines**: 602-611
**Code**:
```ts
return {
  inDunning: sub.payment_status !== 'active',
  paymentStatus: sub.payment_status,
  dunningStep: sub.dunning_step,
  paymentFailedAt: sub.payment_failed_at,
  restrictedAt: sub.restricted_at,
  downgradeDate: sub.downgraded_at,
  deletionDate: sub.deletion_scheduled_at,
  previousPlan: sub.previous_plan,
};
```

**Issue**: `payment_failed_at`, `restricted_at`, `downgraded_at`, and `deletion_scheduled_at` are `timestamptz` columns, returned as JavaScript `Date` objects by pg. The return type declares these as `string | null`, but they are actually `Date | null`. When serialized to JSON they become ISO strings, which works, but any code doing string operations on these values before serialization could fail.

**Fix**: Convert to ISO strings explicitly:
```ts
paymentFailedAt: sub.payment_failed_at instanceof Date ? sub.payment_failed_at.toISOString() : sub.payment_failed_at,
restrictedAt: sub.restricted_at instanceof Date ? sub.restricted_at.toISOString() : sub.restricted_at,
downgradeDate: sub.downgraded_at instanceof Date ? sub.downgraded_at.toISOString() : sub.downgraded_at,
deletionDate: sub.deletion_scheduled_at instanceof Date ? sub.deletion_scheduled_at.toISOString() : sub.deletion_scheduled_at,
```

---

### 14. `upload.ts` (routes) line 302 -- Document listing returns raw DB rows with Date/bigint fields

**File**: `server/src/routes/upload.ts`
**Line**: 302
**Code**:
```ts
res.json({ success: true, documents: result.rows });
```

**Issue**: `documents.size` is `bigint` (returned as string by pg), `documents.upload_date` and `documents.expiration_date` are `date` (returned as Date objects), `documents.created_at` is `timestamptz` (returned as Date object). These are sent directly to the frontend without normalization.

**Impact**: Frontend receives `size` as a string. Operations like `doc.size > 1000000` would be string comparisons. Date fields auto-serialize via JSON but may not match expected format.

**Fix**: Normalize at least the bigint field:
```ts
res.json({
  success: true,
  documents: result.rows.map((doc: any) => ({
    ...doc,
    size: Number(doc.size),
  })),
});
```

---

### 15. `plaidWebhook.ts` line 152 -- `bank_account_limit` may need normalization check

**File**: `server/src/routes/plaidWebhook.ts`
**Line**: 152
**Code**:
```ts
const bankLimit = userSub?.bank_account_limit ?? 0;
```

**Issue**: `bank_account_limit` is `INTEGER` in the schema, so pg returns it as a JS number. This is actually fine. However, the `parseInt` on line 145 is missing the radix parameter:

**Line 145**:
```ts
const bankCount = parseInt(bankCountResult.rows[0]?.count || '0');
```

While `parseInt` without radix defaults to base 10 for numeric strings, ESLint and TypeScript best practices recommend always including the radix parameter.

**Fix**: Add radix:
```ts
const bankCount = parseInt(bankCountResult.rows[0]?.count || '0', 10);
```

---

### 16. `admin.ts` line 427 -- `parseInt` missing radix parameter

**File**: `server/src/routes/admin.ts`
**Line**: 427
**Code**:
```ts
const pendingDocs = parseInt(pendingDocsResult.rows[0]?.count || '0');
```

**Issue**: `parseInt` is called without the radix parameter (second argument). While this defaults to base 10 for typical numeric strings, best practice is to always specify the radix.

**Same pattern appears on lines**: 462, 467, 483, 486, 490, 496, 501, 557.

**Fix**: Add `, 10` as the second argument to all `parseInt` calls.

---

### 17. `subscriptionGuard.ts` line 150-151 -- Subscription loaded from DB without explicit type conversion

**File**: `server/src/middleware/subscriptionGuard.ts`
**Lines**: 150-151
**Code**:
```ts
const subscription = subResult.rows[0];
req.subscription = subscription as SubscriptionInfo;
```

**Issue**: The `user_subscriptions` row is cast directly to `SubscriptionInfo` without any field normalization. While the numeric fields (`document_limit`, `ai_questions_limit`, etc.) are `INTEGER` columns (returned as JS numbers by pg), the `feature_flags` column is `jsonb`. If `feature_flags` is stored as a JSON string rather than a parsed object, it would be a string, not an object. Also, date fields like `current_period_end` and `monthly_upload_reset_date` would be Date objects if they are `timestamptz`/`date` columns, but the `SubscriptionInfo` interface declares them as `string`.

**Impact**: Low -- JSON.stringify/parse handles most cases, and the fields that matter most (limits) are integers.

**Fix**: Consider explicit conversion for date fields to ensure type consistency with the interface.

---

### 18. `financialInsights.ts` line 402 -- `connected_at` Date comparison

**File**: `server/src/routes/financialInsights.ts`
**Line**: 402
**Code**:
```ts
const connectedAt = new Date(item.connected_at);
```

**Issue**: `item.connected_at` comes from `plaid_items.connected_at` which is a `timestamptz` column. The pg driver returns this as a `Date` object already. Wrapping it in `new Date()` works (Date constructor accepts Date objects), but it creates an unnecessary intermediate object. This is not a bug, just a redundant operation.

**Impact**: None -- this works correctly. The `<` comparison on line 404 works because both `connectedAt` and `oneHourAgo` are Date objects.

---

### 19. `goalProgressCalculator.ts` line 426 -- `parseFloat` on `activity.amount`

**File**: `server/src/services/goalProgressCalculator.ts`
**Line**: 426
**Code**:
```ts
.reduce((sum: number, a: any) => sum + parseFloat(a.amount), 0);
```

**Issue**: `financial_goal_activities.amount` is `numeric(14,2)` returned as string. `parseFloat` works but is inconsistent with the `Number()` pattern used on lines 393-399 and 405 of the same file.

**Fix**: Use `Number(a.amount)` for consistency:
```ts
.reduce((sum: number, a: any) => sum + Number(a.amount), 0);
```

---

## LOW Issues

### 20. `admin.ts` line 97 -- `total_count` from function may be string

**File**: `server/src/routes/admin.ts`
**Line**: 97
**Code**:
```ts
const total = users[0]?.total_count || 0;
```

**Issue**: `total_count` comes from the `admin_list_users` SQL function. On line 115 it is normalized with `Number(total)`, so this is handled. No action needed -- noting for completeness.

---

### 21. `admin.ts` lines 59-63 -- `created_at` and `updated_at` returned as Date objects

**File**: `server/src/routes/admin.ts`
**Lines**: 59-63
**Code**:
```ts
const recentSignups = recentUsersResult.rows.map((u: any) => ({
  id: u.id,
  email: u.email,
  createdAt: u.created_at,
  lastSignInAt: u.updated_at,
}));
```

**Issue**: `auth_users.created_at` and `auth_users.updated_at` are `timestamptz` columns returned as `Date` objects by pg. They serialize correctly to ISO strings via `JSON.stringify()`, so this works in practice. However, the explicit intent is unclear.

**Impact**: None in practice -- JSON serialization handles Date objects correctly.

---

### 22. `upload.ts` (routes) lines 482-493 -- `delete_document_cascade` function result already handled

**File**: `server/src/routes/upload.ts`
**Lines**: 482-495
**Code**:
```ts
const rpcResult = await query(
  `SELECT * FROM delete_document_cascade($1, $2)`,
  [id, userId]
);
// ...
const deleteResult = rpcResult.rows[0];
if (!deleteResult.success) { ... }
```

**Issue**: The `delete_document_cascade` function returns `TABLE(success boolean, message text, file_path text)` (checked in migration), not JSONB. So `rpcResult.rows[0]` correctly gives `{ success, message, file_path }` without needing JSONB unwrapping. This is correctly implemented.

**Impact**: None -- this is a false positive from the initial pattern check. Noting for completeness.

---

## Files Audited (38 total)

### Routes (22 files)
| File | Status |
|------|--------|
| `routes/auth.ts` | Clean -- uses `auth_users` correctly, no numeric issues |
| `routes/upload.ts` | Issues #14, #22 |
| `routes/subscription.ts` | Clean -- uses `parseInt` for COUNT, subscription pre-normalized by middleware |
| `routes/billing.ts` | Issue #10 |
| `routes/account.ts` | Clean -- uses `auth_users` correctly |
| `routes/chatHistory.ts` | Clean -- timestamp fields auto-serialize |
| `routes/admin.ts` | Issues #16, #20, #21 |
| `routes/financialInsights.ts` | Issues #2, #8, #9, #18 |
| `routes/financialGoals.ts` | Issues #3, #4, #5 |
| `routes/lifeEvents.ts` | Clean -- delegates to services |
| `routes/engagement.ts` | Issues #11, #12 |
| `routes/processing.ts` | Clean |
| `routes/errorLog.ts` | Issue #1 (CRITICAL) |
| `routes/devices.ts` | Clean |
| `routes/dunning.ts` | Clean -- delegates to service |
| `routes/email.ts` | Clean |
| `routes/userProfile.ts` | Clean -- uses `user_profiles` and `auth_users` correctly |
| `routes/globalChat.ts` | Clean |
| `routes/globalSearch.ts` | Clean |
| `routes/pricing.ts` | Clean -- no DB queries |
| `routes/plaidWebhook.ts` | Issue #15 |
| `routes/stripe.ts` | Clean -- amounts come from Stripe API (already numbers), not from pg |

### Services (12 files)
| File | Status |
|------|--------|
| `services/plaidService.ts` | Clean -- correctly normalizes with `Number()` and has `dateToString()` helper |
| `services/globalChat.ts` | Clean |
| `services/globalSearch.ts` | Clean |
| `services/emailService.ts` | Clean -- uses `auth_users` and `user_profiles` correctly |
| `services/financialAnalyzer.ts` | Clean -- receives pre-normalized data |
| `services/loanAnalyzer.ts` | Clean -- no direct DB numeric issues |
| `services/loanDetector.ts` | Affected by issue #2 (caller passes string amounts) |
| `services/goalProgressCalculator.ts` | Issues #6, #7, #19. Lines 203-214 and 389-399 correctly normalize. |
| `services/goalSuggestionEngine.ts` | Clean -- no DB queries |
| `services/dunningService.ts` | Issue #13 |
| `services/embeddingMonitor.ts` | Clean |
| `services/tagGeneration.ts` | Clean |

### Middleware (3 files)
| File | Status |
|------|--------|
| `middleware/subscriptionGuard.ts` | Issue #17 (minor -- integers are fine, dates may need conversion) |
| `middleware/requireAdmin.ts` | Clean -- uses `auth_users` correctly |
| `middleware/impersonation.ts` | Clean |

### Other Services (3 files)
| File | Status |
|------|--------|
| `services/upload.ts` | Clean -- multer config only |
| `services/chunking.ts` | Clean -- no numeric/date DB issues |
| `services/storage.ts` | Clean -- Azure Blob operations only |

---

## Key Patterns Confirmed Working

1. **`auth.users` -> `auth_users`**: All SQL queries reference `auth_users` (public table). No references to the Supabase `auth.users` schema were found in SQL strings.

2. **`display_name FROM user_profiles`**: All code correctly queries `display_name` from `user_profiles`, not from `user_subscriptions`.

3. **JSONB function unwrapping**: `admin.ts` correctly unwraps `rawRow.admin_dashboard_stats || rawRow` (line 49) and `rawRow.admin_get_user_detail || rawRow` (line 139).

4. **`plaidService.ts` normalization**: The Plaid service correctly normalizes all numeric fields with `Number()` and converts dates with a `dateToString()` helper function.

5. **`goalProgressCalculator.ts` partial normalization**: The `calculateBaseline()` and `recalculateAllUserGoals()` functions correctly normalize account balances and transaction amounts (lines 203-214, 389-399, 405), but miss normalization in `expireOverdueGoals()` (lines 515-516).

---

## Recommended Priority Order

1. **Fix issue #1** (errorLog.ts) -- CRITICAL, every error log request returns 401
2. **Fix issue #2** (financialInsights.ts) -- CRITICAL, loan detection is completely broken
3. **Fix issues #4, #6** (financial goals arithmetic) -- HIGH, NaN in progress calculations
4. **Fix issue #5** (date comparison) -- HIGH, activity date validation unreliable
5. **Fix issue #10** (billing.ts) -- HIGH, frontend receives string amounts
6. **Fix issues #8, #9** (loan analysis) -- HIGH, string amounts in analysis pipeline
7. **Fix issue #11** (engagement.ts) -- MEDIUM, date handling for engagement engine
8. **Fix remaining MEDIUM/LOW issues** in any order
