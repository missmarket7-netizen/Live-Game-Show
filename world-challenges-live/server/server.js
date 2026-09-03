import "dotenv/config";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use((req, res, next) => { if (req.body === undefined) req.body = {}; next(); });
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "../public")));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "questions")
  : path.join(__dirname, "questions");

/* ═══════════ Turso: الحفظ الدائم ═══════════ */
const TURSO_URL = process.env.TURSO_URL || process.env.TURSO_DATABASE_URL || "";
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || process.env.TURSO_TOKEN || "";
const turso = (TURSO_URL && TURSO_TOKEN) ? createClient({ url: TURSO_URL, authToken: TURSO_TOKEN }) : null;

async function initTurso() {
  if (!turso) { console.warn("⚠️ متغيرات Turso غير موجودة — العمل بالنظام المحلي المؤقت."); return; }
  try {
    await turso.batch([
      `CREATE TABLE IF NOT EXISTS game_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        cursor INTEGER NOT NULL DEFAULT 0,
        cycle_id INTEGER NOT NULL DEFAULT 1,
        shuffle_order TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS generated_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT, difficulty TEXT, question TEXT UNIQUE,
        options TEXT, correctIndex INTEGER, explanation TEXT,
        source TEXT DEFAULT 'ai', created_at TEXT
      )`,
      `INSERT OR IGNORE INTO game_state (id, cursor, cycle_id, shuffle_order) VALUES (1, 0, 1, '[]')`
    ], "write");
    console.log("✅ Turso متصل — الحفظ دائم والمؤشر مشترك.");
  } catch (e) { console.error("Turso init error:", e.message); }
}

async function getState() {
  if (!turso) return null;
  const r = await turso.execute("SELECT cursor, cycle_id, shuffle_order FROM game_state WHERE id = 1");
  if (!r.rows.length) return { cursor: 0, cycle_id: 1, shuffle_order: [] };
  const row = r.rows[0];
  let order = [];
  try { order = JSON.parse(row.shuffle_order || "[]"); } catch (e) {}
  return { cursor: Number(row.cursor) || 0, cycle_id: Number(row.cycle_id) || 1, shuffle_order: order };
}

async function setState(cursor, cycleId, order) {
  if (!turso) return;
  await turso.execute({
    sql: "UPDATE game_state SET cursor = ?, cycle_id = ?, shuffle_order = ?, updated_at = ? WHERE id = 1",
    args: [cursor, cycleId, JSON.stringify(order), new Date().toISOString()]
  });
}

async function loadGeneratedFromTurso() {
  if (!turso) return [];
  try {
    const r = await turso.execute("SELECT category, difficulty, question, options, correctIndex, explanation, source FROM generated_questions");
    return r.rows.map((row) => ({
      category: row.category, difficulty: row.difficulty, question: row.question,
      options: JSON.parse(row.options), correctIndex: Number(row.correctIndex),
      explanation: row.explanation, source: row.source || "ai"
    }));
  } catch (e) { return []; }
}

async function saveGeneratedToTurso(questions) {
  if (!turso) return;
  for (const q of questions) {
    try {
      await turso.execute({
        sql: "INSERT OR IGNORE INTO generated_questions (category, difficulty, question, options, correctIndex, explanation, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        args: [q.category || "معلومات عامة", q.difficulty || "متوسط", String(q.question).trim(),
          JSON.stringify(q.options), q.correctIndex, q.explanation || "", q.source || "ai", new Date().toISOString()]
      });
    } catch (e) {}
  }
}

/* ═══════════ أدوات ═══════════ */
function normalizeText(text) {
  return String(text || "").toLowerCase()
    .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
    .replace(/[^\u0621-\u064Aa-z0-9]/g, "").trim();
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* تنظيف المفاتيح والقيم من المسافات الزائدة (يعالج db1→db5) */
function sanitizeQuestion(raw) {
  if (!raw || typeof raw !== "object") return null;
  const q = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).trim();
    q[key] = typeof v === "string" ? String(v).trim() : v;
  }
  if (!q.question || typeof q.question !== "string" || !q.question.trim()) return null;
  if (!Array.isArray(q.options) || q.options.length < 2) return null;
  q.question = q.question.trim();
  q.options = q.options.map((o) => String(o).trim()).slice(0, 4);
  q.correctIndex = Math.max(0, Math.min(q.options.length - 1, Number(q.correctIndex) || 0));
  q.category = String(q.category || "معلومات عامة").trim();
  q.difficulty = String(q.difficulty || "متوسط").trim();
  q.explanation = String(q.explanation || "").trim();
  return q;
}

