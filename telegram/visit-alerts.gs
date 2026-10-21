/**
 * Portfolio visit alerts → Telegram
 *
 * The site posts a small JSON note here when someone opens it, then again as they
 * browse; this script turns it into ONE Telegram message per visit and keeps editing
 * that message as they scroll, change tabs and click links. The bot token lives only
 * in this script's properties, never in the website.
 *
 * Setup (details in HUONG-DAN.md):
 *   1. Project Settings → Script properties → add TELEGRAM_TOKEN = the token from @BotFather
 *   2. Send any message to your bot in Telegram, then run setup() once here
 *   3. Deploy → New deployment → Web app · Execute as: Me · Who has access: Anyone
 *   4. Put the /exec URL into PROFILE.visitLog in portfolio.html
 */

const TZ = "Asia/Ho_Chi_Minh";   // time zone the alerts are written in
const MAX_NEW_PER_HOUR = 40;     // cap on new messages, so a flood of fake posts can't spam you
const MAX_EDITS_PER_VISIT = 40;
const KEEP = 6 * 60 * 60;        // seconds a visit can keep updating its message

function props() { return PropertiesService.getScriptProperties(); }

function tg(method, payload) {
  const token = props().getProperty("TELEGRAM_TOKEN");
  const res = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  return JSON.parse(res.getContentText());
}

/** Run once by hand: finds your chat with the bot and sends a test message. */
function setup() {
  if (!props().getProperty("TELEGRAM_TOKEN")) throw new Error("Add TELEGRAM_TOKEN in Project Settings → Script properties first.");
  const up = tg("getUpdates", {});
  if (!up.ok) throw new Error("Telegram refused the token: " + up.description);
  const msg = (up.result || []).map(function (u) { return u.message || u.channel_post; }).filter(Boolean).pop();
  if (!msg) throw new Error("Send any message to your bot in Telegram first, then run setup again.");
  props().setProperty("TELEGRAM_CHAT_ID", String(msg.chat.id));
  tg("sendMessage", { chat_id: msg.chat.id, text: "✅ Portfolio visit alerts are connected. You'll get a message here when someone opens your site." });
}

function doPost(e) {
  try { handle(JSON.parse(e.postData.contents)); } catch (err) { console.error(err); }
  return ContentService.createTextOutput("ok");
}

function handle(d) {
  const chat = props().getProperty("TELEGRAM_CHAT_ID");
  if (!chat || !d || !/^[a-z0-9]{8,24}$/.test(d.sid || "")) return;
  const cache = CacheService.getScriptCache(), key = "v:" + d.sid;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const seen = JSON.parse(cache.get(key) || "null");
    if (seen) {
      if (seen.edits >= MAX_EDITS_PER_VISIT) return;
      seen.edits++;
      tg("editMessageText", { chat_id: chat, message_id: seen.mid, text: render(d, seen.t), parse_mode: "HTML", disable_web_page_preview: true });
      cache.put(key, JSON.stringify(seen), KEEP);
      return;
    }
    const hour = "n:" + Utilities.formatDate(new Date(), TZ, "yyyyMMddHH"), n = +(cache.get(hour) || 0);
    if (n >= MAX_NEW_PER_HOUR) return;
    cache.put(hour, String(n + 1), 3700);
    const t = Date.now();
    const res = tg("sendMessage", { chat_id: chat, text: render(d, t), parse_mode: "HTML", disable_web_page_preview: true });
    if (res.ok) cache.put(key, JSON.stringify({ mid: res.result.message_id, t: t, edits: 0 }), KEEP);
  } finally { lock.releaseLock(); }
}

// Everything from the browser is untrusted: clip it and escape it before it goes into HTML
function s(v, max) { return String(v == null ? "" : v).slice(0, max || 80).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function list(v, max) { return (Array.isArray(v) ? v : []).slice(-(max || 12)).map(function (x) { return s(x, 60); }); }

function render(d, t) {
  const L = [];
  const when = Utilities.formatDate(new Date(t), TZ, "HH:mm · dd/MM/yyyy");
  const n = Math.max(1, Math.min(9999, d.n | 0));
  L.push((n > 1 ? "🔁 <b>Returning visitor</b>" : "👀 <b>New visitor</b>") + " · " + when);
  L.push((d.mobile ? "📱 " : "💻 ") + [d.model, d.os, d.browser].filter(Boolean).map(function (x) { return s(x, 40); }).join(" · "));
  L.push("🖥 " + [s(d.screen, 20), s(d.lang, 20), s(d.tz, 40)].filter(Boolean).join(" · "));
  L.push("🔗 " + (d.ref ? "From " + s(d.ref, 60) : "Direct link") + (d.utm ? " · " + s(d.utm, 40) : ""));
  if (n > 1) L.push("🗓 Visit #" + n + (d.ago ? ", last time " + s(d.ago, 30) + " ago" : ""));
  L.push("📄 Opened " + s(d.page, 40));
  if (d.type === "update") {
    L.push("");
    L.push("⏱ Stayed " + s(d.dur, 20) + " · scrolled " + Math.max(0, Math.min(100, d.scroll | 0)) + "%");
    const tabs = list(d.tabs, 12);
    if (tabs.length > 1) L.push("🧭 " + tabs.join(" → "));
    const clicks = list(d.clicks, 12);
    if (clicks.length) L.push("🖱 " + clicks.join(", "));
  }
  return L.join("\n");
}
