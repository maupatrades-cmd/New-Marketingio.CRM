# New Marketing iO CRM

Rebuild on Supabase + React + Vite + Tailwind. Slice 1 ships login, owner shell, and a live owner dashboard backed by `get_owner_dashboard()`.

## Stack
- **Frontend:** Vite + React 18 + Tailwind 3 + react-router-dom + TanStack Query + Recharts + Sonner
- **Backend:** Supabase Postgres 17 + Auth (project `yyrzppuntgtvurnnksfc`)
- **Deploy:** Vercel (SPA via `vercel.json`)

## Migrations applied
All in `supabase/migrations/`. Already applied to `yyrzppuntgtvurnnksfc`:

| File | What it ships |
|---|---|
| `01_foundation.sql` | `app_role` enum, `profiles`, `user_roles`, `has_role()`, `current_user_role()`, `audit_log` + trigger, `handle_new_user` signup hook |
| `02_system_settings.sql` | 9-key config table seeded with commission rates, packages, brand, signatories, payroll schedule, PayFast config, feature flags |
| `03_business_entities.sql` | 13 business tables (clients, leads, deals, invoices, commissions, tasks, monthly_reports, playbooks, contracts, fulfilment_templates [5 seeded], deliverables, client_onboarding, client_activity_log, client_notifications) + RLS + audit triggers |
| `04_close_sale_rpc.sql` | `close_sale(payload jsonb)` — single transactional orchestrator: client → deal → commissions → contract → onboarding → tasks → deliverables → activity log |
| `05_owner_dashboard_rpc.sql` | `get_owner_dashboard()` server-side aggregator |
| `06_grant_owner.sql` | **Run after first sign-up** — grants `owner` role to `business.lekgoro@gmail.com` |

## First-run checklist

1. **Local dev**
   ```bash
   npm install
   cp .env.example .env.local
   # fill VITE_SUPABASE_ANON_KEY from https://supabase.com/dashboard/project/yyrzppuntgtvurnnksfc/settings/api
   npm run dev
   ```

2. **Sign up**
   - Open the dev URL (http://localhost:5173) or the Vercel URL
   - Click "Create one" on the login page
   - Sign up as `business.lekgoro@gmail.com`
   - Confirm via inbox

3. **Grant owner role** (after sign-up + email confirm)
   - Open Supabase SQL Editor
   - Paste & run `supabase/migrations/06_grant_owner.sql`

4. **Verify**
   - Sign in → land on `/owner` Dashboard
   - All 8 KPI cards visible, all charts render empty (no data yet)
   - Open tasks empty, team KPIs empty

5. **Deploy to Vercel**
   - https://vercel.com/new → import `maupatrades-cmd/New-Marketingio.CRM`
   - Add env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   - Deploy

## Carry-over rules (from prior session — do not violate)

1. **No constants in code** — everything tunable lives in `public.system_settings`.
2. **No silent catches** — every `try/catch` either rethrows or surfaces.
3. **Multi-table writes go through plpgsql RPCs** — JS-side `.insert()` chains are banned. See `close_sale`.
4. **Owner → founder mapping** when writing `commissions.staff_role` (enum has no `owner`).
5. **Mirror Base44 field names** in snake_case for future import compatibility.
6. **Audit log on every business table** via `audit_trigger()`.

## Next slices (per HANDOVER §6)

- **Slice 2 — Sales engine:** `/owner/sales` with Leads, Sales Opportunities kanban, Log Sale form calling `close_sale()`, Deals list, Upsell.
- **Slice 3 — Money:** Invoices, Receipts, Debit Orders, Payroll, Financials.
- **Slice 4 — Contracts:** 22-page MSA generation, public signing flow.
- See `HANDOVER.md` (or the previous chat's PR) for the full plan.
