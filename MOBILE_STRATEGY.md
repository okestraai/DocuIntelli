# DocuIntelli AI - Mobile Adaptation Strategy

## 1. Current State Analysis

### 1.1 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Tailwind CSS |
| Backend | Express 5 (Node.js) on port 5000 |
| Database | Supabase (Postgres) with RLS, pgvector |
| Auth | Supabase Auth (email/password, Google OAuth, OTP) |
| Payments | Stripe (Checkout, Customer Portal, Webhooks) |
| AI | Self-hosted vLLM (chat + embeddings) via Cloudflare Access |
| Storage | IBM Cloud Object Storage (documents) |
| Email | Mailjet SMTP via nodemailer |
| Caching | Redis (optional, falls back to in-memory) |
| Edge Functions | 19 Supabase Edge Functions (Deno) |
| Cron | pg_cron → Edge Functions |

### 1.2 Feature Inventory

| Feature | Description | Mobile Priority |
|---------|-------------|----------------|
| **Authentication** | Email/password, Google OAuth, OTP verification | Critical |
| **Document Vault** | List, filter, sort, search documents by category/tags | Critical |
| **Document Upload** | File upload, URL import, manual text entry | Critical |
| **Document Viewer** | View document content, metadata, tags | Critical |
| **Document Chat** | AI Q&A per document with SSE streaming | Critical |
| **Global Chat** | Cross-document AI chat (Pro) with @mention | High |
| **Global Search** | Semantic search across all docs (Pro) | High |
| **Dashboard** | Overview stats, expiration alerts, quick actions | Critical |
| **Life Events** | Preparedness tracking, readiness scores, templates | Medium |
| **Weekly Audit** | Document health overview, action items | Medium |
| **Subscription/Billing** | Free/Starter/Pro plans, Stripe checkout, upgrade/downgrade | Critical |
| **Profile/Settings** | Profile editing, notification preferences, security | High |
| **Email Notifications** | Welcome, expiration, audit digest, security alerts | Backend-only |
| **Engagement Engine** | Related documents, usage tips | Low |
| **Landing/Marketing** | Landing page, features, pricing, beta signup | Not needed |
| **Legal Pages** | Terms, Privacy, Cookies | Low (webview) |

### 1.3 API Surface (What Mobile Will Call)

**Express Backend Routes (9 groups):**
- `POST /api/upload` — File upload (multipart/form-data)
- `GET/DELETE /api/documents/:id` — Document CRUD + processing status
- `POST /api/search` — Global semantic search
- `POST /api/global-chat` — Cross-document AI chat (SSE stream)
- `GET/POST /api/subscription/*` — Cancel, reactivate, upgrade, downgrade, preview
- `GET/POST /api/life-events/*` — Templates, user events, readiness
- `POST /api/email/*` — Trigger notification emails
- `GET /api/pricing` — Stripe price lookup
- `GET/POST /api/engagement/*` — Tips, related docs

**Supabase Edge Functions (called directly):**
- `chat-document` — Single-document AI chat (SSE stream)
- `stripe-checkout` — Create Stripe checkout session
- `stripe-customer-portal` — Open billing portal
- `create-upgrade-checkout` — Mid-cycle upgrade
- `stripe-sync-billing` — Manual billing sync
- `process-url-content` — Import from URL
- `process-manual-content` — Manual text entry
- `signup-send-otp` / `signup-verify-otp` — Custom OTP flow

**Direct Supabase Client Queries:**
- `documents` table — List, filter, count
- `user_subscriptions` table — Plan status, limits, usage
- `user_profiles` table — Preferences, display name
- `document_chats` / `global_chats` — Chat history
- Realtime channels — Subscription change events

### 1.4 Reusability Assessment

