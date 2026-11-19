/**
 * محطة الفضاء السينمائية — عالم التحديات
 * تصميم سينمائي جديد كليًا
 * Three.js • شخصيات ستايل سينمائي • نظام كاميرات متعدد
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createTikTokLiveClient } from './tiktok-live-client.js';

// ═══════════════════════════════════════════════════════════
// الإعدادات
// ═══════════════════════════════════════════════════════════
const CFG = {
  maxParticipants: 40,
  colors: {
    lime: 0xc8ff51,
    cyan: 0x48e7ff,
    pink: 0xff5b9f,
    gold: 0xffd36e,
    violet: 0x9b6dff,
    dark: 0x05060f,
    suit: 0xdce6f8,
    suitAccent: 0x48e7ff,
    djSuit: 0x1a1f3a,
    djAccent: 0xffd36e
  }
};

const DEVICE = {
  mobile: window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 || window.innerWidth < 760,
  memory: Number(navigator.deviceMemory || 4),
  cores: Number(navigator.hardwareConcurrency || 4)
};
const QUALITY = {
  mobile: DEVICE.mobile,
  pixelRatio: DEVICE.mobile ? Math.min(window.devicePixelRatio || 1, 1.05) : Math.min(window.devicePixelRatio || 1, 1.35),
  composerPixelRatio: DEVICE.mobile ? 0.72 : Math.min(window.devicePixelRatio || 1, 1.15),
  bloomStrength: DEVICE.mobile ? 0.28 : 0.55,
  useComposer: !DEVICE.mobile,
  particleCount: DEVICE.mobile ? 220 : 520,
  shaftCount: DEVICE.mobile ? 3 : 5,
  socialInterval: DEVICE.mobile ? 3 : 1,
  fxInterval: DEVICE.mobile ? 2 : 1
};

// ═══════════════════════════════════════════════════════════
// الحالة العامة
// ═══════════════════════════════════════════════════════════
const state = {
  participants: new Map(),
  dj: null,
  cameraMode: 'wide', // wide | gift
  giftTarget: null,
  giftUntil: 0,
  giftTier: 'small',
  partyUntil: 0,
  zeroGUntil: 0,
  applauseUntil: 0,
  applauseTarget: null,
  nextRandomDance: performance.now() + 9000,
  live: { viewerCount: 0, likes: 0, comments: 0, participantIds: new Map() },
  clock: new THREE.Clock(),
  idSeq: 0,
  frame: 0,
  socialTick: 0,
  perf: { elapsed: 0, frames: 0, ratio: QUALITY.pixelRatio }
};

// ═══════════════════════════════════════════════════════════
// العناصر من DOM
// ═══════════════════════════════════════════════════════════
const $ = (id) => document.getElementById(id);
const loader = $('loader');
const toastEl = $('toast');
const countLabel = $('countLabel');
const infoCount = $('infoCount');
const cameraModeLabel = $('cameraMode');
const connectionStatus = $('connectionStatus');
const hostPanel = $('hostPanel');
const viewerCountLabel = $('viewerCount');
const likeCountLabel = $('likeCount');
const commentCountLabel = $('commentCount');

const liveClient = createTikTokLiveClient({
  onStatus: handleLiveStatus,
  onEvent: handleLiveEvent
});

function showToast(text, duration = 2600) {
  toastEl.textContent = text;
  toastEl.classList.add('is-visible');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('is-visible'), duration);
}

function handleLiveStatus(status) {
  const labels = { connected: 'TikTok — متصل', connecting: 'TikTok — جارٍ الاتصال', reconnecting: 'TikTok — إعادة اتصال', error: 'TikTok — خطأ', offline: 'يدوي — غير متصل' };
  connectionStatus.textContent = labels[status.status] || `TikTok — ${status.status}`;
  if (status.status === 'connected') showToast('تم اتصال TikTok LIVE بالخادم');
  if (status.status === 'error') showToast(`تعذر اتصال TikTok: ${status.message || 'تحقق من إعدادات الخادم'}`);
}

function liveUserKey(event) {
  return event?.user?.id || event?.user?.uniqueId || event?.user?.nickname || '';
}

function participantForLiveUser(event) {
  const key = liveUserKey(event);
  if (!key) return null;
  const existingId = state.live.participantIds.get(key);
  if (existingId && state.participants.has(existingId)) return state.participants.get(existingId);
  const user = event.user || {};
  const id = `live-${key}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 70);
  const mesh = addParticipant({ id, name: user.nickname || user.uniqueId || 'مشاهد', handle: user.uniqueId ? `@${user.uniqueId.replace(/^@/, '')}` : '@live_viewer' });
  if (mesh) state.live.participantIds.set(key, id);
  return mesh;
}

function giftTierFromEvent(event) {
  const diamonds = Number(event?.diamondCount || 0);
  if (diamonds >= 1000) return 'mega';
  if (diamonds >= 300) return 'big';
  if (diamonds >= 30) return 'medium';
  return 'small';
}

function handleLiveEvent(event) {
  if (!event?.type) return;
  if (event.type === 'viewerCount') { state.live.viewerCount = Number(event.count || 0); viewerCountLabel.textContent = state.live.viewerCount.toLocaleString('ar'); return; }
  if (event.type === 'like') { state.live.likes += Number(event.count || 1); likeCountLabel.textContent = state.live.likes.toLocaleString('ar'); return; }
  if (event.type === 'comment') {
    state.live.comments += 1; commentCountLabel.textContent = state.live.comments.toLocaleString('ar');
    const text = String(event.text || '').toLowerCase();
    const participant = participantForLiveUser(event);
    if (participant && /(space|قدها|عالم التحديات|ساحة)/i.test(text)) { participant.userData.state = 'dance'; participant.userData.actionUntil = performance.now() + 4500; showToast(`🚀 ${participant.userData.name} دخل الرقص`); }
    return;
  }
  if (event.type === 'gift') {
    const participant = participantForLiveUser(event);
    runGiftAction(giftTierFromEvent(event), participant, event);
    return;
  }
  if (event.type === 'follow' || event.type === 'share' || event.type === 'join') participantForLiveUser(event);
  if (event.type === 'liveEnd') { showToast('انتهى TikTok LIVE — عادت المحطة إلى الوضع اليدوي'); handleLiveStatus({ status: 'offline' }); }
}

function updateCounts() {
  const n = state.participants.size;
  countLabel.textContent = n;
  infoCount.textContent = n;
}

// ═══════════════════════════════════════════════════════════
// المشهد الأساسي
// ═══════════════════════════════════════════════════════════
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060f);
scene.fog = new THREE.FogExp2(0x05060f, 0.012);

const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, 18, 38);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false
});
renderer.setPixelRatio(QUALITY.pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
// ثبات البث أهم من ظلال كثيرة؛ الإضاءة والـBloom والـFX تبقى فعالة.
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// Post-processing (Bloom خفيف سينمائي)
const composer = new EffectComposer(renderer);
composer.setPixelRatio(QUALITY.composerPixelRatio);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  QUALITY.bloomStrength,  // strength
  0.4,   // radius
  0.85   // threshold
);
composer.addPass(bloomPass);

// ═══════════════════════════════════════════════════════════
// الإضاءة السينمائية
// ═══════════════════════════════════════════════════════════
const ambient = new THREE.AmbientLight(0x1a2040, 0.45);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xfff0e0, 1.1);
keyLight.position.set(12, 22, 10);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.near = 2;
keyLight.shadow.camera.far = 60;
keyLight.shadow.camera.left = -25;
keyLight.shadow.camera.right = 25;
keyLight.shadow.camera.top = 25;
keyLight.shadow.camera.bottom = -25;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x48e7ff, 0.55);
rimLight.position.set(-14, 10, -8);
scene.add(rimLight);

const pinkFill = new THREE.PointLight(0xff5b9f, 1.2, 40);
pinkFill.position.set(8, 6, 6);
scene.add(pinkFill);

const cyanFill = new THREE.PointLight(0x48e7ff, 1.0, 35);
cyanFill.position.set(-9, 5, 4);
scene.add(cyanFill);

const goldSpot = new THREE.SpotLight(0xffd36e, 2.2, 50, Math.PI / 7, 0.4, 1);
goldSpot.position.set(0, 18, 0);
goldSpot.target.position.set(0, 0, 0);
scene.add(goldSpot);
scene.add(goldSpot.target);
const djGlow = new THREE.PointLight(CFG.colors.gold, 2.4, 8, 2);
djGlow.position.set(-11, 2.4, 0.3);
scene.add(djGlow);

// أضواء المسرح المتحركة
const stageLights = [];
const stageLightColors = [0xc8ff51, 0xff5b9f, 0x48e7ff, 0xffd36e];
for (let i = 0; i < 4; i++) {
  const sl = new THREE.SpotLight(stageLightColors[i], 1.8, 30, Math.PI / 9, 0.35, 1);
  sl.position.set((i - 1.5) * 5, 12, 4);
  sl.target.position.set((i - 1.5) * 3.5, 0, 2);
  scene.add(sl);
  scene.add(sl.target);
  stageLights.push(sl);
}

// ═══════════════════════════════════════════════════════════
// بناء المحطة الفضائية
// ═══════════════════════════════════════════════════════════
const stationGroup = new THREE.Group();
scene.add(stationGroup);

// أرضية المحطة (منصة معدنية فاخرة)
function createFloor() {
  const geo = new THREE.CircleGeometry(22, 64);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0c1028,
    metalness: 0.85,
    roughness: 0.25,
    envMapIntensity: 0.8
  });
  const floor = new THREE.Mesh(geo, mat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  stationGroup.add(floor);

  // شبكة أرضية نيون
  const grid = new THREE.GridHelper(40, 40, 0x48e7ff, 0x1a2248);
  grid.position.y = 0.02;
  grid.material.opacity = 0.22;
  grid.material.transparent = true;
  stationGroup.add(grid);

  // حلقة خارجية مضيئة
  const ringGeo = new THREE.TorusGeometry(21.5, 0.08, 12, 100);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x48e7ff });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.05;
  stationGroup.add(ring);

  // فواصل ألواح أرضية هندسية: تمنح الأرضية مقياسًا معماريًا واقعيًا بدل سطح واحد.
  const seamMat = new THREE.MeshBasicMaterial({ color: 0x253354, transparent: true, opacity: 0.55 });
  const seamGeo = new THREE.BoxGeometry(0.025, 0.012, 19.5);
  for (let i = 0; i < 12; i++) {
    const seam = new THREE.Mesh(seamGeo, seamMat);
    seam.rotation.y = (i / 12) * Math.PI;
    seam.position.y = 0.035;
    stationGroup.add(seam);
  }
  const innerFloorRing = new THREE.Mesh(
    new THREE.TorusGeometry(10.4, 0.018, 6, 96),
    new THREE.MeshBasicMaterial({ color: 0x64708f, transparent: true, opacity: 0.42 })
  );
  innerFloorRing.rotation.x = Math.PI / 2;
  innerFloorRing.position.y = 0.04;
  stationGroup.add(innerFloorRing);
}
createFloor();

// طبقات المحطة الفاخرة: أضلاع مدارية، بوابات زجاجية، شاشات هولوغرافية وممرات حركة.
const cinematicFX = { rings: [], panels: [], particles: [], shafts: [], giftAura: null, giftSpot: null };
function createLuxuryArchitecture() {
  const arch = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x18213c, metalness: 0.92, roughness: 0.18, transparent: true, opacity: 0.52 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x080d1d, metalness: 0.88, roughness: 0.22 });
  const cyan = new THREE.MeshBasicMaterial({ color: CFG.colors.cyan, transparent: true, opacity: 0.75 });
  const gold = new THREE.MeshBasicMaterial({ color: CFG.colors.gold, transparent: true, opacity: 0.8 });
  const pink = new THREE.MeshBasicMaterial({ color: CFG.colors.pink, transparent: true, opacity: 0.7 });

  // غلاف داخلي شفاف يشبه نوافذ محطة حقيقية، مع قطاعات معدنية تحمل السقف.
  const windowShell = new THREE.Mesh(
    new THREE.CylinderGeometry(20.2, 20.2, 7.4, 48, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x071126, metalness: 0.65, roughness: 0.24, transparent: true, opacity: DEVICE.mobile ? 0.14 : 0.22, side: THREE.DoubleSide })
  );
  windowShell.position.y = 4.0;
  arch.add(windowShell);

  const windowMat = new THREE.MeshStandardMaterial({ color: 0x102a4e, emissive: 0x08233f, emissiveIntensity: 0.32, metalness: 0.45, roughness: 0.18, transparent: true, opacity: 0.62, side: THREE.DoubleSide });
  const windowFrameMat = new THREE.MeshStandardMaterial({ color: 0x35405a, metalness: 0.92, roughness: 0.2 });
  const windowGeo = new THREE.BoxGeometry(4.1, 5.4, 0.08);
  const mullionGeo = new THREE.BoxGeometry(0.16, 7.2, 0.22);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const bay = new THREE.Group();
    bay.position.set(Math.cos(a) * 19.8, 4.0, Math.sin(a) * 19.8);
    bay.rotation.y = -a;
    const glass = new THREE.Mesh(windowGeo, windowMat);
    glass.position.z = -0.03;
    bay.add(glass);
    const mullion = new THREE.Mesh(mullionGeo, windowFrameMat);
    mullion.position.z = 0.12;
    bay.add(mullion);
    arch.add(bay);
  }

  // وحدات إضاءة سقفية دافئة؛ إضاءة عملية تخفف اعتماد المشهد على النيون.
  const practicalGlow = new THREE.MeshBasicMaterial({ color: 0xffe4b0 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), practicalGlow);
    lamp.position.set(Math.cos(a) * 12.8, 8.9, Math.sin(a) * 12.8);
    arch.add(lamp);
    if (!DEVICE.mobile) {
      const lampLight = new THREE.PointLight(0xffd9a0, 0.22, 6);
      lampLight.position.copy(lamp.position);
      arch.add(lampLight);
    }
  }

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rib = new THREE.Group();
    rib.position.set(Math.cos(a) * 20.5, 4.4, Math.sin(a) * 20.5);
    rib.rotation.y = -a;
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.28, 8.6, 0.52), metal);
    column.castShadow = true;
    rib.add(column);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.045, 8.0, 0.06), i % 3 === 0 ? gold : cyan);
    trim.position.set(0.17, 0, 0.3);
    rib.add(trim);
    arch.add(rib);
  }

  const dome = new THREE.Mesh(new THREE.TorusGeometry(17.8, 0.12, 10, 96), cyan);
  dome.rotation.x = Math.PI / 2;
  dome.position.y = 10.7;
  arch.add(dome);
  const dome2 = new THREE.Mesh(new THREE.TorusGeometry(14.2, 0.07, 8, 80), gold);
  dome2.rotation.x = Math.PI / 2;
  dome2.position.y = 8.8;
  arch.add(dome2);

  for (const [x, z, color] of [[-12, -5, cyan], [12, -5, gold], [-12, 8, pink], [12, 8, cyan]]) {
    const panel = new THREE.Group();
    panel.position.set(x, 4.1, z);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.8, 0.14), darkMetal);
    panel.add(frame);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.15, 2.05), new THREE.MeshStandardMaterial({ color: 0x101a38, emissive: color.color, emissiveIntensity: 0.35, metalness: 0.35, roughness: 0.3, transparent: true, opacity: 0.82 }));
    screen.position.z = 0.1;
    panel.add(screen);
    const line = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.035, 0.03), color);
    line.position.set(0, -0.9, 0.18);
    panel.add(line);
    panel.userData.phase = Math.random() * 6;
    cinematicFX.panels.push(panel);
    arch.add(panel);
  }

  // ممرات مضيئة تمنح الشخصيات مناطق حركة بدل فراغ أسود.
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + Math.PI / 6;
    const lane = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.025, 5.8), i % 2 ? cyan : pink);
    lane.position.set(Math.cos(a) * 9.7, 0.08, Math.sin(a) * 9.7);
    lane.rotation.y = -a;
    arch.add(lane);
  }
  stationGroup.add(arch);
}
createLuxuryArchitecture();

function createParticleField() {
  const count = QUALITY.particleCount;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [new THREE.Color(CFG.colors.cyan), new THREE.Color(CFG.colors.pink), new THREE.Color(CFG.colors.gold)];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 4 + Math.random() * 20;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = 0.4 + Math.random() * 13;
    positions[i * 3 + 2] = Math.sin(a) * r;
    const c = palette[i % palette.length];
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 0.11, vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  const dust = new THREE.Points(geo, mat);
  scene.add(dust);
  cinematicFX.particles.push(dust);
}
createParticleField();

function createLightShafts() {
  for (let i = 0; i < QUALITY.shaftCount; i++) {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.15, 11, 16, 1, true), new THREE.MeshBasicMaterial({ color: [CFG.colors.cyan, CFG.colors.pink, CFG.colors.gold][i % 3], transparent: true, opacity: 0.028, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.set((i - 2) * 5, 6.4, 4);
    beam.rotation.z = (i - 2) * 0.1;
    beam.userData.phase = i * 1.4;
    cinematicFX.shafts.push(beam);
    scene.add(beam);
  }
}
createLightShafts();

// مسرح الرقص المركزي
function createDanceStage() {
  const stage = new THREE.Group();
  stage.position.set(0, 0.05, 2);

  // المنصة
  const baseGeo = new THREE.CylinderGeometry(6.5, 7.2, 0.35, 48);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x12162e,
    metalness: 0.7,
    roughness: 0.3
  });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.receiveShadow = true;
  base.castShadow = true;
  stage.add(base);

  // سطح الرقص المضيء
  const topGeo = new THREE.CylinderGeometry(6.2, 6.2, 0.08, 48);
  const topMat = new THREE.MeshStandardMaterial({
    color: 0x1a2040,
    emissive: 0x48e7ff,
    emissiveIntensity: 0.15,
    metalness: 0.6,
    roughness: 0.2
  });
  const top = new THREE.Mesh(topGeo, topMat);
  top.position.y = 0.22;
  top.receiveShadow = true;
  stage.add(top);

  // حلقات نيون متحركة
  for (let i = 0; i < 3; i++) {
    const r = 3.5 + i * 1.1;
    const ringGeo = new THREE.TorusGeometry(r, 0.04, 8, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: i === 1 ? 0xc8ff51 : 0xff5b9f,
      transparent: true,
      opacity: 0.7
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.28;
    ring.userData = { speed: 0.3 + i * 0.15, dir: i % 2 ? 1 : -1 };
    stage.add(ring);
    stage.userData.rings = stage.userData.rings || [];
    stage.userData.rings.push(ring);
  }

  // حافة مسرح معدنية ومرايا أرضية تعطي عمقًا واقعيًا للمنصة.
  const stageRail = new THREE.Mesh(
    new THREE.TorusGeometry(6.35, 0.12, 8, 64),
    new THREE.MeshStandardMaterial({ color: 0x3b4664, metalness: 0.95, roughness: 0.16 })
  );
  stageRail.rotation.x = Math.PI / 2;
  stageRail.position.y = 0.34;
  stage.add(stageRail);
  const centerDisc = new THREE.Mesh(
    new THREE.CircleGeometry(2.15, 48),
    new THREE.MeshStandardMaterial({ color: 0x11182d, metalness: 0.8, roughness: 0.18, emissive: 0x071229, emissiveIntensity: 0.32 })
  );
  centerDisc.rotation.x = -Math.PI / 2;
  centerDisc.position.y = 0.31;
  stage.add(centerDisc);

  stationGroup.add(stage);
  return stage;
}
const danceStage = createDanceStage();

// البار
function createBar() {
  const bar = new THREE.Group();
  bar.position.set(11, 0, -2);

  // العداد
  const counterGeo = new THREE.BoxGeometry(5.5, 1.1, 1.8);
  const counterMat = new THREE.MeshStandardMaterial({
    color: 0x161b35,
    metalness: 0.75,
    roughness: 0.25
  });
  const counter = new THREE.Mesh(counterGeo, counterMat);
  counter.position.y = 0.55;
  counter.castShadow = true;
  counter.receiveShadow = true;
  bar.add(counter);

  // سطح لامع
  const topGeo = new THREE.BoxGeometry(5.7, 0.12, 2.0);
  const topMat = new THREE.MeshStandardMaterial({
    color: 0x2a3358,
    metalness: 0.9,
    roughness: 0.1,
    emissive: 0xffd36e,
    emissiveIntensity: 0.08
  });
  const top = new THREE.Mesh(topGeo, topMat);
  top.position.y = 1.16;
  bar.add(top);

  // أضواء البار
  for (let i = 0; i < 4; i++) {
    const light = new THREE.PointLight(0xffd36e, 0.6, 6);
    light.position.set(-2 + i * 1.3, 1.6, 0.3);
    bar.add(light);
  }

  // زجاجات زخرفية
  for (let i = 0; i < 5; i++) {
    const bottleGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.55, 8);
    const bottleMat = new THREE.MeshStandardMaterial({
      color: [0x48e7ff, 0xff5b9f, 0xc8ff51, 0xffd36e, 0x9b6dff][i],
      metalness: 0.4,
      roughness: 0.2,
      transparent: true,
      opacity: 0.85
    });
    const bottle = new THREE.Mesh(bottleGeo, bottleMat);
    bottle.position.set(-1.8 + i * 0.9, 1.55, -0.4);
    bar.add(bottle);
  }

  // رف خلفي وشريط إضاءة عملي؛ لا توجد كراسٍ حتى تبقى المنطقة مخصصة للحركة.
  const backShelf = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 2.7, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x0a1020, metalness: 0.8, roughness: 0.28 })
  );
  backShelf.position.set(0, 2.35, -0.72);
  bar.add(backShelf);
  for (let i = 0; i < 3; i++) {
    const shelfLine = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.035, 0.035), new THREE.MeshBasicMaterial({ color: i === 1 ? CFG.colors.gold : CFG.colors.cyan }));
    shelfLine.position.set(0, 1.55 + i * 0.62, -0.6);
    bar.add(shelfLine);
  }

  stationGroup.add(bar);
  return bar;
}
const barArea = createBar();

// منصة الـ DJ
function createDJBooth() {
  const booth = new THREE.Group();
  booth.position.set(-11, 0, -1);

  // القاعدة
  const baseGeo = new THREE.BoxGeometry(4.2, 0.9, 2.4);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x101428,
    metalness: 0.8,
    roughness: 0.22
  });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.45;
  base.castShadow = true;
  booth.add(base);

  // سطح الخلاط
  const deckGeo = new THREE.BoxGeometry(3.6, 0.15, 1.6);
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0x1a2240,
    metalness: 0.7,
    roughness: 0.2,
    emissive: 0x48e7ff,
    emissiveIntensity: 0.12
  });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.y = 1.0;
  booth.add(deck);

  // أقراص دوارة
  for (let i = 0; i < 2; i++) {
    const discGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.08, 32);
    const discMat = new THREE.MeshStandardMaterial({
      color: 0x0a0e20,
      metalness: 0.9,
      roughness: 0.15
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.set(-0.9 + i * 1.8, 1.12, 0);
    disc.userData = { spinning: true };
    booth.add(disc);

    // مركز القرص
    const centerGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16);
    const centerMat = new THREE.MeshBasicMaterial({ color: 0xff5b9f });
    const center = new THREE.Mesh(centerGeo, centerMat);
    center.position.y = 0.05;
    disc.add(center);
  }

  // شاشات EQ
  const eqGeo = new THREE.BoxGeometry(1.4, 0.5, 0.08);
  const eqMat = new THREE.MeshStandardMaterial({
    color: 0x0a1020,
    emissive: 0xc8ff51,
    emissiveIntensity: 0.3
  });
  const eq = new THREE.Mesh(eqGeo, eqMat);
  eq.position.set(0, 1.45, -0.7);
  booth.add(eq);

  const boothHeader = new THREE.Mesh(
    new THREE.BoxGeometry(3.7, 0.42, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x080d1d, emissive: CFG.colors.gold, emissiveIntensity: 0.26, metalness: 0.55, roughness: 0.2 })
  );
  boothHeader.position.set(0, 2.05, -0.65);
  booth.add(boothHeader);
  for (let i = 0; i < 7; i++) {
    const meter = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24 + (i % 3) * 0.12, 0.035), new THREE.MeshBasicMaterial({ color: i % 2 ? CFG.colors.cyan : CFG.colors.gold }));
    meter.position.set(-1.2 + i * 0.4, 2.05, -0.57);
    booth.add(meter);
  }

  stationGroup.add(booth);
  return booth;
}
const djBooth = createDJBooth();

// نجوم الخلفية
function createStars() {
  const count = 1200;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 80 + Math.random() * 120;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.35,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85
  });
  const stars = new THREE.Points(geo, mat);
  scene.add(stars);
}
createStars();

// كواكب بعيدة
function createPlanets() {
  const planetGeo = new THREE.SphereGeometry(4.5, 32, 32);
  const planetMat = new THREE.MeshStandardMaterial({
    color: 0x2a1848,
    emissive: 0xff5b9f,
    emissiveIntensity: 0.15,
    metalness: 0.3,
    roughness: 0.7
  });
  const planet = new THREE.Mesh(planetGeo, planetMat);
  planet.position.set(-35, 12, -50);
  scene.add(planet);

  // حلقة الكوكب
  const ringGeo = new THREE.TorusGeometry(7, 0.35, 8, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffd36e,
    transparent: true,
    opacity: 0.45
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2.8;
  ring.rotation.y = 0.4;
  planet.add(ring);
}
createPlanets();

// ═══════════════════════════════════════════════════════════
// الشخصيات
// ═══════════════════════════════════════════════════════════

const PARTICIPANT_GEO = {
  body: new THREE.CapsuleGeometry(0.38, 0.7, 6, 12),
  helmet: new THREE.SphereGeometry(0.42, 16, 12),
  visor: new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI),
  pack: new THREE.BoxGeometry(0.45, 0.55, 0.22),
  limb: new THREE.CapsuleGeometry(0.1, 0.45, 4, 8),
  leg: new THREE.CapsuleGeometry(0.12, 0.4, 4, 8),
  badge: new THREE.BoxGeometry(0.22, 0.12, 0.04),
  collar: new THREE.TorusGeometry(0.24, 0.045, 6, 16),
  shoulder: new THREE.SphereGeometry(0.17, 8, 6),
  belt: new THREE.TorusGeometry(0.33, 0.035, 6, 16),
  boot: new THREE.BoxGeometry(0.22, 0.16, 0.34),
  stripe: new THREE.BoxGeometry(0.055, 0.52, 0.025)
};
const ParticipantSuitMaterial = DEVICE.mobile ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
const PARTICIPANT_MAT = {
  suit: new ParticipantSuitMaterial({ color: CFG.colors.suit, metalness: DEVICE.mobile ? 0 : 0.55, roughness: 0.35 }),
  helmet: new ParticipantSuitMaterial({ color: 0xe8f0ff, metalness: DEVICE.mobile ? 0 : 0.7, roughness: 0.2 }),
  visor: DEVICE.mobile ? new THREE.MeshBasicMaterial({ color: 0x1a3a5c, transparent: true, opacity: 0.82 }) : new THREE.MeshStandardMaterial({ color: 0x1a3a5c, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.75 }),
  pack: new ParticipantSuitMaterial({ color: 0x3a4a70, metalness: DEVICE.mobile ? 0 : 0.6, roughness: 0.3 }),
  badge: new THREE.MeshBasicMaterial({ color: CFG.colors.cyan })
};
const PARTICIPANT_ACCENTS = [
  new THREE.MeshBasicMaterial({ color: CFG.colors.cyan }),
  new THREE.MeshBasicMaterial({ color: CFG.colors.pink }),
  new THREE.MeshBasicMaterial({ color: CFG.colors.gold })
];

/**
 * بناء شخصية رائد فضاء (للمشاركين)
 */
