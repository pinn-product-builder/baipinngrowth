-- Fix security issues

-- 1. Drop the SECURITY DEFINER view and recreate it without that property
DROP VIEW IF EXISTS public.tenant_data_sources_safe;

-- Recreate as regular view (inherits caller's permissions)
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
FROM public.tenant_data_sources;

-- 2. Fix the permissive INSERT policies - use more restrictive checks
-- For audit_logs: only allow inserts from service role (edge functions)
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "Service role can insert audit logs"
ON public.audit_logs FOR INSERT
WITH CHECK (
  -- This will only work with service_role key, not anon key
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);

-- 3. Fix ai_auto_insights INSERT policy
DROP POLICY IF EXISTS "System can insert insights" ON public.ai_auto_insights;
CREATE POLICY "Service role can insert insights"
ON public.ai_auto_insights FOR INSERT
WITH CHECK (
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
);

-- 4. Fix ai_usage_daily UPDATE policy  
DROP POLICY IF EXISTS "System can update usage" ON public.ai_usage_daily;
CREATE POLICY "Service role can update usage"
ON public.ai_usage_daily FOR UPDATE
USING (
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
);

-- 5. Fix ai_usage_daily INSERT policy
DROP POLICY IF EXISTS "System can insert usage" ON public.ai_usage_daily;
CREATE POLICY "Service role can insert usage"
ON public.ai_usage_daily FOR INSERT
WITH CHECK (
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
);