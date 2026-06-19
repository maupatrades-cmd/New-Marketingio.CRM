# HANDOVER 4 — Lead Lifecycle Phase 2

**Branch:** `claude/integration`
**Preview URL:** `https://new-marketingio-crm-git-claude-integration-thapelo-l.vercel.app`
**Prior phase:** Phase 1 shipped on `claude/integration` (commits `adf87de` → `513dc5c` → `a8e20c4`). **Phase 1 SMOKE-VERIFIED 2026-06-19 — all 5 checks passed. See §6.**

---

## 0. Read this first

Phase 1 is **shipped and smoke-verified** (2026-06-19, all 5 checks pass — see §6). Phase 2 closes the two gaps surfaced during Phase 1 smoke that were never in the original spec, plus the qualification modal that was always planned for this phase:

1. **Duplicate leads were accepted silently.** "fund now capital" was captured twice 49 minutes apart with identical phone + email. Both rows succeeded. (Manual cleanup done; the earlier row kept.)
2. **Lead attribution defaulted, instead of being derived from the auth session.** `NewLead.jsx` hardcoded `source='field_agent_direct'` regardless of who was logged in — patched in migration 24, but the *deeper* rule that drove the fix needs codifying so it doesn't get re-broken next time someone touches a capture surface.
3. **Qualification surface** — owner/admin needs a modal that reads the locked criteria/questions and writes a verify/clarify/reject decision with the right side-effects (R87 accrual gate).

All three are in scope for Phase 2. Assignment-side work (assignment UI, hot-lead bell wiring, stale SLA, `lead_assigned` email trigger) **stays in Phase 3**. Phase 1.5 polish (the two UX bugs from Phase 1 smoke — see §6.2) is a parallel, no-database-touch lane.

---

## 1. Phase 2 scope — the four hard things

### 1.1 Migration 26 — schema + triggers

New columns on `public.leads`:

| Column                  | Type                                          | Why                                              |
|-------------------------|-----------------------------------------------|--------------------------------------------------|
| `submitted_by_role`     | `text`                                        | Captured at insert time, from `user_roles` lookup. Never derived from a UI default. |
| `assigned_by`           | `uuid references public.profiles(id)`         | Schema lives here in Phase 2; the UI that writes to it ships in Phase 3. |
| `duplicate_acknowledged`| `boolean not null default false`              | TRUE when a capturer explicitly chose "Capture anyway" past the duplicate warning. |
| `duplicate_of`          | `uuid references public.leads(id) on delete set null` | Soft link to the matched lead, when duplicate detection fired. NULL otherwise. |

Index: `create index leads_phone_email_idx on public.leads (phone, email)` (already covered by per-column indexes from migration 23 — check before adding).

**Trigger: `enforce_public_link_attribution()`** — BEFORE INSERT on `public.leads`. If `captured_via = 'public_link'` AND `submitted_by IS NULL` AND (`referrer_name IS NULL` OR `referrer_contact IS NULL`), raise `attribution_unknown` (errcode `42501`). This closes the gap where a malformed request that slips past the Edge Function would leave us with an unattributable row.

**Trigger: `detect_possible_duplicate()`** — BEFORE INSERT on `public.leads`. Looks for an existing lead with matching `phone` OR matching `email` (ignore NULLs, do not match on `business_name`).

- If a match exists AND `NEW.duplicate_acknowledged IS NOT TRUE`: raise `possible_duplicate` with the matched `lead_id` embedded in the error detail (e.g. `errdetail = jsonb_build_object('matched_lead_id', X)::text`). This is a **soft** error — distinct from the hard `do_not_contact_violation` error code `42501`. Use a custom SQLSTATE like `P0001` (raise_exception with a known `errcode` like `'45D01'` — pick one, document it, and have the Edge Functions parse for it).
- If a match exists AND `NEW.duplicate_acknowledged IS TRUE`: allow the insert, and populate `NEW.duplicate_of := <matched.id>` so the link is auditable.
- If no match: allow.

**Trigger: `populate_submitted_by_role()`** — BEFORE INSERT on `public.leads`. If `NEW.submitted_by IS NOT NULL` AND `NEW.submitted_by_role IS NULL`, look up the user's role from `user_roles` (highest-privilege role wins: owner > admin > field_agent > cpc > customer). If no row found, raise `attribution_unknown`. If `NEW.submitted_by IS NULL` (public-link capture), leave the column NULL — the attribution comes from `referrer_name` / `referrer_contact` in that case.

