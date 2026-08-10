// Tavue API — Cloudflare Worker
//
// POST /scan  { imageBase64, mediaType }  →  ScanResult JSON
//
// Pipeline:
//   1. One multimodal Claude call: OCR + translate + structure the menu.
//   2. For each dish, resolve a photo: KV cache → Google Image Search → null.
//
// Secrets (set with `wrangler secret put NAME`):
//   ANTHROPIC_API_KEY   required
//   GOOGLE_CSE_KEY      optional — Google Custom Search API key
//   GOOGLE_CSE_CX       optional — Programmable Search Engine ID (image search on)
// KV binding (optional but recommended): DISH_IMAGES

// Haiku: ~3-4x faster than Sonnet for extraction tasks like this.
// Override per-deploy with `wrangler secret put MODEL` if quality needs a bump
// (e.g. back to "claude-sonnet-4-20250514").
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_DISHES = 80;
const MAX_TOKENS = 16000;
const MAX_IMAGE_BASE64_CHARS = 10_000_000;
const MAX_EVENT_BODY_BYTES = 8_192;
const MAX_FEEDBACK_BODY_BYTES = 16_384;
const FEEDBACK_TTL_SECONDS = 60 * 60 * 24 * 180;
const ANALYTICS_EVENTS = new Set([
  "app_opened",
  "scan_started",
  "scan_completed",
  "scan_failed",
  "dish_detail_opened",
  "order_item_added",
  "order_opened",
  "order_server_view_opened",
  "order_saved",
  "order_history_opened",
  "dish_photo_saved",
  "history_menu_reopened",
  "feedback_submitted",
]);
const ANALYTICS_SOURCES = new Set([
  "camera",
  "library",
  "history",
  "card",
  "detail",
]);
const SUPPORTED_CURRENCIES = new Set([
  "GBP",
  "USD",
  "EUR",
  "CNY",
  "HKD",
  "JPY",
  "KRW",
  "THB",
  "SGD",
  "AUD",
  "CAD",
  "AED",
  "CHF",
]);

const systemPrompt = (lang, targetCurrency) => `You are Tavue, an expert menu reader for travellers. You read restaurant menu photos in any language and explain every dish plainly to a ${lang} speaker.

Rules:
- Extract EVERY food and drink item printed on the menu — completeness is critical. If the menu has 60 dishes, return 60 dishes. Never summarise, sample, or skip sections.
- NEVER output section or category headers (e.g. "Antipasti", "Carne e Pollame", "Desserts", "Sides") as dishes. A dish is something a diner can order, usually with its own price. If you catch yourself writing "section header" in a description, omit that item entirely.
- Preserve the menu structure: put the translated section heading for every item in "category" (e.g. "Starters", "Noodles", "Desserts"). Keep the same category wording for every item in that printed section. If no heading is visible, use "Menu".
- Copy the section heading exactly as printed into "original_category". Never translate, correct, expand, or normalise it. If no heading is visible, use null.
- Copy "original_name" exactly as printed. Never translate, correct spelling, expand abbreviations, or replace it with a more familiar dish name.
- Write "translated_name", "description" and "worth_it" in ${lang}. If the menu is already in ${lang}, still fill these fields (translated_name may match the original).
- Write "category" and "ingredients" in ${lang}. "ingredients" should contain only the main ingredients you can reasonably infer; use [] when unclear.
- Descriptions: ONE short sentence (max 14 words) saying what the dish actually IS. Never marketing language.
- For wine, sake, beer, and spirits lists: the description should give grape/style/region and a 2-3 word flavour profile (e.g. "Tuscan Sangiovese — bold, cherry, dry"). "worth_it" can suggest what it pairs with.
- "worth_it" is one short line (max 10 words) of honest ordering advice. Use null when you have nothing useful — most dishes should be null; reserve it for standouts, classics, and traps.
- For prices: copy exactly as printed into "price". Guess the menu's original currency from language/context into "currency" (ISO code) at the top level.
- Convert every printed price to GBP using a reasonable approximate exchange rate and put it in "price_gbp", formatted like "£4.80". This keeps earlier beta builds compatible.
- Also convert every printed price to ${targetCurrency} using a reasonable approximate exchange rate and put it in "converted_price", formatted with the correct currency symbol or ISO code. Set top-level "display_currency" to exactly "${targetCurrency}".
- If no price is printed, use null for "price", "price_gbp" and "converted_price".
- "image_query" must ALWAYS be a short English search query that returns photos of this exact dish, e.g. "wonton lo mein noodles" — English regardless of the target language.
- "spice_level": 0 none, 1 mild, 2 medium, 3 hot.
- Respond with ONLY valid JSON. No markdown, no code fences, no preamble.

JSON schema:
{
  "cuisine": string,
  "currency": string | null,
  "display_currency": "${targetCurrency}",
  "menu_language": string,
  "dishes": [
    {
      "category": string,
      "original_category": string | null,
      "original_name": string,
      "romanized": string | null,
      "translated_name": string,
      "description": string,
      "ingredients": string[],
      "price": string | null,
      "price_gbp": string | null,
      "converted_price": string | null,
      "spice_level": 0 | 1 | 2 | 3,
      "flags": ("spicy"|"raw"|"offal"|"contains_nuts"|"contains_shellfish"|"contains_gluten"|"contains_dairy"|"vegetarian"|"vegan"|"house_special")[],
      "worth_it": string | null,
      "image_query": string
    }
  ]
}`;

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch {
      console.error(JSON.stringify({ type: "worker_error", code: "unhandled" }));
      return json(
        { error: "Service temporarily unavailable", code: "worker_unhandled" },
        500,
        corsHeaders()
      );
    }
  },
};

