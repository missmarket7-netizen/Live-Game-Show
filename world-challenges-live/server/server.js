import { installNoRepeatEngine } from "./no-repeat-engine.js";
import "dotenv/config";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { attachLiveRoutes } from "./live-connector.js";
import { createClient } from "@libsql/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
installNoRepeatEngine(app);


app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

app.use(express.json({ limit: "2mb" }));

const publicCandidates = [
  path.join(__dirname, "../public"),
  path.join(process.cwd(), "public"),
  path.join(__dirname, "public")
];

const staticRoot =
  publicCandidates.find((p) => fs.existsSync(p)) || publicCandidates[0];

const indexCandidates = [
  path.join(staticRoot, "index.html"),
  path.join(__dirname, "../public/index.html"),
  path.join(process.cwd(), "public/index.html")
];

const INDEX_FILE =
  indexCandidates.find((p) => fs.existsSync(p)) || indexCandidates[0];

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const DATA_CANDIDATES = [
  process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "questions")
    : "",
  path.join(__dirname, "questions"),
  path.join(process.cwd(), "questions"),
  path.join(__dirname, "..", "questions")
].filter(Boolean);

const PRIMARY_DATA_DIR =
  DATA_CANDIDATES.find((p) => fs.existsSync(p)) ||
  DATA_CANDIDATES[0] ||
  path.join(__dirname, "questions");

try {
  fs.mkdirSync(PRIMARY_DATA_DIR, { recursive: true });
} catch (e) {}

const GEN_FILE = path.join(PRIMARY_DATA_DIR, "generated_questions.json");
const CYCLE_FILE = path.join(PRIMARY_DATA_DIR, "cycle_state.json");

const EXCLUDED_CATEGORIES = new Set([
  "سينما مصرية",
  "سينما عربية"
]);

const TURSO_URL =
  process.env.TURSO_URL ||
  process.env.TURSO_DATABASE_URL ||
  "";

const TURSO_TOKEN =
  process.env.TURSO_AUTH_TOKEN ||
  process.env.TURSO_TOKEN ||
  "";

let turso = null;

function hasPersistentStorage() {
  return Boolean(turso || process.env.RAILWAY_VOLUME_MOUNT_PATH);
}

let cycleLockPromise = Promise.resolve();

function withCycleLock(task) {
  const run = cycleLockPromise.then(task, task);
  cycleLockPromise = run.then(() => undefined, () => undefined);
  return run;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function shuffleArray(input) {
  const arr = Array.isArray(input) ? input.slice() : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/* __SANITIZE_SINGLE_ANSWER_V1__ */
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
}

function parseQuestionsFromJson(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.questions)) return data.questions;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && Array.isArray(data.bank)) return data.bank;
  return [];
}

function readJsonArray(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    return parseQuestionsFromJson(parsed);
  } catch (e) {
    return [];
  }
}

function loadBankQuestions() {
  const all = [];
  const seenFiles = new Set();

  const skipFiles = new Set([
    "generated_questions.json",
    "cycle_state.json",
    "live_state.json",
    "package.json"
  ]);

  for (const dir of DATA_CANDIDATES) {
    try {
      if (!dir || !fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir);

      for (const file of files) {
        if (!file.toLowerCase().endsWith(".json")) continue;

        const lower = file.toLowerCase();
        if (skipFiles.has(lower)) continue;

        const fullPath = path.join(dir, file);
        if (seenFiles.has(fullPath)) continue;
        seenFiles.add(fullPath);

        const items = readJsonArray(fullPath);

        for (const item of items) {
          const clean = sanitizeQuestion(item);
          if (clean) all.push(clean);
        }
      }
    } catch (e) {}
  }

  return all;
}

function loadLocalGenerated() {
  const items = readJsonArray(GEN_FILE);
  return items.map(sanitizeQuestion).filter(Boolean);
}

function combineUnique(list) {
  const seen = new Set();
  const out = [];

  for (const item of list || []) {
    const q = sanitizeQuestion(item);
    if (!q) continue;

    const key = normalizeText(q.question);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    out.push(q);
  }

  return out;
}