### 1.2 Duplicate detection UX at three capture surfaces

**`/owner/leads/new`** — on POST, if Postgres returns `possible_duplicate`, parse the `matched_lead_id` out of the error and render a confirm dialog:

> **Possible duplicate found**
> A lead with this phone or email already exists: **"Lead Name"** (captured Jun 12 by Alice).
> [View existing] [Capture anyway]

"View existing" navigates to the inbox focus URL. "Capture anyway" re-submits with `duplicate_acknowledged: true`.

**`/refer/:token`** — same UX, simpler copy:

> We already have a referral for this phone number. The team will see your details either way.
> [View public confirmation] [Submit anyway]

Wording stays POPIA-clean — never leak the existing lead's name, capturer, or any contact info to the public referrer. Only confirm that a match was found.

**`submit_signup`** — silent. Website self-signups never see a duplicate warning. The trigger still runs, but the Edge Function detects the `possible_duplicate` error and retries with `duplicate_acknowledged: true` automatically, so the row lands with `duplicate_of` populated for the back-office to investigate. Rationale: public web visitors don't get to know about each other's leads.

### 1.3 Attribution-from-auth rule (this is the deep rule — write it on the wall)

> **Attribution comes from the auth session — never from a default, never from a typed field, never from a hardcoded fallback.**

Codified at three layers:

1. **Database (migration 26):** `populate_submitted_by_role` trigger raises `attribution_unknown` if no role row exists for the submitter. No silent fallback to `'field_agent'`.
2. **Edge Functions:** `public-lead-submit` continues to set `submitted_by = null` and require `referrer_name + referrer_contact`. Authenticated capture endpoints rely on the JWT — the client cannot override `submitted_by`.
3. **Frontend (`/owner/leads/new`):** no role typed into the form. `useAuth().role` is read-only and only used to map `source` via `roleToSource()` (already shipped). The deep DB rule means that even if the frontend mapping is wrong, the DB will populate `submitted_by_role` correctly from `user_roles`.

**Re-assignment never changes `submitted_by`.** The capturer is permanent — it's the source of truth for the bonus engine and closing-ratio reporting. Re-assignment writes a row to `audit_log` (actor, old assignee, new assignee, timestamp) so the hand-off chain is traceable. This rule is enforced in the Phase 3 assignment RPC; for Phase 2 it just needs documenting so whoever builds Phase 3 doesn't accidentally `UPDATE submitted_by` along with `assigned_to`.

### 1.4 Qualification modal

A modal opened from the inbox row (and from the lead detail page once that exists) where owner/admin marks a lead as **verified**, **needs clarification**, or **rejected**. Criteria and questions are now LOCKED in `system_settings` (verified 2026-06-19) — the modal reads them dynamically, never hardcoded.

**Warm criteria (the 7) — read from `system_settings.lead.warm_criteria.v1`:**

1. `real_business` — Has a real, operating business (turns over money, has stock or services)
2. `authority` — Speaking to the owner or someone who can say yes
3. `wants_customers_now` — Wants more customers right now (actively, not someday)
4. `can_afford` — Can afford R500–R1,500 a month for more customers
5. `reachable` — Reachable — working phone, WhatsApp, or trusted intermediary
6. `not_existing` — Not already a Marketing iO client and not a duplicate *(backed by the duplicate engine — when the duplicate trigger fires "soft" the qualifier must un-check this box)*
7. `visibility` — Has visible presence — shopfront, stall, or any social page

**Qualification questions (the 5) — read from `system_settings.lead.qualification_questions.v1`:**

