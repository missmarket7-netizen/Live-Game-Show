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

const PERSISTENT_STORAGE = Boolean(process.env.RAILWAY_VOLUME_MOUNT_PATH);

if (!PERSISTENT_STORAGE) {
  console.warn(
    "⚠️ لا يوجد Volume دائم مرتبط. الأسئلة المولّدة تُحفظ داخل نظام ملفات الحاوية المؤقت."
  );
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Smart Deduplication - تطبيع النص العربي */
function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\u0621-\u064Aa-z0-9]/g, '')
    .trim();
}

function loadBankQuestions() {
  let all = [];
  for (let i = 1; i <= 5; i++) {
    try {
      const filePath = path.join(DATA_DIR, `db${i}.json`);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (Array.isArray(data)) all = all.concat(data);
      }
    } catch (e) {}
  }
  return all;
}

function loadGeneratedQuestions() {
  try {
    const filePath = path.join(DATA_DIR, "generated_questions.json");
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {}
  return [];
}

function saveGeneratedQuestions(questions) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const existing = loadGeneratedQuestions();
    const merged = [...questions, ...existing];
    const limited = merged.slice(0, 5000);
    fs.writeFileSync(path.join(DATA_DIR, "generated_questions.json"), JSON.stringify(limited, null, 2), "utf8");
  } catch (e) {
    console.error("خطأ في الحفظ:", e.message);
  }
}

function buildSystemPrompt(count, category, difficulty) {
  return `أنت مولد أسئلة لمسابقة عربية مباشرة اسمها "عالم التحديات".
قواعد صارمة:
- اخرج JSON فقط بدون أي نص قبل أو بعد
- الشكل المطلوب: مصفوفة JSON تحتوي على ${count} كائنات
- كل كائن يحتوي على: category, difficulty, question, options (4 خيارات), correctIndex (0-3), explanation
- الفئة المطلوبة: ${category || 'معلومات عامة'}
- المستوى المطلوب: ${difficulty || 'متوسط'}
- نوّع في الأسئلة ولا تكرر
- تأكد من صحة المعلومات والإجابات
- اجعل الأسئلة مناسبة للجمهور العربي
مثال: [{ "category": "معلومات عامة", "difficulty": "سهل", "question": "ما هي عاصمة السعودية؟", "options": ["جدة", "الرياض", "مكة", "الدمام"], "correctIndex": 1, "explanation": "الرياض هي العاصمة الرسمية للمملكة العربية السعودية." }]`;
}

function extractAndParseJSON(rawText) {
  if (!rawText || typeof rawText !== "string") throw new Error("الرد فارغ");
  let cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, " ").trim();
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) { try { return JSON.parse(arrayMatch[0]); } catch (_) {} }
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) { try { return JSON.parse(objectMatch[0]); } catch (_) {} }
  try { return JSON.parse(cleaned); } catch (_) {}
  throw new Error(`تعذر تحليل JSON: ${rawText.slice(0, 200)}`);
}

