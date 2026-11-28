import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import '../public/output-snapshot.js';
import '../public/studio-moment.js';

const { create, normalize } = globalThis.WCQOutputSnapshot;
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

function gameState(overrides = {}) {
  return {
    questions: [{ question: 'ما عاصمة تونس؟', answer: 'تونس', category: 'جغرافيا' }],
    currentIndex: 0,
    girlsScore: 2,
    boysScore: 1,
    timerDuration: 30,
    timerValue: 18,
    isTimerRunning: true,
    isRevealed: false,
    captains: { girls: ['قائدة'], boys: ['قائد'] },
    roundNumber: 1,
    ...overrides
  };
}

test('معرّف الناشر ثابت وتسلسل اللقطات يزيد عندما يتساوى sentAt', () => {
  const originalNow = Date.now;
  const fixedSentAt = Date.now();
  let first;
  let second;
  Date.now = () => fixedSentAt;
  try {
    first = create(gameState());
    second = create(gameState({ girlsScore: 3 }));
  } finally {
    Date.now = originalNow;
  }
  assert.equal(first.sentAt, second.sentAt);
  assert.match(first.sourceId, /^[a-f0-9]{32}$/);
  assert.equal(second.sourceId, first.sourceId);
  assert.ok(second.sequence > first.sequence);
  const invalidIdentity = normalize({ ...second, sourceId: 'not-a-source' });
  assert.equal(Object.hasOwn(invalidIdentity, 'sourceId'), false);
  assert.equal(Object.hasOwn(invalidIdentity, 'sequence'), false);
});

test('لا تتضمن لقطة السؤال الإجابة قبل الكشف ولا تستدعي محلل الإجابة', () => {
  let resolverCalls = 0;
  const secretAnswer = 'مفتاح-إجابة-سرية-9X';
  const snapshot = create(gameState(), () => { resolverCalls += 1; return secretAnswer; });
  assert.ok(snapshot);
  assert.equal(Object.hasOwn(snapshot.question, 'answer'), false);
  assert.equal(JSON.stringify(snapshot).includes(secretAnswer), false);
  assert.equal(resolverCalls, 0);
});

test('تتضمن الإجابة بعد كشف المقدم فقط وبنص منقح', () => {
  const snapshot = create(gameState({ isRevealed: true }), () => 'تونس\n\u0001 العاصمة');
  assert.equal(snapshot.question.answer, 'تونس العاصمة');
  assert.equal(snapshot.question.revealed, true);
});

test('تُتاح الإجابة عند انتهاء المؤقت وإيقافه، ولا تُتاح إذا بقي يعمل عند الصفر', () => {
  const ended = create(gameState({ timerValue: 0, isTimerRunning: false }), () => 'تونس');
  const stillRunning = create(gameState({ timerValue: 0, isTimerRunning: true }), () => 'تونس');
  const missingTimer = create(gameState({ timerValue: undefined }), () => 'تونس');
  assert.equal(ended.question.answer, 'تونس');
  assert.equal(Object.hasOwn(stillRunning.question, 'answer'), false);
  assert.equal(Object.hasOwn(missingTimer.question, 'answer'), false);
});

test('منشئ اللقطة يعقم snapshot قديمًا يحتوي إجابة مبكرة ويزيل الحقول غير المسموحة', () => {
  const legacyLeak = {
    schemaVersion: 1,
    sentAt: Date.now(),
    ready: true,
    scores: { girls: 3, boys: 1 },
    question: { text: 'السؤال', answer: 'إجابة سرية', category: 'اختبار', revealed: false, correctIndex: 2, explanation: 'لا تُرسل' },
    timer: { remainingSeconds: 12, durationSeconds: 30, running: true },
    captains: { girls: ['قائدة'], boys: [] },
    roundNumber: 2,
    internalNotes: 'لا تُرسل'
  };
  const safe = normalize(legacyLeak);
  assert.ok(safe);
  assert.equal(Object.hasOwn(safe.question, 'answer'), false);
  assert.equal(Object.hasOwn(safe.question, 'correctIndex'), false);
  assert.equal(Object.hasOwn(safe.question, 'explanation'), false);
  assert.equal(Object.hasOwn(safe, 'internalNotes'), false);
  assert.equal(JSON.stringify(safe).includes('إجابة سرية'), false);
  assert.equal(JSON.stringify(safe).includes('لا تُرسل'), false);
  const missingTimer = normalize({ ...legacyLeak, timer: { running: false } });
  assert.equal(Object.hasOwn(missingTimer.question, 'answer'), false);
});

