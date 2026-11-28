import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const cssPath = new URL('../public/studio-v2.css', import.meta.url);
const css = readFileSync(cssPath, 'utf8');
const chromium = process.env.CHROMIUM_BIN || '/usr/bin/chromium';
const profileDir = mkdtempSync(join(tmpdir(), 'studio-v2-layout-'));
const browser = spawn(chromium, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--remote-debugging-port=0',
  `--user-data-dir=${profileDir}`,
  'about:blank',
], { stdio: 'ignore' });

let socket;
try {
  const activePortFile = join(profileDir, 'DevToolsActivePort');
  let port;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      port = Number(readFileSync(activePortFile, 'utf8').split('\n')[0]);
      if (port) break;
    } catch {}
    if (browser.exitCode !== null) throw new Error(`Chromium exited with code ${browser.exitCode}`);
    await delay(50);
  }
  assert.ok(port, 'Chromium did not expose a DevTools port');

  let targets;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      targets = await response.json();
      break;
    } catch {
      await delay(50);
    }
  }
  const page = targets?.find((target) => target.type === 'page');
  assert.ok(page?.webSocketDebuggerUrl, 'Chromium did not expose a page target');

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body class="studio-v2-body"><main id="stage" class="studio-v2-stage"></main></body>`;
  const pageUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

  async function measure(width, height) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send('Page.navigate', { url: pageUrl });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await delay(25);
      try {
        const result = await send('Runtime.evaluate', {
          expression: `(() => { const r = document.querySelector('#stage')?.getBoundingClientRect(); return r && JSON.stringify({ viewportWidth: innerWidth, viewportHeight: innerHeight, width: r.width, height: r.height, ratio: r.width / r.height, wideMedia: matchMedia('(min-width:760px) and (min-aspect-ratio:6/5)').matches }); })()`,
          returnByValue: true,
        });
        if (result.result?.value) return JSON.parse(result.result.value);
      } catch {}
    }
    throw new Error(`Timed out measuring ${width}x${height}`);
  }

  for (const [width, height] of [[375, 812], [390, 844]]) {
    const result = await measure(width, height);
    const expectedWidth = Math.min(width, 0.5625 * height);
    const expectedHeight = Math.min(height, width / 0.5625);
    const relativeError = Math.abs(result.ratio - 9 / 16) / (9 / 16);
    console.log(`${width}x${height}: stage ${result.width.toFixed(2)}x${result.height.toFixed(2)}, ratio ${result.ratio.toFixed(5)}`);
    assert.equal(result.viewportWidth, width, 'Chromium must use the requested phone viewport width');
    assert.equal(result.viewportHeight, height, 'Chromium must use the requested phone viewport height');
    assert.equal(result.wideMedia, false, 'Phone viewport must not match the widescreen media query');
    assert.ok(Math.abs(result.width - expectedWidth) < 1, `Unexpected stage width at ${width}x${height}`);
    assert.ok(Math.abs(result.height - expectedHeight) < 1, `Unexpected stage height at ${width}x${height}`);
    assert.ok(relativeError <= 0.01, `Stage at ${width}x${height} must remain 9:16 within 1% (error ${(relativeError * 100).toFixed(2)}%)`);
  }

  const desktop = await measure(1920, 1080);
  console.log(`1920x1080 desktop: stage ${desktop.width.toFixed(2)}x${desktop.height.toFixed(2)}, ratio ${desktop.ratio.toFixed(5)}`);
  assert.equal(desktop.viewportWidth, 1920);
  assert.equal(desktop.viewportHeight, 1080);
  assert.equal(desktop.wideMedia, true, 'Desktop must match the existing widescreen media query');
  assert.equal(desktop.width, 1920, 'Widescreen stage width must remain full viewport width');
  assert.equal(desktop.height, 1080, 'Widescreen stage height must remain full viewport height');
  assert.ok(Math.abs(desktop.ratio - 16 / 9) / (16 / 9) <= 0.01, 'Widescreen stage must remain 16:9');
  console.log('Studio V2 layout regression test passed.');
} finally {
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  if (browser.exitCode === null) {
    const exited = once(browser, 'exit').catch(() => undefined);
    browser.kill('SIGTERM');
    await Promise.race([exited, delay(2000)]);
    if (browser.exitCode === null) {
      const killed = once(browser, 'exit').catch(() => undefined);
      browser.kill('SIGKILL');
      await Promise.race([killed, delay(1000)]);
    }
  }
  rmSync(profileDir, { recursive: true, force: true });
}
