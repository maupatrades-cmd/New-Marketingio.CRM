# Marketing iO CRM Rebuild — Session 2 Handover

> **Read this first** before doing anything. It captures the full state
> of the Marketing iO CRM after the second build session. The previous
> session's handover lives at the project root upload area as the
> original `HANDOVER.md` — read that for the *original* context. This
> doc supersedes it for what's currently live.

---

## 1. Who & what

- **Owner:** Lekgoro Maupa — Marketing iO (`marketingio.co.za`), a B2B
  marketing agency in Polokwane / Limpopo.
- **Director on legal docs:** Thapelo Maupa.
- **Witness on MSA:** Riana du Plessis ("Co-Founder / CFO").
- **Primary signin email:** `business.lekgoro@gmail.com`. Already
  granted **owner** role (`public.user_roles`, granted at
  `2026-06-16 17:40:42 UTC`).
- **Stack (confirmed live):**
  - **Frontend:** Vite + React 18 + Tailwind 3 + react-router-dom +
    TanStack Query + Recharts + Sonner + lottie-react +
    lucide-react.
  - **Backend:** Supabase Postgres 17 + Auth + RLS + Edge Functions
    (Deno).
  - **Email:** Resend, domain `marketingio.co.za` verified.
  - **Photos / CDN:** Cloudinary (`didwjb1et`) for email header/footer
    image; Pexels for the captcha photo proxy.
  - **Deploy:** Vercel from branch `claude/nice-bohr-rtmziz`. Auto-
    deploys on every push.

---

## 2. What was shipped this session

Everything below is **live in production**.

### 2.1 Database — 9 migrations applied to `yyrzppuntgtvurnnksfc`

| # | File | What it ships |
|---|---|---|
| 01 | `01_foundation.sql` | `app_role` enum (7 roles), `profiles`, `user_roles`, `has_role()`, `current_user_role()`, `audit_log` + generic `audit_trigger()`, `handle_new_user` signup hook, `touch_updated_at()` helper. |
| 02 | `02_system_settings.sql` | 9 seeded keys: commission_rates, package_catalog, brand_assets, legal_signatories, payroll_schedule, roles_allowed_to_close, owner_to_founder_mapping, payfast_config, feature_flags. |
| 03 | `03_business_entities.sql` | 13 business tables + RLS + audit triggers + 5 fulfilment templates (Ignite, Accelerate, Dominate, Street Pulse, Township Pulse). |
| 04 | `04_close_sale_rpc.sql` | `close_sale(payload jsonb)` SECURITY DEFINER — single-transaction sales orchestrator. 13-step flow per HANDOVER §10 of the original. |
| 05 | `05_owner_dashboard_rpc.sql` | `get_owner_dashboard()` aggregator — KPIs, 6-month revenue, pipeline by stage, recent deals, open tasks, team KPIs this month. |
| 06 | `06_grant_owner.sql` | Held SQL for granting owner role. **Already executed.** |
| 07 | `07_signup_flow.sql` | `clients` extensions (mobile_number, signup_data jsonb, popia_consent_given/at, signup_completed_steps) + `submit_signup(payload jsonb)` RPC. |
| 08 | `08_login_otps.sql` | `login_otps` table (SHA-256 hashed codes, attempts cap) + RLS lock (no client reads, service-role writes only). |
| 09 | `09_seed_playbooks.sql` | 12 playbooks (5 cold-call steps, 5 objection handlers, 1 closing framework, 1 discovery checklist). |

### 2.2 Edge Functions — 3 deployed to `yyrzppuntgtvurnnksfc`

| Slug | Purpose | Status |
|---|---|---|
| `send-email` | Generic dispatcher. POST `{ template, to, payload }`. 9 template keys (test, forgot_password, welcome, invoice_issued, invoice_chase, payment_receipt, contract_for_signature, contract_signed, signup_otp, generic). `verify_jwt=false`. | ✅ smoke-tested to both `maupatrades@gmail.com` and `business.lekgoro@gmail.com` via Resend. |
| `login-otp` | POST `{ action: 'send'\|'verify', email, code? }`. SHA-256 hashed codes, 10-min expiry, 5-attempt lockout, 20-sec resend cooldown. `verify_jwt=false`. | ✅ wired into Login.jsx stage 2. |
| `captcha-photos` | GET `?queries=cat,dog,car&per=4`. Proxies Pexels with the server-held API key. 15-min in-memory cache. `verify_jwt=false`. | ✅ wired into ImageCaptcha.jsx. |

