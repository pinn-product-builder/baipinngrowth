-- Drop and recreate the view with security_invoker = true
-- This makes the view respect the RLS policies of the underlying tenant_data_sources table
DROP VIEW IF EXISTS public.tenant_data_sources_safe;

CREATE VIEW public.tenant_data_sources_safe 
WITH (security_invoker = true)
AS
SELECT 
    id,
    name,
    tenant_id,
    type,
    project_ref,
    project_url,
    base_url,
    auth_mode,
    allowed_views,
    is_active,
    anon_key_present,
    service_role_key_present,
    created_at,
    updated_at
FROM tenant_data_sources;