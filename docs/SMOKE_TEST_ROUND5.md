# Smoke Test — Round 5: Onboarding + Contract Polish

**Scope:** items 41-50. Adds a storefront photo upload to Onboarding
Section 4 (backed by a new column + updated whitelist RPC), removes the
"signed contract upload" line from the post-sale email, adds upload
progress + validation, gives autosave a retry button and a collision
guard against the final submit, stops empty fields from overwriting
stored values, replaces the post-submit redirect with an in-page
completion screen, and gives SignContract a "just signed" onboarding CTA
plus a friendly "already signed" state.

**Files touched:**

| # | File | Change |
|---|---|---|
| 41 | `supabase/migrations/108_round5_storefront_photo.sql` | New migration — adds `clients.storefront_photo_url` and extends `client_self_update`'s whitelist. |
| 41 | `src/pages/client/Onboarding.jsx` | Section 4 ("Your brand assets") gets a Storefront photo uploader. Autosave persists `storefront_photo_url` through `client_self_update`. |
| 41+42 | `supabase/functions/post-sale-orchestrator/index.ts` | Fetches `storefront_photo_url`; storefront outstanding check accepts either that or a legacy `attachments type='storefront'` row. Removes the "Signed contract upload" outstanding line. |
| 43 | `src/pages/client/Onboarding.jsx` | `uploads: { logo, storefront, assets }` state. Every uploader shows `Loader2 + Uploading…` while in-flight and disables its input. |
| 44 | `src/pages/client/Onboarding.jsx` | New `validateUpload` — max 10MB; MIME allowlist for `image/*` + `application/pdf` (also matched by file extension). Applied to logo, storefront, and every brand-asset file. |
| 45 | `src/pages/client/Onboarding.jsx` | `SaveBadge` gets an optional `onRetry` that renders "Retry" next to the error message; the sticky footer wires it to `persist(form)`. |
| 46 | `src/pages/client/Onboarding.jsx` | `submittingRef` mirrors the `submitting` state; the debounced autosave `setTimeout` bails out if `submittingRef.current` is true. Final submit also clears any pending timer before starting. |
| 47 | `src/pages/client/Onboarding.jsx` | `stripEmpty()` drops `''` and `undefined` from the payload before it hits `client_self_update`, so blank fields no longer overwrite stored values through `coalesce()`. `socials` and `brand_assets_urls` are attached after strip. |
| 48 | `src/pages/client/Onboarding.jsx` | `onSubmit` sets `completed=true` instead of `navigate('/client')`; a new success screen ("Onboarding complete!") renders with a MascotGuide, "Go to my dashboard" link, and "Edit answers" fall-back. |
| 49 | `src/pages/sign/SignContract.jsx` | The "just signed" success screen now surfaces a "Complete onboarding" CTA that links to `/client/onboarding`. |
| 50 | `src/pages/sign/SignContract.jsx` | If `get_contract_for_signing` returns a `status` in `{client_signed, fully_executed, signed, completed, countersigned}`, the page skips the sign form and shows a friendly "You've already signed this contract" state with dashboard + View-agreement buttons. |

---

## 10 Test Scenarios

### 1. Onboarding Section 4 — storefront upload field exists

Sign in as a client → `/client/onboarding` → scroll to **Your brand
assets** (Section 4). Expected:

- Below "Brand colours / Brand fonts", a **Storefront / business
  photo** block with:
  - Copy: "A photo of your shop, office, van or venue…"
  - An empty 20×28 tile if no photo saved yet.
  - Upload button + subtext "Up to 10MB."
- After picking a 2MB photo: button shows **Uploading…** spinner.
- On success: the tile shows the photo and autosave writes
  `clients.storefront_photo_url`.
- Remove button clears it.

### 2. post-sale-orchestrator no longer mentions "Signed contract upload"

Trigger the orchestrator against a fresh closed_won deal (e.g. via the
Supabase function invoker or by triggering a real sale). Read the
`onboarding_invite_recap` email body. Expected:

- No line says "Signed contract upload".
- "Storefront / business photo" still appears in `outstanding` iff the
  client has no `storefront_photo_url` AND no legacy attachments row.
- Repro test:
  ```sql
  -- Wipe storefront to force it into outstanding
  update clients set storefront_photo_url = null where id = '<client-id>';
  -- Fire the orchestrator
  ```
  Expected: email still surfaces the storefront item; does NOT surface
  a signed-contract line.

### 3. Upload progress indicator

On Onboarding, throttle DevTools → Slow 3G. Pick a 2MB image for the
**logo** upload. Expected:

