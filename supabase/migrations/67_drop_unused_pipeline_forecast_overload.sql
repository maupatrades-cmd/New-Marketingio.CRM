-- 67: drop the unused (date,date) overload of get_pipeline_forecast.
-- Frontend only calls the 0-arg variant. Keeping both creates a real
-- PGRST203 ambiguous-function risk (some PostgREST versions 300 / 400
-- on a no-arg call when an overload set exists).
DROP FUNCTION IF EXISTS public.get_pipeline_forecast(date, date);
