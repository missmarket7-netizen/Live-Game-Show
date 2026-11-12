import * as THREE from 'three';

const stage = document.getElementById('loungeStage');
const participantLayer = document.getElementById('participantLayer');
const FRAME_INTERVAL = 1000 / 24;
const PARTICIPANT_SELECTOR = '.astronaut-participant';
const ACTION_CLASSES = new Map([
  ['anim-cheer', 'cheer'], ['anim-comedy', 'comedy'], ['anim-dance', 'dance'],
  ['anim-run', 'run'], ['anim-flip', 'flip'], ['anim-solo', 'solo'],
  ['anim-zero', 'zero'], ['anim-chaos', 'chaos']
]);

if (stage && participantLayer && window.WebGLRenderingContext) {
  try {
    startScene();
  } catch (error) {
    stage.classList.remove('has-3d-scene');
    document.querySelector('.space-lounge-3d-canvas')?.remove();
    console.warn('[استراحة الفضاء] تعذر تشغيل المشهد ثلاثي الأبعاد، سيستمر الوضع الاحتياطي.', error);
  }
}

function startScene() {
  const canvas = document.createElement('canvas');
  canvas.className = 'space-lounge-3d-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'مشهد ثلاثي الأبعاد للمحطة المدارية وشخصيات رواد الفضاء');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: window.innerWidth > 600,
      alpha: false,
      powerPreference: 'low-power'
    });
  } catch (error) {
    console.info('[استراحة الفضاء] WebGL غير متاح؛ سيبقى المشهد الخفيف فعالاً.');
    return;
  }

  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x09111f);
  scene.fog = new THREE.Fog(0x09111f, 19, 37);

  const camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 80);
  camera.position.set(0, 14, 16);
  camera.lookAt(0, 0.8, 0);
  camera.zoom = 1;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = false;

  stage.insertBefore(canvas, stage.firstChild);
  stage.classList.add('has-3d-scene');

  const world = new THREE.Group();
  const environment = new THREE.Group();
  const avatarLayer = new THREE.Group();
  world.add(environment);
  scene.add(world, avatarLayer);

  const shared = createSharedResources();
  addLighting(scene);
  buildOrbitalCafe(environment, shared);

  const rigs = new Map();
  const targetFocus = new THREE.Vector3(0, 0.55, 0);
  const currentFocus = new THREE.Vector3(0, 0.55, 0);
  const focusWorld = new THREE.Vector3();
  const projection = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const screenNdc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let desiredZoom = 1;
  let currentZoom = 1;
  let worldScaleX = 1;
  let previousFrame = 0;
  let frameHandle = 0;
  let disposed = false;

  function worldPosition(left, top, node) {
    const width = node?.offsetWidth || 108;
    camera.updateMatrixWorld(true);
    projection.set(0, 0, 0).project(camera);
    const groundY = (1 - projection.y) * 0.5 * stage.clientHeight;
    projection.set(0, 2.72, 0).project(camera);
    const labelY = (1 - projection.y) * 0.5 * stage.clientHeight;
    const screenX = (left / 100) * stage.clientWidth + width / 2;
    const screenY = (top / 100) * stage.clientHeight + groundY - labelY;
    screenNdc.set((screenX / stage.clientWidth) * 2 - 1, 1 - (screenY / stage.clientHeight) * 2);
    raycaster.setFromCamera(screenNdc, camera);
    return raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3())
      || new THREE.Vector3((left - 50) * 0.132 * worldScaleX, 0, (top - 50) * 0.17);
  }

  function addParticipant(node) {
    const id = node.dataset.id;
    if (!id || rigs.has(id)) return;
    const rig = createAstronaut(id, node.dataset.gender, avatarLayer, shared);
    rig.node = node;
    rig.id = id;
    rig.lastLeft = NaN;
    rig.lastTop = NaN;
    rig.action = 'idle';
    rig.actionStarted = performance.now();
    rig.exitStarted = 0;
    rig.removed = false;
    rigs.set(id, rig);
    syncParticipant(node, rig);
  }

  function readPercent(value, fallback) {
    const parsed = Number.parseFloat(String(value || ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function syncParticipant(node, rig) {
    if (!node || !rig) return;
    const left = readPercent(node.dataset.sceneLeft, readPercent(node.style.left, 50));
    const top = readPercent(node.dataset.sceneTop, readPercent(node.style.top, 68));
    if (left !== rig.lastLeft || top !== rig.lastTop) {
      const point = worldPosition(left, top, node);
      rig.root.position.x = point.x;
      rig.root.position.z = point.z;
      rig.lastLeft = left;
      rig.lastTop = top;
    }
    if (rig.gender !== node.dataset.gender) {
      rig.gender = node.dataset.gender;
      rig.suit.material = materialForSuit(rig.gender, rig.color, shared);
    }
    if (node.classList.contains('is-exiting') && !rig.exitStarted) {
      rig.exitStarted = performance.now();
      rig.exitFrom.copy(rig.root.position);
    }
  }

  function syncAll() {
    if (disposed) return;
    const activeNodes = new Set();
    participantLayer.querySelectorAll(PARTICIPANT_SELECTOR).forEach((node) => {
      const id = node.dataset.id;
      if (!id) return;
      activeNodes.add(id);
      if (!rigs.has(id)) addParticipant(node);
      const rig = rigs.get(id);
      if (rig) syncParticipant(node, rig);
    });
    rigs.forEach((rig, id) => {
      if (!activeNodes.has(id)) removeRig(rig);
    });
  }

  function removeRig(rig) {
    if (!rig || rig.removed) return;
    rig.removed = true;
    rigs.delete(rig.id);
    avatarLayer.remove(rig.root);
  }

  function resize() {
    if (disposed) return;
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    const aspect = w / h;
    const viewHeight = Math.max(10.8, Math.min(18.5, 14.2 - (aspect - 1) * 2));
    const viewWidth = viewHeight * aspect;
    camera.left = -viewWidth / 2;
    camera.right = viewWidth / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    worldScaleX = Math.min(2.1, Math.max(0.55, (viewWidth - 1.2) / 12.8));
    world.scale.x = worldScaleX;
    camera.updateMatrixWorld(true);
    rigs.forEach((rig) => { rig.lastLeft = NaN; rig.lastTop = NaN; });
    syncAll();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    renderer.setSize(w, h, false);
  }

  function syncFocus() {
    let focused = null;
    rigs.forEach((rig) => {
      if (!focused && rig.node?.classList.contains('is-focused')) focused = rig;
    });
    if (focused) {
      focused.root.getWorldPosition(focusWorld);
      targetFocus.set(focusWorld.x, 0.7, focusWorld.z);
      desiredZoom = window.innerWidth < 760 ? 1.18 : 1.3;
    } else {
      targetFocus.set(0, 0.55, 0);
      desiredZoom = 1;
    }
  }

  function updateRig(rig, now) {
    const node = rig.node;
    if (!node?.isConnected) return;
    let action = 'idle';
    for (const [className, value] of ACTION_CLASSES) {
      if (node.classList.contains(className)) { action = value; break; }
    }
    if (action === 'idle' && node.classList.contains('is-walking')) action = 'walk';
    if (action === 'idle' && node.classList.contains('zone-stage')) action = 'stage';
    if (action === 'idle' && node.classList.contains('zone-coffee')) action = 'coffee';
    if (action !== rig.action) {
      rig.action = action;
      rig.actionStarted = now;
    }

    const t = (now - rig.actionStarted) / 1000;
    const wave = Math.sin(t * (action === 'run' ? 12 : 4.3));
    rig.body.position.y = action === 'zero' ? 0.28 + Math.abs(wave) * 0.65 : 0.03 + Math.sin(t * 3.1 + rig.phase) * 0.035;
    rig.body.rotation.z = 0;
    rig.body.rotation.y = Math.sin(t * 1.8 + rig.phase) * 0.035;
    rig.leftArm.rotation.z = 0.05;
    rig.rightArm.rotation.z = -0.05;
    rig.leftLeg.rotation.x = 0;
    rig.rightLeg.rotation.x = 0;
    rig.root.rotation.y = rig.facing;

    if (action === 'walk' || action === 'run') {
      const speed = action === 'run' ? 14 : 7;
      rig.leftLeg.rotation.x = Math.sin(t * speed) * 0.42;
      rig.rightLeg.rotation.x = -Math.sin(t * speed) * 0.42;
      rig.leftArm.rotation.x = -Math.sin(t * speed) * 0.32;
      rig.rightArm.rotation.x = Math.sin(t * speed) * 0.32;
    } else if (action === 'cheer' || action === 'solo') {
      rig.leftArm.rotation.z = 2.55 + Math.sin(t * 9) * 0.14;
      rig.rightArm.rotation.z = -2.55 - Math.sin(t * 9) * 0.14;
      rig.body.position.y += Math.abs(Math.sin(t * 8)) * 0.22;
    } else if (action === 'dance' || action === 'stage') {
      rig.leftArm.rotation.z = 0.55 + Math.sin(t * 5) * 0.65;
      rig.rightArm.rotation.z = -0.55 - Math.sin(t * 5 + 1.2) * 0.65;
      rig.leftLeg.rotation.x = Math.sin(t * 5) * 0.2;
      rig.rightLeg.rotation.x = -Math.sin(t * 5) * 0.2;
      rig.body.rotation.z = Math.sin(t * 5) * 0.12;
    } else if (action === 'flip') {
      rig.body.rotation.z = Math.sin(t * 6) * 1.1;
      rig.body.position.y += Math.abs(Math.sin(t * 6)) * 0.52;
    } else if (action === 'comedy' || action === 'chaos') {
      rig.body.rotation.z = Math.sin(t * 11) * 0.38;
      rig.leftArm.rotation.z = 0.4 + Math.sin(t * 10) * 0.7;
      rig.rightArm.rotation.z = -0.4 - Math.sin(t * 9 + 1) * 0.7;
    } else if (action === 'zero') {
      rig.body.rotation.z = Math.sin(t * 2.4) * 0.13;
      rig.leftArm.rotation.z = 1.2 + Math.sin(t * 2.2) * 0.3;
      rig.rightArm.rotation.z = -1.2 - Math.sin(t * 2.2) * 0.3;
    } else if (action === 'coffee') {
      rig.rightArm.rotation.z = -0.9 + Math.sin(t * 3.5) * 0.22;
      rig.body.rotation.z = Math.sin(t * 2) * 0.06;
    }

    if (rig.exitStarted) {
      const progress = Math.min(1, (now - rig.exitStarted) / 950);
      rig.root.position.lerpVectors(rig.exitFrom, new THREE.Vector3(4.75, 0, -5.75), progress);
      rig.root.scale.setScalar(1 - progress * 0.36);
    }
  }

  function layoutNameplate(rig) {
    const node = rig.node;
    if (!node?.isConnected) return;
    rig.root.getWorldPosition(focusWorld);
    projection.set(focusWorld.x, 2.72, focusWorld.z).project(camera);
    const px = (projection.x * 0.5 + 0.5) * stage.clientWidth;
    const py = (-projection.y * 0.5 + 0.5) * stage.clientHeight;
    if (node.classList.contains('is-dragging')) return;
    const left = px - (node.offsetWidth || 108) / 2;
    const oldLeft = Number.parseFloat(node.style.left);
    const oldTop = Number.parseFloat(node.style.top);
    if (!node.style.left.endsWith('px') || !Number.isFinite(oldLeft) || Math.abs(oldLeft - left) > 0.5) {
      node.style.left = `${left.toFixed(1)}px`;
    }
    if (!node.style.top.endsWith('px') || !Number.isFinite(oldTop) || Math.abs(oldTop - py) > 0.5) {
      node.style.top = `${py.toFixed(1)}px`;
    }
  }

  function render(now) {
    if (disposed) return;
    frameHandle = window.requestAnimationFrame(render);
    if (document.hidden || now - previousFrame < FRAME_INTERVAL) return;
    previousFrame = now;
    syncFocus();
    currentFocus.lerp(targetFocus, 0.075);
    currentZoom += (desiredZoom - currentZoom) * 0.075;
    camera.position.set(currentFocus.x, currentFocus.y + 14, currentFocus.z + 16);
    camera.lookAt(currentFocus);
    camera.zoom = currentZoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    rigs.forEach((rig) => {
      updateRig(rig, now);
      layoutNameplate(rig);
      if (rig.exitStarted && now - rig.exitStarted > 1050) removeRig(rig);
    });
    renderer.render(scene, camera);
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'childList') {
        record.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && node.matches?.(PARTICIPANT_SELECTOR)) addParticipant(node);
        });
      } else if (record.type === 'attributes') {
        const node = record.target;
        const rig = rigs.get(node.dataset?.id);
        if (rig && node.matches?.(PARTICIPANT_SELECTOR)) syncParticipant(node, rig);
      }
    }
    syncAll();
  });
  observer.observe(participantLayer, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-gender', 'data-scene-left', 'data-scene-top'] });

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  document.addEventListener('visibilitychange', onVisibilityChange);
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  window.addEventListener('pagehide', cleanup, { once: true });

  function onVisibilityChange() {
    if (!document.hidden && !frameHandle) frameHandle = window.requestAnimationFrame(render);
  }
  function onContextLost(event) {
    event.preventDefault();
    stage.classList.remove('has-3d-scene');
    canvas.remove();
    cleanup();
  }
  function cleanup() {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', cleanup);
    if (frameHandle) window.cancelAnimationFrame(frameHandle);
    renderer.dispose();
    scene.traverse((object) => {
      if (object.isMesh || object.isPoints) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material.dispose();
      }
    });
  }

  resize();
  syncAll();
  frameHandle = window.requestAnimationFrame(render);
}