test('الإجابة الحرة تظل مخفية قبل وقت الحكم وتعرض تعليمات التحكيم بعد الكشف', () => {
  const state = gameState({ questions: [{ question: 'سؤال من الجمهور', source: 'random-host' }] });
  const hidden = create(state, () => 'يجب ألا يستدعى');
  const revealed = create({ ...state, isRevealed: true }, () => 'قيمة غير مستخدمة');
  assert.equal(Object.hasOwn(hidden.question, 'answer'), false);
  assert.equal(revealed.question.answer, 'إجابة حرة — الحكم للمقدم');
});

test('لقطة الاختيار المتعدد تعرض نص الخيارات فقط ولا تكشف حقول الحل قبل الكشف', () => {
  const question = {
    question: 'ما عاصمة تونس؟', category: 'جغرافيا',
    options: ['صفاقس', 'تونس', 'سوسة', 'بنزرت'], correctIndex: 1,
    answer: 'تونس', explanation: 'سر لا يظهر للجمهور'
  };
  const hidden = create(gameState({ questions: [question] }));
  assert.equal(hidden.schemaVersion, 1);
  assert.equal(hidden.question.kind, 'choice');
  assert.deepEqual(hidden.question.options, question.options);
  assert.equal(Object.hasOwn(hidden.question, 'answer'), false);
  assert.equal(Object.hasOwn(hidden.question, 'correctIndex'), false);
  assert.equal(Object.hasOwn(hidden.question, 'explanation'), false);
  assert.equal(JSON.stringify(hidden).includes('سر لا يظهر للجمهور'), false);
  const revealed = create(gameState({ questions: [question], isRevealed: true }));
  assert.equal(revealed.question.answer, 'تونس');
  assert.deepEqual(revealed.question.options, question.options);
  assert.equal(Object.hasOwn(revealed.question, 'correctIndex'), false);
});

test('لقطة الإجابة الحرة تحدد kind دون اختراع خيارات أو تسريب الإجابة', () => {
  const state = gameState({ questions: [{ question: 'اذكر إجابة من الجمهور', answer: 'إجابة خاصة', source: 'random-host' }] });
  const hidden = create(state);
  assert.equal(hidden.question.kind, 'free');
  assert.deepEqual(hidden.question.options, []);
  assert.equal(Object.hasOwn(hidden.question, 'answer'), false);
  const revealed = create({ ...state, isRevealed: true });
  assert.equal(revealed.question.answer, 'إجابة حرة — الحكم للمقدم');
});

test('لقطة العلم تحمل أصلاً محلياً موجوداً ووصفاً محايداً لا يكشف اسم الدولة', () => {
  const snapshot = create(gameState({ questions: [{
    question: '/flags/ad.svg', category: 'خمن الدولة', answer: 'أندورا', explanation: 'تفاصيل الإجابة'
  }] }));
  assert.equal(snapshot.question.kind, 'flag');
  assert.equal(snapshot.question.mediaSrc, '/flags/ad.svg');
  assert.equal(snapshot.question.mediaAlt, 'علم دولة للتخمين');
  assert.equal(Object.hasOwn(snapshot.question, 'answer'), false);
  assert.equal(JSON.stringify(snapshot).includes('أندورا'), false);
  assert.equal(JSON.stringify(snapshot).includes('تفاصيل الإجابة'), false);
});

test('لقطة تخمين الصورة تلتقط الوسيط المحلي من السؤال القائم وتحافظ على كشف الإجابة الحالي', () => {
  const question = {
    question: '/guess/01.jpg', image: '/guess/01.jpg', category: 'خمن الدولة أو المدينة',
    answer: 'قطر', explanation: 'الإجابة سرية حتى الكشف'
  };
  const hidden = create(gameState({ questions: [question] }));
  assert.equal(hidden.question.kind, 'image-guess');
  assert.equal(hidden.question.mediaSrc, '/guess/01.jpg');
  assert.equal(hidden.question.mediaAlt, 'صورة للتخمين');
  assert.equal(Object.hasOwn(hidden.question, 'answer'), false);
  assert.equal(JSON.stringify(hidden).includes('قطر'), false);
  const revealed = create(gameState({ questions: [question], isRevealed: true }));
  assert.equal(revealed.question.answer, 'قطر');
  assert.equal(revealed.question.mediaSrc, '/guess/01.jpg');
});