| Web Code | Reusability in React Native |
|----------|----------------------------|
| `src/lib/api.ts` | **~90% reusable** — Replace `window.location.origin` with config, `import.meta.env` with RN env |
| `src/lib/supabase.ts` | **~80% reusable** — Swap `createClient` for `@supabase/supabase-js` with `AsyncStorage` adapter |
| `src/hooks/useSubscription.ts` | **~95% reusable** — React hooks work identically in RN |
| `src/hooks/useDocuments.ts` | **~95% reusable** — Hooks are framework-agnostic |
| `src/lib/lifeEventsApi.ts` | **~95% reusable** — Pure fetch logic |
| `src/lib/engagementApi.ts` | **~95% reusable** — Pure fetch logic |
| `src/lib/planLimits.ts` | **100% reusable** — Pure TypeScript logic |
| TypeScript types/interfaces | **100% reusable** — Extract to shared package |
| React components (UI) | **0% reusable** — Must rewrite with React Native primitives |
| Tailwind CSS styles | **0% reusable** — Must redesign with RN StyleSheet or NativeWind |

---

## 2. Recommended Approach

### React Native with Expo (Managed Workflow)

**Why React Native + Expo:**

1. **Team alignment**: Your codebase is React + TypeScript. React Native uses the same language, same paradigms (hooks, state, effects), and same tooling (ESLint, TypeScript). Claude Code is highly proficient here.

2. **Simultaneous iOS + Android**: Single codebase compiles to both platforms. No need to maintain two separate apps.

3. **~60% code reuse from web**: All API logic, hooks, types, and business logic port directly. Only UI components need rewriting.

4. **Expo ecosystem covers all your mobile features**:
   - `expo-camera` + `expo-document-picker` → Document scanning
   - `expo-notifications` → Push notifications
   - `expo-local-authentication` → Face ID / fingerprint
   - `expo-sqlite` + `@react-native-async-storage` → Offline caching
   - `@stripe/stripe-react-native` → Native Stripe integration

5. **Supabase has first-class React Native support**: `@supabase/supabase-js` works out of the box with `AsyncStorage` for session persistence.

6. **EAS (Expo Application Services)**: Cloud builds for iOS and Android without needing a Mac for iOS builds.

**Why NOT Flutter / Native Swift+Kotlin:**
- Flutter: Would require rewriting everything in Dart. Zero code reuse. New language for the team.
- Native (Swift + Kotlin): Two separate codebases. 2x the maintenance. Requires platform-specific expertise.
- PWA/Capacitor: Poor camera integration, no real push notifications on iOS, limited offline support.

---

## 3. Folder Structure