async function handleRequest(request, env) {
  const cors = corsHeaders();
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true, service: "tavue-api", version: "0.9.0" }, 200, cors);
  }
  if (request.method === "GET" && url.pathname === "/privacy") {
    return html(privacyPage(env));
  }
  if (request.method === "GET" && url.pathname === "/support") {
    return html(supportPage(env));
  }

  const clientId = readClientId(request);
  if (
    env.REQUIRE_CLIENT_ID === "true" &&
    ["/scan", "/events", "/feedback"].includes(url.pathname) &&
    !clientId
  ) {
    return json(
      { error: "Client identifier required", code: "client_id_required" },
      401,
      cors
    );
  }

  if (request.method === "POST" && url.pathname === "/events") {
    return receiveAnalyticsEvent(request, env, clientId, cors);
  }

  if (request.method === "POST" && url.pathname === "/feedback") {
    return receiveFeedback(request, env, clientId, cors);
  }

  if (request.method !== "POST" || url.pathname !== "/scan") {
    return json(
      { error: "Not found", code: "route_not_found" },
      404,
      cors
    );
  }

  return scan(request, env, clientId, cors);
}

async function receiveAnalyticsEvent(request, env, clientId, cors) {
  if (bodyTooLarge(request, MAX_EVENT_BODY_BYTES)) {
    return json(
      { error: "Event is too large", code: "event_too_large" },
      413,
      cors
    );
  }
  if (
    !(await consumeRateLimit(
      env.EVENTS_RATE_LIMITER,
      `${clientId || "anonymous"}:events`
    ))
  ) {
    return json(
      { error: "Too many events", code: "event_rate_limited" },
      429,
      { ...cors, "Retry-After": "60" }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body", code: "invalid_json" }, 400, cors);
  }

  const name = typeof body?.name === "string" ? body.name : "";
  if (!ANALYTICS_EVENTS.has(name)) {
    return json(
      { error: "Unknown analytics event", code: "invalid_event" },
      400,
      cors
    );
  }

  const properties = sanitizeEventProperties(body?.properties);
  const platform = ["ios", "android"].includes(body?.platform)
    ? body.platform
    : "unknown";
  const appVersion =
    typeof body?.appVersion === "string" && /^\d+\.\d+\.\d+$/.test(body.appVersion)
      ? body.appVersion
      : "unknown";
  const clientHash = await hashClientId(clientId || "anonymous");

  writeAnalytics(env, name, clientHash, {
    ...properties,
    platform,
    appVersion,
  });
  return json({ ok: true }, 202, cors);
}

async function receiveFeedback(request, env, clientId, cors) {
  if (bodyTooLarge(request, MAX_FEEDBACK_BODY_BYTES)) {
    return json(
      { error: "Feedback is too large", code: "feedback_too_large" },
      413,
      cors
    );
  }
  if (
    !(await consumeRateLimit(
      env.EVENTS_RATE_LIMITER,
      `${clientId || "anonymous"}:feedback`
    ))
  ) {
    return json(
      { error: "Too many requests", code: "feedback_rate_limited" },
      429,
      { ...cors, "Retry-After": "60" }
    );
  }

  let fb;
  try {
    fb = await request.json();
  } catch {
    return json({ error: "Invalid JSON body", code: "invalid_json" }, 400, cors);
  }
  const message = (fb?.message || "").toString().trim().slice(0, 2000);
  if (!message) {
    return json(
      { error: "message required", code: "feedback_message_required" },
      400,
      cors
    );
  }
  if (!env.FEEDBACK) {
    return json(
      { error: "Feedback storage not configured", code: "feedback_unavailable" },
      503,
      cors
    );
  }

  const entry = {
    message,
    meta: (fb?.meta || "").toString().slice(0, 500),
    date: new Date().toISOString(),
  };
  await env.FEEDBACK.put(`fb:${Date.now()}`, JSON.stringify(entry), {
    expirationTtl: FEEDBACK_TTL_SECONDS,
  });
  return json({ ok: true }, 200, cors);
}

async function scan(request, env, clientId, cors) {
  const startedAt = Date.now();
  if (bodyTooLarge(request, MAX_IMAGE_BASE64_CHARS * 2 + 100_000)) {
    return json(
      { error: "Image is too large", code: "image_too_large" },
      413,
      cors
    );
  }
  if (
    !(await consumeRateLimit(
      env.SCAN_BURST_LIMITER,
      `${clientId || "anonymous"}:scan`
    ))
  ) {
    writeAnalytics(env, "scan_api_rate_limited", "rate-limited", {
      errorCode: "burst_limit",
    });
    return json(
      { error: "Too many scans. Wait a minute and try again.", code: "burst_limit" },
      429,
      { ...cors, "Retry-After": "60" }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body", code: "invalid_json" }, 400, cors);
  }
  const {
    imageBase64,
    mediaType,
    retryImageBase64,
    retryMediaType,
    targetLanguage,
    targetCurrency,
  } = body || {};
  if (!imageBase64) {
    return json(
      { error: "imageBase64 required", code: "image_required" },
      400,
      cors
    );
  }
  if (
    typeof imageBase64 !== "string" ||
    imageBase64.length > MAX_IMAGE_BASE64_CHARS ||
    (retryImageBase64 &&
      (typeof retryImageBase64 !== "string" ||
        retryImageBase64.length > MAX_IMAGE_BASE64_CHARS))
  ) {
    return json(
      { error: "Image is too large", code: "image_too_large" },
      413,
      cors
    );
  }
  if (!/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(mediaType || "image/jpeg")) {
    return json(
      { error: "Unsupported image type", code: "unsupported_image" },
      415,
      cors
    );
  }
  if (
    retryImageBase64 &&
    !/^image\/(jpeg|jpg|png|webp)$/i.test(retryMediaType || "image/jpeg")
  ) {
    return json(
      { error: "Unsupported retry image type", code: "unsupported_image" },
      415,
      cors
    );
  }

  const clientHash = await hashClientId(clientId || "anonymous");
  const limitStore = env.SCAN_LIMITS || env.FEEDBACK;
  if (clientId && limitStore) {
    const limit = Math.max(1, parseInt(env.DAILY_SCAN_LIMIT || "20", 10));
    const day = new Date().toISOString().slice(0, 10);
    const key = `scan:${day}:${clientHash}`;
    const used = parseInt((await limitStore.get(key)) || "0", 10);
    if (used >= limit) {
      writeAnalytics(env, "scan_api_rate_limited", clientHash, {
        errorCode: "daily_limit",
      });
      return json(
        { error: "Daily scan limit reached", code: "daily_limit" },
        429,
        { ...cors, "Retry-After": "86400" }
      );
    }
    await limitStore.put(key, String(used + 1), {
      expirationTtl: 60 * 60 * 48,
    });
  }

  const lang =
    typeof targetLanguage === "string" && targetLanguage.trim()
      ? targetLanguage.trim().slice(0, 40)
      : "English";
  const currency =
    typeof targetCurrency === "string" &&
    SUPPORTED_CURRENCIES.has(targetCurrency.toUpperCase())
      ? targetCurrency.toUpperCase()
      : "GBP";

  let parsed;
  try {
    parsed = await parseMenu(
      env,
      imageBase64,
      mediaType || "image/jpeg",
      lang,
      currency
    );
  } catch (firstError) {
    try {
      parsed = await parseMenu(
        env,
        retryImageBase64 || imageBase64,
        retryImageBase64
          ? retryMediaType || "image/jpeg"
          : mediaType || "image/jpeg",
        lang,
        currency,
        retryImageBase64
          ? "This is a focused crop of the main menu page. Ignore any remaining border and extract every visible dish."
          : "Retry carefully. Read the menu and return complete valid JSON only."
      );
      console.info(
        JSON.stringify({ type: "scan_retry_succeeded", durationMs: Date.now() - startedAt })
      );
    } catch (retryError) {
      parsed = null;
      console.error(
        JSON.stringify({
          type: "scan_retry_failed",
          firstError: errorCode(firstError),
          retryError: errorCode(retryError),
          durationMs: Date.now() - startedAt,
        })
      );
    }
  }

  if (!parsed) {
    const durationMs = Date.now() - startedAt;
    console.error(
      JSON.stringify({
        type: "scan_error",
        code: "menu_parsing_failed",
        durationMs,
      })
    );
    writeAnalytics(env, "scan_api_failed", clientHash, {
      durationMs,
      errorCode: "menu_parsing_failed",
    });
    return json(
      {
        error: "We couldn't read this menu. Keep one page in frame, remove dark borders, and try again.",
        code: "menu_parsing_failed",
      },
      502,
      cors
    );
  }

  const dishes = (parsed.dishes || []).slice(0, MAX_DISHES);
  const cap = parseInt(env.IMAGE_LOOKUP_CAP || "45", 10);
  const batchSize = parseInt(env.IMAGE_BATCH_SIZE || "10", 10);
  const toLookup = dishes.slice(0, cap);

  for (let i = 0; i < toLookup.length; i += batchSize) {
    const batch = toLookup.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (dish) => {
        dish.image_url = await resolveImage(env, dish);
      })
    );
  }
  for (const dish of dishes) {
    if (dish.image_url === undefined) dish.image_url = null;
  }
  parsed.dishes = dishes;
  parsed.display_currency = currency;

  writeAnalytics(env, "scan_api_completed", clientHash, {
    durationMs: Date.now() - startedAt,
    dishCount: dishes.length,
  });
  return json(parsed, 200, cors);
}

