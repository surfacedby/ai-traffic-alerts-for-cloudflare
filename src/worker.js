// ai-traffic-alerts-for-cloudflare
//
// A single-file Cloudflare Worker that pings your phone the moment an AI
// assistant sends you a real visitor:
//   - a HUMAN arrives from an AI answer (ChatGPT, Perplexity, Gemini, Claude,
//     Copilot, Grok...) - the rare, high-value signal, and
//   - an AI CRAWLER fetches a page (train / index / answer live) - the far
//     higher-volume signal, which you can turn off.
//
// It inspects each request at the edge, fires a best-effort notification OFF the
// response path, and always passes the request straight through to your origin
// unchanged. No tracking script, no database, no change to your pages.
//
// Choose what alerts with the ALERT_ON environment variable:
//   - referrals (recommended): only humans an AI sent you. Crawler detection is
//     skipped entirely, so you need no KV namespace.
//   - crawlers: only AI crawler hits.
//   - both (default): both signals. A busy site's crawlers can be thousands of
//     hits a day, so most people want ALERT_ON=referrals.
//
// Deploy it two ways (see README):
//   - Cloudflare dashboard (no terminal): paste this whole file into the Worker
//     editor. Everything lives in this one file on purpose so that path is a
//     single copy-paste.
//   - Terminal: `npx wrangler deploy`.
//
// The only thing you edit to keep detection fresh is the two signature lists
// below.

// ===========================================================================
// Signatures. AI vendors add and rename bots often; keep these current. The
// canonical, community-maintained crawler list is:
//   https://github.com/ai-robots-txt/ai.robots.txt
// Matching is CASE-INSENSITIVE, so "Meta-ExternalAgent" and "meta-externalagent"
// both match one entry.
// ===========================================================================

// AI crawler user-agent tokens -> vendor + purpose.
//   training  = building model training corpora
//   retrieval = a live, user-triggered fetch to answer a prompt right now
//   search    = building an AI search index
//
// Only bots that send a REAL request user-agent are listed. Robots.txt control
// tokens that never crawl under their own user-agent are deliberately omitted
// because matching them would never fire: Google-Extended (Google's own docs:
// "doesn't have a separate HTTP request user agent string") and
// Applebot-Extended (a training opt-out token applied to the normal Applebot
// crawl). You cannot see Gemini/Apple *training* opt-in via a user-agent; that
// is a real limit of edge detection, not a gap in this list.
const AI_CRAWLERS = [
  // OpenAI
  { token: "GPTBot", vendor: "OpenAI", purpose: "training" },
  { token: "OAI-SearchBot", vendor: "OpenAI", purpose: "search" },
  { token: "ChatGPT-User", vendor: "OpenAI", purpose: "retrieval" },
  // Anthropic
  { token: "ClaudeBot", vendor: "Anthropic", purpose: "training" },
  { token: "anthropic-ai", vendor: "Anthropic", purpose: "training" },
  { token: "Claude-User", vendor: "Anthropic", purpose: "retrieval" },
  { token: "Claude-SearchBot", vendor: "Anthropic", purpose: "search" },
  // Perplexity
  { token: "PerplexityBot", vendor: "Perplexity", purpose: "search" },
  { token: "Perplexity-User", vendor: "Perplexity", purpose: "retrieval" },
  // Google (Vertex AI crawler that does send a UA; Google-Extended does not)
  { token: "Google-CloudVertexBot", vendor: "Google", purpose: "training" },
  // Apple (Applebot feeds Siri / Apple Intelligence surfaces)
  { token: "Applebot", vendor: "Apple", purpose: "search" },
  // Meta
  { token: "meta-externalagent", vendor: "Meta", purpose: "training" },
  { token: "meta-externalfetcher", vendor: "Meta", purpose: "retrieval" },
  { token: "meta-webindexer", vendor: "Meta", purpose: "search" },
  { token: "FacebookBot", vendor: "Meta", purpose: "training" },
  // Manus (agentic browsing)
  { token: "Manus-User", vendor: "Manus", purpose: "retrieval" },
  // Amazon
  { token: "Amazonbot", vendor: "Amazon", purpose: "retrieval" },
  // ByteDance
  { token: "Bytespider", vendor: "ByteDance", purpose: "training" },
  { token: "TikTokSpider", vendor: "ByteDance", purpose: "training" },
  // DeepSeek
  { token: "DeepSeekBot", vendor: "DeepSeek", purpose: "training" },
  // Moonshot (Kimi)
  { token: "Kimi-User", vendor: "Moonshot", purpose: "retrieval" },
  // Mistral
  { token: "MistralAI-User", vendor: "Mistral", purpose: "retrieval" },
  // Cohere
  { token: "cohere-ai", vendor: "Cohere", purpose: "retrieval" },
  { token: "cohere-training-data-crawler", vendor: "Cohere", purpose: "training" },
  // DuckDuckGo (the AI assistant bot, not the search crawler)
  { token: "DuckAssistBot", vendor: "DuckDuckGo", purpose: "retrieval" },
  // Huawei
  { token: "PetalBot", vendor: "Huawei", purpose: "search" },
  // Common Crawl (its corpus feeds many models)
  { token: "CCBot", vendor: "Common Crawl", purpose: "training" },
  // Allen Institute
  { token: "AI2Bot", vendor: "Allen Institute", purpose: "training" },
  // You.com
  { token: "YouBot", vendor: "You.com", purpose: "search" },
  // Diffbot / Timpi
  { token: "Diffbot", vendor: "Diffbot", purpose: "training" },
  { token: "Timpibot", vendor: "Timpi", purpose: "search" },
];

