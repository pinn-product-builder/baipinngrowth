-- Fix security issues for vapi_calls

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Service role can manage all VAPI calls" ON public.vapi_calls;

-- Create proper INSERT policy
CREATE POLICY "Admins can insert VAPI calls for their tenant" 
ON public.vapi_calls 
FOR INSERT 
WITH CHECK (
  org_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
  )
);

-- Create proper UPDATE policy
CREATE POLICY "Admins can update VAPI calls for their tenant" 
ON public.vapi_calls 
FOR UPDATE 
USING (
  org_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
  )
);

-- Create proper DELETE policy
CREATE POLICY "Admins can delete VAPI calls for their tenant" 
ON public.vapi_calls 
FOR DELETE 
USING (
  org_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);