/* تحميل db*.json من كل المسارات المحتملة */
function loadBankQuestions() {
  const dirs = [
    DATA_DIR,
    path.join(__dirname, "questions"),
    path.join(__dirname, "..", "questions"),
    path.join(__dirname, "..")
  ];
  let all = [];
  const loaded = new Set();
  for (const dir of dirs) {
    let files = [];
    try {
      files = fs.readdirSync(dir)
        .filter((f) => /^db\d+\.json$/.test(f))
        .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
    } catch (e) { continue; }
    for (const f of files) {
      if (loaded.has(f)) continue;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        if (Array.isArray(data)) {
          const clean = data.map(sanitizeQuestion).filter(Boolean);
          if (clean.length) {
            loaded.add(f);
            all = all.concat(clean);
            console.log("📚 " + f + " → " + clean.length + " سؤال");
          }
        }
      } catch (e) { console.error("⚠️ تعذر قراءة " + f + ": " + e.message); }
    }
  }
  return all;
}

function loadGeneratedFromFile() {
  try {
    const p = path.join(DATA_DIR, "generated_questions.json");
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      if (Array.isArray(data)) return data.map(sanitizeQuestion).filter(Boolean);
    }
  } catch (e) {}
  return [];
}

function saveGeneratedToFile(questions) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const existing = loadGeneratedFromFile();
    const merged = [...questions, ...existing].slice(0, 5000);
    fs.writeFileSync(path.join(DATA_DIR, "generated_questions.json"), JSON.stringify(merged, null, 2), "utf8");
  } catch (e) { console.error("خطأ في الحفظ المحلي:", e.message); }
}

/* البنك الكامل بدون تكرار */
async function getAllQuestions() {
  const bank = loadBankQuestions();
  const fromTurso = await loadGeneratedFromTurso();
  const fromFile = loadGeneratedFromFile();
  const seen = new Set();
  const all = [];
  for (const q of bank.concat(fromTurso, fromFile)) {
    if (!q || !q.question) continue;
    const key = normalizeText(q.question);
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(q);
  }
  return all;
}

function buildSystemPrompt(count, category, difficulty) {
  return `أنت مولد أسئلة لمسابقة عربية مباشرة اسمها "عالم التحديات".
قواعد صارمة:
- اخرج JSON فقط بدون أي نص قبل أو بعد
- مصفوفة JSON تحتوي على ${count} كائنات
- كل كائن: category, difficulty, question, options (4 خيارات), correctIndex (0-3), explanation
- الفئة: ${category || "معلومات عامة"} — المستوى: ${difficulty || "متوسط"}
- نوّع ولا تكرر وتأكد من صحة المعلومات`;
}

function extractAndParseJSON(rawText) {
  if (!rawText || typeof rawText !== "string") throw new Error("الرد فارغ");
  const cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, " ").trim();
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) { try { return JSON.parse(arrayMatch[0]); } catch (e) {} }
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) { try { return JSON.parse(objectMatch[0]); } catch (e) {} }
  try { return JSON.parse(cleaned); } catch (e) {}
  throw new Error("تعذر تحليل JSON: " + rawText.slice(0, 200));
}

const PROVIDERS = [
  {
    name: "gemini", key: GEMINI_API_KEY,
    call: async (prompt) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await fetch(url, {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9, maxOutputTokens: 4000 } })
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error("Gemini HTTP " + res.status);
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (!text) throw new Error("Gemini بدون نص");
        return text;
      } catch (err) { clearTimeout(timeout); throw err; }
    }
  },
  {
    name: "openrouter", key: OPENROUTER_API_KEY,
    call: async (prompt) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST", signal: controller.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENROUTER_API_KEY}`, "HTTP-Referer": "https://live-game-show.app", "X-Title": "Live Game Show" },
          body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || "minimax/minimax-m2.7:free", messages: [{ role: "user", content: prompt }], temperature: 0.9, max_tokens: 4000 })
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error("OpenRouter HTTP " + res.status);
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content || "";
        if (!content) throw new Error("OpenRouter بدون نص");
        return content;
      } catch (err) { clearTimeout(timeout); throw err; }
    }
  },
  {
    name: "groq", key: GROQ_API_KEY,
    call: async (prompt) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST", signal: controller.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
          body: JSON.stringify({ model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile", messages: [{ role: "user", content: prompt }], temperature: 0.9, max_tokens: 4000 })
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error("Groq HTTP " + res.status);
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content || "";
        if (!content) throw new Error("Groq بدون نص");
        return content;
      } catch (err) { clearTimeout(timeout); throw err; }
    }
  }
];

