# SLICE 2 — Sales Engine — Porting Playbook

> **Read this before writing any code for `/owner/sales`.**
> Read `HANDOVER.md` for full context first, then this file, then grep the
> OLD Base44 codebase (`base44/`) BEFORE inventing anything.
>
> Foundation (slice 1) is **green**: 18 tables + RLS + audit, 6 RPCs deployed
> (`close_sale`, `get_owner_dashboard`, `submit_signup`, `has_role`,
> `current_user_role`, `audit_trigger`), owner role granted to
> `business.lekgoro@gmail.com`, Resend + Pexels Edge Functions live,
> emails wrapped in the new Cloudinary header/footer.

---

## 1. What slice 2 ships

Four owner-facing surfaces under `/owner/sales`, in **priority order**:

| Order | Route | Surface | Walkthrough §2 ref |
|---|---|---|---|
| **1** | `/owner/sales/log` | **Log Sale form** → calls `close_sale(payload jsonb)` | §2.3 |
| 2 | `/owner/sales` | Sales-opportunities **kanban** (pre-close pipeline) | §2.2 |
| 3 | `/owner/sales/leads` | **Leads** list + verification | §2.1 |
| 4 | `/owner/sales/deals` | **Deals** list (post-close), plus Upsell start point | §2.4 |

The Log Sale form ships first. The other three depend on having real
`deals`/`leads` rows to render — and `close_sale` is the only thing that
creates them today, so it goes first.

---

## 2. OLD files to read FIRST (do NOT invent — port)

Grep these in `marketing-io-crm-main/` before writing a single line. They
contain real copy, real edge cases, real bug fixes:

| # | File | Why |
|---|---|---|
| 1 | `base44/functions/log-sale/entry.ts` (755 lines) | The full closing flow we replaced with `close_sale()` SQL. Read for: commission math, CPC bonus rules, admin contract-load, owner→founder mapping, ClientActivityLog payload. |
| 2 | `base44/functions/log-sale-on-behalf/entry.ts` | Variation when an admin closes on behalf of another closer. Different attribution rules. |
| 3 | `src/pages/LogSale.jsx` (423 lines) | The OLD form. Field validation, package picker UX, "client lookup or create" toggle, error toasts. **Copy the field layout, not the Base44 SDK calls.** |
| 4 | `src/pages/LogSaleOnBehalf.jsx` | The "log on behalf" variant. |
| 5 | `src/pages/SalesOpportunities.jsx` (505 lines) | Kanban for stages `new_lead → discovery_visit → proposal_sent → negotiation`. Drag-and-drop via `@hello-pangea/dnd`. |
| 6 | `src/pages/Deals.jsx` (478 lines) | Post-close list. Sorting, filtering, drill-in. |
| 7 | `src/pages/Leads.jsx` (505 lines) | Inbound + outbound leads, "verify" action, "convert to deal" flow. |
| 8 | `src/pages/Upsell.jsx` (159 lines) | Add-on sale starts here. Calls `close_sale` with `deal_type='add_on'`. |
| 9 | `base44/entities/Deal.jsonc`, `Lead.jsonc`, `Commission.jsonc`, `Client.jsonc` | The field semantics. Our SQL tables already mirror snake_case names — verify each form binding maps cleanly. |

Quick grep cheat-sheet:

```bash
# Find every place the old code reads commission rates
grep -rn "commission_rates\|setup_pct\|retainer_pct\|flat_amount" base44/

# Find every place a Deal is written
grep -rn "Deal\.create\|Deal\.update" base44/ src/

# Find the kanban DnD wiring
grep -rn "Droppable\|Draggable\|onDragEnd" src/pages/
```

---

## 3. Six bugs we MUST NOT reintroduce

These cost real money/hours in the old codebase. Each is tied to a
HANDOVER §5 carry-over rule. Preserve.

