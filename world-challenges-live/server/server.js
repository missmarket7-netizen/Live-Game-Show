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

/* ═══════════ Turso: قاعدة البيانات الدائمة ═══════════ */
const TURSO_URL = process.env.TURSO_URL || process.env.TURSO_DATABASE_URL || "";
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || process.env.TURSO_TOKEN || "";
const turso = (TURSO_URL && TURSO_TOKEN)
  ? createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })
  : null;

if (!turso) {
  console.warn("⚠️ متغيرات Turso غير موجودة — سيتم العمل بالنظام المؤقت المحلي.");
} else {
  console.log("✅ Turso متصل — الحفظ دائم والمؤشر مشترك بين الجميع.");
}

async function initTurso() {
  if (!turso) return;
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
        category TEXT,
        difficulty TEXT,
        question TEXT UNIQUE,
        options TEXT,
        correctIndex INTEGER,
        explanation TEXT,
        source TEXT DEFAULT 'ai',
        created_at TEXT
      )`,
      `INSERT OR IGNORE INTO game_state (id, cursor, cycle_id, shuffle_order) VALUES (1, 0, 1, '[]')`
    ], "write");
  } catch (e) {
    console.error("Turso init error:", e.message);
  }
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
        args: [
          q.category || "معلومات عامة", q.difficulty || "متوسط", String(q.question).trim(),
          JSON.stringify(q.options), q.correctIndex, q.explanation || "", q.source || "ai",
          new Date().toISOString()
        ]
      });
    } catch (e) {}
  }
}

/* ═══════════ أدوات مساعدة ═══════════ */
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

/* تحميل كل ملفات db*.json ديناميكياً (db1..db6 وأكثر) */
function loadBankQuestions() {
  let all = [];
  try {
    const files = fs.readdirSync(DATA_DIR)
      .filter((f) => /^db\d+\.json$/.test(f))
      .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
        if (Array.isArray(data)) all = all.concat(data);
      } catch (e) {}
    }
  } catch (e) {}
  return all;
}

function loadGeneratedFromFile() {
  try {
    const p = path.join(DATA_DIR, "generated_questions.json");
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
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

/* البنك الكامل: ملفات db + Turso + ملف محلي (بدون تكرار) */
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
      const valid = questions.filter((q) => q && q.question && Array.isArray(q.options) && q.options.length === 4 && typeof q.correctIndex === "number");
      if (valid.length) return { questions: valid, source: "ai" };
    } catch (err) { errors.push(err.message); }
  }
  throw new Error("فشل الجميع: " + errors.join(" | "));
}

/* ═══════════ الدورة الذكية: مؤشر + ترتيب مخلوط دائم ═══════════ */
app.post("/api/questions", async (req, res) => {
  try {
    const body = req.body || {};
    const n = Math.min(Math.max(Number(body.count) || 10, 1), 50);
    const category = body.category || "اختيارات متنوعة";
    const difficulty = body.difficulty || "متوسط";
    const avoidSet = new Set((Array.isArray(body.avoid) ? body.avoid : []).map(normalizeText));

    const allBank = await getAllQuestions();
    if (!allBank.length) throw new Error("البنك فارغ");
    const len = allBank.length;

    /* قراءة الحالة من Turso */
    let st = { cursor: 0, cycle_id: 1, shuffle_order: [] };
    try { const s = await getState(); if (s) st = s; } catch (e) {}

    let order = st.shuffle_order;
    const orderValid = Array.isArray(order) && order.length === len && order.every((i) => Number.isInteger(i) && i >= 0 && i < len);
    if (!orderValid) order = shuffleArray(allBank.map((_, i) => i));

    let absPos = Math.min(st.cursor, len);
    let cycleId = st.cycle_id;
    const selected = [];
    const picked = new Set();

    const tryPick = (q, requireCategory, requireDifficulty) => {
      const nk = normalizeText(q.question);
      if (picked.has(nk) || avoidSet.has(nk)) return false;
      if (requireCategory && category !== "اختيارات متنوعة" && String(q.category || "").trim() !== String(category).trim()) return false;
      if (requireDifficulty && String(q.difficulty || "").trim() !== String(difficulty).trim()) return false;
      selected.push(q); picked.add(nk);
      return true;
    };

    /* مرور 1: فئة + مستوى مطابقان */
    let scanned = 0;
    while (selected.length < n && scanned < len) { tryPick(allBank[order[absPos % len]], true, true); absPos++; scanned++; }
    /* مرور 2: فئة مطابقة فقط */
    scanned = 0;
    while (selected.length < n && scanned < len) { tryPick(allBank[order[absPos % len]], true, false); absPos++; scanned++; }
    /* مرور 3: أي سؤال غير مستخدم حديثاً */
    scanned = 0;
    while (selected.length < n && scanned < len) { tryPick(allBank[order[absPos % len]], false, false); absPos++; scanned++; }

    /* اكتمال دورة كاملة → دورة جديدة بترتيب جديد */
    if (absPos >= len) {
      cycleId += 1;
      order = shuffleArray(allBank.map((_, i) => i));
    }
    const newCursor = absPos % len;

    /* النقص يُكمل بتوليد AI ويُحفظ دائماً */
    if (selected.length < n) {
      const missing = n - selected.length;
      try {
        const aiResult = await callWithFallback(buildSystemPrompt(missing, category, difficulty), missing);
        await saveGeneratedToTurso(aiResult.questions);
        saveGeneratedToFile(aiResult.questions);
        selected.push(...aiResult.questions);
      } catch (e) {
        selected.push(...getFallbackQuestions(category, missing, difficulty));
      }
    }

    /* حفظ المؤشر والترتيب */
    try { await setState(newCursor, cycleId, order); } catch (e) {}

    const enriched = selected.slice(0, n).map((q, i) => ({ ...q, id: `q_${Date.now()}_${i}`, source: q.source || "bank" }));
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

/* حالة الدورة (للمتابعة) */
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
    console.log(`عالم التحديات يعمل على ${PORT} | البنك: ${loadBankQuestions().length} سؤال أساسي | Turso: ${turso ? "متصل ✅" : "غير مربوط ⚠️"}`);
  });
});