### 2.3 Frontend (Vite + React)

- **Login** (`src/pages/Login.jsx`): 3-stage auth flow — credentials +
  math captcha → email OTP (6-digit, 10-min) → Pexels image captcha →
  `/owner`. Mascot rolls in from the left and sits in front of a
  frosted-glass card.
- **SignUp** (`src/pages/SignUp.jsx`): 5-step wizard ported from old
  Base44 Register.jsx. Final submit creates the auth user and calls
  `submit_signup` RPC atomically.
- **Legal** (`src/pages/Legal.jsx`): POPIA-aware Terms + Privacy
  pages, linked from both auth screens.
- **Owner Shell** (`src/components/OwnerShell.jsx`): **50-surface
  sidebar in 12 groups** (Overview, Sales, Money, Contracts,
  Fulfilment, Team, Marketing, Activity, Communication, Calendar,
  Settings). Brand block pinned top, scrollable nav, profile chip
  pinned bottom.
- **Owner Dashboard** (`src/pages/owner/Dashboard.jsx`): 8 KPI cards,
  6-month revenue line chart (setup + MRR), pipeline bar chart,
  open-tasks + team-KPIs lists. Backed by `get_owner_dashboard()`.
- **Playbooks** (`src/pages/owner/Playbooks.jsx`): Full CRUD for
  owners (Add / Edit / Delete), search, 8-category pills with live
  counts, localStorage favorites, copy-to-clipboard, rich-text body
  rendering. Renders the 12 seeded playbooks.
- **Mascot** (`src/components/Mascot.jsx`): SVG mascot ported from
  the previous CRM with idle/wave/turn animation phases, blinking,
  antenna pulse, social-tile gloves.
- **ImageCaptcha** (`src/components/ImageCaptcha.jsx`): 3×3 grid of
  real Pexels photos via the proxy Edge Function. 11 challenges
  including meta-categories ("animals", "vehicles").
- **Emails** (`src/emails/*`): 34 typed templates ported from the
  Base44 codebase, all wrapped with the Cloudinary header + footer
  image. Mirrored as a Deno helper in
  `supabase/functions/_shared/email.ts`.

### 2.4 Operational state

- **GitHub:** Repo `maupatrades-cmd/New-Marketingio.CRM`, branch
  `claude/nice-bohr-rtmziz`, head commit `62b7db3`.
- **Vercel:** Auto-deploy from `claude/nice-bohr-rtmziz`. URL
  `https://new-marketingio-crm-git-claude-nice-bohr-rtmziz-thapelo-l.vercel.app/`.
  Env vars `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are in
  `.env.production` (committed, safe because anon key is public).
- **Resend:** Domain `marketingio.co.za` verified (Ireland region).
  `RESEND_API_KEY` set as Supabase secret. From-address:
  `hello@marketingio.co.za`.
- **Cloudinary:** Cloud `didwjb1et`. Email header/footer image:
  `https://res.cloudinary.com/didwjb1et/image/upload/v1781625284/marketingio_footer_clean_1_ykjdzr.png`.
- **Pexels:** API key set as Supabase secret. `captcha-photos` Edge
  Function proxies it server-side.

---

## 3. Current state — what's done, what's pending

### ✅ Done

- Foundation phase 100% complete (handover §4/§8 of session 1 are all
  ticked).
- Owner-side auth, dashboard, and Playbooks page live with real data.
- Email pipeline + image-captcha pipeline live end-to-end.
- 50-surface sidebar live; Dashboard + Playbooks are real, the other
  48 are Placeholders waiting for their slice.
- 34 email templates ready to fire via `send-email` Edge Function.
- Slice-2 porting playbook + 14-task block written to
  `docs/SLICE_2_PORTING.md`.

### ⏳ Pending — slice 2 (sales engine)

Open `docs/SLICE_2_PORTING.md` and start at §10 (the paste-able task
block). 14 numbered tasks, one PR per item. Order:

1. **Log Sale form** → `close_sale()` RPC
2. **Commissions preview** helper + live panel
3. **Sales Opportunities** kanban
4. **Leads** table + "convert to deal"
5. **Deals** list + My Sales (filtered view of same)
6. **Upsell** and **Log Sale on Behalf** deferred to slice 2b

