# DocuIntelli AI — Closed Beta Testing Page

## Design Specification for Designer & Engineer

**Page route:** `/beta`
**Access:** Public (no auth required) — shareable URL
**Target audience:** Friends & family invited to test DocuIntelli before public launch
**Environment:** Dev/staging (not production)

---

## 1. Page Structure & Layout

The page follows our existing design system: emerald/teal gradients, slate neutrals, rounded-xl cards, Tailwind CSS. It should feel warm and personal (this is friends & family), but still polished and professional.

### Sections (top to bottom):

1. **Beta Banner + Hero**
2. **What is DocuIntelli AI?**
3. **How to Get Started (Step-by-step)**
4. **Test Payment Info (Stripe test cards)**
5. **What to Test (Testing Checklist)**
6. **What We're Looking For (Feedback expectations)**
7. **Known Limitations**
8. **How to Give Feedback**
9. **Footer CTA**

---

## 2. Section-by-Section Design

---

### 2.1 Beta Banner + Hero

**Layout:** Full-width gradient banner at top + centered hero content below

**Banner:**
- Background: `bg-gradient-to-r from-amber-500 to-orange-500`
- Text: "CLOSED BETA" badge + "You've been invited!"
- Small lock icon to convey exclusivity

**Hero:**
- DocuIntelli AI logo (same as landing page — ShieldCheck in emerald gradient square)
- Heading: **"Welcome to the DocuIntelli AI Closed Beta"**
- Subheading: "You're one of a small group of people getting early access to DocuIntelli AI before we launch publicly. We built this for people like you — and we need your honest feedback to make it great."
- Style: Same hero typography as landing page (`text-4xl sm:text-5xl font-bold`)

---

### 2.2 What is DocuIntelli AI?

**Layout:** Centered text block with 3 feature cards below

**Intro text:**
> DocuIntelli AI is your intelligent document companion. It helps you store, understand, and manage all your important legal and financial documents — warranties, insurance policies, leases, employment contracts, and more — in one secure, AI-powered vault.

**3 highlight cards (grid, sm:grid-cols-3):**

| Card | Icon | Title | Description |
|------|------|-------|-------------|
| 1 | `FileText` (emerald) | Secure Document Vault | Upload PDFs, Word docs, images, and URLs. Everything encrypted and organized. |
| 2 | `MessageSquare` (teal) | AI-Powered Chat | Ask questions about your documents in plain English. "What's my deductible?" |
| 3 | `Bell` (amber) | Smart Reminders | Never miss an expiration date. Get alerts before warranties and policies lapse. |

Card style: Same as landing page feature cards — white bg, border-slate-200, rounded-2xl, hover shadow.

---

### 2.3 How to Get Started

**Layout:** Numbered step cards (vertical stack on mobile, 2-col on desktop)

**Heading:** "Getting Started in 3 Minutes"

| Step | Icon | Title | Details |
|------|------|-------|---------|
| 1 | `UserPlus` | Create Your Account | Click "Get Started" below to create a free account. You can sign up with your email or Google account. |
| 2 | `Upload` | Upload a Document | Try uploading a real document — a warranty, insurance card, lease, or any PDF/image you have handy. The AI will process it automatically. |
| 3 | `MessageSquare` | Chat With Your Document | Once processed, open the document and ask a question. Try: "Summarize this document" or "When does this expire?" |
| 4 | `CreditCard` | Test a Paid Plan (Optional) | Want to test Starter ($7/mo) or Pro ($19/mo) features? Use the test credit card info below — you will NOT be charged real money. |

**CTA Button:** "Get Started — Create Your Beta Account" → links to the app's signup (same as `onGetStarted` on landing page)

**Style for steps:**
- Each step has a large circled number (emerald gradient bg, white text)
- Card style: left-aligned, slight left border accent (`border-l-4 border-emerald-500`)

---

### 2.4 Test Payment Info (Stripe Test Cards)

**Layout:** Highlighted card with yellow/amber accent — must stand out clearly

**Heading:** "Test Credit Card — No Real Charges"

**Important callout box:**
- Background: `bg-amber-50 border border-amber-200 rounded-xl`
- Icon: `AlertTriangle` or `Info` (amber)
- Text: **"This is a test environment. No real money will be charged. Use the card details below to test paid plan features."**

**Card details (monospace, copyable):**

```
Card Number:    4242 4242 4242 4242
Expiration:     Any future date (e.g., 12/34)
CVC:            Any 3 digits (e.g., 123)
ZIP:            Any 5 digits (e.g., 12345)
```

**Additional test cards for specific scenarios:**

| Scenario | Card Number | Result |
|----------|-------------|--------|
| Successful payment | `4242 4242 4242 4242` | Payment succeeds |
| Card declined | `4000 0000 0000 0002` | Payment is declined |
| Requires authentication | `4000 0025 0000 3155` | 3D Secure popup appears |

