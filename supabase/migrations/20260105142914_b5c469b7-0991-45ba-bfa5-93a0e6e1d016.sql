-- Create template_kind enum
CREATE TYPE public.dashboard_template_kind AS ENUM (
  'none',
  'costs_funnel_daily',
  'custom'
);

-- Add template_kind and dashboard_spec to dashboards table
ALTER TABLE public.dashboards
ADD COLUMN template_kind public.dashboard_template_kind DEFAULT 'none',
ADD COLUMN dashboard_spec jsonb DEFAULT '{}'::jsonb,
ADD COLUMN detected_columns jsonb DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.dashboards.template_kind IS 'Auto-detected or manually set template type for supabase_view dashboards';
COMMENT ON COLUMN public.dashboards.dashboard_spec IS 'JSON spec for customizing dashboard layout, KPIs, charts, and table columns';
COMMENT ON COLUMN public.dashboards.detected_columns IS 'Cached column information from view introspection';