### 🚫 Known gotchas

- **Vite env vars are baked at build time** — never store secrets in
  `VITE_*`. Supabase anon key is fine (public by design).
- **Resend free tier**: works because the domain is verified. Without
  domain verification it only sends to the Resend account-owner's
  email (`maupatrades@gmail.com`). Remember if rotating keys.
- **Pexels API key** is hard-coded into the deployed `captcha-photos`
  Edge Function as a fallback. To rotate: set `PEXELS_API_KEY` as a
  Supabase secret (it takes precedence) OR redeploy the function with
  the new fallback.
- **Migration history**: 9 migrations, but only the SQL files in
  `supabase/migrations/` are sources of truth. If you re-apply from
  scratch, run them in order 01 → 09.

---

## 4. Architectural rules (live + new)

Carry-overs from session 1 are still in force:

1. **No constants inlined in code** — everything tunable in
   `public.system_settings`.
2. **No silent catches** — `catch (_) {}` is banned. Three allowed
   patterns documented in `SLICE_2_PORTING.md §4`.
3. **Multi-table writes go through SECURITY DEFINER plpgsql RPCs**
   (e.g. `close_sale()`, `submit_signup()`).
4. **Owner → founder mapping** when writing `commissions.staff_role`
   (the enum has no `'owner'`).
5. **Mirror Base44 field names** in snake_case for future Base44
   import compatibility.
6. **Audit log on every business table** via `audit_trigger()`.

**New rules learned this session:**

7. **All email layouts come from a single source.** The Cloudinary
   header + footer image is one constant in two places:
   `src/emails/layout.ts` (client preview) and
   `supabase/functions/_shared/email.ts` (server). Swap there to
   rebrand.
8. **Server-side API keys live in Supabase secrets, not the JS
   bundle.** RESEND_API_KEY and PEXELS_API_KEY are set via the
   Supabase dashboard. The Edge Functions read them via
   `Deno.env.get(...)`.
9. **The 50-surface sidebar is the contract.** When you ship a new
   page in any slice, replace the `Placeholder` route in `App.jsx`
   with the real component. The sidebar entry is already there.

---

## 5. Build phase plan

From `docs/SLICE_2_PORTING.md` + the 50-surface sidebar:

