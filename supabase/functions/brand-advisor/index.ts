// supabase/functions/brand-advisor/index.ts
//
// "Spark" — the client-facing brand & marketing advisor for the Marketing iO portal.
//
// SECURITY / SCOPE (read before changing):
//   1. Anthropic key stays here as an Edge Function secret. The browser never sees it.
//   2. The ONLY data this touches is the caller's OWN client row, read under their JWT
//      (RLS enforced). No pipeline, no commissions, no other clients. No writes anywhere.
//   3. There are no tools and no agent loop — the client's brand profile is pre-loaded
//      into the system prompt, then it's a single Haiku call. Cheapest, fastest, safest.
//   4. Hard limit: 5 questions per client per day (request_count in ai_usage).
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (already set if you deployed the owner one)
//   supabase functions deploy brand-advisor

import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MODEL = "claude-haiku-4-5-20251001";   // cheapest current model; plenty for advice + content
const MAX_TOKENS = 1200;
const DAILY_MESSAGE_CAP = 5;                  // per client per day

const cors = {
  "Access-Control-Allow-Origin": "*",         // tighten to your portal origin in production
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Build a personalized system prompt from whatever brand fields the client has filled in.
function buildSystemPrompt(c: any): string {
  const bits: string[] = [];
  const add = (label: string, val: unknown) => {
    if (val && String(val).trim() && String(val) !== "none") bits.push(`- ${label}: ${val}`);
  };
  add("Business", c.business_name);
  add("Industry", c.industry);
  add("Area / address", c.address);
  add("Current package", c.package);
  add("Brand tone of voice", c.tone_of_voice);
  add("Brand colours", c.brand_colors);
  add("Languages to write in", Array.isArray(c.languages) ? c.languages.join(", ") : c.languages);
  add("Words / phrases to avoid", Array.isArray(c.words_to_avoid) ? c.words_to_avoid.join(", ") : c.words_to_avoid);
  add("Posting preference", c.posting_preference);
  add("Instagram", c.instagram_handle);
  add("TikTok", c.tiktok_handle);
  add("Facebook", c.facebook_page_url);
  add("Website", c.website);

  const profile = bits.length ? bits.join("\n") : "- (Brand profile not filled in yet — ask a couple of quick questions to tailor your advice, then give it.)";

  return `You are Spark, the friendly brand & marketing advisor inside the Marketing iO client portal.
Marketing iO helps South African small businesses — townships, villages, high streets — get seen. The brand ethos is "Too Good To Stay Hidden."

You are talking to a real Marketing iO client. Here is their brand profile:
${profile}

WHAT YOU DO:
- Give practical, specific marketing advice for their business and local South African context.
- Generate ready-to-use content on request: social captions, post ideas, promo copy, simple content calendars. Write in their tone of voice and languages, and never use their listed words-to-avoid.
- Be concrete and doable for a small/local business (low budget, WhatsApp, foot traffic, community). Prefer 3–5 sharp ideas over long essays.

WHAT YOU DON'T DO:
- You are marketing-only. For billing, invoices, package changes, contracts, or complaints, tell them to message their Marketing iO account team through the portal — do not attempt to answer or action those.
- Never promise deliverables, dates, prices, or results on Marketing iO's behalf. You advise; the team delivers.
- Don't invent facts about their account. If you'd need data you don't have, ask them.

Keep it warm, energetic and encouraging — like a marketer who genuinely wants their shop to win.`;
}

async function callHaiku(system: string, messages: any[]) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system, messages }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY); // usage meter only

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "not_authenticated" }, 401);

    // Must be a client with their own record. RLS also guarantees they can only read their own row.
    const { data: client } = await userClient
      .from("clients")
      .select("business_name, industry, address, package, tone_of_voice, brand_colors, languages, words_to_avoid, posting_preference, instagram_handle, tiktok_handle, facebook_page_url, website")
      .eq("client_user_id", user.id)
      .maybeSingle();
    if (!client) return json({ error: "forbidden: brand advisor is for clients" }, 403);

    // 5-per-day cap.
    const today = new Date().toISOString().slice(0, 10);
    const { data: usageRow } = await adminClient
      .from("ai_usage").select("request_count, input_tokens, output_tokens")
      .eq("user_id", user.id).eq("day", today).maybeSingle();
    const usedToday = usageRow?.request_count ?? 0;
    if (usedToday >= DAILY_MESSAGE_CAP) {
      return json({
        reply: "You've used all 5 of today's questions with Spark. I'll be here again tomorrow — or message your Marketing iO team any time.",
        remaining: 0, limit_reached: true,
      }, 200);
    }

    const body = await req.json().catch(() => ({}));
    const messages: any[] = Array.isArray(body?.messages) ? body.messages : [];
    if (messages.length === 0) return json({ error: "messages required" }, 400);

    const system = buildSystemPrompt(client);
    const resp = await callHaiku(system, messages);
    const reply = (resp.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();

    // Meter: +1 message, add tokens.
    await adminClient.from("ai_usage").upsert(
      {
        user_id: user.id, day: today,
        request_count: usedToday + 1,
        input_tokens: (usageRow?.input_tokens ?? 0) + (resp.usage?.input_tokens ?? 0),
        output_tokens: (usageRow?.output_tokens ?? 0) + (resp.usage?.output_tokens ?? 0),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,day" },
    );

    return json({ reply, remaining: DAILY_MESSAGE_CAP - (usedToday + 1) });
  } catch (e) {
    return json({ error: "advisor_failed", detail: String(e), reply: "Sorry — I couldn't answer just now. Please try again in a moment." }, 500);
  }
});
