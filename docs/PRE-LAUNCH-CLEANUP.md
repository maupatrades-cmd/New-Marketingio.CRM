# Pre-launch cleanup checklist

**Target launch date: 25 May 2026**

---

## Test accounts — ACTION REQUIRED before launch

Three test accounts were created during Phase 3 development with a weak shared password.
**Before real staff onboard, either delete these accounts or rotate their passwords.**

| Email | Role | Created |
|---|---|---|
| `admin@marketingio.co.za` | admin | 2026-06-19 |
| `cpc1@marketingio.co.za` | cpc | 2026-06-19 |
| `field1@marketingio.co.za` | field_agent | 2026-06-19 |

Current password: `Test123456!` — **UNSAFE for production**.

Options:
- **Delete** via Supabase dashboard → Authentication → Users (preferred if real staff accounts will replace them)
- **Rotate** via `update auth.users set encrypted_password = crypt('...', gen_salt('bf')) where email = '...'`

---

## Notes

- `bullrunsa@gmail.com` — used as a field_agent smoke account; no `user_roles` row at launch means it won't have access. Verify or clean up.
- `maupaqueen@gmail.com` — CPC smoke account; password unknown. Verify access before handing to a real CPC.
