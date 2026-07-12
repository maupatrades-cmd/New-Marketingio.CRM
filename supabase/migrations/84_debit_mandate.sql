-- Migration 84: Debit Mandate Digital Form
-- New columns on clients for mandate/banking details
-- New banking_vault table with pgcrypto encryption + RLS
-- New submit_debit_mandate RPC

-- 1. Mandate columns on clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mandate_bank_name text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mandate_account_holder text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mandate_account_number_masked text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mandate_account_type text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mandate_branch_code text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mandate_debit_day text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mandate_authorized_at timestamptz;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mandate_authorized_ip inet;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mandate_signature_data_url text;

-- 2. Banking vault (encrypted full account numbers)
CREATE TABLE IF NOT EXISTS banking_vault (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  encrypted_account_number bytea NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);
ALTER TABLE banking_vault ENABLE ROW LEVEL SECURITY;

-- 3. Encryption key in system_settings
-- INSERT INTO system_settings (key, value) VALUES ('banking_vault_key.v1', ...) — applied manually

-- 4. submit_debit_mandate RPC — see execute_sql in session
