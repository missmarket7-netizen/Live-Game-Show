const fs = require("fs");

const target = "server/server.js";

if (!fs.existsSync(target)) {
  console.error("❌ لم أجد server/server.js");
  process.exit(1);
}

let source = fs.readFileSync(target, "utf8").replace(/^\uFEFF/, "");

if (source.includes("__SANITIZE_SINGLE_ANSWER_COMPAT_V2__")) {
  console.log("ℹ️ باتش توافق السيرفر للإجابة الواحدة مطبق مسبقًا.");
  process.exit(0);
}

const SANITIZE = `/* __SANITIZE_SINGLE_ANSWER_COMPAT_V2__ */
function sanitizeQuestion(raw) {
  if (!raw || typeof raw !== "object") return null;

  var q = {};
  var keys = Object.keys(raw);

  for (var i = 0; i < keys.length; i += 1) {
    var k = keys[i];
    var v = raw[k];
    q[k] = typeof v === "string" ? v.trim() : v;
  }

  if (!q.question || typeof q.question !== "string" || !q.question.trim()) return null;
  q.question = q.question.trim();

  if (!Array.isArray(q.options)) q.options = [];

  q.options = q.options
    .map(function (o) {
      return String(o == null ? "" : o).trim();
    })
    .filter(Boolean);

  var category = String(q.category || "معلومات عامة").trim();
  var difficulty = String(q.difficulty || "متوسط").trim();

  var normCat = category
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");

  var isFree =
    normCat.indexOf("سرعه") >= 0 ||
    normCat.indexOf("الغاز") >= 0 ||
    normCat.indexOf("لغز") >= 0;

  var answer = q.answer ? String(q.answer).trim() : "";
  var ci = null;

  if (
    q.correctIndex !== null &&
    q.correctIndex !== undefined &&
    q.correctIndex !== "" &&
    Number.isInteger(Number(q.correctIndex))
  ) {
    ci = Number(q.correctIndex);
  }

  if (!answer && Array.isArray(q.validAnswers) && q.validAnswers.length) {
    answer = q.validAnswers
      .map(function (v) {
        return String(v == null ? "" : v).trim();
      })
      .filter(Boolean)
      .join(" أو ");
  }

  if (!answer && q.options.length === 1) {
    answer = q.options[0];
  }

  if (!answer && q.options.length > 1) {
    if (ci !== null && ci >= 0 && ci < q.options.length) {
      answer = q.options[ci];
    } else {
      var exp = String(q.explanation || "");
      var m = exp.match(/الإجابة\\s+الصحيحة\\s*[:\\-]?\\s*(.+?)\\s*\\.?$/);
      if (m) answer = m[1].trim();
    }
  }

  if (q.options.length === 0) {
    if (answer) {
      q.options = [answer];
      q.correctIndex = 0;
    } else if (isFree) {
      q.category = category;
      q.difficulty = difficulty;
      q.correctIndex = null;
      q.answer = "";
      q.explanation = String(q.explanation || "إجابة حرة؛ الحكم للمضيف وفق شروط السؤال.").trim();
      q.source = q.source || "bank";
      return q;
    } else {
      return null;
    }
  }

  if (q.options.length === 1) {
    q.correctIndex = 0;
    q.answer = q.options[0];
  } else if (q.options.length === 4) {
    if (ci === null || ci < 0 || ci > 3) {
      if (answer) {
        ci = q.options.indexOf(answer);
      }
    }

    if (ci === null || ci < 0 || ci > 3) return null;

    q.correctIndex = ci;
    q.answer = q.options[ci];
  } else {
    if (answer) {
      q.options = [answer];
      q.correctIndex = 0;
    } else if (ci !== null && ci >= 0 && ci < q.options.length) {
      q.answer = q.options[ci];
      q.options = [q.answer];
      q.correctIndex = 0;
    } else {
      return null;
    }
  }

  if (!q.answer) return null;

  q.category = category;
  q.difficulty = difficulty;
  q.explanation = String(q.explanation || ("الإجابة: " + q.answer)).trim();
  q.source = q.source || "bank";

  return q;
}`;

const IS_VALID = `/* __IS_VALID_SINGLE_ANSWER_COMPAT_V2__ */
function isValid(q) {
  if (!q || typeof q.question !== "string" || !q.question.trim()) return false;
  if (!Array.isArray(q.options)) return false;

  if (q.options.length === 0) return true;

  if (q.options.length !== 1 && q.options.length !== 4) return false;

  if (
    !Number.isInteger(q.correctIndex) ||
    q.correctIndex < 0 ||
    q.correctIndex >= q.options.length
  ) {
    return false;
  }

  return Boolean(q.answer || q.options[q.correctIndex]);
}`;

function findFunctionEnd(src, startIndex) {
  var braceStart = src.indexOf("{", startIndex);
  if (braceStart < 0) return -1;

  var depth = 0;
  var inString = false;
  var stringChar = "";
  var escape = false;

  for (var i = braceStart; i < src.length; i += 1) {
    var ch = src[i];

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

function replaceNamedFunction(src, name, replacementCode, required) {
  var search = "function " + name;
  var pos = 0;
  var out = "";
  var count = 0;

  while (true) {
    var idx = src.indexOf(search, pos);
    if (idx < 0) break;

    var end = findFunctionEnd(src, idx);
    if (end < 0) {
      if (required) {
        console.error("❌ لم أجد نهاية الدالة بشكل آمن: " + name);
        process.exit(1);
      }
      break;
    }

    out += src.slice(pos, idx);
    out += replacementCode;
    pos = end;
    count += 1;
  }

  out += src.slice(pos);

  if (count === 0 && required) {
    console.error("❌ لم أجد الدالة: " + name);
    process.exit(1);
  }

  return { source: out, count: count };
}

var r1 = replaceNamedFunction(source, "sanitizeQuestion", SANITIZE, true);
source = r1.source;

var r2 = replaceNamedFunction(source, "isValid", IS_VALID, false);
source = r2.source;

fs.writeFileSync(target, source, "utf8");

console.log("✅ تم تحديث server/server.js ليقبل:");
console.log("   - 4 اختيارات");
console.log("   - إجابة واحدة");
console.log("   - أسئلة حرة للسرعة والألغاز");
