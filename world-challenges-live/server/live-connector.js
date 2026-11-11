/* ═══ طبقة استقبال TikTok LIVE — حسابين + Euler API Key + SSE ═══ */
import { createRequire } from "node:module";
const requireCJS = createRequire(import.meta.url);

let WebcastPushConnection = null;
let SignConfigRef = null;
let eulerConfigured = false;

/* بصمة هيكلية: أي فئة تملك connect + on على الـ prototype هي الموصل */
function isConnector(x) {
  return typeof x === "function" && x.prototype && typeof x.prototype.connect === "function" && typeof x.prototype.on === "function";
}

function pickConn(mod) {
  if (!mod) return null;
  if (isConnector(mod.WebcastPushConnection)) return mod.WebcastPushConnection;
  for (const k of Object.keys(mod)) {
    if (isConnector(mod[k])) return mod[k];
  }
  if (isConnector(mod.default)) return mod.default;
  if (mod.default && typeof mod.default === "object") {
    for (const k of Object.keys(mod.default)) {
      if (isConnector(mod.default[k])) return mod.default[k];
    }
  }
  return null;
}

function pickSignConfig(mod) {
  if (!mod) return null;
  if (mod.SignConfig && typeof mod.SignConfig === "object") return mod.SignConfig;
  if (mod.default && mod.default.SignConfig && typeof mod.default.SignConfig === "object") return mod.default.SignConfig;
  return null;
}

function applyEulerConfig(mod) {
  if (eulerConfigured) return;
  const key = String(process.env.EULER_API_KEY || process.env.SIGN_API_KEY || process.env.EULERSTREAM_API_KEY || "").trim();
  if (!key) {
    console.warn("⚠️ لا يوجد EULER_API_KEY — سيتم الاعتماد على مسار التوقيع الافتراضي (قد يفشل على بعض الخطط)");
    eulerConfigured = true;
    return;
  }

  SignConfigRef = pickSignConfig(mod);
  if (SignConfigRef) {
    try {
      SignConfigRef.apiKey = key;
      if (SignConfigRef.baseOptions && typeof SignConfigRef.baseOptions === "object") {
        SignConfigRef.baseOptions.headers = Object.assign({}, SignConfigRef.baseOptions.headers || {}, {
          "x-api-key": key,
        });
      }
      console.log("✅ تم ضبط Euler SignConfig.apiKey من متغيرات البيئة");
    } catch (e) {
      console.warn("⚠️ تعذر كتابة SignConfig.apiKey:", e && e.message ? e.message : e);
    }
  } else {
    console.warn("⚠️ المكتبة لا تصدّر SignConfig — سيتم تمرير signApiKey في خيارات الاتصال فقط");
  }
  eulerConfigured = true;
}

