import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "missing_access_token" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) return json({ error: "supabase_runtime_not_configured" }, 503);

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);
    if (userError || !user) return json({ error: "invalid_user" }, 401);

    const ownerUserId = Deno.env.get("PRICE_SCOUT_OWNER_USER_ID");
    if (!ownerUserId) return json({ error: "owner_not_configured" }, 503);
    if (user.id !== ownerUserId) return json({ error: "forbidden" }, 403);

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
    if (!botToken || !chatId) return json({ error: "telegram_not_configured" }, 503);

    const payload = await req.json().catch(() => ({}));
    const caption = String(payload?.caption || "").trim().slice(0, 1000);
    const imageBase64 = String(payload?.image_base64 || "").trim();
    if (!caption && !imageBase64) return json({ error: "empty_promotion" }, 400);

    let telegramResponse: Response;
    if (imageBase64) {
      const raw = imageBase64.replace(/^data:image\/png;base64,/, "");
      const binary = atob(raw);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

      const form = new FormData();
      form.append("chat_id", chatId);
      form.append("photo", new Blob([bytes], { type: "image/png" }), "promocao.png");
      if (caption) form.append("caption", caption);

      telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: "POST",
        body: form,
      });
    } else {
      telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: caption, disable_web_page_preview: false }),
      });
    }

    const telegramData = await telegramResponse.json().catch(() => ({}));
    if (!telegramResponse.ok || telegramData?.ok === false) {
      console.error("Telegram publish failed", telegramResponse.status, telegramData?.description || "unknown_error");
      return json({ error: "telegram_publish_failed", status: telegramResponse.status }, 502);
    }

    return json({ ok: true, message_id: telegramData?.result?.message_id ?? null });
  } catch (error) {
    console.error("price-scout-telegram", error instanceof Error ? error.message : String(error));
    return json({ error: "internal_error" }, 500);
  }
});