function createSharedResources() {
  const geometries = {
    box: new THREE.BoxGeometry(0.5, 0.5, 0.5),
    capsule: new THREE.CapsuleGeometry(0.22, 0.42, 3, 7),
    helmet: new THREE.SphereGeometry(0.44, 12, 9),
    visor: new THREE.SphereGeometry(0.33, 12, 9),
    smallSphere: new THREE.SphereGeometry(0.13, 8, 6),
    shadow: new THREE.CircleGeometry(0.53, 16),
    boot: new THREE.BoxGeometry(0.38, 0.22, 0.48)
  };
  const materials = {
    trim: new THREE.MeshStandardMaterial({ color: 0xeaf2f7, roughness: 0.48, metalness: 0.12 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1a4058, emissive: 0x102b3d, roughness: 0.2, metalness: 0.18 }),
    backpack: new THREE.MeshStandardMaterial({ color: 0x40536c, roughness: 0.76 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xf3c86b, emissive: 0x593d15, emissiveIntensity: 0.25, roughness: 0.55 }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x020711, transparent: true, opacity: 0.27, depthWrite: false }),
    floor: new THREE.MeshStandardMaterial({ color: 0x142337, roughness: 0.88, metalness: 0.08 }),
    platform: new THREE.MeshStandardMaterial({ color: 0x21364a, roughness: 0.66, metalness: 0.17 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x66547b, roughness: 0.82 }),
    seatTrim: new THREE.MeshStandardMaterial({ color: 0x466b82, roughness: 0.74 }),
    coffee: new THREE.MeshStandardMaterial({ color: 0xb16d3d, roughness: 0.48, metalness: 0.2 }),
    coffeeDark: new THREE.MeshStandardMaterial({ color: 0x422b32, roughness: 0.68 }),
    wall: new THREE.MeshBasicMaterial({ color: 0x0c1727, side: THREE.DoubleSide }),
    ringCyan: new THREE.MeshStandardMaterial({ color: 0x67d9d2, emissive: 0x287f84, emissiveIntensity: 0.58, roughness: 0.4, metalness: 0.18 }),
    ringGold: new THREE.MeshStandardMaterial({ color: 0xe6bd70, emissive: 0x80551e, emissiveIntensity: 0.38, roughness: 0.44 }),
    pink: new THREE.MeshStandardMaterial({ color: 0xf28ab6, emissive: 0x4d203e, emissiveIntensity: 0.2, roughness: 0.48 }),
    cyan: new THREE.MeshStandardMaterial({ color: 0x6ed9dc, emissive: 0x16464a, emissiveIntensity: 0.22, roughness: 0.48 }),
    planet: new THREE.MeshStandardMaterial({ color: 0x746c9c, roughness: 0.9, metalness: 0.04 })
  };
  const suitMaterials = new Map();
  const palette = [0x52b9b5, 0x8876d9, 0xe47da6, 0xd49b50, 0x5b9ec4, 0x91ad72];
  return { geometries, materials, suitMaterials, palette };
}

