import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ─── Middleware ───
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "../public")));

// ─── قراءة المفاتيح ───
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

// ─── دالة بناء System Prompt (ديناميكية) ───
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
8. الشرح معلومة اضافية مفيدة للمقدم

مثال على الصيغة:
[
  {
    "category": "معلومات عامة",
    "difficulty": "سهل",
    "question": "ما هي عاصمة المملكة العربية السعودية؟",
    "options": ["جدة", "الرياض", "مكة", "الدمام"],
    "correctIndex": 1,
    "explanation": "الرياض هي العاصمة السياسية والادارية للمملكة منذ عام 1932."
  }
]`;
}

// ─── دالة تحليل JSON محسنة ───
function extractAndParseJSON(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error("الرد فارغ او غير صالح");
  }

  let cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try { return JSON.parse(arrayMatch[0]); } catch (_) {}
  }

  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try { return JSON.parse(objectMatch[0]); } catch (_) {}
  }

  try { return JSON.parse(cleaned); } catch (_) {}

  throw new Error(`تعذر تحليل JSON: ${rawText.slice(0, 200)}`);
}

// ─── دوال المزودين ───
const PROVIDERS = [
  {
    name: "gemini",
    key: GEMINI_API_KEY,
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
            contents: [{
              role: "user",
              parts: [{ text: buildSystemPrompt(count) + "\n\n" + prompt }]
            }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 4000 }
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
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }
    }
  },
  {
    name: "openrouter",
    key: OPENROUTER_API_KEY,
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
            model: process.env.OPENROUTER_MODEL || "mistralai/mistral-7b-instruct:free",
            messages: [
              { role: "system", content: buildSystemPrompt(count) },
              { role: "user", content: prompt }
            ],
            temperature: 0.7,
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
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }
    }
  },
  {
    name: "groq",
    key: GROQ_API_KEY,
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
            model: process.env.GROQ_MODEL || "llama3-70b-8192",
            messages: [
              { role: "system", content: buildSystemPrompt(count) },
              { role: "user", content: prompt }
            ],
            temperature: 0.7,
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
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }
    }
  }
];

// ─── اسئلة احتياطية جاهزة (لو فشلت كل المزودين) ───
function getFallbackQuestions(category, count, difficulty) {
  const allQuestions = [
    { category: "معلومات عامة", difficulty: "سهل", question: "ما هي عاصمة المملكة العربية السعودية؟", options: ["جدة", "الرياض", "مكة", "الدمام"], correctIndex: 1, explanation: "الرياض هي العاصمة السياسية والادارية للمملكة منذ عام 1932." },
    { category: "معلومات عامة", difficulty: "سهل", question: "كم عدد ايام السنة الميلادية؟", options: ["365", "364", "366", "360"], correctIndex: 0, explanation: "السنة الميلادية العادية تتكون من 365 يوما." },
    { category: "معلومات عامة", difficulty: "متوسط", question: "ما هو اطول نهر في العالم؟", options: ["النيل", "الامازون", "الفرات", "اليانغتسي"], correctIndex: 0, explanation: "نهر النيل يبلغ طوله حوالي 6650 كم، وهو الاطول في العالم." },
    { category: "رياضة", difficulty: "سهل", question: "كم عدد لاعبي فريق كرة القدم في الملعب؟", options: ["10", "11", "12", "9"], correctIndex: 1, explanation: "يتكون فريق كرة القدم من 11 لاعبا في الملعب." },
    { category: "رياضة", difficulty: "متوسط", question: "في اي اقيمت اول بطولة كاس عالم؟", options: ["1928", "1930", "1934", "1926"], correctIndex: 1, explanation: "اقيمت اول بطولة كاس عالم لكرة القدم في الاوروغواي عام 1930." },
    { category: "علوم", difficulty: "سهل", question: "ما هو اقرب كوكب الى الشمس؟", options: ["الارض", "الزهرة", "عطارد", "المريخ"], correctIndex: 2, explanation: "عطارد هو اقرب كوكب الى الشمس وثاني اصغر كواكب المجموعة الشمسية." },
    { category: "علوم", difficulty: "متوسط", question: "ما هو العنصر الكيميائي الذي يرمز له بـ Au؟", options: ["الفضة", "النحاس", "الذهب", "الالمنيوم"], correctIndex: 2, explanation: "Au هو الرمز الكيميائي للذهب من الكلمة اللاتينية Aurum." },
    { category: "تاريخ", difficulty: "سهل", question: "في اي عام تأسست المملكة العربية السعودية؟", options: ["1925", "1930", "1932", "1935"], correctIndex: 2, explanation: "توحدت المملكة العربية السعودية تحت حكم الملك عبدالعزيز عام 1932." },
    { category: "تاريخ", difficulty: "متوسط", question: "من هو مكتشف امريكا؟", options: ["فاسكو دا غاما", "كولومبوس", "ماجلان", "كوك"], correctIndex: 1, explanation: "اكتشف كريستوفر كولومبوس الامريكتين عام 1492." },
    { category: "دين", difficulty: "سهل", question: "كم عدد ركعات صلاة الفجر؟", options: ["ركعتان", "اربع ركعات", "ثلاث ركعات", "ركعة"], correctIndex: 0, explanation: "صلاة الفجر ركعتان فرض." },
    { category: "دين", difficulty: "متوسط", question: "في اي شهر نزل القران الكريم؟", options: ["شعبان", "رمضان", "شوال", "رجب"], correctIndex: 1, explanation: "نزل القران الكريم في شهر رمضان المبارك." },
    { category: "تقنية", difficulty: "سهل", question: "ما هي شركة التقنية التي اسسها بيل جيتس؟", options: ["Apple", "Google", "Microsoft", "IBM"], correctIndex: 2, explanation: "اسس بيل جيتس شركة مايكروسوفت عام 1975 مع بول ألين." },
    { category: "تقنية", difficulty: "متوسط", question: "ما هو اختصار HTML؟", options: ["Hyper Text Markup Language", "High Tech Modern Language", "Home Tool Markup Language", "Hyperlinks Text Mode Language"], correctIndex: 0, explanation: "HTML تعني لغة ترميز النصوص التشعبية." },
    { category: "جغرافيا", difficulty: "سهل", question: "ما هي اكبر قارة في العالم من حيث المساحة؟", options: ["افريقيا", "اسيا", "امريكا الشمالية", "اوروبا"], correctIndex: 1, explanation: "اسيا هي اكبر قارة في العالم وتغطي حوالي 30% من مساحة اليابسة." },
    { category: "جغرافيا", difficulty: "متوسط", question: "ما هو اعمق نقطة في المحيطات؟", options: ["خندق ماريانا", "خندق بورتوريكو", "خندق تونغا", "خندق الفلبين"], correctIndex: 0, explanation: "خندق ماريانا في المحيط الهادئ هو اعمق نقطة معروفة في المحيطات." }
  ];

  let filtered = allQuestions.filter(q => q.difficulty === difficulty);
  if (filtered.length === 0) filtered = allQuestions;
  if (category !== "معلومات عامة") {
    const catFiltered = filtered.filter(q => q.category === category || q.category === "معلومات عامة");
    if (catFiltered.length > 0) filtered = catFiltered;
  }

  const shuffled = filtered.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// ─── دالة الاحتياطي المحسنة ───
async function callWithFallback(prompt, count) {
  const errors = [];
  for (const provider of PROVIDERS) {
    if (!provider.key) {
      console.log(`تخطي ${provider.name} (لا يوجد مفتاح)`);
      continue;
    }
    try {
      console.log(`محاولة استخدام ${provider.name}...`);
      const rawResponse = await provider.call(prompt, count);
      console.log(`الرد الخام (اول 200 حرف):`, rawResponse.slice(0, 200));

      const parsed = extractAndParseJSON(rawResponse);
      console.log(`نجح ${provider.name}!`);

      let questions;
      if (Array.isArray(parsed)) {
        questions = parsed;
      } else if (parsed && typeof parsed === 'object') {
        if (parsed.questions && Array.isArray(parsed.questions)) {
          questions = parsed.questions;
        } else {
          questions = [parsed];
        }
      } else {
        throw new Error("الرد ليس مصفوفة ولا كائن صالح");
      }

      const validQuestions = questions.filter(q =>
        q.question && Array.isArray(q.options) && q.options.length === 4 &&
        typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex <= 3
      );

      if (validQuestions.length === 0) {
        throw new Error("لم يتم استخراج اسئلة صالحة من الرد");
      }

      console.log(`${provider.name} ارجع ${validQuestions.length} سؤال صالح`);
      return validQuestions;

    } catch (err) {
      console.log(`فشل ${provider.name}: ${err.message}`);
      errors.push({ provider: provider.name, error: err.message });
    }
  }

  const summary = errors.map(e => `${e.provider}: ${e.error}`).join(" | ");
  throw new Error(`جميع المزودين فشلوا: ${summary}`);
}

// ─── API endpoint (مع منع الانهيار الكامل) ───
app.post("/api/questions", async (req, res) => {
  console.log("تم استلام طلب /api/questions");
  console.log("البيانات:", JSON.stringify(req.body, null, 2));

  try {
    const { category = "معلومات عامة", count = 10, difficulty = "سهل", avoid = [] } = req.body;
    const n = Math.min(Math.max(Number(count) || 10, 1), 50);

    const prompt = `انشئ بالضبط ${n} اسئلة من فئة "${category}" بمستوى "${difficulty}".
