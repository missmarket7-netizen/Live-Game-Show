import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "../public")));

// ─── اقرأ مفاتيح API من البيئة ───
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const AI_PROVIDER = (process.env.AI_PROVIDER || "gemini").toLowerCase();

console.log(`🤖 AI Provider: ${AI_PROVIDER}`);
if (AI_PROVIDER === "gemini" && !GEMINI_API_KEY) {
  console.warn("⚠️ GEMINI_API_KEY غير موجودة في .env");
}
if (AI_PROVIDER === "openrouter" && !OPENROUTER_API_KEY) {
  console.warn("⚠️ OPENROUTER_API_KEY غير موجودة في .env");
}

// ─── دالة اختبار صحة مفتاح Gemini ───
async function testGeminiKey() {
  if (!GEMINI_API_KEY) return false;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    const res = await fetch(url);
    if (res.ok) {
      console.log("✅ Gemini API Key صالح.");
      return true;
    } else {
      console.warn(`❌ Gemini API Key غير صالح (HTTP ${res.status}).`);
      return false;
    }
  } catch (e) {
    console.error("❌ فشل اختبار Gemini:", e.message);
    return false;
  }
}

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

// ─── تنظيف الـ JSON من الشوائب ───
function cleanJson(s) {
  s = s.replace(/```json|```/g, "").trim();
  // إذا كان النص يبدأ بـ { ... } وليس [ ... ]، نحاول استخراج الكائن
  let firstBracket = s.indexOf('[');
  let lastBracket = s.lastIndexOf(']');
  if (firstBracket === -1 || lastBracket === -1 || lastBracket < firstBracket) {
    // قد يكون كائناً واحداً
    const objMatch = s.match(/\{.*\}/s);
    if (objMatch) {
      try {
        const obj = JSON.parse(objMatch[0]);
        if (obj.question && obj.options) {
          return [obj];
        }
      } catch (_) {}
    }
    throw new Error("لم يتم العثور على مصفوفة JSON صالحة: " + s.slice(0, 200));
  }
  return JSON.parse(s.slice(firstBracket, lastBracket + 1));
}

// ─── استدعاء Gemini API ───
async function callGemini(prompt) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY غير محددة");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: SYSTEM + "\n\n" + prompt }] }],
      generationConfig: { temperature: 0.7, responseMimeType: "application/json" }
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) throw new Error("لم يرد Gemini بنص");
  return cleanJson(text);
}

// ─── استدعاء OpenRouter API ───
async function callOpenRouter(prompt) {
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY غير محددة");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`
    },
    body: JSON.stringify({
      model: "openrouter/free",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content || "";
  if (!content) throw new Error("لم يرد OpenRouter بنص");
  return cleanJson(content);
}

// ─── API endpoint ───
app.post("/api/questions", async (req, res) => {
  try {
    const { category = "معلومات عامة", count = 10, difficulty = "سهل", avoid = [] } = req.body || {};
    const n = Math.min(Math.max(Number(count) || 10, 1), 50);
    const prompt = `أنشئ ${n} أسئلة من فئة "${category}" بمستوى "${difficulty}".
لا تستخدم هذه الأسئلة: ${(Array.isArray(avoid) ? avoid.slice(-80) : []).join(" | ")}.
أعد مصفوفة JSON فقط.`;

    let data;
    if (AI_PROVIDER === "openrouter") {
      data = await callOpenRouter(prompt);
    } else {
      data = await callGemini(prompt);
    }

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("لم يتم توليد أسئلة، تأكد من صحة المفتاح أو جرب مزوداً آخر.");
    }

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
    provider: AI_PROVIDER,
    geminiKeySet: !!GEMINI_API_KEY,
    openrouterKeySet: !!OPENROUTER_API_KEY
  });
});

// ─── SPA Fallback ───
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public", "index.html"));
});

// ─── بدء الخادم ───
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🌎 عالم التحديات — LIVE GAME SHOW`);
  console.log(`   Server running on http://localhost:${PORT}`);
  console.log(`   AI Provider: ${AI_PROVIDER}`);

  // اختبار مفتاح Gemini (إذا كان المزود هو Gemini)
  if (AI_PROVIDER === "gemini") {
    const valid = await testGeminiKey();
    if (!valid) {
      console.warn("⚠️ يرجى تحديث مفتاح Gemini API في ملف .env أو استخدام OpenRouter.");
    }
  }
});
