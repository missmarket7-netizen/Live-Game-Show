import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "../public")));

// ─── قراءة المفاتيح ───
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

// ─── قائمة المزودين بالترتيب ───
const PROVIDERS = [
  { name: "gemini", key: GEMINI_API_KEY, call: callGemini },
  { name: "openrouter", key: OPENROUTER_API_KEY, call: callOpenRouter },
  { name: "groq", key: GROQ_API_KEY, call: callGroq }
];

console.log(`🌎 عالم التحديات — Fallback Mode (مع سجلات مفصلة)`);
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

// ─── تنظيف JSON ───
function cleanJson(s) {
  s = s.replace(/```json|```/g, "").trim();
  let start = s.indexOf('[');
  let end = s.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(s.slice(start, end + 1));
  }
  const objMatch = s.match(/\{.*\}/s);
  if (objMatch) {
    try {
      const obj = JSON.parse(objMatch[0]);
      if (obj.question && obj.options) return [obj];
    } catch (_) {}
  }
  throw new Error("لم يتم العثور على JSON صالح: " + s.slice(0, 300));
}

// ─── دوال المزودين (مع مهلة 30 ثانية) ───

// 1. Gemini
async function callGemini(prompt) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY غير محددة");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
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
    console.log("📝 Gemini raw (first 150 chars):", text.slice(0, 150));
    return cleanJson(text);
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// 2. OpenRouter
async function callOpenRouter(prompt) {
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY غير محددة");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
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
        temperature: 0.7
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
    console.log("📝 OpenRouter raw (first 150 chars):", content.slice(0, 150));
    return cleanJson(content);
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// 3. Groq
async function callGroq(prompt) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY غير محددة");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
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
        temperature: 0.7
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
    console.log("📝 Groq raw (first 150 chars):", content.slice(0, 150));
    return cleanJson(content);
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ─── الدالة الأساسية مع Fallback ───
async function callWithFallback(prompt) {
  const errors = [];
  for (const provider of PROVIDERS) {
    if (!provider.key) {
      console.log(`⏭️  تخطي ${provider.name} (لا يوجد مفتاح)`);
      continue;
    }
    try {
      console.log(`🔄 محاولة استخدام ${provider.name}...`);
      const result = await provider.call(prompt);
      console.log(`✅ نجح ${provider.name}!`);
      return result;
    } catch (err) {
      console.log(`❌ فشل ${provider.name}: ${err.message}`);
      errors.push({ provider: provider.name, error: err.message });
    }
  }
  const summary = errors.map(e => `${e.provider}: ${e.error}`).join(" | ");
  throw new Error(`جميع المزودين فشلوا: ${summary}`);
}

// ─── اختبار المفاتيح عند بدء التشغيل (اختياري) ───
async function testKeys() {
  console.log("🔍 جاري اختبار المفاتيح...");
  for (const p of PROVIDERS) {
    if (!p.key) continue;
    try {
      // اختبار سريع باستخدام طلب بسيط
      await p.call("أعطني سؤالاً واحداً فقط في أي فئة.");
      console.log(`   ✅ ${p.name} يعمل بشكل جيد.`);
    } catch (err) {
      console.log(`   ❌ ${p.name} فشل في الاختبار: ${err.message}`);
    }
  }
}

// ─── API endpoint ───
app.post("/api/questions", async (req, res) => {
  console.log("📩 تم استلام طلب /api/questions");
  console.log("📦 البيانات:", JSON.stringify(req.body, null, 2));

  try {
    const { category = "معلومات عامة", count = 10, difficulty = "سهل", avoid = [] } = req.body || {};
    const n = Math.min(Math.max(Number(count) || 10, 1), 50);
    const prompt = `أنشئ ${n} أسئلة من فئة "${category}" بمستوى "${difficulty}".
لا تستخدم هذه الأسئلة: ${(Array.isArray(avoid) ? avoid.slice(-80) : []).join(" | ")}.
أعد مصفوفة JSON فقط.`;

    console.log("📝 prompt:", prompt.slice(0, 200) + "...");

    const data = await callWithFallback(prompt);

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("تم توليد 0 سؤال، حاول مرة أخرى.");
    }

    console.log(`✅ تم توليد ${data.length} سؤال بنجاح.`);
    res.json({ questions: data });
  } catch (e) {
    console.error("❌ API Error:", e.message);
    res.status(500).json({ error: e.message });
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

// ─── بدء الخادم ───
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🌎 عالم التحديات — LIVE GAME SHOW (Fallback Mode)`);
  console.log(`   Server running on http://localhost:${PORT}`);
  console.log(`   ترتيب المزودين: ${PROVIDERS.map(p => p.name).join(" → ")}`);

  // اختبار المفاتيح (اختياري، يمكن تعطيله)
  await testKeys();
});
