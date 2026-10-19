const fs = require("fs");
const path = require("path");

const serverPath = path.join(process.cwd(), "server", "server.js");
const enginePath = path.join(process.cwd(), "server", "no-repeat-engine.js");

if (!fs.existsSync(serverPath)) {
  console.error("❌ لم أجد server/server.js");
  process.exit(1);
}

if (!fs.existsSync(enginePath)) {
  console.error("❌ لم أجد server/no-repeat-engine.js");
  process.exit(1);
}

let source = fs.readFileSync(serverPath, "utf8").replace(/^\uFEFF/, "");

if (source.includes("no-repeat-engine.js")) {
  console.log("ℹ️ محرك منع التكرار مثبت مسبقًا في server/server.js");
  process.exit(0);
}

const importLine = 'import { installNoRepeatEngine } from "./no-repeat-engine.js";\n';

source = importLine + source;

const appMatch = source.match(/const\s+app\s*=\s*express\(\);?/);

if (!appMatch) {
  console.error("❌ لم أجد سطر: const app = express(); داخل server/server.js");
  process.exit(1);
}

const insertIndex = appMatch.index + appMatch[0].length;

source =
  source.slice(0, insertIndex) +
  "\ninstallNoRepeatEngine(app);\n" +
  source.slice(insertIndex);

fs.writeFileSync(serverPath, source, "utf8");

console.log("✅ تم تثبيت NO_REPEAT_ENGINE داخل server/server.js");
