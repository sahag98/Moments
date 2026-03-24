-- Add flagged boolean column to posts for user reports
ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.posts.flagged IS 'Set to true when a post has been flagged by a user for review.';

