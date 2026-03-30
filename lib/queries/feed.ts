import { Tables } from "@/database.types";
import { supabase } from "@/lib/supabase";

export const FEED_PAGE_SIZE = 20;

/** Columns needed for the home feed (avoid select *). */
const FEED_POST_SELECT = `
  id,
  user_id,
  image,
  caption,
  created_at,
  flagged,
  profiles (
    id,
    username,
    full_name,
    avatar_url,
    hype
  )
`.trim();

export type FeedProfile = Pick<
  Tables<"profiles">,
  "id" | "username" | "full_name" | "avatar_url" | "hype"
>;

export type FeedPost = Pick<
  Tables<"posts">,
  "id" | "user_id" | "image" | "caption" | "created_at" | "flagged"
> & {
  profiles: FeedProfile | null;
};

export type FeedQueryData = {
  posts: FeedPost[];
  blockedUserIds: string[];
};

export function feedPostsQueryKey(blockerId: string | undefined) {
  return ["feedPosts", blockerId ?? "anon"] as const;
}

export async function fetchFeedData(
  blockerId: string | undefined,
): Promise<FeedQueryData> {
  let blockedUserIds: string[] = [];
  if (blockerId) {
    const { data: blockedData, error: blockedError } = await supabase
      .from("blocked_users")
      .select("blocked_user_id")
      .eq("blocker_id", blockerId);

    if (blockedError) {
      console.error("Error fetching blocked users:", blockedError);
    } else if (blockedData) {
      blockedUserIds = blockedData.map((row) => row.blocked_user_id);
    }
  }

  const { data, error } = await supabase
    .from("posts")
    .select(FEED_POST_SELECT)
    .order("created_at", { ascending: false })
    .limit(FEED_PAGE_SIZE);

  if (error) {
    throw error;
  }

  let posts = (data ?? []) as unknown as FeedPost[];
  if (blockedUserIds.length > 0) {
    posts = posts.filter((post) => !blockedUserIds.includes(post.user_id));
  }

  return { posts, blockedUserIds };
}

/** Single post + author for realtime insert (current user) without refetching the full feed. */
export async function fetchFeedPostById(
  postId: number,
): Promise<FeedPost | null> {
  const { data, error } = await supabase
    .from("posts")
    .select(FEED_POST_SELECT)
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching single feed post:", error);
    return null;
  }

  return (data ?? null) as unknown as FeedPost | null;
}

/** Load push token only when sending a notification (keeps feed payloads smaller). */
export async function fetchExpoTokenForProfile(
  profileId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("expo_token")
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching expo_token for push:", error);
    return null;
  }

  return data?.expo_token ?? null;
}