function createAstronaut(name, handle) {
  const group = new THREE.Group();
  group.userData = {
    type: 'participant',
    name,
    handle,
    state: 'idle',
    actionUntil: 0,
    targetPos: null,
    velocity: new THREE.Vector3(),
    baseY: 0,
    socialPhase: Math.random() * Math.PI * 2,
    partner: null,
    home: null,
    walkTarget: null,
    walkSpeed: 0.65 + Math.random() * 0.35,
    nextWalk: performance.now() + 1800 + Math.random() * 4000,
    walkPhase: Math.random() * Math.PI * 2,
    applausePhase: Math.random() * Math.PI * 2
  };

  // الجسم (البذلة)
  const body = new THREE.Mesh(PARTICIPANT_GEO.body, PARTICIPANT_MAT.suit);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);

  // الخوذة
  const helmet = new THREE.Mesh(PARTICIPANT_GEO.helmet, PARTICIPANT_MAT.helmet);
  helmet.position.y = 1.85;
  helmet.castShadow = true;
  group.add(helmet);

  // زجاج الخوذة
  const visor = new THREE.Mesh(PARTICIPANT_GEO.visor, PARTICIPANT_MAT.visor);
  visor.position.set(0, 1.88, 0.18);
  visor.rotation.y = Math.PI;
  group.add(visor);

  // حقيبة الظهر
  const pack = new THREE.Mesh(PARTICIPANT_GEO.pack, PARTICIPANT_MAT.pack);
  pack.position.set(0, 1.15, -0.35);
  group.add(pack);

  // الأذرع
  const armGeo = PARTICIPANT_GEO.limb;
  const armMat = PARTICIPANT_MAT.suit;
  const armL = new THREE.Mesh(armGeo, armMat);
  armL.position.set(-0.48, 1.25, 0);
  armL.rotation.z = 0.25;
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, armMat);
  armR.position.set(0.48, 1.25, 0);
  armR.rotation.z = -0.25;
  group.add(armR);

  // الأرجل
  const legGeo = PARTICIPANT_GEO.leg;
  const legL = new THREE.Mesh(legGeo, armMat);
  legL.position.set(-0.18, 0.35, 0);
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, armMat);
  legR.position.set(0.18, 0.35, 0);
  group.add(legR);

  // لوحة الصدر المضيئة
  const badgeGeo = PARTICIPANT_GEO.badge;
  const badgeMat = PARTICIPANT_MAT.badge;
  const badge = new THREE.Mesh(badgeGeo, badgeMat);
  badge.position.set(0, 1.25, 0.38);
  group.add(badge);

  // تفاصيل بدلة مشتركة: ياقة، ألواح كتف، حزام خدمة، أحذية مغناطيسية وشرائط إضاءة.
  const accentMat = PARTICIPANT_ACCENTS[Math.floor(Math.random() * PARTICIPANT_ACCENTS.length)];
  const collar = new THREE.Mesh(PARTICIPANT_GEO.collar, accentMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 1.47, 0.02);
  group.add(collar);
  const shoulderL = new THREE.Mesh(PARTICIPANT_GEO.shoulder, PARTICIPANT_MAT.suit);
  shoulderL.scale.set(1.25, 0.65, 0.85); shoulderL.position.set(-0.43, 1.45, 0);
  const shoulderR = shoulderL.clone(); shoulderR.position.x = 0.43;
  group.add(shoulderL, shoulderR);
  const belt = new THREE.Mesh(PARTICIPANT_GEO.belt, PARTICIPANT_MAT.pack);
  belt.rotation.x = Math.PI / 2; belt.position.y = 0.82; group.add(belt);
  const bootL = new THREE.Mesh(PARTICIPANT_GEO.boot, PARTICIPANT_MAT.pack); bootL.position.set(-0.18, 0.12, 0.1);
  const bootR = bootL.clone(); bootR.position.x = 0.18; group.add(bootL, bootR);
  const stripe = new THREE.Mesh(PARTICIPANT_GEO.stripe, accentMat);
  stripe.position.set(-0.31, 1.05, 0.36); group.add(stripe); group.add(stripe.clone());
  group.userData.accentMat = accentMat;

  // الاسم فوق الرأس
  const nameSprite = createNameSprite(name, handle);
  nameSprite.position.y = 2.55;
  group.add(nameSprite);

  group.userData.parts = { body, helmet, armL, armR, legL, legR, badge };

  return group;
}

