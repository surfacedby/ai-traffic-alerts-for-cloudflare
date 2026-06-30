// Notification channels. Each sender is best-effort: a failure is swallowed so
// it can never block or break the request being served. Configure one or more
// channels via environment variables (see wrangler.toml and the README); only
// the channels you set are used.

async function postJSON(url, body, headers = {}) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
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

async function sendNtfy(env, title, text) {
  if (!env.NTFY_TOPIC) return;
  const base = env.NTFY_SERVER || "https://ntfy.sh";
  await fetch(`${base}/${env.NTFY_TOPIC}`, {
    method: "POST",
    headers: { Title: title, Tags: "robot" },
    body: text,
  });
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

// Fan out to every configured channel. Returns nothing; all errors are caught
// per-channel so one broken channel does not stop the others.
export async function sendAlert(env, { title, text, payload }) {
  const tasks = [
    sendTelegram(env, text),
    sendDiscord(env, text),
    sendNtfy(env, title, text),
    sendPushover(env, title, text),
    sendWebhook(env, payload),
  ];
  const results = await Promise.allSettled(tasks);
  // Surface channel errors in the Worker log only; never throw.
  for (const r of results) {
    if (r.status === "rejected") console.log("ai-traffic-alerts-for-cloudflare channel error:", r.reason);
  }
}