```
docuintelli-mobile/
├── app.json                          # Expo config (app name, icons, splash, permissions)
├── eas.json                          # EAS Build profiles (dev, preview, production)
├── tsconfig.json
├── babel.config.js
├── package.json
│
├── app/                              # Expo Router (file-based navigation)
│   ├── _layout.tsx                   # Root layout (auth provider, navigation container)
│   ├── index.tsx                     # Entry redirect (→ auth or dashboard)
│   │
│   ├── (auth)/                       # Auth group (unauthenticated)
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   ├── verify-otp.tsx
│   │   └── forgot-password.tsx
│   │
│   ├── (tabs)/                       # Main tab navigator (authenticated)
│   │   ├── _layout.tsx               # Tab bar config
│   │   ├── dashboard.tsx             # Home/dashboard
│   │   ├── vault.tsx                 # Document vault
│   │   ├── chat.tsx                  # Global chat
│   │   └── settings.tsx              # Profile & settings
│   │
│   ├── document/
│   │   ├── [id].tsx                  # Document viewer
│   │   └── [id]/chat.tsx             # Single-document chat
│   │
│   ├── scan.tsx                      # Camera document scanner
│   ├── upload.tsx                    # Upload modal/screen
│   ├── search.tsx                    # Global search
│   ├── life-events.tsx               # Life events
│   ├── audit.tsx                     # Weekly audit
│   └── billing.tsx                   # Subscription management
│
├── src/
│   ├── components/                   # Reusable UI components
│   │   ├── ui/                       # Design system primitives
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Toast.tsx
│   │   │   └── LoadingSpinner.tsx
│   │   │
│   │   ├── documents/                # Document-specific components
│   │   │   ├── DocumentCard.tsx
│   │   │   ├── DocumentList.tsx
│   │   │   ├── DocumentFilters.tsx
│   │   │   ├── CategoryBadge.tsx
│   │   │   └── ExpirationIndicator.tsx
│   │   │
│   │   ├── chat/                     # Chat components
│   │   │   ├── ChatBubble.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── StreamingText.tsx
│   │   │   ├── SourceCard.tsx
│   │   │   └── MentionPicker.tsx     # @document mention UI
│   │   │
│   │   ├── scanner/                  # Camera scanner
│   │   │   ├── CameraView.tsx
│   │   │   ├── CropOverlay.tsx
│   │   │   └── ScanPreview.tsx
│   │   │
│   │   └── subscription/
│   │       ├── PlanCard.tsx
│   │       ├── UsageBar.tsx
│   │       └── UpgradePrompt.tsx
│   │
│   ├── hooks/                        # React hooks (mostly ported from web)
│   │   ├── useAuth.ts                # Auth state + biometric unlock
│   │   ├── useSubscription.ts        # Ported from web
│   │   ├── useDocuments.ts           # Ported from web
│   │   ├── useOfflineCache.ts        # SQLite-backed offline data
│   │   ├── usePushNotifications.ts   # Expo push token registration
│   │   ├── useBiometrics.ts          # Face ID / fingerprint
│   │   └── useEngagement.ts          # Ported from web
│   │
│   ├── lib/                          # API + service layer (ported from web)
│   │   ├── supabase.ts               # Supabase client (AsyncStorage adapter)
│   │   ├── api.ts                    # Backend API helpers (ported)
│   │   ├── lifeEventsApi.ts          # Life events API (ported)
│   │   ├── engagementApi.ts          # Engagement API (ported)
│   │   ├── planLimits.ts             # Plan limit logic (direct copy)
│   │   └── config.ts                 # API_BASE, Supabase URL, Stripe keys
│   │
│   ├── services/                     # Mobile-specific services
│   │   ├── offlineStorage.ts         # expo-sqlite for cached documents/chats
│   │   ├── pushNotifications.ts      # Push token management + Supabase storage
│   │   ├── documentScanner.ts        # Camera capture + OCR processing
│   │   ├── biometricAuth.ts          # Face ID / fingerprint wrapper
│   │   ├── fileSystem.ts             # expo-file-system for document downloads
│   │   └── deepLinking.ts            # Handle Stripe redirect URLs, etc.
│   │
│   ├── store/                        # Global state (Zustand — lightweight)
│   │   ├── authStore.ts
│   │   └── appStore.ts               # Theme, offline status, etc.
│   │
│   ├── types/                        # Shared TypeScript types
│   │   ├── document.ts               # Document, SupabaseDocument interfaces
│   │   ├── subscription.ts           # Subscription, Plan types
│   │   ├── chat.ts                   # ChatMessage, Source types
│   │   └── navigation.ts             # Route param types
│   │
│   ├── theme/                        # Design tokens
│   │   ├── colors.ts                 # Emerald/teal/slate palette
│   │   ├── typography.ts             # Font sizes, weights
│   │   └── spacing.ts                # Consistent spacing scale
│   │
│   └── utils/                        # Utility functions
│       ├── dateUtils.ts              # Ported from web
│       ├── formatters.ts             # File size, currency formatting
│       └── validators.ts             # Input validation
│
├── assets/                           # Static assets
│   ├── icon.png                      # App icon (1024x1024)
│   ├── splash.png                    # Splash screen
│   ├── adaptive-icon.png             # Android adaptive icon
│   └── images/                       # In-app illustrations
│
└── __tests__/                        # Test files
    ├── hooks/
    ├── components/
    └── services/
```

