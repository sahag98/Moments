-- Faster feed + profile grid queries; satisfies unindexed FK hints on posts / blocked_users.
CREATE INDEX IF NOT EXISTS idx_posts_created_at_desc ON public.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_created_at ON public.posts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker_id ON public.blocked_users (blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_user_id ON public.blocked_users (blocked_user_id);
