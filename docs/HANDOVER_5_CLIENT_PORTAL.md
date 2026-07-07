# HANDOVER 5 — Client Portal: AI Hero, Sale Process, Payment Celebration

**Branch:** `claude/integration` (base for this work; PR not opened)
**Preview URL:** `https://new-marketingio-crm-git-claude-integration-thapelo-l.vercel.app`
**Session commits (top → bottom, HEAD first):**

```
162e72b fix(portal): surface PostgREST error details from client_self_purchase
25d000f feat(portal): self-serve checkout auto-issues invoice + loud coordinator alert
19f1169 feat(portal): client-side sale process — Buy button + checkout page
f7ebf11 feat(portal): payment-success dance modal for cleared invoices
10cac9f docs(generate-hero-image): note verify_jwt=false deploy requirement
a87ce1e fix: correct payment-image comment; wire welcome-image into post-sale flow
b61a514 feat(portal): generate-hero-image edge function + CORS on welcome-image
765a94e fix(portal): use deployed generate-welcome-image, drop redundant hero function
73f7713 feat(portal): single full-width photoreal hero + generate-hero-image edge function
7eec2c0 feat(portal): landing gallery wired to AI hero + payment images with old-CRM prompt library
8a8d373 feat(portal): landing image gallery replaces status cards
```

Nothing pushed to a new branch — all commits are on `claude/integration`.

---

## STATUS

Four bodies of work shipped, all on `claude/integration`:

1. ✅ **Landing hero** — status-card trio replaced by a single full-width photoreal hero pulled per-client per-day.
2. ✅ **Payment-success dance modal** — celebratory `dance.mp4` mascot lands the moment PayFast confirms a payment.
3. ✅ **Client-side sale process** — Products page has a proper Buy CTA that opens a dedicated checkout page.
4. ✅ **End-to-end auto-purchase** — Complete Purchase now creates a real deal + invoice, drops a HIGH-priority task, and pings the owner in real time via the existing 3-channel fan-out.

**One open bug** — the deployed self-purchase RPC returns `400 Bad Request` on the live preview. Root cause is one of the raise sites in the migration; the client-side toast now surfaces the exact PostgREST message + details + hint (commit `162e72b`), so the next test round returns actionable text. See §6.

---

## 1. Landing image gallery → single photoreal hero

**Before:** `Portal.jsx` rendered a 3-card row (Onboarding / Invoices / Deliverables) with three empty gradient placeholder boxes when the client had no cached image.

**Now:** one 21:9 (16:9 on mobile) glass card with a photoreal hero + aspirational tagline overlay.

### Files

| File | What it does |
|---|---|
| `src/pages/client/Portal.jsx` | `LandingHero` component. Invokes `generate-hero-image`, falls back to `welcome-images/hero/{client_id}.png`, shows a navy/rose gradient with tagline if no image yet. Removed unused imports (`Package`, `AlertTriangle`, `Zap`, `User`, `Check`, `GlowCard`) and the `onboardingHref` derivation. |
| `src/lib/heroPrompts.js` | Ported base44 CRM photoreal prompt library — 10 pools × 25 scenarios with paired `prompt` + `copy`. `pickHeroScenario({ businessName, hasPackage, missingAddons })` returns deterministic per-day scenario via FNV-1a on `businessName + day-bucket`. |
| `supabase/functions/generate-hero-image/index.ts` | Mirrors the deployed `generate-welcome-image` pipeline (same secrets, same `@cf/black-forest-labs/flux-1-schnell` model, same storage-write path) but uses the base44 photoreal prompt library. Caches to `welcome-images/hero/{client_id}.png`. Full CORS handled. |
| `supabase/functions/generate-welcome-image/index.ts` | Added CORS block (OPTIONS handler + `Access-Control-Allow-*` headers). |
| `supabase/functions/_shared/paymentSuccess.ts` | Corrected stale "Gemini 2.5 Flash Image" comment to reflect the actual Cloudflare Flux pipeline. |
| `supabase/functions/post-sale-orchestrator/index.ts` | Now calls `generate-welcome-image` up front with `{ client_id, business_name, industry }`; result `heroImageUrl` is threaded into the `onboarding_invite_recap` payload (that template already renders it — `src/emails/templates.ts:611`). Added `industry` to the `clients` select. Records the step as `{ step: 'generate_welcome_image', ok, url }` in the results array. Fails soft. |

### Deploy checklist

Both edge functions need `--no-verify-jwt` because the browser-side `functions.invoke()` triggers a CORS preflight that never carries `Authorization`, and Supabase's gateway 401s preflights on functions with the default `verify_jwt=true`.

```bash
supabase functions deploy generate-hero-image --no-verify-jwt
supabase functions deploy generate-welcome-image --no-verify-jwt
supabase functions deploy post-sale-orchestrator
```

