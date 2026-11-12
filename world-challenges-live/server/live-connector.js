/* ═══ طبقة استقبال TikTok LIVE — إنتاجية بالكامل (بدون Sign API) ═══ */
import * as PirateTok from "piratetok-live-js";

// استخراج فئة الاتصال بشكل آمن يدعم جميع إصدارات piratetok-live-js
const ConnectionClass = 
  PirateTok.TikTokLiveConnection || 
  PirateTok.WebcastPushConnection || 
  PirateTok.default || 
  PirateTok;

if (!ConnectionClass || typeof ConnectionClass !== "function") {
  console.error("❌ [LIVE] فئة الاتصال TikTokLiveConnection غير متوفرة في piratetok-live-js. تأكد من التثبيت.");
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
    eulerKeyConfigured: false,
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
    } catch (e) {
      // العميل أغلق الاتصال
    }
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

function startConnection(account) {
  const st = { connected: false, error: null, lastEventAt: null, fails: 0, stopped: false, offlineTimer: null };
  connections.set(account.username, st);

  // إعادة المحاولة بذكاء مع تصاعد الوقت (Exponential Backoff) لتجنب حظر السيرفر
  const schedule = (delayMs) => {
    if (!LIVE_CONFIG.autoReconnect || st.stopped) return;
    st.fails += 1;
    const backoff = Math.min(60000, 5000 * st.fails); // بحد أقصى دقيقة
    const jitter = Math.random() * 3000;
    setTimeout(connect, delayMs || (backoff + jitter));
  };

  const fail = (msg, isOffline = false) => {
    st.connected = false;
    st.error = msg;
    
    if (isOffline) {
      st.fails = 0; // تصفير العداد لأن المذيع أوقف البث فقط
      if (st.offlineTimer) clearTimeout(st.offlineTimer);
      // إعادة الفحص كل 45 ثانية إذا كان المذيع غير متصل
      st.offlineTimer = setTimeout(connect, 45000); 
    } else {
      schedule();
    }
    
    if (st.fails % 5 === 1 || isOffline) {
      console.error(`❌ [${account.username}] ${msg}`);
    }
    
    broadcast("status", overallStatus());
  };

  async function connect() {
    if (st.stopped) return;
    if (!ConnectionClass) return fail("مكتبة piratetok-live-js غير محملة");
    
    try {
      // إعدادات الاتصال السريع والآمن بدون طلبات زائدة
      const options = {
        enableExtendedGiftInfo: true,
        processInitialData: false,
        fetchRoomInfoOnConnect: false,
      };

      if (account.sessionId) {
        options.sessionId = account.sessionId;
        options.authenticateWs = true;
      }

      const conn = new ConnectionClass(account.username, options);

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
        .catch((err) => {
          const msg = String((err && err.message) || err);
          if (msg.includes("isn't online") || msg.includes("is not online")) {
            fail("المذيع غير متصل حالياً (البث مغلق)", true);
          } else {
            fail(msg, false);
          }
        });

      conn.on("follow", (d) => {
        const followData = {
          account: account.username,
          name: d.nickname || d.uniqueId || "متابع",
          uniqueId: d.uniqueId || "",
          avatar: d.profilePictureUrl || "",
        };
        broadcast("follow", followData);
        
        recentFollows.unshift(followData);
        if (recentFollows.length > 10) recentFollows.pop();
        broadcast("recent-follows", { follows: recentFollows });
      });

      // دعم حدث social لمنع تفويت أي متابعات
      conn.on("social", (d) => {
        if (d.displayType && d.displayType.includes("follow")) {
          const followData = {
            account: account.username,
            name: d.nickname || d.uniqueId || "متابع",
            uniqueId: d.uniqueId || "",
            avatar: d.profilePictureUrl || "",
          };
          broadcast("follow", followData);
          recentFollows.unshift(followData);
          if (recentFollows.length > 10) recentFollows.pop();
          broadcast("recent-follows", { follows: recentFollows });
        }
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
          giftKey: name,
          count,
          diamonds: Number(d.diamondCount || 0) * count,
        };

        broadcast("gift", giftPayload);
        
        recentGifts.unshift(giftPayload);
        if (recentGifts.length > 10) recentGifts.pop();
        broadcast("recent-gifts", { gifts: recentGifts });

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

function getLeaderboard() {
  const top = (m) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
  return {
    likes: top(stats.likes),
    shares: top(stats.shares),
    chats: top(stats.chats),
    gifts: top(stats.gifts),
  };
}

export function attachLiveRoutes(app) {
  app.get("/live/events", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("data: " + JSON.stringify({ type: "hello", payload: overallStatus() }) + "\n\n");
    res.write("data: " + JSON.stringify({ type: "leaderboard-update", payload: getLeaderboard() }) + "\n\n");
    res.write("data: " + JSON.stringify({ type: "recent-follows", payload: { follows: recentFollows } }) + "\n\n");
    res.write("data: " + JSON.stringify({ type: "recent-gifts", payload: { gifts: recentGifts } }) + "\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
  });

  app.get("/live/status", (req, res) => res.json(overallStatus()));

  app.get("/live/leaderboard", (req, res) => {
    res.json({
      enabled: LIVE_CONFIG.enableStats,
      ...getLeaderboard(),
    });
  });

  app.get("/live/recent-follows", (req, res) => {
    res.json({ follows: recentFollows });
  });

  app.get("/live/recent-gifts", (req, res) => {
    res.json({ gifts: recentGifts });
  });

  if (!ACCOUNTS.length) {
    console.warn("⚠️ لا يوجد TIKTOK_USERNAME / TIKTOK_USERNAME_2 — طبقة الاستقبال معطلة");
    return;
  }

  ACCOUNTS.forEach(startConnection);
  console.log("🎥 طبقة الاستقبال: حسابات مفعّلة =", ACCOUNTS.map((a) => a.username).join(" , "));
  console.log("🔓 استخدام الطرق المجانية (بدون Sign API)");
}
