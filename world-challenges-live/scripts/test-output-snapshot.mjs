import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import '../public/output-snapshot.js';

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
    question: { text: 'السؤال', answer: 'إجابة سرية', category: 'اختبار', revealed: false, explanation: 'لا تُرسل' },
    timer: { remainingSeconds: 12, durationSeconds: 30, running: true },
    captains: { girls: ['قائدة'], boys: [] },
    roundNumber: 2,
    internalNotes: 'لا تُرسل'
  };
  const safe = normalize(legacyLeak);
  assert.ok(safe);
  assert.equal(Object.hasOwn(safe.question, 'answer'), false);
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

test('منشئ الحالة مرتبط فعليًا باللعبة والاستديو ومحمول قبل الملفات التي تستخدمه', async () => {
  const [index, app, studio] = await Promise.all([
    read('../public/index.html'),
    read('../public/app.js'),
    read('../public/studio.js')
  ]);
  const helperPosition = index.indexOf('output-snapshot.js');
  const appPosition = index.indexOf('app.js?v=');
  assert.ok(helperPosition >= 0 && appPosition > helperPosition);
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