async function initTurso() {
  if (!TURSO_URL || !TURSO_TOKEN) {
    console.warn("⚠️ Turso غير مربوط بالكامل — سيُستخدم ملف محلي مؤقت لحالة الدورة.");
    return;
  }

  try {
    turso = createClient({
      url: TURSO_URL,
      authToken: TURSO_TOKEN
    });

    await turso.execute({
      sql: `CREATE TABLE IF NOT EXISTS game_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        cycle_id INTEGER NOT NULL DEFAULT 1,
        served_keys TEXT NOT NULL DEFAULT '[]',
        shuffle_order TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT
      )`,
      args: []
    });

    await turso.execute({
      sql: `CREATE TABLE IF NOT EXISTS generated_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT,
        difficulty TEXT,
        question TEXT UNIQUE,
        options TEXT,
        correctIndex INTEGER,
        explanation TEXT,
        source TEXT DEFAULT 'ai',
        created_at TEXT
      )`,
      args: []
    });

    try {
      await turso.execute({
        sql: `ALTER TABLE game_state ADD COLUMN served_keys TEXT NOT NULL DEFAULT '[]'`,
        args: []
      });
    } catch (e) {}

    try {
      await turso.execute({
        sql: `ALTER TABLE game_state ADD COLUMN shuffle_order TEXT NOT NULL DEFAULT '[]'`,
        args: []
      });
    } catch (e) {}

    await turso.execute({
      sql: `INSERT OR IGNORE INTO game_state
            (id, cycle_id, served_keys, shuffle_order, updated_at)
            VALUES (1, 1, '[]', '[]', ?)`,
      args: [new Date().toISOString()]
    });

    console.log("✅ Turso متصل — دورة الأسئلة محفوظة بشكل دائم عبر الأيام والـ Deploys.");
  } catch (e) {
    console.error("❌ Turso init error:", e.message);
    turso = null;
  }
}

async function getCycleState() {
  if (turso) {
    try {
      const r = await turso.execute({
        sql: `SELECT cycle_id, served_keys, shuffle_order
              FROM game_state
              WHERE id = 1`,
        args: []
      });

      if (r.rows && r.rows.length) {
        const row = r.rows[0];

        let served = [];

        try {
          served = JSON.parse(row.served_keys || "[]");
        } catch (e) {}

        if ((!Array.isArray(served) || served.length === 0) && row.shuffle_order) {
          try {
            served = JSON.parse(row.shuffle_order || "[]");
          } catch (e) {}
        }

        return {
          cycle: Number(row.cycle_id) || 1,
          served: Array.isArray(served)
            ? served.map((x) => String(x || "").trim()).filter(Boolean)
            : []
        };
      }
    } catch (e) {}
  }

  try {
    if (fs.existsSync(CYCLE_FILE)) {
      const d = JSON.parse(fs.readFileSync(CYCLE_FILE, "utf8"));
      return {
        cycle: Number(d.cycle) || 1,
        served: Array.isArray(d.served)
          ? d.served.map((x) => String(x || "").trim()).filter(Boolean)
          : []
      };
    }
  } catch (e) {}

  return { cycle: 1, served: [] };
}

async function setCycleState(cycle, served) {
  const clean = Array.from(
    new Set(
      (served || [])
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    )
  ).slice(-20000);

  const json = JSON.stringify(clean);
  const now = new Date().toISOString();

  if (turso) {
    try {
      await turso.execute({
        sql: `INSERT INTO game_state
              (id, cycle_id, served_keys, shuffle_order, updated_at)
              VALUES (1, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                cycle_id = excluded.cycle_id,
                served_keys = excluded.served_keys,
                shuffle_order = excluded.shuffle_order,
                updated_at = excluded.updated_at`,
        args: [cycle, json, json, now]
      });
      return;
    } catch (e) {}
  }

  try {
    fs.mkdirSync(PRIMARY_DATA_DIR, { recursive: true });
    fs.writeFileSync(
      CYCLE_FILE,
      JSON.stringify({ cycle, served: clean }, null, 2),
      "utf8"
    );
  } catch (e) {}
}

