-- Create cache table for context packs
CREATE TABLE public.dashboard_context_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  dashboard_id UUID NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  cache_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  UNIQUE(dashboard_id, start_date, end_date, cache_hash)
);

-- Enable RLS
ALTER TABLE public.dashboard_context_cache ENABLE ROW LEVEL SECURITY;

-- Service role can manage cache
CREATE POLICY "Service role can manage context cache"
ON public.dashboard_context_cache
FOR ALL
TO authenticated
USING (
  (current_setting('request.jwt.claims'::text, true)::json ->> 'role') = 'service_role'
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'manager'::app_role) AND tenant_id = get_user_tenant_id(auth.uid()))
)
WITH CHECK (
  (current_setting('request.jwt.claims'::text, true)::json ->> 'role') = 'service_role'
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'manager'::app_role) AND tenant_id = get_user_tenant_id(auth.uid()))
);

-- Create index for fast lookup
CREATE INDEX idx_dashboard_context_cache_lookup ON public.dashboard_context_cache(dashboard_id, start_date, end_date, cache_hash);
CREATE INDEX idx_dashboard_context_cache_expires ON public.dashboard_context_cache(expires_at);

-- Add response_mode to profiles if needed
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS ai_response_mode TEXT DEFAULT 'executivo';

-- Add comment
COMMENT ON TABLE public.dashboard_context_cache IS 'Caches computed context packs to reduce latency and costs';