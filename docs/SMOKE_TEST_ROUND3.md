# Smoke Test — Round 3: RPC Error Handling

**Scope:** items 21-30. Every `supabase.rpc()`, `.from().select()`, and
`.functions.invoke()` call in these 10 files now destructures `error`
and either throws (for `useQuery`) or surfaces a toast (for mutations
and plain async handlers). A failed query no longer silently returns
empty data.

**Files touched:**

| # | File | Change |
|---|---|---|
| 21 | `src/pages/owner/activity/DialLog.jsx` | `statsQ` (`get_call_stats`) now throws on error. |
| 22 | `src/pages/owner/activity/VisitLog.jsx` | `statsQ` (`get_visit_stats`) + `clientsQ` (`clients` select) now throw on error. |
| 23 | `src/pages/client/ClientActivity.jsx` | `readOne` mutation now checks error + `onError` toast; `markAll` gains `onError` toast; `sonner` toast imported. |
| 24 | `src/pages/client/Notifications.jsx` | `readMut` now checks error + `onError` toast; `markAllMut` gains `onError` toast; `sonner` toast imported. |
| 25 | `src/components/NotificationBell.jsx` | `markRead(id)` now shows `toast.error()` on failure instead of silently ignoring the error. |
| 26 | `src/pages/owner/money/Commissions.jsx` | Verified — every call already destructures error and toasts. No change needed. |
| 27 | `src/pages/owner/money/Invoices.jsx` | Both `functions.invoke('send-invoice-email')` sites (create + chase) now destructure `error`; `rpc('log_invoice_chase_sent')` now throws on error. |
| 28 | `src/pages/owner/money/Earnings.jsx` | `earnings-person` profile select now throws on error. |
| 29 | `src/pages/owner/sales/Conversion.jsx` | `fetchScoreboard` profiles + user_roles selects now check both; `meQ` profile fetch throws on error; `quotesQ` `system_settings` fetch throws on error. |
| 30 | `src/pages/client/Invoice.jsx` | Verified — dispute mutation already has destructured error, toast, and `disabled={submitting}`. Also fixed the `system_settings` banking fetch to throw on error (previously silent). |

---

## 10 Test Scenarios

Each scenario is designed to trip the specific call sites patched in this
round. Where the fix is an added error check, the "expected" outcome is a
surfaced error state (toast or MascotGuide `phase="sad"`) — the previous
behavior would have been a silent empty or wrong-data render.

### 1. Owner → Activity → Dial Log (`/owner/activity/dial-log`)

**Setup:** DevTools → Network tab → Throttle → **Offline**. Reload page.

**Expected:**
- `statsQ` fails immediately. Previously `s = {}` and the stat cards showed
  `0`. After Round 3, `statsQ.isError === true` (React Query stores the
  thrown error). Stat tiles still show `0` (Round 4 will add MascotGuide
  branch); the important verification is that the error is stored, not
  silently masked. Open React Query DevTools if available.
- `logsQ` (already had error handling) shows the "No calls logged" empty
  state or Spinner as before.

### 2. Owner → Activity → Visit Log (`/owner/activity/visit-log`)

**Setup:** Same offline setup, then open the "Log Visit" modal.

**Expected:**
- `statsQ` errors — same as scenario 1.
- Inside the modal, `clientsQ` (fetches `clients` select for the picker)
  now rejects on error rather than silently returning an empty array.
  The dropdown shows only the "New prospect" option.
- Type in a prospect name manually — the form still works.

### 3. Client → Activity (`/client/activity`)

**Setup:** Load the page while online, then throttle to Offline.
Click on a notification row to mark it read.

**Expected:**
- Previously: `readOne.mutationFn` was `async (id) => { await
  supabase.rpc('mark_notification_read', { p_id: id }); }` — the promise
  resolved on network failure and React Query saw it as "success".
- Now: the RPC returns `{ error: ... }`, mutationFn throws, and the
  `onError` handler fires `toast.error("...")`.
- Also click "Mark all read" while offline — the previously-silent
  `markAll` mutation now toasts on failure.

### 4. Client → Notifications (`/client/notifications`)

**Same as scenario 3** for `readMut` and `markAllMut`. Both mutations
now show a toast on failure instead of silently marking-in-memory.

### 5. NotificationBell (top-right bell)

