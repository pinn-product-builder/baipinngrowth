-- Create dashboard_insights table for saved insights/notes
CREATE TABLE IF NOT EXISTS public.dashboard_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  dashboard_id UUID NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  period_start DATE,
  period_end DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dashboard_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies for dashboard_insights
CREATE POLICY "Users can view insights in their tenant"
  ON public.dashboard_insights
  FOR SELECT
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can create insights in their tenant"
  ON public.dashboard_insights
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can update their own insights"
  ON public.dashboard_insights
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can delete their own insights"
  ON public.dashboard_insights
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- Add indexes
CREATE INDEX idx_dashboard_insights_tenant ON public.dashboard_insights(tenant_id);
CREATE INDEX idx_dashboard_insights_dashboard ON public.dashboard_insights(dashboard_id);
CREATE INDEX idx_dashboard_insights_user ON public.dashboard_insights(user_id);
CREATE INDEX idx_dashboard_insights_tags ON public.dashboard_insights USING GIN(tags);

-- Add trigger for updated_at
CREATE TRIGGER update_dashboard_insights_updated_at
  BEFORE UPDATE ON public.dashboard_insights
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();