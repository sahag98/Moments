import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const posterId = user.id;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: posterProfile } = await admin
      .from("profiles")
      .select("username, full_name")
      .eq("id", posterId)
      .maybeSingle();

    const displayName =
      posterProfile?.username || posterProfile?.full_name || "Someone";

    const { data: recipients, error: recErr } = await admin
      .from("profiles")
      .select("id, expo_token")
      .neq("id", posterId)
      .not("expo_token", "is", null);

    if (recErr) {
      return new Response(JSON.stringify({ error: recErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = (recipients ?? []).filter((r) => r.expo_token);
    const body = `${displayName} posted a new moment!`;

    const results = await Promise.allSettled(
      rows.map(async (r) => {
        const message = {
          to: r.expo_token,
          sound: "default",
          title: "Moments",
          body,
          data: { route: "/(tabs)" },
        };
        const res = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || res.statusText);
        }
      }),
    );

    const failed = results.filter((r) => r.status === "rejected").length;

    return new Response(
      JSON.stringify({
        sent: rows.length - failed,
        failed,
        total: rows.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("notify-new-post", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
