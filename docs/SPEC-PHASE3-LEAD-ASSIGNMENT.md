# SPEC — Lead Assignment & Tracking (Phase 3, build NEXT session)

**Locked Friday 19 June 2026 by Thapelo Maupa.** Carry into Phase 3.

---

## §0 — Why this spec exists

Thapelo flagged the real-world scenario mid-smoke today: *"In the office it will be owner +
admin in most cases — they are the ones doing a lot of admin work, including capturing leads
when field agents aren't around. They also need to be able to follow that lead all the way to
the sale."*

This spec turns that observation into shippable scope. It's the FIRST item in Phase 3 and
unblocks the "owner captures call-in for John" workflow before launch (25 May 2026).

---

## §1 — Locked decisions

### 1.1 Who can assign
- **Owner + admin.**
- CPCs and field agents cannot assign; they receive assignments.

### 1.2 Assignment notification (to assignee)
- **Channels:** bell + email.
- **Email template:** `lead_assigned` already exists in `send-email` v23. Wire it up.
- **Owner CC:** No — owner doesn't need a copy of every assignment because they're the one
  doing it. (Reassess after first 2 weeks of real use if it feels off.)

### 1.3 Reassignment
- **Owner + admin can reassign freely** — any lead, any time, including to themselves.
- **Every reassignment is tracked.** Full audit history preserved.

### 1.4 Assigner stays connected — full feed
The assigner (whoever last assigned/reassigned the lead) gets bell + email notifications at
every milestone in the lead's life:
- Lead qualified — verified / needs_clarification / rejected
- First contact logged
- Meeting booked
- Deal created
- Sale won
- Sale lost
- **Lead gone cold** — automatic notification if no activity for 7+ days

### 1.5 Closing-ratio scoreboard
- **Page:** `/owner/sales/conversion` (new).
- **Per-assignee row:** leads received, leads qualified (verified), leads won, conversion %.
- **Sortable by any column.**
- **Visibility:**
  - Owner + admin → see all rows + filter/sort
  - field_agent + cpc → see their OWN row only
- **Coaching framing** — no public "bottom of the leaderboard" shaming. Same rule as bonus
  motivation layer: constructive language only ("3 more wins to hit your stretch target").
- **Connects to Slice 2c Sales Opportunities closing-ratio spec** so the same scoreboard
  surface serves both lead-conversion AND post-sale closing-ratio (don't double-build).

---

## §2 — Schema additions

### 2.1 New table: `lead_assignment_history`
Columns:
- `id bigserial primary key`
- `lead_id uuid not null references leads(id) on delete cascade`
- `from_user_id uuid references auth.users(id)` — nullable for first assignment (no prior holder)
- `to_user_id uuid not null references auth.users(id)` — the new assignee
- `assigned_by uuid not null references auth.users(id)` — owner or admin who performed it
- `assigned_at timestamptz not null default now()`
- `reason text` — optional, free-text on reassignments

Index on `(lead_id, assigned_at desc)` for fast history queries.

### 2.2 Existing columns on `leads` (already shipped in migration 26)
- `assigned_to uuid` — current assignee (used by RLS + my-leads view)
- `assigned_by uuid` — who last assigned
- `assigned_at timestamptz` — when last assigned

### 2.3 New trigger on UPDATE leads
When `assigned_to` changes from value X to value Y, insert a row into `lead_assignment_history`
with `from_user_id=X`, `to_user_id=Y`, `assigned_by=auth.uid()`, `reason=NEW.reassign_reason`
(transient column passed via the RPC).

---

## §3 — RPC: `assign_lead(p_lead_id uuid, p_to_user_id uuid, p_reason text default null)`

`SECURITY DEFINER`. Logic:
1. Role check: `has_role(auth.uid(), ARRAY['owner','admin'])`. Otherwise raise insufficient
   privilege.
2. Validate `p_to_user_id` exists in `auth.users` and has at least one role in `user_roles`.
3. Lookup current `assigned_to` (the `from` value).
4. UPDATE `leads` SET `assigned_to = p_to_user_id`, `assigned_by = auth.uid()`,
   `assigned_at = now()`.
5. Trigger writes history row (see §2.3).
6. Fire `notify-lead-assigned` Edge Function with `{lead_id, assignee_id, assigner_id}`.
7. Return `{ ok, lead_id, assignee_id, was_reassignment }`.

---

## §4 — Notifications engine

### 4.1 New Edge Function: `notify-lead-assigned`
Mirrors `notify-hot-lead` v4 pattern:
- Structured logging at every stage
- Bell: insert `client_notifications` row for assignee with title
  `"📬 New lead assigned: {business_name}"`
- Email: `send-email` with template `lead_assigned` (already exists)
- 60-min debounce per (lead_id, assignee_id) — prevents reassignment spam if the assigner
  flips it twice
- Audit log: `action='lead_assigned_dispatched'`, `after_data` with channels + recipients

### 4.2 New Edge Function: `notify-lead-milestone`
Generic milestone notifier — replaces ad-hoc notifications scattered across the codebase.
- Listens to lead state changes via a trigger on UPDATE leads
- For each milestone (qualified/contacted/meeting/deal/won/lost/cold):
  - Looks up the CURRENT `assigned_by` (the most recent assigner)
  - Sends bell + email to that assigner only
  - Logs to audit_log
- Built once, used for all 7 milestones — no copy-paste.

### 4.3 Cold-lead cron
- Daily at 06:00 (business hours start in SAST), Postgres `cron.schedule()` runs a function:
- Find leads where `status='verified'` AND `assigned_to IS NOT NULL` AND `updated_at < now() -
  interval '7 days'` AND no `lead_milestone_cold` notification already sent
- For each, fire `notify-lead-milestone` with milestone=`cold`
- Mark via a new column `cold_notified_at` so we don't re-fire daily

---

## §5 — Frontend surfaces

### 5.1 Assign modal — `/owner/sales/leads` Actions column
- New "Assign" button next to Qualify/Dup/Convert (probably an icon: 📬 or 👤)
- Only renders for owner/admin (sidebar role-filter pattern from Phase 1.5)
- Modal opens with:
  - Lead context at top (business name, capturer, current status)
  - **Assignee picker** — dropdown of all users with field_agent/cpc roles, sorted by name,
    with current assignment shown if any
  - **Reason field** (optional) — only required if it's a REASSIGNMENT (the dropdown shows
    "Currently assigned to: John — reassigning")
  - Submit calls `assign_lead` RPC
