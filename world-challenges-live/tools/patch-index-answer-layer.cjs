const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "public", "index.html");

if (!fs.existsSync(file)) {
  console.error("❌ لم أجد public/index.html");
  process.exit(1);
}

let html = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");

html = html.replace(/\s*<script[^>]+features\.js[^>]*><\/script>/gi, "");
html = html.replace(/\s*<script[^>]+answer-layer\.js[^>]*><\/script>/gi, "");

const tag = '<script src="answer-layer.js?v=38"></script>';

const arenaRegex = /<script[^>]+arena-extras\.js[^>]*><\/script>/i;
const appRegex = /<script[^>]+app\.js[^>]*><\/script>/i;
const bodyRegex = /<\/body>/i;

if (arenaRegex.test(html)) {
  html = html.replace(arenaRegex, (m) => m + "\n" + tag);
} else if (appRegex.test(html)) {
  html = html.replace(appRegex, (m) => m + "\n" + tag);
} else if (bodyRegex.test(html)) {
  html = html.replace(bodyRegex, tag + "\n</body>");
} else {
  html += "\n" + tag + "\n";
}

html = html.replace(/app\.js(\?v=\d+)?/g, "app.js?v=38");
html = html.replace(/style\.css(\?v=\d+)?/g, "style.css?v=38");
html = html.replace(/arena-extras\.css(\?v=\d+)?/g, "arena-extras.css?v=38");
html = html.replace(/arena-extras\.js(\?v=\d+)?/g, "arena-extras.js?v=38");
html = html.replace(/answer-layer\.js(\?v=\d+)?/g, "answer-layer.js?v=38");

fs.writeFileSync(file, html, "utf8");

console.log("✅ تم تحديث public/index.html لتحميل answer-layer.js v38");