**Copy button** next to the main card number (clipboard icon, toast on copy).

**Note below:** "After subscribing with a test card, you can test upgrading, downgrading, and canceling from the Billing page — all without any real charges."

---

### 2.5 What to Test (Testing Checklist)

**Layout:** Checklist cards organized by category

**Heading:** "What to Test"
**Subheading:** "Here's what we'd love for you to try. You don't need to test everything — even trying 2-3 things is incredibly helpful."

#### Core Features (Everyone)
- [ ] **Sign up** — Create an account with email or Google
- [ ] **Upload a document** — Try a PDF, Word doc, or image
- [ ] **Chat with a document** — Ask it a question after it's done processing
- [ ] **Set an expiration date** — Edit a document and add an expiration date
- [ ] **Search & filter** — Try searching by name, category, or tags
- [ ] **View on mobile** — Open the app on your phone and try navigating

#### Paid Features (Use test card)
- [ ] **Upgrade to Starter or Pro** — Use the test card above
- [ ] **Upload a URL** — Paste a web page URL to ingest (Starter+)
- [ ] **Check auto-generated tags** — Upload a doc and see if tags appear (Starter+)
- [ ] **Weekly Audit page** — View your document audit summary (Starter+)
- [ ] **Life Events planner** — Plan a life event and see readiness (Pro)
- [ ] **Document Health panel** — Check your dashboard health panel (Pro)
- [ ] **Downgrade/Cancel** — Try downgrading or canceling from Billing page

#### Billing & Account
- [ ] **View Billing page** — Check subscription details
- [ ] **Update profile** — Change display name or notification preferences
- [ ] **Account Settings** — Explore notification and email preferences