function getFallbackQuestions(category, count, difficulty) {
  const allQuestions = [
    { category: "معلومات عامة", difficulty: "سهل", question: "ما هي عاصمة السعودية؟", options: ["جدة", "الرياض", "مكة", "الدمام"], correctIndex: 1, explanation: "الرياض هي العاصمة الرسمية." },
    { category: "دين", difficulty: "سهل", question: "كم عدد ركعات صلاة الفجر؟", options: ["2", "3", "4", "5"], correctIndex: 0, explanation: "صلاة الفجر ركعتان." },
    { category: "جغرافيا", difficulty: "سهل", question: "ما هو أطول نهر في العالم؟", options: ["الفرات", "النيل", "دجلة", "الأمازون"], correctIndex: 1, explanation: "نهر النيل هو الأطول في العالم." },
    { category: "علوم", difficulty: "سهل", question: "ما هو أكبر كوكب في المجموعة الشمسية؟", options: ["الأرض", "المشتري", "زحل", "المريخ"], correctIndex: 1, explanation: "المشتري هو أكبر الكواكب." },
    { category: "تاريخ", difficulty: "متوسط", question: "من هو فاتح الأندلس؟", options: ["خالد بن الوليد", "طارق بن زياد", "صلاح الدين", "سعد بن أبي وقاص"], correctIndex: 1, explanation: "طارق بن زياد عام 711م." },
    { category: "رياضة", difficulty: "سهل", question: "كم عدد لاعبي فريق كرة القدم؟", options: ["9", "10", "11", "12"], correctIndex: 2, explanation: "11 لاعباً لكل فريق." },
    { category: "تكنولوجيا", difficulty: "سهل", question: "ما هي شركة آبل؟", options: ["شركة سيارات", "شركة تقنية", "شركة أغذية", "شركة ملابس"], correctIndex: 1, explanation: "آبل شركة تقنية أمريكية." },
    { category: "لغز", difficulty: "سهل", question: "له أسنان ولا يعض، ما هو؟", options: ["التمساح", "المشط", "المنشار", "الفأر"], correctIndex: 1, explanation: "المشط." }
  ];
  let filtered = allQuestions.filter((q) => q.difficulty === difficulty);
  if (!filtered.length) filtered = allQuestions;
  if (category && category !== "اختيارات متنوعة" && category !== "معلومات عامة") {
    const cat = filtered.filter((q) => q.category === category);
    if (cat.length) filtered = cat;
  }
  return shuffleArray(filtered).slice(0, Math.min(count, filtered.length));
}

async function callWithFallback(prompt, count) {
  const errors = [];
  for (const provider of PROVIDERS) {
    if (!provider.key) continue;
    try {
      const parsed = extractAndParseJSON(await provider.call(prompt));
      let questions = Array.isArray(parsed) ? parsed : (parsed.questions || [parsed]);
      const valid = questions.map(sanitizeQuestion).filter((q) =>
        q && q.question && Array.isArray(q.options) && q.options.length === 4 && typeof q.correctIndex === "number");
      if (valid.length > 0) return { questions: valid, source: "ai" };
    } catch (err) { errors.push(err.message); }
  }
  throw new Error("فشل الجميع: " + errors.join(" | "));
}

