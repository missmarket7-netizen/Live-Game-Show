import "dotenv/config";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "../public")));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

// دالة خلط المصفوفات (لتظهر الأسئلة خليط عشوائي)
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// قراءة ملفات البنك (db1 إلى db5)
function loadBankQuestions() {
  let all = [];
  for (let i = 1; i <= 5; i++) {
    try {
      const filePath = path.join(__dirname, "questions", `db${i}.json`);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (Array.isArray(data)) all = all.concat(data);
      }
    } catch (e) {}
  }
  return all;
}

// قراءة الأسئلة المولدة من AI
function loadGeneratedQuestions() {
  try {
    const filePath = path.join(__dirname, "questions", "generated_questions.json");
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  } catch (e) {}
  return [];
}

// حفظ الأسئلة الجديدة بشكل دائم
function saveGeneratedQuestions(questions) {
  try {
    const existing = loadGeneratedQuestions();
    const merged = [...questions, ...existing];
    const limited = merged.slice(0, 5000);
    fs.writeFileSync(path.join(__dirname, "questions", "generated_questions.json"), JSON.stringify(limited, null, 2), "utf8");
  } catch (e) {
    console.error("خطأ في الحفظ:", e.message);
  }
}

function buildSystemPrompt(count) {
  return `انت مولد اسئلة لمسابقة عربية مباشرة اسمها "عالم التحديات".
قواعد صارمة:
1. اخرج JSON فقط بدون اي نص قبل او بعد
2. الشكل المطلوب: مصفوفة JSON تحتوي على ${count} كائنات
3. كل كائن يحتوي على:
   - "category": نص الفئة
   - "difficulty": "سهل" او "متوسط" او "صعب"
   - "question": نص السؤال بالعربية الفصحى الواضحة
   - "options": ["الخيار أ", "الخيار ب", "الخيار ج", "الخيار د"]
   - "correctIndex": رقم من 0 الى 3
   - "explanation": شرح مختصر للمقدم
4. الاسئلة واضحة، تجنب المختلف عليه
5. في الدين: معلومات اساسية مشهورة فقط
6. لا تكرر الاسئلة
7. الخيارات متقاربة منطقيا لكن واحد فقط صحيح

مثال:
[{"category":"معلومات عامة","difficulty":"سهل","question":"ما هي عاصمة السعودية؟","options":["جدة","الرياض","مكة","الدمام"],"correctIndex":1,"explanation":"الرياض"}]`;
}

function extractAndParseJSON(rawText) {
  if (!rawText || typeof rawText !== "string") throw new Error("الرد فارغ");
  let cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
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
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: buildSystemPrompt(count) + "\n\n" + prompt }] }], generationConfig: { temperature: 0.9, maxOutputTokens: 4000 } }) });
        clearTimeout(timeout);
        if (!res.ok) { const errText = await res.text(); throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 300)}`); }
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
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "HTTP-Referer": "https://live-game-show.app", "X-Title": "Live Game Show" }, signal: controller.signal, body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || "minimax/minimax-m2.7:free", messages: [{ role: "system", content: buildSystemPrompt(count) }, { role: "user", content: prompt }], temperature: 0.9, max_tokens: 4000 }) });
        clearTimeout(timeout);
        if (!res.ok) { const errText = await res.text(); throw new Error(`OpenRouter HTTP ${res.status}: ${errText.slice(0, 300)}`); }
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
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` }, signal: controller.signal, body: JSON.stringify({ model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile", messages: [{ role: "system", content: buildSystemPrompt(count) }, { role: "user", content: prompt }], temperature: 0.9, max_tokens: 4000 }) });
        clearTimeout(timeout);
        if (!res.ok) { const errText = await res.text(); throw new Error(`Groq HTTP ${res.status}: ${errText.slice(0, 300)}`); }
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
    { category: "معلومات عامة", difficulty: "سهل", question: "ما هي عاصمة السعودية؟", options: ["جدة", "الرياض", "مكة", "الدمام"], correctIndex: 1, explanation: "الرياض" },
    { category: "دين", difficulty: "سهل", question: "كم عدد ركعات صلاة الفجر؟", options: ["2", "3", "4", "5"], correctIndex: 0, explanation: "ركعتان" },
    { category: "جغرافيا", difficulty: "سهل", question: "ما هو أطول نهر في العالم؟", options: ["الفرات", "النيل", "دجلة", "الأمازون"], correctIndex: 1, explanation: "النيل" },
    { category: "علوم", difficulty: "سهل", question: "ما هو الكوكب الأحمر؟", options: ["الزهرة", "المريخ", "المشتري", "عطارد"], correctIndex: 1, explanation: "المريخ" }
  ];
  let filtered = allQuestions.filter(q => q.difficulty === difficulty);
  if (filtered.length === 0) filtered = allQuestions;
  if (category !== "معلومات عامة") {
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
      console.log(`محاولة ${provider.name}...`);
      const rawResponse = await provider.call(prompt, count);
      const parsed = extractAndParseJSON(rawResponse);
      let questions;
      if (Array.isArray(parsed)) questions = parsed;
      else if (parsed.questions) questions = parsed.questions;
      else questions = [parsed];
      const valid = questions.filter(q => q.question && Array.isArray(q.options) && q.options.length === 4 && typeof q.correctIndex === "number");
      if (valid.length > 0) return { questions: valid, source: "ai" };
      else throw new Error("أسئلة غير صالحة");
    } catch (err) { errors.push(`${provider.name}: ${err.message}`); }
  }
  throw new Error(`فشل الجميع: ${errors.join(" | ")}`);
}

