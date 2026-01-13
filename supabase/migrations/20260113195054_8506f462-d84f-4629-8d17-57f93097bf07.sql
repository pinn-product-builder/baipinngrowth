-- Create VAPI calls tracking table
CREATE TABLE IF NOT EXISTS public.vapi_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.tenants(id),
  call_date DATE NOT NULL,
  calls_total INTEGER NOT NULL DEFAULT 0,
  calls_answered INTEGER DEFAULT 0,
  calls_missed INTEGER DEFAULT 0,
  avg_duration_seconds NUMERIC(10,2) DEFAULT 0,
  total_duration_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, call_date)
);

-- Enable RLS
ALTER TABLE public.vapi_calls ENABLE ROW LEVEL SECURITY;

-- RLS policies for vapi_calls
CREATE POLICY "Users can view VAPI calls for their tenant" 
ON public.vapi_calls 
FOR SELECT 
USING (
  org_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Service role can manage all VAPI calls" 
ON public.vapi_calls 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create the view for dashboard consumption
CREATE OR REPLACE VIEW public.vw_vapi_calls_daily_v3 AS
SELECT 
  call_date as day,
  org_id,
  calls_total,
  calls_answered,
  calls_missed,
  avg_duration_seconds,
  total_duration_seconds
FROM public.vapi_calls
ORDER BY call_date DESC;

-- Insert sample data for Afonsina tenant (last 30 days)
INSERT INTO public.vapi_calls (org_id, call_date, calls_total, calls_answered, calls_missed, avg_duration_seconds, total_duration_seconds)
SELECT 
  '22222222-2222-2222-2222-222222222222'::UUID,
  (CURRENT_DATE - (n || ' days')::INTERVAL)::DATE,
  FLOOR(RANDOM() * 80 + 20)::INTEGER,
  FLOOR(RANDOM() * 60 + 15)::INTEGER,
  FLOOR(RANDOM() * 15 + 2)::INTEGER,
  ROUND((RANDOM() * 180 + 60)::NUMERIC, 2),
  FLOOR(RANDOM() * 7200 + 1800)::INTEGER
FROM generate_series(0, 90) AS n
ON CONFLICT (org_id, call_date) DO NOTHING;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_vapi_calls_org_date ON public.vapi_calls(org_id, call_date DESC);