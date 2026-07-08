-- Migration 104: Round 1 RLS hardening (integration items 6-10)
--
-- Each of these tables had a policy that either used USING (true), a
-- WITH CHECK (true), or a with_check that let any authenticated user
-- write. That's fine for internal fixtures but leaks either PII or
-- lets a client see/modify data that isn't theirs. This tightens each
-- to the minimum reasonable scope.
--
-- Helper functions already in the DB: _is_owner(uid), _is_coordinator(uid),
-- has_role(uid, app_role). They live in the public schema.

-- 6) banking_vault INSERT — used to be with_check true (any signed-in
--    user could insert an encrypted account number). Restrict to
--    owner/admin. RPC callers running as SECURITY DEFINER still work.
DROP POLICY IF EXISTS vault_insert_via_rpc ON banking_vault;
CREATE POLICY vault_owner_insert ON banking_vault
  FOR INSERT TO authenticated
  WITH CHECK (_is_owner(auth.uid()));

-- 7) chase_log SELECT — was USING (true). This log includes lead
--    names + last-contact notes so it's staff-only.
DROP POLICY IF EXISTS chase_log_staff_select ON chase_log;
CREATE POLICY chase_log_staff_select ON chase_log
  FOR SELECT TO authenticated
  USING (
    _is_owner(auth.uid())
    OR _is_coordinator(auth.uid())
    OR has_role(auth.uid(), 'head_of_tech'::app_role)
    OR has_role(auth.uid(), 'cpc'::app_role)
    OR has_role(auth.uid(), 'field_agent'::app_role)
  );

-- 8) client_messages INSERT — was with_check true (any user could
--    insert as any client). Client can only insert their own messages;
--    staff can insert any (they act on behalf of the business).
DROP POLICY IF EXISTS msg_insert ON client_messages;
CREATE POLICY msg_client_insert ON client_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    -- client posting to their own thread
    (
      is_from_client = true
      AND sender_user_id = auth.uid()
      AND client_id IN (SELECT id FROM clients WHERE client_user_id = auth.uid())
    )
    OR
    -- staff posting on behalf of the business
    (
      is_from_client = false
      AND sender_user_id = auth.uid()
      AND (_is_owner(auth.uid()) OR _is_coordinator(auth.uid()))
    )
  );

-- 9) contract_checklist_admin + contract_checklist_sales SELECT — were
--    USING (true). These carry approver names / call log IDs; staff-only.
DROP POLICY IF EXISTS checklist_admin_select ON contract_checklist_admin;
CREATE POLICY checklist_admin_select ON contract_checklist_admin
  FOR SELECT TO authenticated
  USING (
    _is_owner(auth.uid())
    OR _is_coordinator(auth.uid())
    OR has_role(auth.uid(), 'head_of_tech'::app_role)
  );

DROP POLICY IF EXISTS checklist_sales_select ON contract_checklist_sales;
CREATE POLICY checklist_sales_select ON contract_checklist_sales
  FOR SELECT TO authenticated
  USING (
    _is_owner(auth.uid())
    OR _is_coordinator(auth.uid())
    OR completed_by = auth.uid()
  );

-- 10) contract_initials SELECT — was USING (true). Should be staff OR
--     the client the contract belongs to.
DROP POLICY IF EXISTS contract_initials_select ON contract_initials;
CREATE POLICY contract_initials_select ON contract_initials
  FOR SELECT TO authenticated
  USING (
    _is_owner(auth.uid())
    OR _is_coordinator(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM contracts c
      JOIN clients cl ON cl.id = c.client_id
      WHERE c.id = contract_initials.contract_id
        AND cl.client_user_id = auth.uid()
    )
  );
