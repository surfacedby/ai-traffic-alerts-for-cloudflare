// Detection tests. Zero dependencies: run with `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, resolveAlertMode } from "../src/worker.js";

const LANDING = "https://mysite.com/pricing";

test("detects an AI crawler by user-agent token", () => {
  const r = classify("Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)", null, LANDING);
  assert.equal(r.kind, "crawler");
  assert.equal(r.vendor, "OpenAI");
  assert.equal(r.purpose, "training");
});

test("crawler matching is case-insensitive (Meta-ExternalAgent == meta-externalagent)", () => {
  const a = classify("Meta-ExternalAgent/1.0", null, LANDING);
  const b = classify("meta-externalagent/1.0", null, LANDING);
  assert.equal(a.kind, "crawler");
  assert.equal(a.vendor, "Meta");
  assert.deepEqual({ kind: a.kind, vendor: a.vendor, purpose: a.purpose }, { kind: b.kind, vendor: b.vendor, purpose: b.purpose });
});

test("preserves the crawler purpose (train / index / answer live)", () => {
  assert.equal(classify("ChatGPT-User/1.0", null, LANDING).purpose, "retrieval");
  assert.equal(classify("OAI-SearchBot/1.0", null, LANDING).purpose, "search");
  assert.equal(classify("ClaudeBot/1.0", null, LANDING).purpose, "training");
});

test("detects a human AI referral by referer host", () => {
  const r = classify("Mozilla/5.0", "https://chatgpt.com/", LANDING);
  assert.equal(r.kind, "referral");
  assert.equal(r.vendor, "ChatGPT");
  assert.equal(r.via, "referrer");
});

test("detects a human AI referral by utm_source when the referer is stripped", () => {
  // ChatGPT and other AI apps often drop the referer and stamp utm_source
  // instead; without this the visit would be invisible.
  const r = classify("Mozilla/5.0", null, "https://mysite.com/p?utm_source=chatgpt.com");
  assert.equal(r.kind, "referral");
  assert.equal(r.vendor, "ChatGPT");
  assert.equal(r.via, "utm_source");
});

test("utm_source matches a short token too (utm_source=perplexity)", () => {
  const r = classify("Mozilla/5.0", null, "https://mysite.com/?utm_source=perplexity");
  assert.equal(r.kind, "referral");
  assert.equal(r.vendor, "Perplexity");
});

test("detects a native AI app referral (android-app package)", () => {
  // A ChatGPT/Claude/etc. mobile app opens the link with no web referer, only
  // android-app://<package>/. Report the canonical host, not the package.
  const r = classify("Mozilla/5.0 (Linux; Android 14)", "android-app://com.openai.chatgpt/", LANDING);
  assert.equal(r.kind, "referral");
  assert.equal(r.vendor, "ChatGPT");
  assert.equal(r.via, "app");
  assert.equal(r.host, "chatgpt.com");
  assert.equal(classify("Mozilla/5.0", "android-app://com.anthropic.claude/", LANDING).vendor, "Claude");
});

test("ignores an unknown android-app package", () => {
  assert.equal(classify("Mozilla/5.0", "android-app://com.example.reader/", LANDING).kind, null);
});

test("catches Copilot/Grok human referrals by referer or utm_source", () => {
  assert.equal(classify("Mozilla/5.0", "https://copilot.microsoft.com/", LANDING).vendor, "Microsoft Copilot");
  assert.equal(classify("Mozilla/5.0", null, "https://mysite.com/?utm_source=copilot").vendor, "Microsoft Copilot");
  assert.equal(classify("Mozilla/5.0", "https://grok.com/", LANDING).vendor, "Grok");
  assert.equal(classify("Mozilla/5.0", null, "https://mysite.com/?utm_source=grok").vendor, "Grok");
});

test("cannot catch a Copilot/Grok bot fetch that wears a plain-browser user-agent", () => {
  // Matches the log research: their provider fetch has no bot token, so in
  // crawler mode there is nothing to detect. (A referer, if present, is a
  // referral, not a crawl - hence the null here in crawlers-only mode.)
  const botLike = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0 Safari/537.36";
  assert.equal(classify(botLike, "https://copilot.microsoft.com/", LANDING, "crawlers").kind, null);
  assert.equal(classify(botLike, null, LANDING, "crawlers").kind, null);
});

