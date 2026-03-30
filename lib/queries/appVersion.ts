import { supabase } from "@/lib/supabase";

export const APP_VERSION_QUERY_KEY = ["appVersion", "num"] as const;

/** Minimal read for update modal; cache aggressively to limit egress. */
export async function fetchAppVersionNum(): Promise<string | null> {
  const { data, error } = await supabase
    .from("version")
    .select("num")
    .limit(1);

  if (error) {
    console.warn("fetchAppVersionNum:", error.message);
    return null;
  }

  const row = data?.[0];
  return row?.num ?? null;
}
