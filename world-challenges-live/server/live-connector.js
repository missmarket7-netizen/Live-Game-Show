/* ═══ طبقة استقبال TikTok LIVE — حسابان بالطريقة المجانية (بدون Sign API) ═══ */
import { createRequire } from "node:module";
const requireCJS = createRequire(import.meta.url);

let ConnClass = null;

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
  let mod = null;
  try { mod = requireCJS("tiktok-live-connector"); } catch (e) { mod = null; }
  if (!mod) { try { mod = await import("tiktok-live-connector"); } catch (e) { mod = null; } }
  const found = pick(mod);
  if (!found) {
    const desc = mod ? Object.keys(mod).map((k) => k + ":" + typeof mod[k]).join(", ") : "(لا يوجد module)";
    throw new Error("tiktok-live-connector: شكل تصدير غير معروف => " + desc);
  }
  ConnClass = found;
  console.log("✅ تم تحميل موصل تيك توك (فئة):", found.name || "anonymous");
  return ConnClass;
}

/* ═══ حسابان: عالم التحديات + تحدي مروان ═══ */
const ACCOUNTS = [
  { username: String(process.env.TIKTOK_USERNAME || "").trim(), sessionId: String(process.env.TIKTOK_SESSION_ID || "").trim() },
  { username: String(process.env.TIKTOK_USERNAME_2 || "").trim(), sessionId: String(process.env.TIKTOK_SESSION_ID_2 || "").trim() }
].filter((a) => a.username);

function normLiveText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "ا")
    .replace(/\s+/g, " ")
    .trim();
}

const AUDIENCE_PREFIX = normLiveText(process.env.AUDIENCE_JOIN_PREFIX || "انضم");
const AUDIENCE_GIRLS_COMMENT = normLiveText(process.env.AUDIENCE_GIRLS_COMMENT || "ملكة");
const AUDIENCE_BOYS_COMMENT = normLiveText(process.env.AUDIENCE_BOYS_COMMENT || "ملك");

const LOUNGE_JOIN_COMMENTS = new Set(["good live", "عالم التحديات", "تحدي مروان", "قدها"].map(normLiveText));
const LOUNGE_GIFT_ACTIONS = [
  { action: "CHEER", duration: 2600, names: ["قلب صغير", "small heart"] },
  { action: "DANCE", duration: 6200, names: ["قلب", "heart"] },
  { action: "FLIP_DANCE", duration: 7800, names: ["الدونتس", "دونتس", "donut"] },
  { action: "ZERO_GRAVITY", duration: 11000, names: ["كورجي", "corgi"] }
].map((rule) => ({ ...rule, names: rule.names.map(normLiveText) }));

const LIVE_CONFIG = {
  autoReconnect: true,
  communityGiftNames: new Set(["love you", "love me", "أحبك", "أحبني"]),
  enableStats: true
};

const clients = new Set();
const connections = new Map();
const stats = { likes: new Map(), shares: new Map(), chats: new Map(), gifts: new Map() };
const recentFollows = [];
const recentGifts = [];
let lastEventAt = null;

function overallStatus() {
  const accounts = ACCOUNTS.map((a) => {
    const c = connections.get(a.username);
    return c
      ? { username: a.username, connected: c.connected, error: c.error, lastEventAt: c.lastEventAt }
      : { username: a.username, connected: false, error: "لم يبدأ" };
  });
  return {
    connected: accounts.some((a) => a.connected),
    accounts,
    lastEventAt,
    error: (accounts.find((a) => a.error) || {}).error || null,
    mode: "free-no-sign-api"
  };
}

function broadcast(type, payload) {
  lastEventAt = new Date().toISOString();
  const data = JSON.stringify({ type, payload: Object.assign({}, payload, { ts: Date.now() }) });
  for (const res of clients) {
    try { res.write("data: " + data + "\n\n"); } catch (e) {}
  }
}

function giftNameOf(d) {
  return String(d.giftName || (d.gift && d.gift.name) || "").trim().toLowerCase();
}

function bump(map, key, n) {
  if (key) map.set(key, (map.get(key) || 0) + n);
}

