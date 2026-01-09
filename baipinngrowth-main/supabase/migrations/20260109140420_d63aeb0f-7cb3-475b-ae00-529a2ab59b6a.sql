-- Add columns to store Google OAuth client credentials per data source (encrypted)
ALTER TABLE public.tenant_data_sources
ADD COLUMN IF NOT EXISTS google_client_id_encrypted text,
ADD COLUMN IF NOT EXISTS google_client_secret_encrypted text;