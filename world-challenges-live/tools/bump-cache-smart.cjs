const fs = require("fs");
const path = require("path");

const CANDIDATES = [
  "public/index.html",
  "index.html",
  "server/public/index.html",
  "dist/index.html",
  "app/index.html",
  "src/index.html",
  "build/index.html"
];

const VERSION = process.argv[2] || "41";

const found = CANDIDATES.filter((p) => {
  try { return fs.existsSync(p); } catch (e) { return false; }
});

if (!found.length) {
  console.error("❌ لم أجد index.html في أي من المواضع المتوقعة:");
  CANDIDATES.forEach((p) => console.error("   - " + p));
  console.error("");
  console.error("شغّل أمر التشخيص (الخطوة 1) وأرسل لي الناتج.");
  process.exit(1);
}

const RE = [
  [/app\.js(\?v=\d+)?/g, "app.js?v=" + VERSION],
  [/style\.css(\?v=\d+)?/g, "style.css?v=" + VERSION],
  [/arena-extras\.css(\?v=\d+)?/g, "arena-extras.css?v=" + VERSION],
  [/arena-extras\.js(\?v=\d+)?/g, "arena-extras.js?v=" + VERSION],
  [/answer-layer\.js(\?v=\d+)?/g, "answer-layer.js?v=" + VERSION],
  [/features\.js(\?v=\d+)?/g, "features.js?v=" + VERSION]
];

found.forEach((file) => {
  let html = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const before = html;

  RE.forEach((pair) => {
    html = html.replace(pair[0], pair[1]);
  });

  if (html !== before) {
    fs.writeFileSync(file, html, "utf8");
    console.log("✅ تم تحديث كاش: " + file + " -> v=" + VERSION);
  } else {
    console.log("ℹ️ لا مراجع لتحديثها في: " + file);
  }
});