function audienceTeamFromComment(comment) {
  const text = normLiveText(comment);
  if (!text) return null;
  if (text === "ملكة") return "girls";
  if (text === "ملك") return "boys";
  const parts = text.split(" ");
  if (AUDIENCE_PREFIX && parts[0] === AUDIENCE_PREFIX) {
    const team = parts.slice(1).join(" ");
    if (["بنات", "girls"].includes(team)) return "girls";
    if (["شباب", "boys"].includes(team)) return "boys";
  }
  return null;
}

function loungeActionFromGift(giftKey) {
  const key = normLiveText(giftKey);
  return LOUNGE_GIFT_ACTIONS.find((rule) => rule.names.includes(key)) || null;
}

function isLoungeJoinComment(comment) {
  return LOUNGE_JOIN_COMMENTS.has(normLiveText(comment));
}

function getLeaderboard() {
  const top = (m) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
  return { likes: top(stats.likes), shares: top(stats.shares), chats: top(stats.chats), gifts: top(stats.gifts) };
}

/* ═══ خيارات اتصال: مجانية تمامًا بدون Sign API ═══ */
function connOptions(account) {
  const opts = {
    processInitialData: false,
    enableExtendedGiftInfo: true
  };
  if (account.sessionId) {
    opts.sessionId = account.sessionId;
    opts.authenticateWs = true;
  }
  return opts;
}

