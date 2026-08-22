import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "../public")));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyCJ6J1EI4w4jGE6i4z6GQCpHI6R0vQOYdA";

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

function cleanJson(s) {
  s = s.replace(/```json|```/g, "").trim();
  const a = s.indexOf("[");
  const b = s.lastIndexOf("]");
  if (a < 0 || b < a) throw new Error("AI returned invalid JSON");
  return JSON.parse(s.slice(a, b + 1));
}

async function gemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: SYSTEM + "\n\n" + prompt }] }],
      generationConfig: { temperature: 0.7, responseMimeType: "application/json" }
    })
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const json = await res.json();
  return cleanJson(json.candidates?.[0]?.content?.parts?.[0]?.text || "");
}

app.post("/api/questions", async (req, res) => {
  try {
    const { category = "معلومات عامة", count = 10, difficulty = "سهل", avoid = [] } = req.body || {};
    const n = Math.min(Math.max(Number(count) || 10, 1), 50);
    const prompt = `أنشئ ${n} أسئلة من فئة "${category}" بمستوى "${difficulty}".
لا تستخدم هذه الأسئلة: ${(Array.isArray(avoid) ? avoid.slice(-80) : []).join(" | ")}.
أعد مصفوفة JSON فقط.`;
    const data = await gemini(prompt);
    if (!Array.isArray(data)) throw new Error("AI response is not an array");
    res.json({ questions: data });
  } catch (e) {
    console.error("API Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌎 عالم التحديات — LIVE GAME SHOW`);
  console.log(`   Server: http://localhost:${PORT}`);
});
