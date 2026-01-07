-- Create table for system health events and errors
CREATE TABLE public.system_health_events (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'error', 'warning', 'info', 'alert'
    source TEXT NOT NULL, -- 'datasource', 'dashboard', 'edge_function', 'ai', 'billing'
    source_id UUID, -- optional reference to the specific entity
    source_name TEXT, -- human readable name
    trace_id TEXT, -- for correlating logs
    error_code TEXT,
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_health_events ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can view all health events"
ON public.system_health_events
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can view their tenant health events"
ON public.system_health_events
FOR SELECT
USING (has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Service role can manage health events"
ON public.system_health_events
FOR ALL
USING (((current_setting('request.jwt.claims', true))::json ->> 'role') = 'service_role')
WITH CHECK (((current_setting('request.jwt.claims', true))::json ->> 'role') = 'service_role');

-- Create indexes for efficient querying
CREATE INDEX idx_health_events_tenant_created ON public.system_health_events(tenant_id, created_at DESC);
CREATE INDEX idx_health_events_source ON public.system_health_events(source, created_at DESC);
CREATE INDEX idx_health_events_unresolved ON public.system_health_events(resolved_at) WHERE resolved_at IS NULL;

-- Create table for alert configurations
CREATE TABLE public.alert_configurations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    is_global BOOLEAN DEFAULT false,
    alert_type TEXT NOT NULL, -- 'datasource_failure', 'dashboard_no_data', 'ai_budget_warning', 'latency_high'
    threshold_value NUMERIC, -- e.g., 80 for 80% budget, 5 for 5 failures
    threshold_unit TEXT, -- 'percent', 'count', 'seconds', 'days'
    notification_channels JSONB DEFAULT '["email"]', -- email, webhook
    webhook_url TEXT,
    emails TEXT[],
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.alert_configurations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can manage all alert configs"
ON public.alert_configurations
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can manage their tenant alert configs"
ON public.alert_configurations
FOR ALL
USING (has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_alert_configurations_updated_at
BEFORE UPDATE ON public.alert_configurations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();