# Marketing iO CRM Rebuild — Session 3 Handover

> Picks up after the `claude/integration` merge. The next session continues with
> **Lead Lifecycle Phase 1** — plan approved, ready to code on go-ahead.

---

## 1. Branch state

- **Active branch:** `claude/integration` (head `93b70d1`).
- **Deleted (local):** `claude/optimistic-heisenberg-2vkscw`. The remote delete
  returned 403 — the user needs to remove it from the GitHub UI. Nothing on
  `claude/integration` depends on it.
- **Vercel preview URL:**
  `https://new-marketingio-crm-git-claude-integration-thapelo-l.vercel.app`
- **Supabase project:** `yyrzppuntgtvurnnksfc` (eu-west-1, ACTIVE_HEALTHY).

### Recent commits on `claude/integration`

```
93b70d1 fix(auth): staff OTP login no longer redirects before OTP screen renders
a012964 fix(integration): APP_URL fallback → integration preview, NOT prod
0d71acd chore(integration): merge optimistic-heisenberg onto nice-bohr
8ca79c6 feat(notifications): bell + Inbox with realtime sound
3d3d420 feat(notifications): owner sale-event fan-out (email + in-app + bell)
e647c10 feat(payments): payfast-itn — real client logo wins over AI hero
99b14af feat(sales): full Log Sale form per spec — 6 steps, brief, discovery, custom deliverables, live commission preview
cbb6413 feat(commission): v2 spec locked + close_sale refactor + smoke test ✓
…
```

---

## 2. What's live

### Database (migrations applied)

```
01..09  foundation, system_settings, business entities, close_sale,
        owner_dashboard, grant_owner, signup_flow, login_otps,
        seed_playbooks
10..12  close_sale hardening + idempotency, commission_rates_v2,
        log_sale_form_additions
13      preview_commission RPC + close_sale extension
14      onboarding_invite_recap trigger
15      client_provisioning
16      post_sale_orchestrator
17      spec3_portal_pages (+ ambiguous_k fix)
18      payment_images_bucket
19      owner_sale_alerts
20      notifications_realtime
21      welcome_images_bucket    ← ours
22      lead_actions (convert_lead_to_deal RPC)   ← ours
```

**Next migration number = `23_lead_phase1.sql`.**

### Edge Functions deployed

| Slug | Notes |
|---|---|
| `send-email` v21 | Branded dispatcher. Accepts `heroImageUrl` in payloads. |
| `login-otp` v13 | Staff 6-digit code, 10-min expiry. |
| `captcha-photos` v13 | GET-only Pexels proxy (image grid). Will be extended for Phase 1 (HMAC `/issue` + `/verify`). |
| `generate-welcome-image` v12 | Gemini 2.5 Flash Image → welcome-images bucket. Cached per client. |
| `provision-client` v12, `import-brand-asset` v13, `import-from-github-repo` v12 | Client portal scaffolding. |
| `post-sale-orchestrator` v13 | Fires 4 emails on `deals.stage='closed_won'` (login link, onboarding recap, contract, invoice). |
| `resolve-signing-token` v12, `sign-contract` v13 | Public contract signing. |
| `payfast-init` v16, `payfast-itn` v11 | **LANE-LOCKED — do not touch.** |
| `send-client-login-link` v3 | Magic-link for client portal. |
| `pf-test-e2e`, `pf-test-itn` | Payment test harnesses. |
| `generate-payment-image` v1 | Per-package payment-success hero image. |
| `notify-owner-sale` v1 | Fans out on `deals.stage='closed_won'` (email + `client_notifications`). |

### Frontend pages live on `claude/integration`

- Auth: `Login.jsx` (client magic-link tab + staff password→OTP→image captcha; fixed in `93b70d1`), `SignUp.jsx`, `Legal.jsx`.
- Owner shell + 50-surface sidebar (`OwnerShell.jsx`).
- Real owner pages: `Dashboard`, `Playbooks`, `Inbox` (notification bell list), `sales/log` (6-step Log Sale), `sales` (kanban), `sales/leads` (inbox).
- Client portal: `Welcome`, `Onboarding`, `Invoice`, `client` placeholder.
- Public: `sign/:signing_token`.
- Components: `NotificationBell` wired to `client_notifications` realtime.

### RequireRole gate
- `/owner` gated by `RequireRole allowed={['owner','admin']}`.
- Implementation lives in `src/App.jsx`, with `roleLoaded` flag from `src/lib/auth.jsx`.
- A second flag, `staffFlowActiveRef`, prevents the staff OTP flow's
  sign-in/sign-out dance from triggering the auto-redirect (the `93b70d1` fix).

---

## 3. APP_URL configuration (critical)

