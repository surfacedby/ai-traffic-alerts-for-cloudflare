# ai-traffic-alerts-for-cloudflare

Get a push notification the moment an AI assistant touches your site:

- An **AI crawler** fetches a page (and whether it came to train on it, index it, or answer a user live).
- A **human arrives from an AI answer** (ChatGPT, Perplexity, Gemini, Claude, Copilot, and more).

It runs as a single Cloudflare Worker in front of your site, inspects each request at the edge, fires a notification to your phone, and passes the request straight through to your origin. No tracking script, no database, no change to your pages.

## Why this exists

Most "AI bot" tools are about *blocking*. But the AI crawl is not the threat, it is the tell: it is the clearest early signal of who is reading you and why. The interesting question is not "how do I keep AI bots out," it is **"which AI engines actually touch me, and which ones send me people."** This tool makes that visible in real time, for free.

## What it can and cannot tell you

| ai-traffic-alerts-for-cloudflare (free) tells you | It cannot tell you |
|---|---|
| An AI crawler hit your site, which vendor, and its purpose (train / index / retrieve) | Whether the AI actually **cited** you in an answer |
| A human landed on your site from an AI assistant | **Which prompts** you show up for, and which you are missing |
| Which page they hit, and the visitor's country | Whether the AI recommended a **competitor** instead of you |
| Real-time, at your edge | Whether that visibility turned into **signups or revenue** |

The right-hand column is the actual job of AI visibility, and it needs measurement across the assistants, not just your own logs. That is what [SurfacedBy](https://surfacedby.com) does: it shows which AI engines cite you, on which prompts, the exact sources they pull, who gets cited instead of you, and whether it converts. This tool is the free first look; SurfacedBy is the full picture. Run a free audit of your domain at [surfacedby.com](https://surfacedby.com).

## Quick start

You need a Cloudflare account with your site on Cloudflare, plus Node and `npx`.

```bash
git clone https://github.com/<your-account>/ai-traffic-alerts-for-cloudflare
cd ai-traffic-alerts-for-cloudflare
npm install
```

1. **Pick a notification channel.** The zero-setup option is [ntfy](https://ntfy.sh): install the app, subscribe to a long secret topic name, then set it in `wrangler.toml`:

   ```toml
   [vars]
   NTFY_TOPIC = "your-long-secret-topic"
   ```

   Prefer Telegram, Discord, or Pushover? See "Notification channels" below.

2. **Point the Worker at your site** in `wrangler.toml`:

   ```toml
   routes = [ { pattern = "example.com/*", zone_name = "example.com" } ]
   ```

3. **(Recommended) add a KV namespace** so a crawl does not spam your phone:

   ```bash
   npx wrangler kv namespace create RADAR_KV
   ```

   Paste the returned id into the `[[kv_namespaces]]` block in `wrangler.toml`.

4. **Deploy:**

   ```bash
   npx wrangler deploy
   ```

That is it. The next time an AI crawler or an AI-referred visitor hits your site, your phone buzzes.

## Notification channels

Set any one (or several). The Worker sends to every channel you configure.

- **ntfy** (no account): `NTFY_TOPIC` in `wrangler.toml` (and optional `NTFY_SERVER`).
- **Telegram**: `npx wrangler secret put TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
- **Discord**: `npx wrangler secret put DISCORD_WEBHOOK_URL`.
- **Pushover**: `npx wrangler secret put PUSHOVER_TOKEN` and `PUSHOVER_USER`.
- **Anything else**: `npx wrangler secret put GENERIC_WEBHOOK_URL` to POST the raw JSON event to your own endpoint (Slack, a database, Zapier, your CRM).

A failing channel is swallowed so it can never break the request being served.

## Tuning the noise

Crawlers can hit you a lot. By default you get **one alert per vendor per purpose per hour**; human AI-referrals are **never** throttled because a real person the AI sent you is the signal you always want. Change the window with `CRAWLER_THROTTLE_SECONDS` in `wrangler.toml` (set `"0"` to alert on every single crawl). Throttling uses the optional KV namespace; without it the Worker still runs and simply does not dedupe.

## How detection works

- **Crawlers** are matched by user-agent token (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, and the rest), each tagged with its vendor and purpose, in [`src/ai-signatures.js`](src/ai-signatures.js).
- **Referrals** are matched by the referer hostname (chatgpt.com, perplexity.ai, gemini.google.com, claude.ai, and more).

These signatures drift as vendors add and rename bots. The canonical, community-maintained crawler list is [ai-robots-txt/ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt); re-pull it periodically and reconcile `src/ai-signatures.js` rather than guessing a token.

## Privacy

The Worker stores nothing about your visitors. It reads the user-agent and referer of each request, sends you a notification, and forwards the request to your origin. The optional KV holds only short-lived throttle keys like `radar:OpenAI:training`, never visitor data.

## License

MIT. Use it, fork it, ship it.