قواعد:
- اخرج مصفوفة JSON فقط
- لا تستخدم هذه الاسئلة: ${(Array.isArray(avoid) ? avoid.slice(-80) : []).join(" | ")}.
- كل سؤال يحتوي على: category, difficulty, question, options (4 خيارات), correctIndex (0-3), explanation
- لا تضيف اي نص خارج JSON`;

    console.log("المطالبة:", prompt.slice(0, 250) + "...");

    let data;
    try {
      data = await callWithFallback(prompt, n);
    } catch (aiErr) {
      console.log(`فشلت كل المزودين، استخدام الاسئلة الاحتياطية...`);
      data = getFallbackQuestions(category, n, difficulty);
      console.log(`تم استخدام ${data.length} سؤال احتياطي`);
    }

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("لم يتم توليد اي اسئلة.");
    }

    const enriched = data.map((q, i) => ({
      ...q,
      id: `q_${Date.now()}_${i}`,
      category: q.category || category,
      difficulty: q.difficulty || difficulty
    }));

    console.log(`تم ارجاع ${enriched.length} سؤال بنجاح.`);
    return res.json({ questions: enriched, source: data.length > 0 && data[0]._fallback ? "fallback" : "ai" });
  } catch (err) {
    console.error("خطأ في الـ API:", err.message);
    return res.status(500).json({
      error: 'فشل في توليد الاسئلة',
      details: err.message
    });
  }
});

// ─── Health Check ───
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    providers: PROVIDERS.map(p => ({
      name: p.name,
      keySet: !!p.key,
      available: !!p.key
    }))
  });
});

// ─── SPA Fallback ───
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "../public", "index.html"));
});

// ─── استخدام المنفذ الديناميكي ───
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`عالم التحديات — LIVE GAME SHOW`);
  console.log(`   الخادم يعمل على http://localhost:${PORT}`);
  console.log(`   المزودين المتاحين: ${PROVIDERS.filter(p => p.key).map(p => p.name).join(", ") || "لا يوجد"}`);
  console.log(`   ترتيب المحاولات: Gemini -> OpenRouter -> Groq -> Fallback`);
});