async function parseMenu(
  env,
  imageBase64,
  mediaType,
  lang = "English",
  targetCurrency = "GBP",
  instruction = "Read this menu and return the JSON."
) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.MODEL || DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt(lang, targetCurrency),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageBase64 },
            },
            { type: "text", text: instruction },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Claude API ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  // Strip accidental code fences, then parse.
  const clean = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    // Last resort: grab the outermost JSON object.
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Model returned unparseable output");
  }
}

function errorCode(error) {
  const message = error instanceof Error ? error.message : String(error || "unknown");
  const status = message.match(/Claude API (\d{3})/)?.[1];
  if (status) return `anthropic_${status}`;
  if (/parse|json/i.test(message)) return "invalid_model_json";
  return "upstream_failure";
}

// Cache key: normalised dish identity, shared across all users forever.
function cacheKey(dish) {
  return `img:${dish.original_name}`.toLowerCase().replace(/\s+/g, "");
}

async function resolveImage(env, dish) {
  // KV cache hit → free
  if (env.DISH_IMAGES) {
    const cached = await env.DISH_IMAGES.get(cacheKey(dish));
    if (cached) return cached === "none" ? null : cached;
  }

  let link = null;
  if (env.BRAVE_API_KEY) {
    link = await braveImage(env, dish);
  } else if (env.GOOGLE_CSE_KEY && env.GOOGLE_CSE_CX) {
    link = await googleImage(env, dish);
  } else {
    // No image search configured → graceful null (app shows glyph placeholder)
    return null;
  }

  if (env.DISH_IMAGES) {
    // Cache misses too, so we never pay twice for the same dish.
    await env.DISH_IMAGES.put(cacheKey(dish), link || "none", {
      expirationTtl: link ? 60 * 60 * 24 * 90 : 60 * 60 * 24 * 7,
    });
  }
  return link;
}

