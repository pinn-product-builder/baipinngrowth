-- Drop the existing permissive SELECT policy
DROP POLICY IF EXISTS "Users can view global flags and their tenant flags" ON public.feature_flags;

-- Create a new policy that requires authentication
CREATE POLICY "Authenticated users can view global flags and their tenant flags"
ON public.feature_flags
FOR SELECT
TO authenticated
USING (
  (is_global = true) OR (tenant_id = get_user_tenant_id(auth.uid()))
);