import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import '../public/output-snapshot.js';

const projectDir = process.cwd();
const chromiumCandidates = [
  process.env.CHROMIUM_BIN,
  'chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome', '/snap/bin/chromium'
].filter(Boolean);
const pathEntries = (process.env.PATH || '').split(delimiter).filter(Boolean);
let chromium = '';
for (const candidate of chromiumCandidates) {
  const paths = isAbsolute(candidate) || candidate.includes('/')
    ? [candidate]
    : pathEntries.map((directory) => join(directory, candidate));
  for (const candidatePath of paths) {
    try {
      await access(candidatePath, fsConstants.X_OK);
      chromium = candidatePath;
      break;
    } catch {}
  }
  if (chromium) break;
}
if (!chromium) {
  console.log('SKIP: Studio V2 browser integration requires Chromium; no executable found.');
  process.exit(0);
}
const contract = globalThis.WCQOutputSnapshot;
const operatorKey = randomBytes(32).toString('hex');

async function reservePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit').catch(() => undefined);
  child.kill('SIGTERM');
  await Promise.race([exited, delay(1500)]);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await Promise.race([once(child, 'exit').catch(() => undefined), delay(1000)]);
  }
}

async function request(baseUrl, route, { method = 'GET', body, key } = {}) {
  const headers = {};
  if (key) headers['X-Operator-Key'] = key;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(baseUrl + route, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000)
  });
  return { status: response.status, text: await response.text() };
}

function createGameSnapshot(question, overrides = {}) {
  return contract.create({
    questions: [question],
    currentIndex: 0,
    girlsScore: 4,
    boysScore: 2,
    timerDuration: 30,
    timerValue: 24,
    isTimerRunning: true,
    isRevealed: false,
    captains: { girls: [], boys: [] },
    roundNumber: 1,
    ...overrides
  }, (item) => item.answer);
}