// Domains that produce watermarked stock, ad creatives, or recipe title-cards.
const IMAGE_DOMAIN_BLOCKLIST = [
  "pinterest.",
  "alamy.com",
  "shutterstock.com",
  "gettyimages.",
  "istockphoto.com",
  "dreamstime.com",
  "depositphotos.com",
  "123rf.com",
  "stock.adobe.com",
  "vectorstock.com",
  "etsy.com",
  "amazon.",
  "ebay.",
];

function isBlockedSource(result) {
  const src = (
    result?.url ||
    result?.meta_url?.hostname ||
    result?.source ||
    ""
  ).toLowerCase();
  return IMAGE_DOMAIN_BLOCKLIST.some((d) => src.includes(d));
}

async function braveImage(env, dish, attempt = 0) {
  try {
    const q = encodeURIComponent(`${dish.image_query} dish food`);
    const res = await fetch(
      `https://api.search.brave.com/res/v1/images/search?q=${q}&count=3&safesearch=strict`,
      {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": env.BRAVE_API_KEY,
        },
      }
    );
    if (res.status === 429 && attempt < 1) {
      // Rate limited — wait a beat and retry once.
      await new Promise((r) => setTimeout(r, 1100));
      return braveImage(env, dish, attempt + 1);
    }
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.results || [];
    // First non-blocklisted candidate; fall back to the first result at all.
    const pick = results.find((r) => !isBlockedSource(r)) || results[0];
    return pick?.properties?.url || pick?.thumbnail?.src || null;
  } catch {
    return null;
  }
}