test("does NOT treat you.com as an AI referral (general search, ambiguous)", () => {
  // Same reasoning as bing.com / duckduckgo.com: you.com is a general search
  // engine, so a click from it is not reliably the AI product.
  assert.equal(classify("Mozilla/5.0", "https://you.com/", LANDING).kind, null);
});

test("does NOT flag general search or social as an AI referral", () => {
  // These are ambiguous: a click from Bing search or a link on X is almost
  // never the AI product itself. Flagging them would cry wolf on normal traffic.
  assert.equal(classify("Mozilla/5.0", "https://www.bing.com/search?q=x", LANDING).kind, null);
  assert.equal(classify("Mozilla/5.0", "https://duckduckgo.com/", LANDING).kind, null);
  assert.equal(classify("Mozilla/5.0", "https://x.com/", LANDING).kind, null);
  assert.equal(classify("Mozilla/5.0", "https://www.google.com/", LANDING).kind, null);
});

test("ignores Google-Extended (a robots.txt token with no request user-agent)", () => {
  // Google-Extended controls Gemini training via robots.txt and never crawls
  // under its own user-agent, so it must not be listed and cannot appear here.
  assert.equal(classify("Mozilla/5.0 Google-Extended", null, LANDING).kind, null);
  // The real Applebot crawl (which the Applebot-Extended training toggle applies
  // to) DOES send a user-agent and is correctly detected as Apple.
  assert.equal(classify("Mozilla/5.0 (compatible; Applebot/0.1)", null, LANDING).vendor, "Apple");
});

test("returns kind:null for an ordinary human visit", () => {
  assert.equal(classify("Mozilla/5.0 (Macintosh)", "https://news.ycombinator.com/", LANDING).kind, null);
  assert.equal(classify("Mozilla/5.0 (Macintosh)", null, LANDING).kind, null);
});

test("tolerates missing / malformed inputs without throwing", () => {
  assert.equal(classify(null, null, LANDING).kind, null);
  assert.equal(classify("", "not a url", "also not a url").kind, null);
});

test("ALERT_ON=referrals ignores crawlers but still catches referrals", () => {
  assert.equal(classify("Mozilla/5.0 (compatible; GPTBot/1.1)", null, LANDING, "referrals").kind, null);
  assert.equal(classify("Mozilla/5.0", "https://chatgpt.com/", LANDING, "referrals").kind, "referral");
  assert.equal(
    classify("Mozilla/5.0", null, "https://mysite.com/?utm_source=perplexity", "referrals").kind,
    "referral"
  );
});

test("ALERT_ON=crawlers ignores referrals but still catches crawlers", () => {
  assert.equal(classify("Mozilla/5.0 (compatible; GPTBot/1.1)", null, LANDING, "crawlers").kind, "crawler");
  assert.equal(classify("Mozilla/5.0", "https://chatgpt.com/", LANDING, "crawlers").kind, null);
  assert.equal(
    classify("Mozilla/5.0", null, "https://mysite.com/?utm_source=chatgpt.com", "crawlers").kind,
    null
  );
});

test("default mode (both) detects either signal", () => {
  assert.equal(classify("Mozilla/5.0 (compatible; GPTBot/1.1)", null, LANDING).kind, "crawler");
  assert.equal(classify("Mozilla/5.0", "https://claude.ai/", LANDING).kind, "referral");
});

test("ALERT_ON defaults to referrals (crawlers are opt-in)", () => {
  assert.equal(resolveAlertMode({}), "referrals");
  assert.equal(resolveAlertMode({ ALERT_ON: "" }), "referrals");
  assert.equal(resolveAlertMode({ ALERT_ON: "nonsense" }), "referrals");
  assert.equal(resolveAlertMode({ ALERT_ON: "BOTH" }), "both");
  assert.equal(resolveAlertMode({ ALERT_ON: " Crawlers " }), "crawlers");
  assert.equal(resolveAlertMode({ ALERT_ON: "referrals" }), "referrals");
});
