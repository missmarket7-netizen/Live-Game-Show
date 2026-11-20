import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const projectDir = process.cwd();
const writeRoutes = [
  "/api/questions",
  "/api/generate",
  "/api/save-questions",
  "/api/reset-cycle",
  "/api/output-snapshot",
  "/api/studio-director-state"
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function reservePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

async function startIsolatedServer(operatorKey) {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "wcq-operator-auth-"));
  await mkdir(path.join(dataRoot, "questions"), { recursive: true });
  const port = await reservePort();
  const env = {
    PATH: process.env.PATH || "/usr/bin:/bin",
    HOME: process.env.HOME || "/tmp",
    NODE_ENV: "test",
    DOTENV_CONFIG_PATH: "/dev/null",
    PORT: String(port),
    RAILWAY_VOLUME_MOUNT_PATH: dataRoot,
    OPERATOR_WRITE_KEY: operatorKey,
    GEMINI_API_KEY: "",
    OPENROUTER_API_KEY: "",
    GROQ_API_KEY: "",
    TURSO_URL: "",
    TURSO_DATABASE_URL: "",
    TURSO_AUTH_TOKEN: "",
    TURSO_TOKEN: ""
  };
  const child = spawn(process.execPath, ["server/server.js"], {
    cwd: projectDir,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let logs = "";
  const collect = (chunk) => { logs = (logs + chunk.toString()).slice(-8000); };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  const baseUrl = `http://127.0.0.1:${port}`;
  let ready = false;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(4000) });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await sleep(125);
  }

  if (!ready) {
    await stopIsolatedServer({ child, dataRoot });
    throw new Error(`Isolated server did not become ready. Captured output:\n${logs}`);
  }

  return { child, dataRoot, baseUrl };
}

async function stopIsolatedServer(instance) {
  if (instance.child.exitCode === null) {
    const exited = once(instance.child, "exit");
    instance.child.kill("SIGTERM");
    await Promise.race([exited, sleep(2000)]);
    if (instance.child.exitCode === null) instance.child.kill("SIGKILL");
  }
  await rm(instance.dataRoot, { recursive: true, force: true });
}

async function request(baseUrl, route, { method = "GET", key, body } = {}) {
  const headers = {};
  if (key) headers["X-Operator-Key"] = key;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(baseUrl + route, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000)
  });
  return { status: response.status, headers: response.headers, text: await response.text() };
}