async function loadTursoGenerated() {
  if (!turso) return [];

  try {
    const r = await turso.execute({
      sql: `SELECT category, difficulty, question, options, correctIndex, explanation, source
            FROM generated_questions
            ORDER BY id DESC
            LIMIT 5000`,
      args: []
    });

    return (r.rows || [])
      .map((row) => {
        let options = [];
        try {
          options = JSON.parse(row.options || "[]");
        } catch (e) {}

        return sanitizeQuestion({
          category: row.category,
          difficulty: row.difficulty,
          question: row.question,
          options,
          correctIndex: row.correctIndex,
          explanation: row.explanation,
          source: row.source || "ai"
        });
      })
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

async function getAllQuestions() {
  const bank = loadBankQuestions();
  const localGenerated = loadLocalGenerated();
  const tursoGenerated = await loadTursoGenerated();

  return combineUnique([...bank, ...localGenerated, ...tursoGenerated]);
}

async function saveGeneratedQuestions(questions) {
  const clean = combineUnique((questions || []).map(sanitizeQuestion).filter(Boolean));
  if (!clean.length) return;

  try {
    const existing = loadLocalGenerated();
    const merged = combineUnique([...clean, ...existing]).slice(0, 5000);
    fs.mkdirSync(PRIMARY_DATA_DIR, { recursive: true });
    fs.writeFileSync(GEN_FILE, JSON.stringify(merged, null, 2), "utf8");
  } catch (e) {
    console.error("خطأ حفظ generated محلي:", e.message);
  }

  if (!turso) return;

  for (const q of clean) {
    try {
      await turso.execute({
        sql: `INSERT OR IGNORE INTO generated_questions
              (category, difficulty, question, options, correctIndex, explanation, source, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          q.category || "معلومات عامة",
          q.difficulty || "متوسط",
          q.question,
          JSON.stringify(q.options || []),
          q.correctIndex == null ? null : q.correctIndex,
          q.explanation || "",
          q.source || "ai",
          new Date().toISOString()
        ]
      });
    } catch (e) {}
  }
}
function pickBalanced(pool, count, category, difficulty) {
  const source = (pool || []).filter(Boolean);
  if (!source.length || count <= 0) return [];

  let working = source.slice();

  const diff = String(difficulty || "").trim();
  if (diff && diff !== "متدرج") {
    const byDifficulty = working.filter((q) => String(q.difficulty || "").trim() === diff);
    if (byDifficulty.length >= count) {
      working = byDifficulty;
    }
  }

  const cat = String(category || "").trim();
  const isMixed = !cat || cat === "اختيارات متنوعة";

  if (!isMixed) {
    const byCategory = working.filter((q) => String(q.category || "").trim() === cat);
    if (byCategory.length >= count) {
      working = byCategory;
    }
  }

  const selected = [];
  const used = new Set();

  const tryAdd = (q) => {
    const key = normalizeText(q.question);
    if (!key || used.has(key)) return false;
    used.add(key);
    selected.push(q);
    return true;
  };

  if (!isMixed) {
    for (const q of shuffleArray(working)) {
      if (selected.length >= count) break;
      tryAdd(q);
    }

    if (selected.length < count) {
      for (const q of shuffleArray(source)) {
        if (selected.length >= count) break;
        tryAdd(q);
      }
    }

    return selected.slice(0, count);
  }

  const groups = new Map();

  for (const q of working) {
    const c = String(q.category || "اختيارات متنوعة").trim() || "اختيارات متنوعة";
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(q);
  }

  for (const [c, list] of groups.entries()) {
    groups.set(c, shuffleArray(list));
  }

  const categories = shuffleArray(Array.from(groups.keys()));

  let guard = 0;
  while (selected.length < count && guard < 10000) {
    let added = false;

    for (const c of categories) {
      if (selected.length >= count) break;

      const list = groups.get(c);
      while (list.length) {
        const q = list.shift();
        if (tryAdd(q)) {
          added = true;
          break;
        }
      }
    }

    if (!added) break;
    guard += 1;
  }

  if (selected.length < count) {
    for (const q of shuffleArray(source)) {
      if (selected.length >= count) break;
      tryAdd(q);
    }
  }

  return selected.slice(0, count);
}

function buildSystemPrompt(count, category, difficulty, avoidList) {
  const avoid = (avoidList || [])
    .slice(0, 30)
    .map((t) => String(t || "").trim())
    .filter(Boolean)
    .join(" | ");

  return `أنت محرر أسئلة لمسابقة عربية مباشرة اسمها «عالم التحديات».

أعد ${count} سؤالا جديدا باللغة العربية.

الشروط:
- أخرج JSON فقط بدون أي نص قبل أو بعد.
- الشكل المطلوب: مصفوفة JSON.
- كل عنصر يحتوي على:
  category, difficulty, question, options, correctIndex, explanation
- options must be array of exactly 4 strings.
- correctIndex number from 0 to 3.
- الفئات المسموحة: معلومات عامة، جغرافيا، علوم، تاريخ، دين، ألغاز، رياضة، تكنولوجيا، سرعة.
- ممنوع: سينما مصرية، سينما عربية.
- الصعوبة المطلوبة: ${difficulty || "متدرج"}.
- الفئة المطلوبة: ${category || "اختيارات متنوعة"}.
- نوّع بين الفئات قدر الإمكان.
- لا تكرر أي سؤال من هذه الأسئلة: ${avoid || "لا يوجد"}.
- لا تستخدم Markdown.`;
}

function extractJson(text) {
  const cleaned = String(text || "")
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();

  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);

  const candidates = [
    arrayMatch ? arrayMatch[0] : "",
    objectMatch ? objectMatch[0] : "",
    cleaned
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch (e) {}
  }

  return null;
}

function normalizeAiList(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.questions)) return parsed.questions;
  if (parsed && Array.isArray(parsed.data)) return parsed.data;
  if (parsed && Array.isArray(parsed.output)) return parsed.output;
  return [];
}

function isValidAiQuestion(q) {
  const s = sanitizeQuestion(q);
  if (!s) return null;
  if (!Array.isArray(s.options) || s.options.length !== 4) return null;
  if (typeof s.correctIndex !== "number" || !Number.isInteger(s.correctIndex) || s.correctIndex < 0 || s.correctIndex > 3) return null;
  return s;
}

async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms || 25000);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function callGemini(prompt, count) {
  if (!GEMINI_API_KEY) return null;

  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 4000,
            responseMimeType: "application/json"
          }
        })
      },
      30000
    );

    if (!res.ok) return null;

    const data = await res.json();
    const text =
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;

    const parsed = extractJson(text || "");
    const list = normalizeAiList(parsed)
      .map(isValidAiQuestion)
      .filter(Boolean)
      .slice(0, count);

    return list.length ? list : null;
  } catch (e) {
    return null;
  }
}

async function callOpenRouter(prompt, count) {
  if (!OPENROUTER_API_KEY) return null;

  try {
    const res = await fetchWithTimeout(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://live-game-show.local",
          "X-Title": "World Challenges Live"
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3.1-8b-instruct:free",
          temperature: 0.9,
          messages: [
            {
              role: "system",
              content: "You output valid JSON arrays only."
            },
            {
              role: "user",
              content: prompt
            }
          ]
        })
      },
      30000
    );

    if (!res.ok) return null;

    const data = await res.json();
    const text =
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;

    const parsed = extractJson(text || "");
    const list = normalizeAiList(parsed)
      .map(isValidAiQuestion)
      .filter(Boolean)
      .slice(0, count);

    return list.length ? list : null;
  } catch (e) {
    return null;
  }
}

async function callGroq(prompt, count) {
  if (!GROQ_API_KEY) return null;

  try {
    const res = await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          temperature: 0.9,
          messages: [
            {
              role: "system",
              content: "You output valid JSON arrays only."
            },
            {
              role: "user",
              content: prompt
            }
          ]
        })
      },
      30000
    );

    if (!res.ok) return null;

    const data = await res.json();
    const text =
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;

    const parsed = extractJson(text || "");
    const list = normalizeAiList(parsed)
      .map(isValidAiQuestion)
      .filter(Boolean)
      .slice(0, count);

    return list.length ? list : null;
  } catch (e) {
    return null;
  }
}

async function askProviders(prompt, count) {
  const providers = [
    { name: "gemini", fn: callGemini },
    { name: "groq", fn: callGroq },
    { name: "openrouter", fn: callOpenRouter }
  ];

  for (const p of providers) {
    try {
      const questions = await p.fn(prompt, count);
      if (questions && questions.length) {
        return { questions, provider: p.name };
      }
    } catch (e) {}
  }

  return null;
}

app.post("/api/questions", async (req, res) => {
  try {
    const body = req.body || {};
    const count = Math.min(50, Math.max(1, Number(body.count) || 10));
    const category = body.category || "اختيارات متنوعة";
    const difficulty = String(body.difficulty || "").trim();

    const avoidSet = new Set(
      (Array.isArray(body.avoid) ? body.avoid : [])
        .map(normalizeText)
        .filter(Boolean)
    );

    const bank = await getAllQuestions();

    if (!bank.length) {
      return res.json({
        questions: [],
        meta: {
          source: "bank-cycle",
          count: 0,
          bankSize: 0,
          cycle: 1,
          served: 0,
          persistent: hasPersistentStorage()
        }
      });
    }

    let pool = bank.filter((q) => !avoidSet.has(normalizeText(q.question)));
    if (!pool.length) pool = bank.slice();

    const result = await withCycleLock(async () => {
      const st = await getCycleState();
      const servedSet = new Set(st.served.filter(Boolean));
      let cycle = st.cycle;

      let fresh = pool.filter((q) => !servedSet.has(normalizeText(q.question)));
      const freshBefore = fresh.length;

      if (fresh.length === 0 && pool.length > 0) {
        cycle += 1;
        servedSet.clear();
        fresh = shuffleArray(pool).slice();
      }

      const selected = pickBalanced(fresh, count, category, difficulty);

      selected.forEach((q) => {
        const key = normalizeText(q.question);
        if (key) servedSet.add(key);
      });

      await setCycleState(cycle, Array.from(servedSet));

      return {
        selected,
        cycle,
        servedSize: servedSet.size,
        bankSize: bank.length,
        poolSize: pool.length,
        freshBefore
      };
    });

    const enriched = result.selected.map((q, i) => ({
      ...q,
      id: q.id || `q_${Date.now()}_${i}`,
      source: q.source || "bank"
    }));

    return res.json({
      questions: enriched,
      meta: {
        source: "bank-cycle",
        count: enriched.length,
        bankSize: result.bankSize,
        poolSize: result.poolSize,
        freshBefore: result.freshBefore,
        cycle: result.cycle,
        served: result.servedSize,
        mixed: true,
        persistent: hasPersistentStorage()
      }
    });
  } catch (err) {
    return res.status(500).json({
      error: "فشل في جلب الأسئلة",
      details: err.message
    });
  }
});

app.post("/api/generate", async (req, res) => {
  try {
    const body = req.body || {};
    const count = Math.min(30, Math.max(1, Number(body.count) || 10));
    const category = body.category || "اختيارات متنوعة";
    const difficulty = String(body.difficulty || "").trim();
    const avoidTexts = Array.isArray(body.avoid) ? body.avoid : [];

    const avoidSet = new Set(
      avoidTexts
        .map(normalizeText)
        .filter(Boolean)
    );

    const prompt = buildSystemPrompt(count, category, difficulty, avoidTexts);
    const result = await askProviders(prompt, count);

    if (!result) {
      return res.json({
        questions: [],
        meta: {
          source: "none",
          count: 0,
          persistent: hasPersistentStorage()
        }
      });
    }

    let questions = result.questions
      .map(sanitizeQuestion)
      .filter(Boolean);

    const cycleResult = await withCycleLock(async () => {
      const st = await getCycleState();
      const servedSet = new Set(st.served.filter(Boolean));

      questions = questions
        .filter((q) => {
          const key = normalizeText(q.question);
          return key && !avoidSet.has(key) && !servedSet.has(key);
        })
        .slice(0, count);

      if (questions.length) {
        await saveGeneratedQuestions(questions);

        questions.forEach((q) => {
          const key = normalizeText(q.question);
          if (key) servedSet.add(key);
        });

        await setCycleState(st.cycle, Array.from(servedSet));
      }

      return {
        cycle: st.cycle,
        servedSize: servedSet.size
      };
    });

    return res.json({
      questions,
      meta: {
        source: questions.length ? "ai" : "none",
        provider: result.provider,
        count: questions.length,
        cycle: cycleResult.cycle,
        served: cycleResult.servedSize,
        persistent: hasPersistentStorage()
      }
    });
  } catch (err) {
    return res.status(500).json({
      error: "فشل توليد الأسئلة",
      details: err.message
    });
  }
});

app.post("/api/save-questions", async (req, res) => {
  try {
    const incoming = Array.isArray(req.body && req.body.questions) ? req.body.questions : [];
    const clean = incoming.map(sanitizeQuestion).filter((q) => q && q.question);

    if (!clean.length) {
      return res.status(400).json({ error: "لا توجد أسئلة صالحة للحفظ" });
    }

    await saveGeneratedQuestions(clean);
    const all = await getAllQuestions();

    return res.json({
      saved: clean.length,
      total: all.length,
      storage: PRIMARY_DATA_DIR,
      persistent: hasPersistentStorage()
    });
  } catch (err) {
    return res.status(500).json({
      error: "فشل حفظ الأسئلة",
      details: err.message
    });
  }
});

app.get("/api/saved-questions", async (req, res) => {
  try {
    const localGenerated = loadLocalGenerated();
    const tursoGenerated = await loadTursoGenerated();
    const generated = combineUnique([...localGenerated, ...tursoGenerated]);

    return res.json({
      questions: generated,
      count: generated.length,
      storage: PRIMARY_DATA_DIR,
      persistent: hasPersistentStorage()
    });
  } catch (err) {
    return res.status(500).json({
      error: "فشل قراءة الأسئلة المحفوظة",
      details: err.message
    });
  }
});
app.post("/api/reset-cycle", async (req, res) => {
  try {
    await withCycleLock(async () => {
      const st = await getCycleState();
      await setCycleState(st.cycle + 1, []);
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({
      error: "فشل تصفير الدورة",
      details: err.message
    });
  }
});

app.get("/api/cycle-status", async (req, res) => {
  try {
    const st = await getCycleState();
    const bank = await getAllQuestions();

    res.json({
      persistent: hasPersistentStorage(),
      turso: Boolean(turso),
      volume: Boolean(process.env.RAILWAY_VOLUME_MOUNT_PATH),
      dataDir: PRIMARY_DATA_DIR,
      dataCandidates: DATA_CANDIDATES,
      cycle: st.cycle,
      served: st.served.length,
      bankSize: bank.length
    });
  } catch (err) {
    res.status(500).json({
      error: "فشل قراءة حالة الدورة",
      details: err.message
    });
  }
});

app.get("/api/health", async (req, res) => {
  try {
    const st = await getCycleState();
    const bank = await getAllQuestions();

    res.json({
      status: "ok",
      bankCount: bank.length,
      excluded: Array.from(EXCLUDED_CATEGORIES),
      storage: {
        persistent: hasPersistentStorage(),
        turso: Boolean(turso),
        volume: Boolean(process.env.RAILWAY_VOLUME_MOUNT_PATH),
        dataDir: PRIMARY_DATA_DIR
      },
      cycle: {
        cycle: st.cycle,
        served: st.served.length
      }
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      details: err.message
    });
  }
});

app.use(express.static(staticRoot, { extensions: ["html"] }));

try {
  attachLiveRoutes(app);
} catch (e) {
  console.error("❌ فشل تحميل مسارات اللايف:", e.message);
}

app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  if (req.path.startsWith("/api/") || req.path.startsWith("/live/")) return next();

  if (fs.existsSync(INDEX_FILE)) {
    return res.sendFile(INDEX_FILE);
  }

  return res.status(404).send("index.html not found");
});

const PORT = Number(process.env.PORT || 3000);

if (!TURSO_URL || !TURSO_TOKEN) {
  console.warn(
    "⚠️ تحذير إنتاجي: Turso غير مربوط بالكامل.\n" +
    "دورة الأسئلة قد تُصفَّر مع كل Deploy إذا لم يكن هناك Railway Volume دائم.\n" +
    "لضمان الدوام: اضبط TURSO_URL و TURSO_AUTH_TOKEN أو اربط Volume."
  );
}

initTurso().finally(async () => {
  let bankCount = 0;

  try {
    const bank = await getAllQuestions();
    bankCount = bank.length;
  } catch (e) {}

  app.listen(PORT, () => {
    console.log(
      `عالم التحديات يعمل على ${PORT} | البنك: ${bankCount} سؤال | التخزين الدائم: ${
        turso ? "Turso" : process.env.RAILWAY_VOLUME_MOUNT_PATH ? "Volume" : "ملف محلي مؤقت"
      }`
    );
  });
});