function materialForSuit(gender, color, shared) {
  const key = `${gender || 'female'}-${color}`;
  if (!shared.suitMaterials.has(key)) {
    shared.suitMaterials.set(key, new THREE.MeshStandardMaterial({
      color,
      roughness: 0.65,
      metalness: 0.08,
      emissive: gender === 'female' ? 0x301322 : 0x10242c,
      emissiveIntensity: 0.16
    }));
  }
  return shared.suitMaterials.get(key);
}

function colorFromId(id, palette) {
  let hash = 17;
  for (const character of String(id)) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

function createAstronaut(id, gender, parent, shared) {
  const root = new THREE.Group();
  root.userData.participantId = id;
  parent.add(root);
  const color = colorFromId(id, shared.palette);
  const suitMaterial = materialForSuit(gender, color, shared);
  const { box, capsule, helmet, visor, smallSphere, shadow, boot } = shared.geometries;
  const { trim, glass, backpack, gold } = shared.materials;

  const groundShadow = new THREE.Mesh(shadow, shared.materials.shadow);
  groundShadow.rotation.x = -Math.PI / 2;
  groundShadow.position.y = 0.018;
  root.add(groundShadow);

  const body = new THREE.Group();
  root.add(body);
  const pack = new THREE.Mesh(box, backpack);
  pack.position.set(0, 1.15, -0.35);
  pack.scale.set(0.62, 0.84, 0.56);
  body.add(pack);

  const torso = new THREE.Mesh(capsule, suitMaterial);
  torso.position.y = 1.1;
  torso.scale.set(0.82, 0.78, 0.72);
  body.add(torso);

  const head = new THREE.Mesh(helmet, trim);
  head.position.y = 1.92;
  head.scale.set(0.78, 0.78, 0.78);
  body.add(head);
  const visorMesh = new THREE.Mesh(visor, glass);
  visorMesh.position.set(0, 1.94, 0.31);
  visorMesh.scale.set(1, 0.88, 0.45);
  body.add(visorMesh);

  const badge = new THREE.Mesh(box, gold);
  badge.position.set(0, 1.16, 0.43);
  badge.scale.set(0.25, 0.2, 0.1);
  body.add(badge);
  const badgeDot = new THREE.Mesh(smallSphere, gold);
  badgeDot.position.set(0, 1.16, 0.51);
  badgeDot.scale.setScalar(0.38);
  body.add(badgeDot);

  const armGeometry = capsule;
  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  leftArm.position.set(-0.39, 1.42, 0);
  rightArm.position.set(0.39, 1.42, 0);
  body.add(leftArm, rightArm);
  for (const arm of [leftArm, rightArm]) {
    const sleeve = new THREE.Mesh(armGeometry, trim);
    sleeve.position.y = -0.3;
    sleeve.scale.set(0.31, 0.57, 0.34);
    arm.add(sleeve);
    const glove = new THREE.Mesh(smallSphere, suitMaterial);
    glove.position.y = -0.56;
    glove.scale.set(1.7, 1.5, 1.6);
    arm.add(glove);
  }

  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  leftLeg.position.set(-0.18, 0.56, 0);
  rightLeg.position.set(0.18, 0.56, 0);
  body.add(leftLeg, rightLeg);
  for (const leg of [leftLeg, rightLeg]) {
    const shin = new THREE.Mesh(capsule, trim);
    shin.position.y = -0.2;
    shin.scale.set(0.34, 0.51, 0.37);
    leg.add(shin);
    const bootMesh = new THREE.Mesh(boot, backpack);
    bootMesh.position.set(0, -0.46, 0.07);
    leg.add(bootMesh);
  }

  return {
    id, root, body, leftArm, rightArm, leftLeg, rightLeg, torso, suit: torso,
    color, gender, node: null, phase: (id.length * 0.73) % 6,
    facing: 0, exitFrom: new THREE.Vector3(), exitStarted: 0, removed: false,
    action: 'idle', actionStarted: performance.now()
  };
}

function addLighting(scene) {
  scene.add(new THREE.HemisphereLight(0xcdeaff, 0x101726, 1.72));
  const key = new THREE.DirectionalLight(0xffead0, 2.25);
  key.position.set(-5, 12, 8);
  scene.add(key);
  const cyanFill = new THREE.PointLight(0x55d7d2, 35, 24, 2);
  cyanFill.position.set(-5, 5, -1);
  scene.add(cyanFill);
  const warmFill = new THREE.PointLight(0xffbf70, 26, 19, 2);
  warmFill.position.set(5, 4, 3);
  scene.add(warmFill);
}

function buildOrbitalCafe(environment, shared) {
  const { geometries: g, materials: m } = shared;
  const plane = new THREE.Mesh(new THREE.CircleGeometry(6.45, 56), m.floor);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.16;
  environment.add(plane);

  const foundation = new THREE.Mesh(new THREE.CylinderGeometry(6.25, 6.45, 0.34, 48), m.platform);
  foundation.position.y = -0.28;
  environment.add(foundation);
  const grid = new THREE.GridHelper(12.3, 20, 0x4e8290, 0x315064);
  grid.position.y = -0.145;
  grid.material.transparent = true;
  grid.material.opacity = 0.19;
  environment.add(grid);

  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(5.95, 0.055, 5, 64), m.ringCyan);
  outerRing.rotation.x = Math.PI / 2;
  outerRing.position.y = 0.015;
  environment.add(outerRing);

  const stageBase = new THREE.Mesh(new THREE.CylinderGeometry(2.58, 2.72, 0.2, 40), m.platform);
  stageBase.position.set(0, 0.02, 0.45);
  environment.add(stageBase);
  const stageRing = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.05, 5, 48), m.ringGold);
  stageRing.rotation.x = Math.PI / 2;
  stageRing.position.set(0, 0.14, 0.45);
  environment.add(stageRing);
  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(1.68, 0.028, 4, 40), m.ringCyan);
  innerRing.rotation.x = Math.PI / 2;
  innerRing.position.set(0, 0.15, 0.45);
  environment.add(innerRing);

  addPortal(environment, -4.65, -5.05, m.cyan, g);
  addPortal(environment, 4.65, -5.05, m.pink, g);
  addSofa(environment, -3.55, 2.55, m.seat, m.seatTrim, g.box);
  addSofa(environment, 3.15, 3.85, m.seat, m.seatTrim, g.box);
  addSofa(environment, -4.35, -0.1, m.seat, m.seatTrim, g.box);
  addCoffeeCorner(environment, shared);
  addBackdrop(environment, shared);
  addStars(environment);
}