// Referrer hosts (and utm_source values) that mean a HUMAN arrived from an AI
// assistant's answer. This is the high-value signal: a real person the AI sent
// you. Kept HIGH-CONFIDENCE on purpose: general search engines (bing.com,
// duckduckgo.com) and social sites (x.com) are NOT here, because a click from
// those is almost never the AI product itself and would cry wolf on ordinary
// traffic. Google AI Overviews / AI Mode referrals arrive as plain google.com
// and are indistinguishable from a normal Google click, so they are not listed
// either.
const AI_REFERRERS = [
  { host: "chatgpt.com", vendor: "ChatGPT" },
  { host: "chat.openai.com", vendor: "ChatGPT" },
  { host: "perplexity.ai", vendor: "Perplexity" },
  { host: "gemini.google.com", vendor: "Gemini" },
  { host: "claude.ai", vendor: "Claude" },
  { host: "copilot.microsoft.com", vendor: "Microsoft Copilot" },
  { host: "poe.com", vendor: "Poe" },
  { host: "grok.com", vendor: "Grok" },
  { host: "meta.ai", vendor: "Meta AI" },
  { host: "you.com", vendor: "You.com" },
];

// Pre-lowercased crawler tokens so matching is case-insensitive without redoing
// the work on every request.
const AI_CRAWLERS_LC = AI_CRAWLERS.map((b) => ({ ...b, lc: b.token.toLowerCase() }));

// ===========================================================================
// Detection
// ===========================================================================

