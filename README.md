# ai-traffic-alerts-for-cloudflare

Get a push notification the moment an AI assistant sends you a real visitor: a person who clicked through from a ChatGPT, Perplexity, Gemini, Claude, Copilot, or Grok answer. A visitor an AI actively pointed at you is rare and high-value, and this tells you the instant it happens.

It can also alert on **AI crawlers** fetching your pages (to train on them, index them, or answer a user live). That is the far higher-volume signal: a busy site sees thousands of crawler hits a day. One setting, `ALERT_ON`, chooses which signals fire (`referrals`, `crawlers`, or `both`); it **defaults to `referrals`** because crawlers are so much noisier. Turn them on with `ALERT_ON=crawlers` or `both`.

It runs as a single Cloudflare Worker in front of your site, inspects each request at the edge, fires a notification to your phone, and passes the request straight through to your origin. No tracking script, no database, no change to your pages. Detection and notifications run off the response path, so your site is never slowed down.

## Why this exists

Most "AI bot" tools are about *blocking*. But the AI crawl is not the threat, it is the tell: it is the clearest early signal of who is reading you and why. The interesting question is not "how do I keep AI bots out," it is **"which AI engines actually touch me, and which ones send me people."** This tool makes that visible in real time, for free.

## What it can and cannot tell you

| This tool (free) tells you | It cannot tell you |
|---|---|
| A human landed on your site from an AI assistant, and on which page | Whether the AI actually **cited** you in an answer |
| An AI crawler hit your site, which vendor, and its purpose (train / index / answer live) | **Which prompts** you show up for, and which you are missing |
| The visitor's country, real-time, at your edge | Whether the AI recommended a **competitor** instead of you |
| Which signals to be alerted on (referrals, crawlers, or both) | Whether that visibility turned into **signups or revenue** |

The right-hand column is the actual job of AI visibility, and it needs measurement across the assistants, not just your own logs. This tool is the free first look at what reaches your edge.

---

## Setup

You need a site that is **already on Cloudflare** (its traffic is proxied by Cloudflare, the orange cloud in your DNS).

