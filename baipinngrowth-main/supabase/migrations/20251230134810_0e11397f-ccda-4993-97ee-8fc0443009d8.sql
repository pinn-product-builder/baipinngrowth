-- Add last_error_message column to dashboards for better error tracking
ALTER TABLE public.dashboards ADD COLUMN IF NOT EXISTS last_error_message text;