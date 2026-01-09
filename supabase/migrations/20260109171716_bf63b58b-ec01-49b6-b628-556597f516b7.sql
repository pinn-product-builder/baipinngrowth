-- Drop the old restrictive constraint
ALTER TABLE public.tenant_data_sources DROP CONSTRAINT tenant_data_sources_type_check;

-- Add new constraint that includes all data source types
ALTER TABLE public.tenant_data_sources ADD CONSTRAINT tenant_data_sources_type_check 
CHECK (type IN ('supabase', 'proxy_webhook', 'google_sheets'));