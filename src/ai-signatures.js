// AI traffic signatures: which user-agents are AI crawlers, and which referrer
// hosts are AI assistants sending a human visitor.
//
// Keep this list fresh. The crawler user-agents drift; the canonical, community
// maintained source is https://github.com/ai-robots-txt/ai.robots.txt . When in
// doubt, re-pull that list and reconcile the patterns below rather than guessing
// a token from memory.

// AI crawler user-agent tokens, grouped by vendor and stated purpose.
// purpose: "training" (corpus building), "retrieval" (live answer fetch /
// user-triggered), or "search" (search index building). The same vendor can run
// several bots with different purposes; that distinction is the whole point of
// the tool, so it is preserved here.
export const AI_CRAWLERS = [
  // OpenAI
  { token: "GPTBot", vendor: "OpenAI", purpose: "training" },
  { token: "OAI-SearchBot", vendor: "OpenAI", purpose: "search" },
  { token: "ChatGPT-User", vendor: "OpenAI", purpose: "retrieval" },
  // Anthropic
  { token: "ClaudeBot", vendor: "Anthropic", purpose: "training" },
  { token: "anthropic-ai", vendor: "Anthropic", purpose: "training" },
  { token: "Claude-Web", vendor: "Anthropic", purpose: "retrieval" },
  { token: "Claude-User", vendor: "Anthropic", purpose: "retrieval" },
  { token: "Claude-SearchBot", vendor: "Anthropic", purpose: "search" },
  // Google
  { token: "Google-Extended", vendor: "Google", purpose: "training" },
  { token: "GoogleOther", vendor: "Google", purpose: "search" },
  // Perplexity
  { token: "PerplexityBot", vendor: "Perplexity", purpose: "search" },
  { token: "Perplexity-User", vendor: "Perplexity", purpose: "retrieval" },
  // Microsoft / Bing AI
  { token: "BingBot", vendor: "Microsoft", purpose: "search" },
  // Apple
  { token: "Applebot-Extended", vendor: "Apple", purpose: "training" },
  { token: "Applebot", vendor: "Apple", purpose: "search" },
  // Meta
  { token: "meta-externalagent", vendor: "Meta", purpose: "training" },
  { token: "FacebookBot", vendor: "Meta", purpose: "training" },
  // Amazon
  { token: "Amazonbot", vendor: "Amazon", purpose: "training" },
  // ByteDance
  { token: "Bytespider", vendor: "ByteDance", purpose: "training" },
  // Cohere
  { token: "cohere-ai", vendor: "Cohere", purpose: "training" },
  { token: "cohere-training-data-crawler", vendor: "Cohere", purpose: "training" },
  // DuckDuckGo AI
  { token: "DuckAssistBot", vendor: "DuckDuckGo", purpose: "retrieval" },
  // Mistral
  { token: "MistralAI-User", vendor: "Mistral", purpose: "retrieval" },
  // Common Crawl (feeds many models)
  { token: "CCBot", vendor: "Common Crawl", purpose: "training" },
  // Allen Institute
  { token: "AI2Bot", vendor: "Allen Institute", purpose: "training" },
  // You.com
  { token: "YouBot", vendor: "You.com", purpose: "search" },
  // Timpi / Diffbot / others
  { token: "Diffbot", vendor: "Diffbot", purpose: "training" },
  { token: "Timpibot", vendor: "Timpi", purpose: "search" },
];

// Referrer hosts that mean a human came to your site FROM an AI assistant's
// answer. This is the high-value signal: a real person the AI sent you. Matched
// as a suffix on the referer hostname (so sub.domains match too).
export const AI_REFERRERS = [
  { host: "chatgpt.com", vendor: "ChatGPT" },
  { host: "chat.openai.com", vendor: "ChatGPT" },
  { host: "perplexity.ai", vendor: "Perplexity" },
  { host: "gemini.google.com", vendor: "Gemini" },
  { host: "claude.ai", vendor: "Claude" },
  { host: "copilot.microsoft.com", vendor: "Copilot" },
  { host: "bing.com", vendor: "Bing Copilot" },
  { host: "you.com", vendor: "You.com" },
  { host: "poe.com", vendor: "Poe" },
  { host: "duckduckgo.com", vendor: "DuckDuckGo AI" },
  { host: "grok.com", vendor: "Grok" },
  { host: "x.com", vendor: "Grok (X)" },
  { host: "meta.ai", vendor: "Meta AI" },
];

// Classify an incoming request from its user-agent and referer.
// Returns { kind: "crawler"|"referral"|null, vendor, purpose, ... }.
export function classify(userAgent, referer) {
  const ua = userAgent || "";
  for (const bot of AI_CRAWLERS) {
    if (ua.includes(bot.token)) {
      return { kind: "crawler", vendor: bot.vendor, purpose: bot.purpose, token: bot.token };
    }
  }
  if (referer) {
    let host = "";
    try {
      host = new URL(referer).hostname.toLowerCase();
    } catch {
      host = "";
    }
    if (host) {
      for (const ref of AI_REFERRERS) {
        if (host === ref.host || host.endsWith("." + ref.host)) {
          return { kind: "referral", vendor: ref.vendor, host };
        }
      }
    }
  }
  return { kind: null };
}
