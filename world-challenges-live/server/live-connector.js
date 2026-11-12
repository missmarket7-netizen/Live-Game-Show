/* ═══ طبقة استقبال TikTok LIVE — v4: حسابان، مجاني، بدون تعطيل أبدي ═══ */
import { createRequire } from "node:module";
const requireCJS = createRequire(import.meta.url);

const PACKAGES = ["tiktok-live-connector", "piratetek-tiktok-live-js"];
let ConnClass = null;
let ConnPkg = null;

function isConn(x) {
  return typeof x === "function" && x.prototype &&
    typeof x.prototype.connect === "function" &&
    typeof x.prototype.on === "function";
}
function pick(mod) {
  if (!mod) return null;
  if (isConn(mod.WebcastPushConnection)) return mod.WebcastPushConnection;
  if (isConn(mod.TikTokLiveConnection)) return mod.TikTokLiveConnection;
  if (isConn(mod.default)) return mod.default;
  if (mod.default && typeof mod.default === "object") {
    if (isConn(mod.default.WebcastPushConnection)) return mod.default.WebcastPushConnection;
    if (isConn(mod.default.TikTokLiveConnection)) return mod.default.TikTokLiveConnection;
    for (const k of Object.keys(mod.default)) if (isConn(mod.default[k])) return mod.default[k];
  }
  for (const k of Object.keys(mod)) if (isConn(mod[k])) return mod[k];
  return null;
}
async function loadConn() {
  if (ConnClass) return ConnClass;
  for (const pkg of PACKAGES) {
    let mod = null;
    try { mod = requireCJS(pkg); } catch (e) { mod = null; }
    if (!mod) { try { mod = await import(pkg); } catch (e) { mod = null; } }
    const found = pick(mod);
    if (found) {
      ConnClass = found; ConnPkg = pkg;
      applySignConfig(mod);
      console.log("✅ موصل تيك توك من:", pkg, "| فئة:", found.name || "anonymous");
      return ConnClass;
    }
  }
  throw new Error("لا توجد مكتبة موصل متاحة: " + PACKAGES.join(", "));
}
function applySignConfig(mod) {
  const key = String(process.env.TIKTOK_SIGN_API_KEY || "").trim();
  const endpoint = String(process.env.TIKTOK_SIGN_ENDPOINT || "").trim();
  const cfg = (mod && mod.SignConfig) || (mod && mod.default && mod.default.SignConfig) || null;
  if (!cfg) return;
  try {
    if (key) {
      cfg.apiKey = key;
      if (cfg.baseOptions && typeof cfg.baseOptions === "object") {
        cfg.baseOptions.headers = Object.assign({}, cfg.baseOptions.headers || {}, { "x-api-key": key });
      }
      console.log("🔑 مفتاح التوقيع من البيئة مضبوط");
    }
    if (endpoint && "signEndpoint" in cfg) { cfg.signEndpoint = endpoint; console.log("🔗 نقطة التوقيع من البيئة مضبوطة"); }
  } catch (e) {}
}

const ACCOUNTS = [
  { username: String(process.env.TIKTOK_USERNAME || "").trim(), sessionId: String(process.env.TIKTOK_SESSION_ID || "").trim() },
  { username: String(process.env.TIKTOK_USERNAME_2 || "").trim(), sessionId: String(process.env.TIKTOK_SESSION_ID_2 || "").trim() }
].filter((a) => a.username);

