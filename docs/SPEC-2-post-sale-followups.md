# SPEC-2 — Post-Sale Follow-Ups (Slice 2 continued)

> Everything that happens between **"sale logged"** and **"client signs the contract and the team starts delivering"**.
>
> Already shipped (close-out of slice 2):
> - `close_sale()` v2 with idempotency, brief, discovery, custom deliverables
> - `onboarding_invite_recap` email auto-fires on every closed-won deal via AFTER INSERT trigger + pg_net
>
> This spec covers what's next: a real client portal login, four orchestrated post-sale emails, a first-login welcome experience.

---

## Part A — Client login (THIS PART)

Goal: when a sale is logged, the client gets a **branded magic link** to a portal that's **strictly isolated** to their data.

### A.1 Provisioning rule
- An owner or admin can provision a client login from any closed-won deal.
- Auto-provisioning **also** happens via the post-sale orchestrator after `close_sale()` succeeds (best-effort; non-blocking).
- Provisioning is **idempotent**: if `clients.client_user_id` is already set, the call is a no-op (returns `already_provisioned: true`).
- On successful provisioning:
  - `clients.client_user_id` = new (or existing) `auth.users.id`
  - `clients.has_seen_welcome` = `false`
  - `clients.client_user_provisioned_at` = `now()`
  - **A branded magic-link email** is sent via Resend through our `send-email` Edge Function (NOT Supabase's default auth email).
- Magic link points at `https://app.marketingio.co.za/welcome`. Expires in 24h.

### A.2 RLS isolation (proof required before moving on)
- Every business table either:
  - has a direct `client_user_id = auth.uid()` check, or
  - joins `public.clients` and checks `c.client_user_id = auth.uid()`.
- Client-role users have **no app role** in `user_roles` (so `has_role(auth.uid(), 'owner')` returns false).
- **Proof:** seed two test clients (A and B) with two distinct fake auth users. Set the JWT claim to each in turn and read `clients`, `deals`, `contracts`, `invoices`, `deliverables`. Assert each client only sees their own rows. (See migration 15 smoke tests.)

### A.3 Welcome screen (Part B in this doc — coded next turn)
- Route: `/welcome` (client portal).
- On mount: if `clients.has_seen_welcome = false` → play welcome video + show greeting; on dismiss, set `has_seen_welcome = true`.
- Video chain with progressive fallback: `welcome.webm` → `welcome.mov` → `welcome.png` poster.
- Transparent **iO** logo overlays the top-left of the video.
- Greeting: `Dumela, {business_name}!` (Sotho greeting for the Limpopo audience).
- First-login only — re-visits go straight to the dashboard.

### A.4 Four post-sale emails via the orchestrator (Part C in this doc — last)
Triggered in order, all branded, all via `send-email`:
1. **Client welcome + magic link** (sent by provisioning — this is Part A's email).
2. **Onboarding invite + recap** (already live — refactored to be triggered through the orchestrator, not directly via AFTER INSERT trigger).
3. **Contract for signature** — invites the client to sign the draft contract created by `close_sale()`.
4. **Setup invoice issued** — links the client to pay the setup fee.

A single Edge Function `post-sale-orchestrator` is called from a deal-level AFTER INSERT trigger. The trigger fires once per closed-won deal; the orchestrator fans out the four sends in order with try/catch per email so one failure can't block the others.

---

## Part B — Welcome screen (next turn)

See A.3. Component: `src/pages/client/Welcome.jsx`. Route guard: client role + `has_seen_welcome = false`. Falls back gracefully if asset chain 404s.

---

## Part C — Post-sale orchestrator (last)

See A.4. New Edge Function. Replaces the direct AFTER INSERT trigger on the onboarding recap so the four emails fire in sequence and can be retried.

---

## A.5 Files shipped in this part

| File | Role |
|---|---|
| `supabase/migrations/15_client_provisioning.sql` | `clients.has_seen_welcome` + provisioning timestamps + unique `client_user_id` + RLS smoke tests |
| `supabase/functions/provision-client/index.ts` | Edge Function — provisions auth user + sends branded magic link |
| `send-email` v7 | New template `client_welcome_magic_link` |
| RLS isolation proof | Inline in this doc + executed against the live DB |
