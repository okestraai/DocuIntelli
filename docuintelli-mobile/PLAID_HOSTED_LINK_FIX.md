# Fix: Plaid Mobile — Hosted Link via InAppBrowser (Same as Stripe)

## Problem
Plaid blocks WebView-based integrations from firing `onSuccess` for new customers. The PlaidLinkModal WebView approach is dead.

## Solution
Use **Plaid Hosted Link** loaded in the existing `InAppBrowser` component — identical to how Stripe checkout/portal works in `billing.tsx`. Plaid handles everything and redirects to `docuintelli://plaid-callback?public_token=xxx` when done. InAppBrowser already intercepts `docuintelli://` URLs.

## Files to Change (5 files)

---

### 1. `server/src/services/plaidService.ts` — Add Hosted Link support

Change `createLinkToken` to accept a `platform` param. When `'mobile'`, add `hosted_link` config:

```typescript
export async function createLinkToken(
  userId: string,
  platform?: 'web' | 'mobile'
): Promise<{ link_token: string; hosted_link_url?: string }> {
  const webhookUrl = process.env.APP_URL
    ? `${process.env.APP_URL}/api/plaid-webhook`
    : undefined;

  const isMobile = platform === 'mobile';

  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: 'DocuIntelli AI',
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
    ...(webhookUrl && { webhook: webhookUrl }),
    ...(isMobile && {
      hosted_link: {
        completion_redirect_uri: 'docuintelli://plaid-callback',
        is_mobile_app: true,
      },
    }),
  });

  return {
    link_token: response.data.link_token,
    hosted_link_url: response.data.hosted_link_url || undefined,
  };
}
```

**Remove** the old `redirect_uri` logic if present from earlier patches.

---

### 2. Backend route that calls `createLinkToken`

Find where `/api/financial/link-token` is handled (likely in `server/src/index.ts` or a router file). Update it to:
- Read `platform` from `req.body`
- Pass it to `createLinkToken(userId, platform)`
- Return `hosted_link_url` in the response alongside `link_token`

```typescript
const platform = req.body?.platform || 'web';
const result = await createLinkToken(userId, platform);
res.json({
  success: true,
  link_token: result.link_token,
  ...(result.hosted_link_url && { hosted_link_url: result.hosted_link_url }),
});
```

---

### 3. `docuintelli-mobile/src/lib/financialApi.ts` — Send `platform: 'mobile'`, return hosted URL

Update the mobile `createLinkToken`:

```typescript
export async function createLinkToken(): Promise<{ link_token: string; hosted_link_url?: string }> {
  const session = await getSession();
  const headers = await backendHeaders(session.access_token);
  const res = await fetch(`${API_BASE}/api/financial/link-token`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ platform: 'mobile' }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create link token' }));
    throw new Error(err.error || err.message);
  }

  const data = await res.json();
  return { link_token: data.link_token, hosted_link_url: data.hosted_link_url };
}
```

---

### 4. `docuintelli-mobile/src/hooks/usePlaidLinkFlow.ts` — Rewrite to use InAppBrowser pattern

Replace the entire file. Instead of showing PlaidLinkModal, expose a `browserUrl` + `handleBrowserRedirect` (same pattern as Stripe in billing.tsx):