/* ═══════════ الدورة الذكية ═══════════ */
app.post("/api/questions", async (req, res) => {
  try {
    const body = req.body || {};
    const n = Math.min(Math.max(Number(body.count) || 10, 1), 50);
    const category = String(body.category || "اختيارات متنوعة").trim();
    const difficulty = String(body.difficulty || "متوسط").trim();
    const avoidSet = new Set((Array.isArray(body.avoid) ? body.avoid : []).map(normalizeText));

    const allBank = await getAllQuestions();
    if (!allBank.length) throw new Error("البنك فارغ");
    const len = allBank.length;

    let st = { cursor: 0, cycle_id: 1, shuffle_order: [] };
    try { const s = await getState(); if (s) st = s; } catch (e) {}

    let order = st.shuffle_order;
    const orderValid = Array.isArray(order) && order.length === len &&
      order.every((i) => Number.isInteger(i) && i >= 0 && i < len);
    if (!orderValid) order = shuffleArray(allBank.map((_, i) => i));

    let absPos = Math.min(Number(st.cursor) || 0, len);
    let cycleId = Number(st.cycle_id) || 1;

    const selected = [];
    const picked = new Set();
    const tryPick = (q, wantCat, wantDiff) => {
      if (!q) return false;
      const nk = normalizeText(q.question);
      if (picked.has(nk) || avoidSet.has(nk)) return false;
      if (wantCat && category !== "اختيارات متنوعة" && String(q.category || "").trim() !== category) return false;
      if (wantDiff && String(q.difficulty || "").trim() !== difficulty) return false;
      picked.add(nk);
      selected.push(q);
      return true;
    };

    /* مرور 1: فئة + مستوى مطابقان */
    let scanned = 0;
    while (selected.length < n && scanned < len) { tryPick(allBank[order[absPos % len]], true, true); absPos++; scanned++; }
    /* مرور 2: فئة مطابقة */
    scanned = 0;
    while (selected.length < n && scanned < len) { tryPick(allBank[order[absPos % len]], true, false); absPos++; scanned++; }
    /* مرور 3: أي سؤال غير مستخدم */
    scanned = 0;
    while (selected.length < n && scanned < len) { tryPick(allBank[order[absPos % len]], false, false); absPos++; scanned++; }

    let newCursor = absPos % len;
    if (absPos >= len) {
      cycleId += 1;
      order = shuffleArray(allBank.map((_, i) => i));
      newCursor = 0;
    }

    /* النقص يُكمل بـ AI ويُحفظ دائماً */
    if (selected.length < n) {
      const missing = n - selected.length;
      try {
        const aiResult = await callWithFallback(buildSystemPrompt(missing, category, difficulty), missing);
        await saveGeneratedToTurso(aiResult.questions);
        saveGeneratedToFile(aiResult.questions);
        for (const q of aiResult.questions) selected.push(q);
      } catch (e) {
        for (const q of getFallbackQuestions(category, missing, difficulty)) selected.push(q);
      }
    }

    try { await setState(newCursor, cycleId, order); } catch (e) {}

    const enriched = selected.slice(0, n).map((q, i) =>
      Object.assign({}, q, { id: "q_" + Date.now() + "_" + i, source: q.source || "bank" }));
    return res.json({
      questions: enriched,
      meta: { source: "smart-cycle", cursor: newCursor, cycle: cycleId, bankSize: len, persistent: Boolean(turso) }
    });
  } catch (err) {
    return res.status(500).json({ error: "فشل في جلب الأسئلة", details: err.message });
  }
});

/* إعادة تعيين الدورة يدوياً */
app.post("/api/reset-cycle", async (req, res) => {
  try {
    const allBank = await getAllQuestions();
    const order = shuffleArray(allBank.map((_, i) => i));
    await setState(0, 1, order);
    res.json({ success: true, bankSize: allBank.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* حالة الدورة للمتابعة */
app.get("/api/cycle-status", async (req, res) => {
  try {
    const st = await getState();
    const bank = await getAllQuestions();
    res.json({
      persistent: Boolean(turso),
      cursor: st ? st.cursor : 0,
      cycle: st ? st.cycle_id : 1,
      bankSize: bank.length
    });
  } catch (e) {
    res.json({ persistent: Boolean(turso), cursor: 0, cycle: 1, bankSize: 0 });
  }
});

app.get("/api/health", async (req, res) => {
  const bank = await getAllQuestions().catch(() => []);
  res.json({
    status: "ok",
    bankCount: bank.length,
    turso: Boolean(turso),
    persistentStorage: Boolean(process.env.RAILWAY_VOLUME_MOUNT_PATH)
  });
});

app.use((req, res) => res.sendFile(path.join(__dirname, "../public", "index.html")));

const PORT = process.env.PORT || 3000;
initTurso().finally(() => {
  app.listen(PORT, () => {
    console.log(`عالم التحديات يعمل على ${PORT} | Turso: ${turso ? "متصل ✅" : "غير مربوط ⚠️"}`);
  });
});
