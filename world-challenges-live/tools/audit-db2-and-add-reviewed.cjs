const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const target = process.argv[2] || path.join("server", "questions", "db2.json");
const additionsFile = path.join("tools", "reviewed-db2-additions.jsonl");

if (!fs.existsSync(target)) {
  console.error("❌ الملف غير موجود:", target);
  process.exit(1);
}

if (!fs.existsSync(additionsFile)) {
  console.error("❌ لم أجد tools/reviewed-db2-additions.jsonl");
  process.exit(1);
}

const QUESTION_DIRS = [
  path.join(process.cwd(), "server", "questions"),
  path.join(process.cwd(), "questions")
];

const SKIP_FILES = new Set([
  "cycle_state.json",
  "cycle_state_engine.json",
  "live_state.json",
  "package.json",
  "audit-report.json",
  "generated_questions.json"
]);

function normalizeText(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function keyFromText(text) {
  return crypto
    .createHash("sha1")
    .update(normalizeText(text))
    .digest("hex")
    .slice(0, 32);
}

function normalizeCategory(value) {
  const n = normalizeText(value);

  if (!n) return "معلومات عامة";

  if (
    n === "معلومات عامه" ||
    n === "عام" ||
    n === "ثقافه عامه" ||
    n === "معلومات"
  ) {
    return "معلومات عامة";
  }

  if (
    n === "اسئله دينيه" ||
    n === "اسلاميات" ||
    n === "ثقافه اسلاميه" ||
    n === "قران" ||
    n === "سيره" ||
    n === "صحابه" ||
    n === "انبياء"
  ) {
    return "دين";
  }

  if (n === "الغاز" || n === "لغز" || n === "احجيات") {
    return "ألغاز";
  }

  if (n === "رياضه" || n === "كوره" || n === "كره قدم") {
    return "رياضة";
  }

  if (n === "سرعه" || n === "سريع") {
    return "سرعة";
  }

  if (n === "تقنيه") {
    return "تكنولوجيا";
  }

  return String(value || "معلومات عامة").trim();
}

function normalizeDifficulty(value) {
  const n = normalizeText(value);

  if (n === "سهل" || n === "مبتدئ" || n === "سهله" || n === "easy") return "سهل";
  if (n === "متوسط" || n === "عادي" || n === "متوسطه" || n === "medium" || n === "متدرج") return "متوسط";
  if (n === "صعب" || n === "متقدم" || n === "صعبه" || n === "hard") return "صعب";

  return "متوسط";
}

function isFreeCategory(category) {
  const n = normalizeText(category);
  return n.includes("سرعه") || n.includes("الغاز") || n.includes("لغز");
}

function extractAnswerFromExplanation(explanation) {
  const text = String(explanation || "").trim();
  const m = text.match(/الإجابة\s+الصحيحة\s*[:\-]?\s*(.+?)\s*\.?$/);
  return m ? m[1].trim() : "";
}

function sanitize(raw, sourceLabel) {
  if (!raw || typeof raw !== "object") return null;

  const question = String(raw.question || "").trim();
  if (!question) return null;

  const category = normalizeCategory(raw.category);
  const difficulty = normalizeDifficulty(raw.difficulty);

  let options = [];

  if (Array.isArray(raw.options)) {
    options = raw.options
      .map((o) => String(o == null ? "" : o).trim())
      .filter(Boolean);
  } else if (raw.options && typeof raw.options === "object") {
    options = Object.values(raw.options)
      .map((o) => String(o == null ? "" : o).trim())
      .filter(Boolean);
  }

  let correctIndex = null;

  if (
    raw.correctIndex !== null &&
    raw.correctIndex !== undefined &&
    raw.correctIndex !== "" &&
    Number.isInteger(Number(raw.correctIndex))
  ) {
    correctIndex = Number(raw.correctIndex);
  }

  let answer = raw.answer ? String(raw.answer).trim() : "";

  if (!answer && Array.isArray(raw.validAnswers) && raw.validAnswers.length) {
    answer = raw.validAnswers
      .map((v) => String(v == null ? "" : v).trim())
      .filter(Boolean)
      .join(" أو ");
  }

  if (!answer && options.length === 1) {
    answer = options[0];
  }

  if (!answer && options.length > 1) {
    if (correctIndex !== null && correctIndex >= 0 && correctIndex < options.length) {
      answer = options[correctIndex];
    } else {
      answer = extractAnswerFromExplanation(raw.explanation);
    }
  }

  let explanation = String(raw.explanation || "").trim();

  if (options.length === 0) {
    if (answer) {
      options = [answer];
      correctIndex = 0;
    } else if (isFreeCategory(category)) {
      return {
        category,
        difficulty,
        question,
        options: [],
        correctIndex: null,
        answer: "",
        explanation: explanation || "إجابة حرة؛ الحكم للمضيف وفق شروط السؤال.",
        source: raw.source || sourceLabel
      };
    } else {
      return null;
    }
  }

  if (options.length === 1) {
    correctIndex = 0;
    answer = options[0];
  } else if (options.length === 4) {
    if (correctIndex === null || correctIndex < 0 || correctIndex > 3) {
      if (answer) {
        correctIndex = options.indexOf(answer);
      }
    }

    if (correctIndex === null || correctIndex < 0 || correctIndex > 3) {
      return null;
    }

    answer = options[correctIndex];
  } else {
    if (answer) {
      options = [answer];
      correctIndex = 0;
    } else if (correctIndex !== null && correctIndex >= 0 && correctIndex < options.length) {
      answer = options[correctIndex];
      options = [answer];
      correctIndex = 0;
    } else {
      return null;
    }
  }

  if (!answer) return null;

  if (!explanation) {
    explanation = "الإجابة: " + answer;
  }

  return {
    category,
    difficulty,
    question,
    options,
    correctIndex,
    answer,
    explanation,
    source: raw.source || sourceLabel
  };
}

function score(q) {
  return (
    (q.answer ? 3 : 0) +
    (q.explanation ? Math.min(20, q.explanation.length / 10) : 0) +
    (Array.isArray(q.options) && q.options.length ? 2 : 0)
  );
}

function extractArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.questions)) return payload.questions;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.bank)) return payload.bank;
  return [];
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function collectExternalKeys(targetPath) {
  const keys = new Set();
  const targetResolved = path.resolve(targetPath);

  for (const dir of QUESTION_DIRS) {
    try {
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir).sort();

      for (const file of files) {
        const lower = file.toLowerCase();
        if (!lower.endsWith(".json")) continue;
        if (SKIP_FILES.has(lower)) continue;

        const full = path.join(dir, file);
        if (path.resolve(full) === targetResolved) continue;

        const payload = readJsonSafe(full);
        const items = extractArray(payload);

        for (const item of items) {
          const q = item && item.question ? String(item.question) : "";
          const key = normalizeText(q);
          if (key) keys.add(key);
        }
      }
    } catch (e) {}
  }

  return keys;
}