function hostFromReferer(referer) {
  if (!referer) return "";
  try {
    return new URL(referer).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function hostMatches(host, target) {
  return !!host && (host === target || host.endsWith("." + target));
}

// utm_source can be the full host ("chatgpt.com") or a short token ("chatgpt").
function utmMatches(utm, target) {
  if (!utm) return false;
  return utm === target || utm.endsWith("." + target) || target.startsWith(utm + ".");
}

// Classify a request from its user-agent, referer, and landing URL.
// `mode` (referrals | crawlers | both) gates which signals are even looked for,
// so a referrals-only user pays no crawler-matching or KV cost.
// Returns { kind: "crawler" | "referral" | null, ... }.
export function classify(userAgent, referer, url, mode = "both") {
  if (mode !== "referrals") {
    const ua = (userAgent || "").toLowerCase();
    for (const bot of AI_CRAWLERS_LC) {
      if (ua.includes(bot.lc)) {
        return { kind: "crawler", vendor: bot.vendor, purpose: bot.purpose, token: bot.token };
      }
    }
  }

  if (mode === "crawlers") return { kind: null };

  // A human from an AI answer. The referer host is the primary signal, but AI
  // apps often strip the referer entirely, so also check utm_source on the
  // landing URL: ChatGPT (and others) stamp utm_source=chatgpt.com precisely
  // when they drop the referer. Without this, most AI referrals go unseen.
  const host = hostFromReferer(referer);
  let utm = "";
  try {
    utm = (new URL(url).searchParams.get("utm_source") || "").toLowerCase().trim();
  } catch {
    utm = "";
  }
  for (const ref of AI_REFERRERS) {
    const byReferer = hostMatches(host, ref.host);
    const byUtm = utmMatches(utm, ref.host);
    if (byReferer || byUtm) {
      return {
        kind: "referral",
        vendor: ref.vendor,
        host: host || ref.host,
        via: byReferer ? "referrer" : "utm_source",
      };
    }
  }
  return { kind: null };
}

// ===========================================================================
// Throttle (optional KV). One crawler alert per (vendor + purpose) per window
// so a crawl does not spam your phone. Human referrals are never throttled: a
// real person the AI sent you is the signal you always want. In
// ALERT_ON=referrals mode no crawler is ever detected, so this and RADAR_KV are
// never touched.
// ===========================================================================

const DEFAULT_CRAWLER_THROTTLE_SECONDS = 3600;

async function shouldSendCrawler(env, key) {
  const configured = parseInt(env.CRAWLER_THROTTLE_SECONDS ?? "", 10);
  const ttl = Number.isFinite(configured) ? configured : DEFAULT_CRAWLER_THROTTLE_SECONDS;
  if (ttl <= 0) return true; // 0 disables throttling: alert on every crawl
  if (!env.RADAR_KV) return true; // no KV bound: send rather than silently drop
  const seen = await env.RADAR_KV.get(key);
  if (seen) return false;
  await env.RADAR_KV.put(key, "1", { expirationTtl: Math.max(ttl, 60) }); // KV min TTL is 60s
  return true;
}

// ===========================================================================
// Message
// ===========================================================================

const PURPOSE_PHRASE = {
  training: "to train on it",
  retrieval: "to answer a user live",
  search: "to index it",
};

function buildMessage(site, info, url, country) {
  const where = `${site}${new URL(url).pathname}`;
  if (info.kind === "crawler") {
    const purpose = PURPOSE_PHRASE[info.purpose] || info.purpose;
    const text = `[ai-traffic-alerts] ${info.vendor} (${info.token}) crawled ${where} ${purpose}.`;
    return {
      title: `AI crawler: ${info.vendor}`,
      text,
      // `text` is included so GENERIC_WEBHOOK_URL works with Slack Incoming
      // Webhooks (which render the top-level `text` field) out of the box, while
      // the structured fields stay available for automation.
      payload: { text, type: "crawler", vendor: info.vendor, purpose: info.purpose, bot: info.token, url, site, country },
    };
  }
  const text = `[ai-traffic-alerts] A person arrived from ${info.vendor} and landed on ${where}.${country ? " Country: " + country + "." : ""}`;
  return {
    title: `AI sent you a visitor: ${info.vendor}`,
    text,
    payload: { text, type: "referral", vendor: info.vendor, referrer_host: info.host, detected_via: info.via, url, site, country },
  };
}

// ===========================================================================
// Notification channels. Each sender is best-effort AND checks the HTTP status,
// so a misconfigured token (e.g. a 401 from Telegram) surfaces in the Worker
// log instead of silently looking like success. Set one or more via variables
// and secrets (see README).
// ===========================================================================

// Every channel call is bounded so a hung endpoint can never consume the whole
// ctx.waitUntil budget or delay the other channels.
const CHANNEL_TIMEOUT_MS = 10000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHANNEL_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function postJSON(url, body, headers = {}) {
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  return res;
}

async function sendNtfy(env, title, text) {
  if (!env.NTFY_TOPIC) return;
  const base = (env.NTFY_SERVER || "https://ntfy.sh").replace(/\/+$/, "");
  const res = await fetchWithTimeout(`${base}/${env.NTFY_TOPIC}`, {
    method: "POST",
    headers: { Title: title, Tags: "robot" },
    body: text,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
}

// WhatsApp via CallMeBot (https://www.callmebot.com), a free personal-use relay
// that texts your OWN number. Ideal for "ping my phone"; it can only message
// you, never other people. For business-scale WhatsApp, point
// GENERIC_WEBHOOK_URL at Meta's WhatsApp Cloud API instead (that path needs a
// pre-approved message template because alerts are business-initiated).
async function sendWhatsApp(env, text) {
  if (!env.WHATSAPP_PHONE || !env.WHATSAPP_APIKEY) return;
  const url =
    "https://api.callmebot.com/whatsapp.php" +
    `?phone=${encodeURIComponent(env.WHATSAPP_PHONE)}` +
    `&text=${encodeURIComponent(text)}` +
    `&apikey=${encodeURIComponent(env.WHATSAPP_APIKEY)}`;
  const res = await fetchWithTimeout(url); // CallMeBot uses a GET request
  const body = await res.text().catch(() => "");
  // CallMeBot can return HTTP 200 with an error in the body (invalid key, phone
  // not activated), so confirm the success marker instead of trusting status.
  if (!res.ok || !/queued|will receive|sent/i.test(body)) {
    throw new Error(`HTTP ${res.status} ${body.slice(0, 200)}`);
  }
}

async function sendTelegram(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  await postJSON(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    chat_id: env.TELEGRAM_CHAT_ID,
    text,
    disable_web_page_preview: true,
  });
}

async function sendDiscord(env, text) {
  if (!env.DISCORD_WEBHOOK_URL) return;
  await postJSON(env.DISCORD_WEBHOOK_URL, { content: text });
}

async function sendPushover(env, title, text) {
  if (!env.PUSHOVER_TOKEN || !env.PUSHOVER_USER) return;
  await postJSON("https://api.pushover.net/1/messages.json", {
    token: env.PUSHOVER_TOKEN,
    user: env.PUSHOVER_USER,
    title,
    message: text,
  });
}

async function sendWebhook(env, payload) {
  if (!env.GENERIC_WEBHOOK_URL) return;
  await postJSON(env.GENERIC_WEBHOOK_URL, payload);
}

function anyChannelConfigured(env) {
  return !!(
    env.NTFY_TOPIC ||
    (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) ||
    (env.WHATSAPP_PHONE && env.WHATSAPP_APIKEY) ||
    env.DISCORD_WEBHOOK_URL ||
    (env.PUSHOVER_TOKEN && env.PUSHOVER_USER) ||
    env.GENERIC_WEBHOOK_URL
  );
}

async function sendAlert(env, { title, text, payload }) {
  if (!anyChannelConfigured(env)) {
    // The single most common "it does not work" cause. Say it out loud in the
    // log instead of failing silently.
    console.log(
      "ai-traffic-alerts: AI signal detected but NO notification channel is configured. " +
        "Set NTFY_TOPIC (easiest) or a Telegram / Discord / Pushover / webhook channel."
    );
    return;
  }
  const channels = [
    ["ntfy", () => sendNtfy(env, title, text)],
    ["telegram", () => sendTelegram(env, text)],
    ["whatsapp", () => sendWhatsApp(env, text)],
    ["discord", () => sendDiscord(env, text)],
    ["pushover", () => sendPushover(env, title, text)],
    ["webhook", () => sendWebhook(env, payload)],
  ];
  const results = await Promise.allSettled(channels.map(([, fn]) => fn()));
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.log(`ai-traffic-alerts: ${channels[i][0]} channel failed:`, r.reason?.message || r.reason);
    }
  });
}