async function googleImage(env, dish) {
  try {
    const q = encodeURIComponent(`${dish.image_query} dish food`);
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_CSE_KEY}&cx=${env.GOOGLE_CSE_CX}&searchType=image&num=1&imgSize=large&safe=active&q=${q}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.items?.[0]?.link || null;
  } catch {
    return null;
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, x-tavue-client, x-carte-client",
  };
}

function bodyTooLarge(request, maxBytes) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

function readClientId(request) {
  const value = (
    request.headers.get("x-tavue-client") ||
    request.headers.get("x-carte-client") ||
    ""
  ).trim();
  return /^[A-Za-z0-9_-]{12,96}$/.test(value) ? value : "";
}

async function consumeRateLimit(binding, key) {
  if (!binding) return true;
  try {
    const result = await binding.limit({ key });
    return result.success;
  } catch {
    // The daily KV allowance still protects scan costs if a binding is
    // temporarily unavailable.
    return true;
  }
}

function sanitizeEventProperties(properties) {
  const input =
    properties && typeof properties === "object" ? properties : {};
  const source = ANALYTICS_SOURCES.has(input.source) ? input.source : "";
  const durationMs = Number.isFinite(input.durationMs)
    ? Math.min(300_000, Math.max(0, Math.round(input.durationMs)))
    : 0;
  const dishCount = Number.isFinite(input.dishCount)
    ? Math.min(MAX_DISHES, Math.max(0, Math.round(input.dishCount)))
    : 0;
  const errorCode =
    typeof input.errorCode === "string" &&
    /^[a-z0-9_:-]{1,64}$/i.test(input.errorCode)
      ? input.errorCode
      : "";
  return { source, durationMs, dishCount, errorCode };
}

