import TikTokLiveConnector from "tiktok-live-connector";
const { WebcastPushConnection } = TikTokLiveConnector.default || TikTokLiveConnector;

const LIVE_CONFIG = {
  username: process.env.TIKTOK_USERNAME || "",
  sessionId: process.env.TIKTOK_SESSION_ID || "",
  autoReconnect: true,
  reconnectDelayMs: 8000,
  communityGiftNames: new Set(["love you", "love me", "أحبك", "أحبني", "love"]),
  enableStats: true
};

const clients = new Set();
let status = { connected: false, username: LIVE_CONFIG.username, lastEventAt: null, error: null };
let connection = null;
let reconnectTimer = null;
const stats = { likes: new Map(), shares: new Map(), chats: new Map(), gifts: new Map() };

function broadcast(type, payload) {
  status.lastEventAt = new Date().toISOString();
  const data = JSON.stringify({ type, payload, ts: Date.now() });
  for (const res of clients) { try { res.write("data: " + data + "\n\n"); } catch (e) {} }
}
function giftNameOf(d) { return String(d.giftName || (d.gift && d.gift.name) || "").trim().toLowerCase(); }
function scheduleReconnect() {
  if (!LIVE_CONFIG.autoReconnect || reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; startConnection(); }, LIVE_CONFIG.reconnectDelayMs);
}
function bump(map, key, n) { if (key) map.set(key, (map.get(key) || 0) + n); }

function startConnection() {
  if (!LIVE_CONFIG.username) { console.warn("⚠️ TIKTOK_USERNAME غير مضبوط — طبقة الاستقبال معطلة"); return; }
  try {
    connection = new WebcastPushConnection(LIVE_CONFIG.username, {
      sessionId: LIVE_CONFIG.sessionId || undefined,
      enableExtendedGiftInfo: true,
      processInitialData: true
    });
    connection.connect()
      .then(() => { status.connected = true; status.error = null; broadcast("status", status); console.log("✅ TikTok LIVE متصل:", LIVE_CONFIG.username); })
      .catch((err) => { status.connected = false; status.error = String((err && err.message) || err); broadcast("status", status); console.error("❌ خطأ اتصال TikTok:", status.error); scheduleReconnect(); });

    connection.on("follow", (d) => broadcast("follow", { name: d.nickname || d.uniqueId || "متابع", uniqueId: d.uniqueId || "", avatar: d.profilePictureUrl || "" }));
    connection.on("gift", (d) => {
      const name = giftNameOf(d); if (!name) return;
      const k = d.uniqueId || d.nickname;
      if (LIVE_CONFIG.enableStats) bump(stats.gifts, k, d.diamondCount || 0);
      if (LIVE_CONFIG.communityGiftNames.has(name)) broadcast("community", { name: d.nickname || d.uniqueId || "متابع", uniqueId: d.uniqueId || "", avatar: d.profilePictureUrl || "", gift: d.giftName || name, count: d.repeatCount || 1 });
    });
    if (LIVE_CONFIG.enableStats) {
      connection.on("like", (d) => bump(stats.likes, d.uniqueId || d.nickname, d.likeCount || 1));
      connection.on("share", (d) => bump(stats.shares, d.uniqueId || d.nickname, d.shareCount || 1));
      connection.on("chat", (d) => bump(stats.chats, d.uniqueId || d.nickname, 1));
    }
    connection.on("disconnected", () => { status.connected = false; broadcast("status", status); scheduleReconnect(); });
  } catch (e) {
    status.connected = false; status.error = String((e && e.message) || e);
    console.error("❌ فشل بناء الاتصال:", status.error);
    scheduleReconnect();
  }
}

export function attachLiveRoutes(app) {
  app.get("/live/events", (req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
    res.write("data: " + JSON.stringify({ type: "hello", payload: status }) + "\n\n");
    clients.add(res); req.on("close", () => clients.delete(res));
  });
  app.get("/live/status", (req, res) => res.json(status));
  app.get("/live/leaderboard", (req, res) => {
    const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
    res.json({ enabled: LIVE_CONFIG.enableStats, likes: top(stats.likes), shares: top(stats.shares), chats: top(stats.chats), gifts: top(stats.gifts) });
  });
  startConnection();
}
