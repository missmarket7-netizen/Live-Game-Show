import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const questionsDir = path.join(root, 'server', 'questions');
const flagsDir = path.join(root, 'public', 'flags');
const files = fs.readdirSync(questionsDir).filter((file) => file.endsWith('.json'));
let total = 0;
const errors = [];

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
    if (!question || typeof question !== 'object' || !String(question.question || '').trim()) {
      errors.push(`${file}:${index + 1}: missing question`);
      return;
    }
    const key = String(question.question).trim();
    if (seen.has(key)) errors.push(`${file}:${index + 1}: duplicate question`);
    seen.add(key);
    if (question.category === 'خمن الدولة' && /^\/flags\/[a-z]{2}\.svg$/i.test(key)) {
      const asset = path.join(flagsDir, key.split('/').pop());
      if (!fs.existsSync(asset)) errors.push(`${file}:${index + 1}: missing flag ${key}`);
      if (!String(question.answer || '').trim()) errors.push(`${file}:${index + 1}: flag has no answer`);
    }
  });
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Question-bank quality: OK (${total} records, ${files.length} JSON files)`);
