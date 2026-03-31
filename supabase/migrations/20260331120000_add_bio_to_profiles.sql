-- Add bio field to profiles for user self-description
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS bio text;

COMMENT ON COLUMN public.profiles.bio IS 'Short user bio displayed on profile.';

