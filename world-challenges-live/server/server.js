import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ─── منع req.body من أن يكون undefined ───
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});
app.use(express.json({ limit: "1mb" }));

// ─── خدمة الملفات الثابتة من مجلد public ───
app.use(express.static(path.join(__dirname, "../public")));

// ─── قراءة المفاتيح ───
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

// ─── تعريف المزودين ───
const PROVIDERS = [
  {
    name: "gemini",
    key: GEMINI_API_KEY,
    call: async (prompt) => {
      if (!GEMINI_API_KEY) throw new Error("مفتاح Gemini غير موجود");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: SYSTEM + "\n\n" + prompt }] }],
            generationConfig: { temperature: 0.7 }
          })
        });
        clearTimeout(timeout);
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`);
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
    call: async (prompt) => {
      if (!OPENROUTER_API_KEY) throw new Error("مفتاح OpenRouter غير موجود");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: process.env.OPENROUTER_MODEL || "openrouter/free",
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: prompt }
            ],
            temperature: 0.7,
            plugins: [{ id: "response-healing" }]
          })
        });
        clearTimeout(timeout);
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`OpenRouter HTTP ${res.status}: ${errText.slice(0, 200)}`);
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
    call: async (prompt) => {
      if (!GROQ_API_KEY) throw new Error("مفتاح Groq غير موجود");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
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
              { role: "system", content: SYSTEM },
              { role: "user", content: prompt }
            ],
            temperature: 0.7,
            response_format: { type: "json_object" }
          })
        });
        clearTimeout(timeout);
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Groq HTTP ${res.status}: ${errText.slice(0, 200)}`);
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

console.log(`🌎 عالم التحديات — وضع الاحتياطي (Fallback Mode)`);
PROVIDERS.forEach(p => {
  console.log(`   ${p.name}: ${p.key ? "✅ مفتاح موجود" : "❌ لا يوجد مفتاح"}`);
});
console.log(`   ترتيب المزودين: ${PROVIDERS.map(p => p.name).join(" → ")}`);

// ─── System Prompt ───
const SYSTEM = `أنت مولد أسئلة لمسابقة عربية مباشرة اسمها "عالم التحديات".
أخرج JSON فقط. كل سؤال يحتوي على:
- category: الفئة
- difficulty: سهل/متوسط/صعب
- question: نص السؤال بالعربية الفصحى الواضحة
- options: مصفوفة من 4 خيارات
- correctIndex: رقم الإجابة الصحيحة (0-3)
- explanation: شرح مختصر ومفيد للمقدم

قواعد مهمة:
- الأسئلة واضحة وسهلة الفهم
- تجنب المختلف عليه والمتغير
- في الدين: معلومات أساسية مشهورة، تجنب الفتاوى والخلافات
- لا تكرر الأسئلة
- الخيارات متقاربة منطقياً لكن واحد فقط صحيح
- الشرح يكون معلومة إضافية مفيدة للمقدم`;

// ─── دالة تحليل JSON ───
function extractAndParseJSON(rawText) {
  let cleaned = rawText.replace(/```json|```/g, "").trim();
  const objectMatch = cleaned.match(/(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})/s);
  if (objectMatch) {
    try { return JSON.parse(objectMatch[1]); } catch (_) {}
  }
  const arrayMatch = cleaned.match(/(\[[^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*\])/s);
  if (arrayMatch) {
    try { return JSON.parse(arrayMatch[1]); } catch (_) {}
  }
  try { return JSON.parse(cleaned); } catch (_) {
    throw new Error(`تعذر تحليل JSON من النص: ${rawText.slice(0, 300)}`);
  }
}

// ─── دالة الاحتياطي ───
async function callWithFallback(prompt) {
  const errors = [];
  for (const provider of PROVIDERS) {
    if (!provider.key) {
      console.log(`⏭️  تخطي ${provider.name} (لا يوجد مفتاح)`);
      continue;
    }
    try {
      console.log(`🔄 محاولة استخدام ${provider.name}...`);
      const rawResponse = await provider.call(prompt);
      console.log(`📝 الرد الخام (أول 150 حرف):`, rawResponse.slice(0, 150));

      const parsed = extractAndParseJSON(rawResponse);
      console.log(`✅ نجح ${provider.name}!`);

      if (Array.isArray(parsed)) {
        return parsed;
      } else if (parsed && typeof parsed === 'object') {
        if (parsed.questions && Array.isArray(parsed.questions)) {
          return parsed.questions;
        }
        return [parsed];
      } else {
        throw new Error("الرد ليس مصفوفة ولا كائن صالح");
      }
    } catch (err) {
      console.log(`❌ فشل ${provider.name}: ${err.message}`);
      errors.push({ provider: provider.name, error: err.message });
    }
  }
  const summary = errors.map(e => `${e.provider}: ${e.error}`).join(" | ");
  throw new Error(`جميع المزودين فشلوا: ${summary}`);
}

// ─── API endpoint (مع منع الانهيار) ───
app.post("/api/questions", async (req, res) => {
  console.log("📩 تم استلام طلب /api/questions");
  console.log("📦 البيانات:", JSON.stringify(req.body, null, 2));

  try {
    const { category = "معلومات عامة", count = 10, difficulty = "سهل", avoid = [] } = req.body;
    const n = Math.min(Math.max(Number(count) || 10, 1), 50);
    const prompt = `أنشئ ${n} أسئلة من فئة "${category}" بمستوى "${difficulty}".
لا تستخدم هذه الأسئلة: ${(Array.isArray(avoid) ? avoid.slice(-80) : []).join(" | ")}.
أعد مصفوفة JSON فقط.`;

    console.log("📝 المطالبة:", prompt.slice(0, 200) + "...");

    const data = await callWithFallback(prompt);

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("تم توليد 0 سؤال، حاول مرة أخرى.");
    }

    console.log(`✅ تم توليد ${data.length} سؤال بنجاح.`);
    return res.json({ questions: data });
  } catch (err) {
    console.error("❌ خطأ في الـ API:", err.message);
    // ⚠️ هنا نرسل رد خطأ بدلاً من رمي الخطأ
    return res.status(500).json({ 
      error: 'فشل في توليد الأسئلة', 
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
      keySet: !!p.key
    }))
  });
});

// ─── SPA Fallback ───
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "../public", "index.html"));
});

// ─── تشغيل الخادم باستخدام المنفذ الديناميكي ───
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌎 عالم التحديات — LIVE GAME SHOW (وضع الاحتياطي)`);
  console.log(`   الخادم يعمل على http://localhost:${PORT}`);
  console.log(`   ترتيب المزودين: ${PROVIDERS.map(p => p.name).join(" → ")}`);
});