1. `q1` (text) — How long have you been running this business?
2. `q2` (single_select) — How do customers find you right now? *(Walk-ins / Word of mouth / Facebook or Instagram / Google / Referrals / They don't really)*
3. `q3` (single_select) — What's stopping you from getting more customers?
4. `q4` (single_select) — Who decides on things like advertising or signage?
5. `q5` (single_select) — If we showed you it works, would you spend R500–R1,500 a month on getting more customers?

These already drive `/owner/leads/new` (the capture form renders them now). The qualification modal re-reads the same setting so capturer and qualifier always see the same wording — bump the version suffix (`.v2`) when changing the list rather than mutating `.v1`, so historical `qualification_answers` rows stay decodable.

**Modal behaviour:**

- **Warm criteria** — checkbox per item, persisted to `leads.warm_lead_criteria jsonb` (column already exists) as `{ "real_business": true, "authority": false, ... }`. Versioned: also stores `{ "_schema": "lead.warm_criteria.v1" }` so older answers can be migrated.
- **Temperature picker** — re-uses the cold / warm / hot pills, writes `lead_temperature`. Changing warm → hot fires the existing `notify-hot-lead` trigger (already smoke-verified Phase 1).
- **Decision buttons** — verify / clarify / reject.
  - `verified` → `status='verified'`, `verified_by=auth.uid()`, `verified_date=current_date`. CPC R87 accrual gate runs here (§1.5).
  - `needs_clarification` → `status='pending_verification'`, append a note (free-text required), no R87.
  - `rejected` → `status='rejected'`, `rejection_reason` required. No R87.
- **No blob writes** — every column is a narrow UPDATE inside the RPC, never `update().eq().select()` whole rows.

**Server-side RPC:** `qualify_lead(p_lead_id uuid, p_decision text, p_criteria_checked jsonb, p_temperature text, p_note text)` — `SECURITY DEFINER`, owner/admin only via `has_role()`, validates `p_decision IN ('verified','needs_clarification','rejected')`, writes the narrow updates, calls the R87 accrual when conditions match, inserts an `audit_log` row with `action='lead_qualified'` and `after_data` containing the decision + criteria snapshot.

### 1.5 CPC R87 accrual

The `leads.cpc_r87_paid boolean default false` column **already exists** (confirmed in the live schema). Use it as the idempotency flag — no separate ledger table needed for Phase 2.

Accrual rules (executed inside `qualify_lead`):

1. Gate: `p_decision = 'verified'` AND `lead.source = 'cpc_outbound'` AND `lead.submitted_by IS NOT NULL` AND `has_role(lead.submitted_by, 'cpc') = true` AND `lead.cpc_r87_paid = false`.
2. Set `cpc_r87_paid = true` in the same narrow UPDATE.
3. Insert `audit_log` row: `action='cpc_r87_accrued'`, `actor_id=auth.uid()`, `row_id=lead.id`, `after_data={ cpc_user_id, amount: 87, lead_id }`.
4. Money movement (writing to a CPC ledger / wallet / bonus table) is **deferred to Slice 3 (Money)**. Phase 2 only marks the flag and audits — that gives the bonus engine a clean source-of-truth list when it ships.

Idempotency: re-qualifying a verified lead with `cpc_r87_paid=true` is a no-op for the accrual but still allowed (e.g. owner re-confirms temperature). The flag guard prevents double-accrual.

### 1.6 Display-layer rule

**Capturer and assignee are SEPARATE fields. Never collapse them into one.**

- `/owner/sales/leads` (inbox) and `/owner/leads/my` must show two columns: "Captured by" (from `submitted_by_name`) and "Assigned to" (from a join on `profiles` via `assigned_to`).
- When `assigned_to IS NULL`, show the literal text **"Unassigned"** — never the capturer's name, never `'field_agent'`, never blank.
- Phase 2 ships this rule even though the Phase 3 assignment UI hasn't shipped — the columns will mostly read "Unassigned" until then, and that's correct.

---

## 2. Explicitly out of Phase 2

Capture them here so they don't drift back in mid-build:

- **Assignment UI** — Phase 3. The column lands in migration 26, but no UI writes to it in Phase 2.
- **Hot-lead bell wiring** — Phase 3. The `notify-hot-lead` Edge Function exists; wiring the frontend bell-icon counter to it is Phase 3.
- **Stale-hot SLA** — Phase 3. "Hot leads not actioned within X hours escalate to owner" — needs a cron + an escalation channel.
- **`lead_assigned` email template** — already coded in `send-email/index.ts` v23 (shipped in Phase 1), but the trigger that calls it ships with the assignment UI in Phase 3.
- **Bonus engine** — Slice 3 (Money). Not Phase 2 or 3 of Lead Lifecycle.

---

## 3. Open questions — RESOLVED

All five questions from the prior draft are now answered. Recorded here for the build:

1. **Soft-error SQLSTATE for `possible_duplicate`** → **`'45D01'`** (custom, in the user-defined `45xxx` range). Edge Functions parse this distinctly from `42501` (DNC). Error message format: `possible_duplicate` with `errdetail = jsonb_build_object('matched_lead_id', matched.id, 'matched_business_name', matched.business_name, 'matched_at', matched.created_at)::text`. *(Public-link branch must strip business_name + capturer before surfacing — see §1.2.)*
2. **Warm-criteria list (the 7)** → **LOCKED 2026-06-19** in `system_settings.lead.warm_criteria.v1`. Full list in §1.4.
3. **CPC R87 column** → **`public.leads.cpc_r87_paid boolean default false`** — already exists in the live schema. No new column needed.
4. **Idempotency mechanism for R87** → **flag on `leads`** (`cpc_r87_paid`). Decision: flag for Phase 2 simplicity. A proper ledger ships with the bonus engine in Slice 3.
5. **Public-link duplicate copy** → use POPIA-clean wording from §1.2 (no name / capturer / contact leakage). Final copy below, locked:
   > **We already have this referral on file.** Thanks for thinking of us — our team will follow up. *(no [View] button on the public branch, no business name shown)*

---

## 4. Build order

Phase 1 order worked: migration → Edge Functions → frontend → smoke. Same here. All open questions are resolved (§3) so we can start as soon as the owner approves.

**Parallel lane (Phase 1.5 — frontend only):**

0. Bug A: field_agent / cpc landing redirect in `App.jsx` `RequireRole`.
0. Bug B: sidebar role filter in `OwnerShell.jsx` `NAV_GROUPS`.

These two ship independently and can land first — they don't block Phase 2 and they don't touch any of the Phase 2 surfaces.

**Phase 2 main lane:**

1. **Migration 26** — columns (`submitted_by_role`, `assigned_by`, `duplicate_acknowledged`, `duplicate_of`) + 3 triggers (`enforce_public_link_attribution`, `detect_possible_duplicate`, `populate_submitted_by_role`) + the `qualify_lead` `SECURITY DEFINER` RPC. Single migration file.
2. **Edge Functions:**
   - `public-lead-submit` v4 — catch SQLSTATE `45D01`, surface duplicate confirmation to client (POPIA-clean copy in §3).
   - `submit_signup` — same `45D01` catch, but auto-retry with `duplicate_acknowledged=true` (silent, sets `duplicate_of` for back-office).
3. **Frontend:**
   - `DuplicateConfirmDialog` component (shared) with two surface variants: `/owner/leads/new` (full info — name + capturer + date), `/refer/:token` (locked POPIA copy, no [View] button).
   - `QualifyLeadModal` on the inbox row: reads `system_settings.lead.warm_criteria.v1` + `system_settings.lead.qualification_questions.v1`, calls `qualify_lead` RPC.
   - Update `/owner/sales/leads` (inbox) + `/owner/leads/my` to show two columns: "Captured by" + "Assigned to". `assigned_to IS NULL` → literal "Unassigned" (never blank).
4. **Smoke checklist:**
   - Capture two leads with same phone → first OK, second hits duplicate dialog (shows business name + capturer on /owner/leads/new)
   - "Capture anyway" → row inserted with `duplicate_acknowledged=true`, `duplicate_of` populated, audit_log entry
   - "View existing" → navigates to matched lead detail
   - Public referral duplicate (`/refer/:token`) → POPIA-clean dialog, no leakage, lead still recorded with `duplicate_of`
   - Website signup duplicate → silently inserted with `duplicate_of` populated, no UI surfaced
   - Owner captures a lead (no role typed) → `submitted_by_role='owner'` resolved by trigger
   - Field agent captures a lead → `submitted_by_role='field_agent'` resolved by trigger
   - Insert a `captured_via='public_link'` row with NULL `referrer_name` → trigger raises `attribution_unknown` (errcode 42501)
   - CPC sources lead, owner verifies → `cpc_r87_paid` flips true, `cpc_r87_accrued` audit row written
   - Re-verify same CPC lead → flag already true, no second audit row (idempotent)
   - Owner verifies a field_agent lead → no R87 accrual
   - Qualification: verify writes 3 narrow columns (`status`, `verified_by`, `verified_date`) + `warm_lead_criteria` jsonb only; no whole-row update
   - Qualification: reject without `rejection_reason` → RPC rejects with validation error
   - Inbox + my-leads display "Captured by" + "Assigned to" as separate columns; unassigned rows show "Unassigned"
   - Bump warm_criteria to v2 in `system_settings` → modal re-renders with new list on next mount; existing `warm_lead_criteria.v1` rows still decode

---

## 5. Carry-over rules (still in force from prior handovers)

- **Don't touch payfast files.** Lane lock — `payfast-init` and `payfast-itn` Edge Functions are off-limits.
- **`APP_URL` stays on the integration preview URL** until go-live. Do NOT default to `app.marketingio.co.za` — that still serves the legacy Base44 CRM.
- **RLS enforces server-side, not just UI.** Phase 1 tightened `leads_read` so field_agent/cpc see only `submitted_by = auth.uid() OR assigned_to = auth.uid()`. Phase 2 must not loosen this.
- **No constants in code.** All business values live in `system_settings`.
- **No silent catches.** Re-throw / log+surface / log+audit_log only.
- **Multi-table writes go through SECURITY DEFINER RPCs.**
- **Server-filtered + paginated queries** for any list view (LB-215).
- **All numbered migrations live in `supabase/migrations/`.** Next number: **26**.
- **All new tables get RLS + an audit trigger** (see migration 03's loop).

---

## 6. Phase 1 state at handover

**SHIPPED & SMOKE-VERIFIED — 2026-06-19. All 5 checks passed.**

Already on `claude/integration`:

- **Migrations:** 23 (Phase 1 main), 24 (source-from-role fix), 25 (addon catalogue manager).
- **Edge Functions deployed:** `captcha-photos` v19, `public-lead-submit` v3, `notify-hot-lead` v4, `send-email` v23.
- **Frontend:** `/owner/leads/new`, `/owner/leads/my`, `/refer/:token`, `/owner/settings/catalogue`.
- **Sidebar links:** New lead, My leads, Add-on catalogue.
- **Secrets set:** `CAPTCHA_SIGNING_KEY`, `PEXEL_API_KEY` (note: no trailing S — original typo in the Supabase secret name; the code matches).

### Smoke check results

| # | Scenario | Result | Notes |
|---|----------|--------|-------|
| 1 | Field agent captures HOT → inbox urgent + hot badge + bell ping + email | ✅ PASS | `client_notifications` row confirmed (id `97fef890`); email received at `business.lekgoro@gmail.com` |
| 2 | WARM/COLD → no hot ping | ✅ PASS | Function returns `{ skipped: true, reason: 'lead not hot' }` |
| 3 | Public submit via `/refer/:token` → pending + referrer recorded | ✅ PASS | Lead inserted with `status='pending_verification'`, `referrer_name` populated |
| 4 | Captcha blocks invalid solve | ✅ PASS | Wrong answer returns `wrong_answer`; function reloads challenge |
| 5 | CPC capture attributed (`submitted_by = auth.uid()`) | ✅ PASS | RLS field-agent/CPC read policy confirmed; DNC path raises `do_not_contact_violation` |

### Bugs found and fixed during smoke

1. **`captcha-photos` v18 → v19 (GET handler param mismatch)**
   - Root cause: `handleGrid` read `query` (singular) + `per_page` but frontend sends `queries` (plural, comma-separated) + `per`. Response also lacked the `ok: true` field the frontend checked.
   - Fix: Rewrote `handleGrid` to read `queries`/`per`, return `{ ok: true, photos: { <label>: [url, ...] } }`.

2. **`public-lead-submit` v2 → v3 (500 diagnostic logging)**
   - Root cause: Not definitively identified via static analysis (schema, triggers, constraints, FKs, RLS all checked clean). Added structured `console.error` logging and exposed `code`/`details` in the 500 response for future diagnosis. Function returned 200 on retry.

3. **`notify-hot-lead` v2 → v3 → v4 (silent fail — zero `client_notifications` rows written)**
   - v2 bug: `.from('profiles').select('id').in('role', [...])` — `profiles` has no `role` column (42703). Error was swallowed by try/catch, function returned 200 silently.
   - v3 bug: Changed to `.from('user_roles').select('user_id, profiles(full_name)')` — PostgREST could not resolve the embedded select because `user_roles.user_id` FKs to `auth.users`, not `public.profiles`. No FK path exists. PostgREST hung ~15 s then 500'd.
   - v4 fix: Dropped embed entirely → `.select('user_id')`. `full_name` was unused in the insert. Added `Set` dedupe for users with multiple roles. Fixed `audit_log` inserts: `record_id` → `row_id`, `metadata` → `after_data`. Added structured logging throughout.

## 6.2 Phase 1.5 polish — UX-only, parallel lane

Two visibility bugs from Phase 1 smoke. Frontend-only, no database touch — safe to ship alongside Phase 2 build without coupling. Recommend landing these before Phase 2 frontend work starts so the qualification modal lands on a clean shell.

- **Bug A — Wrong landing page for field_agent / cpc.** These roles land on the owner dashboard (`/owner`) which is irrelevant to them. They should redirect to `/owner/leads/my`. Fix in `App.jsx` `RequireRole` wrapper (cheapest) or in the `OwnerDashboard` component itself with a `useEffect` redirect. Prefer the wrapper — keeps the dashboard component role-agnostic.
- **Bug B — Sidebar shows inaccessible links for non-owner roles.** `OwnerShell.jsx` `NAV_GROUPS` renders all 50 nav items regardless of role. Add a `roles?: Role[]` field to each `NavItem`, filter at render time using `useAuth().role`. When `roles` is omitted, default visible to all (so existing items don't disappear).

  Visibility matrix (locked):

  | Role        | Visible nav items                                               |
  |-------------|-----------------------------------------------------------------|
  | owner       | all                                                             |
  | admin       | all                                                             |
  | field_agent | New lead, My leads, My Sales                                    |
  | cpc         | New lead, My leads, Leads inbox, My Sales                       |
  | customer    | (separate shell — out of scope here)                            |

  Smoke: log in as field_agent → sidebar shows 3 items; log in as cpc → sidebar shows 4 items; log in as owner/admin → sidebar unchanged.

  **Status (2026-06-19): Bugs A + B SHIPPED in commit `a0d5f81` — verified live as field_agent.**

- **Bug C — `submit_signup`'s outer `when others` writes to wrong audit_log columns.** Queued during PR 3 review. Migration 23's `when others` exception handler uses `record_id` / `metadata` — both nonexistent (the correct names are `row_id` / `after_data`, same bug pattern as the notify-hot-lead silent-fail from Phase 1 smoke). Migration 27's new `45D01` handler uses the correct names, but the original outer `when others` was not touched (intentionally surgical change in PR 3). Net effect: a non-DNC, non-duplicate failure during the self-signup lead INSERT silently fails its own audit-log insert — the very failure path that most needs visibility. Fix: a tiny follow-up migration that re-emits `submit_signup` with the outer handler's column names corrected. Low priority — only fires on rare un-classified failures — but ship it before Phase 3 so we don't carry the foot-gun forward. UX-only otherwise, no schema change.

---

## 7. Outstanding cleanup (low priority, do not block Phase 2)

- **Remote `claude/sweet-pascal-z78jj2` branch** still exists on GitHub (push `--delete` got 403). Delete via GitHub UI when convenient.
- **`updated_at` log error** at timestamp `1781824059008` — confirmed unrelated to Phase 1 code. Likely a pre-existing trigger on a different table; investigate when triaging the Postgres logs.
- **Bug C audit-column silent failure in `submit_signup`** — see §6.2.

---

## 8. Approval gate

**No code lands on `claude/integration` for Phase 2 until:**

1. ~~Phase 1 smoke test is signed off as passing.~~ **Done — 2026-06-19.**
2. ~~The 5 open questions in §3 are answered.~~ **Done — see §3, all five locked.**
3. The owner has reviewed this plan rested, not tired.

Tired approval is how scope creep ships. Phase 1.5 polish (§6.2) can ship in parallel without blocking Phase 2 approval — those two bugs are tiny, UX-only, and don't touch the schema.
