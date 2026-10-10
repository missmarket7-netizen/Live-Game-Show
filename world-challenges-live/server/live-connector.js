/* ═══ طبقة استقبال TikTok LIVE — حسابين + محمّل لا يعتمد على النسخة (SSE) ═══ */
import { createRequire } from "node:module";
const requireCJS = createRequire(import.meta.url);

let WebcastPushConnection = null;
/* بصمة هيكلية: أي فئة تملك connect + on على الـ prototype هي الموصل، مهما كان اسمها أو نسخة المكتبة */
function isConnector(x) { return typeof x === "function" && x.prototype && typeof x.prototype.connect === "function" && typeof x.prototype.on === "function"; }
function pickConn(mod) {
  if (!mod) return null;
  if (isConnector(mod.WebcastPushConnection)) return mod.WebcastPushConnection;
  for (const k of Object.keys(mod)) { if (isConnector(mod[k])) return mod[k]; }
  if (isConnector(mod.default)) return mod.default;
  if (mod.default && typeof mod.default === "object") { for (const k of Object.keys(mod.default)) { if (isConnector(mod.default[k])) return mod.default[k]; } }
  return null;
}
async function loadConnector() {
  if (WebcastPushConnection) return WebcastPushConnection;
  let mod = null, lastErr = null;
  try { mod = await import("tiktok-live-connector"); } catch (e) { lastErr = e; }
  let found = pickConn(mod);
  if (!found) { try { found = pickConn(requireCJS("tiktok-live-connector")); } catch (e) { lastErr = e; } }
  if (!found) {
    const desc = mod ? Object.keys(mod).map((k) => k + ":" + typeof mod[k]).join(", ") : "(لا يوجد module)";
    throw new Error("tiktok-live-connector: شكل تصدير غير معروف | exports => " + desc + (lastErr ? " | err: " + lastErr.message : ""));
  }
  WebcastPushConnection = found;
  console.log("✅ تم تحميل موصل تيك توك (فئة):", found.name || "anonymous");
  return found;
}

const ACCOUNTS = [
  { username: String(process.env.TIKTOK_USERNAME || "").trim(), sessionId: String(process.env.TIKTOK_SESSION_ID || "").trim() },
  { username: String(process.env.TIKTOK_USERNAME_2 || "").trim(), sessionId: String(process.env.TIKTOK_SESSION_ID_2 || "").trim() }
].filter((a) => a.username);

const LIVE_CONFIG = { autoReconnect: true, communityGiftNames: new Set(["love you", "love me", "أحبك", "أحبني", "love"]), enableStats: true };
const clients = new Set();
const connections = new Map();
const stats = { likes: new Map(), shares: new Map(), chats: new Map(), gifts: new Map() };
let lastEventAt = null;

function overallStatus() {
  const accounts = ACCOUNTS.map((a) => { const c = connections.get(a.username); return c ? { username: a.username, connected: c.connected, error: c.error, lastEventAt: c.lastEventAt } : { username: a.username, connected: false, error: "لم يبدأ" }; });
  return { connected: accounts.some((a) => a.connected), accounts: accounts, lastEventAt: lastEventAt, error: (accounts.find((a) => a.error) || {}).error || null };
}
function broadcast(type, payload) {
  lastEventAt = new Date().toISOString();
  const data = JSON.stringify({ type: type, payload: Object.assign({}, payload, { ts: Date.now() }) });
  for (const res of clients) { try { res.write("data: " + data + "\n\n"); } catch (e) {} }
}
function giftNameOf(d) { return String(d.giftName || (d.gift && d.gift.name) || "").trim().toLowerCase(); }
function bump(map, key, n) { if (key) map.set(key, (map.get(key) || 0) + n); }

function startConnection(account) {
  const st = { connected: false, error: null, lastEventAt: null, fails: 0, stopped: false };
  connections.set(account.username, st);
  const schedule = () => { if (!LIVE_CONFIG.autoReconnect || st.stopped) return; st.fails += 1; setTimeout(connect, Math.min(60000, 6000 * st.fails)); };
  const fail = (msg) => {
    st.connected = false; st.error = msg; st.fails += 1;
    if (st.fails % 5 === 1) console.error("❌ [" + account.username + "] محاولة " + st.fails + ":", msg);
    broadcast("status", overallStatus()); schedule();
  };
  async function connect() {
    if (st.stopped) return;
    try {
      const Conn = await loadConnector();
      const conn = new Conn(account.username, { sessionId: account.sessionId || undefined, enableExtendedGiftInfo: true, processInitialData: true });
      conn.connect()
        .then(() => { st.connected = true; st.error = null; st.fails = 0; st.lastEventAt = new Date().toISOString(); console.log("✅ TikTok LIVE متصل:", account.username); broadcast("status", overallStatus()); })
        .catch((err) => fail(String((err && err.message) || err)));
      conn.on("follow", (d) => broadcast("follow", { account: account.username, name: d.nickname || d.uniqueId || "متابع", uniqueId: d.uniqueId || "", avatar: d.profilePictureUrl || "" }));
      conn.on("gift", (d) => {
        const name = giftNameOf(d); if (!name) return;
        const k = d.uniqueId || d.nickname;
        if (LIVE_CONFIG.enableStats) bump(stats.gifts, k, d.diamondCount || 0);
        if (LIVE_CONFIG.communityGiftNames.has(name)) broadcast("community", { account: account.username, name: d.nickname || d.uniqueId || "متابع", uniqueId: d.uniqueId || "", avatar: d.profilePictureUrl || "", gift: d.giftName || name, count: d.repeatCount || 1 });
      });
      if (LIVE_CONFIG.enableStats) {
        conn.on("like", (d) => bump(stats.likes, d.uniqueId || d.nickname, d.likeCount || 1));
        conn.on("share", (d) => bump(stats.shares, d.uniqueId || d.nickname, d.shareCount || 1));
        conn.on("chat", (d) => bump(stats.chats, d.uniqueId || d.nickname, 1));
      }
      conn.on("disconnected", () => { st.connected = false; console.warn("⚠️ انقطع الاتصال:", account.username); broadcast("status", overallStatus()); schedule(); });
    } catch (e) { fail(String((e && e.message) || e)); }
  }
  connect();
}

export function attachLiveRoutes(app) {
  app.get("/live/events", (req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
    res.write("data: " + JSON.stringify({ type: "hello", payload: overallStatus() }) + "\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
  });
  app.get("/live/status", (req, res) => res.json(overallStatus()));
  app.get("/live/leaderboard", (req, res) => {
    const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
    res.json({ enabled: LIVE_CONFIG.enableStats, likes: top(stats.likes), shares: top(stats.shares), chats: top(stats.chats), gifts: top(stats.gifts) });
  });
  if (!ACCOUNTS.length) { console.warn("⚠️ لا يوجد TIKTOK_USERNAME / TIKTOK_USERNAME_2 — طبقة الاستقبال معطلة"); return; }
  ACCOUNTS.forEach(startConnection);
  console.log("🎥 طبقة الاستقبال: حسابات مفعّلة =", ACCOUNTS.map((a) => a.username).join(" , "));
}
