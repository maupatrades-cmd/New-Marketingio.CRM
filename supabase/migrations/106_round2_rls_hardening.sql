-- Migration 106: Round 2 RLS hardening (integration items 11-14).
--
-- Item 11 — invoice_payment_proofs SELECT is currently unscoped. Tighten
-- to staff (owner/admin/coordinator/head_of_tech) OR the client the
-- invoice belongs to.
--
-- Items 12-14 — monthly_reports / tasks / client_onboarding all have a
-- `FOR ALL … WITH CHECK (true)`. The USING clause blocks unauthorised
-- SELECT/UPDATE/DELETE, but WITH CHECK(true) means the same UPDATE that
-- USING passes can rewrite the row to *any* value — including
-- client_id/assigned_to that steal it out of the caller's scope. Mirror
-- the USING scope into WITH CHECK so writes must land on rows the
-- caller is still allowed to see.

-- 11) invoice_payment_proofs SELECT — staff OR the invoice's client.
-- Belt-and-braces: table was created via MCP so RLS may or may not have
-- been enabled. ENABLE is idempotent — no-op if already on.
ALTER TABLE public.invoice_payment_proofs ENABLE ROW LEVEL SECURITY;
-- Drop any pre-existing permissive policy (installed via MCP earlier
-- with USING(true)) before re-creating.
DROP POLICY IF EXISTS ipp_read              ON invoice_payment_proofs;
DROP POLICY IF EXISTS ipp_read_all          ON invoice_payment_proofs;
DROP POLICY IF EXISTS ipp_select_all        ON invoice_payment_proofs;
DROP POLICY IF EXISTS proofs_select_all     ON invoice_payment_proofs;
DROP POLICY IF EXISTS proofs_read           ON invoice_payment_proofs;
DROP POLICY IF EXISTS invoice_payment_proofs_read ON invoice_payment_proofs;
CREATE POLICY invoice_payment_proofs_read ON invoice_payment_proofs
  FOR SELECT TO authenticated
  USING (
    _is_owner_or_admin(auth.uid())
    OR _is_coordinator(auth.uid())
    OR has_role(auth.uid(), 'head_of_tech'::app_role)
    OR EXISTS (
      SELECT 1
      FROM invoices i
      JOIN clients cl ON cl.id = i.client_id
      WHERE i.id = invoice_payment_proofs.invoice_id
        AND cl.client_user_id = auth.uid()
    )
  );

-- 12) monthly_reports write — mirror USING (staff-only) into WITH CHECK
-- so a staff role can't rewrite a report's client_id to a client they
-- shouldn't be able to read.
DROP POLICY IF EXISTS monthly_reports_write ON monthly_reports;
CREATE POLICY monthly_reports_write ON monthly_reports FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'owner'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'head_of_tech'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(),'owner'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'head_of_tech'::app_role)
  );

-- 13) tasks write — mirror USING into WITH CHECK. USING allowed
-- assigned_to = auth.uid() OR created_by = auth.uid() OR owner/admin;
-- WITH CHECK(true) let anyone the USING passed reassign the task to a
-- staff member outside the caller's scope, or create/rewrite a row
-- where they aren't assignee/creator at all. Cover both branches.
DROP POLICY IF EXISTS tasks_write ON tasks;
CREATE POLICY tasks_write ON tasks FOR ALL TO authenticated
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR has_role(auth.uid(),'owner'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
  )
  WITH CHECK (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR has_role(auth.uid(),'owner'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
  );

-- 14) client_onboarding write — mirror USING into WITH CHECK. Staff
-- writers must keep the row scoped to a client they can already read;
-- the same predicate the USING clause enforces on the *pre-update*
-- row now also runs against the *post-update* row.
DROP POLICY IF EXISTS onboarding_write ON client_onboarding;
CREATE POLICY onboarding_write ON client_onboarding FOR ALL TO authenticated
  USING (
    assigned_admin_id = auth.uid()
    OR has_role(auth.uid(),'owner'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
  )
  WITH CHECK (
    assigned_admin_id = auth.uid()
    OR has_role(auth.uid(),'owner'::app_role)
    OR has_role(auth.uid(),'admin'::app_role)
  );
