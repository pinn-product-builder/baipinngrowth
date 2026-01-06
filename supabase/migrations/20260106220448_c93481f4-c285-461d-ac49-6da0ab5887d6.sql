-- Create datasets table (represents a table/view/SQL query)
CREATE TABLE public.datasets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  datasource_id UUID NOT NULL REFERENCES public.tenant_data_sources(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'view' CHECK (kind IN ('table', 'view', 'sql')),
  schema_name TEXT NOT NULL DEFAULT 'public',
  object_name TEXT, -- table/view name
  sql_query TEXT, -- when kind = 'sql'
  primary_time_column TEXT,
  primary_key TEXT,
  grain_hint TEXT CHECK (grain_hint IN ('day', 'week', 'month', 'event')),
  default_order TEXT DEFAULT 'desc',
  row_limit_default INTEGER DEFAULT 10000,
  refresh_policy TEXT DEFAULT 'live' CHECK (refresh_policy IN ('live', 'cache_5m', 'cache_1h')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_introspected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create dataset_columns table (semantic metadata for columns)
CREATE TABLE public.dataset_columns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dataset_id UUID NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  column_name TEXT NOT NULL,
  db_type TEXT NOT NULL,
  semantic_type TEXT CHECK (semantic_type IN ('time', 'dimension', 'metric', 'currency', 'percent', 'count', 'id', 'text', 'boolean')),
  role_hint TEXT CHECK (role_hint IN ('x_axis', 'y_axis', 'series', 'stage', 'label')),
  aggregator_default TEXT DEFAULT 'sum' CHECK (aggregator_default IN ('sum', 'avg', 'min', 'max', 'count', 'count_distinct', 'none')),
  format TEXT CHECK (format IN ('brl', 'percent', 'integer', 'float', 'date', 'datetime')),
  display_label TEXT,
  is_nullable BOOLEAN DEFAULT true,
  is_hidden BOOLEAN DEFAULT false,
  sort_priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(dataset_id, column_name)
);

-- Create dataset_relationships table (for consolidating datasets)
CREATE TABLE public.dataset_relationships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  left_dataset_id UUID NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  right_dataset_id UUID NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  join_type TEXT NOT NULL DEFAULT 'left' CHECK (join_type IN ('left', 'inner', 'full')),
  left_key TEXT NOT NULL,
  right_key TEXT NOT NULL,
  cardinality TEXT CHECK (cardinality IN ('1:1', '1:N', 'N:1', 'N:N')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create dashboard_definitions table (layout persistence)
CREATE TABLE public.dashboard_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dashboard_id UUID NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL DEFAULT 'executivo',
  tiles_json JSONB DEFAULT '[]'::jsonb,
  filters_json JSONB DEFAULT '{}'::jsonb,
  default_view_tab TEXT DEFAULT 'executivo',
  dataset_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(dashboard_id)
);

-- Enable RLS on all new tables
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_definitions ENABLE ROW LEVEL SECURITY;

-- RLS policies for datasets
CREATE POLICY "Admins can manage all datasets"
  ON public.datasets FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can manage datasets for their tenant"
  ON public.datasets FOR ALL
  USING (has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can view datasets of their tenant"
  ON public.datasets FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()));

-- RLS policies for dataset_columns
CREATE POLICY "Admins can manage all dataset columns"
  ON public.dataset_columns FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can manage dataset columns for their tenant"
  ON public.dataset_columns FOR ALL
  USING (has_role(auth.uid(), 'manager') AND EXISTS (
    SELECT 1 FROM datasets d WHERE d.id = dataset_columns.dataset_id AND d.tenant_id = get_user_tenant_id(auth.uid())
  ))
  WITH CHECK (has_role(auth.uid(), 'manager') AND EXISTS (
    SELECT 1 FROM datasets d WHERE d.id = dataset_columns.dataset_id AND d.tenant_id = get_user_tenant_id(auth.uid())
  ));

CREATE POLICY "Users can view dataset columns of their tenant"
  ON public.dataset_columns FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM datasets d WHERE d.id = dataset_columns.dataset_id AND d.tenant_id = get_user_tenant_id(auth.uid())
  ));

-- RLS policies for dataset_relationships
CREATE POLICY "Admins can manage all relationships"
  ON public.dataset_relationships FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can manage relationships for their tenant"
  ON public.dataset_relationships FOR ALL
  USING (has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can view relationships of their tenant"
  ON public.dataset_relationships FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()));

-- RLS policies for dashboard_definitions
CREATE POLICY "Admins can manage all definitions"
  ON public.dashboard_definitions FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can manage definitions for their tenant"
  ON public.dashboard_definitions FOR ALL
  USING (has_role(auth.uid(), 'manager') AND EXISTS (
    SELECT 1 FROM dashboards d WHERE d.id = dashboard_definitions.dashboard_id AND d.tenant_id = get_user_tenant_id(auth.uid())
  ))
  WITH CHECK (has_role(auth.uid(), 'manager') AND EXISTS (
    SELECT 1 FROM dashboards d WHERE d.id = dashboard_definitions.dashboard_id AND d.tenant_id = get_user_tenant_id(auth.uid())
  ));

CREATE POLICY "Users can view definitions of their tenant"
  ON public.dashboard_definitions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM dashboards d WHERE d.id = dashboard_definitions.dashboard_id AND d.tenant_id = get_user_tenant_id(auth.uid())
  ));

-- Triggers for updated_at
CREATE TRIGGER update_datasets_updated_at
  BEFORE UPDATE ON public.datasets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dataset_columns_updated_at
  BEFORE UPDATE ON public.dataset_columns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dataset_relationships_updated_at
  BEFORE UPDATE ON public.dataset_relationships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dashboard_definitions_updated_at
  BEFORE UPDATE ON public.dashboard_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_datasets_tenant ON public.datasets(tenant_id);
CREATE INDEX idx_datasets_datasource ON public.datasets(datasource_id);
CREATE INDEX idx_dataset_columns_dataset ON public.dataset_columns(dataset_id);
CREATE INDEX idx_dataset_relationships_tenant ON public.dataset_relationships(tenant_id);
CREATE INDEX idx_dashboard_definitions_dashboard ON public.dashboard_definitions(dashboard_id);