/**
 * بناء شخصية الـ DJ (مختلفة — بدون خوذة)
 */
function createDJCharacter() {
  const group = new THREE.Group();
  group.userData = {
    type: 'dj',
    state: 'mixing',
    phase: 0
  };

  // الجسم (سترة أنيقة داكنة)
  const bodyGeo = new THREE.CapsuleGeometry(0.36, 0.75, 6, 12);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: CFG.colors.djSuit,
    metalness: 0.4,
    roughness: 0.4
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 1.1;
  body.castShadow = true;
  group.add(body);

  // الرأس (بدون خوذة)
  const headGeo = new THREE.SphereGeometry(0.32, 20, 16);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xf0d0b0,
    metalness: 0.1,
    roughness: 0.6
  });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.9;
  head.castShadow = true;
  group.add(head);

  // شعر قصير
  const hairGeo = new THREE.SphereGeometry(0.34, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x1a1520,
    roughness: 0.8
  });
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.y = 2.05;
  group.add(hair);

  // نظارات سينمائية
  const glassesGeo = new THREE.BoxGeometry(0.48, 0.12, 0.08);
  const glassesMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    metalness: 0.9,
    roughness: 0.1
  });
  const glasses = new THREE.Mesh(glassesGeo, glassesMat);
  glasses.position.set(0, 1.95, 0.28);
  group.add(glasses);

  // عدسات متوهجة
  const lensGeo = new THREE.CircleGeometry(0.09, 12);
  const lensMat = new THREE.MeshBasicMaterial({ color: 0x48e7ff });
  const lensL = new THREE.Mesh(lensGeo, lensMat);
  lensL.position.set(-0.12, 1.95, 0.33);
  group.add(lensL);
  const lensR = new THREE.Mesh(lensGeo, lensMat);
  lensR.position.set(0.12, 1.95, 0.33);
  group.add(lensR);

  // الأذرع
  const armGeo = new THREE.CapsuleGeometry(0.09, 0.5, 4, 8);
  const armMat = new THREE.MeshStandardMaterial({
    color: CFG.colors.djSuit,
    metalness: 0.4,
    roughness: 0.4
  });
  const armL = new THREE.Mesh(armGeo, armMat);
  armL.position.set(-0.45, 1.3, 0.15);
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, armMat);
  armR.position.set(0.45, 1.3, 0.15);
  group.add(armR);

  // الأرجل
  const legGeo = new THREE.CapsuleGeometry(0.11, 0.42, 4, 8);
  const legL = new THREE.Mesh(legGeo, armMat);
  legL.position.set(-0.16, 0.38, 0);
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, armMat);
  legR.position.set(0.16, 0.38, 0);
  group.add(legR);

  // شارة ذهبية
  const badgeGeo = new THREE.BoxGeometry(0.18, 0.18, 0.04);
  const badgeMat = new THREE.MeshBasicMaterial({ color: CFG.colors.gold });
  const badge = new THREE.Mesh(badgeGeo, badgeMat);
  badge.position.set(0.2, 1.35, 0.36);
  group.add(badge);

  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.035, 6, 36), new THREE.MeshBasicMaterial({ color: CFG.colors.gold, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending }));
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.06;
  group.add(halo);

  // اسم الـ DJ
  const nameSprite = createNameSprite('مروان', 'DJ · المضيف', true);
  nameSprite.position.y = 2.55;
  group.add(nameSprite);

  group.userData.parts = { body, head, armL, armR, legL, legR, glasses, lensL, lensR, halo };

  return group;
}

