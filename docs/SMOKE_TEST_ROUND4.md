# Smoke Test — Round 4: Error Branches + Loading States + Signup

**Scope:** items 31-40. Adds explicit `isError` branches (MascotGuide sad
+ retry button) to the 4 Biz pages, a loading state to ClientProducts
and the two owner "new" forms, a `handled` guard in Approvals so
unsupported category/action combos can no longer fire a false success
toast, and two SignUp corrections (redirect target + duplicate-email
UX).

**Files touched:**

| # | File | Change |
|---|---|---|
| 31 | `src/pages/client/biz/BizBookingDetail.jsx` | New `bookingQ.isError` branch — MascotGuide sad + Try again button; the loading guard now stays on `thinking` only while not errored. |
| 32 | `src/pages/client/biz/BizNotes.jsx` | New `notesQ.isError` branch between loading and empty. |
| 33 | `src/pages/client/biz/BizCustomers.jsx` | New `listQ.isError` branch between loading and empty. |
| 34 | `src/pages/client/biz/BizBookings.jsx` | New `listQ.isError` branch between loading and empty. |
| 35 | `src/pages/client/ClientProducts.jsx` | `dashQ.isLoading` shows MascotGuide thinking; `dashQ.isError` shows sad + retry (prevents "Buy" flashing for already-owned services during initial load). |
| 36 | `src/pages/owner/calls/CallNew.jsx` | Moved lead-prefill from render-time setState (React anti-pattern) into a `useEffect`; added `Loader2` loading gate for `leadId && leadQ.isLoading`, plus an error/retry state. |
| 37 | `src/pages/owner/appointments/AppointmentNew.jsx` | Added `waitingOnPrefetch` gate covering `staffQ.isLoading` + optional `leadQ.isLoading` → spinner state; lead-error → retry. |
| 38 | `src/pages/owner/Approvals.jsx` | Added `handled` flag in `execAction` — every RPC mapping now flips it to `true`; unmatched (category, code) combos throw `Action "…" is not supported for …` instead of firing a success toast. |
| 39 | `src/pages/SignUp.jsx` | `finalSubmit` now navigates to `/welcome` (not `/owner`). |
| 40 | `src/pages/SignUp.jsx` | Duplicate-email detection on `supabase.auth.signUp` errors (`code === 'user_already_exists'` or `/already (registered\|exists)/i`); toast shows a "Sign in" action button that jumps to `/login`, and returns the user to Step 1 (email field). |

---

## 10 Test Scenarios

### 1. BizBookingDetail — error state

Open `/client/my-business/bookings/<id>` while offline (or with the
`biz_get_bookings` RPC renamed). Expected:

- Loading state briefly (MascotGuide thinking).
- Transitions to MascotGuide **sad** with the error message.
- A **Try again** button appears; clicking it calls `bookingQ.refetch()`.
- The "not found" fallback only fires when the query succeeded but no
  row matched — not on network errors.

### 2. BizNotes — error state

Open `/client/my-business/notes` while offline. Expected:

- Loading state → MascotGuide sad + Try again.
- Clicking Try again re-fetches. Restoring the network makes the notes
  list render.
- Empty-state ("No notes yet") only fires on a *successful* empty
  response.

### 3. BizCustomers — error state

Open `/client/my-business/customers` while offline. Expected: same
pattern — sad + Try again. The search/filter row and Add button remain
visible so the user can still trigger Add or Export retry.

### 4. BizBookings — error state

Open `/client/my-business/bookings` while offline. Expected: same
pattern. Week-view vs list-view toggle at the top still works after
retry lands.

### 5. ClientProducts — loading state

Open `/client/products` on a slow connection (DevTools → Slow 3G).
Expected:

- Before Round 4: cards rendered immediately, briefly showing "Buy"
  for services the client already owns (racy).
- After Round 4: MascotGuide **thinking** ("Loading products…") sits
  where the grid would be, until `dashQ` resolves.
- If `dashQ` errors: MascotGuide **sad** + Try again button. The Custom
  packages section and FAQ still render below.