- After success: toast, modal closes, inbox refreshes, the lead row shows the new assignee in
  the "Assigned to" column (which we just shipped in PR 4 item 5)

### 5.2 Closing-ratio page — `/owner/sales/conversion` (new)
Layout:
- Header: "Conversion scoreboard"
- Period tabs: This month / This quarter / All time (default: This month)
- Table:
  - Columns: Name, Role, Leads received, Leads qualified, Leads won, Conversion %, Trend (vs
    prior period — up/down arrow)
  - Row click → drill-down panel showing the leads themselves
- Owner/admin see all rows; field_agent/cpc see their own row + drill-down only
- Empty state: "No leads assigned yet this period" with a link to /owner/leads/my

### 5.3 "Leads I assigned" widget
- Optional dashboard widget on `/owner` (owner/admin only)
- Shows last 5 leads they assigned with current status
- "View all" link → `/owner/sales/leads?assigned_by=me`

---

## §6 — RLS additions

- `lead_assignment_history` — owner/admin see all; everyone else sees only rows where they're
  the `from_user_id` or `to_user_id`
- `assign_lead` RPC's role check enforces who can call it
- The conversion-page query already filters by role per §5.2

---

## §7 — Build order for Phase 3

1. Migration 29: new table, new trigger, `assign_lead` RPC, RLS policies
2. Edge Function: `notify-lead-assigned` (model on notify-hot-lead v4)
3. Edge Function: `notify-lead-milestone` (the generic one)
4. Cold-lead cron (Postgres scheduled function)
5. Frontend: Assign modal + wiring on inbox
6. Frontend: Closing-ratio scoreboard page
7. Frontend: Optional "Leads I assigned" dashboard widget (defer if running short)
8. Smoke test (separate 10-scenario checklist for Phase 3)

---

## §8 — What this does NOT include (deferred)

- **Auto-assignment based on territory** — not in Phase 3. Comes when we have territories
  (Slice 6 Team).
- **Round-robin auto-assign** — not in Phase 3. Pattern can be added later as a setting.
- **WhatsApp notification channel** — Slice 13.
- **SLA breach alerts beyond cold (7 days)** — could add 24h-no-contact alerts later if it
  matters.
- **Assignment from the lead detail page** (`/owner/sales/leads/[id]`) — that page doesn't
  exist yet. Inbox-only for v1.

---

## §9 — Smoke test checklist for Phase 3 (run after build)

1. Owner can assign — owner clicks Assign on a pending lead, picks field agent, lead is
   assigned, bell + email fire to field agent
2. Admin can assign — same as above signed in as admin
3. Field agent CANNOT assign — Assign button doesn't appear in their UI (sidebar filter
   pattern)
4. CPC CANNOT assign — same
5. Reassignment — owner reassigns John's lead to Mary, history row created with old + new,
   reason captured, new bell + email to Mary
6. Owner sees "qualified" notification when their assignee qualifies a lead
7. Cold-lead cron fires on a 7-day-stale verified lead → notification to assigner
8. Closing-ratio page shows owner/admin all rows; field agent sees only own row
9. Reassignment doesn't double-pay R87 (idempotency check)
10. Assigning a lead that's already assigned to the same person → no-op, no new bell, no
    duplicate history row

---

## §10 — Notes for the next session

- Thapelo decided this mid-smoke (Phase 2 was 9 scenarios away from done). She explicitly
  chose to capture the spec and DEFER the build to Phase 3, not fold into Phase 2. Respect
  that — don't roll it into Phase 2 even if it feels small.
- The `lead_assigned` email template ALREADY EXISTS in send-email v23. Don't rebuild it.
- The `assigned_to`, `assigned_by`, `assigned_at` columns ALREADY EXIST on leads (migration
  26). Use them; don't recreate.
- This spec uses the SAME notification pattern as `notify-hot-lead` v4 (now the canonical
  reference for in-app + email). Copy the structure; don't reinvent.
- Closing-ratio page UI should match the bonus-motivation-layer leaderboard for visual
  consistency (similar tabs, similar drilldown). Build them in the same Slice 3 if possible.
- Migration numbering: next migration is **29** (28 = audit_log_action_freeform).
