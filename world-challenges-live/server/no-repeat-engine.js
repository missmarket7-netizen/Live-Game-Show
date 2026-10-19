import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VERSION = "NO_REPEAT_ENGINE_V1";
const LOCK_HOURS = 48;
const SOFT_LOCK_HOURS = 24;

const FREE_CATEGORIES = new Set([
  "سرعة",
  "ألغاز"
]);

const SKIP_FILES = new Set([
  "cycle_state.json",
  "cycle_state_engine.json",
  "live_state.json",
  "package.json",
  "audit-report.json"
]);

const TURSO_URL =
  process.env.TURSO_URL ||
  process.env.TURSO_DATABASE_URL ||
  "";

const TURSO_TOKEN =
  process.env.TURSO_AUTH_TOKEN ||
  process.env.TURSO_TOKEN ||
  "";

let db = null;
let readyPromise = null;
let lockPromise = Promise.resolve();

const DATA_DIR_CANDIDATES = [
  process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "questions")
    : "",
  path.join(__dirname, "questions"),
  path.join(process.cwd(), "questions"),
  path.join(__dirname, "..", "questions")
].filter(Boolean);

const PRIMARY_DATA_DIR =
  DATA_DIR_CANDIDATES.find((p) => fs.existsSync(p)) ||
  DATA_DIR_CANDIDATES[0] ||
  path.join(__dirname, "questions");

const FALLBACK_STATE_FILE = path.join(PRIMARY_DATA_DIR, "cycle_state_engine.json");

function withLock(task) {
  const run = lockPromise.then(task, task);
  lockPromise = run.then(() => undefined, () => undefined);
  return run;
}

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

function questionKey(q) {
  return keyFromText(q && q.question ? q.question : "");
}

