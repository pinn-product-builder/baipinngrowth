-- Create ingest_keys_v2 table for API key management
CREATE TABLE public.ingest_keys_v2 (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create leads_v2 table for lead management
CREATE TABLE public.leads_v2 (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  phone_raw TEXT,
  phone_e164 TEXT,
  kommo_lead_id TEXT,
  kommo_contact_id TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_adset TEXT,
  utm_ad TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, kommo_lead_id),
  UNIQUE(org_id, kommo_contact_id),
  UNIQUE(org_id, phone_e164),
  UNIQUE(org_id, email)
);

-- Create events_v2 table for event tracking
CREATE TABLE public.events_v2 (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads_v2(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_ts TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  actor TEXT DEFAULT 'system',
  agent_id TEXT,
  dedupe_key TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, dedupe_key)
);

-- Enable RLS
ALTER TABLE public.ingest_keys_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events_v2 ENABLE ROW LEVEL SECURITY;

-- RLS policies for ingest_keys_v2 (admin only)
CREATE POLICY "Admins can manage ingest keys" ON public.ingest_keys_v2
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin') AND 
    org_id = public.get_user_tenant_id(auth.uid())
  );

-- RLS policies for leads_v2
CREATE POLICY "Users can view leads in their tenant" ON public.leads_v2
  FOR SELECT USING (org_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins and managers can manage leads" ON public.leads_v2
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) AND 
    org_id = public.get_user_tenant_id(auth.uid())
  );

-- RLS policies for events_v2
CREATE POLICY "Users can view events in their tenant" ON public.events_v2
  FOR SELECT USING (org_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins and managers can manage events" ON public.events_v2
  FOR ALL USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) AND 
    org_id = public.get_user_tenant_id(auth.uid())
  );

-- Service role bypass for edge functions
CREATE POLICY "Service role can manage ingest keys" ON public.ingest_keys_v2
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage leads" ON public.leads_v2
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage events" ON public.events_v2
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Indexes for performance
CREATE INDEX idx_leads_v2_org_id ON public.leads_v2(org_id);
CREATE INDEX idx_leads_v2_kommo_lead_id ON public.leads_v2(org_id, kommo_lead_id);
CREATE INDEX idx_leads_v2_kommo_contact_id ON public.leads_v2(org_id, kommo_contact_id);
CREATE INDEX idx_leads_v2_phone ON public.leads_v2(org_id, phone_e164);
CREATE INDEX idx_leads_v2_email ON public.leads_v2(org_id, email);
CREATE INDEX idx_events_v2_org_id ON public.events_v2(org_id);
CREATE INDEX idx_events_v2_lead_id ON public.events_v2(lead_id);
CREATE INDEX idx_events_v2_dedupe ON public.events_v2(org_id, dedupe_key);

-- Triggers for updated_at
CREATE TRIGGER update_ingest_keys_v2_updated_at
  BEFORE UPDATE ON public.ingest_keys_v2
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leads_v2_updated_at
  BEFORE UPDATE ON public.leads_v2
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();