async function loadConnector() {
  if (WebcastPushConnection) return WebcastPushConnection;
  let mod = null;
  let lastErr = null;
  try {
    mod = await import("tiktok-live-connector");
  } catch (e) {
    lastErr = e;
  }
  let found = pickConn(mod);
  if (!found) {
    try {
      const cjs = requireCJS("tiktok-live-connector");
      found = pickConn(cjs);
      if (!mod) mod = cjs;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!found) {
    const desc = mod ? Object.keys(mod).map((k) => k + ":" + typeof mod[k]).join(", ") : "(لا يوجد module)";
    throw new Error("tiktok-live-connector: شكل تصدير غير معروف | exports => " + desc + (lastErr ? " | err: " + lastErr.message : ""));
  }
  applyEulerConfig(mod);
  WebcastPushConnection = found;
  console.log("✅ تم تحميل موصل تيك توك (فئة):", found.name || "anonymous");
  return found;
}

const ACCOUNTS = [
  { username: String(process.env.TIKTOK_USERNAME || "").trim(), sessionId: String(process.env.TIKTOK_SESSION_ID || "").trim() },
  { username: String(process.env.TIKTOK_USERNAME_2 || "").trim(), sessionId: String(process.env.TIKTOK_SESSION_ID_2 || "").trim() },
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
const AUDIENCE_GIRLS_GIFT = normLiveText(process.env.AUDIENCE_GIRLS_GIFT || "");
const AUDIENCE_BOYS_GIFT = normLiveText(process.env.AUDIENCE_BOYS_GIFT || "");

const LOUNGE_JOIN_COMMENTS = new Set(["good live", "عالم التحديات", "تحدي مروان", "قدها"].map(normLiveText));
const LOUNGE_GIFT_ACTIONS = [
  { action: "CHEER", duration: 2600, names: ["قلب صغير", "small heart", "heart me"] },
  { action: "COMEDY", duration: 3200, names: ["كرة بتدور", "كرة تدور", "spinning ball", "ball"] },
  { action: "DANCE", duration: 6200, names: ["قلب", "heart"] },
  { action: "RUN_CHAOS", duration: 7200, names: ["العطر", "عطر", "perfume"] },
  { action: "FLIP_DANCE", duration: 7800, names: ["الدونتس", "دونتس", "donut", "doughnut"] },
  { action: "SOLO_DANCE", duration: 9000, names: ["قلب بايدي", "قلب بيدي", "heart hands", "hands heart"] },
  { action: "ZERO_GRAVITY", duration: 11000, names: ["كورجي", "corgi"] },
].map((rule) => ({ ...rule, names: rule.names.map(normLiveText) }));

const LIVE_CONFIG = {
  autoReconnect: true,
  communityGiftNames: new Set(["love you", "love me", "أحبك", "أحبني", "love"]),
  enableStats: true,
};

const clients = new Set();
const connections = new Map();
const stats = { likes: new Map(), shares: new Map(), chats: new Map(), gifts: new Map() };
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
    eulerKeyConfigured: Boolean(String(process.env.EULER_API_KEY || process.env.SIGN_API_KEY || process.env.EULERSTREAM_API_KEY || "").trim()),
    audienceImport: {
      commentPrefix: Boolean(AUDIENCE_PREFIX),
      girlsComment: Boolean(AUDIENCE_GIRLS_COMMENT),
      boysComment: Boolean(AUDIENCE_BOYS_COMMENT),
      girlsGift: Boolean(AUDIENCE_GIRLS_GIFT),
      boysGift: Boolean(AUDIENCE_BOYS_GIFT),
    },
  };
}

