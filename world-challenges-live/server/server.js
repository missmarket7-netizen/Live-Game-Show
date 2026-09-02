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
      const filePath = path.join(DATA_DIR, 'db' + i + '.json');
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
  return 'أنت مولد أسئلة لمسابقة عربية مباشرة اسمها "عالم التحديات".\n' +
    'قواعد صارمة:\n' +
    '- اخرج JSON فقط بدون أي نص قبل أو بعد\n' +
    '- الشكل المطلوب: مصفوفة JSON تحتوي على ' + count + ' كائنات\n' +
    '- كل كائن يحتوي على: category, difficulty, question, options (4 خيارات), correctIndex (0-3), explanation\n' +
    '- الفئة المطلوبة: ' + (category || 'معلومات عامة') + '\n' +
    '- المستوى المطلوب: ' + (difficulty || 'متوسط') + '\n' +
    '- نوّع في الأسئلة ولا تكرر\n' +
    '- تأكد من صحة المعلومات والإجابات\n' +
    '- اجعل الأسئلة مناسبة للجمهور العربي';
}

function extractAndParseJSON(rawText) {
  if (!rawText || typeof rawText !== "string") throw new Error("الرد فارغ");
  let cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, " ").trim();
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
    call: async (prompt, count) => {
      if (!GEMINI_API_KEY) throw new Error("مفتاح Gemini غير موجود");
      const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_API_KEY;
      const controller = new AbortController();
      const timeout = setTimeout(function() { controller.abort(); }, 20000);
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
          throw new Error("Gemini HTTP " + res.status + ": " + errText.slice(0, 300));
        }
        const json = await res.json();
        const text = (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts[0]) ? json.candidates[0].content.parts[0].text : "";
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
      const timeout = setTimeout(function() { controller.abort(); }, 20000);
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + OPENROUTER_API_KEY,
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
          throw new Error("OpenRouter HTTP " + res.status + ": " + errText.slice(0, 300));
        }
        const json = await res.json();
        const content = (json.choices && json.choices[0] && json.choices[0].message) ? json.choices[0].message.content : "";
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
      const timeout = setTimeout(function() { controller.abort(); }, 20000);
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + GROQ_API_KEY
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
          throw new Error("Groq HTTP " + res.status + ": " + errText.slice(0, 300));
        }
        const json = await res.json();
        const content = (json.choices && json.choices[0] && json.choices[0].message) ? json.choices[0].message.content : "";
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
    { category: "تكنولوجيا", difficulty: "سهل", question: "ما هي شركة آبل؟", options: ["شركة سيارات", "شركة تقنية", "شركة أغذية", "شركة ملابس"], correctIndex: 1, explanation: "آبل شركة تقنية أمريكية." },
    { category: "جغرافيا", difficulty: "متوسط", question: "ما هي عاصمة أستراليا؟", options: ["سيدني", "ملبورن", "كانبرا", "بيرث"], correctIndex: 2, explanation: "كانبرا هي العاصمة الإدارية لأستراليا." },
    { category: "دين", difficulty: "متوسط", question: "من هو النبي الذي ابتلعه الحوت؟", options: ["موسى", "عيسى", "يونس", "إبراهيم"], correctIndex: 2, explanation: "النبي يونس عليه السلام." },
    { category: "لغز", difficulty: "سهل", question: "له أسنان ولا يعض، ما هو؟", options: ["التمساح", "المشط", "المنشار", "الفأر"], correctIndex: 1, explanation: "المشط له أسنان ولا يعض." },
    { category: "علوم", difficulty: "متوسط", question: "ما هو الكوكب الملقب بالكوكب الأحمر؟", options: ["الزهرة", "المريخ", "المشتري", "عطارد"], correctIndex: 1, explanation: "المريخ يلقب بالكوكب الأحمر." },
    { category: "تاريخ", difficulty: "سهل", question: "في أي عام انتهت الحرب العالمية الثانية؟", options: ["1918", "1939", "1945", "1950"], correctIndex: 2, explanation: "انتهت الحرب العالمية الثانية في عام 1945." },
    { category: "معلومات عامة", difficulty: "متوسط", question: "كم عدد ألوان قوس قزح؟", options: ["5", "6", "7", "8"], correctIndex: 2, explanation: "قوس قزح يتكون من 7 ألوان." },
    { category: "رياضة", difficulty: "متوسط", question: "كم دقيقة تستمر المباراة الواحدة في كرة القدم؟", options: ["80", "90", "100", "120"], correctIndex: 1, explanation: "مدة المباراة الأساسية 90 دقيقة." },
    { category: "تكنولوجيا", difficulty: "متوسط", question: "ماذا يعني اختصار AI؟", options: ["الواقع الافتراضي", "الذكاء الاصطناعي", "إنترنت الأشياء", "البيانات الضخمة"], correctIndex: 1, explanation: "AI تعني الذكاء الاصطناعي." },
    { category: "جغرافيا", difficulty: "سهل", question: "ما هو أصغر محيط في العالم؟", options: ["الأطلسي", "الهندي", "الهادئ", "المتجمد الشمالي"], correctIndex: 3, explanation: "المحيط المتجمد الشمالي هو الأصغر." },
    { category: "دين", difficulty: "سهل", question: "ما هي أول سورة في القرآن الكريم؟", options: ["الفاتحة", "البقرة", "الإخلاص", "الناس"], correctIndex: 0, explanation: "سورة الفاتحة هي أول سور المصحف." },
    { category: "لغز", difficulty: "متوسط", question: "ما هو الشيء الذي كلما زاد نقص؟", options: ["العمر", "الوقت", "الماء", "الرمل"], correctIndex: 0, explanation: "العمر كلما زاد، نقص من رصيد حياتنا." },
    { category: "علوم", difficulty: "سهل", question: "ما هو أكبر عضو في جسم الإنسان؟", options: ["القلب", "الدماغ", "الكبد", "الجلد"], correctIndex: 3, explanation: "الجلد هو أكبر عضو في جسم الإنسان." }
  ];
  let filtered = allQuestions.filter(function(q) { return q.difficulty === difficulty; });
  if (filtered.length === 0) filtered = allQuestions;
  if (category && category !== "معلومات عامة" && category !== "اختيارات متنوعة") {
    const catFiltered = filtered.filter(function(q) { return q.category === category || q.category === "معلومات عامة"; });
    if (catFiltered.length > 0) filtered = catFiltered;
  }
  return shuffleArray(filtered).slice(0, Math.min(count, filtered.length));
}

