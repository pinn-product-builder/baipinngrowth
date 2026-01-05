-- EPIC 1: Criar tabela tenant_data_sources
CREATE TABLE public.tenant_data_sources (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'supabase' CHECK (type IN ('supabase')),
    name TEXT NOT NULL,
    project_ref TEXT NOT NULL,
    project_url TEXT NOT NULL,
    anon_key_encrypted TEXT,
    service_role_key_encrypted TEXT,
    anon_key_present BOOLEAN NOT NULL DEFAULT false,
    service_role_key_present BOOLEAN NOT NULL DEFAULT false,
    allowed_views TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tenant_data_sources ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenant_data_sources
CREATE POLICY "Admins can manage all data sources"
ON public.tenant_data_sources
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can view data sources of their tenant"
ON public.tenant_data_sources
FOR SELECT
USING (has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_tenant_data_sources_updated_at
BEFORE UPDATE ON public.tenant_data_sources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- EPIC 2: Adicionar campos à tabela dashboards
-- Criar enum para source_kind
CREATE TYPE public.dashboard_source_kind AS ENUM ('webhook', 'supabase_view');

-- Adicionar novas colunas
ALTER TABLE public.dashboards
ADD COLUMN source_kind public.dashboard_source_kind NOT NULL DEFAULT 'webhook',
ADD COLUMN data_source_id UUID REFERENCES public.tenant_data_sources(id) ON DELETE SET NULL,
ADD COLUMN view_name TEXT,
ADD COLUMN default_filters JSONB DEFAULT '{}',
ADD COLUMN cache_ttl_seconds INTEGER DEFAULT 300;

-- Fazer webhook_url opcional (agora pode ser null para supabase_view)
ALTER TABLE public.dashboards ALTER COLUMN webhook_url DROP NOT NULL;