function broadcast(type, payload) {
  lastEventAt = new Date().toISOString();
  const data = JSON.stringify({ type, payload: Object.assign({}, payload, { ts: Date.now() }) });
  for (const res of clients) {
    try {
      res.write("data: " + data + "\n\n");
    } catch (e) {}
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

function audienceTeamFromGift(giftKey) {
  const key = normLiveText(giftKey);
  if (AUDIENCE_GIRLS_GIFT && key === AUDIENCE_GIRLS_GIFT) return "girls";
  if (AUDIENCE_BOYS_GIFT && key === AUDIENCE_BOYS_GIFT) return "boys";
  return null;
}

function loungeActionFromGift(giftKey) {
  const key = normLiveText(giftKey);
  return LOUNGE_GIFT_ACTIONS.find((rule) => rule.names.includes(key)) || null;
}

function isLoungeJoinComment(comment) {
  return LOUNGE_JOIN_COMMENTS.has(normLiveText(comment));
}

function broadcastAudienceJoin(team, payload) {
  if (!team || !payload || !payload.name) return;
  broadcast("audience-join", Object.assign({}, payload, { team }));
}

function buildConnOptions(account) {
  const eulerKey = String(process.env.EULER_API_KEY || process.env.SIGN_API_KEY || process.env.EULERSTREAM_API_KEY || "").trim();
  const options = {
    enableExtendedGiftInfo: true,
    processInitialData: true,
  };

  if (account.sessionId) {
    options.sessionId = account.sessionId;
    options.authenticateWs = true;
  }

  if (eulerKey) {
    options.signApiKey = eulerKey;
  }

  return options;
}

function startConnection(account) {
  const st = { connected: false, error: null, lastEventAt: null, fails: 0, stopped: false };
  connections.set(account.username, st);

  const schedule = () => {
    if (!LIVE_CONFIG.autoReconnect || st.stopped) return;
    st.fails += 1;
    setTimeout(connect, Math.min(60000, 6000 * st.fails));
  };

  const fail = (msg) => {
    st.connected = false;
    st.error = msg;
    st.fails += 1;
    if (st.fails % 5 === 1) console.error("❌ [" + account.username + "] محاولة " + st.fails + ":", msg);
    broadcast("status", overallStatus());
    schedule();
  };

  async function connect() {
    if (st.stopped) return;
    try {
      const Conn = await loadConnector();
      const options = buildConnOptions(account);
      const conn = new Conn(account.username, options);

      conn
        .connect()
        .then(() => {
          st.connected = true;
          st.error = null;
          st.fails = 0;
          st.lastEventAt = new Date().toISOString();
          console.log("✅ TikTok LIVE متصل:", account.username);
          broadcast("status", overallStatus());
        })
        .catch((err) => fail(String((err && err.message) || err)));

      /* متابعة */
      conn.on("follow", (d) =>
        broadcast("follow", {
          account: account.username,
          name: d.nickname || d.uniqueId || "متابع",
          uniqueId: d.uniqueId || "",
          avatar: d.profilePictureUrl || "",
        })
      );

      /* هدايا */
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
          giftKey: name,
          count,
          diamonds: Number(d.diamondCount || 0) * count,
        };

        broadcast("gift", giftPayload);

        const loungeRule = loungeActionFromGift(name);
        if (loungeRule) {
          broadcast("lounge-gift", Object.assign({}, giftPayload, { action: loungeRule.action, duration: loungeRule.duration }));
        }

        broadcastAudienceJoin(audienceTeamFromGift(name), Object.assign({}, giftPayload, { source: "gift" }));

        if (LIVE_CONFIG.communityGiftNames.has(name)) {
          broadcast("community", {
            account: account.username,
            name: d.nickname || d.uniqueId || "متابع",
            uniqueId: d.uniqueId || "",
            avatar: d.profilePictureUrl || "",
            gift: d.giftName || name,
            count: d.repeatCount || 1,
          });
        }
      });

      if (LIVE_CONFIG.enableStats) {
        /* إعجابات */
        conn.on("like", (d) => bump(stats.likes, d.uniqueId || d.nickname, d.likeCount || 1));

        /* مشاركة */
        conn.on("share", (d) => bump(stats.shares, d.uniqueId || d.nickname, d.shareCount || 1));

        /* تعليقات + دخول الجمهور / الاستراحة */
        conn.on("chat", (d) => {
          const chatName = d.nickname || d.uniqueId || "مشاهد";
          const chatText = d.comment || d.message || d.content || "";
          bump(stats.chats, d.uniqueId || d.nickname, 1);

          broadcast("chat", {
            account: account.username,
            name: chatName,
            uniqueId: d.uniqueId || "",
            avatar: d.profilePictureUrl || "",
            comment: chatText,
          });

          if (isLoungeJoinComment(chatText)) {
            broadcast("lounge-join", {
              account: account.username,
              name: chatName,
              uniqueId: d.uniqueId || "",
              avatar: d.profilePictureUrl || "",
              comment: chatText,
              source: "comment",
            });
          }

          broadcastAudienceJoin(audienceTeamFromComment(chatText), {
            account: account.username,
            name: chatName,
            uniqueId: d.uniqueId || "",
            avatar: d.profilePictureUrl || "",
            comment: chatText,
            source: "comment",
          });
        });
      }

      conn.on("disconnected", () => {
        st.connected = false;
        console.warn("⚠️ انقطع الاتصال:", account.username);
        broadcast("status", overallStatus());
        schedule();
      });

      conn.on("error", (err) => {
        const msg = String((err && err.message) || err || "خطأ غير معروف");
        if (st.fails % 5 === 0) console.error("⚠️ خطأ موصل [" + account.username + "]:", msg);
      });
    } catch (e) {
      fail(String((e && e.message) || e));
    }
  }

  connect();
}

export function attachLiveRoutes(app) {
  app.get("/live/events", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("data: " + JSON.stringify({ type: "hello", payload: overallStatus() }) + "\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
  });

  app.get("/live/status", (req, res) => res.json(overallStatus()));

  app.get("/live/leaderboard", (req, res) => {
    const top = (m) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));
    res.json({
      enabled: LIVE_CONFIG.enableStats,
      likes: top(stats.likes),
      shares: top(stats.shares),
      chats: top(stats.chats),
      gifts: top(stats.gifts),
    });
  });

  if (!ACCOUNTS.length) {
    console.warn("⚠️ لا يوجد TIKTOK_USERNAME / TIKTOK_USERNAME_2 — طبقة الاستقبال معطلة");
    return;
  }

  ACCOUNTS.forEach(startConnection);
  console.log("🎥 طبقة الاستقبال: حسابات مفعّلة =", ACCOUNTS.map((a) => a.username).join(" , "));
  console.log(
    "🔑 Euler key:",
    String(process.env.EULER_API_KEY || process.env.SIGN_API_KEY || process.env.EULERSTREAM_API_KEY || "").trim() ? "مضبوط" : "غير مضبوط"
  );
}
