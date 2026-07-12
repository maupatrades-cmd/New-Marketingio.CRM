# Round 2 smoke test — integration items 11-20

Manual smoke steps for the 10 items shipped in
`fix(security-round2)`. Run against the `claude/integration` preview
after migration 106 is applied and Edge Functions are redeployed with
`APP_URL` set in the Supabase project's Function Secrets.

---

## Prereqs

1. Migration 106 applied on the target Supabase project (SQL Editor →
   run `supabase/migrations/106_round2_rls_hardening.sql`).
2. Edge Functions redeployed:
   - `send-client-login-link`
   - `send-email`
   - `payfast-init`
   - `payfast-itn`
3. Supabase project has `APP_URL` set in Function Secrets pointing at
   the preview URL:
   `https://new-marketingio-crm-git-claude-integration-thapelo-l.vercel.app`
4. GUCs set on the DB for the trigger fan-out:
   ```sql
   alter database postgres set app.settings.supabase_url = 'https://<project>.supabase.co';
   alter database postgres set app.settings.supabase_anon_key = '<anon_jwt>';
   ```
   Applies on the next connection — reload PostgREST after.

---

## 1. RLS — `invoice_payment_proofs` SELECT scoped

In SQL Editor as **Client A** (impersonate via
`select set_config('request.jwt.claim.sub', '<client-a-user-uuid>', true);`
+ `set role authenticated;`):

```sql
select id from invoice_payment_proofs
where invoice_id in (
  select id from invoices where client_id in (
    select id from clients where client_user_id != auth.uid()
  )
);
```

**Expected:** 0 rows.

Then as **any owner/admin/coordinator/head_of_tech** user — same query
without the `!=` filter — expect to see all rows.

## 2. RLS — `monthly_reports` UPDATE can't reroute a report

As **head_of_tech** (has write per USING), try:

```sql
update monthly_reports
   set client_id = '<some-other-client-uuid>'
 where id = '<a-report-you-can-see>';
```

**Expected:** succeeds (staff role passes both USING and the mirrored
WITH CHECK). Now sign in as an **assigned client** (not head_of_tech):

```sql
update monthly_reports set status = 'delivered' where id = '<any>';
```

**Expected:** 0 rows updated (USING blocks non-staff).

## 3. RLS — `tasks` can't be reassigned outside caller's scope

As **field_agent** who is `assigned_to` on task X:

```sql
update tasks set assigned_to = '<owner-uuid>' where id = '<task X>';
```

**Expected:** `new row violates row-level security policy for table "tasks"`
(the mirrored WITH CHECK rejects reassigning to a user the caller isn't).

Owner performing the same UPDATE succeeds.

## 4. RLS — `client_onboarding` write mirrors USING

As a **non-assigned admin_id** user who is not owner/admin:

```sql
update client_onboarding set stage = 'complete' where id = '<any>';
```

**Expected:** 0 rows (USING blocks). As an assigned admin: succeeds.

## 5. Checkout double-submit guard

1. Log in as a client, open `/client/checkout/starter_boost`.
2. Rapidly press Enter or click **Complete purchase** 5 times.
3. Watch Network tab.

**Expected:** exactly ONE `client_self_purchase` POST goes out. Button
disables to "Issuing your invoice…" immediately after the first click.

## 6. BizBookingForm double-submit guard

1. Client with a `salon` industry → `/client/my-business/bookings/new`.
2. Fill in **New customer** with email `test-race@example.com`, pick a
   date, hit submit twice fast.

**Expected:** exactly one `biz_add_customer` call, exactly one
`biz_add_booking` call. No duplicate customer row created.

## 7. BizBookings per-row mutating guard

1. `/client/my-business/bookings` list view with ≥ 2 confirmed
   bookings.
2. Click **Complete** on booking A; while it's still spinning, click
   **Complete** on booking B.

**Expected:** booking A's row shows "Saving…" and disables its buttons.
Booking B's click is ignored while A is in flight (no second RPC fires).
When A settles, B's buttons re-enable and you can click **Complete**
again.

## 8. ClientMessageInbox reply clears + Enter guard

1. `/owner/comms/client-messages`, select **Client A**, type
   "Hi Client A" in the reply box.
2. Without sending, click **Client B** in the left panel.

**Expected:** reply box is empty (draft NOT sent to B).

Then with Client A selected:
1. Type a reply.
2. Press Enter, and immediately Enter again before the toast fires.

**Expected:** exactly one `reply_to_client_message` RPC.

## 9. APP_URL — Edge Function fails loud if unset

Temporarily unset `APP_URL` in Supabase Function Secrets → redeploy
`send-client-login-link`. Trigger a login-link send from the login page.

**Expected:** browser shows a network failure; the function logs
`[send-client-login-link] APP_URL env is not set` and returns 503
`{ ok: false, error: 'app_url_not_configured' }`.

Restore `APP_URL` after this test.

## 10. Migrations 16 + 19 — no hardcoded JWT

```bash
grep -n "eyJ" supabase/migrations/16_post_sale_orchestrator.sql \
              supabase/migrations/19_owner_sale_alerts.sql
```

**Expected:** 0 matches.

Close a deal (`close_sale` RPC) with `stage='closed_won'` on a project
where `app.settings.supabase_anon_key` is set — verify the
post-sale-orchestrator and notify-owner-sale Edge Functions receive the
request (check Edge Function logs).

Then unset the GUC (`alter database postgres reset app.settings.supabase_anon_key;`
+ reload) and close another deal — verify `raise notice` appears in the
Postgres log stream and the trigger returns without calling the
Function (no 401 crash).

---

## Post-round audit checklist

- [ ] `grep -n "eyJ" supabase/migrations/16_*.sql supabase/migrations/19_*.sql`
      returns nothing (other migrations still carry the same JWT — those
      are out of scope until a later round explicitly names them)
- [ ] `grep -n "new-marketingio-crm-git-claude" supabase/functions/{send-client-login-link,send-email,payfast-init,payfast-itn}/index.ts`
      returns nothing (other Edge Functions still hardcode the fallback
      — item 15 only names these four)
- [ ] `npm run build` passes
- [ ] Every touched React file: hooks at top level, no hooks after early return
- [ ] Every touched mutation: has `onError`; button `disabled={isPending}`

Confirm all 10 items before starting Round 3.