function normLiveText(v) {
  return String(v || "").toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "ا")
    .replace(/\s+/g, " ").trim();
}
const AUDIENCE_PREFIX = normLiveText(process.env.AUDIENCE_JOIN_PREFIX || "انضم");
const AUDIENCE_GIRLS_COMMENT = normLiveText(process.env.AUDIENCE_GIRLS_COMMENT || "ملكة");
const AUDIENCE_BOYS_COMMENT = normLiveText(process.env.AUDIENCE_BOYS_COMMENT || "ملك");
const LOUNGE_JOIN_COMMENTS = new Set(["good live", "عالم التحديات", "تحدي مروان", "قدها"].map(normLiveText));
const LOUNGE_GIFT_ACTIONS = [
  { action: "CHEER", duration: 2600, names: ["قلب صغير", "small heart"] },
  { action: "COMEDY", duration: 3200, names: ["كرة بتدور", "spinning ball"] },
  { action: "DANCE", duration: 6200, names: ["قلب", "heart"] },
  { action: "RUN_CHAOS", duration: 7200, names: ["العطر", "perfume"] },
  { action: "FLIP_DANCE", duration: 7800, names: ["الدونتس", "donut"] },
  { action: "SOLO_DANCE", duration: 9000, names: ["قلب بايدي", "heart hands"] },
  { action: "ZERO_GRAVITY", duration: 11000, names: ["كورجي", "corgi"] }
].map((r) => ({ ...r, names: r.names.map(normLiveText) }));
const COMMUNITY_GIFTS = new Set(["love you", "love me", "أحبك", "أحبني"]);

const clients = new Set();
const connections = new Map();
const stats = { likes: new Map(), shares: new Map(), chats: new Map(), gifts: new Map() };
const recent = { follows: [], gifts: [], joins: [], chats: [] };
let lastEventAt = null;
let lbTimer = null;

function describeErr(e) {
  if (e && typeof e === "object") {
    if (e.message) return String(e.message);
    try { return JSON.stringify(e).slice(0, 300); } catch (x) { return "خطأ غير معروف"; }
  }
  return String(e);
}
function push(list, item, max) { list.unshift(item); if (list.length > max) list.pop(); }
function bump(map, key, n) { if (key) map.set(key, (map.get(key) || 0) + n); }
function giftNameOf(d) { return String(d.giftName || (d.gift && d.gift.name) || "").trim().toLowerCase(); }

function getLeaderboard() {
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
  return { likes: top(stats.likes), shares: top(stats.shares), chats: top(stats.chats), gifts: top(stats.gifts) };
}
function overallStatus() {
  const accounts = ACCOUNTS.map((a) => {
    const c = connections.get(a.username);
    return c
      ? { username: a.username, status: c.status, connected: c.status === "live", error: c.lastErr, lastEventAt: c.lastEventAt }
      : { username: a.username, status: "idle", connected: false, error: null, lastEventAt: null };
  });
  return {
    connected: accounts.some((a) => a.connected),
    accounts, lastEventAt,
    connector: ConnPkg || "none",
    signMode: process.env.TIKTOK_SIGN_API_KEY ? "env-key" : (process.env.TIKTOK_SIGN_ENDPOINT ? "env-endpoint" : "free-anonymous")
  };
}
function broadcast(type, payload) {
  lastEventAt = new Date().toISOString();
  const data = JSON.stringify({ type, payload: Object.assign({}, payload, { ts: Date.now() }) });
  for (const res of clients) { try { res.write("data: " + data + "\n\n"); } catch (e) {} }
}
function broadcastLeaderboardSoon() {
  if (lbTimer) return;
  lbTimer = setTimeout(() => { lbTimer = null; broadcast("leaderboard-update", getLeaderboard()); }, 4000);
}

function audienceTeamFromComment(t0) {
  const text = normLiveText(t0);
  if (!text) return null;
  if (text === "ملكة" || (AUDIENCE_GIRLS_COMMENT && text === AUDIENCE_GIRLS_COMMENT)) return "girls";
  if (text === "ملك" || (AUDIENCE_BOYS_COMMENT && text === AUDIENCE_BOYS_COMMENT)) return "boys";
  const parts = text.split(" ");
  if (AUDIENCE_PREFIX && parts[0] === AUDIENCE_PREFIX) {
    const team = parts.slice(1).join(" ");
    if (["بنات", "بناتنا", "girls", "girl"].includes(team)) return "girls";
    if (["شباب", "الشباب", "boys", "boy"].includes(team)) return "boys";
  }
  return null;
}
function loungeActionFromGift(k0) {
  const key = normLiveText(k0);
  return LOUNGE_GIFT_ACTIONS.find((r) => r.names.includes(key)) || null;
}
function isLoungeJoinComment(t) { return LOUNGE_JOIN_COMMENTS.has(normLiveText(t)); }
function broadcastJoin(team, payload) {
  if (!team || !payload || !payload.name) return;
  const item = Object.assign({}, payload, { team });
  push(recent.joins, item, 12);
  broadcast("audience-join", item);
}