async function callWithFallback(prompt, count) {
  const errors = [];
  for (var p = 0; p < PROVIDERS.length; p++) {
    var provider = PROVIDERS[p];
    if (!provider.key) continue;
    try {
      const rawResponse = await provider.call(prompt, count);
      const parsed = extractAndParseJSON(rawResponse);
      let questions;
      if (Array.isArray(parsed)) questions = parsed;
      else if (parsed && parsed.questions) questions = parsed.questions;
      else questions = [parsed];
      const valid = questions.filter(function(q) {
        return q && q.question &&
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          typeof q.correctIndex === "number";
      });
      if (valid.length > 0) return { questions: valid, source: "ai" };
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw new Error("فشل الجميع: " + errors.join(" | "));
}

app.post("/api/questions", async function(req, res) {
  try {
    const body = req.body || {};
    const count = Math.min(Math.max(Number(body.count) || 10, 1), 50);
    const avoid = Array.isArray(body.avoid) ? body.avoid : [];
    const category = body.category || "اختيارات متنوعة";
    const difficulty = body.difficulty || "متوسط";

    // Smart Deduplication: تطبيع النصوص للمقارنة
    const avoidNormalized = avoid.map(function(q) { return normalizeText(q); });

    let allBank = loadBankQuestions().concat(loadGeneratedQuestions());

    // فلترة الأسئلة المتشابهة
    let filtered = allBank.filter(function(q) {
      var normalized = normalizeText(q.question);
      for (var i = 0; i < avoidNormalized.length; i++) {
        if (avoidNormalized[i] === normalized) return false;
        if (normalized.length > 20 && avoidNormalized[i].length > 20) {
          var shorter = normalized.length < avoidNormalized[i].length ? normalized : avoidNormalized[i];
          var longer = normalized.length >= avoidNormalized[i].length ? normalized : avoidNormalized[i];
          if (longer.indexOf(shorter.slice(0, 15)) !== -1) return false;
        }
      }
      return true;
    });

    // تصفية حسب الفئة
    if (category && category !== "اختيارات متنوعة") {
      var catFiltered = filtered.filter(function(q) { return q.category === category; });
      if (catFiltered.length >= count) filtered = catFiltered;
    }

    var selected = shuffleArray(filtered).slice(0, count);

    if (selected.length < count) {
      var missingCount = count - selected.length;
      var prompt = buildSystemPrompt(missingCount, category, difficulty);
      try {
        var aiResult = await callWithFallback(prompt, missingCount);
        saveGeneratedQuestions(aiResult.questions);
        selected = selected.concat(aiResult.questions);
      } catch (e) {
        selected = selected.concat(getFallbackQuestions(category, missingCount, difficulty));
      }
    }

    if (selected.length === 0) {
      selected = getFallbackQuestions("معلومات عامة", count, "سهل");
    }

    var enriched = selected.map(function(q, i) {
      return Object.assign({}, q, {
        id: "q_" + Date.now() + "_" + i,
        source: q.source || "bank"
      });
    });

    return res.json({ questions: enriched, meta: { source: "bank-ai" } });
  } catch (err) {
    return res.status(500).json({ error: "فشل في جلب الأسئلة", details: err.message });
  }
});

app.get("/api/health", function(req, res) {
  res.json({
    status: "ok",
    bankCount: loadBankQuestions().length + loadGeneratedQuestions().length,
    persistentStorage: PERSISTENT_STORAGE,
    dataDir: DATA_DIR
  });
});

app.use(function(req, res) {
  res.sendFile(path.join(__dirname, "../public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("عالم التحديات يعمل على " + PORT + " | البنك: " + (loadBankQuestions().length + loadGeneratedQuestions().length) + " سؤال");
});