### 6. CallNew — loading state

Navigate to `/owner/calls/new?lead=<real-lead-id>` on a slow
connection. Expected:

- Before Round 4: form flashes empty, then fields hydrate as `leadQ`
  lands (via a setState-during-render call — noisy in dev).
- After Round 4: spinner "Loading lead details…" until `leadQ`
  resolves. Then the form appears with the lead's name and phone
  pre-filled. No React anti-pattern warning in the console.
- Navigate without a `lead` query param → form renders instantly (no
  loading state).
- `leadQ` errors → error message with Try again button.

### 7. AppointmentNew — loading state

Navigate to `/owner/appointments/new` on a slow connection. Expected:

- Spinner "Getting things ready…" until `staffQ` resolves (needed for
  the "Assign to" dropdown).
- With `?lead=<id>` the gate additionally waits on `leadQ`.
- Lead error → Try again button.

### 8. Approvals — unsupported action guard

In `/owner/approvals`, open the **Fulfilment** tab. Try to trigger an
`approve` action on any row (Fulfilment has no `approve` RPC wired in
`execAction`). Expected:

- Before Round 4: `error` variable stayed `undefined`, so
  `toast.success("Approve — done")` fired even though no RPC ran.
- After Round 4: the `handled` flag stays `false`, and the catch fires
  `toast.error('Action "approve" is not supported for fulfilment.')`.
- The row is not marked as approved; refetches confirm no state change.

Quick reproducer without opening the UI:
```
// In a browser console on /owner/approvals with Approvals open:
// Force an "approve" on a fabricated fulfilment item —
// the handler should now throw before hitting supabase.
```
(In practice the buttons that trigger `approve` on unsupported categories
were rare, but the guard closes the false-success class of bugs.)

### 9. SignUp — redirect to /welcome

Complete a fresh signup with a brand-new email. Expected:

- Toast "Welcome aboard." fires.
- Browser navigates to **`/welcome`** (not `/owner`).
- The Welcome page loads and eventually forwards to `/client`.

Verify no other `/owner` redirect exists in `SignUp.jsx`:
```
grep -n "navigate.*owner" src/pages/SignUp.jsx
```
Expected: 0 hits.

### 10. SignUp — duplicate-email UX

Start a signup with an email that already has an account. Expected:

- Before Round 4: raw Supabase error message ("User already registered")
  bubbled to a toast with no next step. Users often re-tried the same
  form and looped.
- After Round 4: friendly toast **"This email already has an account.
  Try signing in instead."** with a **Sign in** button that navigates
  to `/login`. Step index resets to 1 so the user is looking at the
  email field again.

Detection triggers on any of:
- `signupError.code === 'user_already_exists'`
- Error message matches `/already (registered|exists|been registered)/i`
- Error message matches `/user.*exists/i`

---

## Self-review verification

- No React hooks after early returns in any file touched
  - BizBookingDetail: early return sits after the useEffect; only the render tree follows.
  - CallNew: early returns sit after `useNavigate → useSearchParams → useState × 2 → useQuery → useEffect`. `handleSubmit` is a regular function.
  - AppointmentNew: early returns sit after `useNavigate → useSearchParams → useState × 2 → useQuery × 2`. `handleSubmit` follows as a regular function.
  - ClientProducts / BizNotes / BizCustomers / BizBookings: no early returns — the changes are ternary branches inside JSX. All hooks still run every render.
- Every mutation kept its existing `onError` + `disabled={isPending}` (no mutation changes this round).
- Every navigate() targets a real App.jsx route:
  - `/welcome` exists at `App.jsx:297`.
  - `/login` exists (used by SignUp step reset).
  - No new navigate targets introduced elsewhere.
- All imports resolve: `MascotGuide` from `../../components/MascotGuide.jsx` (used across the codebase), `Loader2` from `lucide-react`, `useEffect` from `react`.
- `npm run build` → clean pass.
- `grep console.log` across all 9 changed files → 0 hits.