| # | Bug pattern (old) | Rule (new) | Where it bit us |
|---|---|---|---|
| 1 | `Commission.staff_role` enum lacked `'owner'` → every owner-closed sale silently rejected its commission row | **Map owner → founder** in any JS/SQL that writes `commissions.staff_role`. Already baked into `close_sale()`. Re-check in any new form that writes directly. | log-sale, log-sale-on-behalf |
| 2 | Hardcoded commission rates (7%, 7.5%, R444, R130) inlined in JS — every rate-change shipped a PR | **No constants in code.** Always read from `public.system_settings.commission_rates`. Forms read it via `supabase.from('system_settings').select('value').eq('key', 'commission_rates')`. | LogSale.jsx old, log-sale entry.ts |
| 3 | `try { await sendOTP() } catch (_) {}` masking real Resend failures — nearly locked the owner out | **No silent catches.** Every catch either rethrows, returns a structured error, or logs + records to `client_activity_log`. Three allowed patterns in §5. | auth-login, auth-register, log-sale |
| 4 | 9 sequential `Client.create → Deal.create → Commission.create …` writes — step 6 failures produced orphan Client rows | **Multi-table writes go through `close_sale()`.** Never chain `.from().insert()` from the form. The RPC wraps everything in one Postgres transaction. | log-sale entry.ts (original cascade) |
| 5 | `/staff` route registered twice → first match wins, staff users land on HR by accident | **One route per path.** When you add `/owner/sales/*`, audit the router for collisions BEFORE shipping. | App.jsx in old repo |
| 6 | RLS read rule on `ClientActivityLog` used `user_condition` that didn't resolve role for AppUser sessions → owner Activity tab empty | **Read-paths that need role MUST use `has_role(auth.uid(),…)`** — the SECURITY DEFINER function we built. Never inline role checks. | OwnerClientDetail Activity tab |

---

## 4. Silent-catch sites in the old codebase (14+ catalogued)

`grep -rln "catch (_)" base44/functions/` returns **18 files** in the old
codebase. The biggest offenders (the ones whose error path matters for
slice 2):

| File | Risk |
|---|---|
| `base44/functions/auth-login/entry.ts` | OTP send failure swallowed — see bug #3 above. |
| `base44/functions/auth-register/entry.ts` | Welcome email failure swallowed. |
| `base44/functions/auth-verify-otp/entry.ts` | Already in slice 2 because Sign Up needs OTP verify. |
| `base44/functions/send-thread-message/entry.ts` | Email-on-message swallow. |
| `base44/functions/send-followup-reminder/entry.ts` | Reminder failures hidden. |
| `base44/functions/send-campaign/entry.ts` | Campaign send failures swallowed. |
| `base44/functions/notifySignatureComplete/entry.ts` | Contract-signed email swallow. |
| `base44/functions/generate-marketing-image/entry.ts` | AI image failure swallow. |
| `base44/functions/launch-readiness-check/entry.ts` | Readiness check fail swallow. |
| `base44/functions/cancel-account-deletion/entry.ts` | Audit log fail swallow. |
| `base44/functions/recover-account/entry.ts` | Recovery email fail swallow. |
| `base44/functions/process-pending-deletions/entry.ts` | Per-user delete fail swallow. |
| `base44/functions/sign-out-everywhere/entry.ts` | Session-cleanup fail swallow. |
| `base44/functions/list-thread-messages/entry.ts` | Read fail swallow. |

**Three allowed catch patterns in the rebuild:**

```ts
// 1. Rethrow as a structured error
try { await x(); } catch (err) {
  throw new Error(`Failed to do X: ${err?.message ?? err}`);
}

// 2. Capture + record (when the call is fire-and-forget)
try { await sendEmail(...); } catch (err) {
  await supabase.from('audit_log').insert({
    table_name: 'email_send_failures',
    action: 'INSERT',
    after_data: { template: 'welcome', error: String(err?.message ?? err) },
  });
}

// 3. Surface to the caller via { ok, error } (never swallow)
try { const r = await rpc(...); return { ok: true, data: r }; }
catch (err) { return { ok: false, error: String(err?.message ?? err) }; }
```

