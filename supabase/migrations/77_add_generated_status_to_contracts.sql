-- Migration 77: Add 'generated' to contracts_status_check constraint
-- The edge function sets status='generated' after building the DOCX.

ALTER TABLE contracts DROP CONSTRAINT contracts_status_check;
ALTER TABLE contracts ADD CONSTRAINT contracts_status_check
  CHECK (status = ANY (ARRAY[
    'draft', 'sent', 'signed', 'active',
    'cancelled', 'expired', 'generated'
  ]));
