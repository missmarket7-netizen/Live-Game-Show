const fs = require("fs");

const filePath = "server/server.js";

if (!fs.existsSync(filePath)) {
  console.error("❌ لم أجد server/server.js");
  process.exit(1);
}

let source = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");

if (source.includes("__SANITIZE_SINGLE_ANSWER_V1__")) {
  console.log("ℹ️ إصلاح السيرفر للإجابة الواحدة مطبق مسبقًا.");
  process.exit(0);
}

const replacement = String.raw`/* __SANITIZE_SINGLE_ANSWER_V1__ */
function sanitizeQuestion(q) {
  if (!q || !q.question) return null;

  const question = String(q.question || "").trim();
  if (!question) return null;

  const category = String(q.category || "معلومات عامة").trim();
  const difficulty = String(q.difficulty || "متوسط").trim();

  const normalizedCategory = category
    .replace(/[أإآا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase();

  const isFreeCategory =
    normalizedCategory === "سرعه" ||
    normalizedCategory === "الغاز" ||
    normalizedCategory === "لغز" ||
    normalizedCategory === "speed" ||
    normalizedCategory === "riddles";

  let rawOptions = [];

  if (Array.isArray(q.options)) {
    rawOptions = q.options
      .map((o) => String(o == null ? "" : o).trim())
      .filter(Boolean);
  } else if (q.options && typeof q.options === "object") {
    rawOptions = Object.values(q.options)
      .map((o) => String(o == null ? "" : o).trim())
      .filter(Boolean);
  }

  const explicitAnswer = q.answer ? String(q.answer).trim() : "";

  let correctIndex = null;
  if (
    q.correctIndex !== null &&
    q.correctIndex !== undefined &&
    q.correctIndex !== "" &&
    Number.isInteger(Number(q.correctIndex))
  ) {
    correctIndex = Number(q.correctIndex);
  }

  let finalAnswer = explicitAnswer;

  if (!finalAnswer && rawOptions.length === 1) {
    finalAnswer = rawOptions[0];
  }

  if (!finalAnswer && rawOptions.length > 1) {
    if (
      correctIndex !== null &&
      correctIndex >= 0 &&
      correctIndex < rawOptions.length
    ) {
      finalAnswer = String(rawOptions[correctIndex] || "").trim();
    }
  }

  const explanation = String(q.explanation || "").trim();

  if (finalAnswer) {
    return {
      category,
      difficulty,
      question,
      options: [finalAnswer],
      correctIndex: 0,
      answer: finalAnswer,
      explanation: explanation || ("الإجابة: " + finalAnswer),
      source: q.source || "bank"
    };
  }

  if (isFreeCategory) {
    return {
      category,
      difficulty,
      question,
      options: [],
      correctIndex: null,
      answer: "",
      explanation: explanation || "إجابة حرة؛ الحكم للمضيف وفق شروط السؤال.",
      source: q.source || "bank"
    };
  }

  return null;
}`;

function findFunctionEnd(src, startIndex) {
  const braceStart = src.indexOf("{", startIndex);
  if (braceStart < 0) return -1;

  let depth = 0;
  let inString = false;
  let stringChar = "";
  let escape = false;

  for (let i = braceStart; i < src.length; i += 1) {
    const ch = src[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (inString) {
      if (ch === "\\") {
        escape = true;
      } else if (ch === stringChar) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }

  return -1;
}

let output = "";
let pos = 0;
let replacedCount = 0;

while (true) {
  const idx = source.indexOf("function sanitizeQuestion", pos);
  if (idx < 0) break;

  const end = findFunctionEnd(source, idx);
  if (end < 0) {
    console.error("❌ لم أجد نهاية دالة sanitizeQuestion بشكل آمن.");
    process.exit(1);
  }

  output += source.slice(pos, idx);
  output += replacement;
  pos = end;
  replacedCount += 1;
}

output += source.slice(pos);

if (replacedCount === 0) {
  console.error("❌ لم أجد function sanitizeQuestion داخل server/server.js");
  process.exit(1);
}

fs.writeFileSync(filePath, output, "utf8");

console.log("✅ تم إصلاح server/server.js ليقبل الإجابة الواحدة والأسئلة الحرة.");
console.log("   عدد الدوال المستبدلة: " + replacedCount);
