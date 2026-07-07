-- 001_initial.sql
-- Creates the contracts table and indexes for the SignFlow app.

-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor).
-- It is idempotent — safe to run multiple times.

CREATE TABLE IF NOT EXISTS contracts (
  id BIGSERIAL PRIMARY KEY,
  document_id TEXT UNIQUE NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  signature_id TEXT UNIQUE NOT NULL,
  signature_url TEXT NOT NULL,
  signature_status TEXT NOT NULL DEFAULT 'pending' CHECK (signature_status IN ('pending', 'signed', 'expired')),
  signature_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signature_signed_at TIMESTAMPTZ,
  setu_document_id TEXT,
  storage_file_path TEXT
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_contracts_signature_id ON contracts(signature_id);
CREATE INDEX IF NOT EXISTS idx_contracts_document_id ON contracts(document_id);
CREATE INDEX IF NOT EXISTS idx_contracts_uploaded_at ON contracts(uploaded_at DESC);

-- Automatically update signature_signed_at when signature_status becomes 'signed'
CREATE OR REPLACE FUNCTION set_signed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.signature_status = 'signed' AND OLD.signature_status != 'signed' THEN
    NEW.signature_signed_at = NOW();
    NEW.status = 'processed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_signed_at ON contracts;
CREATE TRIGGER trg_set_signed_at
  BEFORE UPDATE OF signature_status ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION set_signed_at();
