-- Add password_changed column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_changed boolean NOT NULL DEFAULT false;

-- Add health check columns to dashboards
ALTER TABLE public.dashboards ADD COLUMN IF NOT EXISTS last_health_status text;
ALTER TABLE public.dashboards ADD COLUMN IF NOT EXISTS last_health_check_at timestamp with time zone;

-- Create seed data for tenants
INSERT INTO public.tenants (id, name, slug, is_active)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'PinnGrowth', 'pinngrowth', true),
  ('22222222-2222-2222-2222-222222222222', 'Afonsina Oliveira', 'afonsina-oliveira', true)
ON CONFLICT (id) DO NOTHING;

-- Create dashboard for Afonsina tenant
INSERT INTO public.dashboards (id, tenant_id, name, webhook_url, display_type, display_order, is_active)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  'Afonsina • Dashboard',
  'https://n8n.srv879715.hstgr.cloud/webhook/afonsinaoliveiradash',
  'auto',
  0,
  true
)
ON CONFLICT (id) DO NOTHING;