function startConnection(account) {
  const st = { connected: false, error: null, lastEventAt: null, fails: 0, stopped: false };
  connections.set(account.username, st);

  const schedule = (extraMs) => {
    if (!LIVE_CONFIG.autoReconnect || st.stopped) return;
    st.fails += 1;
    const base = Math.min(60000, 8000 * st.fails);
    setTimeout(connect, base + (extraMs || 0));
  };

  const fail = (msg, extraMs) => {
    st.connected = false;
    st.error = msg;
    // تسجيل فقط كل 10 محاولات لتجنب إغراق الـ logs
    if (st.fails % 10 === 1) {
      console.error("❌ [" + account.username + "] محاولة " + (st.fails + 1) + ":", msg);
    }
    broadcast("status", overallStatus());
    schedule(extraMs);
  };

  async function connect() {
    if (st.stopped) return;
    try {
      const Conn = await loadConn();
      const options = connOptions(account);
      const conn = new Conn(account.username, options);

      conn.connect()
        .then(() => {
          st.connected = true;
          st.error = null;
          st.fails = 0;
          st.lastEventAt = new Date().toISOString();
          console.log("✅ TikTok LIVE متصل:", account.username);
          broadcast("status", overallStatus());
        })
        .catch((err) => {
          const msg = String((err && err.message) || err);
          
          /* حالة 1: الحساب ليس في وضع البث — انتظار هادئ */
          if (/isn't online|not live|live ended/i.test(msg)) {
            if (st.fails % 15 === 0) {
              console.log("⏳ [" + account.username + "] في انتظار بدء البث...");
            }
            st.error = "في انتظار البث";
            st.fails += 1;
            broadcast("status", overallStatus());
            schedule(20000); // إعادة كل 20 ثانية
            return;
          }
          
          /* حالة 2: يتطلب Sign API مدفوع — تعطيل الحساب نهائيًا */
          if (/Business plan|requires.*plan|Euler|Sign.*API/i.test(msg)) {
            console.warn("⛔ [" + account.username + "] يتطلب Sign API مدفوع — تم تعطيله لتجنب الأخطاء");
            st.error = "يتطلب Sign API (معطّل)";
            st.stopped = true;
            broadcast("status", overallStatus());
            return;
          }
          
          /* حالة 3: أخطاء أخرى — إعادة محاولة عادية */
          fail(msg);
        });

      /* ═══ متابعة الأحداث ═══ */
      conn.on("follow", (d) => {
        const data = {
          account: account.username,
          name: d.nickname || d.uniqueId || "متابع",
          uniqueId: d.uniqueId || "",
          avatar: d.profilePictureUrl || ""
        };
        broadcast("follow", data);
        recentFollows.unshift(data);
        if (recentFollows.length > 10) recentFollows.pop();
        broadcast("recent-follows", { follows: recentFollows });
      });

      conn.on("gift", (d) => {
        const name = giftNameOf(d);
        if (!name) return;
        const k = d.uniqueId || d.nickname;
        const count = Number(d.repeatCount || 1);
        if (LIVE_CONFIG.enableStats) bump(stats.gifts, k, Number(d.diamondCount || 0) * count);

        const giftPayload = {
          account: account.username,
          name: d.nickname || d.uniqueId || "مشاهد",
          uniqueId: d.uniqueId || "",
          avatar: d.profilePictureUrl || "",
          gift: d.giftName || name,
          count,
          diamonds: Number(d.diamondCount || 0) * count
        };

        broadcast("gift", giftPayload);
        recentGifts.unshift(giftPayload);
        if (recentGifts.length > 10) recentGifts.pop();
        broadcast("recent-gifts", { gifts: recentGifts });

        const loungeRule = loungeActionFromGift(name);
        if (loungeRule) {
          broadcast("lounge-gift", Object.assign({}, giftPayload, { action: loungeRule.action, duration: loungeRule.duration }));
        }

        if (LIVE_CONFIG.communityGiftNames.has(name)) {
          broadcast("community", {
            account: account.username,
            name: d.nickname || d.uniqueId || "متابع",
            gift: d.giftName || name,
            count: d.repeatCount || 1
          });
        }
      });

      if (LIVE_CONFIG.enableStats) {
        conn.on("like", (d) => {
          bump(stats.likes, d.uniqueId || d.nickname, d.likeCount || 1);
          broadcast("leaderboard-update", getLeaderboard());
        });

        conn.on("share", (d) => {
          bump(stats.shares, d.uniqueId || d.nickname, d.shareCount || 1);
          broadcast("leaderboard-update", getLeaderboard());
        });

        conn.on("chat", (d) => {
          const chatName = d.nickname || d.uniqueId || "مشاهد";
          const chatText = d.comment || d.message || "";
          bump(stats.chats, d.uniqueId || d.nickname, 1);

          broadcast("chat", {
            account: account.username,
            name: chatName,
            uniqueId: d.uniqueId || "",
            comment: chatText
          });

          if (isLoungeJoinComment(chatText)) {
            broadcast("lounge-join", {
              account: account.username,
              name: chatName,
              comment: chatText
            });
          }

          const team = audienceTeamFromComment(chatText);
          if (team) {
            broadcast("audience-join", {
              account: account.username,
              name: chatName,
              team,
              source: "comment"
            });
          }
        });
      }

      conn.on("disconnected", () => {
        st.connected = false;
        console.warn("⚠️ انقطع الاتصال:", account.username);
        broadcast("status", overallStatus());
        schedule();
      });

      conn.on("error", (err) => {
        if (st.fails % 10 === 0) {
          console.error("⚠️ [" + account.username + "]:", String((err && err.message) || err));
        }
      });

    } catch (e) {
      fail(String((e && e.message) || e));
    }
  }

  connect();
}

export function attachLiveRoutes(app) {
  /* ═══ SSE endpoint ═══ */
  app.get("/live/events", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    res.write("data: " + JSON.stringify({ type: "hello", payload: overallStatus() }) + "\n\n");
    res.write("data: " + JSON.stringify({ type: "leaderboard-update", payload: getLeaderboard() }) + "\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
  });

  app.get("/live/status", (req, res) => res.json(overallStatus()));
  app.get("/live/leaderboard", (req, res) => res.json(Object.assign({ enabled: LIVE_CONFIG.enableStats }, getLeaderboard())));
  app.get("/live/recent-follows", (req, res) => res.json({ follows: recentFollows }));
  app.get("/live/recent-gifts", (req, res) => res.json({ gifts: recentGifts }));

  if (!ACCOUNTS.length) {
    console.warn("⚠️ لا توجد حسابات TikTok — طبقة الاستقبال معطلة");
    return;
  }

  ACCOUNTS.forEach(startConnection);
  console.log("🎥 طبقة الاستقبال (مجانية):", ACCOUNTS.map((a) => a.username).join(" + "));
  console.log("🔓 الوضع: بدون Sign API — الاعتماد على الطرق المجانية فقط");
}