**First, pick a notification channel.** The zero-account option is [ntfy](https://ntfy.sh): install the ntfy app on your phone, tap **Subscribe to topic**, and enter a long, hard-to-guess topic name (treat it like a password, for example `ai-alerts-9f3k2p-mysite`). That topic name is all you need. Prefer Telegram, WhatsApp, Discord, or Pushover? See [Notification channels](#notification-channels).

Then get the Worker deployed one of three ways:

- **[Deploy from GitHub](#option-a-deploy-from-github-no-terminal)** - fork this repo and Cloudflare builds it straight from your fork. No terminal, no copy-paste.
- **[Paste into the dashboard](#option-b-paste-into-the-dashboard-no-terminal)** - copy one file into the Worker editor. No terminal.
- **[Command line](#option-c-command-line-wrangler)** - `git` + `wrangler`, the most reliable path for developers.

After the first two, do the one-time [Configure the Worker](#configure-the-worker-after-option-a-or-b) step.

### Option A: Deploy from GitHub (no terminal)

Fork this repo, then let Cloudflare import your fork and deploy it. Forking is what makes this reliable: Cloudflare deploys straight from a repo you already own, so there is no create-repo step to fail, and every later change you make auto-deploys.

1. **Fork this repository** to your own GitHub account (the **Fork** button, top right of the repo page).
2. In the [Cloudflare dashboard](https://dash.cloudflare.com), open **Workers & Pages** and click **Create application**.
3. Click **Continue with GitHub** and authorize the Cloudflare GitHub app to access your fork when prompted.
4. Select your fork from the repository list and click **Next**.
5. Accept the defaults and click **Deploy**. Cloudflare reads `wrangler.toml`, so `ALERT_ON` (referrals) and `CRAWLER_THROTTLE_SECONDS` are already filled in and the deploy command is `npx wrangler deploy`. **You do not need to open Advanced settings** - ignore the non-production-branch build command, the build token, and any "token is missing permissions" notice. None of it matters here.
6. Now do [Configure the Worker](#configure-the-worker-after-option-a-or-b): this deploy runs, but it will not alert anyone until you add a notification channel and a route.

**Fallback: Clone a public repository via Git URL.** On **Ship something new** you can instead click **Clone a public repository via Git URL** and paste `https://github.com/surfacedby/ai-traffic-alerts-for-cloudflare.git`. This asks Cloudflare to create a fresh copy of the repo in your account, which can return **HTTP 400 at the Deploy step** (before any build runs) if the Cloudflare GitHub App lacks permission to create a repo (it is installed with "Only select repositories") or a repo of that name already exists. Forking first, as above, avoids this.

### Option B: Paste into the dashboard (no terminal)

1. **Create the Worker.** In the [Cloudflare dashboard](https://dash.cloudflare.com), go to **Compute (Workers) -> Workers & Pages -> Create -> Start with Hello World -> Get started**. Give it a name like `ai-traffic-alerts` and create it.
2. **Paste the code.** Click **Edit code** (the `</>` button). Select all of the sample code and delete it, then paste the entire contents of [`src/worker.js`](https://raw.githubusercontent.com/surfacedby/ai-traffic-alerts-for-cloudflare/master/src/worker.js) (open the link, select all, copy). Click **Deploy**.
3. Now do [Configure the Worker](#configure-the-worker-after-option-a-or-b).

### Configure the Worker (after Option A or B)

The tool does not auto-pick where alerts go - it cannot know your phone or chat - so setting one notification channel is the single required step. Without it the Worker runs but stays silent (and logs "no notification channel is configured"). You do this in the Worker's own **Settings** after deploy; you do not need the wizard's Advanced settings.

1. **Notification channel (required).** **Variables and Secrets -> Add** your channel values and **set the Type to Secret** (not Text) for every one of them: `NTFY_TOPIC` for ntfy, and likewise the Telegram, WhatsApp, Pushover, Discord, and generic-webhook values (see [Notification channels](#notification-channels) for exact names). On the Deploy-from-GitHub path this is not optional for **any** of them: a Git-connected Worker rebuilds from `wrangler.toml` on every deploy and treats its `[vars]` as the complete set, so any plaintext dashboard variable is **silently wiped on the next build** - the Worker then still detects traffic and sends nothing, while Settings still shows the (now-empty) variable. Secrets are stored separately and survive builds. Set as many channels as you want - it alerts on all of them.
2. **What to alert on.** Add `ALERT_ON` set to `referrals`, `crawlers`, or `both`. It **defaults to `referrals`** (the rare, high-value signal, and it needs no KV), so you can even skip this. Turn on the noisy crawler signal only if you want it.
3. **Put it in front of your site.** **Domains & Routes -> Add -> Route**, pattern `yourdomain.com/*`, your zone. Choose **Route**, not *Custom domain*: a route runs the Worker on your existing site and passes traffic through to it.
4. **(Only if you set `ALERT_ON` to `crawlers` or `both`) throttle crawlers.** Create a KV namespace under **Storage & Databases -> KV -> Create a namespace**, name it `RADAR_KV`, then bind it in the Worker under **Settings -> Bindings -> Add binding -> KV namespace** with the **Variable name** `RADAR_KV`. It dedupes crawler alerts to one per vendor per purpose per hour. `referrals` mode never touches KV.

That is it. See [Test that it works](#test-that-it-works) to confirm.

### Option C: Command line (wrangler)

The most reliable path if you are comfortable in a terminal: it deploys directly to your account, with no GitHub-App repo-creation step that can fail. You need Node and `npx`.

```bash
git clone https://github.com/surfacedby/ai-traffic-alerts-for-cloudflare
cd ai-traffic-alerts-for-cloudflare
npm install
```

1. **Set your channel, route, and what to alert on** in `wrangler.toml`:

   ```toml
   routes = [ { pattern = "yourdomain.com/*", zone_name = "yourdomain.com" } ]

   [vars]
   ALERT_ON = "referrals"   # referrals | crawlers | both (default referrals)
   NTFY_TOPIC = "your-long-secret-topic"
   ```

2. **(Only if you alert on crawlers) create the throttle KV** and paste the returned id into the `[[kv_namespaces]]` block in `wrangler.toml`. In `referrals` mode you can skip this:

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

Where to put the values: `NTFY_TOPIC` and every channel token are **Secrets**, never plaintext. `NTFY_TOPIC` behaves like a password (anyone who knows the topic can read your alerts), and this repo is public, so it must never live in `wrangler.toml`. In the **dashboard**, open the Worker's **Settings -> Variables and Secrets -> Add** and choose **Type: Secret**. On the **command line**, use `npx wrangler secret put NAME`. Only non-sensitive settings (`ALERT_ON`, `CRAWLER_THROTTLE_SECONDS`, and the optional `SITE_DOMAIN` / `NTFY_SERVER`) belong in `wrangler.toml`. On a Git-connected (Builds) Worker, a plaintext variable added only in the dashboard is wiped on the next build; a Secret is not.

### ntfy setup (1 minute, no account)

1. Install the **ntfy** app ([iOS](https://apps.apple.com/app/ntfy/id1625396347) / [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy)), or open [ntfy.sh](https://ntfy.sh) in a browser.
2. Tap **Subscribe to topic** and enter a long, hard-to-guess name (anyone who knows the topic can see your alerts, so treat it like a password, for example `ai-alerts-9f3k2p-mysite`).
3. Set `NTFY_TOPIC` to that exact name. Self-hosting ntfy? Also set `NTFY_SERVER` (defaults to `https://ntfy.sh`).

**ntfy.sh free-tier quota.** The free `ntfy.sh` server caps how many messages you can publish per day, and that limit is per publishing IP. The Worker publishes from Cloudflare's shared egress IPs, so the quota can be reached faster than expected, especially with heavy testing or with `ALERT_ON` set to `crawlers` or `both` (thousands of hits a day will exhaust it quickly). Free ntfy is fine for the rare `referrals` signal; for crawler mode or any real volume, use a per-account channel (Telegram, Discord, or Pushover), or self-host ntfy and point `NTFY_SERVER` at it. When the quota is hit, publishing returns HTTP 429 (see [Troubleshooting](#troubleshooting)) and resets daily.

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

## Choosing what alerts

`ALERT_ON` decides which signals fire:

- **`referrals`** (the default) - only humans an AI sent you. The rare, high-value signal. Crawler detection is skipped entirely, so you need no `RADAR_KV` namespace and no throttling.
- **`crawlers`** - only AI crawler hits. Useful if you care about training/indexing coverage.
- **`both`** - both signals.

Empty or unrecognized values fall back to `referrals`.

If you alert on crawlers, they can hit you a lot, so they are throttled to **one alert per vendor per purpose per hour**; human AI-referrals are **never** throttled, because a real person the AI sent you is the signal you always want. Change the window with `CRAWLER_THROTTLE_SECONDS` (set `0` to alert on every single crawl, useful while testing). Throttling uses the optional `RADAR_KV` namespace; without it the Worker still runs and simply does not dedupe. None of this applies in `referrals` mode.

## Test that it works

- **Simulate a human from ChatGPT:** open `https://yourdomain.com/?utm_source=chatgpt.com` in a browser. You should get an "AI sent you a visitor" alert within a few seconds. (Works in `referrals` and `both` modes.)
- **Simulate a crawler:** `curl -A "GPTBot" https://yourdomain.com/`. You should get an "AI crawler" alert (once per hour per vendor unless you set `CRAWLER_THROTTLE_SECONDS=0`). Only fires when `ALERT_ON` is `crawlers` or `both`.

The alert names the site the visitor actually hit (the request Host). If you test against the Worker's own `*.workers.dev` URL instead of a routed domain, the alert will honestly read `...workers.dev`; on your real route it shows your real domain. To pin a fixed label regardless (handy while testing), set a `SITE_DOMAIN` variable in `wrangler.toml` to your domain and it overrides the displayed host.

## Troubleshooting

Not getting alerts? Check, in order:

1. **Is the Worker on your traffic?** In the dashboard, confirm the **Route** shows `yourdomain.com/*` on the right zone, and that your site is proxied by Cloudflare (orange cloud in DNS). A Worker with no matching route never runs.
2. **Read the Worker logs.** Enable **Observability** first (Worker -> **Settings -> Observability**); that is what surfaces channel send failures. Then open the Worker -> **Logs** (or `npx wrangler tail`) and reload your test URL. The logs are explicit about the common failures:
   - `AI signal detected but NO notification channel is configured` - you have not set `NTFY_TOPIC` or any other channel.
   - `telegram channel failed: HTTP 401 ...` (or ntfy/whatsapp/discord/pushover/webhook) - the channel is set but the token, chat id, key, or URL is wrong. The status code tells you which.
3. **A channel shows in Settings but the log says no channel is configured (or a token looks set but fails empty)?** On the Deploy-from-GitHub path this means you added that value as a plaintext (Text) variable and the last build wiped it. This is true for **every** channel value, not just ntfy. Re-add each one (`NTFY_TOPIC`, `TELEGRAM_BOT_TOKEN`, and the rest) with **Type: Secret**, which survives builds, then redeploy.
4. **Subscribed to the right ntfy topic?** The topic in the app must match `NTFY_TOPIC` exactly, and notifications must be enabled for the ntfy app on your phone.
5. **Crawler alert throttled?** You only get one per vendor per purpose per hour. Set `CRAWLER_THROTTLE_SECONDS=0` and test again.
6. **Alerts stopped after working at first?** Check the Worker's **Observability** logs. `ntfy channel failed: HTTP 429 ... daily message quota reached` means you hit ntfy.sh's free daily limit (reached faster because the Worker publishes from Cloudflare's shared IPs, and immediately in `crawlers`/`both` mode). It resets daily. For reliable alerting use a per-account channel (Telegram, Discord, Pushover), self-host ntfy and set `NTFY_SERVER`, or upgrade ntfy.sh.

**Deploy returns HTTP 400 (before any build runs).** You used **Clone a public repository via Git URL** and the Cloudflare GitHub App cannot create the copied repo in your account. Fork the repo to your account and import your fork instead (Option A above), or widen the Cloudflare GitHub App's repository access in GitHub under **Settings -> Applications -> Installed GitHub Apps -> Cloudflare -> Configure**.

## How detection works

The core idea - that "AI traffic" is really two separate signals (a provider fetching your page versus a human clicking through from an AI answer), detected two different ways - comes from our own analysis of real server logs: [What nginx logs prove about AI traffic vs referral traffic](https://surfacedby.com/blog/nginx-logs-ai-traffic-vs-referral-traffic). This tool applies those findings at the Cloudflare edge.

- **Crawlers** are matched by user-agent token (GPTBot, ClaudeBot, PerplexityBot, and the rest), each tagged with its vendor and purpose. Matching is case-insensitive.
- **Referrals** are matched three ways: the referer hostname (chatgpt.com, perplexity.ai, gemini.google.com, claude.ai, and more); the native-app referer a mobile AI app sends (`android-app://com.openai.chatgpt/` and the like); and `utm_source` on the landing URL, because AI apps frequently strip the referer and stamp `utm_source=chatgpt.com` instead. The referrer list is deliberately high-confidence: general search (bing.com, duckduckgo.com, you.com) and social (x.com) are excluded so ordinary traffic never triggers a false "AI" alert.

`ALERT_ON` gates which of the two are even looked for, so `referrals` mode does no crawler user-agent matching at all. Both signature lists live at the top of [`src/worker.js`](src/worker.js). These signatures drift as vendors add and rename bots; the canonical, community-maintained crawler list is [ai-robots-txt/ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt). Re-pull it periodically and reconcile the list rather than guessing a token.

## What it cannot see (honest limits)

- **Google/Gemini and Apple training opt-in.** `Google-Extended` and `Applebot-Extended` are robots.txt control tokens that do **not** crawl under their own user-agent (Google's docs say so directly), so no edge tool can detect them by user-agent.
- **Gemini: visitors yes, crawls no.** You do see the humans Gemini sends you (they carry a `gemini.google.com` referer or `utm_source`), but you will not see Gemini crawl your page: it answers from Google's existing index and has no live-fetch user-agent to catch.
- **Copilot and Grok: the fetch is invisible; the referral depends on the platform.** Our log research found their provider fetch shows up as a plain browser (an ordinary Chrome user-agent, no bot token), so there is no crawler signature to match and you will not see them crawl at all. Their human clickthroughs are a separate thing: this tool catches one whenever the click carries a `copilot.microsoft.com` or `grok.com` referer or a `utm_source`, and cannot see one that arrives with neither (it looks like ordinary direct traffic). How often each case happens is set by the platform's referrer policy; our research measured their crawler side, not their referral share, so we do not claim a catch rate.
- **Google AI Overviews / AI Mode referrals** arrive as plain `google.com` and are indistinguishable from an ordinary Google click, so they are not flagged (flagging them would mislabel most of your Google traffic).
- **User-agents can be spoofed.** This is an alerting tool, so a rare spoofed crawler UA just means one extra notification, not a security hole.

The crawl-side findings above - Gemini answering from its index without fetching, and Copilot and Grok fetching as plain browsers - are from our own server-log research: [What nginx logs prove about AI traffic vs referral traffic](https://surfacedby.com/blog/nginx-logs-ai-traffic-vs-referral-traffic). On the referral side, whether a human click carries a referer at all is decided by the sending platform's referrer policy (not the browser), so a share of AI clickthroughs is simply unrecoverable at the edge. Measuring AI visibility evenly across every assistant needs cross-assistant measurement, not edge logs alone.

## Privacy

The Worker stores nothing about your visitors. It reads the user-agent, referer, and `utm_source` of each request, sends you a notification, and forwards the request to your origin. The optional KV holds only short-lived throttle keys like `radar:OpenAI:training`, never visitor data.

## Beyond alerts

This tool tells you an AI *touched* your site. The harder questions - which prompts you show up for, which exact sources the assistants cite, who they recommend instead of you, and whether any of it converts - need measurement across the assistants, not just your edge logs. That is the problem [SurfacedBy](https://surfacedby.com), the project behind this tool, works on.

## Credits

Built by [Ali Khallad](https://github.com/bomsn) at [SurfacedBy](https://surfacedby.com).

## License

MIT. Use it, fork it, ship it.