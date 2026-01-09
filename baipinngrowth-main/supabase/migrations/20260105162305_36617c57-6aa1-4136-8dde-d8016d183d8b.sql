-- Add new columns to tenant_data_sources for proxy_webhook support
ALTER TABLE public.tenant_data_sources 
ADD COLUMN IF NOT EXISTS base_url TEXT,
ADD COLUMN IF NOT EXISTS auth_mode TEXT DEFAULT 'none' CHECK (auth_mode IN ('none', 'bearer_token')),
ADD COLUMN IF NOT EXISTS bearer_token TEXT;

-- Update the type column to allow 'proxy_webhook'
-- The type column is already TEXT so we just need to update it where needed

COMMENT ON COLUMN public.tenant_data_sources.base_url IS 'Base URL for proxy/webhook data sources (e.g., n8n webhook URL)';
COMMENT ON COLUMN public.tenant_data_sources.auth_mode IS 'Authentication mode: none or bearer_token';
COMMENT ON COLUMN public.tenant_data_sources.bearer_token IS 'Bearer token for proxy authentication (stored plaintext for simplicity)';