`app.marketingio.co.za` **still serves the legacy Base44 CRM** until cutover.
Pointing the fallback there would break magic links, contract signing,
post-sale emails, and PayFast return URLs.

All 7 Edge Functions + `_shared/email.ts` + `src/emails/layout.ts` now read
`APP_URL` from env, falling back to the integration preview URL:

```
https://new-marketingio-crm-git-claude-integration-thapelo-l.vercel.app
```

Set the actual URL via:
- **Supabase secret** `APP_URL` (used by Edge Functions).
- **Vercel env var** `VITE_APP_URL` (used by client-side previews).

Both should currently point at the integration preview. **Do not change to
`app.marketingio.co.za` until cutover.**

---

## 4. NEXT SESSION'S TASK — Lead Lifecycle Phase 1

The full plan was approved in session 3. It's queued and ready to code on
"go" from the user.

### Scope summary

Adds 14 columns + 1 source enum value + 1 table + 1 bucket + 3 system_settings
seeds in **migration `23_lead_phase1.sql`**, plus 2 new Edge Functions
(`public-lead-submit`, `notify-hot-lead`), extends `captcha-photos` (HMAC
issue/verify), extends `send-email` (3 new templates), and adds 2 frontend
pages (`/owner/leads/new`, `/refer/:token`).

### Already approved decisions (locked)