function addPortal(environment, x, z, material, geometries) {
  const portal = new THREE.Group();
  portal.position.set(x, 0, z);
  environment.add(portal);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.09, 7, 24), material);
  arch.position.y = 1.34;
  portal.add(arch);
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(0.69, 24),
    new THREE.MeshBasicMaterial({ color: material.color, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false })
  );
  glass.position.set(0, 1.34, -0.025);
  portal.add(glass);
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x3d526a, roughness: 0.72 });
  const postGeometry = new THREE.CylinderGeometry(0.11, 0.14, 1.35, 6);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeometry, postMaterial);
    post.position.set(side * 0.82, 0.66, 0);
    portal.add(post);
  }
  const step = new THREE.Mesh(new THREE.CylinderGeometry(0.96, 1.02, 0.13, 24), new THREE.MeshStandardMaterial({ color: 0x263d50, roughness: 0.75 }));
  step.position.set(0, 0.065, 0.22);
  portal.add(step);
}

function addSofa(environment, x, z, cushionMaterial, trimMaterial, boxGeometry) {
  const sofa = new THREE.Group();
  sofa.position.set(x, 0, z);
  environment.add(sofa);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.34, 0.76), cushionMaterial);
  seat.position.y = 0.45;
  sofa.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.7, 0.23), trimMaterial);
  back.position.set(0, 0.93, -0.27);
  sofa.add(back);
  const armGeometry = new THREE.BoxGeometry(0.24, 0.58, 0.78);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeometry, trimMaterial);
    arm.position.set(side * 0.75, 0.66, 0);
    sofa.add(arm);
    const leg = new THREE.Mesh(boxGeometry, new THREE.MeshStandardMaterial({ color: 0x34485c, roughness: 0.8 }));
    leg.position.set(side * 0.6, 0.15, 0.23);
    leg.scale.set(0.3, 0.45, 0.3);
    sofa.add(leg);
  }
}