**Style:** Interactive checklist cards. Each category is a card with emerald header. Items have checkbox styling (but don't need to be functional — just visual).

---

### 2.6 What We're Looking For

**Layout:** 3 cards in a row (icons + text)

**Heading:** "Your Feedback Matters"
**Subheading:** "We're not looking for polished reviews. We want raw, honest reactions."

| Card | Icon | Title | Description |
|------|------|-------|-------------|
| 1 | `Bug` | Bugs & Broken Things | Did something crash? Did a button not work? Did the AI give a weird answer? Tell us exactly what happened. |
| 2 | `Lightbulb` | Confusing Moments | Was anything unclear? Did you get lost? Did you expect something to work differently? These "huh?" moments are gold. |
| 3 | `Heart` | What You Loved | What felt good? What was surprisingly useful? What would make you come back? Positive feedback helps us double down on what works. |

**Tone:** Casual, encouraging. We want testers to feel safe being critical.

---

### 2.7 Known Limitations

**Layout:** Simple list in a muted card

**Heading:** "Known Limitations (Beta)"
**Style:** `bg-slate-50 border border-slate-200 rounded-xl p-6`

- **Processing time** — Document processing (AI analysis, embeddings) may take 30-60 seconds. This will be faster at launch.
- **Mobile layout** — Some screens may not be fully optimized for small screens yet. We're working on it.
- **Email notifications** — Notification emails may land in spam. Check your spam folder or whitelist `noreply@docuintelli.com`.
- **Occasional AI hiccups** — The AI may occasionally give incomplete or slightly off answers. That's part of what we're testing.
- **Test environment** — Data in this environment may be reset periodically. Don't store anything critical here.

---

### 2.8 How to Give Feedback

**Layout:** Centered card with multiple feedback channels

**Heading:** "How to Share Your Feedback"

**Options:**

1. **Quick feedback form** (primary) — Link to a Google Form or Typeform (placeholder URL for now)
   - Button style: Primary emerald CTA

2. **WhatsApp** — "Text me directly at **+1 (737) 274-2791** — voice notes welcome too!"
   - Clickable WhatsApp link: `https://wa.me/17372742791?text=Hey%20Tunde!%20Beta%20feedback%3A%20`
   - Informal, personal touch for F&F beta

3. **Email** — Send detailed feedback to **tunde@docuintelli.com**

4. **Screenshot/Screen recording** — "If you can capture what went wrong, that's incredibly helpful. A screenshot or quick screen recording tells us more than words."

**Note:** "No feedback is too small. Even 'this color looks weird' or 'I don't understand what this button does' is useful."

---

### 2.9 Footer CTA

**Layout:** Full-width gradient section (emerald-to-teal)

**Content:**
- Heading: "Ready to explore?"
- Subheading: "Create your account and start testing DocuIntelli AI today."
- Primary button: "Get Started" → app signup
- Secondary text: "Thank you for helping us build something great."

---

## 3. Technical Implementation Notes

### Routing
- Add `'beta'` to the `Page` union type in `App.tsx`
- Add to `VALID_PAGES` array
- Route is public (no auth required), similar to landing/pricing/features pages
- Create `src/components/BetaPage.tsx`

### Component Structure
```
BetaPage.tsx
├── BetaBanner (amber gradient strip)
├── BetaHero (logo + welcome text)
├── ProductOverview (3 feature cards)
├── GettingStarted (4 numbered steps)
├── TestPaymentInfo (Stripe test card callout)
├── TestingChecklist (categorized checklist)
├── FeedbackExpectations (3 cards)
├── KnownLimitations (muted list)
├── FeedbackChannels (how to report)
└── FooterCTA (gradient CTA section)
```

### Props
```typescript
interface BetaPageProps {
  onGetStarted: () => void;  // Navigate to signup/auth
  onBack: () => void;        // Navigate back to landing
}
```

### Copy-to-Clipboard
- The test card number should have a "copy" button
- Use `navigator.clipboard.writeText()` with a small toast confirmation
- Toast style: matches existing Toast component

### No Auth Required
- This page should be accessible without login
- The "Get Started" CTA should open the AuthModal in signup mode

### Mobile Responsive
- All sections stack vertically on mobile
- Cards go full-width on small screens
- Step numbers should be visible and prominent

---

## 4. Content & Tone Guidelines

| Aspect | Guideline |
|--------|-----------|
| **Voice** | Warm, personal, slightly casual. This is friends & family, not a sales page. |
| **Gratitude** | Express genuine appreciation for their time. They're doing us a favor. |
| **Honesty** | Be upfront about limitations and what's not done yet. |
| **Encouragement** | Make it clear that all feedback is welcome, even negative. |
| **Clarity** | Instructions should be dead simple. Assume zero technical knowledge. |
| **No jargon** | Avoid "embeddings", "vectors", "RLS", "edge functions". Say "AI-powered" and "encrypted". |

---

## 5. Design Assets Needed

- [ ] Beta badge/ribbon graphic (amber/orange)
- [ ] Step number circles (1-4, emerald gradient)
- [ ] Checklist checkbox icons (empty + checked states)
- [ ] Feedback category icons (bug, lightbulb, heart)
- [ ] Copy-to-clipboard icon + toast animation
- [ ] Mobile-responsive mockups for each section

---

## 6. Launch Plan

### Pre-launch (before sharing URL)
1. Ensure dev environment is stable and seeded with sample data
2. Verify Stripe test mode is active (no real charges possible)
3. Test the full signup → upload → chat → upgrade flow end-to-end
4. Set up the feedback form (Google Form/Typeform)
5. Prepare a short personal message to send alongside the URL

### Distribution Message Template
> Hey [Name]! 👋
>
> I've been building something and I'd love your honest feedback. It's called DocuIntelli AI — think of it as a smart vault for all your important documents (warranties, insurance, leases, etc.) that you can actually chat with using AI.
>
> I'm doing a small closed beta with people I trust before launching publicly. Would you be up for trying it out? It takes about 5 minutes to get a feel for it.
>
> Here's the link: [DEV_URL]/beta
>
> Everything is in test mode, so no real payments or anything. The page has all the instructions you need.
>
> No pressure at all — but if you do try it, even 2 minutes of feedback would mean the world to me. 🙏

### Success Metrics
- **Activation rate:** % of invited people who create an account
- **Upload rate:** % of accounts that upload at least 1 document
- **Chat rate:** % of accounts that ask at least 1 AI question
- **Upgrade test rate:** % who try a paid plan with test card
- **Feedback rate:** % who submit any form of feedback
- **NPS-style question:** "How likely would you recommend this to a friend?" (in feedback form)

### Feedback Form Questions (for Google Form/Typeform)
1. What's your name? (so we can follow up)
2. On a scale of 1-10, how easy was it to get started?
3. What did you try? (checkboxes: signup, upload, chat, upgrade, etc.)
4. What worked well? (open text)
5. What was confusing or broken? (open text)
6. What feature would you most want if this existed? (open text)
7. Would you use this product regularly? (Yes / Maybe / No)
8. How likely are you to recommend this to someone? (1-10 scale)
9. Any other thoughts? (open text)

---

## 7. Timeline Estimate

| Task | Owner | Est. Time |
|------|-------|-----------|
| Visual mockup/wireframe | Designer | 1-2 days |
| BetaPage.tsx component build | Engineer | 1 day |
| Add route to App.tsx | Engineer | 15 min |
| Copy-to-clipboard utility | Engineer | 30 min |
| Feedback form setup | PM | 1 hour |
| End-to-end testing | QA/PM | 2-3 hours |
| Distribution message + send | PM | 1 hour |

---

*Document prepared by: Product & Marketing*
*Date: February 15, 2026*
*Status: Ready for designer and engineer review*