function connOptions(account) {
  const o = { processInitialData: true, enableExtendedGiftInfo: true };
  if (account.sessionId) { o.sessionId = account.sessionId; o.authenticateWs = true; }
  return o;
}

function startConnection(account) {
  const st = { status: "idle", fails: 0, lastErr: null, lastEventAt: null, timer: null };
  connections.set(account.username, st);
  const retry = (ms) => { if (st.timer) clearTimeout(st.timer); st.timer = setTimeout(connect, ms); };
  const classify = (msg) => {
    if (/isn't online|not live|live ended|room not found|stream ended/i.test(msg)) return "waiting";
    if (/business plan|sign|signature|euler/i.test(msg)) return "signblocked";
    return "retry";
  };
  const fail = (msg) => {
    st.lastErr = msg; st.fails += 1;
    const kind = classify(msg);
    if (kind === "waiting") {
      st.status = "waiting";
      if (st.fails % 15 === 1) console.log("⏳ [" + account.username + "] ليس في بث الآن — إعادة المحاولة بهدوء");
      retry(20000);
    } else if (kind === "signblocked") {
      st.status = "signblocked";
      if (st.fails % 10 === 1) {
        console.warn("🔒 [" + account.username + "] توقيع الطلبات مقيد حاليًا (سياسة TikTok/EulerStream) — إعادة المحاولة كل 60ث");
        console.warn("   خيار مجاني: استضف Signer خاصك وضع TIKTOK_SIGN_ENDPOINT في Railway");
      }
      retry(60000);
    } else {
      st.status = "retry";
      if (st.fails % 10 === 1) console.error("❌ [" + account.username + "] محاولة " + st.fails + ":", msg);
      retry(Math.min(60000, 8000 * st.fails));
    }
    broadcast("status", overallStatus());
  };

  async function connect() {
    if (st.status === "live") return;
    st.status = "connecting";
    try {
      const Conn = await loadConn();
      const conn = new Conn(account.username, connOptions(account));

      conn.connect().then(() => {
        st.status = "live"; st.fails = 0; st.lastErr = null;
        st.lastEventAt = new Date().toISOString();
        console.log("✅ TikTok LIVE متصل:", account.username, "عبر", ConnPkg);
        broadcast("status", overallStatus());
      }).catch((err) => fail(describeErr(err)));

      conn.on("follow", (d) => {
        const item = { account: account.username, name: d.nickname || d.uniqueId || "متابع", uniqueId: d.uniqueId || "", avatar: d.profilePictureUrl || "" };
        push(recent.follows, item, 10);
        broadcast("follow", item);
      });

      conn.on("gift", (d) => {
        const name = giftNameOf(d);
        if (!name) return;
        const count = Number(d.repeatCount || 1);
        const item = {
          account: account.username,
          name: d.nickname || d.uniqueId || "مشاهد",
          uniqueId: d.uniqueId || "",
          avatar: d.profilePictureUrl || "",
          gift: d.giftName || name, giftKey: name, count,
          diamonds: Number(d.diamondCount || 0) * count
        };
        bump(stats.gifts, item.uniqueId || item.name, item.diamonds);
        push(recent.gifts, item, 12);
        broadcast("gift", item);
        broadcastLeaderboardSoon();
        const lounge = loungeActionFromGift(name);
        if (lounge) broadcast("lounge-gift", Object.assign({}, item, { action: lounge.action, duration: lounge.duration }));
        broadcastJoin(audienceTeamFromGiftName(name), Object.assign({}, item, { source: "gift" }));
        if (COMMUNITY_GIFTS.has(name)) broadcast("community", item);
      });

      conn.on("like", (d) => { bump(stats.likes, d.uniqueId || d.nickname, d.likeCount || 1); broadcastLeaderboardSoon(); });
      conn.on("share", (d) => { bump(stats.shares, d.uniqueId || d.nickname, d.shareCount || 1); broadcastLeaderboardSoon(); });

      conn.on("chat", (d) => {
        const name = d.nickname || d.uniqueId || "مشاهد";
        const text = d.comment || d.message || d.content || "";
        bump(stats.chats, d.uniqueId || d.nickname, 1);
        const item = { account: account.username, name, uniqueId: d.uniqueId || "", avatar: d.profilePictureUrl || "", comment: text };
        push(recent.chats, item, 30);
        broadcast("chat", item);
        broadcastLeaderboardSoon();
        if (isLoungeJoinComment(text)) broadcast("lounge-join", Object.assign({}, item, { source: "comment" }));
        broadcastJoin(audienceTeamFromComment(text), Object.assign({}, item, { source: "comment" }));
      });

      conn.on("disconnected", () => {
        st.status = "waiting";
        console.warn("⚠️ انقطع الاتصال:", account.username);
        broadcast("status", overallStatus());
        retry(10000);
      });
      conn.on("error", (err) => {
        const msg = describeErr(err);
        st.lastErr = msg;
        if (st.fails % 10 === 0) console.error("⚠️ [" + account.username + "]:", msg);
      });
    } catch (e) {
      fail(describeErr(e));
    }
  }
  connect();
}
function audienceTeamFromGiftName(key0) {
  const key = normLiveText(key0);
  const g = normLiveText(process.env.AUDIENCE_GIRLS_GIFT || "");
  const b = normLiveText(process.env.AUDIENCE_BOYS_GIFT || "");
  if (g && key === g) return "girls";
  if (b && key === b) return "boys";
  return null;
}

export function attachLiveRoutes(app) {
  app.get("/live/events", (req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write("data: " + JSON.stringify({ type: "hello", payload: overallStatus() }) + "\n\n");
    res.write("data: " + JSON.stringify({ type: "leaderboard-update", payload: getLeaderboard() }) + "\n\n");
    res.write("data: " + JSON.stringify({ type: "recent-follows", payload: { follows: recent.follows } }) + "\n\n");
    res.write("data: " + JSON.stringify({ type: "recent-gifts", payload: { gifts: recent.gifts } }) + "\n\n");
    res.write("data: " + JSON.stringify({ type: "recent-joins", payload: { joins: recent.joins } }) + "\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
  });
  app.get("/live/status", (req, res) => res.json(overallStatus()));
  app.get("/live/leaderboard", (req, res) => res.json(Object.assign({ enabled: true }, getLeaderboard())));
  app.get("/live/recent-follows", (req, res) => res.json({ follows: recent.follows }));
  app.get("/live/recent-gifts", (req, res) => res.json({ gifts: recent.gifts }));
  app.get("/live/recent-chats", (req, res) => res.json({ chats: recent.chats }));
  app.get("/live/audience", (req, res) => res.json({ joins: recent.joins }));

  if (!ACCOUNTS.length) { console.warn("⚠️ لا توجد حسابات TikTok — طبقة الاستقبال معطلة"); return; }
  ACCOUNTS.forEach(startConnection);
  console.log("🎥 طبقة الاستقبال (مجانية):", ACCOUNTS.map((a) => a.username).join(" + "));
  console.log("🔓 وضع التوقيع:", process.env.TIKTOK_SIGN_API_KEY ? "مفتاح من البيئة" : (process.env.TIKTOK_SIGN_ENDPOINT ? "نقطة من البيئة" : "مجاني مجهول"));
}
