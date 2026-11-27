import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, '..');
const serverPath = path.join(scriptDir, 'maroo-poc-server.mjs');
const buildPath = path.join(scriptDir, 'build-maroo-poc.mjs');
const port = 41873;
const baseUrl = `http://127.0.0.1:${port}`;

function requestRaw(requestPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, path: requestPath, method }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    request.on('error', reject);
    request.end();
  });
}

const build = spawnSync(process.execPath, [buildPath], { cwd: repoDir, encoding: 'utf8' });
assert.equal(build.status, 0, `PoC bundle build failed:\n${build.stdout}\n${build.stderr}`);

const child = spawn(process.execPath, [serverPath], {
  cwd: repoDir,
  env: { ...process.env, MAROO_POC_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });

async function waitForServer() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (output.includes(`http://127.0.0.1:${port}/`)) return;
    if (child.exitCode !== null) throw new Error(`PoC server exited early:\n${output}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`PoC server did not become ready:\n${output}`);
}

try {
  await waitForServer();
  const root = await requestRaw('/');
  assert.equal(root.status, 200);
  assert.match(root.headers['content-type'], /text\/html/);
  assert.match(root.headers['cache-control'], /no-store/);
  assert.match(root.headers['permissions-policy'], /camera=\(self\)/);
  assert.match(root.headers['permissions-policy'], /microphone=\(\)/);
  assert.match(root.headers['content-security-policy'], /connect-src 'self' blob:/);
  assert.match(root.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.match(root.body, /لا يوجد تتبّع للحركة أو الوجه/);
  assert.match(root.body, /\/app\.bundle\.js/);
  assert.doesNotMatch(root.body, /https?:\/\//);
  const publicDir = path.join(repoDir, 'world-challenges-live', 'public');
  const pocRelativeToPublic = path.relative(publicDir, path.join(repoDir, 'maroo-poc'));
  assert.ok(pocRelativeToPublic.startsWith('..'), 'PoC files must remain outside the production public directory');

  for (const filePath of ['/index.html', '/style.css', '/app.bundle.js']) {
    const response = await requestRaw(filePath);
    assert.equal(response.status, 200, `${filePath} should be served locally`);
    assert.match(response.headers['cache-control'], /no-store/);
  }

  assert.equal((await requestRaw('/server.js')).status, 404, 'server source must not be exposed');
  assert.equal((await requestRaw('/../../etc/passwd')).status, 400, 'raw traversal must be rejected');
  assert.equal((await requestRaw('/%2e%2e/%2e%2e/etc/passwd')).status, 400, 'encoded traversal must be rejected');
  assert.equal((await requestRaw('/', 'POST')).status, 405, 'non-read requests must be rejected');

  const appSource = await readFile(path.join(repoDir, 'maroo-poc', 'app.js'), 'utf8');
  const bundleSource = await readFile(path.join(repoDir, 'maroo-poc', 'app.bundle.js'), 'utf8');
  const notices = await readFile(path.join(repoDir, 'maroo-poc', 'THIRD-PARTY-NOTICES.md'), 'utf8');
  assert.match(appSource, /getUserMedia\(\{ audio: false, video \}\)/);
  assert.match(appSource, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(appSource, /skeletons\.forEach\(\(skeleton\) => skeleton\.dispose\(\)\)/);
  assert.match(appSource, /track\.addEventListener\('ended'/);
  assert.match(appSource, /visibilitychange/);
  assert.match(appSource, /await elements\.video\.play\(\);\s*if \(requestToken !== cameraRequestToken \|\| document\.visibilityState === 'hidden' \|\| mediaStream !== requestedStream\)/);
  assert.match(appSource, /mediaStream \|\| cameraBusy/);
  assert.match(appSource, /pageshow/);
  assert.match(appSource, /WebGL غير متاح/);
  assert.doesNotMatch(appSource, /WebGLを利用できません/);
  assert.doesNotMatch(appSource, /\bfetch\s*\(|\bWebSocket\b|localStorage|sessionStorage|MediaRecorder|https?:\/\//);
  assert.match(appSource, /XMLHttpRequest/, 'the only request helper reads the local blob URL');
  assert.match(bundleSource, /Copyright 2010-2026 Three\.js Authors/);
  assert.match(notices, /The MIT License/);
  assert.match(notices, /Copyright © 2010-2026 three\.js authors/);
  assert.match(await readFile(serverPath, 'utf8'), /listen\(portValue, '127\.0\.0\.1'/);

  console.log('MAROO PoC contract: PASS (loopback-only server, explicit local asset allowlist, camera-only permission, no microphone/uploads/storage/recording; PoC directory outside production public/).');
} finally {
  child.kill('SIGTERM');
}