---

## 4. Implementation Roadmap

### Phase 1: Foundation (Weeks 1–3)

**Goal:** Project setup, auth, and navigation skeleton.

| Task | Complexity | Details |
|------|-----------|---------|
| Expo project init with TypeScript | Low | `npx create-expo-app` with Expo Router |
| Supabase client setup with AsyncStorage | Low | `@supabase/supabase-js` + `@react-native-async-storage/async-storage` |
| Environment config | Low | `expo-constants` for API URLs, Supabase keys |
| Auth flows (login, signup, OTP) | Medium | Port `AuthModal.tsx` logic, custom OTP edge functions |
| Google OAuth (native) | Medium | `expo-auth-session` + Supabase OAuth redirect |
| Biometric authentication | Medium | `expo-local-authentication` for app unlock |
| Navigation structure | Medium | Expo Router: (auth) group, (tabs) group, document stack |
| Theme/design system | Medium | Define colors, typography, spacing matching web brand |
| Zustand stores (auth, app state) | Low | Lightweight global state |

**Deliverable:** Users can sign up, log in (email + Google + biometric), and see the tab navigator.

---

### Phase 2: Core Features (Weeks 4–7)

**Goal:** Document vault, upload, viewer, and single-document chat.

| Task | Complexity | Details |
|------|-----------|---------|
| Dashboard screen | Medium | Stats cards, expiration alerts, quick actions |
| Document vault (list + filters) | Medium | FlatList with category/tag filters, search bar |
| Document viewer | Medium | Display content, metadata, tags, expiration status |
| File upload (device picker) | Medium | `expo-document-picker` + multipart upload to `/api/upload` |
| Camera document scanner | High | `expo-camera` capture → crop → upload. OCR via backend Tesseract. |
| URL import flow | Low | Text input → calls `process-url-content` edge function |
| Manual text entry | Low | TextInput → calls `process-manual-content` edge function |
| Single-document AI chat | High | SSE streaming with `ReadableStream`, chat history, markdown rendering |
| Subscription hook + plan gating | Medium | Port `useSubscription`, gate features by plan |
| Pull-to-refresh + loading states | Low | Standard RN patterns |

**Deliverable:** Full document lifecycle — upload (file/camera/URL/manual), view, chat, delete.

---

### Phase 3: Pro Features (Weeks 8–10)

**Goal:** Global chat, global search, life events.

| Task | Complexity | Details |
|------|-----------|---------|
| Global search screen | Medium | Search input → `/api/search` → grouped results with highlights |
| Global chat | High | SSE streaming, @document mentions, cross-doc sources |
| Life events page | Medium | Templates, readiness scores, linked documents |
| Weekly audit view | Medium | Document health summary, action items |
| Pro feature gates | Low | Reuse `ProFeatureGate` logic, show upgrade prompts |

**Deliverable:** Full feature parity with web Pro tier.

---

### Phase 4: Billing & Settings (Weeks 11–13)

**Goal:** Stripe integration, settings, notifications.

| Task | Complexity | Details |
|------|-----------|---------|
| Stripe checkout (in-app browser) | Medium | `@stripe/stripe-react-native` or WebBrowser for checkout URLs |
| Subscription management | Medium | Cancel, reactivate, upgrade/downgrade flows |
| Billing page | Medium | Current plan, usage, payment history |
| Profile editing | Low | Display name, bio, avatar |
| Notification preferences | Low | Toggle switches for each preference category |
| Password change | Low | Supabase `updateUser` |
| Account deletion | Medium | Confirmation flow + backend deletion |
| Deep linking | Medium | Handle Stripe callback URLs, password reset links |

**Deliverable:** Users can manage subscriptions and settings entirely from mobile.

---

### Phase 5: Mobile-Native Features (Weeks 14–17)

**Goal:** Push notifications, offline mode, polish.