function addCoffeeCorner(environment, shared) {
  const { materials: m } = shared;
  const table = new THREE.Group();
  table.position.set(4.2, 0, 0.15);
  environment.add(table);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.87, 0.87, 0.16, 24), m.coffee);
  top.position.y = 0.62;
  table.add(top);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 0.58, 8), m.coffeeDark);
  foot.position.y = 0.29;
  table.add(foot);
  const dallahBody = new THREE.Mesh(new THREE.SphereGeometry(0.31, 10, 8), m.ringGold);
  dallahBody.position.set(-0.14, 1.03, 0.01);
  dallahBody.scale.set(0.8, 0.88, 0.8);
  table.add(dallahBody);
  const dallahNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.28, 8), m.ringGold);
  dallahNeck.position.set(-0.14, 1.31, 0.01);
  table.add(dallahNeck);
  const spout = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.35, 8), m.ringGold);
  spout.position.set(0.18, 1.16, 0.04);
  spout.rotation.z = -Math.PI / 2.35;
  table.add(spout);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.045, 5, 12), m.ringGold);
  handle.position.set(-0.41, 1.06, 0.02);
  handle.rotation.y = Math.PI / 2;
  table.add(handle);
  for (const dx of [0.37, 0.57]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.075, 0.14, 10), m.trim);
    cup.position.set(dx, 0.77, 0.14);
    table.add(cup);
  }
}