Secrets already set (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_KEY`) — no new env vars.

### Verification path
- Open `/client` as a client user.
- DevTools → Network — you should see a POST to `.../functions/v1/generate-hero-image` return `{ ok:true, url, cached:false, pool:"…" }` on the first call, then `cached:true` on refresh.
- If preflight fails, redeploy with `--no-verify-jwt`.

---

## 2. Payment-success dance modal

**Trigger:** client lands back from PayFast on `/client/invoices/:id?paid=1` and `invoices.status === 'paid'`. Also opens on `?demo=1` for previewing without paying.

### Files

| File | What it does |
|---|---|
| `src/components/ui/PaymentSuccessModal.jsx` | Full-screen `bg-[#0B2143]/60 backdrop-blur-md` overlay + centered `bg-white/95` glass card. `<video>` (`autoPlay loop muted playsInline preload="auto"`) pulls `dance.mp4` from the public `Successful payment dance` bucket. `currentTime = 0` on every open. Escape + click-outside + X-in-corner all close. |
| `src/pages/client/Invoice.jsx` | Auto-opens the modal when `justPaid && isPaid` or `?demo=1`. Closing strips the query via `navigate(..., { replace: true })` so a refresh doesn't re-open it. |
| `src/index.css` | Added `animate-fade-in` keyframe (backdrop) alongside existing `animate-fade-in-up` (card). Both honour `prefers-reduced-motion`. |

### Video source
`https://yyrzppuntgtvurnnksfc.supabase.co/storage/v1/object/public/Successful%20payment%20dance/dance.mp4` — bucket must be Public. Confirmed via the Supabase Storage UI (bucket "Successful payment dance", contains `dance.mp4`).

### Verification path
Visit any invoice URL with `?demo=1` appended, e.g. `/client/invoices/<any-id>?demo=1` — the dance modal renders.

---

## 3 & 4. Client-side sale process → auto-invoicing checkout

**Before:** Products page had only "Enquire →" per card. The `?buy=code` shortcut from the Portal's TierShowcase opened the same soft-enquiry modal. There was no sale surface anywhere in the client portal.

**Now:**
- Each product card has **Buy** (red primary, `ShoppingBag` icon) + **Enquire** (outline secondary).
- Buy routes to a new **`/client/checkout/:code`** page with price breakdown, how-it-works, notes textarea, and a big Complete Purchase CTA.
- Complete Purchase calls **`client_self_purchase(code, name, notes)`** — a new RPC that atomically creates a deal, issues a setup-fee invoice, creates a high-priority task, and fires notify-owner-sale via `pg_net`. Client is then redirected to `/client/invoices/:id` where the existing PayFast flow takes over.

### New files

| File | Purpose |
|---|---|
| `src/pages/client/Checkout.jsx` | `/client/checkout/:code`. Product summary + feature list from `FULL_CATALOG`, price breakdown card, 4-step how-it-works, optional notes textarea, full-width red Complete Purchase CTA, `ShieldCheck` footer. Calls `client_self_purchase`, redirects to `/client/invoices/:id` on success. |
| `supabase/migrations/92_client_self_purchase.sql` | The RPC. See §5 for the full behavior contract. |

### Modified files

| File | Change |
|---|---|
| `src/App.jsx` | Registered `Route path="checkout/:code" element={<ClientCheckout/>}` under the client shell (RequireAuth + role guards). |
| `src/pages/client/ClientProducts.jsx` | Each card CTA is now two buttons: `Buy →` (routes to checkout) + `Enquire` (opens the modal). `?buy=code` shortcut from the Portal now navigates straight to `/client/checkout/:code` instead of auto-opening the modal. |
| `src/components/client/EnquiryModal.jsx` | Accept `mode="enquire"\|"buy"` prop. Buy variant pre-fills a purchase-intent message, swaps title to `Purchase Request`, uses `ShoppingBag` icon, appends `[Purchase intent — client clicked Buy…]` on the RPC message so the owner spots hot signals. Same RPC — no migrations. |

---

## 5. Migration 92 — `client_self_purchase` RPC (applied live)

**Signature:**
```sql
client_self_purchase(
  p_product_code text,
  p_product_name text default null,
  p_notes        text default null
) returns jsonb
```

**Returns:**
```json
{ "ok": true, "deal_id": "…", "invoice_id": "…", "invoice_number": "INV-…",
  "invoice_url_path": "/client/invoices/…", "is_upsell": true|false }
```

**Behavior contract:**
1. `SECURITY DEFINER`. Resolves `v_client_id` from `clients.client_user_id = auth.uid()` — a random authenticated user cannot buy on behalf of a different client.
2. Raises `not_authenticated` if `auth.uid()` is null, `not_a_client` if no matching client row.
3. Resolves the product from `system_settings.package_catalog` (core packages). Unknown codes fall through as `deal_type='add_on'` with `add_on_name = product_name || code` and zero pricing — the coordinator adjusts the invoice before payment.
4. Upsell detection: any `closed_won` deal for this client in the last 18 months → `is_upsell=true`, deal stage `proposal`; otherwise `is_upsell=false`, deal stage `new_lead`.
5. Idempotency: if a matching `draft/sent/issued` `setup_fee` invoice already exists from `source='client_portal_checkout'` in the last 5 minutes, returns that invoice instead of stacking duplicates.
6. Creates the deal with `source='client_portal_checkout'`, `brief='Self-serve purchase from client portal · <product>'`, and the client's notes on `notes`.
7. Issues the setup invoice at `status='sent'`, `due_date = current_date + 7`, `invoice_number = next_invoice_number()`.
8. Drops a HIGH-priority task assigned to the coordinator (`user_roles.is_coordinator=true`, fallback: caller). Task description includes the invoice number, product, deal id, an `/owner/invoices?focus=<id>` deep link, upsell-vs-first flag, and the client's notes.
9. Fires `pg_net.http_post` at `notify-owner-sale` with `event_type='upsell_added'` for upsells or `'sale_logged'` otherwise. Wrapped in `EXCEPTION WHEN OTHERS THEN NULL` so a slow/failing HTTP hop never blocks the purchase.
10. Grants: `REVOKE ALL FROM public, anon; GRANT EXECUTE TO authenticated`.

**What the owner sees the moment a client completes checkout:**
- Email to both `business.lekgoro@gmail.com` + `thapelom@marketingio.co.za` (via existing `owner_sale_alert` template).
- In-app bell notification for the owner via `client_notifications` insert (existing pipeline).
- HIGH-priority task in the coordinator's queue titled *"Self-serve purchase — {product} · {business_name}"*.

---

## 6. OPEN — self-purchase RPC returns 400 on live preview

**Symptom:**
```
POST https://yyrzppuntgtvurnnksfc.supabase.co/rest/v1/rpc/client_self_purchase 400 (Bad Request)
```

**Why we don't know the cause yet:** the DevTools console strips the response body, and the pre-fix toast only showed `err.message` (no `details`/`hint`).

**Fix landed:** commit `162e72b` — `submit()` in `Checkout.jsx` now `console.error`s the full error object and toasts `${message} — ${details} — ${hint}`. Next test round will show the exact reason.

**Most likely candidates given the RPC's raise sites and the schema:**
- `not_a_client` — user tested from an owner/staff session, or the client account they used doesn't have `clients.client_user_id` set.
- Trigger-computed NOT-NULL column failure. `deals` has ~10 triggers (`deals_audit`, `deals_pipeline_phase_trigger`, `trg_spawn_deliverables` etc.); one may require a field I didn't set.
- Check constraint on `invoices.status` or `invoices.invoice_type`.

**Action next session:**
1. Reproduce; read the response body from Network tab OR from the improved toast.
2. Patch either the RPC (migration `93_client_self_purchase_fix`) or the client-side field mapping.
3. Verify end-to-end: Buy → Complete Purchase → land on `/client/invoices/:id` → click Pay with PayFast → PayFast sandbox success → land back with `?paid=1` → dance modal.

---

## 7. Deploy runbook (everything in this handover)

```bash
# Frontend — Vercel picks up automatically on push. Already pushed to
# claude/integration; nothing to do besides verify preview.

# Edge functions — REQUIRED for browser-called ones
supabase functions deploy generate-hero-image      --no-verify-jwt
supabase functions deploy generate-welcome-image   --no-verify-jwt
supabase functions deploy post-sale-orchestrator

# Migrations
# 92 is already applied live in the session that shipped 25d000f
# (via mcp__Supabase__apply_migration). No action needed unless you
# reset the DB.

# Supabase Storage
# Confirm the `Successful payment dance` bucket is Public — needed for
# the payment-success modal video to play from the browser.
```

---

## 8. Constants + patterns established this session

- **Photoreal prompt library** — `src/lib/heroPrompts.js` client-side, mirrored in the edge function. Both source the same 10 pools + 25 scenarios from the base44 CRM. Keep them in sync manually.
- **CORS on browser-called Supabase edge functions** — deploy `--no-verify-jwt` AND include the `OPTIONS` handler + `Access-Control-Allow-*` headers. Every browser-called function in this repo follows this convention (`send-email`, `login-otp`, `captcha-photos`, `payfast-init`, `public-lead-submit`, `resolve-signing-token` …).
- **Self-serve purchase envelope** — deal + invoice + task + notify, all in one RPC, idempotent by (client, product, source, 5-min window). Do NOT clone this pattern for admin-issued invoices; those still go through the owner-side flow.

---

## 9. Not touched / out of scope

- The payfast-itn webhook — untouched. Existing behavior (flip invoice to paid → send payment_success email with generated hero) is intact and drives the dance modal via `?paid=1`.
- Owner-portal Tasks queue rendering — the new `source_action='client_self_purchase'` tasks land in the existing queue; no UI changes needed for them to appear, but a chip / filter would be nice quality-of-life.
- Emails — no template changes this session. `onboarding_invite_recap` already rendered `heroImageUrl`; we just started passing it.