| Task | Complexity | Details |
|------|-----------|---------|
| Push notification registration | Medium | `expo-notifications`, store push token in Supabase |
| Push notification backend | High | New Edge Function or backend service to send pushes via Expo Push API |
| Expiration push alerts | Medium | Cron job sends push instead of/alongside email |
| Offline document cache | High | `expo-sqlite` stores document metadata + content for offline viewing |
| Offline chat history | Medium | Cache recent chat messages in SQLite |
| Offline indicator + sync | Medium | Network detection, queue uploads when offline, sync on reconnect |
| Image/PDF preview | Medium | `expo-image` for images, `react-native-pdf` or WebView for PDFs |
| Haptic feedback | Low | `expo-haptics` on key interactions |
| App icon, splash screen | Low | Brand-consistent assets |

**Deliverable:** Fully native mobile experience with offline support and push notifications.

---

### Phase 6: QA, App Store, Launch (Weeks 18–20)

**Goal:** Testing, polish, App Store and Play Store submission.

| Task | Complexity | Details |
|------|-----------|---------|
| End-to-end testing | High | Detox or Maestro for critical flows |
| Performance optimization | Medium | Memoization, list virtualization, image caching |
| Accessibility audit | Medium | VoiceOver/TalkBack labels, contrast ratios, touch targets |
| App Store assets | Low | Screenshots, descriptions, privacy policy |
| EAS Build (production) | Low | Build iOS + Android binaries |
| TestFlight + Play Store internal testing | Low | Distribute to testers |
| App Store review submission | Low | Submit to Apple + Google |
| Monitoring setup | Medium | Sentry for crash reporting, analytics |

**Deliverable:** Apps live on both stores.

---

## 5. Key Considerations

### 5.1 Backend Changes Required

The existing backend is **mostly mobile-ready**. Key changes:

| Change | Reason | Effort |
|--------|--------|--------|
| **Push notification token storage** | New `push_tokens` table to store Expo push tokens per user/device | Low |
| **Push notification sending** | New cron task or edge function to send pushes via `expo-server-sdk` | Medium |
| **CORS: allow mobile origins** | Add mobile deep link scheme to allowed origins (or relax for native apps using Bearer tokens) | Low |
| **Stripe redirect URLs** | Support deep link schemes (`docuintelli://`) for Stripe success/cancel callbacks | Low |
| **Upload endpoint**: accept camera images | Already handles images via Tesseract OCR — no change needed | None |

### 5.2 Authentication Differences

| Web | Mobile |
|-----|--------|
| PKCE flow + browser redirect for Google OAuth | `expo-auth-session` with Supabase OAuth |
| `window.location.origin` for redirect URLs | Deep link scheme `docuintelli://auth/callback` |
| `localStorage` for session persistence | `AsyncStorage` adapter for Supabase client |
| No biometrics | Face ID / fingerprint via `expo-local-authentication` |
| OTP via same browser | OTP code entry screen (same edge functions) |

### 5.3 Stripe on Mobile — Apple/Google Compliance

**Critical consideration**: Apple requires a 30% commission on digital goods purchased through iOS apps (App Store Review Guideline 3.1.1). Stripe-powered subscriptions that are "consumed" within the app may need to use **In-App Purchases (IAP)** on iOS.