/**
 * نص الاسم فوق الرأس
 */
function createNameSprite(name, handle, isDJ = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');

  // خلفية
  ctx.fillStyle = isDJ ? 'rgba(255,211,110,0.15)' : 'rgba(8,12,28,0.82)';
  roundRect(ctx, 8, 8, 240, 64, 12);
  ctx.fill();

  // إطار
  ctx.strokeStyle = isDJ ? 'rgba(255,211,110,0.7)' : 'rgba(72,231,255,0.45)';
  ctx.lineWidth = 2;
  roundRect(ctx, 8, 8, 240, 64, 12);
  ctx.stroke();

  // الاسم
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px Cairo, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(name.slice(0, 14), 128, 38);

  // الحساب
  ctx.fillStyle = isDJ ? '#ffd36e' : '#8b95b8';
  ctx.font = '600 14px Space Grotesk, sans-serif';
  ctx.fillText(handle.slice(0, 18), 128, 58);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.4, 0.75, 1);
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ═══════════════════════════════════════════════════════════
// إدارة المشاركين
// ═══════════════════════════════════════════════════════════
function addParticipant(data = {}) {
  if (state.participants.size >= CFG.maxParticipants) {
    showToast('المحطة ممتلئة — الحد الأقصى 40');
    return null;
  }

  const id = data.id || `p-${++state.idSeq}`;
  if (state.participants.has(id)) {
    showToast('المشارك موجود بالفعل');
    return state.participants.get(id);
  }

  const name = data.name || randomName();
  const handle = data.handle || `@astro_${100 + state.idSeq}`;

  const mesh = createAstronaut(name, handle);

  // موضع عشوائي حول المسرح
  const angle = Math.random() * Math.PI * 2;
  const radius = 8 + Math.random() * 7;
  mesh.position.set(
    Math.cos(angle) * radius,
    0,
    Math.sin(angle) * radius + 1
  );
  mesh.userData.home = mesh.position.clone();
  mesh.userData.walkTarget = mesh.position.clone();
  mesh.rotation.y = Math.random() * Math.PI * 2;

  scene.add(mesh);
  state.participants.set(id, mesh);
  updateCounts();
  showToast(`🚀 ${name} دخل المحطة`);

  // حركة دخول
  mesh.scale.set(0.01, 0.01, 0.01);
  animateScale(mesh, 1, 600);

  return mesh;
}

