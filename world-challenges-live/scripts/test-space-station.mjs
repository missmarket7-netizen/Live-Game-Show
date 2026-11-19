import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const page = read('public/space-station/index.html');
const scene = read('public/space-station/space-station-3d.js');
const client = read('public/space-station/tiktok-live-client.js');
const routes = JSON.parse(read('public/manus-routes.json'));

assert.match(page, /<script type="module" src="\.\/space-station-3d\.js"><\/script>/);
assert.match(page, /three@0\.187\.0/);
for (const id of ['mobileWideBtn', 'mobileDanceBtn', 'mobileGiftBtn', 'mobilePartyBtn', 'mobileHostBtn']) {
  assert.match(page, new RegExp(`id="${id}"`));
}
assert.match(scene, /maxParticipants: 40/);
assert.match(scene, /QUALITY/);
assert.match(scene, /triggerRandomDance/);
assert.match(scene, /startApplause/);
assert.match(scene, /chooseWalkTarget/);
assert.match(scene, /radius = 36/);
assert.match(scene, /windowShell/);
assert.match(scene, /practicalGlow/);
assert.match(scene, /stageRail/);
assert.match(scene, /backShelf/);
assert.match(scene, /createTikTokLiveClient/);
assert.match(client, /\/connect/);
assert.match(client, /\/events/);
assert.ok(routes.routes.some((route) => route.path === '/space-station/'));
assert.ok(!routes.routes.some((route) => route.path.includes('space-lounge')));

for (const legacy of [
  'public/space-lounge.html',
  'public/space-lounge.css',
  'public/space-lounge.js',
  'public/space-lounge-3d.js',
  'scripts/space-lounge-3d.js'
]) {
  assert.equal(fs.existsSync(path.join(root, legacy)), false, `legacy asset remains: ${legacy}`);
}

console.log('space-station quality checks: OK');