**Options:**
1. **Use IAP for iOS, Stripe for Android** — Most compliant. Use `expo-iap` for Apple, keep Stripe for Android/web. Requires dual billing logic.
2. **Reader link entitlement** — If DocuIntelli qualifies as a "reader" app (content created outside the app), Apple may grant an exemption allowing external purchase links.
3. **Web-only billing** — Don't allow in-app subscription purchases at all. Direct users to the website. Many apps do this (e.g., Spotify, Netflix on iOS).
4. **Stripe + IAP hybrid via RevenueCat** — Use [RevenueCat](https://www.revenuecat.com/) to unify Apple IAP, Google Play Billing, and Stripe into one subscription backend.

**Recommendation:** Start with **Option 3 (web-only billing)** for the MVP. Users manage subscriptions on the website. Once the app is established, evaluate RevenueCat for native IAP if needed.

### 5.4 SSE Streaming on React Native

The AI chat features use Server-Sent Events (SSE) for streaming responses. React Native doesn't have a native `EventSource` API.

**Solution:** Use `fetch()` with `ReadableStream` (supported in React Native's Hermes engine since Expo SDK 50+) or the `react-native-sse` library. Your web code's manual SSE parsing (splitting on `\n`, parsing `data:` lines) will port almost directly.

### 5.5 Offline Strategy

| Data | Offline Approach |
|------|-----------------|
| Document list + metadata | Cache in SQLite, refresh on connectivity |
| Document content (text) | Cache in SQLite for recently viewed docs |
| Document files (PDF/images) | Download to `expo-file-system` on demand |
| Chat history | Cache last N messages per document in SQLite |
| Subscription state | Cache in AsyncStorage, refresh on app foreground |
| Uploads | Queue in SQLite, retry when online |
| AI chat | Requires network — show "offline" state gracefully |

### 5.6 Key Dependencies

```json
{
  "dependencies": {
    "expo": "~52.0.0",
    "expo-router": "~4.0.0",
    "expo-camera": "~16.0.0",
    "expo-document-picker": "~13.0.0",
    "expo-file-system": "~18.0.0",
    "expo-image": "~2.0.0",
    "expo-haptics": "~14.0.0",
    "expo-local-authentication": "~15.0.0",
    "expo-notifications": "~0.29.0",
    "expo-sqlite": "~15.0.0",
    "expo-auth-session": "~6.0.0",
    "expo-web-browser": "~14.0.0",
    "@supabase/supabase-js": "^2.56.0",
    "@react-native-async-storage/async-storage": "^2.0.0",
    "@stripe/stripe-react-native": "^0.39.0",
    "zustand": "^5.0.0",
    "react-native-markdown-display": "^7.0.0",
    "react-native-reanimated": "~3.16.0",
    "react-native-gesture-handler": "~2.20.0"
  }
}
```

### 5.7 Risk Matrix

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Apple IAP policy blocks Stripe billing | High | Medium | Launch with web-only billing (Option 3) |
| SSE streaming unreliable on poor networks | Medium | Medium | Add timeout + retry logic, show partial results |
| Camera scanning quality issues | Medium | Low | Use `expo-camera` autofocus, add retake option, backend Tesseract handles OCR |
| Offline sync conflicts | Medium | Low | Last-write-wins for metadata, queue uploads with dedup |
| App Store review rejection | High | Low | Follow guidelines, test on real devices, no hot-patching |
| Large document files on mobile storage | Medium | Medium | Stream/cache selectively, offer "clear cache" option |

### 5.8 Monorepo Consideration

For sharing types and API logic between web and mobile, consider a **monorepo** structure later:

```
docuintelli/
├── packages/
│   ├── shared/          # Types, API helpers, plan limits
│   ├── web/             # Current React web app
│   └── mobile/          # React Native app
├── server/              # Express backend (unchanged)
└── supabase/            # Edge functions + migrations
```

This is **not required for v1** — copy the shared files into the mobile project first, then extract to a shared package when both codebases stabilize.

---

## Summary

| Metric | Value |
|--------|-------|
| **Framework** | React Native + Expo (managed) |
| **Code reuse from web** | ~60% (all API/hook/type logic) |
| **New mobile-specific code** | ~40% (UI components, native services) |
| **Phases** | 6 phases over ~20 weeks |
| **Backend changes** | Minimal (push tokens table, push sending, deep links) |
| **Key risk** | Apple IAP policy for subscriptions |
| **Build/deploy** | EAS Build → TestFlight + Play Store |