function removeParticipant(id) {
  const mesh = state.participants.get(id);
  if (!mesh) return;
  animateScale(mesh, 0.01, 500, () => {
    scene.remove(mesh);
    state.participants.delete(id);
    updateCounts();
  });
}

function clearAll() {
  [...state.participants.keys()].forEach(removeParticipant);
}

const NAMES = ['نورة', 'أحمد', 'ليلى', 'سلطان', 'مها', 'خالد', 'ريم', 'فهد', 'جود', 'ماجد', 'دانة', 'عمر', 'سارة', 'يوسف', 'هند', 'بدر', 'لمى', 'زياد', 'روان', 'تركي', 'لينا', 'ياسر', 'غادة', 'ناصر'];
function randomName() {
  return NAMES[Math.floor(Math.random() * NAMES.length)];
}

function animateScale(obj, target, duration, onDone) {
  const start = obj.scale.x;
  const startTime = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const v = start + (target - start) * easeOutCubic(t);
    obj.scale.setScalar(v);
    if (t < 1) requestAnimationFrame(tick);
    else if (onDone) onDone();
  }
  requestAnimationFrame(tick);
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// ═══════════════════════════════════════════════════════════
// الحركات والتأثيرات
// ═══════════════════════════════════════════════════════════
function runGiftAction(tier = 'small', requestedTarget = null, event = null) {
  const list = [...state.participants.values()];
  if (!list.length) {
    showToast('أضف مشاركين أولًا');
    return;
  }

  const target = requestedTarget && list.includes(requestedTarget)
    ? requestedTarget
    : list[Math.floor(Math.random() * list.length)];
  const ud = target.userData;

  if (tier === 'small') {
    ud.state = 'dance';
    ud.actionUntil = performance.now() + 4000;
    startApplause(target, 4000);
    showToast(`${event?.user?.nickname || ud.name} · رقص`);
    focusGiftCamera(target, 3500, 'small');
  } else if (tier === 'medium') {
    ud.state = 'flip';
    ud.actionUntil = performance.now() + 3500;
    startApplause(target, 3500);
    showToast(`${event?.user?.nickname || ud.name} · شقلبة`);
    focusGiftCamera(target, 3200, 'medium');
  } else if (tier === 'big') {
    state.zeroGUntil = performance.now() + 8000;
    state.participants.forEach((m) => {
      m.userData.state = 'zeroG';
      m.userData.actionUntil = performance.now() + 8000;
    });
    showToast(`🌌 ${event?.user?.nickname || ud.name} أشعل انعدام الجاذبية!`);
    focusGiftCamera(target, 4000, 'big');
  } else {
    // mega = حفلة
    state.partyUntil = performance.now() + 12000;
    state.participants.forEach((m) => {
      m.userData.state = 'party';
      m.userData.actionUntil = performance.now() + 12000;
    });
    showToast(`🎉 ${event?.user?.nickname || ud.name} أشعل الحفلة!`);
    focusGiftCamera(target, 4500, 'mega');
    triggerConfetti();
  }
}