function addBackdrop(environment, shared) {
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), shared.materials.wall);
  wall.position.set(0, 3.45, -7.65);
  environment.add(wall);

  const plaqueCanvas = document.createElement('canvas');
  plaqueCanvas.width = 512;
  plaqueCanvas.height = 128;
  const context = plaqueCanvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, plaqueCanvas.width, plaqueCanvas.height);
    context.fillStyle = 'rgba(8, 18, 31, .78)';
    context.roundRect(6, 6, 500, 116, 24);
    context.fill();
    context.strokeStyle = 'rgba(103, 217, 210, .65)';
    context.lineWidth = 3;
    context.roundRect(7, 7, 498, 114, 23);
    context.stroke();
    context.direction = 'rtl';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#edf7fa';
    context.font = '800 40px Cairo, sans-serif';
    context.fillText('استراحة الفضاء', 256, 56);
    context.fillStyle = '#e6bd70';
    context.font = '700 20px Cairo, sans-serif';
    context.fillText('أهلاً بيكم في المحطة المدارية', 256, 94);
  }
  const plaqueTexture = new THREE.CanvasTexture(plaqueCanvas);
  plaqueTexture.colorSpace = THREE.SRGBColorSpace;
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 1.18), new THREE.MeshBasicMaterial({ map: plaqueTexture, transparent: true, side: THREE.DoubleSide }));
  plaque.position.set(0, 4.82, -7.56);
  environment.add(plaque);

  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), shared.materials.planet);
  moon.position.set(-5.15, 3.25, -7.1);
  moon.scale.set(1.24, 0.86, 0.6);
  environment.add(moon);
  const moonRing = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.025, 4, 32), shared.materials.ringGold);
  moonRing.position.copy(moon.position);
  moonRing.rotation.set(0.8, 0.2, -0.3);
  environment.add(moonRing);
}

function addStars(environment) {
  const positions = [];
  let seed = 9317;
  const nextRandom = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 86; i += 1) {
    positions.push((nextRandom() - 0.5) * 14, 1.4 + nextRandom() * 6.4, -7.8 + nextRandom() * 1.6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xb5e2ef, size: 0.045, sizeAttenuation: true, transparent: true, opacity: 0.74 }));
  environment.add(stars);
}
