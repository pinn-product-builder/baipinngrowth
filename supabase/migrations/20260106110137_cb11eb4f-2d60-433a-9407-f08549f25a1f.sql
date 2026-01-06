-- =====================================================
-- BAI AI ANALYST - DATABASE SCHEMA
-- =====================================================

-- 1) Add AI fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS ai_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_daily_limit_messages integer DEFAULT 30,
ADD COLUMN IF NOT EXISTS ai_daily_limit_tokens integer DEFAULT 120000,
ADD COLUMN IF NOT EXISTS ai_style text DEFAULT 'executivo' CHECK (ai_style IN ('executivo', 'analista'));

-- 2) Create ai_conversations table
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dashboard_id uuid REFERENCES public.dashboards(id) ON DELETE SET NULL,
  start_date date,
  end_date date,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_conversations
CREATE POLICY "Users can view own tenant conversations"
ON public.ai_conversations FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can create own conversations"
ON public.ai_conversations FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND tenant_id = public.get_user_tenant_id(auth.uid())
);

CREATE POLICY "Users can update own conversations"
ON public.ai_conversations FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own conversations"
ON public.ai_conversations FOR DELETE
USING (user_id = auth.uid());

-- 3) Create ai_messages table
CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content text NOT NULL,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_messages (inherit from conversation)
CREATE POLICY "Users can view messages from accessible conversations"
ON public.ai_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = conversation_id
    AND (
      c.tenant_id = public.get_user_tenant_id(auth.uid())
      OR public.has_role(auth.uid(), 'admin')
    )
  )
);

CREATE POLICY "Users can insert messages to own conversations"
ON public.ai_messages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ai_conversations c
    WHERE c.id = conversation_id
    AND c.user_id = auth.uid()
  )
);

-- 4) Create ai_usage_daily table
CREATE TABLE IF NOT EXISTS public.ai_usage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  requests integer DEFAULT 0,
  tokens_in integer DEFAULT 0,
  tokens_out integer DEFAULT 0,
  estimated_cost numeric(10,4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

-- Enable RLS
ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_usage_daily
CREATE POLICY "Users can view own usage"
ON public.ai_usage_daily FOR SELECT
USING (
  user_id = auth.uid()
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'manager')
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "System can insert usage"
ON public.ai_usage_daily FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update usage"
ON public.ai_usage_daily FOR UPDATE
USING (true);

-- 5) Create indexes
CREATE INDEX IF NOT EXISTS idx_ai_conversations_tenant ON public.ai_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON public.ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_dashboard ON public.ai_conversations(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON public.ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_tenant_date ON public.ai_usage_daily(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_user_date ON public.ai_usage_daily(user_id, date);

-- 6) Create auto-insights table for scheduled summaries
CREATE TABLE IF NOT EXISTS public.ai_auto_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  dashboard_id uuid NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  date date NOT NULL,
  summary text NOT NULL,
  highlights jsonb,
  alerts jsonb,
  forecast jsonb,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dashboard_id, date)
);

-- Enable RLS
ALTER TABLE public.ai_auto_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_auto_insights
CREATE POLICY "Users can view own tenant insights"
ON public.ai_auto_insights FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "System can insert insights"
ON public.ai_auto_insights FOR INSERT
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ai_auto_insights_tenant ON public.ai_auto_insights(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_auto_insights_dashboard_date ON public.ai_auto_insights(dashboard_id, date);

-- 7) Trigger for updated_at
CREATE TRIGGER update_ai_conversations_updated_at
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_usage_daily_updated_at
  BEFORE UPDATE ON public.ai_usage_daily
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();