// ─── API: جلب أسئلة خليط عشوائية وبدء اللعبة تلقائياً ───
app.post("/api/questions", async (req, res) => {
  try {
    const { count = 10, avoid = [] } = req.body;
    const n = Math.min(Math.max(Number(count) || 10, 1), 50);
    const avoidSet = new Set((Array.isArray(avoid) ? avoid : []).map(q => String(q)));

    // 1. دمج البنك الثابت + المولد
    let allBank = [...loadBankQuestions(), ...loadGeneratedQuestions()];
    // تصفية الأسئلة غير المكررة
    let filtered = allBank.filter(q => !avoidSet.has(q.question));
    // خلط عشوائي (خليط من كل الفئات)
    let selected = shuffleArray(filtered).slice(0, n);

    console.log(`✅ تم جلب ${selected.length} سؤال خليط من البنك.`);

    // 2. إذا نقصت الكمية، نولد من AI
    if (selected.length < n) {
      const missingCount = n - selected.length;
      const prompt = `انشئ بالضبط ${missingCount} اسئلة متنوعة (خلط بين الفئات: دين، جغرافيا، علوم، ألغاز، تاريخ، رياضة، تكنولوجيا، معلومات عامة) بمستويات صعوبة متنوعة.\nقواعد:\n- اخرج مصفوفة JSON فقط\n- لا تستخدم هذه الاسئلة: ${[...avoidSet].slice(-80).join(" | ")}.\n- كل سؤال يحتوي على: category, difficulty, question, options (4), correctIndex (0-3), explanation`;

      try {
        const aiResult = await callWithFallback(prompt, missingCount);
        // حفظ تلقائي فوري للأسئلة الجديدة (لن تُحذف أبداً)
        saveGeneratedQuestions(aiResult.questions);
        selected = [...selected, ...aiResult.questions];
        console.log(`🎉 تم توليد ${aiResult.questions.length} سؤال من AI وحفظها.`);
      } catch (aiErr) {
        const fallback = getFallbackQuestions("معلومات عامة", missingCount, "سهل");
        selected = [...selected, ...fallback];
      }
    }

    if (selected.length === 0) throw new Error("لم يتم توليد أي أسئلة.");

    const enriched = selected.map((q, i) => ({
      ...q,
      id: `q_${Date.now()}_${i}`,
      source: q.source || "bank"
    }));

    return res.json({ questions: enriched });
  } catch (err) {
    console.error("خطأ:", err.message);
    return res.status(500).json({ error: "فشل في توليد الأسئلة", details: err.message });
  }
});

// ─── Health Check ───
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", bankCount: loadBankQuestions().length + loadGeneratedQuestions().length });
});

// ─── SPA Fallback ───
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "../public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`عالم التحديات — LIVE GAME SHOW`);
  console.log(`   الخادم يعمل على http://localhost:${PORT}`);
  console.log(`   البنك يحتوي على: ${loadBankQuestions().length + loadGeneratedQuestions().length} سؤال`);
  console.log(`   الترتيب: Bank -> AI -> Fallback`);
});
