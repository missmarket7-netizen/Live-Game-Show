const fs = require('fs');
const p = 'server/server.js';
let s = fs.readFileSync(p, 'utf8');
let changed = false;
if (!s.includes('live-connector')) {
  const imp = 'import { attachLiveRoutes } from "./live-connector.js";';
  const anchor = 'import { fileURLToPath } from "node:url";';
  s = s.includes(anchor) ? s.replace(anchor, anchor + '\n' + imp) : imp + '\n' + s;
  changed = true;
}
if (!s.includes('attachLiveRoutes(app);')) {
  const anchor2 = 'app.listen(PORT,';
  if (s.includes(anchor2)) { s = s.replace(anchor2, 'attachLiveRoutes(app);\napp.listen(PORT,'); changed = true; }
}
if (changed) fs.writeFileSync(p, s);
console.log(changed ? '✅ server.js: تم ربط مسارات اللايف' : 'ℹ️ server.js: مربوط مسبقاً');
