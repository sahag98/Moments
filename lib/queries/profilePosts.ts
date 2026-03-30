import { supabase } from "@/lib/supabase";

export type ProfileGridPost = {
  id: number;
  image: string;
  created_at: string;
};

export function profileWeekPostsQueryKey(userId: string | undefined) {
  return ["profileWeekPosts", userId ?? "none"] as const;
}

export async function fetchProfileWeekPosts(
  userId: string,
): Promise<ProfileGridPost[]> {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const oneWeekAgoISO = oneWeekAgo.toISOString();

  const { data, error } = await supabase
    .from("posts")
    .select("id, image, created_at")
    .eq("user_id", userId)
    .gte("created_at", oneWeekAgoISO)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as ProfileGridPost[];
}
