import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (file) => readFile(new URL(file, import.meta.url), 'utf8');
const [home, loungePage, loungeClient, sceneSource, connector, server, worker, loungeStyle] = await Promise.all([
  read('../public/index.html'),
  read('../public/space-lounge.html'),
  read('../public/space-lounge.js'),
  read('./space-lounge-3d.js'),
  read('../server/live-connector.js'),
  read('../server/server.js'),
  read('../public/sw.js'),
  read('../public/space-lounge.css')
]);

test('الصفحة الرئيسية تعرض اختياراً منفصلاً لاستراحة الفضاء', () => {
  assert.match(home, /href="\/space-lounge"/);
  assert.doesNotMatch(home, /space-lounge-3d\.js/);
});

test('مسار الاستراحة صفحة مستقلة وتحمل مشهد 3D محلياً وبكسل إصدار جديد', () => {
  assert.match(loungePage, /space-lounge-3d\.js\?v=20261112-v4/);
  assert.match(loungePage, /space-lounge\.js\?v=20261112-v6/);
  assert.match(loungePage, /space-lounge\.css\?v=20261112-v2/);
  assert.match(server, /extensions:\s*\["html"\]/);
});

test('المشهد ثلاثي الأبعاد حقيقي، منخفض المضلع، ويحتوي رجوعاً آمناً عند غياب WebGL', () => {
  assert.match(sceneSource, /new THREE\.WebGLRenderer/);
  assert.match(sceneSource, /new THREE\.OrthographicCamera/);
  assert.match(sceneSource, /new THREE\.CapsuleGeometry/);
  assert.match(sceneSource, /raycaster\.ray\.intersectPlane\(groundPlane/);
  assert.match(sceneSource, /node\.dataset\.sceneLeft/);
  assert.match(loungeStyle, /\.arena-scene\.has-3d-scene \.participant-avatar-wrap\{visibility:hidden\}/);
  assert.match(sceneSource, /camera\.zoom/);
  assert.match(sceneSource, /stage\.classList\.remove\('has-3d-scene'\)/);
  assert.match(sceneSource, /requestAnimationFrame/);
});

test('الاستراحة تستخدم تدفق SSE الحالي وأحداث دخولها وهداياها دون تعديل نقاط المسابقة', () => {
  assert.match(loungeClient, /new EventSource\('\/live\/events'\)/);
  assert.match(loungeClient, /message\.type === 'lounge-join'/);
  assert.match(loungeClient, /message\.type === 'lounge-gift'/);
  assert.match(loungeClient, /function setLogicalPosition/);
  assert.match(loungeClient, /is-dragging/);
  assert.doesNotMatch(loungeClient, /applyPoint|girlsScore|boysScore/);
  assert.match(connector, /broadcast\("lounge-join"/);
  assert.match(connector, /broadcast\("lounge-gift"/);
});

test('أصول المشهد لا تدخل التحميل الأولي للعبة ويظل حد الحضور معقولاً', () => {
  assert.match(loungePage, /0 \/ 50/);
  assert.match(loungeClient, /MAX_PARTICIPANTS = 50/);
  assert.doesNotMatch(worker, /space-lounge-3d\.js/);
  assert.doesNotMatch(worker, /three\.module|three\.core/);
});