function startApplause(target, duration = 4000) {
  state.applauseTarget = target;
  state.applauseUntil = performance.now() + duration;
  state.participants.forEach((actor) => {
    if (actor !== target) {
      actor.userData.state = 'applause';
      actor.userData.actionUntil = state.applauseUntil;
    }
  });
  showToast(`👏 الجميع يصفق لـ ${target.userData.name}`);
}

function focusGiftCamera(target, duration, tier = 'small') {
  state.cameraMode = 'gift';
  state.giftTarget = target;
  state.giftUntil = performance.now() + duration;
  state.giftTier = tier;
  cameraModeLabel.textContent = `تركيز · ${target.userData.name}`;
  const giftColor = { small: CFG.colors.cyan, medium: CFG.colors.pink, big: CFG.colors.gold, mega: CFG.colors.lime }[tier] || CFG.colors.gold;
  if (!cinematicFX.giftAura) {
    cinematicFX.giftAura = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.045, 8, 48), new THREE.MeshBasicMaterial({ color: giftColor, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
    cinematicFX.giftAura.rotation.x = Math.PI / 2;
    scene.add(cinematicFX.giftAura);
    cinematicFX.giftSpot = new THREE.PointLight(giftColor, 4, 11, 2);
    scene.add(cinematicFX.giftSpot);
  }
  cinematicFX.giftAura.material.color.setHex(giftColor);
  cinematicFX.giftSpot.color.setHex(giftColor);
  cinematicFX.giftAura.scale.setScalar(tier === 'mega' ? 1.5 : tier === 'big' ? 1.3 : tier === 'medium' ? 1.12 : 0.92);
  cinematicFX.giftAura.visible = true;
  cinematicFX.giftSpot.visible = true;
}

// جسيمات بسيطة للاحتفال
const confettiParticles = [];
const confettiGeo = new THREE.BoxGeometry(0.12, 0.12, 0.04);
const confettiMats = [0xc8ff51, 0xff5b9f, 0x48e7ff, 0xffd36e, 0xffffff].map((color) => new THREE.MeshBasicMaterial({ color }));
function triggerConfetti() {
  for (let i = 0; i < 40; i++) {
    const p = new THREE.Mesh(confettiGeo, confettiMats[i % confettiMats.length]);
    p.position.set(
      (Math.random() - 0.5) * 16,
      8 + Math.random() * 4,
      (Math.random() - 0.5) * 12
    );
    p.userData = {
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        -1 - Math.random() * 2,
        (Math.random() - 0.5) * 3
      ),
      life: 3 + Math.random() * 2
    };
    scene.add(p);
    confettiParticles.push(p);
  }
}

function updateSocialInteractions(dt, t) {
  state.socialTick = (state.socialTick + 1) % QUALITY.socialInterval;
  if (state.socialTick !== 0) return;
  const actors = [...state.participants.values()];
  actors.forEach((actor) => { actor.userData.partner = null; });
  const socialRadiusSq = 5.2 * 5.2;
  for (let i = 0; i < actors.length; i++) {
    for (let j = i + 1; j < actors.length; j++) {
      const a = actors[i], b = actors[j];
      const dx = a.position.x - b.position.x;
      const dz = a.position.z - b.position.z;
      if (dx * dx + dz * dz > socialRadiusSq) continue;
      a.userData.partner = b; b.userData.partner = a;
      const phase = t * 2.2 + i * 0.37;
      const sway = Math.sin(phase) * 0.12;
      const aBase = a.userData.state === 'dance' || a.userData.state === 'party' ? 0.4 : a.userData.state === 'zeroG' ? 1.2 : 0.25;
      const bBase = b.userData.state === 'dance' || b.userData.state === 'party' ? 0.4 : b.userData.state === 'zeroG' ? 1.2 : 0.25;
      a.userData.parts.armL.rotation.z = aBase + sway; a.userData.parts.armR.rotation.z = -aBase - sway;
      b.userData.parts.armL.rotation.z = bBase - sway; b.userData.parts.armR.rotation.z = -bBase + sway;
      a.rotation.y = THREE.MathUtils.lerp(a.rotation.y, Math.atan2(b.position.x - a.position.x, b.position.z - a.position.z), dt * 1.8);
      b.rotation.y = THREE.MathUtils.lerp(b.rotation.y, Math.atan2(a.position.x - b.position.x, a.position.z - b.position.z), dt * 1.8);
      if (a.userData.state === 'idle' && b.userData.state === 'idle') {
        a.position.y += Math.sin(phase) * 0.018; b.position.y += Math.sin(phase + 0.35) * 0.018;
        const greeting = Math.sin(t * 2.4 + i) > -0.35;
        if (greeting) {
          // ذراع ممدودة نحو الصديق ثم رجوعها؛ تبدو كتحية/مصافحة قصيرة.
          a.userData.parts.armR.rotation.x = -0.48 + Math.sin(phase * 1.6) * 0.12;
          b.userData.parts.armL.rotation.x = -0.48 + Math.sin(phase * 1.6 + 0.5) * 0.12;
          a.userData.parts.armR.rotation.z = -0.62;
          b.userData.parts.armL.rotation.z = 0.62;
        }
      }
    }
  }
}

function updateCinematicFX(dt, t, now) {
  if (QUALITY.fxInterval > 1 && state.frame % QUALITY.fxInterval !== 0 && !(cinematicFX.giftAura && state.giftTarget && now < state.giftUntil)) return;
  cinematicFX.panels.forEach((panel, i) => {
    panel.position.y = 4.1 + Math.sin(t * 1.2 + panel.userData.phase) * 0.06;
    panel.rotation.y = Math.sin(t * 0.35 + i) * 0.025;
  });
  cinematicFX.particles.forEach((dust) => { dust.rotation.y += dt * 0.018; dust.rotation.x = Math.sin(t * 0.08) * 0.025; });
  cinematicFX.shafts.forEach((beam, i) => {
    beam.rotation.z = Math.sin(t * 0.42 + beam.userData.phase) * 0.24;
    beam.material.opacity = 0.018 + Math.abs(Math.sin(t * 1.8 + i)) * 0.028;
  });
  if (cinematicFX.giftAura && state.giftTarget && now < state.giftUntil) {
    cinematicFX.giftAura.position.copy(state.giftTarget.position).setY(state.giftTarget.position.y + 1.15);
    cinematicFX.giftAura.rotation.z += dt * 2.6;
    cinematicFX.giftAura.scale.setScalar(1 + Math.sin(t * 6) * 0.12);
    cinematicFX.giftSpot.position.copy(state.giftTarget.position).setY(3.4);
    cinematicFX.giftSpot.intensity = 3.2 + Math.sin(t * 8) * 0.8;
  } else if (cinematicFX.giftAura) {
    cinematicFX.giftAura.visible = false; cinematicFX.giftSpot.visible = false;
  }
}

