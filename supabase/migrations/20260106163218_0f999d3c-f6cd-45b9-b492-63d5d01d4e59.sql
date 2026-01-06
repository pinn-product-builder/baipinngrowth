-- =====================================================
-- PHASE 3: ENTERPRISE FEATURES
-- =====================================================

-- 1. Fix RLS for tenant_data_sources - create view for managers that masks credentials
DROP POLICY IF EXISTS "Managers can view data sources of their tenant" ON public.tenant_data_sources;

-- Create policy that only shows non-sensitive fields to managers
CREATE POLICY "Managers can view data sources metadata of their tenant" 
ON public.tenant_data_sources 
FOR SELECT 
USING (
  has_role(auth.uid(), 'manager'::app_role) 
  AND tenant_id = get_user_tenant_id(auth.uid())
);

-- Create a secure view for managers that masks credentials
CREATE OR REPLACE VIEW public.tenant_data_sources_safe AS
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
  -- Excludes: anon_key_encrypted, service_role_key_encrypted, bearer_token
FROM public.tenant_data_sources;

-- 2. Dashboard Permissions table
CREATE TABLE IF NOT EXISTS public.dashboard_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role,
  can_view boolean DEFAULT true,
  can_edit boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT dashboard_permissions_user_or_role CHECK (user_id IS NOT NULL OR role IS NOT NULL),
  UNIQUE (dashboard_id, user_id),
  UNIQUE (dashboard_id, role)
);

ALTER TABLE public.dashboard_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all dashboard permissions" 
ON public.dashboard_permissions FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can manage permissions for their tenant dashboards"
ON public.dashboard_permissions FOR ALL
USING (
  has_role(auth.uid(), 'manager'::app_role) 
  AND EXISTS (
    SELECT 1 FROM dashboards d 
    WHERE d.id = dashboard_permissions.dashboard_id 
    AND d.tenant_id = get_user_tenant_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role) 
  AND EXISTS (
    SELECT 1 FROM dashboards d 
    WHERE d.id = dashboard_permissions.dashboard_id 
    AND d.tenant_id = get_user_tenant_id(auth.uid())
  )
);

CREATE POLICY "Users can view their own permissions"
ON public.dashboard_permissions FOR SELECT
USING (user_id = auth.uid());

-- 3. Audit Logs table (enhanced)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id),
  actor_user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  entity_name text,
  before_data jsonb,
  after_data jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view all audit logs"
ON public.audit_logs FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Managers can view audit logs of their tenant
CREATE POLICY "Managers can view audit logs of their tenant"
ON public.audit_logs FOR SELECT
USING (
  has_role(auth.uid(), 'manager'::app_role) 
  AND tenant_id = get_user_tenant_id(auth.uid())
);

-- System can insert audit logs (via edge functions with service role)
CREATE POLICY "System can insert audit logs"
ON public.audit_logs FOR INSERT
WITH CHECK (true);

CREATE INDEX idx_audit_logs_tenant_created ON public.audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_user_id, created_at DESC);

-- 4. Dashboard Spec Versions table (for rollback)
CREATE TABLE IF NOT EXISTS public.dashboard_spec_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  version integer NOT NULL,
  dashboard_spec jsonb,
  dashboard_layout jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  notes text,
  UNIQUE (dashboard_id, version)
);

ALTER TABLE public.dashboard_spec_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all spec versions"
ON public.dashboard_spec_versions FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can manage spec versions for their tenant"
ON public.dashboard_spec_versions FOR ALL
USING (
  has_role(auth.uid(), 'manager'::app_role) 
  AND EXISTS (
    SELECT 1 FROM dashboards d 
    WHERE d.id = dashboard_spec_versions.dashboard_id 
    AND d.tenant_id = get_user_tenant_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role) 
  AND EXISTS (
    SELECT 1 FROM dashboards d 
    WHERE d.id = dashboard_spec_versions.dashboard_id 
    AND d.tenant_id = get_user_tenant_id(auth.uid())
  )
);

CREATE INDEX idx_spec_versions_dashboard ON public.dashboard_spec_versions(dashboard_id, version DESC);

-- 5. Feature Flags table
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_global boolean DEFAULT false,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean DEFAULT false,
  config jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT feature_flags_global_or_tenant CHECK (
    (is_global = true AND tenant_id IS NULL) OR 
    (is_global = false AND tenant_id IS NOT NULL)
  ),
  UNIQUE (name, tenant_id)
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all feature flags"
ON public.feature_flags FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view global flags and their tenant flags"
ON public.feature_flags FOR SELECT
USING (
  is_global = true OR 
  tenant_id = get_user_tenant_id(auth.uid())
);

CREATE INDEX idx_feature_flags_global ON public.feature_flags(is_global, name) WHERE is_global = true;
CREATE INDEX idx_feature_flags_tenant ON public.feature_flags(tenant_id, name);

-- 6. Tenant Branding table (for white-label)
CREATE TABLE IF NOT EXISTS public.tenant_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  display_name text,
  logo_url text,
  primary_color text,
  secondary_color text,
  custom_css text,
  custom_domain text,
  favicon_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.tenant_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all branding"
ON public.tenant_branding FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can manage branding for their tenant"
ON public.tenant_branding FOR ALL
USING (
  has_role(auth.uid(), 'manager'::app_role) 
  AND tenant_id = get_user_tenant_id(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role) 
  AND tenant_id = get_user_tenant_id(auth.uid())
);

CREATE POLICY "Users can view branding for their tenant"
ON public.tenant_branding FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

-- 7. Add layout column to dashboards
ALTER TABLE public.dashboards 
ADD COLUMN IF NOT EXISTS dashboard_layout jsonb DEFAULT '{}';

-- 8. Insert default feature flags
INSERT INTO public.feature_flags (name, description, is_global, enabled, config)
VALUES 
  ('ai_analyst', 'Habilitar AI Analyst para análise de dados', true, true, '{"model": "gemini-2.5-flash"}'),
  ('export_pdf', 'Habilitar export para PDF', true, true, '{}'),
  ('export_excel', 'Habilitar export para Excel', true, false, '{}'),
  ('dashboard_builder', 'Habilitar builder drag-and-drop', true, false, '{}'),
  ('auto_insights', 'Habilitar insights automáticos diários', true, true, '{}'),
  ('advanced_alerts', 'Habilitar alertas avançados', true, false, '{}')
ON CONFLICT (name, tenant_id) DO NOTHING;