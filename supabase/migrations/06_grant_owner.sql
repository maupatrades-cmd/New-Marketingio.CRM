-- 06_grant_owner.sql
-- Run AFTER the owner has signed up via the frontend (Vercel deploy).
-- The default identity for this rebuild is business.lekgoro@gmail.com.
-- HANDOVER §7: this is the primary signin email.

insert into public.user_roles (user_id, role, granted_by, granted_at)
select u.id, 'owner', u.id, now()
from auth.users u
where u.email = 'business.lekgoro@gmail.com'
on conflict (user_id, role) do nothing;

-- Verify
select u.email, ur.role, ur.granted_at
from auth.users u
join public.user_roles ur on ur.user_id = u.id
where u.email = 'business.lekgoro@gmail.com';