function chooseWalkTarget(actor, now) {
  const angle = Math.random() * Math.PI * 2;
  const radius = 8.2 + Math.random() * 7.5;
  actor.userData.walkTarget = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius + 1);
  actor.userData.nextWalk = now + 4500 + Math.random() * 6500;
}

function triggerRandomDance(now, force = false) {
  if (!force && now < state.nextRandomDance) return;
  const available = [...state.participants.values()].filter((actor) => actor.userData.state === 'idle');
  if (available.length) {
    const dancer = available[Math.floor(Math.random() * available.length)];
    dancer.userData.state = 'dance';
    dancer.userData.actionUntil = now + 4200;
    showToast(`✦ ${dancer.userData.name} بدأ رقصة عفوية`);
  }
  state.nextRandomDance = now + 11000 + Math.random() * 9000;
}

// ═══════════════════════════════════════════════════════════
// تحديث الحركات كل إطار
// ═══════════════════════════════════════════════════════════
function updateCharacters(dt, now) {
  const t = now * 0.001;
  triggerRandomDance(now);
  // تحديث الـ DJ
  if (state.dj) {
    const dj = state.dj;
    const parts = dj.userData.parts;
    dj.userData.phase += dt * 2.2;

    // حركة مستمرة ومتنوعة للـ DJ
    const phase = dj.userData.phase;
    parts.armL.rotation.x = Math.sin(phase * 1.3) * 0.45;
    parts.armR.rotation.x = Math.sin(phase * 1.1 + 1) * 0.55;
    parts.armL.rotation.z = 0.3 + Math.sin(phase * 0.8) * 0.15;
    parts.armR.rotation.z = -0.3 - Math.sin(phase * 0.9) * 0.15;
    parts.head.rotation.y = Math.sin(phase * 0.6) * 0.25;
    parts.body.position.y = 1.1 + Math.sin(phase * 2) * 0.03;
    parts.halo.rotation.z += dt * 0.8;
    parts.halo.scale.setScalar(1 + Math.sin(phase * 1.7) * 0.08);
    djGlow.intensity = 2.1 + Math.sin(phase * 1.7) * 0.55;

    // دوران الأقراص
    djBooth.children.forEach((c) => {
      if (c.userData?.spinning) c.rotation.y += dt * 3.5;
    });
  }

  // تحديث المشاركين
  state.participants.forEach((mesh) => {
    const ud = mesh.userData;
    const parts = ud.parts;

    if (ud.actionUntil && now > ud.actionUntil) {
      ud.state = 'idle';
      ud.actionUntil = 0;
    }

    // حركات حسب الحالة
    if (ud.state === 'dance' || ud.state === 'party') {
      const speed = ud.state === 'party' ? 4.5 : 3.2;
      parts.armL.rotation.x = Math.sin(t * speed) * 1.1;
      parts.armR.rotation.x = Math.sin(t * speed + Math.PI) * 1.1;
      parts.armL.rotation.z = 0.4 + Math.sin(t * speed * 0.7) * 0.3;
      parts.armR.rotation.z = -0.4 - Math.sin(t * speed * 0.7) * 0.3;
      parts.legL.rotation.x = Math.sin(t * speed) * 0.5;
      parts.legR.rotation.x = Math.sin(t * speed + Math.PI) * 0.5;
      mesh.position.y = Math.abs(Math.sin(t * speed * 1.5)) * 0.25;
      mesh.rotation.y += dt * (ud.state === 'party' ? 1.8 : 0.9);
    } else if (ud.state === 'flip') {
      mesh.rotation.x += dt * 6;
      mesh.position.y = Math.sin(t * 4) * 1.2 + 0.8;
    } else if (ud.state === 'applause') {
      const applauseTarget = state.applauseTarget;
      if (applauseTarget && applauseTarget !== mesh) {
        mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, Math.atan2(applauseTarget.position.x - mesh.position.x, applauseTarget.position.z - mesh.position.z), dt * 2.4);
      }
      const clap = Math.abs(Math.sin(t * 6 + ud.applausePhase));
      parts.armL.rotation.x = -0.55 - clap * 0.55;
      parts.armR.rotation.x = -0.55 - clap * 0.55;
      parts.armL.rotation.z = 0.34 + clap * 0.24;
      parts.armR.rotation.z = -0.34 - clap * 0.24;
      parts.legL.rotation.x = Math.sin(t * 3 + ud.applausePhase) * 0.12;
      parts.legR.rotation.x = -Math.sin(t * 3 + ud.applausePhase) * 0.12;
      mesh.position.y = Math.abs(Math.sin(t * 3 + ud.applausePhase)) * 0.08;
    } else if (ud.state === 'zeroG' || now < state.zeroGUntil) {
      mesh.position.y = 1.5 + Math.sin(t * 1.5 + mesh.id) * 0.9;
      mesh.rotation.x = Math.sin(t * 0.8) * 0.4;
      mesh.rotation.z = Math.cos(t * 0.6) * 0.3;
      parts.armL.rotation.z = 1.2;
      parts.armR.rotation.z = -1.2;
    } else {
      // تجول هادئ: يختار كل مشارك نقطة قريبة ثم يمشي إليها ببطء.
      if (!ud.walkTarget || now > ud.nextWalk) chooseWalkTarget(mesh, now);
      const distance = mesh.position.distanceTo(ud.walkTarget);
      if (distance > 0.28) {
        const direction = ud.walkTarget.clone().sub(mesh.position).setY(0).normalize();
        mesh.position.addScaledVector(direction, ud.walkSpeed * dt);
        mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, Math.atan2(direction.x, direction.z), dt * 3.2);
        ud.walkPhase += dt * 7;
        parts.armL.rotation.x = Math.sin(ud.walkPhase) * 0.22;
        parts.armR.rotation.x = Math.sin(ud.walkPhase + Math.PI) * 0.22;
        parts.legL.rotation.x = Math.sin(ud.walkPhase + Math.PI) * 0.35;
        parts.legR.rotation.x = Math.sin(ud.walkPhase) * 0.35;
      } else {
        // وقفة قصيرة مع إيماءة خفيفة قبل اختيار مسار جديد.
        parts.armL.rotation.x = Math.sin(t * 1.2 + ud.socialPhase) * 0.15;
        parts.armR.rotation.x = Math.sin(t * 1.1 + ud.socialPhase + 1) * 0.15;
        parts.legL.rotation.x *= 0.9; parts.legR.rotation.x *= 0.9;
      }
      mesh.position.y = Math.sin(t * 1.5 + ud.socialPhase) * 0.04;
      mesh.rotation.x *= 0.9;
      mesh.rotation.z *= 0.9;
    }
  });

  updateSocialInteractions(dt, t);
  updateCinematicFX(dt, t, now);

  // تحديث الكونفيتي
  for (let i = confettiParticles.length - 1; i >= 0; i--) {
    const p = confettiParticles[i];
    p.userData.life -= dt;
    p.position.addScaledVector(p.userData.vel, dt);
    p.userData.vel.y -= 4 * dt;
    p.rotation.x += dt * 4;
    p.rotation.z += dt * 3;
    if (p.userData.life <= 0 || p.position.y < -2) {
      scene.remove(p);
      confettiParticles.splice(i, 1);
    }
  }

  // دوران حلقات المسرح
  if (danceStage.userData.rings) {
    danceStage.userData.rings.forEach((r) => {
      r.rotation.z += dt * r.userData.speed * r.userData.dir;
    });
  }

  // أضواء المسرح المتحركة
  stageLights.forEach((sl, i) => {
    const a = t * 0.7 + i * 1.5;
    sl.target.position.x = Math.sin(a) * 5;
    sl.target.position.z = 2 + Math.cos(a * 0.8) * 3;
  });
}