function shuffle(arr) {
  const a = Array.isArray(arr) ? arr.slice() : [];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

const CATEGORY_ALIASES = {
  "معلومات عامه": "معلومات عامة",
  "عام": "معلومات عامة",
  "ثقافه عامه": "معلومات عامة",
  "معلومات": "معلومات عامة",

  "جغرافيا": "جغرافيا",
  "جغرافيه": "جغرافيا",

  "علوم": "علوم",
  "علم": "علوم",
  "فيزياء": "علوم",
  "كيمياء": "علوم",
  "احياء": "علوم",
  "بيولوجيا": "علوم",

  "تاريخ": "تاريخ",

  "دين": "دين",
  "اسئله دينيه": "دين",
  "اسلاميات": "دين",
  "ثقافه اسلاميه": "دين",
  "قران": "دين",
  "سيره": "دين",
  "صحابه": "دين",
  "انبياء": "دين",

  "الغاز": "ألغاز",
  "لغز": "ألغاز",
  "احجيات": "ألغاز",

  "رياضه": "رياضة",
  "كوره": "رياضة",
  "كره قدم": "رياضة",

  "تكنولوجيا": "تكنولوجيا",
  "تقنيه": "تكنولوجيا",

  "سرعه": "سرعة",
  "سريع": "سرعة",

  "سينما مصريه": "سينما مصرية",
  "سينما عربيه": "سينما عربية",
  "افلام": "سينما"
};

const DIFFICULTY_ALIASES = {
  "سهل": "سهل",
  "مبتدئ": "سهل",
  "سهله": "سهل",
  "easy": "سهل",

  "متوسط": "متوسط",
  "عادي": "متوسط",
  "متوسطه": "متوسط",
  "medium": "متوسط",
  "متدرج": "متوسط",

  "صعب": "صعب",
  "متقدم": "صعب",
  "صعبه": "صعب",
  "hard": "صعب"
};

function normalizeCategory(value) {
  const n = normalizeText(value);
  if (CATEGORY_ALIASES[n]) return CATEGORY_ALIASES[n];
  return String(value || "معلومات عامة").trim();
}

function normalizeDifficulty(value) {
  const n = normalizeText(value);
  return DIFFICULTY_ALIASES[n] || "متوسط";
}

function isMixedCategory(value) {
  const n = normalizeText(value);
  return !n ||
    n === "اختيارات متنوعه" ||
    n === "خليط" ||
    n === "متنوع" ||
    n === "متنوعه";
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

function sanitizeQuestion(raw) {
  if (!raw || !raw.question) return null;

  const question = String(raw.question || "").trim();
  if (!question) return null;

  const category = normalizeCategory(raw.category);
  const difficulty = normalizeDifficulty(raw.difficulty);

  let rawOptions = [];
  if (Array.isArray(raw.options)) {
    rawOptions = raw.options.slice();
  } else if (raw.options && typeof raw.options === "object") {
    rawOptions = Object.values(raw.options);
  }

  let correct = Number.isInteger(Number(raw.correctIndex))
    ? Number(raw.correctIndex)
    : null;

  let answer = raw.answer ? String(raw.answer).trim() : "";

  if (!answer && rawOptions.length) {
    if (correct != null && correct >= 0 && correct < rawOptions.length) {
      answer = String(rawOptions[correct] == null ? "" : rawOptions[correct]).trim();
    }
    if (!answer) {
      answer = String(rawOptions[0] == null ? "" : rawOptions[0]).trim();
    }
  }

  rawOptions = rawOptions
    .map((o) => String(o == null ? "" : o).trim())
    .filter(Boolean);

  let options = [];
  let correctIndex = null;

  if (answer) {
    options = [answer];
    correctIndex = 0;
  } else if (FREE_CATEGORIES.has(category)) {
    options = [];
    correctIndex = null;
  } else {
    return null;
  }

  const explanation = String(raw.explanation || "").trim() ||
    (answer
      ? "الإجابة: " + answer
      : "إجابة حرة؛ الحكم للمضيف وفق شروط السؤال.");

  return {
    category,
    difficulty,
    question,
    options,
    correctIndex,
    answer,
    explanation,
    source: raw.source || "bank"
  };
}

function questionScore(q) {
  return (q.answer ? 3 : 0) +
    (q.explanation ? Math.min(20, q.explanation.length / 10) : 0) +
    (Array.isArray(q.options) && q.options.length ? 2 : 0);
}

function loadBankQuestions() {
  const map = new Map();

  for (const dir of DATA_DIR_CANDIDATES) {
    try {
      if (!dir || !fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir).sort();

      for (const file of files) {
        const lower = file.toLowerCase();
        if (!lower.endsWith(".json")) continue;
        if (SKIP_FILES.has(lower)) continue;

        const full = path.join(dir, file);
        const payload = readJsonSafe(full);
        const items = extractArray(payload);

        for (const item of items) {
          const q = sanitizeQuestion(item);
          if (!q) continue;

          const key = questionKey(q);
          if (!key) continue;

          const existing = map.get(key);
          if (!existing || questionScore(q) > questionScore(existing)) {
            map.set(key, q);
          }
        }
      }
    } catch (e) {}
  }

  return Array.from(map.values());
}

function readFallbackState() {
  try {
    if (!fs.existsSync(FALLBACK_STATE_FILE)) {
      return { cycle: 1, usage: {}, updatedAt: new Date().toISOString() };
    }

    const parsed = JSON.parse(fs.readFileSync(FALLBACK_STATE_FILE, "utf8"));

    return {
      cycle: Number(parsed.cycle) || 1,
      usage: parsed.usage && typeof parsed.usage === "object" ? parsed.usage : {},
      updatedAt: parsed.updatedAt || new Date().toISOString()
    };
  } catch (e) {
    return { cycle: 1, usage: {}, updatedAt: new Date().toISOString() };
  }
}

function writeFallbackState(state) {
  try {
    fs.mkdirSync(PRIMARY_DATA_DIR, { recursive: true });
    fs.writeFileSync(
      FALLBACK_STATE_FILE,
      JSON.stringify({
        cycle: Number(state.cycle) || 1,
        usage: state.usage || {},
        updatedAt: new Date().toISOString()
      }, null, 2),
      "utf8"
    );
  } catch (e) {}
}

async function initTurso() {
  if (!TURSO_URL || !TURSO_TOKEN) {
    console.warn("⚠️ NO_REPEAT_ENGINE: Turso غير مربوط، سيُستخدم ملف محلي احتياطي.");
    return;
  }

  try {
    const mod = await import("@libsql/client");
    const createClient = mod.createClient || (mod.default && mod.default.createClient);

    if (!createClient) throw new Error("createClient not found");

    db = createClient({
      url: TURSO_URL,
      authToken: TURSO_TOKEN
    });

    await db.execute({
      sql: `CREATE TABLE IF NOT EXISTS engine_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        cycle_id INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT
      )`,
      args: []
    });

    await db.execute({
      sql: `CREATE TABLE IF NOT EXISTS question_usage (
        question_key TEXT PRIMARY KEY,
        last_served_at INTEGER NOT NULL DEFAULT 0,
        times_served INTEGER NOT NULL DEFAULT 0,
        cycle_id INTEGER NOT NULL DEFAULT 1
      )`,
      args: []
    });

    await db.execute({
      sql: `INSERT OR IGNORE INTO engine_state (id, cycle_id, updated_at)
            VALUES (1, 1, ?)`,
      args: [new Date().toISOString()]
    });

    console.log("✅ NO_REPEAT_ENGINE: Turso متصل.");
  } catch (e) {
    console.error("❌ NO_REPEAT_ENGINE: فشل Turso، سيتم استخدام الملف الاحتياطي.", e.message);
    db = null;
  }
}

async function getCycle() {
  if (db) {
    try {
      const r = await db.execute({
        sql: "SELECT cycle_id FROM engine_state WHERE id = 1",
        args: []
      });

      return Number(r.rows && r.rows[0] && r.rows[0].cycle_id) || 1;
    } catch (e) {}
  }

  return Number(readFallbackState().cycle) || 1;
}

async function setCycle(cycle) {
  const value = Number(cycle) || 1;

  if (db) {
    try {
      await db.execute({
        sql: `INSERT INTO engine_state (id, cycle_id, updated_at)
              VALUES (1, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                cycle_id = excluded.cycle_id,
                updated_at = excluded.updated_at`,
        args: [value, new Date().toISOString()]
      });
      return;
    } catch (e) {}
  }

  const state = readFallbackState();
  state.cycle = value;
  writeFallbackState(state);
}

async function getUsageMap() {
  const map = new Map();

  if (db) {
    try {
      const r = await db.execute({
        sql: "SELECT question_key, last_served_at, times_served FROM question_usage",
        args: []
      });

      for (const row of r.rows || []) {
        map.set(String(row.question_key || ""), {
          last: Number(row.last_served_at) || 0,
          times: Number(row.times_served) || 0
        });
      }

      return map;
    } catch (e) {}
  }

  const state = readFallbackState();

  for (const entry of Object.entries(state.usage || {})) {
    map.set(entry[0], {
      last: Number(entry[1] && entry[1].last) || 0,
      times: Number(entry[1] && entry[1].times) || 0
    });
  }

  return map;
}

async function markServed(keys, cycle) {
  const now = Date.now();
  const cleanKeys = Array.from(new Set((keys || []).filter(Boolean)));

  if (!cleanKeys.length) return;

  if (db) {
    for (const key of cleanKeys) {
      try {
        await db.execute({
          sql: `INSERT INTO question_usage (question_key, last_served_at, times_served, cycle_id)
                VALUES (?, ?, 1, ?)
                ON CONFLICT(question_key) DO UPDATE SET
                  last_served_at = excluded.last_served_at,
                  times_served = question_usage.times_served + 1,
                  cycle_id = excluded.cycle_id`,
          args: [key, now, cycle]
        });
      } catch (e) {}
    }
    return;
  }

  const state = readFallbackState();
  state.usage = state.usage || {};

  for (const key of cleanKeys) {
    const current = state.usage[key] || { last: 0, times: 0 };
    state.usage[key] = {
      last: now,
      times: Number(current.times || 0) + 1
    };
  }

  state.cycle = Number(cycle) || state.cycle || 1;
  writeFallbackState(state);
}

async function resetUsage() {
  if (db) {
    try {
      await db.execute({ sql: "DELETE FROM question_usage", args: [] });
    } catch (e) {}
  }

  const state = readFallbackState();
  state.usage = {};
  state.cycle = Number(state.cycle || 1) + 1;
  writeFallbackState(state);

  await setCycle(state.cycle);
}

function applyFilters(pool, count, category, difficulty) {
  let working = pool.slice();

  const diff = String(difficulty || "").trim();

  if (diff && normalizeText(diff) !== "متدرج") {
    const byDifficulty = working.filter((q) => q.difficulty === diff);
    if (byDifficulty.length >= count) {
      working = byDifficulty;
    }
  }

  if (!isMixedCategory(category)) {
    const target = normalizeCategory(category);
    const byCategory = working.filter((q) => q.category === target);
    if (byCategory.length >= count) {
      working = byCategory;
    }
  }

  return working;
}

function pickBalanced(items, count) {
  const source = (items || []).filter(Boolean);
  if (!source.length || count <= 0) return [];

  const groups = new Map();

  for (const q of source) {
    const cat = q.category || "متنوع";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(q);
  }

  for (const entry of groups.entries()) {
    groups.set(entry[0], shuffle(entry[1]));
  }

  const categories = shuffle(Array.from(groups.keys()));
  const selected = [];
  const used = new Set();

  let guard = 0;

  while (selected.length < count && guard < 10000) {
    let added = false;

    for (const cat of categories) {
      if (selected.length >= count) break;

      const list = groups.get(cat);

      while (list.length) {
        const q = list.shift();
        const key = questionKey(q);

        if (key && !used.has(key)) {
          used.add(key);
          selected.push(q);
          added = true;
          break;
        }
      }
    }

    if (!added) break;
    guard += 1;
  }

  if (selected.length < count) {
    for (const q of shuffle(source)) {
      if (selected.length >= count) break;

      const key = questionKey(q);
      if (key && !used.has(key)) {
        used.add(key);
        selected.push(q);
      }
    }
  }

  return selected.slice(0, count);
}

async function ensureReady() {
  if (!readyPromise) {
    readyPromise = initTurso();
  }
  await readyPromise;
}

export function installNoRepeatEngine(app) {
  try {
    app.use(express.json({ limit: "2mb" }));
  } catch (e) {}

  app.post("/api/questions", async (req, res) => {
    try {
      await ensureReady();

      const body = req.body || {};
      const count = Math.min(50, Math.max(1, Number(body.count) || 10));
      const category = body.category || "اختيارات متنوعة";
      const difficulty = body.difficulty || "متدرج";

      const avoidSet = new Set(
        (Array.isArray(body.avoid) ? body.avoid : [])
          .map(keyFromText)
          .filter(Boolean)
      );

      const bank = loadBankQuestions();

      if (!bank.length) {
        return res.json({
          questions: [],
          meta: {
            engine: VERSION,
            source: "no-repeat-engine",
            count: 0,
            bankSize: 0,
            persistent: Boolean(db || process.env.RAILWAY_VOLUME_MOUNT_PATH),
            turso: Boolean(db),
            lockHours: LOCK_HOURS
          }
        });
      }

      let pool = bank.filter((q) => !avoidSet.has(questionKey(q)));
      if (!pool.length) pool = bank.slice();

      pool = applyFilters(pool, count, category, difficulty);

      const usage = await getUsageMap();
      const now = Date.now();
      const lockMs = LOCK_HOURS * 60 * 60 * 1000;
      const softLockMs = SOFT_LOCK_HOURS * 60 * 60 * 1000;

      const scored = pool.map((q) => {
        const key = questionKey(q);
        const u = usage.get(key);
        const last = u ? Number(u.last) || 0 : 0;
        const times = u ? Number(u.times) || 0 : 0;
        const age = last ? now - last : Infinity;

        return {
          key,
          q,
          last,
          times,
          age,
          eligible: !last || age >= lockMs,
          secondary: Boolean(last) && age >= softLockMs && age < lockMs
        };
      });

      let candidates = scored.filter((x) => x.eligible);

      if (candidates.length < count) {
        const existingKeys = new Set(candidates.map((x) => x.key));
        const soft = scored.filter((x) => x.secondary && !existingKeys.has(x.key));
        candidates = candidates.concat(soft);
      }

      let exhausted = false;

      if (candidates.length < count) {
        exhausted = true;
        candidates = scored.slice().sort((a, b) => {
          const lastA = a.last || 0;
          const lastB = b.last || 0;
          if (lastA !== lastB) return lastA - lastB;
          return a.times - b.times;
        });
      }

      let selected = pickBalanced(candidates.map((x) => x.q), count);

      if (selected.length < count) {
        const selectedKeys = new Set(selected.map(questionKey));
        const fillers = scored
          .filter((x) => !selectedKeys.has(x.key))
          .sort((a, b) => (a.last || 0) - (b.last || 0) || a.times - b.times)
          .map((x) => x.q);

        selected = selected.concat(pickBalanced(fillers, count - selected.length));
      }

      selected = selected.slice(0, count);

      const cycle = await getCycle();
      const nextCycle = exhausted ? cycle + 1 : cycle;

      await setCycle(nextCycle);
      await markServed(selected.map(questionKey).filter(Boolean), nextCycle);

      const enriched = selected.map((q, i) => ({
        ...q,
        id: "q_" + Date.now() + "_" + i,
        source: q.source || "bank"
      }));

      return res.json({
        questions: enriched,
        meta: {
          engine: VERSION,
          source: "no-repeat-engine",
          count: enriched.length,
          bankSize: bank.length,
          poolSize: pool.length,
          cycle: nextCycle,
          tracked: usage.size,
          exhausted: exhausted,
          mixed: isMixedCategory(category),
          persistent: Boolean(db || process.env.RAILWAY_VOLUME_MOUNT_PATH),
          turso: Boolean(db),
          lockHours: LOCK_HOURS,
          softLockHours: SOFT_LOCK_HOURS
        }
      });
    } catch (err) {
      return res.status(500).json({
        error: "فشل محرك منع التكرار",
        details: err.message,
        engine: VERSION
      });
    }
  });

  app.get("/api/health", async (req, res) => {
    try {
      await ensureReady();

      const bank = loadBankQuestions();
      const usage = await getUsageMap();
      const cycle = await getCycle();
      const now = Date.now();

      let recent24 = 0;
      let recent48 = 0;

      for (const item of usage.values()) {
        const age = now - (Number(item.last) || 0);
        if (age <= 24 * 60 * 60 * 1000) recent24 += 1;
        if (age <= 48 * 60 * 60 * 1000) recent48 += 1;
      }

      return res.json({
        status: "ok",
        engine: VERSION,
        bankCount: bank.length,
        uniqueQuestions: bank.length,
        storage: {
          persistent: Boolean(db || process.env.RAILWAY_VOLUME_MOUNT_PATH),
          turso: Boolean(db),
          volume: Boolean(process.env.RAILWAY_VOLUME_MOUNT_PATH),
          dataDir: PRIMARY_DATA_DIR,
          fallbackFile: FALLBACK_STATE_FILE
        },
        cycle: {
          cycle: cycle,
          tracked: usage.size,
          recent24: recent24,
          recent48: recent48
        },
        locks: {
          hardLockHours: LOCK_HOURS,
          softLockHours: SOFT_LOCK_HOURS
        }
      });
    } catch (err) {
      return res.status(500).json({
        status: "error",
        engine: VERSION,
        details: err.message
      });
    }
  });

  app.get("/api/cycle-status", async (req, res) => {
    try {
      await ensureReady();

      const bank = loadBankQuestions();
      const usage = await getUsageMap();
      const cycle = await getCycle();

      return res.json({
        engine: VERSION,
        persistent: Boolean(db || process.env.RAILWAY_VOLUME_MOUNT_PATH),
        turso: Boolean(db),
        volume: Boolean(process.env.RAILWAY_VOLUME_MOUNT_PATH),
        dataDir: PRIMARY_DATA_DIR,
        dataCandidates: DATA_DIR_CANDIDATES,
        bankSize: bank.length,
        cycle: cycle,
        tracked: usage.size,
        lockHours: LOCK_HOURS
      });
    } catch (err) {
      return res.status(500).json({
        error: "فشل قراءة حالة الدورة",
        details: err.message
      });
    }
  });

  app.post("/api/reset-cycle", async (req, res) => {
    try {
      await ensureReady();

      await withLock(async () => {
        await resetUsage();
      });

      return res.json({
        success: true,
        engine: VERSION
      });
    } catch (err) {
      return res.status(500).json({
        error: "فشل تصفير الدورة",
        details: err.message
      });
    }
  });

  console.log("✅ NO_REPEAT_ENGINE_V1 installed");
}