- Button flips to `<Loader2 spinner /> Uploading…`.
- Input is disabled.
- After the upload finishes, the tile shows the new image.
- Same behaviour for storefront + brand-asset uploads.
- Brand-asset multi-select also renders a `Loader2 + Uploading files…`
  line under the input until all files finish (or fail).

### 4. File size validation (max 10MB)

Try uploading a 15MB PDF to any of the three uploaders. Expected:

- Toast: `<filename> exceeds 10MB.`
- No storage write happens (verified in the Storage tab).
- Form state unchanged.

### 5. File type validation (image or PDF only)

Try uploading a `.exe` (or a random binary renamed with a `.mp4`
extension) to logo or storefront. Expected:

- Toast: `<filename>: only images or PDF are allowed.`
- No storage write.

### 6. "Save failed" retry

Fill any field so the debounced autosave kicks in. Kill the network
(DevTools → Offline). After ~1.5s the badge shows:

- Red "Save failed: Failed to fetch" text with a **Retry** button
  next to it.
- Restore the network, click Retry → badge flips through Saving → All
  changes saved.

### 7. Autosave collision guard

Simulate a slow submit: throttle to Slow 3G, sign the debit-order
mandate, then click **Submit & continue**. While the "Submitting…"
spinner is showing, quickly edit a text field. Expected:

- The debounced autosave timer fires but sees
  `submittingRef.current === true` and bails.
- Only one `client_self_update` write happens for this cycle (via the
  synchronous `persist(form)` call inside `onSubmit`).
- After submit succeeds the completion screen renders — the field
  edit made mid-submit is preserved in local state; the next open of
  onboarding will save it via the normal autosave path.

### 8. Empty fields don't overwrite stored data

Populate all Section 1 fields, wait for autosave. Then clear "Website"
to blank. Expected:

- Before Round 5: `website` in the payload was `""`, the RPC's
  `coalesce(..., c.website)` treated `''` as a valid value, and the
  stored URL was wiped.
- After Round 5: `stripEmpty()` drops the `website` key entirely from
  the payload. The RPC's `coalesce` sees no key set and keeps the
  stored URL.
- Reload the page → the URL is still there.

To actually clear a field the user has to re-enter something (or we
add an explicit "clear" affordance later).

### 9. Completion state after submit

Fill the minimum required fields (business name, mandate) and click
**Submit & continue**. Expected:

- After the RPC round-trip: the entire form is replaced by a centred
  card containing:
  - MascotGuide phase="guide" with `Onboarding complete!` message
  - "You're all set 🎉" heading
  - `Go to my dashboard` (→ `/client`)
  - `Edit answers` (returns to the form)
- **No** navigation happens automatically — the client stays on
  `/client/onboarding` until they click through.

### 10. SignContract post-sign + already-signed states

Open `/sign/<valid-token>` for an unsigned contract:

- Sign master + POPIA + initials + details → submit → **Contract
  signed successfully!** screen now includes a **Complete onboarding**
  CTA linking to `/client/onboarding`.

Reload `/sign/<same-token>` after signing (or open a token whose
contract row already has `status = 'client_signed'` /
`'fully_executed'`):

- The sign form is skipped entirely.
- Blue-tinted card: **You've already signed this contract** + copy.
- Buttons: **Go to my dashboard** (→ `/client`) and, if the contract has
  a `document_url`, **View the agreement**.

---

## Self-review verification

- No React hooks after early returns
  - Onboarding.jsx: all `useState`, `useRef`, `useEffect`, `useQuery`,
    `useCallback` calls sit above `if (authLoading …) return`,
    `if (!user) …`, `if (!data?.client) …`, and the new
    `if (completed) return <Completion />` early return. No hooks
    follow.
  - SignContract.jsx: hooks unchanged; new `phase === 'already_signed'`
    branch renders alongside the existing loading/error/signed
    branches, all reached via the same `phase` state machine.
- `supabase.rpc()` calls all destructure error; the SECURITY DEFINER
  `client_self_update` retains `SET search_path TO 'public',
  'extensions'`.
- No console.log in any touched file.
- Every `navigate()` / `<Link to>` targets a real App.jsx route:
  - `/client` — line 316
  - `/client/onboarding` — line 319 (nested inside `path="client"`)
- All imports resolve: `Link`, `Home`, `ArrowRight`, `RefreshCw`,
  `Loader2` from their existing packages; `toast` from `sonner`
  (already used elsewhere).
- `npm run build` — clean pass.

## Deploy checklist

1. Apply migration `108_round5_storefront_photo.sql` to the Supabase
   project (adds column + updates `client_self_update`).
2. Redeploy the `post-sale-orchestrator` Edge Function.
3. No env-var changes.
