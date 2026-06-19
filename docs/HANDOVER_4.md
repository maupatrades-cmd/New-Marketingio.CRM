# HANDOVER 4 — Lead Lifecycle Phase 2

**Branch:** `claude/integration`
**Preview URL:** `https://new-marketingio-crm-git-claude-integration-thapelo-l.vercel.app`
**Prior phase:** Phase 1 shipped on `claude/integration` (commits `adf87de` → `513dc5c` → `a8e20c4`). Smoke test partially complete — **Phase 2 build does not start until Phase 1 is signed off as working**.

---

## 0. Read this first

Phase 2 grew on the night of 2026-06-18 after smoke-test feedback surfaced two issues that were never in the original Phase 1 spec:

1. **Duplicate leads were accepted silently.** "fund now capital" was captured twice 49 minutes apart with identical phone + email. Both rows succeeded. (Duplicate row deleted manually; the earlier one was kept.)
2. **Lead attribution defaulted, instead of being derived from the auth session.** `NewLead.jsx` hardcoded `source='field_agent_direct'` regardless of who was logged in — fixed in migration 24, but the *deeper* rule that drove the fix needs codifying so it doesn't get re-broken next time someone touches a capture surface.

Both are in scope for Phase 2. Assignment-side work (assignment UI, hot-lead bell wiring, stale SLA, `lead_assigned` email) **stays in Phase 3**. Phase 2 already has four hard things; do not stack a fifth.

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

A modal opened from the inbox row (and from the lead detail page once that exists) where owner/admin marks a lead as **verified**, **needs clarification**, or **rejected**.

- **Warm criteria checkboxes** — 7 items read from `system_settings.lead.warm_criteria.v1`. **The 7 criteria are TBD.** Lock them in a separate task before building. The "not already a client / not a duplicate" criterion is one of the seven; this is what the duplicate engine now backs.
- **Temperature picker** — re-uses the cold/warm/hot pills.
- **Decision buttons** — verify / clarify / reject, each triggers a narrow `UPDATE` on the matching column. **No blob writes** — every field updates on its own.
- **Server-side:** new RPC `qualify_lead(lead_id, decision, criteria_checked jsonb, temperature)`. Auth check (owner/admin), validate decision in `('verified','needs_clarification','rejected')`, write narrow updates, audit_log row.

### 1.5 CPC R87 accrual

When a CPC-sourced lead reaches the **verified** decision, accrue R87 to the CPC's `cpc_r87_paid` (or similar — confirm the existing column name in `profiles`/`user_roles`/ledger). Rules:

- Triggered from inside `qualify_lead(...)` when the decision is `'verified'` AND the lead's `source = 'cpc_outbound'` AND `submitted_by` resolves to a CPC.
- **Idempotent.** Either (a) check a flag on the lead row (`cpc_r87_accrued boolean default false`) before incrementing, or (b) use a unique index on `(lead_id, accrual_type)` in a future ledger table. Decide before building — flag is simpler for Phase 2.
- Write an audit_log entry for every accrual.

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

## 3. Open questions to resolve before build

1. **Soft-error SQLSTATE for `possible_duplicate`.** Pick one (recommend `'45D01'`) and document. Edge Functions need to parse this code distinctly from `42501` (DNC).
2. **Warm-criteria list (the 7).** TBD seed in `system_settings.lead.warm_criteria.v1` is a placeholder. Lock the actual list in a separate task before the qualification modal is built.
3. **CPC R87 column name + table.** The handover says "reuse the existing `cpc_r87_paid` column" — confirm the table (`profiles`? a ledger?) and exact column before writing the accrual. If no column exists yet, add it in migration 26.
4. **Idempotency mechanism for R87.** Flag on `leads` (`cpc_r87_accrued bool`) vs. ledger row with a unique constraint. Recommend flag for Phase 2 simplicity.
5. **Public-link duplicate copy.** The wording in §1.2 is a draft — refine for POPIA tone.

---

## 4. Build order

The Phase 1 order worked: migration → Edge Functions → frontend → smoke. Same order here.

1. Lock the 5 open questions above.
2. **Migration 26** — columns + 3 triggers (`enforce_public_link_attribution`, `detect_possible_duplicate`, `populate_submitted_by_role`).
3. **Edge Functions** — update `public-lead-submit` to handle the duplicate soft-error + auto-ack for `submit_signup`. Update `submit_signup` similarly. Add `qualify_lead` RPC.
4. **Frontend** —
   - Duplicate confirm dialog component (shared between `/owner/leads/new` and `/refer/:token`).
   - Qualification modal on the inbox.
   - Update inbox + my-leads columns to show capturer + assignee separately.
5. **Smoke test scenarios:**
   - Capture two leads with same phone → first OK, second hits duplicate dialog
   - "Capture anyway" → row inserted with `duplicate_acknowledged=true` and `duplicate_of` populated
   - "View existing" → navigates to the matched lead
   - Public referral duplicate → same UX, POPIA-clean copy
   - Website signup duplicate → silently inserted with `duplicate_of` populated
   - Owner captures a lead → `submitted_by_role='owner'` (from `user_roles` lookup, not from form)
   - Insert a lead with `captured_via='public_link'` AND no `referrer_name` → trigger refuses
   - CPC sources lead, owner verifies → R87 accrued once, second verify is a no-op
   - Qualification: verify decision writes status only (narrow update, no blob)
   - Inbox + my-leads display "Captured by" + "Assigned to" as separate columns; unassigned rows show "Unassigned"

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

Already on `claude/integration`:

- **Migrations:** 23 (Phase 1 main), 24 (source-from-role fix), 25 (addon catalogue manager).
- **Edge Functions deployed:** `public-lead-submit` v1, `notify-hot-lead` v1, `captcha-photos` v15, `send-email` v23.
- **Frontend:** `/owner/leads/new`, `/owner/leads/my`, `/refer/:token`, `/owner/settings/catalogue`.
- **Sidebar links:** New lead, My leads, Add-on catalogue.
- **Secrets set:** `CAPTCHA_SIGNING_KEY`, `PEXELS_API_KEY`.

**Smoke test partially complete.** Phase 1 has two known surfaced issues (the "field_agent" attribution bug and the duplicate-acceptance gap), both already addressed: the first is fixed in migration 24, the second is captured in this Phase 2 plan. Full smoke checklist from `HANDOVER_3.md §4` still needs to finish before Phase 2 build starts:

1. Field agent captures HOT → inbox shows urgent + hot badge + bell ping + email
2. WARM/COLD → no hot ping
3. Public submit via `/refer/:token` → pending + referrer recorded
4. Empty/failed captcha → rejected
5. CPC capture attributed (submitted_by = auth.uid())
6. Do-not-contact path → INSERT raises `do_not_contact_violation`
7. 60-min debounce → two hot updates within an hour → only one fan-out

---

## 7. Outstanding cleanup (low priority, do not block Phase 2)

- **Remote `claude/sweet-pascal-z78jj2` branch** still exists on GitHub (push `--delete` got 403). Delete via GitHub UI when convenient.
- **`updated_at` log error** at timestamp `1781824059008` — confirmed unrelated to Phase 1 code. Likely a pre-existing trigger on a different table; investigate when triaging the Postgres logs.

---

## 8. Approval gate

**No code lands on `claude/integration` for Phase 2 until:**

1. Phase 1 smoke test is signed off as passing.
2. The 5 open questions in §3 are answered.
3. The owner has reviewed this plan rested, not tired.

Tired approval is how scope creep ships.
