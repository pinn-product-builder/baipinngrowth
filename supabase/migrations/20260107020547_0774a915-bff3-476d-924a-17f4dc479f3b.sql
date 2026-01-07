-- Table for tenant goals/metas (CPL, CAC, conversion rates, etc.)
CREATE TABLE public.tenant_goals (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    dashboard_id UUID REFERENCES public.dashboards(id) ON DELETE CASCADE,
    metric_key TEXT NOT NULL, -- 'cpl', 'cac', 'taxa_visita_lead', etc.
    metric_label TEXT NOT NULL,
    goal_type TEXT NOT NULL DEFAULT 'max', -- 'max', 'min', 'target', 'range'
    goal_value NUMERIC NOT NULL,
    goal_value_max NUMERIC, -- for range type
    unit TEXT DEFAULT 'currency', -- 'currency', 'percent', 'number'
    alert_threshold_warning NUMERIC, -- e.g., 80% of goal
    alert_threshold_critical NUMERIC, -- e.g., 100% of goal
    alert_enabled BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tenant_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all goals"
ON public.tenant_goals FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can manage their tenant goals"
ON public.tenant_goals FOR ALL
USING (has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can view their tenant goals"
ON public.tenant_goals FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE TRIGGER update_tenant_goals_updated_at
BEFORE UPDATE ON public.tenant_goals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table for data quality issues
CREATE TABLE public.data_quality_issues (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    dashboard_id UUID REFERENCES public.dashboards(id) ON DELETE CASCADE,
    dataset_id UUID REFERENCES public.datasets(id) ON DELETE CASCADE,
    issue_type TEXT NOT NULL, -- 'missing_dates', 'zero_cost_with_leads', 'nan_values', 'outlier', 'stale_data'
    severity TEXT NOT NULL DEFAULT 'warning', -- 'info', 'warning', 'critical'
    title TEXT NOT NULL,
    description TEXT,
    affected_dates TEXT[], -- array of affected date strings
    affected_columns TEXT[],
    details JSONB DEFAULT '{}',
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.data_quality_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all data quality issues"
ON public.data_quality_issues FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can view their tenant issues"
ON public.data_quality_issues FOR SELECT
USING (has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Service role can manage issues"
ON public.data_quality_issues FOR ALL
USING (((current_setting('request.jwt.claims', true))::json ->> 'role') = 'service_role')
WITH CHECK (((current_setting('request.jwt.claims', true))::json ->> 'role') = 'service_role');

CREATE INDEX idx_data_quality_issues_tenant ON public.data_quality_issues(tenant_id, created_at DESC);
CREATE INDEX idx_data_quality_issues_unresolved ON public.data_quality_issues(resolved_at) WHERE resolved_at IS NULL;

-- Table for generated insights (problems, opportunities, actions)
CREATE TABLE public.dashboard_generated_insights (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    dashboard_id UUID NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
    insight_type TEXT NOT NULL, -- 'problem', 'opportunity', 'action', 'anomaly', 'bottleneck'
    priority TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    metric_key TEXT,
    current_value NUMERIC,
    comparison_value NUMERIC,
    change_percent NUMERIC,
    impact_estimate TEXT, -- e.g., "Potential savings of R$ 5.000/month"
    suggested_action TEXT,
    period_start DATE,
    period_end DATE,
    comparison_period_start DATE,
    comparison_period_end DATE,
    details JSONB DEFAULT '{}',
    dismissed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.dashboard_generated_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view insights of their tenant"
ON public.dashboard_generated_insights FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()) OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can dismiss insights"
ON public.dashboard_generated_insights FOR UPDATE
USING (tenant_id = get_user_tenant_id(auth.uid()) OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage insights"
ON public.dashboard_generated_insights FOR ALL
USING (((current_setting('request.jwt.claims', true))::json ->> 'role') = 'service_role')
WITH CHECK (((current_setting('request.jwt.claims', true))::json ->> 'role') = 'service_role');

CREATE INDEX idx_insights_dashboard ON public.dashboard_generated_insights(dashboard_id, created_at DESC);
CREATE INDEX idx_insights_active ON public.dashboard_generated_insights(dashboard_id, dismissed_at) WHERE dismissed_at IS NULL;

-- Table for alert history
CREATE TABLE public.alert_history (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    alert_config_id UUID REFERENCES public.alert_configurations(id) ON DELETE SET NULL,
    goal_id UUID REFERENCES public.tenant_goals(id) ON DELETE SET NULL,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    metric_value NUMERIC,
    threshold_value NUMERIC,
    notification_sent BOOLEAN DEFAULT false,
    notification_channels TEXT[],
    notification_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.alert_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all alerts"
ON public.alert_history FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can view their tenant alerts"
ON public.alert_history FOR SELECT
USING (has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Service role can manage alerts"
ON public.alert_history FOR ALL
USING (((current_setting('request.jwt.claims', true))::json ->> 'role') = 'service_role')
WITH CHECK (((current_setting('request.jwt.claims', true))::json ->> 'role') = 'service_role');

CREATE INDEX idx_alert_history_tenant ON public.alert_history(tenant_id, created_at DESC);