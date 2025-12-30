-- Fix security issue: user_invites table should not expose all records
-- Drop the insecure policy and create a secure one

DROP POLICY IF EXISTS "Anyone can verify invite by token" ON public.user_invites;

-- Create a secure policy that only allows reading when the exact token is provided
-- This is handled server-side by edge functions, so we don't need a public SELECT policy
-- Instead, we keep only the policies for authenticated users (admins/managers)

-- The verify-invite edge function uses service role key, so it bypasses RLS
-- This is the correct approach for token verification