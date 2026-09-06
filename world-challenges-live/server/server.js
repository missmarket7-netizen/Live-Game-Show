import "dotenv/config";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

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
const GEN_FILE = path.join(DATA_DIR, "generated_questions.json");

function shuffleArray(a0) { const a = [...a0]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function normalizeText(t) { return String(t || "").toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\u0621-\u064Aa-z0-9]/g, "").trim(); }

/* تنظيف المفاتيح/القيم + السماح بالإجابة الحرة (سرعة) أو 4 خيارات */
function sanitizeQuestion(raw) {
  if (!raw || typeof raw !== "object") return null;
  const q = {};
  for (const [k, v] of Object.entries(raw)) { const key = String(k).trim(); q[key] = typeof v === "string" ? String(v).trim() : v; }
  if (!q.question || typeof q.question !== "string" || !q.question.trim()) return null;
  q.question = q.question.trim();
  if (!Array.isArray(q.options)) q.options = [];
  q.options = q.options.map((o) => String(o).trim()).filter(Boolean);
  if (q.options.length === 0) { q.correctIndex = null; }
  else {
    if (q.options.length !== 4) return null;
    const ci = Number(q.correctIndex);
    if (!Number.isInteger(ci) || ci < 0 || ci > 3) return null;
    q.correctIndex = ci;
  }
  q.category = q.category || "معلومات عامة";
  q.difficulty = q.difficulty || "متوسط";
  q.explanation = q.explanation || "";
  return q;
}