let server = null;
let browser = null;
let socket = null;
let dataRoot = null;
let profileDir = null;
const pendingCommands = new Map();
let commandId = 0;
try {
  dataRoot = await mkdtemp(path.join(os.tmpdir(), 'wcq-studio-v2-browser-data-'));
  await mkdir(path.join(dataRoot, 'questions'), { recursive: true });
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = {
    PATH: process.env.PATH || '/usr/bin:/bin',
    HOME: process.env.HOME || '/tmp',
    NODE_ENV: 'test',
    DOTENV_CONFIG_PATH: '/dev/null',
    PORT: String(port),
    RAILWAY_VOLUME_MOUNT_PATH: dataRoot,
    OPERATOR_WRITE_KEY: operatorKey,
    GEMINI_API_KEY: '',
    OPENROUTER_API_KEY: '',
    GROQ_API_KEY: '',
    TURSO_URL: '',
    TURSO_DATABASE_URL: '',
    TURSO_AUTH_TOKEN: '',
    TURSO_TOKEN: ''
  };
  server = spawn(process.execPath, ['server/server.js'], {
    cwd: projectDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLogs = '';
  const collectLogs = (chunk) => { serverLogs = (serverLogs + chunk.toString()).slice(-8000); };
  server.stdout.on('data', collectLogs);
  server.stderr.on('data', collectLogs);

  let serverReady = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) break;
    try {
      const health = await request(baseUrl, '/api/health');
      if (health.status === 200) {
        serverReady = true;
        break;
      }
    } catch {}
    await delay(100);
  }
  assert.ok(serverReady, `isolated server did not start:\n${serverLogs}`);
  assert.equal((await request(baseUrl, '/api/output-snapshot')).status, 204, 'studio source is empty before the game starts');

  profileDir = await mkdtemp(path.join(os.tmpdir(), 'wcq-studio-v2-browser-profile-'));
  browser = spawn(chromium, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-extensions', '--no-first-run',
    '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, 'about:blank'
  ], { stdio: 'ignore' });
  const activePortFile = path.join(profileDir, 'DevToolsActivePort');
  let debugPort = 0;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      debugPort = Number((await readFile(activePortFile, 'utf8')).split('\n')[0]);
      if (debugPort) break;
    } catch {}
    if (browser.exitCode !== null) throw new Error(`Chromium exited with code ${browser.exitCode}`);
    await delay(50);
  }
  assert.ok(debugPort, 'Chromium did not expose a DevTools port');
  let targets;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      targets = await response.json();
      break;
    } catch { await delay(50); }
  }
  const pageTarget = targets?.find((target) => target.type === 'page');
  assert.ok(pageTarget?.webSocketDebuggerUrl, 'Chromium did not expose a page target');
  socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id) return;
    const pending = pendingCommands.get(message.id);
    if (!pending) return;
    pendingCommands.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++commandId;
      const timer = setTimeout(() => {
        pendingCommands.delete(id);
        reject(new Error(`DevTools command timed out: ${method}`));
      }, 5000);
      pendingCommands.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const response = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'browser evaluation failed');
    return response.result?.value;
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: `${baseUrl}/studio-v2` });
  const readDom = async () => {
    const value = await evaluate(`JSON.stringify({
      ready: document.readyState,
      question: document.querySelector('#studioQuestionText')?.textContent || '',
      answerHidden: document.querySelector('#studioAnswer')?.hidden ?? true,
      answer: document.querySelector('#studioAnswerText')?.textContent || '',
      score: document.querySelector('#studioGirlsScore')?.textContent || '',
      connection: document.querySelector('#studioConnectionText')?.textContent || ''
    })`);
    return JSON.parse(value);
  };
  async function waitFor(predicate, timeoutMs, label) {
    const startedAt = Date.now();
    let current;
    do {
      current = await readDom();
      if (predicate(current)) return { state: current, elapsedMs: Date.now() - startedAt };
      await delay(30);
    } while (Date.now() - startedAt < timeoutMs);
    throw new Error(`${label} not observed within ${timeoutMs}ms; last DOM state: ${JSON.stringify(current)}`);
  }

  await waitFor((dom) => dom.ready === 'complete' && dom.question.includes('بانتظار بدء اللعبة'), 3000, 'initial waiting UI');
  const gamePage = await request(baseUrl, '/api/questions', {
    method: 'POST',
    key: operatorKey,
    body: { category: 'اختيارات متنوعة', difficulty: 'سهل', count: 10, avoid: [] }
  });
  assert.equal(gamePage.status, 200, 'the existing game bank route must provide the question');
  const bankPayload = JSON.parse(gamePage.text);
  assert.equal(bankPayload.meta?.source, 'no-repeat-engine', 'the selected question must come from the program bank');
  const bankQuestion = bankPayload.questions?.find((question) =>
    typeof question.question === 'string' && String(question.answer || '').trim()
  );
  assert.ok(bankQuestion, 'the selected game-bank batch must contain an answerable prompt for the reveal check');
  const hidden = createGameSnapshot(bankQuestion);
  assert.ok(hidden?.ready, 'the existing game snapshot contract must accept the selected bank record');
  assert.equal(Object.hasOwn(hidden.question, 'answer'), false, 'the game snapshot must keep the answer hidden before reveal');

  const hiddenPublishStartedAt = Date.now();
  const publishHidden = await request(baseUrl, '/api/output-snapshot', {
    method: 'POST', key: operatorKey, body: { snapshot: hidden }
  });
  assert.equal(publishHidden.status, 200, 'the game snapshot must be accepted by the shared output endpoint');
  const hiddenRead = await request(baseUrl, '/api/output-snapshot');
  assert.equal(hiddenRead.status, 200);
  const hiddenPublished = JSON.parse(hiddenRead.text).snapshot;
  assert.equal(hiddenPublished.question.text, hidden.question.text, 'the public output must preserve the exact game question text');
  assert.equal(Object.hasOwn(hiddenPublished.question, 'answer'), false, 'the public output must not disclose the unrevealed answer');
  assert.equal(Object.hasOwn(hiddenPublished.question, 'correctIndex'), false);
  assert.equal(Object.hasOwn(hiddenPublished.question, 'explanation'), false);

  const displayed = await waitFor((dom) => dom.question === hidden.question.text, 2000, 'official bank question in studio');
  const httpRenderMs = Date.now() - hiddenPublishStartedAt;
  assert.ok(httpRenderMs <= 2000, `HTTP-published bank question must render within 2 seconds; got ${httpRenderMs}ms`);
  assert.equal(displayed.state.answerHidden, true, 'the studio answer panel must stay hidden before reveal');

  const originalNow = Date.now;
  let sameTime;
  Date.now = () => hidden.sentAt;
  try {
    sameTime = createGameSnapshot(bankQuestion, { girlsScore: 7 });
  } finally {
    Date.now = originalNow;
  }
  assert.equal(sameTime.sentAt, hidden.sentAt, 'the refresh deliberately shares the original sentAt');
  assert.equal(sameTime.sourceId, hidden.sourceId, 'the refresh comes from the same publisher');
  assert.ok(sameTime.sequence > hidden.sequence, 'the refresh carries a newer publisher sequence');
  const sameTimePublish = await request(baseUrl, '/api/output-snapshot', {
    method: 'POST', key: operatorKey, body: { snapshot: sameTime }
  });
  assert.equal(sameTimePublish.status, 200, 'the server accepts the changed frame with the same sentAt');
  const sameTimeDisplayed = await waitFor((dom) => dom.score === '7', 1800, 'changed equal-timestamp snapshot');
  assert.equal(sameTimeDisplayed.state.question, hidden.question.text);
  assert.equal(sameTimeDisplayed.state.answerHidden, true, 'equal-timestamp refreshes must preserve hidden-answer state');

  const duplicateSequence = await request(baseUrl, '/api/output-snapshot', {
    method: 'POST', key: operatorKey, body: { snapshot: sameTime }
  });
  assert.equal(duplicateSequence.status, 409, 'an identical sequence replay must be rejected');
  const delayedOlderTie = await request(baseUrl, '/api/output-snapshot', {
    method: 'POST', key: operatorKey, body: { snapshot: { ...hidden, scores: { girls: 5, boys: 2 } } }
  });
  assert.equal(delayedOlderTie.status, 409, 'a delayed lower-sequence frame from the same publisher is rejected');
  const ambiguousOtherPublisher = await request(baseUrl, '/api/output-snapshot', {
    method: 'POST', key: operatorKey,
    body: { snapshot: { ...sameTime, sourceId: 'a'.repeat(32), sequence: sameTime.sequence + 100, scores: { girls: 9, boys: 2 } } }
  });
  assert.equal(ambiguousOtherPublisher.status, 409, 'an equal-time frame from another publisher is not considered newer');
  const stillCurrent = JSON.parse((await request(baseUrl, '/api/output-snapshot')).text).snapshot;
  assert.equal(stillCurrent.scores.girls, 7, 'rejected equal-time frames must not replace the newest state');

  const localDelayedTie = {
    channel: 'wcq-output-v1', type: 'snapshot',
    snapshot: { ...hidden, scores: { girls: 5, boys: 2 } }
  };
  await evaluate(`(() => { window.__wcqTestPublisher = new BroadcastChannel('wcq-output-v1'); window.__wcqTestPublisher.postMessage(${JSON.stringify(localDelayedTie)}); return true; })()`);
  await delay(150);
  assert.equal((await readDom()).score, '7', 'the studio also rejects a delayed equal-time local frame');

  const stale = {
    channel: 'wcq-output-v1', type: 'snapshot',
    snapshot: { ...hidden, sentAt: hidden.sentAt - 1, question: { ...hidden.question, text: 'لقطة قديمة لا يجب أن تستبدل السؤال' } }
  };
  await evaluate(`window.__wcqTestPublisher.postMessage(${JSON.stringify(stale)}); true`);
  await delay(150);
  assert.equal((await readDom()).question, hidden.question.text, 'an older local snapshot must not replace the current studio question');

  await delay(5);
  const localFresh = createGameSnapshot(bankQuestion, { girlsScore: 8 });
  assert.ok(localFresh.sentAt > hidden.sentAt, 'the local test frame must be newer than the server frame');
  const localMessage = { channel: 'wcq-output-v1', type: 'snapshot', snapshot: localFresh };
  const localStartedAt = Date.now();
  await evaluate(`window.__wcqTestPublisher.postMessage(${JSON.stringify(localMessage)}); true`);
  const localDisplayed = await waitFor((dom) => dom.score === '8', 500, 'fresh local BroadcastChannel snapshot');
  const localRenderMs = Date.now() - localStartedAt;
  assert.ok(localRenderMs <= 500, `local snapshot must render within 500ms; got ${localRenderMs}ms`);
  assert.equal(localDisplayed.state.question, hidden.question.text);
  assert.equal(localDisplayed.state.answerHidden, true, 'local refreshes must preserve hidden-answer state');

  await delay(5);
  const revealed = createGameSnapshot(bankQuestion, { isRevealed: true });
  assert.ok(revealed.sentAt > localFresh.sentAt, 'reveal frame must be newer than the local frame');
  assert.ok(revealed.question.answer, 'the game snapshot may include its answer only after reveal');
  const revealStartedAt = Date.now();
  const revealPublish = await request(baseUrl, '/api/output-snapshot', {
    method: 'POST', key: operatorKey, body: { snapshot: revealed }
  });
  assert.equal(revealPublish.status, 200, 'the revealed game snapshot must be accepted');
  const revealedUi = await waitFor((dom) => !dom.answerHidden && dom.answer.length > 0, 2000, 'revealed answer in studio');
  const revealRenderMs = Date.now() - revealStartedAt;
  assert.ok(revealRenderMs <= 2000, `revealed answer must render within 2 seconds; got ${revealRenderMs}ms`);
  assert.equal(revealedUi.state.answer, revealed.question.answer, 'the studio must show the bank answer only after reveal');

  console.log(`Studio V2 browser integration: PASS; official bank question → game snapshot → HTTP output → studio in ${httpRenderMs}ms; equal-time newer sequence in ${sameTimeDisplayed.elapsedMs}ms; equal/lower sequence and other-publisher ties rejected; local fresh snapshot in ${localRenderMs}ms; reveal in ${revealRenderMs}ms; stale frames ignored.`);
} finally {
  for (const pending of pendingCommands.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error('test cleanup'));
  }
  pendingCommands.clear();
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  await stopProcess(browser);
  await stopProcess(server);
  if (profileDir) await rm(profileDir, { recursive: true, force: true });
  if (dataRoot) await rm(dataRoot, { recursive: true, force: true });
}
