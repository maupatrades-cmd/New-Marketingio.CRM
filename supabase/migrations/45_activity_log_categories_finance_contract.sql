-- 45_activity_log_categories_finance_contract.sql
-- capture_banking writes event_category='finance' and stamp_deal_contract_dates writes 'contract'.
-- Original constraint did not allow either, blocking Log Sale submission.

alter table public.client_activity_log drop constraint if exists client_activity_log_event_category_check;
alter table public.client_activity_log add constraint client_activity_log_event_category_check
  check (event_category = any (array[
    'auth','profile','payment','invoice','document','communication',
    'support','account','lead','sale','fulfilment','finance','contract'
  ]));