let payload;

try {
  payload = JSON.parse(fs.readFileSync(target, "utf8").replace(/^\uFEFF/, ""));
} catch (e) {
  console.error("❌ فشل قراءة JSON:", e.message);
  process.exit(1);
}

const input = extractArray(payload);
const externalKeys = collectExternalKeys(target);
const map = new Map();

const report = {
  input: input.length,
  kept: 0,
  converted: 0,
  freeKept: 0,
  duplicatesInFile: 0,
  dropped: []
};

for (const raw of input) {
  const q = sanitize(raw, "bank");

  if (!q) {
    report.dropped.push({
      question: raw && raw.question ? raw.question : "",
      reason: "صيغة غير صالحة أو لا توجد إجابة مؤكدة"
    });
    continue;
  }

  if (
    Array.isArray(raw.options) &&
    raw.options.length > 1 &&
    q.options.length === 1
  ) {
    report.converted += 1;
  }

  if (!q.answer && isFreeCategory(q.category)) {
    report.freeKept += 1;
  }

  const key = normalizeText(q.question);

  if (map.has(key)) {
    report.duplicatesInFile += 1;

    if (score(q) > score(map.get(key))) {
      map.set(key, q);
    }

    continue;
  }

  map.set(key, q);
  report.kept += 1;
}

function readAdditions() {
  const text = fs.readFileSync(additionsFile, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const out = [];
  let bad = 0;

  for (const line of lines) {
    try {
      out.push(JSON.parse(line));
    } catch (e) {
      bad += 1;
    }
  }

  if (bad) {
    console.warn("⚠️ تم تجاهل " + bad + " سطر غير صالح في additions.");
  }

  return out;
}

const additions = readAdditions();

let addedNew = 0;
let skippedDuplicate = 0;
let skippedInvalid = 0;

for (const raw of additions) {
  const q = sanitize(raw, "reviewed");

  if (!q) {
    skippedInvalid += 1;
    continue;
  }

  const key = normalizeText(q.question);

  if (map.has(key) || externalKeys.has(key)) {
    skippedDuplicate += 1;
    continue;
  }

  map.set(key, q);
  externalKeys.add(key);
  addedNew += 1;
}

const difficultyOrder = {
  "سهل": 1,
  "متوسط": 2,
  "صعب": 3
};

const output = Array.from(map.values()).sort((a, b) => {
  const cat = String(a.category).localeCompare(String(b.category), "ar");
  if (cat !== 0) return cat;

  const diff = (difficultyOrder[a.difficulty] || 9) - (difficultyOrder[b.difficulty] || 9);
  if (diff !== 0) return diff;

  return String(a.question).localeCompare(String(b.question), "ar");
});

fs.writeFileSync(target, JSON.stringify(output, null, 2), "utf8");

console.log("====================================");
console.log("✅ تم تدقيق وتحديث الملف:", target);
console.log("📥 المدخل:", report.input);
console.log("📤 المخرج:", output.length);
console.log("🛠️ المحوّل من اختيارات إلى إجابة واحدة:", report.converted);
console.log("🎤 الأسئلة الحرة المحفوظة:", report.freeKept);
console.log("♻️ المكرر داخل الملف:", report.duplicatesInFile);
console.log("✨ الأسئلة الجديدة المضافة:", addedNew);
console.log("⛔ المكرر مع البنك الخارجي:", skippedDuplicate);
console.log("⚠️ إضافات غير صالحة:", skippedInvalid);
console.log("🗑️ المحذوف:", report.dropped.length);
console.log("====================================");

if (report.dropped.length) {
  console.log("\n🗑️ أمثلة على المحذوفات:");
  report.dropped.slice(0, 25).forEach((d) => {
    console.log(" -", d.reason, "|", d.question || "");
  });

  if (report.dropped.length > 25) {
    console.log(" ... وغيرها", report.dropped.length - 25, "سؤالًا");
  }
}