```typescript
/**
 * Plaid Link flow — NATIVE via Hosted Link + InAppBrowser
 * Same pattern as Stripe checkout in billing.tsx.
 */
import { useState, useEffect, useCallback } from 'react';
import { createLinkToken, exchangePublicToken } from '../lib/financialApi';

interface PlaidLinkFlowResult {
  open: () => void;
  ready: boolean;
  loading: boolean;
  error: string | null;
  /** URL for InAppBrowser — non-null when browser should be open */
  browserUrl: string | null;
  /** Called when InAppBrowser catches docuintelli:// redirect */
  handleBrowserRedirect: (url?: string) => Promise<void>;
}

export function usePlaidLinkFlow(
  onSuccess: () => void,
): PlaidLinkFlowResult {
  const [hostedUrl, setHostedUrl] = useState<string | null>(null);
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch Hosted Link URL on mount
  useEffect(() => {
    createLinkToken()
      .then((result) => {
        if (result.hosted_link_url) {
          setHostedUrl(result.hosted_link_url);
        } else {
          setError('Hosted Link not available');
        }
      })
      .catch((err) => setError(err?.message || 'Failed to create link token'));
  }, []);

  const open = useCallback(() => {
    if (!hostedUrl) return;
    setError(null);
    setBrowserUrl(hostedUrl);
  }, [hostedUrl]);

  const handleBrowserRedirect = useCallback(async (url?: string) => {
    setBrowserUrl(null);

    // User closed without completing
    if (!url || !url.includes('plaid-callback')) return;

    // Parse: docuintelli://plaid-callback?public_token=xxx&institution_name=yyy
    const qs = url.split('?')[1] || '';
    const params = new URLSearchParams(qs);
    const publicToken = params.get('public_token');

    if (!publicToken) {
      setError('No token received from Plaid');
      return;
    }

    const institutionName = params.get('institution_name') || 'Unknown Bank';

    setLoading(true);
    setError(null);
    try {
      await exchangePublicToken(publicToken, institutionName);
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Failed to connect bank');
    } finally {
      setLoading(false);
    }
  }, [onSuccess]);

  return {
    open,
    ready: !!hostedUrl,
    loading,
    error,
    browserUrl,
    handleBrowserRedirect,
  };
}
```

---

### 5. `docuintelli-mobile/app/financial-insights.tsx` — Swap PlaidLinkModal for InAppBrowser

**Change import:**
```diff
- import PlaidLinkModal from '../src/components/financial/PlaidLinkModal';
+ import InAppBrowser from '../src/components/ui/InAppBrowser';
```

**Replace the PlaidLinkModal JSX** (near bottom, ~line 303-314):

Remove:
```jsx
{/* Native Plaid Link WebView Modal */}
{Platform.OS !== 'web' && plaid.nativeModal && (
  <PlaidLinkModal
    visible={plaid.nativeModal.visible}
    linkToken={plaid.nativeModal.linkToken}
    onSuccess={plaid.nativeModal.onSuccess}
    onClose={() => {
      plaid.nativeModal.onClose();
      loadData();
    }}
  />
)}
```

Add:
```jsx
{/* Plaid Hosted Link — InAppBrowser (same pattern as Stripe) */}
{Platform.OS !== 'web' && (
  <InAppBrowser
    url={plaid.browserUrl}
    onClose={() => {
      plaid.handleBrowserRedirect();
      loadData();
    }}
    title="Connect Your Bank"
    onRedirect={(url) => plaid.handleBrowserRedirect(url)}
    interceptSchemes={['docuintelli://']}
  />
)}
```

---

## NO changes needed for:
- `src/lib/financialApi.ts` (Vite web app) — doesn't send platform, defaults to 'web'
- `src/components/FinancialInsightsPage.tsx` (web app) — uses react-plaid-link directly
- `InAppBrowser.tsx` — already handles `docuintelli://` interception

## Plaid Dashboard Setup (REQUIRED before testing)
Go to **Plaid Dashboard → API → Allowed redirect URIs** and add:
```
docuintelli://plaid-callback
```

## Flow (mirrors Stripe exactly)
1. Mount → `createLinkToken({ platform: 'mobile' })` → backend returns `hosted_link_url`
2. User taps "Connect Bank" → `open()` sets `browserUrl` → InAppBrowser modal opens
3. User completes Plaid flow inside InAppBrowser (Plaid controls the entire UI)
4. Plaid redirects to `docuintelli://plaid-callback?public_token=xxx`
5. InAppBrowser's `onShouldStartLoadWithRequest` catches `docuintelli://` → calls `onRedirect`
6. Hook extracts `public_token`, calls `exchangePublicToken`, calls `onSuccess`
7. Financial Insights page reloads with the new account
