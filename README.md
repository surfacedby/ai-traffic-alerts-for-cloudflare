# ai-traffic-alerts-for-cloudflare

Get a push notification the moment an AI assistant touches your site:

- An **AI crawler** fetches a page (and whether it came to train on it, index it, or answer a user live).
- A **human arrives from an AI answer** (ChatGPT, Perplexity, Gemini, Claude, Copilot, and more).

It runs as a single Cloudflare Worker in front of your site, inspects each request at the edge, fires a notification to your phone, and passes the request straight through to your origin. No tracking script, no database, no change to your pages. Detection and notifications run off the response path, so your site is never slowed down.

## Why this exists

Most "AI bot" tools are about *blocking*. But the AI crawl is not the threat, it is the tell: it is the clearest early signal of who is reading you and why. The interesting question is not "how do I keep AI bots out," it is **"which AI engines actually touch me, and which ones send me people."** This tool makes that visible in real time, for free.

## What it can and cannot tell you

| This tool (free) tells you | It cannot tell you |
|---|---|
| An AI crawler hit your site, which vendor, and its purpose (train / index / answer live) | Whether the AI actually **cited** you in an answer |
| A human landed on your site from an AI assistant | **Which prompts** you show up for, and which you are missing |
| Which page they hit, and the visitor's country | Whether the AI recommended a **competitor** instead of you |
| Real-time, at your edge | Whether that visibility turned into **signups or revenue** |

