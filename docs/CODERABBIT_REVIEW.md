# CodeRabbit Review — PR #1

**PR:** [maupatrades-cmd/New-Marketingio.CRM #1 — CRM Build — Full Portal + Parallel Flow + Toolkit](https://github.com/maupatrades-cmd/New-Marketingio.CRM/pull/1)
**Reviewed by:** `coderabbitai[bot]` (Pro Plus, CHILL profile)
**Submitted:** 2026-07-08 15:30:44 UTC
**Run ID:** `59b0640e-5372-4a56-9595-535cceb00a26`
**Base → head range:** `8ca79c6…6cc385c` — 227 files selected
**State:** Review complete, no retry checkboxes, no in-progress markers

CodeRabbit's own summary:

> **Actionable comments posted: 1**
>
> Due to the large number of review comments, Critical severity comments were prioritized as inline comments. Some comments are outside the diff and can't be posted inline due to platform limitations.

That's the platform posting quota — the review body carries **26 findings** across all severities. Nothing critical was flagged; the 25 majors are all real bugs, mostly recurring patterns.

The follow-up cleanup commit (`51adb12`, migration renames + hook reorder) was scanned separately by CodeRabbit and marked "review skipped — no reviewable changes." That's a different Run ID and does not represent a new review of the whole PR.

---

## Findings

### 🟡 Minor — outside diff

| # | File | Line | Issue |
|---|---|---|---|
| 1 | `src/pages/Login.jsx` | 85-86 | `initialTab` ternary always returns `'client'` (both branches identical). Dead logic — staff bounced from `/owner/*` land on the client tab. |

**Fix suggested by CodeRabbit:**
```diff
- const initialTab = fromPath && (fromPath.startsWith('/client') || fromPath.startsWith('/welcome'))
-   ? 'client' : 'client';
+ const initialTab = fromPath && fromPath.startsWith('/owner')
+   ? 'staff' : 'client';
```

### 🟠 Major — Functional Correctness

| # | File | Line(s) | Issue |
|---|---|---|---|
| 2 | `src/pages/owner/ProfileNotifications.jsx` | 48-70 | `useQuery` v5 dropped `onSuccess`, so preference state never syncs from fetched data. Save can overwrite stored preferences with defaults. Use `useEffect` on `data`, or derive toggles directly from the query result. |
| 6 | `docs/SPEC-PHASE3-LEAD-ASSIGNMENT.md` | 88-91 | `public.has_role(uuid, app_role)` is scalar — `ARRAY['owner','admin']` doesn't match the helper contract. Use separate `has_role(...,'owner')` / `has_role(...,'admin')` checks. |
| 7 | `docs/SPEC-PHASE3-LEAD-ASSIGNMENT.md` | 133-145 | Assignee picker restricted to `field_agent/cpc` contradicts §1.3 + `assign_lead` which permit owner/admin (including self) reassignment. Expose those targets. |
| 10 | `src/constants/industryConfig.js` | 787-882 (877-880) | Fuzzy fallback uses `normalized.includes(term)` — `'hospitality'.includes('it')` is true, so free-text `hospitality` misroutes to `it_support`. Match whole words or exact phrases. |
| 11 | `src/pages/client/DeliverableDetail.jsx` | 9-14 | `TIMELINE.findIndex()` only recognises `in_progress`/`submitted`/`approved`/`delivered`. Valid statuses `awaiting_client`, `client_reviewing`, `deemed_approved`, `completed` show zero progress. Timeline connector `<div>` is always `hidden` — line never renders. Also: "Request changes" gate should treat `deemed_approved`/`completed` as final. |
| 12 | `src/pages/client/ClientActivity.jsx` | 45-52 | `readOne.mutationFn` never checks `error`; `markAll` has no `onError`. |
| 13 | `src/pages/client/Notifications.jsx` | 40-57 | `mark_notification_read` swallows RPC errors; no user-facing error feedback. |
| 14 | `src/pages/client/Onboarding.jsx` | 568-572 | `SignaturePad` uses a fixed 560×160 buffer but renders `w-full`. Pointer positions read in CSS pixels land wrong on displays where width ≠ 560. Scale by canvas/rect ratio in `getPos`. |
| 15 | `src/pages/client/biz/BizBookingDetail.jsx` | 35-45, 47-56 | `useEffect` resets `form` from `bookingQ.data` on every change — `saveMut.onSuccess` invalidation + `refetchOnWindowFocus` discard mid-edit state. Hydrate once per `id`. |
| 19 | `src/pages/client/biz/BizCustomerDetail.jsx` | 101, 108-121 | `ProfileTab.form` seeded from `customer` only on mount. React Router reuses the component across `/client/my-business/customers/:id` — switching customers shows stale field values. Force-remount with `key={c.id}`. |
| 21 | `src/pages/client/biz/BizNotes.jsx` | 64-68 | No `notesQ.isError` branch — a failed RPC falls through to "No notes yet". |
| 22 | `src/pages/client/biz/BizCustomers.jsx` | 122-126 | No `listQ.isError` branch — failed/thrown RPC (including explicit `throw` at line 52) falls through to empty state. |
| 23 | `src/pages/client/biz/BizBookings.jsx` | 114-159 | `listQ` has no `isError` branch; RPC failure yields `bookings = []` and silent empty-state UI. Mirror `BizDashboard.jsx`. |
| 24 | `src/pages/owner/Approvals.jsx` | 120-157 | `execAction` only wires RPCs for `commissions`, `leads`, `finance`, `tasks`, `sales`. Unmatched combos (e.g. `fulfilment`/`paperwork`, or `reject` on a `commissions` item) return `error = undefined`, the `if (error)` throw passes, and the user sees a **false success toast**. Track a `handled` flag and throw when unhandled. |
| 25 | `src/pages/owner/ClientMessageInbox.jsx` | 22-24, 92-98 | `replyText` isn't cleared when `setSelectedClient` fires — a draft for Client A can be sent to Client B on next Enter/Send. |

### 🟠 Major — Stability & Availability

| # | File | Line(s) | Issue |
|---|---|---|---|
| 4 | `docs/HANDOVER_5_CLIENT_PORTAL.md` | 146 | `EXCEPTION WHEN OTHERS THEN NULL` in the owner-sale fan-out breaks the no-silent-catches rule. Log/audit before returning. |
| 8 | `src/pages/owner/activity/VisitLog.jsx` | 34-40 | Same missing error check on `statsQ` as `DialLog.jsx`. Silent zeros on failure. |
| 9 | `src/pages/owner/activity/DialLog.jsx` | 34-40 | `statsQ.queryFn` reads only `.data` — RPC errors silently succeed with `undefined`/`null`. Fix: destructure `error`, `throw` on failure. |
| 16 | `src/pages/client/Checkout.jsx` | 55-82 | No guard against rapid double-submit — `client_self_purchase` can create duplicate deals + invoices. Add `if (submitting) return;` at top of `submit`. |
| 17 | `src/pages/client/biz/BizBookingDetail.jsx` | 58-60 | Gate only checks `bookingQ.isLoading \|\| !form`. On RPC error, `form` never sets — user stuck on indefinite "Loading..." spinner. Add `bookingQ.isError` branch. |
| 20 | `src/pages/client/biz/BizBookings.jsx` | 64-72, 142-153 | `statusMut` is shared across every list row; rapid Complete/Cancel clicks fire overlapping `biz_update_booking` calls. `disabled={statusMut.isPending}` or track in-flight id. |

### 🟠 Major — Data Integrity & Integration

| # | File | Line(s) | Issue |
|---|---|---|---|
| 5 | `docs/PRE-LAUNCH-CLEANUP.md` | 20-23 | Rotating `auth.users.encrypted_password` via direct SQL skips Auth bookkeeping. Use the dashboard or `supabase.auth.admin.updateUserById(...)`. |
| 18 | `src/pages/client/biz/BizBookingForm.jsx` | 48-83 | Submit has no re-entrancy guard — fast double-click can create duplicate customers (`biz_add_customer`) and/or duplicate bookings (`biz_add_booking`). Add `if (saving) return;`. |
| 26 | `src/pages/owner/ClientMessageInbox.jsx` | 154-167 | Enter-key send bypasses the pending-mutation guard. Send button disables on `replyMut.isPending`; textarea `onKeyDown` only checks `replyText.trim()`. Add `&& !replyMut.isPending`. |

### 🟠 Major — Documentation-only

| # | File | Line(s) | Issue |
|---|---|---|---|
| 3 | `docs/HANDOVER_4.md` | 285-286 | Bug C: `submit_signup`'s outer `when others` handler writes to non-existent `audit_log.record_id`/`metadata`. Real columns are `row_id`/`after_data`. Emit a corrective migration so signup failures keep their audit trail. |

---

## Recurring patterns worth batching

CodeRabbit called these out — worth fixing at the codebase level rather than file-by-file:

1. **Silent Supabase RPC error swallowing** (#8, #9, #12, #13, #21, #22, #23). Same shape: `queryFn` reads only `.data` from `supabase.rpc(...)`, or `mutationFn` never destructures/throws `error`. A one-line codebase convention would fix them all.
2. **Missing `isError` UI branches on TanStack Query lists** (#17, #21, #22, #23).
3. **Missing double-submit / re-entrancy guards on non-idempotent RPCs** (#16, #18, #20, #26).
4. **`useQuery` v5 `onSuccess` removal** (#2 in `ProfileNotifications`) — worth grepping the tree for other `onSuccess` still on `useQuery`.

---

## Suggested triage

- **Fix immediately (production risk):** #16 (Checkout double-submit → duplicate deals/invoices), #18 (BizBookingForm double-submit), #24 (Approvals false-success toast), #25/#26 (ClientMessageInbox reply crosstalk + double-send), #2 (ProfileNotifications preference save can wipe stored prefs).
- **Fix soon (silent UX degradation):** #8, #9, #12, #13, #17, #21, #22, #23 (all the error-swallowing / missing isError findings).
- **Fix during cleanup pass:** #1 (Login dead ternary), #10 (industry fuzzy match), #11 (DeliverableDetail timeline), #14 (SignaturePad DPI), #15 (BizBookingDetail refetch clobbers edits), #19 (BizCustomerDetail stale form), #20 (BizBookings status race).
- **Docs only:** #3, #4, #5, #6, #7.

---

*Report generated 2026-07-08.*
