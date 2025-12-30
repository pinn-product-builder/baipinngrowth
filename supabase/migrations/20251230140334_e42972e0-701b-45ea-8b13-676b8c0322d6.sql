-- Migrate existing 'client' users to 'viewer'
UPDATE user_roles SET role = 'viewer' WHERE role = 'client';

-- Add status column to profiles for invite flow
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'disabled'));

-- Create user_invites table for invite flow
CREATE TABLE IF NOT EXISTS public.user_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'viewer',
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by UUID REFERENCES auth.users(id),
  accepted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on user_invites
ALTER TABLE user_invites ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_invites
CREATE POLICY "Admins can manage all invites" ON user_invites
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can manage invites for their tenant" ON user_invites
FOR ALL USING (
  has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid())
) WITH CHECK (
  has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid())
);

-- Public access to verify invite token (before user is authenticated)
CREATE POLICY "Anyone can verify invite by token" ON user_invites
FOR SELECT USING (true);

-- Create dashboard_categories table
CREATE TABLE IF NOT EXISTS public.dashboard_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, name)
);

-- Enable RLS on dashboard_categories
ALTER TABLE dashboard_categories ENABLE ROW LEVEL SECURITY;

-- RLS policies for dashboard_categories
CREATE POLICY "Admins can manage all categories" ON dashboard_categories
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can manage categories for their tenant" ON dashboard_categories
FOR ALL USING (
  has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid())
) WITH CHECK (
  has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid())
);

CREATE POLICY "Users can view categories of their tenant" ON dashboard_categories
FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Add category_id and tags to dashboards
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES dashboard_categories(id) ON DELETE SET NULL;
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS use_proxy BOOLEAN DEFAULT FALSE;

-- Create scheduled_reports table
CREATE TABLE IF NOT EXISTS public.scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
  emails TEXT[] NOT NULL,
  dashboard_ids UUID[] NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_sent_at TIMESTAMPTZ,
  next_send_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on scheduled_reports
ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;

-- RLS policies for scheduled_reports
CREATE POLICY "Admins can manage all reports" ON scheduled_reports
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can manage reports for their tenant" ON scheduled_reports
FOR ALL USING (
  has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid())
) WITH CHECK (
  has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid())
);

-- Add trigger for scheduled_reports updated_at
CREATE TRIGGER update_scheduled_reports_updated_at
  BEFORE UPDATE ON scheduled_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update RLS policies for profiles to include manager role
DROP POLICY IF EXISTS "Admins can manage all profiles" ON profiles;
CREATE POLICY "Admins can manage all profiles" ON profiles
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can view profiles of their tenant" ON profiles
FOR SELECT USING (
  has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid())
);

CREATE POLICY "Managers can update profiles of their tenant" ON profiles
FOR UPDATE USING (
  has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid())
) WITH CHECK (
  has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid())
);

-- Update RLS policies for dashboards to include manager role
CREATE POLICY "Managers can manage dashboards of their tenant" ON dashboards
FOR ALL USING (
  has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid())
) WITH CHECK (
  has_role(auth.uid(), 'manager') AND tenant_id = get_user_tenant_id(auth.uid())
);

-- Update the clients view policy to work with viewer role
DROP POLICY IF EXISTS "Clients can view active dashboards of their tenant" ON dashboards;
CREATE POLICY "Viewers can view active dashboards of their tenant" ON dashboards
FOR SELECT USING (
  is_active = true AND tenant_id = get_user_tenant_id(auth.uid())
);

-- Update RLS policies for user_roles to include manager
CREATE POLICY "Managers can view roles of their tenant users" ON user_roles
FOR SELECT USING (
  has_role(auth.uid(), 'manager') AND 
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = user_roles.user_id 
    AND profiles.tenant_id = get_user_tenant_id(auth.uid())
  )
);

-- Update RLS policies for tenants to include manager
CREATE POLICY "Managers can view their own tenant" ON tenants
FOR SELECT USING (id = get_user_tenant_id(auth.uid()));

-- Update activity_logs policies for manager
CREATE POLICY "Managers can view logs of their tenant" ON activity_logs
FOR SELECT USING (
  has_role(auth.uid(), 'manager') AND 
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = activity_logs.user_id 
    AND profiles.tenant_id = get_user_tenant_id(auth.uid())
  )
);

CREATE POLICY "Managers can insert logs" ON activity_logs
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'manager') AND user_id = auth.uid()
);