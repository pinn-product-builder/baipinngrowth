-- EPIC F: Adicionar limites de tenant para planos
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS max_dashboards integer DEFAULT 50,
ADD COLUMN IF NOT EXISTS max_users integer DEFAULT 20,
ADD COLUMN IF NOT EXISTS max_schedules integer DEFAULT 10,
ADD COLUMN IF NOT EXISTS domain_allowlist text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS rate_limit_per_minute integer DEFAULT 60;

-- EPIC B: Adicionar use_proxy e allowlist por dashboard
-- (use_proxy já existe, adicionar allowed_domains se não existir)
-- Verificar se coluna existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'dashboards' 
                   AND column_name = 'allowed_domains') THEN
        ALTER TABLE public.dashboards ADD COLUMN allowed_domains text[] DEFAULT '{}';
    END IF;
END $$;

-- Index para performance em filtros de tenant
CREATE INDEX IF NOT EXISTS idx_dashboards_tenant_active ON public.dashboards(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next_send ON public.scheduled_reports(next_send_at) WHERE is_active = true;