// ===========================================================================
// Worker entrypoint. Detection is a cheap synchronous header check; all network
// work (KV throttle + notifications) runs in ctx.waitUntil so it NEVER adds
// latency to the request being served. The origin fetch is returned immediately.
// ===========================================================================

const ALERT_MODES = new Set(["referrals", "crawlers", "both"]);

// ALERT_ON picks which signals fire. Empty or unrecognized falls back to "both"
// (the original behavior).
function resolveAlertMode(env) {
  const mode = String(env.ALERT_ON ?? "").toLowerCase().trim();
  return ALERT_MODES.has(mode) ? mode : "both";
}

async function handleSignal(info, request, env) {
  if (info.kind === "crawler") {
    const ok = await shouldSendCrawler(env, `radar:${info.vendor}:${info.purpose}`);
    if (!ok) return;
  }
  const url = request.url;
  const site = new URL(url).hostname;
  const country = request.headers.get("cf-ipcountry") || "";
  await sendAlert(env, buildMessage(site, info, url, country));
}

export default {
  async fetch(request, env, ctx) {
    try {
      const info = classify(
        request.headers.get("user-agent"),
        request.headers.get("referer"),
        request.url,
        resolveAlertMode(env)
      );
      if (info.kind) {
        ctx.waitUntil(
          handleSignal(info, request, env).catch((err) =>
            console.log("ai-traffic-alerts: alert error:", err)
          )
        );
      }
    } catch (err) {
      // Detection must never break the site.
      console.log("ai-traffic-alerts: detection error:", err);
    }
    // Pass through to origin, unchanged and never delayed by the work above.
    return fetch(request);
  },
};