let server = null;
try {
  server = await startIsolatedServer("");
  assert.equal((await request(server.baseUrl, "/api/operator/verify")).status, 503);
  assert.equal((await request(server.baseUrl, "/api/health")).status, 200);
  const readonlyBank = await request(server.baseUrl, "/api/questions-readonly?category=%D8%A7%D8%AE%D8%AA%D9%8A%D8%A7%D8%B1%D8%A7%D8%AA%20%D9%85%D8%AA%D9%86%D9%88%D8%B9%D8%A9&difficulty=%D8%B3%D9%87%D9%84&count=1");
  assert.equal(readonlyBank.status, 200, "the safe read-only bank fallback must work without an operator key");
  assert.ok(Array.isArray(JSON.parse(readonlyBank.text).questions), "the fallback must return a questions array");
  assert.equal(
    (await request(server.baseUrl, "/api/questions", {
      method: "POST",
      body: { category: "اختيارات متنوعة", difficulty: "سهل", count: 1 }
    })).status,
    503,
    "manual local bank must fail closed while the server key is unconfigured"
  );
  await stopIsolatedServer(server);
  server = null;

  server = await startIsolatedServer("short");
  assert.equal((await request(server.baseUrl, "/api/operator/verify")).status, 503);
  await stopIsolatedServer(server);
  server = null;

  const operatorKey = randomBytes(32).toString("hex");
  server = await startIsolatedServer(operatorKey);
  for (const route of writeRoutes) {
    assert.equal(
      (await request(server.baseUrl, route, { method: "POST", body: {} })).status,
      401,
      `${route} must reject a missing key`
    );
    assert.equal(
      (await request(server.baseUrl, route, { method: "POST", key: `${operatorKey}wrong`, body: {} })).status,
      401,
      `${route} must reject a wrong key`
    );
  }

  assert.equal((await request(server.baseUrl, "/api/operator/verify")).status, 401);
  assert.equal((await request(server.baseUrl, "/api/operator/verify", { key: `${operatorKey}wrong` })).status, 401);
  assert.equal((await request(server.baseUrl, "/api/operator/verify", { key: operatorKey })).status, 200);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    assert.equal((await request(server.baseUrl, "/api/operator/verify", { key: `${operatorKey}wrong-${attempt}` })).status, 401);
  }
  const throttledVerify = await request(server.baseUrl, "/api/operator/verify", { key: `${operatorKey}wrong-final` });
  assert.equal(throttledVerify.status, 429, "repeated failed credential checks must be rate limited");
  assert.equal(throttledVerify.headers.get("RateLimit-Limit"), "10");
  assert.ok(Number(throttledVerify.headers.get("Retry-After")) >= 1);
  assert.equal((await request(server.baseUrl, "/api/output-snapshot")).status, 204, "the OBS reader is public and empty before the first publish");
  const initialDirector = await request(server.baseUrl, "/api/studio-director-state");
  assert.equal(initialDirector.status, 200, "director scene settings must be publicly readable for OBS");
  assert.equal(JSON.parse(initialDirector.text).updatedAt, 0, "the public director route starts with a safe default state");
  const directorSentAt = Date.now();
  const directorWrite = await request(server.baseUrl, "/api/studio-director-state", {
    method: "POST",
    key: operatorKey,
    body: {
      sentAt: directorSentAt,
      state: {
        view: "awards",
        merged: true,
        layers: { scores: false, awards: true, branding: false, privateLayer: true },
        giftLabel: "  لحظة\n الهدية  ",
        giftName: " اسم المشارك ",
        weeklyLeader: "قائد الأسبوع",
        roundStar: "نجم الجولة",
        operatorKey: "FIELD_MUST_NOT_SURVIVE",
        unrelatedAnswer: "PRIVATE_FIELD_MUST_NOT_SURVIVE"
      }
    }
  });
  assert.equal(directorWrite.status, 200, "authorized director settings should be accepted");
  assert.equal((await request(server.baseUrl, "/api/studio-director-state", {
    method: "POST", key: operatorKey, body: { sentAt: directorSentAt, state: { view: "wide" } }
  })).status, 409, "a duplicate timestamp must not replace an already accepted director state");
  const publicDirector = await request(server.baseUrl, "/api/studio-director-state");
  assert.equal(publicDirector.status, 200);
  const directorPayload = JSON.parse(publicDirector.text);
  assert.ok(directorPayload.updatedAt > 0);
  assert.equal(directorPayload.sentAt, directorSentAt);
  assert.deepEqual(directorPayload.state, {
    view: "awards",
    merged: true,
    layers: { scores: false, awards: true, branding: false },
    giftLabel: "لحظة الهدية",
    giftName: "اسم المشارك",
    weeklyLeader: "قائد الأسبوع",
    roundStar: "نجم الجولة"
  }, "the shared allowlist must retain only valid scene settings and normalized names");
  assert.doesNotMatch(publicDirector.text, /FIELD_MUST_NOT_SURVIVE|operatorKey|unrelatedAnswer|PRIVATE_FIELD/);
  assert.equal((await request(server.baseUrl, "/api/studio-director-state", {
    method: "POST", key: operatorKey, body: { sentAt: directorSentAt - 1, state: { view: "wide" } }
  })).status, 409, "an older director update must not replace the latest settings");
  assert.equal((await request(server.baseUrl, "/api/studio-director-state", {
    method: "POST", key: operatorKey, body: { sentAt: 0, state: { view: "wide" } }
  })).status, 400, "invalid timestamps must be rejected");
  const bank = await request(server.baseUrl, "/api/questions", {
    method: "POST",
    key: operatorKey,
    body: { category: "اختيارات متنوعة", difficulty: "سهل", count: 1, avoid: [] }
  });
  assert.equal(bank.status, 200, "local bank should remain usable with the configured operator key");

  const generated = await request(server.baseUrl, "/api/generate", {
    method: "POST",
    key: operatorKey,
    body: { category: "اختيارات متنوعة", difficulty: "سهل", count: 1, avoid: [] }
  });
  assert.equal(generated.status, 200, "authorized generation should reach the route without external provider secrets");
  for (let requestNumber = 1; requestNumber < 5; requestNumber += 1) {
    assert.equal((await request(server.baseUrl, "/api/generate", {
      method: "POST",
      key: operatorKey,
      body: { category: "اختيارات متنوعة", difficulty: "سهل", count: 1, avoid: [] }
    })).status, 200, "generation should remain available up to its configured per-minute limit");
  }
  const throttledGeneration = await request(server.baseUrl, "/api/generate", {
    method: "POST",
    key: operatorKey,
    body: { category: "اختيارات متنوعة", difficulty: "سهل", count: 1, avoid: [] }
  });
  assert.equal(throttledGeneration.status, 429, "the next generation request must be rate limited");
  assert.equal(throttledGeneration.headers.get("RateLimit-Limit"), "5");
  assert.ok(Number(throttledGeneration.headers.get("Retry-After")) >= 1);
  assert.match(throttledGeneration.text, /operator_rate_limit_exceeded/);

  const secretAnswer = "إجابة-لا-تظهر-قبل-الكشف-77";
  const hiddenSnapshot = {
    schemaVersion: 1,
    sentAt: Date.now(),
    ready: true,
    scores: { girls: 4, boys: 2 },
    question: { text: "ما السؤال التجريبي؟", category: "اختبار", revealed: false, answer: secretAnswer },
    timer: { remainingSeconds: 12, durationSeconds: 30, running: true },
    captains: { girls: ["قائدة"], boys: ["قائد"] },
    roundNumber: 1,
    explanation: "يجب حذف هذا الحقل"
  };
  const hiddenPublish = await request(server.baseUrl, "/api/output-snapshot", {
    method: "POST", key: operatorKey, body: { snapshot: hiddenSnapshot }
  });
  assert.equal(hiddenPublish.status, 200, "authorized game source can publish a valid snapshot");
  const publicHidden = await request(server.baseUrl, "/api/output-snapshot");
  assert.equal(publicHidden.status, 200);
  assert.ok(Number(JSON.parse(publicHidden.text).updatedAt) > 0, "public reads include the publisher's receive time, not a polling refresh time");
  assert.doesNotMatch(publicHidden.text, new RegExp(secretAnswer), "server normalization must remove an unrevealed answer");
  assert.doesNotMatch(publicHidden.text, /explanation/);
  assert.equal(JSON.parse(publicHidden.text).snapshot.question.revealed, false);

  const revealedSnapshot = {
    ...hiddenSnapshot,
    sentAt: Date.now() + 1,
    question: { ...hiddenSnapshot.question, revealed: true },
    timer: { remainingSeconds: 0, durationSeconds: 30, running: false }
  };
  const revealPublish = await request(server.baseUrl, "/api/output-snapshot", {
    method: "POST", key: operatorKey, body: { snapshot: revealedSnapshot }
  });
  assert.equal(revealPublish.status, 200);
  const publicRevealed = await request(server.baseUrl, "/api/output-snapshot");
  assert.equal(JSON.parse(publicRevealed.text).snapshot.question.answer, secretAnswer, "answer is available after the approved reveal event");
  const stalePublish = await request(server.baseUrl, "/api/output-snapshot", {
    method: "POST", key: operatorKey, body: { snapshot: hiddenSnapshot }
  });
  assert.equal(stalePublish.status, 409, "a delayed older snapshot must not replace the latest frame");
  const feedStartedAt = Date.now();
  for (let frame = 0; frame < 70; frame += 1) {
    const result = await request(server.baseUrl, "/api/output-snapshot", {
      method: "POST",
      key: operatorKey,
      body: { snapshot: { ...revealedSnapshot, sentAt: feedStartedAt + frame + 2 } }
    });
    assert.equal(result.status, 200, `snapshot frame ${frame + 1} should remain accepted within a normal minute-long feed budget`);
  }

  const saved = await request(server.baseUrl, "/api/save-questions", {
    method: "POST",
    key: operatorKey,
    body: { questions: [{ question: "اختبار محلي مؤقت", answer: "إجابة اختبار", options: [] }] }
  });
  assert.equal(saved.status, 200, "authorized save should use the isolated data root");
  assert.equal((await request(server.baseUrl, "/api/reset-cycle", { method: "POST", key: operatorKey, body: {} })).status, 200);

  for (const route of ["/", "/output", "/studio", "/studio-control"]) {
    const page = await request(server.baseUrl, route);
    assert.equal(page.status, 200, `${route} must remain publicly readable`);
    if (route === "/studio") {
      assert.match(page.text, /studio-director-state\.js/, "the OBS scene must load the shared director-state contract after a page reload");
      assert.match(page.text, /studio\.js\?v=20261118-independent-studio-v1/);
      assert.doesNotMatch(page.text, /directorKeyInput|X-Operator-Key|OPERATOR_WRITE_KEY/);
    }
    if (route === "/studio-control") {
      assert.match(page.text, /directorKeyForm/, "the controller must offer explicit operator-key verification");
      assert.match(page.text, /studio-control\.js\?v=20261118-independent-studio-v1/);
    }
    if (route === "/output") {
      assert.doesNotMatch(page.text, /OPERATOR_WRITE_KEY|X-Operator-Key|operatorKey/);
      assert.doesNotMatch(page.text, new RegExp(operatorKey));
    }
  }
  assert.equal((await request(server.baseUrl, "/api/health")).status, 200);
  assert.equal((await request(server.baseUrl, "/api/cycle-status")).status, 200);
  assert.equal((await request(server.baseUrl, "/api/saved-questions")).status, 200);
  await stopIsolatedServer(server);
  server = null;

  console.log("Operator-auth/output HTTP integration: PASS (six write routes protected; failed key verification throttled; game and director states sanitized; equal/stale director updates rejected; /studio reloads publicly without key UI; answers remain gated; temporary data removed).");
} finally {
  if (server) await stopIsolatedServer(server);
}