**Setup:** Sign in as any user, open the bell dropdown, throttle to
Offline, click a single notification row (calls `markRead(id)` at line
136 of `NotificationBell.jsx`).

**Expected:**
- Previous behavior: `if (!error) queryClient.invalidateQueries(...)` —
  on error, this was a no-op with no user feedback.
- Now: `toast.error(error.message || 'Could not mark as read')` fires.
- The `markAllRead()` path (line 142) already had a toast.error and is
  unchanged.

### 6. Owner → Money → Invoices → Create Invoice with email

**Setup:** Log in as owner. Click "Create Invoice", pick a client with an
email, fill setup fee + due date, keep "Email invoice to client" checked.
Break the `send-invoice-email` Edge Function beforehand (e.g. rename it,
or set a bad env var so it 500s). Submit.

**Expected:**
- The invoice is created successfully (RPC returns OK).
- Previously: the `functions.invoke` call silently swallowed the error,
  and the user saw `Invoice INV-XXXX created` — the email failure was
  invisible.
- Now: after the success toast, a second `toast.error("Invoice created
  but email failed: ...")` appears. The user knows they need to resend.

### 7. Owner → Money → Invoices → Send Chase

**Setup:** Find an overdue invoice, click "Send chase". Break the
`send-invoice-email` Edge Function (or `log_invoice_chase_sent` RPC) as
in scenario 6.

**Expected:**
- Previously: the chase modal silently succeeded even if the email failed
  or the log RPC failed.
- Now: either failure throws inside the try block. The catch fires
  `toast.error('Failed: ...')` and the modal stays open. The chase log
  row is NOT created if the email failed (order preserved).

### 8. Owner → Money → Earnings (own or `/owner/money/earnings/:userId`)

**Setup:** Owner viewing another staff member's earnings. Break the
`profiles` RLS so `.eq('id', targetId).maybeSingle()` returns an error.

**Expected:**
- Previously: `person` was `undefined` and the header showed "Your
  commission dashboard." with no name.
- Now: `useQuery` stores the error. Header still shows fallback text
  because Round 3 only adds error checks (Round 4 will add explicit
  `isError` branches). React Query DevTools will show the error surfaced.

### 9. Owner → Sales → Conversion Scoreboard

**Setup:** Load `/owner/sales/conversion` while offline, or with
`profiles` / `user_roles` / `system_settings` broken.

**Expected:**
- The main useQuery already surfaces `error.message` in a `<p
  className="text-brandred">` (existing branch at line ~366).
- Previously: `meQ` (greeting profile) and `quotesQ` (motivational
  quotes) silently returned `undefined`/`[]` on error, and the hero
  header just showed "partner" without a name and no quote.
- Now: those queries throw. React Query stores errors. Falling back to
  the "partner" greeting and no-quote render is still the visual, but
  the error state is now inspectable. The main scoreboard error message
  still shows correctly for the scoreboard fetch.

### 10. Grep audit + build

```
# In repo root:
for f in src/pages/owner/activity/DialLog.jsx \
        src/pages/owner/activity/VisitLog.jsx \
        src/pages/client/ClientActivity.jsx \
        src/pages/client/Notifications.jsx \
        src/components/NotificationBell.jsx \
        src/pages/owner/money/Commissions.jsx \
        src/pages/owner/money/Invoices.jsx \
        src/pages/owner/money/Earnings.jsx \
        src/pages/owner/sales/Conversion.jsx \
        src/pages/client/Invoice.jsx; do
  echo "=== $f ==="
  grep -nE 'supabase\.(rpc|from|functions\.invoke)' "$f"
done
```

**Expected:** every match either has `const { data, error } = await
...` or `const { error } = await ...` on the same or the following
line. No bare `.data` reads.

```
npm run build
```

**Expected:** `✓ built in ...`. No syntax errors, no missing imports.

---

## Manual Regression (Round 1/2 features)

Round 3 only touched query/mutation plumbing — no route changes, no RLS
changes, no styling. A quick regression pass:

- Staff OTP login still works (Round 1).
- Client can still see own invoices, not others' (Round 1 RLS).
- PayFast checkout still redirects and returns (Round 2).
- Checkout double-submit guard still fires (Round 2).
- Log Sale flow still creates a deal + shows preview (Round 2).
