// ai-traffic-alerts-for-cloudflare
// A Cloudflare Worker that pings your phone the moment an AI assistant touches
// your site: when an AI crawler fetches a page, and when a human arrives from an
// AI answer. It inspects each request, fires a best-effort notification, and
// always passes the request through to your origin unchanged.
//
// Deploy it on a route in front of your site (see wrangler.toml + README).

import { classify } from "./ai-signatures.js";
import { sendAlert } from "./notify.js";

// Throttle high-volume crawler notifications so a crawl does not spam your phone.
// One alert per (vendor + purpose) per window. Human AI-referrals are never
// throttled: a real person the AI sent you is the signal you always want.
// Requires a KV namespace bound as RADAR_KV; without it, crawler alerts fall
// back to a fixed sampling so the tool still works with zero setup.
const DEFAULT_CRAWLER_THROTTLE_SECONDS = 3600;

async function shouldSendCrawler(env, key) {
  const window = parseInt(env.CRAWLER_THROTTLE_SECONDS ?? "", 10);
  const ttl = Number.isFinite(window) ? window : DEFAULT_CRAWLER_THROTTLE_SECONDS;
  if (ttl <= 0) return true; // 0 disables throttling: alert on every crawl
  if (!env.RADAR_KV) return true; // no KV bound: do not silently drop, just send
  const seen = await env.RADAR_KV.get(key);
  if (seen) return false;
  // KV minimum TTL is 60s.
  await env.RADAR_KV.put(key, "1", { expirationTtl: Math.max(ttl, 60) });
  return true;
}

function buildMessage(site, info, url, country) {
  const where = `${site}${new URL(url).pathname}`;
  if (info.kind === "crawler") {
    const purpose = { training: "to TRAIN on it", retrieval: "to answer a user live", search: "to index it" }[info.purpose] || info.purpose;
    return {
      title: `AI crawler: ${info.vendor}`,
      text: `[ai-traffic-alerts-for-cloudflare] ${info.vendor} (${info.token}) crawled ${where} ${purpose}.`,
      payload: { type: "crawler", vendor: info.vendor, purpose: info.purpose, bot: info.token, url, site, country },
    };
  }
  return {
    title: `AI sent you a visitor: ${info.vendor}`,
    text: `[ai-traffic-alerts-for-cloudflare] A person arrived from ${info.vendor} and landed on ${where}.${country ? " Country: " + country + "." : ""}`,
    payload: { type: "referral", vendor: info.vendor, referrer_host: info.host, url, site, country },
  };
}

export default {
  async fetch(request, env, ctx) {
    // Inspect first; serving the request must never wait on notification work.
    try {
      const info = classify(request.headers.get("user-agent"), request.headers.get("referer"));
      if (info.kind) {
        const url = request.url;
        const site = new URL(url).hostname;
        const country = request.headers.get("cf-ipcountry") || "";
        const send =
          info.kind === "referral"
            ? true
            : await shouldSendCrawler(env, `radar:${info.vendor}:${info.purpose}`);
        if (send) {
          const msg = buildMessage(site, info, url, country);
          ctx.waitUntil(sendAlert(env, msg));
        }
      }
    } catch (err) {
      // Detection or notification must never break the site.
      console.log("ai-traffic-alerts-for-cloudflare error:", err);
    }
    // Pass through to origin unchanged.
    return fetch(request);
  },
};
