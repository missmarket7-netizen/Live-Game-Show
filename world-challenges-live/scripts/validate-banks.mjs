import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const questionsDir = path.join(root, 'server', 'questions');
const publicDir = path.join(root, 'public');
const mediaFields = ['question', 'image', 'imageUrl', 'media', 'asset', 'visual'];
const mediaLike = /(?:^|\/)(?:public\/)?(?:flags|guess|name)\/|\.(?:svg|png|jpe?g|webp)(?:[?#]|$)/i;
const files = fs.readdirSync(questionsDir).filter((file) => file.endsWith('.json'));
let total = 0;
const errors = [];

function checkMediaReference(value, bankFile, questionNumber, field) {
  if (typeof value !== 'string' || !mediaLike.test(value.trim())) return;

  const raw = value.trim();
  if (/[\\?#\u0000-\u0020]/.test(raw)) {
    errors.push(`${bankFile}:${questionNumber}: invalid media path in ${field}`);
    return;
  }
  const normalized = raw.replace(/^\/?public\//i, '/');
  const candidate = normalized.startsWith('/') ? normalized : '/' + normalized;
  const match = candidate.match(/^\/(flags|guess|name)\/([a-z0-9][a-z0-9._-]*)$/i);
  if (!match) {
    errors.push(`${bankFile}:${questionNumber}: media must use a local flags, guess, or name asset (${field})`);
    return;
  }

  const folder = match[1].toLowerCase();
  const assetPath = path.resolve(publicDir, folder, match[2]);
  const allowedDir = path.resolve(publicDir, folder);
  const relative = path.relative(allowedDir, assetPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    errors.push(`${bankFile}:${questionNumber}: media path escapes its bank folder (${field})`);
    return;
  }
  try {
    if (!fs.statSync(assetPath).isFile()) throw new Error('not a file');
  } catch {
    errors.push(`${bankFile}:${questionNumber}: missing local media ${candidate}`);
  }
}

for (const file of files) {
  const full = path.join(questionsDir, file);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (error) {
    errors.push(`${file}: invalid JSON`);
    continue;
  }
  if (!Array.isArray(data)) continue;
  const seen = new Set();
  data.forEach((question, index) => {
    total += 1;
    const questionNumber = index + 1;
    if (!question || typeof question !== 'object' || !String(question.question || '').trim()) {
      errors.push(`${file}:${questionNumber}: missing question`);
      return;
    }
    const key = String(question.question).trim();
    if (seen.has(key)) errors.push(`${file}:${questionNumber}: duplicate question`);
    seen.add(key);

    for (const field of mediaFields) checkMediaReference(question[field], file, questionNumber, field);
    if (question.category === 'خمن الدولة' && /^\/?(?:public\/)?flags\/[a-z]{2}\.svg$/i.test(key)) {
      if (!String(question.answer || '').trim()) errors.push(`${file}:${questionNumber}: flag has no answer`);
    }
  });
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Question-bank quality: OK (${total} records, ${files.length} JSON files; local media references verified)`);