The right-hand column is the actual job of AI visibility, and it needs measurement across the assistants, not just your own logs. That is what [SurfacedBy](https://surfacedby.com) does: it shows which AI engines cite you, on which prompts, the exact sources they pull, who gets cited instead of you, and whether it converts. This tool is the free first look; SurfacedBy is the full picture. Run a free audit of your domain at [surfacedby.com](https://surfacedby.com).

---

## Setup

You need a site that is **already on Cloudflare** (its traffic is proxied by Cloudflare, the orange cloud in your DNS). Then pick a path:

- **[Option A: Cloudflare dashboard](#option-a-cloudflare-dashboard-no-terminal)** - point and click, no terminal. Best if you are not a developer.
- **[Option B: Command line](#option-b-command-line-wrangler)** - `git` and `wrangler`. Best if you live in a terminal or want it in version control.

Either way, first do this one-minute step:

**Pick a notification channel.** The zero-account option is [ntfy](https://ntfy.sh): install the ntfy app on your phone, tap **Subscribe to topic**, and enter a long, hard-to-guess topic name (treat it like a password, for example `ai-alerts-9f3k2p-mysite`). That topic name is all you need below. Prefer Telegram, Discord, or Pushover? See [Notification channels](#notification-channels).

### Option A: Cloudflare dashboard (no terminal)

1. **Create the Worker.** In the [Cloudflare dashboard](https://dash.cloudflare.com), go to **Compute (Workers) -> Workers & Pages -> Create -> Start with Hello World -> Get started**. Give it a name like `ai-traffic-alerts` and create it.

2. **Paste the code.** Click **Edit code** (the `</>` button). Select all of the sample code and delete it, then paste the entire contents of [`src/worker.js`](https://raw.githubusercontent.com/surfacedby/ai-traffic-alerts-for-cloudflare/main/src/worker.js) from this repo (open that link, select all, copy). Click **Deploy**.

3. **Add your notification channel.** Open the Worker's **Settings -> Variables and Secrets -> Add**. Add a variable named `NTFY_TOPIC` with your secret topic from above. (For channels that use a token, such as Telegram, choose the **Secret / Encrypt** type instead of plaintext. See [Notification channels](#notification-channels) for the exact names.)

4. **Put it in front of your site.** In the Worker's **Settings -> Domains & Routes -> Add -> Route**. Set the route pattern to `yourdomain.com/*` and pick your zone. Choose **Route**, not *Custom domain*: a route runs the Worker on your existing site and passes traffic through to it, which is exactly what this tool does.

5. **(Recommended) stop crawlers from spamming you.** By default the tool sends one alert per vendor per purpose per hour, which needs a small KV store. Create it under **Storage & Databases -> KV -> Create a namespace**, name it `RADAR_KV`. Then back in the Worker, open **Settings -> Bindings -> Add binding -> KV namespace**, set the **Variable name** to exactly `RADAR_KV`, and select the namespace. Without this the Worker still runs; it just cannot dedupe, so busy crawlers alert more often (raise `CRAWLER_THROTTLE_SECONDS`, or set it to `0` while testing).

That is it. See [Test that it works](#test-that-it-works) to confirm.

### Option B: Command line (wrangler)

You need Node and `npx`.

```bash
git clone https://github.com/surfacedby/ai-traffic-alerts-for-cloudflare
cd ai-traffic-alerts-for-cloudflare
npm install
```

1. **Set your channel and route** in `wrangler.toml`:

   ```toml
   routes = [ { pattern = "yourdomain.com/*", zone_name = "yourdomain.com" } ]

   [vars]
   NTFY_TOPIC = "your-long-secret-topic"
   ```

2. **(Recommended) create the throttle KV** and paste the returned id into the `[[kv_namespaces]]` block in `wrangler.toml`:

   ```bash
   npx wrangler kv namespace create RADAR_KV
   ```

3. **Deploy:**

   ```bash
   npx wrangler deploy
   ```

Run `npm test` to exercise the detection logic, and `npx wrangler tail` to watch live logs.

---

## Notification channels

Set any one (or several). The Worker sends to every channel you configure. Each has a step-by-step guide below the table.

| Channel | What to set | Guide |
|---|---|---|
| **ntfy** | `NTFY_TOPIC` (and optional `NTFY_SERVER`) | [ntfy setup](#ntfy-setup-1-minute-no-account) - no account, easiest |
| **Telegram** | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | [Telegram setup](#telegram-setup-2-minutes) |
| **WhatsApp** | `WHATSAPP_PHONE`, `WHATSAPP_APIKEY` | [WhatsApp setup](#whatsapp-setup-2-minutes) - free personal alerts via CallMeBot |
| **Discord** | `DISCORD_WEBHOOK_URL` | [Discord setup](#discord-setup-1-minute) |
| **Pushover** | `PUSHOVER_TOKEN`, `PUSHOVER_USER` | [Pushover setup](#pushover-setup-2-minutes) |
| **Anything else** | `GENERIC_WEBHOOK_URL` | [Generic webhook](#generic-webhook-slack-zapier-your-own-api-1-minute) - Slack, Zapier, your API |

Every channel is fire-and-forget with a 10-second timeout and checks the response, so one slow or misconfigured channel can neither delay the others nor break the request being served. Failures are logged with the channel name and HTTP status so you can see exactly what went wrong.

Where to put the values: in the **dashboard**, open the Worker's **Settings -> Variables and Secrets -> Add** (use the **Secret / Encrypt** type for anything token-like). On the **command line**, plaintext values (like `NTFY_TOPIC`) can go in `wrangler.toml`, and secrets use `npx wrangler secret put NAME`.

### ntfy setup (1 minute, no account)

1. Install the **ntfy** app ([iOS](https://apps.apple.com/app/ntfy/id1625396347) / [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy)), or open [ntfy.sh](https://ntfy.sh) in a browser.
2. Tap **Subscribe to topic** and enter a long, hard-to-guess name (anyone who knows the topic can see your alerts, so treat it like a password, for example `ai-alerts-9f3k2p-mysite`).
3. Set `NTFY_TOPIC` to that exact name. Self-hosting ntfy? Also set `NTFY_SERVER` (defaults to `https://ntfy.sh`).

### Telegram setup (2 minutes)

1. In Telegram, message [@BotFather](https://t.me/BotFather), send `/newbot`, and follow the prompts. It gives you a **bot token** like `123456:ABC-DEF...` -> that is `TELEGRAM_BOT_TOKEN`.
2. Open a chat with your new bot and send it any message (bots cannot message you until you message them first).
3. Get your **chat id**: open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser (paste your token in). Find `"chat":{"id":...}` in the JSON -> that number is `TELEGRAM_CHAT_ID`.
4. Set both as secrets.

### WhatsApp setup (2 minutes)

This uses [CallMeBot](https://www.callmebot.com), a free relay that messages **your own number** (it is personal-use only, which is exactly right for alerts to yourself).

1. Save the CallMeBot number **+34 644 91 96 80** to your phone contacts.
2. From WhatsApp, send it exactly: `I allow callmebot to send me messages`. Within a minute it replies with your **API key**.
3. Set `WHATSAPP_PHONE` to your number with country code (for example `+15551234567`) and `WHATSAPP_APIKEY` to the key it sent.

Sending to customers (not yourself) is a different problem: it needs Meta's **WhatsApp Cloud API** with a pre-approved message template, because an alert is a business-initiated message. For that, point `GENERIC_WEBHOOK_URL` (below) at your Cloud API relay instead.

### Discord setup (1 minute)

1. In your Discord server, open **Server Settings -> Integrations -> Webhooks -> New Webhook** (or a channel's **Edit Channel -> Integrations -> Webhooks**).
2. Choose the channel that should receive alerts, then click **Copy Webhook URL**.
3. Set `DISCORD_WEBHOOK_URL` to that URL.

### Pushover setup (2 minutes)

1. Create an account at [pushover.net](https://pushover.net) and install the Pushover app on your phone (one-time purchase after a trial).
2. Your **User Key** is on the dashboard home -> that is `PUSHOVER_USER`.
3. Create an application token at [pushover.net/apps/build](https://pushover.net/apps/build) (name it "AI traffic alerts") -> the **API Token** is `PUSHOVER_TOKEN`.
4. Set both as secrets.

### Generic webhook: Slack, Zapier, your own API (1 minute)

Set `GENERIC_WEBHOOK_URL` to any endpoint and the Worker POSTs the event as JSON. The payload carries a ready-to-display `text` field **plus** structured fields (`type`, `vendor`, `purpose` or `referrer_host`, `url`, `site`, `country`), for example:

```json
{ "text": "[ai-traffic-alerts] A person arrived from ChatGPT and landed on mysite.com/pricing.",
  "type": "referral", "vendor": "ChatGPT", "referrer_host": "chatgpt.com",
  "url": "https://mysite.com/pricing", "site": "mysite.com", "country": "US" }
```

- **Slack:** create an [Incoming Webhook](https://api.slack.com/messaging/webhooks) and use its URL. Slack renders the top-level `text` field, so it works with no adapter.
- **Zapier / Make:** use a "Catch Hook" trigger and branch on the structured fields.
- **Your own API / database / CRM:** consume the JSON directly.

## Tuning the noise

Crawlers can hit you a lot. By default you get **one alert per vendor per purpose per hour**; human AI-referrals are **never** throttled, because a real person the AI sent you is the signal you always want. Change the window with `CRAWLER_THROTTLE_SECONDS` (set `0` to alert on every single crawl, useful while testing). Throttling uses the optional `RADAR_KV` namespace; without it the Worker still runs and simply does not dedupe.

## Test that it works

- **Simulate a human from ChatGPT:** open `https://yourdomain.com/?utm_source=chatgpt.com` in a browser. You should get an "AI sent you a visitor" alert within a few seconds.
- **Simulate a crawler:** `curl -A "GPTBot" https://yourdomain.com/`. You should get an "AI crawler" alert (once per hour per vendor unless you set `CRAWLER_THROTTLE_SECONDS=0`).

## Troubleshooting

Not getting alerts? Check, in order:

1. **Is the Worker on your traffic?** In the dashboard, confirm the **Route** shows `yourdomain.com/*` on the right zone, and that your site is proxied by Cloudflare (orange cloud in DNS). A Worker with no matching route never runs.
2. **Read the Worker logs.** Open the Worker -> **Logs** (or `npx wrangler tail`) and reload your test URL. The logs are explicit about the common failures:
   - `AI signal detected but NO notification channel is configured` - you have not set `NTFY_TOPIC` or any other channel.
   - `telegram channel failed: HTTP 401 ...` (or ntfy/whatsapp/discord/pushover/webhook) - the channel is set but the token, chat id, key, or URL is wrong. The status code tells you which.
3. **Subscribed to the right ntfy topic?** The topic in the app must match `NTFY_TOPIC` exactly, and notifications must be enabled for the ntfy app on your phone.
4. **Crawler alert throttled?** You only get one per vendor per purpose per hour. Set `CRAWLER_THROTTLE_SECONDS=0` and test again.

## How detection works

- **Crawlers** are matched by user-agent token (GPTBot, ClaudeBot, PerplexityBot, and the rest), each tagged with its vendor and purpose. Matching is case-insensitive.
- **Referrals** are matched by the referer hostname (chatgpt.com, perplexity.ai, gemini.google.com, claude.ai, and more) **and** by `utm_source` on the landing URL, because AI apps frequently strip the referer and stamp `utm_source=chatgpt.com` instead. The referrer list is deliberately high-confidence: general search (bing.com, duckduckgo.com) and social (x.com) are excluded so ordinary traffic never triggers a false "AI" alert.

Both lists live at the top of [`src/worker.js`](src/worker.js). These signatures drift as vendors add and rename bots; the canonical, community-maintained crawler list is [ai-robots-txt/ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt). Re-pull it periodically and reconcile the list rather than guessing a token.

## What it cannot see (honest limits)

- **Google/Gemini and Apple training opt-in.** `Google-Extended` and `Applebot-Extended` are robots.txt control tokens that do **not** crawl under their own user-agent (Google's docs say so directly), so no edge tool can detect them by user-agent.
- **Google AI Overviews / AI Mode referrals** arrive as plain `google.com` and are indistinguishable from an ordinary Google click, so they are not flagged (flagging them would mislabel most of your Google traffic).
- **User-agents can be spoofed.** This is an alerting tool, so a rare spoofed crawler UA just means one extra notification, not a security hole.

For the parts this cannot see - citations, prompts, competitors, and revenue across every assistant - use [SurfacedBy](https://surfacedby.com).

## Privacy

The Worker stores nothing about your visitors. It reads the user-agent, referer, and `utm_source` of each request, sends you a notification, and forwards the request to your origin. The optional KV holds only short-lived throttle keys like `radar:OpenAI:training`, never visitor data.

## From alerts to answers

This tool tells you an AI *touched* your site. The harder questions come next: which prompts you show up for, which exact sources the assistants cite, who they recommend instead of you, and whether any of it turns into signups or revenue. Those need measurement across the assistants, not just your edge logs.

That is what we built [SurfacedBy](https://surfacedby.com) to do, across ChatGPT, Perplexity, Gemini, Claude, and Google AI. This tool is the free first look; SurfacedBy is the full picture.

**Run a free audit of your domain at [surfacedby.com](https://surfacedby.com).**

## License

MIT. Use it, fork it, ship it.