const PROVIDERS = [
  {
    name: "gemini", key: GEMINI_API_KEY,
    call: async (prompt, count) => {
      if (!GEMINI_API_KEY) throw new Error("مفتاح Gemini غير موجود");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.9, maxOutputTokens: 4000 }
          })
        });
        clearTimeout(timeout);
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 300)}`);
        }
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (!text) throw new Error("لم يرد Gemini بنص");
        return text;
      } catch (err) { clearTimeout(timeout); throw err; }
    }
  },
  {
    name: "openrouter", key: OPENROUTER_API_KEY,
    call: async (prompt, count) => {
      if (!OPENROUTER_API_KEY) throw new Error("مفتاح OpenRouter غير موجود");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "HTTP-Referer": "https://live-game-show.app",
            "X-Title": "Live Game Show"
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: process.env.OPENROUTER_MODEL || "minimax/minimax-m2.7:free",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.9,
            max_tokens: 4000
          })
        });
        clearTimeout(timeout);
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`OpenRouter HTTP ${res.status}: ${errText.slice(0, 300)}`);
        }
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content || "";
        if (!content) throw new Error("لم يرد OpenRouter بنص");
        return content;
      } catch (err) { clearTimeout(timeout); throw err; }
    }
  },
  {
    name: "groq", key: GROQ_API_KEY,
    call: async (prompt, count) => {
      if (!GROQ_API_KEY) throw new Error("مفتاح Groq غير موجود");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${GROQ_API_KEY}`
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.9,
            max_tokens: 4000
          })
        });
        clearTimeout(timeout);
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Groq HTTP ${res.status}: ${errText.slice(0, 300)}`);
        }
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content || "";
        if (!content) throw new Error("لم يرد Groq بنص");
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
    { category: "معلومات عامة", difficulty: "متوسط", question: "ما عاصمة اليابان؟", options: ["أوساكا", "طوكيو", "كيوتو", "هيروشيما"], correctIndex: 1, explanation: "طوكيو هي عاصمة اليابان." },
    { category: "علوم", difficulty: "سهل", question: "ما هو أكبر كوكب في المجموعة الشمسية؟", options: ["الأرض", "المشتري", "زحل", "المريخ"], correctIndex: 1, explanation: "المشتري هو أكبر كواكب المجموعة الشمسية." },
    { category: "تاريخ", difficulty: "متوسط", question: "من هو فاتح الأندلس؟", options: ["خالد بن الوليد", "طارق بن زياد", "صلاح الدين", "سعد بن أبي وقاص"], correctIndex: 1, explanation: "طارق بن زياد فتح الأندلس عام 711م." },
    { category: "رياضة", difficulty: "سهل", question: "كم عدد لاعبي فريق كرة القدم؟", options: ["9", "10", "11", "12"], correctIndex: 2, explanation: "فريق كرة القدم يتكون من 11 لاعباً." },
    { category: "تكنولوجيا", difficulty: "سهل", question: "ما هي شركة آبل؟", options: ["شركة سيارات", "شركة تقنية", "شركة أغذية", "شركة ملابس"], correctIndex: 1, explanation: "آبل شركة تقنية أمريكية." }
  ];
  let filtered = allQuestions.filter(q => q.difficulty === difficulty);
  if (filtered.length === 0) filtered = allQuestions;
  if (category && category !== "معلومات عامة" && category !== "اختيارات متنوعة") {
    const catFiltered = filtered.filter(q => q.category === category || q.category === "معلومات عامة");
    if (catFiltered.length > 0) filtered = catFiltered;
  }
  return shuffleArray(filtered).slice(0, Math.min(count, filtered.length));
}

async function callWithFallback(prompt, count) {
  const errors = [];
  for (const provider of PROVIDERS) {
    if (!provider.key) continue;
    try {
      const rawResponse = await provider.call(prompt, count);
      const parsed = extractAndParseJSON(rawResponse);
      let questions;
      if (Array.isArray(parsed)) questions = parsed;
      else if (parsed.questions) questions = parsed.questions;
      else questions = [parsed];
      const valid = questions.filter(q =>
        q.question &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        typeof q.correctIndex === "number"
      );
      if (valid.length > 0) return { questions: valid, source: "ai" };
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw new Error(`فشل الجميع: ${errors.join(" | ")}`);
}

app.post("/api/questions", async (req, res) => {
  try {
    const { count = 10, avoid = [], category = "اختيارات متنوعة", difficulty = "متوسط" } = req.body;
    const n = Math.min(Math.max(Number(count) || 10, 1), 50);
    
    // Smart Deduplication: تطبيع النصوص للمقارنة
    const avoidNormalized = (Array.isArray(avoid) ? avoid : []).map(q => normalizeText(q));
    
    let allBank = [...loadBankQuestions(), ...loadGeneratedQuestions()];
    
    // فلترة الأسئلة المتشابهة
    let filtered = allBank.filter(q => {
      const normalized = normalizeText(q.question);
      return !avoidNormalized.some(old => {
        if (old === normalized) return true;
        if (normalized.length > 20 && old.length > 20) {
          const shorter = normalized.length < old.length ? normalized : old;
          const longer = normalized.length >= old.length ? normalized : old;
          if (longer.includes(shorter.slice(0, 15))) return true;
        }
        return false;
      });
    });
    
    if (category && category !== "اختيارات متنوعة") {
      const catFiltered = filtered.filter(q => q.category === category);
      if (catFiltered.length >= n) filtered = catFiltered;
    }
    
    let selected = shuffleArray(filtered).slice(0, n);
    
    if (selected.length < n) {
      const missingCount = n - selected.length;
      const prompt = buildSystemPrompt(missingCount, category, difficulty);
      try {
        const aiResult = await callWithFallback(prompt, missingCount);
        saveGeneratedQuestions(aiResult.questions);
        selected = [...selected, ...aiResult.questions];
      } catch (e) {
        selected = [...selected, ...getFallbackQuestions(category, missingCount, difficulty)];
      }
    }
    
    if (selected.length === 0) {
      selected = getFallbackQuestions("معلومات عامة", n, "سهل");
    }
    
    const enriched = selected.map((q, i) => ({
      ...q,
      id: `q_${Date.now()}_${i}`,
      source: q.source || "bank"
    }));
    
    return res.json({ questions: enriched, meta: { source: "bank-ai" } });
  } catch (err) {
    return res.status(500).json({ error: "فشل في جلب الأسئلة", details: err.message });
  }
});

app.get("/api/health", (req, res) => res.json({
  status: "ok",
  bankCount: loadBankQuestions().length + loadGeneratedQuestions().length,
  persistentStorage: PERSISTENT_STORAGE,
  dataDir: DATA_DIR
}));

app.use((req, res) => res.sendFile(path.join(__dirname, "../public", "index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`عالم التحديات يعمل على ${PORT} | البنك: ${loadBankQuestions().length + loadGeneratedQuestions().length} سؤال`));