`catch (_) {}` is BANNED. Code review must reject any PR containing it.

---

## 5. `close_sale()` payload shape (front-end → RPC)

Already deployed (`supabase/migrations/04_close_sale_rpc.sql`). The Log
Sale form posts exactly this JSON via `supabase.rpc('close_sale', { payload })`:

```ts
type CloseSalePayload = {
  // Closer + deal mechanics
  deal_type?: 'core_package' | 'add_on';   // default 'core_package'
  package?: 'ignite' | 'accelerate' | 'dominate' | 'street_pulse' | 'township_pulse';
  add_on_name?: string;                    // required if deal_type='add_on'
  source?: 'cpc_outbound' | 'field_agent_direct' | 'fnc_referral'
         | 'inbound' | 'referral' | 'other';

  // Money
  setup_fee?: number;                      // ZAR. >= 0
  monthly_retainer?: number;               // ZAR. >= 0

  // CPC attribution (optional — only when a distinct CPC sourced the lead)
  cpc_id?: string;                         // uuid

  // Client — EITHER existing client_id OR full new-client fields
  client_id?: string;                      // uuid (existing client)

  client_business_name?: string;           // required when no client_id
  client_contact_person?: string;
  client_email?: string;
  client_phone?: string;
  client_address?: string;
  client_industry?: string;
};
```

Return shape:

```ts
type CloseSaleResult = {
  success: true;
  client_id: string;
  deal_id: string;
  contract_id: string;
  onboarding_id: string;
  commission_rows_written: number;
  deliverables_created: number;
  tasks_created: number;
  new_client_created: boolean;
  signing_token: string;        // hex, for the contract signing URL
};
```

Errors propagate as Postgres exceptions with sensible errcodes
(`42501` = authz, `22023` = bad input, `23503` = FK miss). The form
should catch + toast `error.message`.

---

## 6. 10-row test matrix

Every row should pass before slice 2 ships. Build a small e2e or manual
checklist.

| # | Closer role | Deal type | Package / Add-on | Setup | Monthly | CPC | Expected outcome |
|---|---|---|---|---|---|---|---|
| 1 | owner | core_package | ignite | 3980 | 490 | — | 2 commission rows (founder setup 7% + retainer 7%×12) + 1 admin R25 + 6 deliverables. `commission_generated=true`. |
| 2 | owner | core_package | dominate | 9800 | 1490 | — | Setup 7% + retainer 7.5%×12. |
| 3 | owner | core_package | street_pulse | 700 | 4000 | — | Flat R444 commission. No retainer line. |
| 4 | owner | core_package | township_pulse | 2200 | 0 | — | Flat R130 commission. |
| 5 | cpc | core_package | accelerate | 6500 | 890 | (caller) | Setup 7% + retainer 7%×12 + CPC closure-bonus R250 (caller-as-cpc). |
| 6 | field_agent | core_package | ignite | 3980 | 490 | distinct cpc | Field agent setup + retainer + admin R25 + CPC separate-closer-bonus R250. |
| 7 | admin | core_package | ignite | 3980 | 490 | — | Admin setup + retainer commissions. No admin contract-load (caller IS admin). |
| 8 | owner | add_on | "AI Chatbot" | 2500 | 0 | — | `add_on_once_off` commission = 2500. Contract has package='add_on'. |
| 9 | client | core_package | ignite | … | … | — | **Rejected:** `42501 Role client is not permitted to close sales`. |
| 10 | owner | core_package | (invalid pkg) | — | — | — | **Rejected:** `22023 Invalid package …`. Form should show field error, not generic. |

---

## 7. Implementation order

