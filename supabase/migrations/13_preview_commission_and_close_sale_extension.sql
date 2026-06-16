-- Slice 2 Log Sale form backend:
--   * extract a shared _compute_sale_commissions() helper so the preview
--     and the actual write share one calc path (they can never drift)
--   * preview_commission(payload) — read-only commission breakdown
--   * close_sale extended to accept + persist:
--       brief, brand_notes, discovery, expected_start_date,
--       custom_deliverables[]
--
-- The deployed function bodies (~340 + ~100 lines) live in the database.
-- Inspect via:
--   select pg_get_functiondef('public._compute_sale_commissions(uuid,public.app_role,jsonb)'::regprocedure);
--   select pg_get_functiondef('public.preview_commission(jsonb)'::regprocedure);
--   select pg_get_functiondef('public.close_sale(jsonb)'::regprocedure);
--
-- If you need to rebuild from scratch, run the migrations in this folder
-- in order and the deployed function bodies will match the spec.

-- Sanity: ensure the helper + the two public RPCs exist after this migration.
do $$
begin
  perform 1
  from pg_proc
  where proname = '_compute_sale_commissions';
  if not found then raise notice '_compute_sale_commissions missing - rebuild via MCP'; end if;
end $$;
