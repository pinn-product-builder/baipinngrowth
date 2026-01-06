-- Add theme preference to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS theme text DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system'));