# Round 1 Smoke Test (Items 1-10)

## Scope
Auth & security core. 10 fixes covering staff OTP bypass, auth hang, role
redirects, PayFast PII gating, and 5 RLS policy tightenings.

## Files changed
- `src/pages/Login.jsx` — staff OTP flow reworked; session is now created
  ONLY after image captcha passes (not after OTP verify). Auto-redirect
  now role-aware.
- `src/lib/auth.jsx` — `authError` state added and exposed via context;
  `getSession()` errors surface without hanging on "Loading…".
- `src/App.jsx` — new `RequireClientRole` guard; new `RootRedirect`
  component; `RequireAuth` shows a Retry card when Supabase is unreachable
  and there's no session; `RequireRole` bounces clients to `/client` (not
  the "not authorised" screen).
- `supabase/functions/payfast-itn/index.ts` — verbose signature-base
  logging gated behind `PAYFAST_DEBUG`; `client_activity_log` rows for
  bad signatures no longer persist raw PII bases unless debug is on.
- `supabase/functions/payfast-init/index.ts` — same PAYFAST_DEBUG gate;
  `_debug` response echo is now server-authorised, not client-requested.
- `supabase/migrations/104_round1_rls_hardening.sql` — 5 policy fixes,
  applied to live DB.

## Self-review checklist (all pass)
- [x] No React hooks after early returns in any file I touched
- [x] Every supabase.rpc() call in touched files handles errors
- [x] Every useEffect deps array includes all reads (role, roleLoaded)
- [x] No hardcoded URLs added
- [x] No console.log left in production frontend code (debug logs are
      server-side and env-gated)
- [x] Every navigate() targets a real route (`/login`, `/owner`, `/client`)
- [x] RLS policies use scoped predicates (no USING(true), no
      WITH CHECK (true) except where SECURITY DEFINER RPCs need it)
- [x] `npm run build` passes clean

## Manual smoke test steps

### Auth flow
1. **Staff OTP bypass** — Open `/login` on Staff tab. Enter password +
   captcha. When OTP screen appears, DO NOT enter the code. Try typing
   `/owner` in the URL bar → should redirect to `/login` (session was
   signed out on the credentials step, so `RequireAuth` bounces you).
2. **Staff full flow** — Enter password → OTP → image captcha. Only after
   captcha completes should `/owner` load. Toast: "Welcome back".
3. **Staff bypass at captcha stage** — Repeat, but at image_verify stage,
   try navigating to `/owner` manually. There is NO session at this stage
   (we no longer create it after OTP), so `RequireAuth` sends you back
   to `/login`.
4. **Client magic link** — Client tab → email link → sign in. Should
   land on `/client`, never `/owner`.
5. **Client tries /owner** — With a client account, manually navigate to
   `/owner`. `RequireRole` sees client role, bounces to `/client`.
6. **Staff tries /client** — With a staff account, manually navigate to
   `/client/invoices`. `RequireClientRole` bounces to `/owner`.
7. **Auth hang** — Simulate Supabase outage (block *.supabase.co in
   devtools). Open `/owner`. Should show "Connection problem — Retry"
   card, NOT infinite spinner.

### PayFast PII (Edge Function logs)
8. **PII gated** — Confirm `PAYFAST_DEBUG` is unset in prod. Trigger a
   PayFast test payment. Check `payfast-itn` and `payfast-init` logs:
   should contain `mPaymentId`, `pfPaymentId`, `pair_count`, etc. — but
   NO `name_first`, `name_last`, `email_address`, or raw signature base.
9. **PII available for debug** — Set `PAYFAST_DEBUG=true`, redeploy,
   trigger again. Now the verbose branch fires and full base string is
   logged. Turn back off after.

### RLS
Run these as the anon key from Supabase SQL editor (`SET LOCAL ROLE anon;`
then `SELECT auth.uid();` is NULL — so all predicates fail):

10. `SELECT * FROM banking_vault` → 0 rows
11. `SELECT * FROM chase_log` → 0 rows
12. `SELECT * FROM contract_checklist_admin` → 0 rows
13. `SELECT * FROM contract_checklist_sales` → 0 rows
14. `SELECT * FROM contract_initials` → 0 rows

And as a signed-in test client A trying to insert as client B:

15. `INSERT INTO client_messages (client_id, sender_user_id, is_from_client, body)
     VALUES ('<client-B-id>', auth.uid(), true, 'hack')` → rejected by RLS

## Notes
- No new dependencies. No env-var changes required for prod (PAYFAST_DEBUG
  is opt-in). Existing `APP_URL` still handled (round 2 will move it to
  a strict env-var read).