1. **`/owner/sales/log` — Log Sale form**
   - Port field layout from `src/pages/LogSale.jsx`
   - Read `system_settings.commission_rates` to display "you will earn ~Rx" preview
   - Read `system_settings.package_catalog` for the package radio cards
   - On submit: `supabase.rpc('close_sale', { payload })` (see §5 shape)
   - On success: toast `+ R<setup>+R<monthly>/mo to <client>. Contract drafted.` and redirect to `/owner/sales/deals/:dealId`
   - On error: `toast.error(error.message)`; if errcode 22023, highlight the offending field
2. **`/owner/sales/deals` — Deals list**
   - `supabase.from('deals').select('*').order('closed_at',{ascending:false})`
   - Filter by stage, closer, source. Click row → drill into deal detail (slice 4 will fill that page)
3. **`/owner/sales` — Sales-opportunities kanban**
   - 4 columns (`new_lead`, `discovery_visit`, `proposal_sent`, `negotiation`)
   - DnD via `@hello-pangea/dnd`; on drop update `deals.stage`
   - "Close-Won" drop target opens the Log Sale form pre-filled from the deal
4. **`/owner/sales/leads` — Leads list**
   - `from('leads').select('*')` + filter pending_verification / verified / converted
   - "Verify" action: update lead.status, write `client_activity_log` event_type='lead_verified'
   - "Convert" action: open Log Sale form pre-filled from lead
5. **`/owner/sales/upsell` — Upsell entry**
   - Pick client → pick add-on → call `close_sale` with `deal_type='add_on'`

---

## 8. Seven pitfalls from this session

Each of these almost bit us. Catch them in PR review.

1. **Vite env vars are baked at build time.** Never store secrets in
   `VITE_*`. The Supabase anon key is public — fine. Anything else must
   live in a Supabase secret + Edge Function.
2. **Hardcoded rates in JS.** Always `select value from system_settings
   where key='commission_rates'` and pluck the package. Three weeks
   from now those rates WILL change.
3. **Silent catches around the RPC.** When `close_sale` throws,
   PROPAGATE. The form needs to know. `catch (_) {}` here means a
   closer can hit Submit, see "success", and have zero rows written.
4. **Multi-table inserts in JS.** Banned for sales. The RPC exists for
   exactly this reason — orphan Client rows on partial failures used
   to be a Friday-afternoon ritual.
5. **Missing role gates.** Every nav item and every page in `/owner/*`
   already lives under `<RequireAuth>`. Add a `<RequireRole role="owner|admin">`
   guard for slice 2 so a freshly-signed-up client user can't reach the
   sales tools. (One-line guard component — write it in slice 2.)
6. **Owner → founder mapping** when you write `commissions.staff_role`
   from any new path (e.g. a manual commission adjustment form in
   slice 3). The enum has no `'owner'`.
7. **Pexels / Resend Edge Functions** have CORS open. That's deliberate
   for the captcha and email dispatcher. If you add a function in
   slice 2 that mutates `deals`, set `verify_jwt=true` and check
   `has_role(auth.uid(),'owner'|'admin')` at the top.

---

## 9. Handoff to the next session

Open the new chat with:

> Continuing slice 2 of the Marketing iO CRM rebuild. Read
> `docs/HANDOVER.md` for full context, then `docs/SLICE_2_PORTING.md`
> for the specific porting rules for this slice. The OLD Base44
> codebase is at `/tmp/marketingio-extract/marketing-io-crm-main/` —
> grep it first, don't invent. The 6 bugs catalogued in §3 of the
> porting playbook must NOT be reintroduced. Start with
> `/owner/sales/log` (the Log Sale form).

Foundation status snapshot (paste into the new chat too):
- Supabase project `yyrzppuntgtvurnnksfc` — 18 tables, 6 RPCs, RLS on everything
- Owner role granted to `business.lekgoro@gmail.com`
- Edge Functions live: `send-email`, `captcha-photos`
- Frontend deployed on Vercel from `claude/nice-bohr-rtmziz`
- `.env.production` committed with public anon key
- Branding image (header + footer) baked into every email at the Cloudinary URL in §5 of HANDOVER

That's the cleanest possible runway. Ship slice 2.