async function hashClientId(clientId) {
  const bytes = new TextEncoder().encode(clientId);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function writeAnalytics(env, name, clientHash, details = {}) {
  if (!env.ANALYTICS) return;
  const safe = sanitizeEventProperties(details);
  const platform = ["ios", "android"].includes(details.platform)
    ? details.platform
    : "server";
  const appVersion =
    typeof details.appVersion === "string" ? details.appVersion.slice(0, 20) : "";

  env.ANALYTICS.writeDataPoint({
    blobs: [name, platform, appVersion, safe.source, safe.errorCode],
    doubles: [1, safe.durationMs, safe.dishCount],
    indexes: [clientHash.slice(0, 64)],
  });
}

function html(markup, status = 200) {
  return new Response(markup, {
    status,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pageTemplate(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Tavue</title>
  <style>
    :root{color-scheme:light;--ink:#312523;--muted:#756763;--paper:#fffaf3;--line:#eadfd7;--accent:#b9513e}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{width:min(760px,calc(100% - 40px));margin:0 auto;padding:64px 0 88px}
    header{border-bottom:1px solid var(--line);padding-bottom:28px;margin-bottom:34px}
    .brand{font-family:Georgia,serif;font-size:22px;letter-spacing:.08em;color:var(--accent)}
    h1{font-family:Georgia,serif;font-size:clamp(36px,7vw,56px);line-height:1.05;margin:16px 0 8px}
    h2{font-family:Georgia,serif;font-size:26px;margin:38px 0 8px}
    p,li{color:var(--muted)}a{color:var(--accent)}.meta{font-size:14px}
  </style>
</head>
<body><main><header><div class="brand">TAVUE</div><h1>${escapeHtml(
    title
  )}</h1></header>${body}</main></body></html>`;
}

function privacyPage(env) {
  const contact = env.SUPPORT_EMAIL
    ? `<a href="mailto:${escapeHtml(env.SUPPORT_EMAIL)}">${escapeHtml(
        env.SUPPORT_EMAIL
      )}</a>`
    : `the in-app “Found a bug? Tell us” form`;

  return pageTemplate(
    "Privacy Policy",
    `
<p class="meta">Effective 10 August 2026 · Tavue beta</p>
<p>Tavue helps people understand restaurant menus. This policy explains the limited data used to provide and improve the beta.</p>

<h2>Menu scans</h2>
<p>When you choose to scan, the menu photo is sent securely to Tavue’s Cloudflare-hosted service and then to Anthropic’s commercial API for menu recognition and translation. Tavue does not save the menu photo in its own storage. Anthropic normally deletes API inputs and outputs within 30 days, subject to limited safety, legal, and contractual exceptions.</p>
<p>The resulting menu is returned to your device. Recent-menu history is stored locally on your device. To find representative dish images, Tavue may send short food-name search queries—not the menu photo or your identifier—to Brave Search or Google Programmable Search.</p>

<h2>Order History and dish-photo drafts</h2>
<p>When you open Show server, Tavue can save the selected dishes in Order History on your device. You may later choose a real photo for an ordered dish. In the 0.9 beta, that contribution photo is compressed and saved only on your device. It is not uploaded to Tavue, reviewed, displayed publicly, or used to grant scan credits yet. The app labels this state clearly. You can delete an Order History entry at any time; Tavue then removes both the entry and its associated dish-photo drafts from that device.</p>

<h2>Security and beta analytics</h2>
<p>Tavue creates a random installation identifier for abuse prevention, daily scan limits, and first-party beta analytics. Analytics contain only approved event names such as scan started/completed, duration, dish count, detail opened, order added, order history opened, and a local dish photo saved. They do not contain menu photos, contribution photos, menu text, dish names, prices, free-form content, advertising identifiers, or precise location. The identifier is irreversibly hashed before analytics storage. Cloudflare Analytics Engine retains these beta events for three months.</p>

<h2>Diagnostics and feedback</h2>
<p>If crash monitoring is enabled, Sentry may receive crash and diagnostic information such as app version, platform, stack trace, and an error category. Tavue disables default personal information, screenshots, view hierarchy, and request-body collection. Optional feedback contains the message you type plus platform and app version, and is automatically deleted after 180 days.</p>

<h2>Sharing, advertising, and tracking</h2>
<p>Tavue does not sell personal data, serve targeted advertising, or track users across other companies’ apps and websites. Service providers process data only to operate Tavue: Cloudflare for hosting and analytics, Anthropic for AI processing, Sentry for diagnostics when configured, and Brave or Google for dish-image search.</p>

<h2>Your choices and rights</h2>
<p>You can decline AI processing and continue using any menus already saved on your device. Removing Tavue deletes its local history and random identifier. UK and EEA users may request access, correction, deletion, restriction, or objection where applicable.</p>

<h2>Contact</h2>
<p>For privacy or support requests, contact Tavue through ${contact}.</p>
`
  );
}

function supportPage(env) {
  const email = env.SUPPORT_EMAIL
    ? `<p>Email: <a href="mailto:${escapeHtml(env.SUPPORT_EMAIL)}">${escapeHtml(
        env.SUPPORT_EMAIL
      )}</a></p>`
    : "";
  return pageTemplate(
    "Support",
    `
<p>If Tavue cannot read a menu, try one page at a time, photographed straight-on in good light. Keep the full menu page inside the frame.</p>
<h2>Report a problem</h2>
<p>Open Tavue and tap “Found a bug? Tell us” near the bottom of the home screen. Include what kind of menu you scanned and what went wrong. Do not include sensitive personal information.</p>
${email}
<h2>Privacy</h2>
<p>Read the <a href="/privacy">Tavue Privacy Policy</a>.</p>
`
  );
}

function json(obj, status, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
