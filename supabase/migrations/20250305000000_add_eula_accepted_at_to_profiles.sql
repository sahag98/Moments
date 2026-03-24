-- Add EULA/terms acceptance timestamp to profiles (required for App Store Guideline 1.2 - User-Generated Content)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS eula_accepted_at timestamptz;

COMMENT ON COLUMN public.profiles.eula_accepted_at IS 'When the user accepted the Terms of Use and Community Guidelines during onboarding.';
