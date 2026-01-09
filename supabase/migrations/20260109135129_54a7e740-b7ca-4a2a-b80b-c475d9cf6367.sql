-- Add Google Sheets specific fields to tenant_data_sources
ALTER TABLE public.tenant_data_sources 
ADD COLUMN IF NOT EXISTS google_spreadsheet_id text,
ADD COLUMN IF NOT EXISTS google_sheet_name text,
ADD COLUMN IF NOT EXISTS google_refresh_token_encrypted text,
ADD COLUMN IF NOT EXISTS google_access_token_encrypted text,
ADD COLUMN IF NOT EXISTS google_token_expires_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS google_email text,
ADD COLUMN IF NOT EXISTS last_sync_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS sync_mode text DEFAULT 'direct_query';

-- Add comment for documentation
COMMENT ON COLUMN public.tenant_data_sources.google_spreadsheet_id IS 'Google Sheets spreadsheet ID';
COMMENT ON COLUMN public.tenant_data_sources.google_sheet_name IS 'Name of the sheet tab';
COMMENT ON COLUMN public.tenant_data_sources.sync_mode IS 'direct_query or etl_to_supabase';