function adaptRenderQuality(dt) {
  if (!DEVICE.mobile) return;
  state.perf.elapsed += dt;
  state.perf.frames += 1;
  if (state.perf.elapsed < 1.5) return;
  const fps = state.perf.frames / state.perf.elapsed;
  if (fps < 28 && state.perf.ratio > 0.72) {
    state.perf.ratio = Math.max(0.72, state.perf.ratio - 0.1);
    renderer.setPixelRatio(state.perf.ratio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  } else if (fps > 52 && state.perf.ratio < QUALITY.pixelRatio) {
    state.perf.ratio = Math.min(QUALITY.pixelRatio, state.perf.ratio + 0.05);
    renderer.setPixelRatio(state.perf.ratio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }
  state.perf.elapsed = 0;
  state.perf.frames = 0;
}

// ═══════════════════════════════════════════════════════════
// نظام الكاميرات
// ═══════════════════════════════════════════════════════════
const wideCamPos = new THREE.Vector3(0, 18, 38);
const wideCamTarget = new THREE.Vector3(0, 1.2, 0);
let camAngle = 0;

function updateCamera(dt, now) {
  if (state.cameraMode === 'gift' && state.giftTarget && now < state.giftUntil) {
    // كاميرا تركيز على الهدية
    const target = state.giftTarget.position;
    const orbit = Math.sin(now * 0.0012) * 0.55;
    const desired = new THREE.Vector3(target.x + 4.5 + Math.sin(orbit) * 1.2, target.y + 3.4 + Math.sin(now * 0.004) * 0.12, target.z + 6 + Math.cos(orbit) * 0.8);
    camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
    const look = new THREE.Vector3(target.x, target.y + 1.2, target.z);
    const shake = Math.max(0, (state.giftUntil - now) / 4500) * 0.035;
    camera.position.x += Math.sin(now * 0.031) * shake;
    camera.position.y += Math.cos(now * 0.027) * shake;
    camera.lookAt(look);
  } else {
    // العودة للكاميرا العامة + حركة بانورامية
    if (state.cameraMode === 'gift') {
      state.cameraMode = 'wide';
      cameraModeLabel.textContent = 'كاميرا عامة';
      if (cinematicFX.giftAura) cinematicFX.giftAura.visible = false;
      if (cinematicFX.giftSpot) cinematicFX.giftSpot.visible = false;
    }
    camAngle += dt * 0.08;
    const radius = 36 + Math.sin(camAngle * 0.5) * 4;
    wideCamPos.x = Math.sin(camAngle) * radius;
    wideCamPos.z = Math.cos(camAngle) * radius;
    wideCamPos.y = 17 + Math.sin(camAngle * 0.7) * 3.2;

    camera.position.lerp(wideCamPos, 1 - Math.pow(0.02, dt));
    camera.lookAt(wideCamTarget);
  }
}

// ═══════════════════════════════════════════════════════════
// الأحداث والواجهة
// ═══════════════════════════════════════════════════════════
$('addBtn').addEventListener('click', () => {
  const name = $('manualName').value.trim();
  addParticipant(name ? { name } : {});
  $('manualName').value = '';
});

$('manualName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const name = e.target.value.trim();
    addParticipant(name ? { name } : {});
    e.target.value = '';
  }
});

$('add10Btn').addEventListener('click', () => {
  for (let i = 0; i < 10; i++) {
    setTimeout(() => addParticipant({}), i * 180);
  }
});

$('clearBtn').addEventListener('click', clearAll);

$('mobileWideBtn').addEventListener('click', () => {
  state.cameraMode = 'wide';
  state.giftTarget = null;
  cameraModeLabel.textContent = 'كاميرا عامة بعيدة';
  showToast('تم توسيع الرؤية لإظهار المحطة كاملة');
});

$('mobileDanceBtn').addEventListener('click', () => triggerRandomDance(performance.now(), true));
$('mobileGiftBtn').addEventListener('click', () => runGiftAction('small'));
$('mobilePartyBtn').addEventListener('click', () => runGiftAction('mega'));
$('mobileHostBtn').addEventListener('click', () => hostPanel.classList.toggle('is-hidden'));

document.querySelectorAll('[data-gift]').forEach((btn) => {
  btn.addEventListener('click', () => runGiftAction(btn.dataset.gift));
});

$('tiktokConnectBtn').addEventListener('click', async () => {
  const uniqueId = $('tiktokUsername').value.trim();
  const roomId = $('tiktokRoomId').value.trim();
  if (!uniqueId && !roomId) { showToast('اكتب @username أو Room ID الخاص بالبث أولًا'); return; }
  connectionStatus.textContent = 'TikTok — جارٍ الاتصال';
  try { await liveClient.connect({ uniqueId, roomId }); } catch (error) { handleLiveStatus({ status: 'error', message: error.message }); }
});

$('tiktokDisconnectBtn').addEventListener('click', async () => {
  await liveClient.disconnect();
  showToast('تم فصل TikTok LIVE والعودة للوضع اليدوي');
});

$('hostToggle').addEventListener('click', () => {
  hostPanel.classList.toggle('is-hidden');
});

$('fsBtn').addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch (_) {
    showToast('ملء الشاشة غير متاح');
  }
});

window.addEventListener('keydown', (e) => {
  if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'h') hostPanel.classList.toggle('is-hidden');
  if (k === 'f') $('fsBtn').click();
  if (k === '1') runGiftAction('small');
  if (k === '2') runGiftAction('medium');
  if (k === '3') runGiftAction('big');
  if (k === '4') runGiftAction('mega');
});

// موسيقى بسيطة (Web Audio)
let audioCtx = null;
let musicOn = false;
let musicTimer = null;

$('musicBtn').addEventListener('click', async () => {
  if (musicOn) {
    musicOn = false;
    clearInterval(musicTimer);
    $('musicBtn').classList.remove('is-on');
    $('musicLabel').textContent = 'الموسيقى';
  } else {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    musicOn = true;
    $('musicBtn').classList.add('is-on');
    $('musicLabel').textContent = 'إيقاف';
    musicTimer = setInterval(playAmbientNote, 1800);
    playAmbientNote();
  }
});

function playAmbientNote() {
  if (!musicOn || !audioCtx) return;
  const notes = [196, 246.94, 293.66, 369.99, 440, 523.25];
  const freq = notes[Math.floor(Math.random() * notes.length)];
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.03, audioCtx.currentTime + 0.4);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 2.8);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 3);
}

// ═══════════════════════════════════════════════════════════
// حلقة الرسم
// ═══════════════════════════════════════════════════════════
function animate() {
  requestAnimationFrame(animate);
  state.frame += 1;
  const dt = Math.min(state.clock.getDelta(), 0.05);
  const now = performance.now();

  updateCharacters(dt, now);
  adaptRenderQuality(dt);
  updateCamera(dt, now);

  if (QUALITY.useComposer) composer.render();
  else renderer.render(scene, camera);
}

// ═══════════════════════════════════════════════════════════
// التهيئة
// ═══════════════════════════════════════════════════════════
function init() {
  // إضافة الـ DJ
  state.dj = createDJCharacter();
  state.dj.position.set(-11, 0, 0.3);
  state.dj.rotation.y = Math.PI * 0.15;
  scene.add(state.dj);

  // إضافة بعض المشاركين للبداية
  for (let i = 0; i < 24; i++) {
    setTimeout(() => addParticipant({}), i * 70);
  }

  // إخفاء شاشة التحميل
  setTimeout(() => {
    loader.classList.add('is-done');
  }, 900);

  // بدء الحلقة
  animate();

  // دعم تغيير الحجم
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  });

  showToast('ساحة استراحة الفضاء ثلاثية الأبعاد جاهزة ✦');
}

init();
