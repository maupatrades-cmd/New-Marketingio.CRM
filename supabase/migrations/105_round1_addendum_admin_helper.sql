-- Migration 105: Round 1 addendum — admin coverage for owner-level RLS.
--
-- Migration 104 gated the tightened policies on _is_owner(auth.uid()),
-- but _is_owner checks the 'owner' role only. In practice we intend the
-- 'admin' role to have owner-level access to banking, chase log,
-- checklists, and contract initials — otherwise migration 104 locks
-- admin accounts out of pages they need for the job.
--
-- We keep _is_owner(uid) as-is (many RPCs still want strict owner) and
-- add a sibling helper that matches its signature. Then rewrite the
-- five round-1 policies to gate on the new helper.

CREATE OR REPLACE FUNCTION public._is_owner_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner'::public.app_role, 'admin'::public.app_role)
  );
$$;

-- 6) banking_vault INSERT — owner OR admin
DROP POLICY IF EXISTS vault_owner_insert ON banking_vault;
CREATE POLICY vault_owner_insert ON banking_vault
  FOR INSERT TO authenticated
  WITH CHECK (_is_owner_or_admin(auth.uid()));

-- 7) chase_log SELECT — owner/admin + other staff roles
DROP POLICY IF EXISTS chase_log_staff_select ON chase_log;
CREATE POLICY chase_log_staff_select ON chase_log
  FOR SELECT TO authenticated
  USING (
    _is_owner_or_admin(auth.uid())
    OR _is_coordinator(auth.uid())
    OR has_role(auth.uid(), 'head_of_tech'::app_role)
    OR has_role(auth.uid(), 'cpc'::app_role)
    OR has_role(auth.uid(), 'field_agent'::app_role)
  );

-- 8) client_messages INSERT — staff branch now allows admin too
DROP POLICY IF EXISTS msg_client_insert ON client_messages;
CREATE POLICY msg_client_insert ON client_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      is_from_client = true
      AND sender_user_id = auth.uid()
      AND client_id IN (SELECT id FROM clients WHERE client_user_id = auth.uid())
    )
    OR
    (
      is_from_client = false
      AND sender_user_id = auth.uid()
      AND (_is_owner_or_admin(auth.uid()) OR _is_coordinator(auth.uid()))
    )
  );

-- 9) contract_checklist_admin + contract_checklist_sales SELECT — owner/admin
DROP POLICY IF EXISTS checklist_admin_select ON contract_checklist_admin;
CREATE POLICY checklist_admin_select ON contract_checklist_admin
  FOR SELECT TO authenticated
  USING (
    _is_owner_or_admin(auth.uid())
    OR _is_coordinator(auth.uid())
    OR has_role(auth.uid(), 'head_of_tech'::app_role)
  );

DROP POLICY IF EXISTS checklist_sales_select ON contract_checklist_sales;
CREATE POLICY checklist_sales_select ON contract_checklist_sales
  FOR SELECT TO authenticated
  USING (
    _is_owner_or_admin(auth.uid())
    OR _is_coordinator(auth.uid())
    OR completed_by = auth.uid()
  );

-- 10) contract_initials SELECT — owner/admin + coordinator + owning client
DROP POLICY IF EXISTS contract_initials_select ON contract_initials;
CREATE POLICY contract_initials_select ON contract_initials
  FOR SELECT TO authenticated
  USING (
    _is_owner_or_admin(auth.uid())
    OR _is_coordinator(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM contracts c
      JOIN clients cl ON cl.id = c.client_id
      WHERE c.id = contract_initials.contract_id
        AND cl.client_user_id = auth.uid()
    )
  );