| Slice | Group(s) flipped live | Status |
|---|---|---|
| 1 | Login, Owner Shell, Dashboard, Playbooks | ✅ done |
| **2** | **Sales** (6 surfaces) | **next — TodoList in SLICE_2_PORTING §10** |
| 3 | Money (7 surfaces) | pending |
| 4 | Contracts (2 surfaces) + MSA generation | pending |
| 5 | Fulfilment (5 surfaces) + Onboarding Forms | pending |
| 6 | Team (5 remaining surfaces) | pending |
| 7 | Marketing (5 surfaces) | pending |
| 8 | Activity drilldowns (6 surfaces) | pending |
| 9 | Communication (2 surfaces) | pending |
| 10 | Settings + Reports (2 surfaces) | pending |
| 11 | AI layer (mascot chatbot, lead scorer, proposal drafter) | future |
| 12 | Mobile staff app (Expo) | future |
| 13 | Integrations (WhatsApp 360dialog, SMS Africa's Talking, Customer.io, Cal.com) | future |
| 14 | Payments expansion (Stripe, Ozow, Stitch) | future |

---

## 6. Connection details

### Supabase
- **Project ID:** `yyrzppuntgtvurnnksfc`
- **Account:** `business.lekgoro@gmail.com`
- **Region:** eu-west-1
- **Status:** ACTIVE_HEALTHY
- **API URL:** `https://yyrzppuntgtvurnnksfc.supabase.co`
- **Dashboard:** `https://supabase.com/dashboard/project/yyrzppuntgtvurnnksfc`
- **Secrets set:** `RESEND_API_KEY`, `PEXELS_API_KEY`
- **Extensions enabled:** `pgcrypto`, `pg_net`

### GitHub
- **Repo:** `https://github.com/maupatrades-cmd/New-Marketingio.CRM`
- **Branch:** `claude/nice-bohr-rtmziz`
- **Head commit:** `62b7db3`

### Vercel
- **Project:** `new-marketingio-crm`
- **Branch URL:**
  `https://new-marketingio-crm-git-claude-nice-bohr-rtmziz-thapelo-l.vercel.app/`
- **Env vars** are baked from `.env.production` in the repo (anon key
  + URL only — both public).

### Resend
- **Account:** `maupatrades@gmail.com`
- **Verified domain:** `marketingio.co.za` (Ireland eu-west-1)
- **From-address:** `Marketing iO <hello@marketingio.co.za>`

### Pexels
- **Account:** `maupatrades@gmail.com`
- Key is server-side only via Supabase secret +
  `captcha-photos` Edge Function fallback.

### Cloudinary
- **Cloud:** `didwjb1et`
- **Email header/footer image:**
  `https://res.cloudinary.com/didwjb1et/image/upload/v1781625284/marketingio_footer_clean_1_ykjdzr.png`

### Identity
- **Primary signin:** `business.lekgoro@gmail.com` (owner role granted)
- **Director name (legal docs):** Thapelo Maupa
- **Witness (MSA):** Riana du Plessis — "Co-Founder / CFO"

---

## 7. Immediate next actions for the new chat

1. **Read this file** (`docs/HANDOVER.md`).
2. **Read** `docs/SLICE_2_PORTING.md` end-to-end — especially §3 (6
   bugs to not reintroduce), §5 (close_sale payload shape), §6 (10-row
   test matrix), §10 (paste-able task block).
3. **Grep the old code at** `/tmp/marketingio-extract/marketing-io-crm-main/`
   *before* writing anything. The 9 files listed in §2 of the porting
   playbook are the canonical sources.
4. **Build a TodoList from §10** of the porting playbook. Work
   top-to-bottom, one PR per item. After each task: commit, push,
   verify on Vercel.
5. **Start with task 2** of §10 — the **Log Sale form** at
   `src/pages/owner/sales/LogSale.jsx` calling
   `supabase.rpc('close_sale', { payload })`. Task 1 (50-surface
   sidebar) is already done.
6. **After slice 2 ships**, ask in chat for a similar paste-able task
   block for **slice 3 — Money**.

---

## 8. Things the new chat should know

- **The user prefers terse, action-oriented messages.** Direct
  feedback, copy-paste-ready instructions, no fluff. South African
  context — Polokwane, Limpopo, ZAR pricing, POPIA compliance,
  PayFast for cards, debit orders for retainers.
- **The branch `claude/nice-bohr-rtmziz` is the active branch.** Do
  not merge to main without explicit permission.
- **Vercel deploy is automatic** on push to the branch. Wait 60-90
  seconds, hard-refresh the browser cache to pick up new bundles.
- **`/owner` is owner-gated.** The user already has owner role; new
  test accounts will need it granted via SQL or future Users page.
- **The 50-surface sidebar shows everything**, but only 2 surfaces
  are real (Dashboard + Playbooks). Each slice flips a group live —
  replace `Placeholder` with real component in `App.jsx`, the sidebar
  entry is already there.
- **Cloudinary, Resend, Pexels are all wired.** Do not re-set up.
- **Mascot.jsx is the user-modified version** from the previous CRM.
  Do not revert.
- **Don't add a `RequireRole` guard until slice 6** when there are
  multiple roles in the system — for now everyone signed in is owner.
- **Email layouts have ONE source of truth.** Editing the Cloudinary
  URL anywhere else than the two constants in §4 rule 7 is a bug.

---

## 9. Handover package for the next session

Attach all three of these to the new chat in this order:

1. `docs/HANDOVER.md` (this file) — full session context.
2. `docs/SLICE_2_PORTING.md` — the porting playbook with task block.
3. The repo at branch `claude/nice-bohr-rtmziz` — the live code +
   migrations + Edge Functions.

Opening message:

> Continuing slice 2 of the Marketing iO CRM rebuild. Read
> `docs/HANDOVER.md` for the full context, then
> `docs/SLICE_2_PORTING.md` — especially §10 (the 14-task block).
> Foundation + sidebar are done; start at task 2 (the Log Sale form).
> The OLD Base44 code is at `/tmp/marketingio-extract/`.

---

## End

Foundation is green. Auth + dashboard + Playbooks + 50-surface
sidebar live. Slice 2 is the next ship.

Good luck.