test('تطبيع اللقطة يرفض الوسائط الخارجية والمسارات المحلية غير الموجودة ويقبل الملفات المعتمدة فقط', () => {
  const base = {
    schemaVersion: 1, sentAt: Date.now(), ready: true,
    question: { text: 'سؤال بصري', kind: 'image-guess', mediaSrc: '/guess/01.jpg', mediaAlt: 'وصف محايد', revealed: false },
    timer: { remainingSeconds: 10, durationSeconds: 30, running: true }
  };
  assert.equal(normalize(base).question.mediaSrc, '/guess/01.jpg');
  for (const mediaSrc of ['https://example.com/image.jpg', '//example.com/image.jpg', '/guess/not-present.jpg', '/guess/../flags/ad.svg']) {
    const safe = normalize({ ...base, question: { ...base.question, mediaSrc } });
    assert.equal(Object.hasOwn(safe.question, 'mediaSrc'), false, `rejected ${mediaSrc}`);
  }
  const missingImage = create(gameState({ questions: [{
    question: '/guess/missing.jpg', category: 'خمن الدولة أو المدينة', answer: 'لا ترسل'
  }] }));
  assert.equal(missingImage.question.kind, 'image-guess');
  assert.equal(Object.hasOwn(missingImage.question, 'mediaSrc'), false);
  assert.equal(Object.hasOwn(missingImage.question, 'answer'), false);
});

test('منشئ الحالة مرتبط فعليًا باللعبة والاستديو ومحمول قبل الملفات التي تستخدمه', async () => {
  const [index, app, studio, serviceWorker] = await Promise.all([
    read('../public/index.html'),
    read('../public/app.js'),
    read('../public/studio.js'),
    read('../public/sw.js')
  ]);
  const helperPosition = index.indexOf('output-snapshot.js');
  const appPosition = index.indexOf('app.js?v=');
  assert.ok(helperPosition >= 0 && appPosition > helperPosition);
  assert.match(index, /<script src="\/app\.js\?v=118-main-portal-cache-bust"><\/script>/);
  assert.match(serviceWorker, /"\/app\.js\?v=118-main-portal-cache-bust"/);
  assert.match(index, /<script src="captain-sounds\.js\?v=118"><\/script>/);
  assert.match(serviceWorker, /"\/captain-sounds\.js\?v=118"/);
  assert.match(app, /snapshotBuilder\.create\(state,\s*questionAnswer\)/);
  assert.match(app, /outputChannel\.postMessage\(\{ channel: OUTPUT_CHANNEL_NAME, type: 'snapshot', snapshot \}\)/);
  assert.doesNotMatch(app, /img\.alt\s*=\s*q\.answer/);
  assert.match(studio, /snapshotBuilder\.normalize\(message\.snapshot\)/);
  assert.match(studio, /lgs_studio_game_last_snapshot_v1/);
});

test('لوحة تحكم المخرج تطبّع اللقطة الواردة والمخزنة قبل العرض أو إعادة الحفظ', async () => {
  const [control, controlPage] = await Promise.all([
    read('../public/studio-control.js'),
    read('../public/studio-control.html')
  ]);
  const helperPosition = controlPage.indexOf('output-snapshot.js');
  const controllerPosition = controlPage.indexOf('studio-control.js?v=');
  assert.ok(helperPosition >= 0 && controllerPosition > helperPosition);
  assert.match(control, /snapshotBuilder\.normalize\(raw\)/);
  assert.match(control, /const safeSnapshot = normalizeGameSnapshot\(message\.snapshot\)/);
  assert.match(control, /localStorage\.setItem\(GAME_CACHE, JSON\.stringify\(safeSnapshot\)\)/);
  assert.match(control, /normalizeGameSnapshot\(raw\)/);
  assert.doesNotMatch(control, /localStorage\.setItem\(GAME_CACHE,\s*JSON\.stringify\(message\.snapshot\)\)/);
});

