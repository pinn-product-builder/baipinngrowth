-- Tabela de configurações de IA por tenant
CREATE TABLE public.tenant_ai_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'openai',
  api_key_encrypted TEXT,
  api_key_last4 TEXT,
  default_model TEXT DEFAULT 'gpt-4.1-mini',
  enabled BOOLEAN DEFAULT true,
  max_requests_per_minute INTEGER DEFAULT 60,
  max_tokens_per_day INTEGER,
  max_spend_month_usd NUMERIC(10,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, provider)
);

-- Tabela de logs de uso de IA
CREATE TABLE public.ai_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  dashboard_id UUID REFERENCES public.dashboards(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL DEFAULT 'chat',
  model TEXT,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  cost_estimated NUMERIC(10,6),
  latency_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'success',
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_tenant_ai_settings_tenant ON public.tenant_ai_settings(tenant_id);
CREATE INDEX idx_ai_usage_logs_tenant ON public.ai_usage_logs(tenant_id);
CREATE INDEX idx_ai_usage_logs_created ON public.ai_usage_logs(created_at DESC);
CREATE INDEX idx_ai_usage_logs_user ON public.ai_usage_logs(user_id);

-- Enable RLS
ALTER TABLE public.tenant_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS para tenant_ai_settings: apenas admin/manager podem ler/escrever
CREATE POLICY "Admins and managers can view their tenant AI settings"
  ON public.tenant_ai_settings
  FOR SELECT
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

CREATE POLICY "Admins can insert AI settings"
  ON public.tenant_ai_settings
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can update AI settings"
  ON public.tenant_ai_settings
  FOR UPDATE
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can delete AI settings"
  ON public.tenant_ai_settings
  FOR DELETE
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  );

-- RLS para ai_usage_logs: admin/manager podem ler logs do seu tenant
CREATE POLICY "Admins and managers can view AI usage logs"
  ON public.ai_usage_logs
  FOR SELECT
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

-- Service role pode inserir logs (edge functions)
CREATE POLICY "Service role can insert AI usage logs"
  ON public.ai_usage_logs
  FOR INSERT
  WITH CHECK (true);

-- Trigger para updated_at
CREATE TRIGGER update_tenant_ai_settings_updated_at
  BEFORE UPDATE ON public.tenant_ai_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();