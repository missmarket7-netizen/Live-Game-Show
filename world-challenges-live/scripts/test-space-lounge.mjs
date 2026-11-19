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
  assert.match(loungePage, /space-lounge-3d\.js\?v=7/);
  assert.match(loungePage, /space-lounge\.js\?v=7/);
  assert.match(loungePage, /space-lounge\.css\?v=7/);
  assert.match(server, /extensions:\s*\["html"\]/);
});

test('المشهد ثلاثي الأبعاد حقيقي، منخفض المضلع، ويحتوي رجوعاً آمناً عند غياب WebGL', () => {
  assert.match(sceneSource, /new THREE\.WebGLRenderer/);
  assert.match(sceneSource, /new THREE\.PerspectiveCamera/);
  assert.match(sceneSource, /new THREE\.CapsuleGeometry/);
  assert.match(sceneSource, /node\.dataset\.sceneLeft/);
  assert.match(sceneSource, /buildDJDeck/);
  assert.match(sceneSource, /buildVipLounge/);
  assert.match(sceneSource, /stage\.classList\.remove\('has-3d'\)/);
  assert.match(loungeStyle, /\.sl-plate\{[^}]*display:flex/);
  assert.match(sceneSource, /requestAnimationFrame/);
});

test('الاستراحة تستخدم تدفق SSE الحالي وأحداث دخولها وهداياها دون تعديل نقاط المسابقة', () => {
  assert.match(loungeClient, /new EventSource\('\/live\/events'\)/);
  assert.match(loungeClient, /m\.type === 'lounge-join'/);
  assert.match(loungeClient, /m\.type === 'lounge-gift'/);
  assert.match(loungeClient, /function setLogicalPosition/);
  assert.match(loungeClient, /is-dragging/);
  assert.doesNotMatch(loungeClient, /applyPoint|girlsScore|boysScore/);
  assert.match(connector, /broadcast\("lounge-join"/);
  assert.match(connector, /broadcast\("lounge-gift"/);
});

test('أصول المشهد لا تدخل التحميل الأولي للعبة ويظل حد الحضور معقولاً', () => {
  assert.match(loungePage, /0 \/ 50/);
  assert.match(loungeClient, /var MAX = 50/);
  assert.match(loungeClient, /participants\.size >= MAX/);
  assert.match(worker, /arena-extras\.css\?v=107/);
  assert.match(worker, /CACHE_NAME = "wcq-v[^"]+"/);
  assert.match(worker, /space-lounge-3d\.js\?v=7/);
  assert.doesNotMatch(worker, /three\.module|three\.core/);
});