- **A.** Reuse `client_notifications` (no new notifications table).
- **B.** Re-ping on re-qualification, **debounced per-lead at 60 min** (suppression check inside `notify-hot-lead`).
- **C.** Extend existing `captcha-photos` with HMAC `/issue` + `/verify` (don't fork).
- **D.** Defer the token-issuing admin UI; owner inserts first `lead_link_tokens` row by SQL.
- **E.** `CAPTCHA_SIGNING_KEY` Supabase secret set at deploy time.
- 7 warm-criteria + 5 business-question schemas seeded as **TBD placeholders** in `system_settings`; owner SQL-UPDATEs when locked. No code change needed when they do.
- Investigation overrides the spec where they conflict: no NotificationCenter to inherit; `notify-hot-lead` is greenfield (not a "mirror" of an existing pattern).

### Plan recap (write code in this order)

1. **Migration `23_lead_phase1.sql`** — all schema/data changes in one file:
   - `ALTER TABLE leads DROP CONSTRAINT leads_source_check; … ADD … 'external_marketer'`.
   - `ALTER TABLE leads ADD COLUMN IF NOT EXISTS …` × 14:
     - `lead_temperature text CHECK (IN 'cold','warm','hot')`
     - `interest_package text`
     - `keenness text CHECK (IN 'ready_now','this_month','exploring')`
     - `best_time text CHECK (IN 'morning','afternoon','evening')`
     - `preferred_channel text CHECK (IN 'call','whatsapp','sms','email')`
     - `qualification_answers jsonb`
     - `shopfront_photo_url text`
     - `captured_via text NOT NULL DEFAULT 'staff_app' CHECK (IN 'staff_app','public_link','website')`
     - `referrer_name text`
     - `referrer_contact text`
     - `assigned_to uuid REFERENCES public.profiles(id)`
     - `assigned_at timestamptz`
     - `outreach_attempts int NOT NULL DEFAULT 0`
     - `do_not_contact boolean NOT NULL DEFAULT false`
   - Indexes: `leads_assigned_idx`, `leads_temp_hot_idx` (partial), `leads_dnc_idx`, `leads_phone_dnc_idx`, `leads_email_dnc_idx`.
   - `CREATE TABLE lead_link_tokens (token PK, label, created_by, created_at, revoked_at, uses)` + RLS owner/admin-only.
   - `INSERT INTO storage.buckets ('lead-photos', public=true)` + public read policy + staff write policy.
   - `INSERT INTO system_settings` × 3:
     - `lead.warm_criteria.v1` (7 TBD criteria)
     - `lead.qualification_questions.v1` (5 TBD questions)
     - `hot_lead_alert_recipients` = `['business.lekgoro@gmail.com','thapelom@marketingio.co.za']`
   - `CREATE FUNCTION fire_hot_lead_alert()` + trigger `AFTER INSERT OR UPDATE OF lead_temperature ON leads`.
   - `CREATE FUNCTION enforce_do_not_contact()` + `BEFORE INSERT` trigger that raises `do_not_contact_violation` (errcode `42501`) if a row with matching phone/email + `do_not_contact=true` already exists.

2. **Extend `captcha-photos`** (deploy v14):
   - `POST /issue` — returns `{ challenge_id, expected_label, options:[urls], expires_at, challenge_sig }`. Sign with HMAC-SHA256 using `CAPTCHA_SIGNING_KEY`.
   - `POST /verify` — recomputes HMAC, checks expiry + picked URL against the pool. Returns `{ ok:true, verify_token }` (HMAC of `challenge_id|now` valid 5 min).

3. **New Edge Function `public-lead-submit`** (verify_jwt=false):
   - POST `{ token, verify_token, payload }`.
   - Validate `lead_link_tokens` row (live, `revoked_at IS NULL`).
   - HMAC-check `verify_token`.
   - Check do-not-contact server-side (same predicate as the trigger).
   - INSERT into `leads` with `captured_via='public_link'`, `source='external_marketer'`, `status='pending_verification'`, referrer fields populated.
   - Bump `lead_link_tokens.uses`.

4. **New Edge Function `notify-hot-lead`** (verify_jwt=false, called by trigger via pg_net):
   - POST `{ lead_id }`.
   - Look up the lead. Read `hot_lead_alert_recipients` from `system_settings`.
   - **60-min debounce**: `SELECT 1 FROM client_notifications WHERE related_entity_id = lead_id AND notification_type='hot_lead' AND created_at > now() - interval '1 hour'` — if hit, log `audit_log` breadcrumb, skip fanout.
   - Otherwise, in three independent try/catches:
     - Insert `client_notifications` rows for every owner+admin user.
     - Send `send-email` template `hot_lead_alert` to the recipients.
     - (CPC channel deferred — pure in-app notification for the CPC if `lead.submitted_by` is a CPC user; flag for follow-up.)

5. **Extend `send-email`** with 3 templates:
   - `hot_lead_alert(p: { businessName, capturer, phone, interest, leadUrl })`.
   - `lead_assigned(p: { businessName, assignedByName, leadUrl })`.
   - `lead_clarification(p: { submitterName, businessName, clarificationNote, leadUrl })`.

6. **Frontend page `/owner/leads/new`** (`src/pages/owner/leads/NewLead.jsx`):
   - Route in `src/App.jsx`, wrapped in `RequireRole allowed={['owner','admin','field_agent','cpc']}` (broader allowed list than the dashboard).
   - Mobile-first form, pill pickers for temperature / interest_package / keenness / best_time / preferred_channel.
   - Reads `system_settings.lead.qualification_questions.v1` to render the 5 questions dynamically.
   - Optional photo upload → `lead-photos` bucket → URL saved to `shopfront_photo_url`.
   - Client-side do-not-contact pre-check (server still enforces).
   - Submits via narrow `INSERT INTO leads` with whitelisted columns.

7. **Frontend page `/refer/:token`** (`src/pages/refer/PublicLeadSubmit.jsx`):
   - Route in `src/App.jsx`, outside any auth wrapper.
   - Captcha challenge from `captcha-photos /issue`, user solves, calls `/verify` → `verify_token`.
   - POPIA consent checkbox required.
   - Captures referrer name/contact + lead fields.
   - Submits to `public-lead-submit`.

8. **Extend `submit_signup` RPC** for the website self-signup route (Phase-1 spec line 55–58):
   - If signup completes without a package selected, also insert a row into `leads` with `captured_via='website'`, `source='inbound'`, `business_name` from signup, `submitted_by=NULL`, `status='pending_verification'`.

### Open questions from session 3 (need answers before code)

1. **Capture page mount path** — `/owner/leads/new` vs `/leads/new`?
   - **Recommended:** `/owner/leads/new` (in the owner shell, role-permissive `RequireRole`).
2. **Sidebar wording** — "Capture lead", "Add lead", "New lead"?
3. **Website self-signup → lead row** — business_name from signup, contact_person from full_name? **Recommended yes.**
4. **`do_not_contact` BEFORE INSERT trigger behavior** — RAISE EXCEPTION (hard block) or write the row anyway? **Recommended RAISE EXCEPTION** with errcode `do_not_contact_violation`.
5. **Shopfront photo upload cap** — 5 MB image/* only? **Recommended yes.**
6. **Token format for `lead_link_tokens.token`** — 48-char hex via `encode(gen_random_bytes(24),'hex')`? **Recommended yes.**

### Smoke-test mapping (Phase-1 spec lines 96–102)

| Spec item | How it's verified |
|---|---|
| 1. Field agent captures HOT → inbox shows urgent + business answers | UI: `lead_temperature='hot'` sets `urgency='urgent'`; trigger fires → bell ping + email |
| 2. WARM/COLD → no hot ping | Trigger's `IS DISTINCT FROM 'hot'` early-return |
| 3. Public submit → pending + referrer recorded | `public-lead-submit` inserts with `captured_via='public_link'` + `referrer_*` |
| 4. Empty/failed captcha → rejected | `captcha-photos /verify` returns 400 → `public-lead-submit` returns structured error |
| 5. CPC capture attributed | `submitted_by=auth.uid()`, `submitted_by_name` from profile |
| (6 implicit) do-not-contact path | INSERT raises `do_not_contact_violation` when a DNC contact is re-added |
| (7 implicit) 60-min debounce | Two hot updates within an hour → only one fan-out, second logs a breadcrumb |

### Secrets to set before deploy

- `CAPTCHA_SIGNING_KEY` — Supabase secret. Any 32 random bytes (`openssl rand -hex 32`).
- `APP_URL` — Supabase secret, set to the integration preview URL (already
  documented in §3 above; verify it's set before the new Edge Functions go
  live).

---

## 5. Carry-over rules (still in force)

1. **No constants in code** — package prices, commission rates, brand assets,
   signatories all live in `public.system_settings`.
2. **No silent catches.** Three allowed patterns: re-throw / log+surface / log+audit_log.
3. **Multi-table writes go through SECURITY DEFINER RPCs.** Never `INSERT`+
   `UPDATE` from the browser (LB-281 / orphan rows).
4. **owner → founder mapping** when writing `commissions.staff_role`.
5. **Mirror Base44 field names** in snake_case.
6. **Audit log on every business table** via `audit_trigger()`.
7. **Server-filtered + paginated queries** for any list view (LB-215). No
   load-all-then-filter.
8. **Email layouts come from a single source** (Cloudinary header + footer
   image; constants in `supabase/functions/_shared/email.ts` +
   `src/emails/layout.ts`).
9. **Server-side API keys live in Supabase secrets**, not the bundle.
10. **50-surface sidebar is the contract.** Replace `Placeholder` with the
    real component as each slice ships.
11. **Don't touch payfast files** unless the change is explicitly cleared by
    the user.
12. **APP_URL fallback = integration preview URL**, NOT `app.marketingio.co.za`.
    Cutover is a separate event.

---

## 6. Bug ledger (do not reintroduce)

- **LB-115** Receipts.jsx writes invalid invoice_type values + 3 phantom Invoice fields.
- **LB-116** StaffVerifyLeads.jsx wrote 3 phantom Lead fields. Phase-1 lesson: business answers go in ONE `qualification_answers` jsonb, not invented per-question columns.
- **LB-118** Client missing fields code expected. Phase 1 migration explicitly adds every column it uses.
- **LB-180** Closer ID lookup duality (User vs AppUser). Avoided by single `profiles` table.
- **LB-215** Client-side load-all-then-filter on Lead lists. Phase-1 lists must be server-filtered + paginated.
- **LB-281** Browser-side multi-table writes. Use SECURITY DEFINER RPCs.
- **PR #130** `autoCreateDeliverables` silently dropped. Verify deliverables_created > 0 in `close_sale` response.
- **PR #131** `notifyClient` in-app push dropped. `client_notifications` rows must accompany invoice creation.
- **PR #132** Owner closer commissions silently failed (enum mismatch). owner → founder mapping in `commissions.staff_role`.
- **PR #133** 500s with empty body. Structured exception messages surfaced verbatim in toasts.
- **Login race (this session)** Auto-redirect effect raced with the staff OTP sign-in/sign-out dance. Fixed via `staffFlowActiveRef`.

---

## 7. State outside the repo

- **Supabase secrets that should be set:** `RESEND_API_KEY`,
  `PEXELS_API_KEY`, `GOOGLE_AI_STUDIO_API_KEYS`, `APP_URL` (= integration
  preview). **`CAPTCHA_SIGNING_KEY` needs to be set before Phase 1 deploys.**
- **Vercel env:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (committed in
  `.env.production`), plus `VITE_APP_URL` (= integration preview).
- **Resend:** domain `marketingio.co.za` verified, from address
  `Marketing iO <hello@marketingio.co.za>`.
- **Cloudinary:** cloud `didwjb1et`, email header/footer image.
- **Identity:**
  - Primary owner: `business.lekgoro@gmail.com` (id
    `4f1bccdd-be68-420f-9b7c-233fefaf52c2`). Only `owner`-role account.
  - Director (legal docs): Thapelo Maupa.
  - Witness (MSA): Riana du Plessis.

---

## 8. Opening prompt for the next session

> Continuing the Marketing iO CRM rebuild on `claude/integration`. Read
> `docs/HANDOVER_3.md` for full context. The Lead Lifecycle Phase 1 plan
> is already written and approved as a plan — your job is to answer the
> 6 open questions in §4, then code in the listed order. Lane: don't
> touch payfast files. Migration number = 23. APP_URL stays on the
> integration preview URL until go-live (do NOT default to
> app.marketingio.co.za — that still serves the legacy Base44 CRM).

---

## End

Login fix shipped, integration smoke passed, optimistic branch local-deleted
(remote 403 — user to clean up via GitHub UI), seed data torn down. Phase 1
is the next ship.