/* تحميل ديناميكي: كل db*.json حالياً وأي ملف يُضاف لاحقاً */
function loadBankQuestions() {
  let all = [];
  try {
    const files = fs.readdirSync(DATA_DIR).filter((f) => /^db.*\.json$/i.test(f)).sort();
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
        if (Array.isArray(data)) all = all.concat(data.map(sanitizeQuestion).filter(Boolean));
      } catch (e) {}
    }
  } catch (e) {}
  return all;
}
function loadGenerated() {
  try { if (fs.existsSync(GEN_FILE)) { const d = JSON.parse(fs.readFileSync(GEN_FILE, "utf8")); if (Array.isArray(d)) return d.map(sanitizeQuestion).filter(Boolean); } } catch (e) {}
  return [];
}
function saveGenerated(questions) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const merged = [...questions, ...loadGenerated()].slice(0, 5000);
    fs.writeFileSync(GEN_FILE, JSON.stringify(merged, null, 2), "utf8");
  } catch (e) { console.error("خطأ حفظ AI:", e.message); }
}
/* دمج البنك + AI مع إزالة التكرار بالنص المُطبّع */
function getAllQuestions() {
  const seen = new Set(); const all = [];
  for (const q of loadBankQuestions().concat(loadGenerated())) {
    const key = normalizeText(q.question);
    if (seen.has(key)) continue;
    seen.add(key); all.push(q);
  }
  return all;
}
function buildSystemPrompt(count, category, difficulty) {
  return `أنت محرر أسئلة لمسابقة عربية مباشرة اسمها «عالم التحديات». أعد ${count} سؤالاً جديداً باللغة العربية، خليطاً متنوعاً بين الفئات (معلومات عامة، جغرافيا، علوم، تاريخ، دين، ألغاز، رياضة، تكنولوجيا، سينما). أخرج JSON فقط: مصفوفة كائنات، كل كائن: category, difficulty, question, options (4 خيارات نصية)، correctIndex (0-3)، explanation قصيرة. إجابة صحيحة واحدة فقط، خيارات واضحة، بدون تكرار، بدون Markdown.`;
}
function extractJson(text) {
  const cleaned = String(text || "").replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const am = cleaned.match(/\[[\s\S]*\]/); if (am) { try { return JSON.parse(am[0]); } catch (e) {} }
  const om = cleaned.match(/\{[\s\S]*\}/); if (om) { try { return JSON.parse(om[0]); } catch (e) {} }
  try { return JSON.parse(cleaned); } catch (e) {}
  throw new Error("Invalid JSON");
}
const PROVIDERS = [
  { name: "gemini", key: GEMINI_API_KEY, call: async (prompt) => {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 22000);
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: c.signal, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.8, maxOutputTokens: 5000, responseMimeType: "application/json" } }) });
      clearTimeout(t); if (!r.ok) throw new Error("Gemini " + r.status);
      const b = await r.json(); const text = b.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!text) throw new Error("no content"); return text;
    } catch (e) { clearTimeout(t); throw e; }
  } },
  { name: "openrouter", key: OPENROUTER_API_KEY, call: async (prompt) => {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 22000);
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", signal: c.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENROUTER_API_KEY}`, "HTTP-Referer": "https://live-game-show.local", "X-Title": "Live Game Show" }, body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || "minimax/minimax-m2.7:free", messages: [{ role: "user", content: prompt }], temperature: 0.8, max_tokens: 5000 }) });
      clearTimeout(t); if (!r.ok) throw new Error("OpenRouter " + r.status);
      const b = await r.json(); const text = b.choices?.[0]?.message?.content || "";
      if (!text) throw new Error("no content"); return text;
    } catch (e) { clearTimeout(t); throw e; }
  } },
  { name: "groq", key: GROQ_API_KEY, call: async (prompt) => {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 22000);
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", signal: c.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` }, body: JSON.stringify({ model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile", messages: [{ role: "user", content: prompt }], temperature: 0.8, max_tokens: 5000 }) });
      clearTimeout(t); if (!r.ok) throw new Error("Groq " + r.status);
      const b = await r.json(); const text = b.choices?.[0]?.message?.content || "";
      if (!text) throw new Error("no content"); return text;
    } catch (e) { clearTimeout(t); throw e; }
  } }
];
function isValid(q) { return q && typeof q.question === "string" && q.question.trim() && Array.isArray(q.options) && (q.options.length === 4 || q.options.length === 0) && (q.options.length === 0 ? true : (Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex <= 3)); }
async function askProviders(prompt, count, category, difficulty) {
  for (const p of PROVIDERS) {
    if (!p.key) continue;
    try {
      const parsed = extractJson(await p.call(prompt));
      const list = Array.isArray(parsed) ? parsed : parsed.questions;
      const valid = (Array.isArray(list) ? list : []).map(sanitizeQuestion).filter(isValid).slice(0, count);
      if (valid.length) return { questions: valid, source: "ai", provider: p.name };
    } catch (e) {}
  }
  return null;
}
/* توليد AI خليط + حفظ تلقائي في generated_questions.json */
app.post("/api/generate", async (req, res) => {
  const body = req.body || {};
  const count = Math.min(30, Math.max(1, Number(body.count) || 10));
  const avoid = new Set((Array.isArray(body.avoid) ? body.avoid : []).map(normalizeText));
  const prompt = buildSystemPrompt(count, body.category, body.difficulty);
  const result = await askProviders(prompt, count, body.category, body.difficulty);
  if (!result) return res.json({ questions: [], meta: { source: "none" } });
  let questions = result.questions.filter((q) => !avoid.has(normalizeText(q.question)));
  saveGenerated(questions);
  res.json({ questions, meta: { source: "ai", provider: result.provider, count: questions.length } });
});
/* بنك كامل مخلوط (كل الفئات) + أي ملفات db جديدة */
app.post("/api/questions", async (req, res) => {
  const body = req.body || {};
  const count = Math.min(50, Math.max(1, Number(body.count) || 10));
  const category = body.category || "اختيارات متنوعة";
  const avoid = new Set((Array.isArray(body.avoid) ? body.avoid : []).map(normalizeText));
  let pool = getAllQuestions().filter((q) => !avoid.has(normalizeText(q.question)));
  if (category && category !== "اختيارات متنوعة") {
    const cat = pool.filter((q) => q.category === category);
    if (cat.length >= count) pool = cat;
  }
  const selected = shuffleArray(pool).slice(0, count);
  res.json({ questions: selected, meta: { source: "bank", count: selected.length, bankSize: getAllQuestions().length } });
});
app.get("/api/health", (req, res) => res.json({ status: "ok", bankCount: getAllQuestions().length }));
app.use((req, res) => res.sendFile(path.join(__dirname, "../public", "index.html")));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`عالم التحديات يعمل على ${PORT} | البنك: ${getAllQuestions().length} سؤال`));