test('مخرج OBS مستقل عن التبويبات ويحتفظ بآخر لقطة صالحة مع حالة توقف صادقة', async () => {
  const [outputPage, output, app, server] = await Promise.all([
    read('../public/output.html'),
    read('../public/output.js'),
    read('../public/app.js'),
    read('../server/server.js')
  ]);
  const contractPosition = outputPage.indexOf('output-snapshot.js');
  const consumerPosition = outputPage.indexOf('output.js?v=');
  assert.ok(contractPosition >= 0 && consumerPosition > contractPosition, 'shared allowlist loads before the output consumer');
  assert.match(server, /app\.get\("\/api\/output-snapshot"/);
  assert.match(server, /app\.post\("\/api\/output-snapshot"/);
  assert.match(output, /fetch\('\/api\/output-snapshot'/);
  assert.match(output, /payload && payload\.updatedAt/);
  assert.match(server, /latestOutputSnapshotReceivedAt/);
  assert.match(output, /lastServerAt/);
  assert.match(output, /OBS غير مضمون/);
  assert.match(output, /localStorage\.setItem\(CACHE_KEY, JSON\.stringify\(snapshot\)\)/);
  assert.match(output, /التحديث متوقف/);
  assert.match(output, /snapshot\.question\.answer/);
  assert.match(app, /operatorApiFetch\('\/api\/output-snapshot'/);
  assert.match(app, /pendingServerOutputSnapshot/);
  assert.match(app, /1000 - \(Date\.now\(\) - lastServerOutputSentAt\)/);
  assert.match(app, /window\.setInterval\(publishOutputSnapshot, 1000\)/);
});

test('تطبيع اللقطة يقبل moment المسموح فقط ويزيل الحقول الإضافية', () => {
  const base = {
    schemaVersion: 1, sentAt: Date.now(), ready: true,
    question: { text: 'سؤال', revealed: false },
    timer: { remainingSeconds: 10, durationSeconds: 30, running: true },
    moment: { id: 'score:1732400000000:1', type: 'score', team: 'girls', sentAt: Date.now(), debug: 'لا يمرر' }
  };
  const safe = normalize(base);
  assert.deepEqual(safe.moment, {
    id: 'score:1732400000000:1', type: 'score', team: 'girls', sentAt: base.moment.sentAt
  });
  assert.deepEqual(Object.keys(safe.moment).sort(), ['id', 'sentAt', 'team', 'type']);
  assert.equal(JSON.stringify(safe).includes('لا يمرر'), false);
  const fromState = create(gameState({ moment: safe.moment }));
  assert.deepEqual(fromState.moment, safe.moment);
  for (const [type, team] of [
    ['score', 'girls'], ['round-win', 'girls'], ['round-loss', 'boys'], ['draw', 'draw'], ['match-win', 'boys']
  ]) {
    assert.equal(normalize({ ...base, moment: { id: `${type}-id`, type, team, sentAt: Date.now() } }).moment.type, type);
  }
});

test('تطبيع اللقطة يسقط moment ذات النوع أو الفريق أو المعرّف أو الطابع غير السليم', () => {
  const base = {
    schemaVersion: 1, sentAt: Date.now(), ready: true,
    question: { text: 'سؤال', revealed: false },
    timer: { remainingSeconds: 10, durationSeconds: 30, running: true },
    moment: { id: 'moment-1', type: 'score', team: 'girls', sentAt: Date.now() }
  };
  const invalidMoments = [
    { ...base.moment, type: 'gift' },
    { ...base.moment, team: 'hosts' },
    { ...base.moment, id: 'bad id' },
    { ...base.moment, id: '' },
    { ...base.moment, id: 'x'.repeat(120) },
    { ...base.moment, sentAt: '1732400000000' },
    { ...base.moment, sentAt: 0 },
    { ...base.moment, sentAt: Number.NaN },
    { ...base.moment, sentAt: Date.now() + 60000 },
    { ...base.moment, team: 'draw' }
  ];
  for (const moment of invalidMoments) {
    const safe = normalize({ ...base, moment });
    assert.ok(safe, 'invalid optional moment does not discard a valid legacy snapshot');
    assert.equal(Object.hasOwn(safe, 'moment'), false, JSON.stringify(moment));
  }
});

test('اللقطات القديمة دون moment تبقى صالحة ولا تضيف حقلاً اصطناعياً', () => {
  const legacy = normalize({
    schemaVersion: 1, sentAt: Date.now(), ready: false,
    question: { text: 'بانتظار السؤال' },
    timer: { remainingSeconds: 30, durationSeconds: 30, running: false }
  });
  assert.ok(legacy);
  assert.equal(Object.hasOwn(legacy, 'moment'), false);
});

test('لقطة اللعبة الفارغة تنتظر بدء اللعبة ولا تحتوي إجابة', () => {
  const snapshot = create(gameState({ questions: [], currentIndex: 0 }));
  assert.ok(snapshot);
  assert.equal(snapshot.ready, false);
  assert.equal(Object.hasOwn(snapshot.question, 'answer'), false);
});

test('الاستديو ينتظر بدء اللعبة ويستقبل اللقطة محليًا مع إبقاء واجهة HTTP للقراءة فقط', async () => {
  const [studio, page, serviceWorker] = await Promise.all([
    read('../public/studio-v2.js'), read('../public/studio-v2.html'), read('../public/sw.js')
  ]);
  assert.match(studio, /بانتظار بدء اللعبة/);
  assert.match(page, /id="studioQuestionText"[^>]*>بانتظار بدء اللعبة…</);
  assert.match(page, /id="studioQuestionIndex"[^>]*>بانتظار بدء اللعبة</);
  assert.match(page, /output-snapshot\.js\?v=20261127-qaddaha-studio-sync-v1/);
  assert.match(serviceWorker, /"\/output-snapshot\.js\?v=20261127-qaddaha-studio-sync-v1"/);
  assert.match(studio, /fetch\('\/api\/output-snapshot'/);
  assert.match(studio, /wcq-output-v1/);
  assert.match(studio, /message\.type !== 'snapshot'/);
  assert.match(studio, /acceptSnapshot\(message\.snapshot, message\.snapshot && message\.snapshot\.sentAt\)/);
  assert.match(studio, /lastUpdatedAt = Math\.max\(lastUpdatedAt, timestamp\)/);
  assert.doesNotMatch(studio, /response\.status === 204\)[\s\S]{0,100}lastUpdatedAt\s*=\s*0/);
  assert.doesNotMatch(studio, /\/api\/(?:questions|generate)\b/);
});

test('حارس moment يزيل التكرار سلوكياً ويستعيد آخر معرّف من تخزين الجلسة', () => {
  const storageData = new Map([['moment-key', 'already-seen']]);
  const storage = {
    getItem(key) { return storageData.get(key) || null; },
    setItem(key, value) { storageData.set(key, value); }
  };
  const gate = globalThis.WCQStudioMoment.createGate(storage, 'moment-key');
  assert.equal(gate.accept({ id: 'already-seen' }), false);
  assert.equal(gate.accept({ id: 'fresh-1' }), true);
  assert.equal(gate.accept({ id: 'fresh-1' }), false);
  assert.equal(storageData.get('moment-key'), 'fresh-1');
  assert.equal(gate.accept({ id: 'fresh-2' }), true);
  assert.equal(gate.lastId(), 'fresh-2');
});

test('حارس moment يستمر في منع التكرار بالذاكرة عند غياب sessionStorage أو رميه خطأ', () => {
  const unavailable = globalThis.WCQStudioMoment.createGate(null, 'moment-key');
  assert.equal(unavailable.accept({ id: 'one' }), true);
  assert.equal(unavailable.accept({ id: 'one' }), false);
  const blockedStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); }
  };
  const blocked = globalThis.WCQStudioMoment.createGate(blockedStorage, 'moment-key');
  assert.equal(blocked.accept({ id: 'two' }), true);
  assert.equal(blocked.accept({ id: 'two' }), false);
});

test('اللعبة تصدر اللحظات من تغيّر النقاط ونتيجة الجولة والمباراة، والاستديو ينظف تنبيه اللحظة', async () => {
  const [app, snapshot, studio, page] = await Promise.all([
    read('../public/app.js'), read('../public/output-snapshot.js'), read('../public/studio-v2.js'), read('../public/studio-v2.html')
  ]);
  const functionBody = (name, nextName) => app.slice(app.indexOf(`function ${name}(`), app.indexOf(`function ${nextName}(`));
  const apply = functionBody('applyPoint', 'finishRound');
  const subtract = functionBody('subtractPoint', 'burstAt');
  const finish = functionBody('finishRound', 'continueAfterRound');
  const results = functionBody('showResults', 'fireConfetti');
  const giftSelection = functionBody('selectGift', 'resolveGift');
  assert.match(app, /moment:\s*null/);
  assert.match(app, /function emitGameMoment\(type, team\)/);
  assert.match(snapshot, /moment:\s*state\.moment/);
  assert.match(apply, /previousScore/);
  assert.match(apply, /emitGameMoment\('score', team\)/);
  assert.match(subtract, /previousScore/);
  assert.match(subtract, /emitGameMoment\('score', team\)/);
  assert.match(finish, /emitGameMoment\('round-win', winner\)/);
  assert.match(finish, /emitGameMoment\('draw', 'draw'\)/);
  assert.match(results, /emitGameMoment\('match-win', team\)/);
  assert.match(results, /emitGameMoment\('draw', 'draw'\)/);
  assert.match(results, /if \(!state\.matchResultMomentEmitted\)/);
  assert.doesNotMatch(giftSelection, /emitGameMoment/);
  assert.match(page, /studio-moment\.js/);
  assert.match(page, /id="studioMomentNotice"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(studio, /createGate\(safeSessionStorage\(\),\s*MOMENT_STORAGE_KEY\)/);
  assert.match(studio, /momentGate\.accept\(moment\)/);
  assert.match(studio, /showMomentNotice\(snapshot\.moment\)/);
  assert.ok((studio.match(/clearTimeout\(momentNoticeTimer\)/g) || []).length >= 2);
  assert.match(studio, /sessionStorage/);
});
