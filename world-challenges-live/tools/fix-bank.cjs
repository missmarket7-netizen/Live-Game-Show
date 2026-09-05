const fs = require('fs');
const path = require('path');
const DIR = path.join(process.cwd(), 'server', 'questions');

const norm = (s) => String(s || '').toLowerCase()
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[^\u0621-\u064Aa-z0-9]/g, '').trim();

/* إصلاح اقتباسات داخلية تكسر JSON */
function fixJsonText(text) {
  let out = '', inStr = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inStr) { if (ch === '"') inStr = true; out += ch; }
    else if (ch === '\\') { out += ch + (text[i + 1] || ''); i++; }
    else if (ch === '"') {
      let j = i + 1;
      while (j < text.length && ' \t\r\n'.includes(text[j])) j++;
      const nx = text[j];
      if (nx === ':' || nx === ',' || nx === '}' || nx === ']' || nx === undefined) { inStr = false; out += ch; }
      else out += '\\"';
    } else out += ch;
  }
  return out;
}

/* ❌ أسئلة تُحذف نهائياً (خطأ أو التباس أو شك) */
const REMOVE = new Set([
  'كم عدد التكبيرات في تكبيرة الإحرام؟',
  'ما هو أقدم كتاب في التاريخ؟',
  'في أي رياضة توجد كلمة "باول"؟',
  'ما هو البطل العربي الأول في أولمبياد؟',
  'ما هي أول سورة كاملة نزلت؟',
  'ما هو الشيء الذي لا يراه الناس إلا في الليل؟',
  'ما هو الشيء الذي ينام بالنهار ويصحو بالليل؟',
  'كم عدد سور القرآن التي تبدأ بـ "ألم"؟',
  'ما الشيء الذي يبدأ بحرف وينتهي بحرف وليس كلمة؟'
].map(norm));

/* 🔧 تصحيحات دقيقة (صياغة/إجابة/خيارات) */
const FIX = new Map(Object.entries({
  'من بطل فيلم سلام يا صاحبي؟': { options: ['داود عبد السيد', 'عادل إمام', 'عمر الشريف', 'محمود عبد العزيز'] },
  'من بطلة فيلم الكرنك؟': { options: ['سعاد حسني', 'لبلبة', 'عمر الشريف', 'مريم فخر الدين'] },
  'من بطلة فيلم الإرهاب والكباب؟': { options: ['فاتن حمامة', 'نور الشريف', 'يسرا', 'عبلة كامل'] },
  'ما هو الشيء الذي له أذن ولا يسمع؟': { options: ['القلم', 'الكوب', 'النار', 'الكتاب'] },
  'من أول من آمن من النساء؟': { options: ['المدينة المنورة', 'أحد', 'خديجة بنت خويلد', 'أسماء بنت أبي بكر'] },
  'أين تقع ماتشو بيتشو؟': { options: ['بيرو', 'جنوب أفريقيا', 'المكسيك', 'اليونان'], correctIndex: 0 },
  'ما اتجاه القبلة في الصلاة؟': { options: ['نحو الكعبة المشرفة', 'نحو المسجد الأقصى', 'نحو المشرق فقط', 'نحو الشمال فقط'], correctIndex: 0 },
  'كم عدد أشواط مباراة الكرة الطائرة الشاطئية؟': { question: 'ما أقصى عدد أشواط في مباراة الكرة الطائرة الشاطئية؟', options: ['شوطان', '3 أشواط', '4 أشواط', '5 أشواط'], correctIndex: 1, explanation: 'تُلعب بنظام الأفضل من 3 أشواط.' },
  'ما اسم سورة يطلق عليها "عروس القرآن"؟': { question: 'ما اسم السورة التي تلقب بـ«عروس القرآن»؟', explanation: 'سورة الرحمن تلقب بعروس القرآن.' },
  'كم عدد أحرف القرآن؟': { correctIndex: 1, explanation: 'يُذكر أن عدد حروف القرآن 323,671 حرفاً (323 ألفاً).' },
  'ما اسم أشهر متصفح للإنترنت؟': { options: ['جوجل كروم', 'موزيلا فايرفوكس', 'سفاري', 'إيدج'], correctIndex: 0, explanation: 'جوجل كروم الأكثر استخداماً عالمياً.' },
  'ما هو اللون الأزرق للكوكب الذي نعيش عليه؟': { question: 'ما لون الكوكب الذي نعيش عليه؟' },
  'ما هي أكبر صحراء في العالم؟': { question: 'ما هي أكبر صحراء حارة في العالم؟', explanation: 'الصحراء الكبرى أكبر الصحراء الحارة في العالم.' },
  'من هو اللاعب العربي الذي فاز بالكرة الذهبية؟': { question: 'من اللاعب العربي المتوج بجائزة أفضل لاعب في أفريقيا (الكرة الذهبية الأفريقية)؟', explanation: 'رياض محرز تُوج بالكرة الذهبية الأفريقية.' }
}).map(([k, v]) => [norm(k), v]));

const removed = [], fixed = [], dropped = [];
const seenGlobal = new Set();

for (let n = 1; n <= 6; n++) {
  const file = path.join(DIR, 'db' + n + '.json');
  if (!fs.existsSync(file)) continue;
  const data = JSON.parse(fixJsonText(fs.readFileSync(file, 'utf8')));
  const out = [];
  for (const raw of data) {
    const q = {};
    for (const [k, v] of Object.entries(raw)) {
      const key = k.trim();
      q[key] = typeof v === 'string' ? v.trim() : v;
    }
    if (Array.isArray(q.options)) q.options = q.options.map((x) => String(x).trim());
    q.category = String(q.category || 'معلومات عامة').trim();
    if (q.category === 'سرعة') { removed.push(q.question || 'سرعة'); continue; }
    const nk = norm(q.question);
    if (REMOVE.has(nk)) { removed.push(q.question); continue; }
    if (FIX.has(nk)) { Object.assign(q, FIX.get(nk)); fixed.push(q.question); }
    /* تحقق صارم */
    const ok = q.question && Array.isArray(q.options) && q.options.length === 4 &&
      q.options.every((o) => o) && new Set(q.options.map((o) => norm(o))).size === 4 &&
      Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex <= 3;
    if (!ok) { dropped.push(q.question); continue; }
    if (seenGlobal.has(nk)) { dropped.push('مكرر: ' + q.question); continue; }
    seenGlobal.add(nk);
    out.push({ category: q.category, difficulty: String(q.difficulty || 'متوسط').trim(), question: q.question, options: q.options, correctIndex: q.correctIndex, explanation: String(q.explanation || '').trim() });
  }
  fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');
  console.log('✅ db' + n + '.json → ' + out.length + ' سؤال نظيف');
}
console.log('\n❌ حُذفت (' + removed.length + '):'); removed.forEach((x) => console.log('  - ' + x));
console.log('🔧 صُححت (' + fixed.length + '):'); fixed.forEach((x) => console.log('  - ' + x));
console.log('🧹 استُبعدت إضافية (' + dropped.length + '):'); dropped.forEach((x) => console.log('  - ' + x));

/* تحقق نهائي صارم */
let total = 0;
for (let n = 1; n <= 6; n++) {
  const file = path.join(DIR, 'db' + n + '.json');
  if (!fs.existsSync(file)) continue;
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  total += d.length;
}
console.log('\n🏦 إجمالي البنك النهائي: ' + total + ' سؤالاً');
