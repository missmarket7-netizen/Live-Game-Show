import * as THREE from 'three';

const stage = document.getElementById('loungeStage');
const layer = document.getElementById('participantLayer');
const participantSelector = '.sl-participant, .astronaut-participant';
const FRAME = 1000 / 30;

if (stage && layer && window.WebGLRenderingContext) {
  try { startCinematicScene(); } catch (error) {
    stage.classList.remove('has-3d');
    document.querySelector('.sl3-canvas')?.remove();
    console.warn('[Space Lounge] WebGL fallback enabled.', error);
  }
}

function startCinematicScene() {
  const canvas = document.createElement('canvas');
  canvas.className = 'sl3-canvas';
  canvas.setAttribute('aria-label', 'المشهد السينمائي لاستراحة الفضاء');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: innerWidth > 620, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.35));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = false;
  stage.prepend(canvas);
  stage.classList.add('has-3d');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080a18);
  scene.fog = new THREE.Fog(0x080a18, 24, 58);
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 100);
  camera.position.set(0, 8.5, 17);
  const look = new THREE.Vector3(0, 1.2, -1);
  const targetLook = look.clone();
  const targetCamera = camera.position.clone();
  const world = new THREE.Group();
  const avatarLayer = new THREE.Group();
  scene.add(world, avatarLayer);

  const palette = [0xff4f9a, 0x35e6f7, 0xc8ff51, 0xffd36e, 0x9b6dff, 0x64ecad, 0xff6d88, 0x4e83ff];
  const shared = createResources();
  addLights(scene);
  buildWorld(world, shared);
  const dj = buildAvatar('dj-host', true, avatarLayer, shared);
  dj.root.position.set(0, .05, -5.9);
  dj.root.scale.setScalar(1.48);
  dj.root.rotation.y = Math.PI;

  const rigs = new Map();
  const focus = { id: null, until: 0, shake: 0, mode: 'sweep' };
  let previous = 0;
  let raf = 0;
  let disposed = false;
  let djBeat = 0;
  let djMove = 0;

  window.SpaceLounge3D = {
    focus(id, duration) { focus.id = id; focus.until = performance.now() + (duration || 4200); },
    shake(amount = .5) { focus.shake = Math.max(focus.shake, amount); },
    setMode(mode) { focus.mode = mode; },
    count() { return rigs.size; }
  };

  function syncParticipant(node, now) {
    const id = node.dataset.id;
    if (!id) return;
    let state = rigs.get(id);
    if (!state) {
      state = { rig: buildAvatar(id, false, avatarLayer, shared), action: 'idle', since: now, phase: hash(id) % 6.28, x: 0, z: 0, facing: 0, exit: 0, from: new THREE.Vector3() };
      rigs.set(id, state);
    }
    const left = Number.parseFloat(node.dataset.sceneLeft || '50');
    const top = Number.parseFloat(node.dataset.sceneTop || '55');
    state.tx = THREE.MathUtils.clamp((left - 50) * .235, -10.5, 10.5);
    state.tz = THREE.MathUtils.clamp((top - 50) * .19 - 1.2, -8.8, 7.4);
    if (node.classList.contains('is-exiting') && !state.exit) { state.exit = now; state.from.copy(state.rig.root.position); }
    const action = actionFor(node, state, now);
    if (action !== state.action) { state.action = action; state.since = now; }
    state.node = node;
  }

  function actionFor(node, state, now) {
    const actions = ['cheer', 'comedy', 'dance', 'run', 'flip', 'solo', 'zero', 'fly', 'heart', 'spin'];
    for (const action of actions) if (node.classList.contains(`anim-${action}`)) return action;
    if (node.classList.contains('is-walking')) return 'walk';
    if (node.classList.contains('zone-floor')) return 'dance';
    if (node.classList.contains('zone-bar')) return 'lounge';
    if (now > (state.autoUntil || 0)) {
      state.autoUntil = now + 1400 + Math.random() * 2400;
      state.autoAction = ['idle', 'idle', 'dance', 'cheer'][Math.floor(Math.random() * 4)];
    }
    return state.autoAction || 'idle';
  }

  function frame(now) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden || now - previous < FRAME) return;
    previous = now;
    const nodes = [...layer.querySelectorAll(participantSelector)];
    const seen = new Set();
    const crowdScale = THREE.MathUtils.clamp(1 - Math.max(0, nodes.length - 8) * .011, .54, 1);
    nodes.forEach((node) => { syncParticipant(node, now); seen.add(node.dataset.id); });
    for (const [id, state] of rigs) if (!seen.has(id)) { avatarLayer.remove(state.rig.root); rigs.delete(id); }

    for (const state of rigs.values()) {
      const { rig } = state;
      if (state.exit) {
        const progress = Math.min(1, (now - state.exit) / 1000);
        rig.root.position.lerpVectors(state.from, new THREE.Vector3(10, 0, -9), progress);
        rig.root.scale.setScalar(Math.max(.05, 1 - progress * .7) * crowdScale);
        if (progress >= 1) avatarLayer.remove(rig.root);
        continue;
      }
      const dx = state.tx - rig.root.position.x;
      const dz = state.tz - rig.root.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > .08 && !['zero', 'fly', 'flip', 'spin'].includes(state.action)) {
        const speed = state.action === 'run' ? .12 : .045;
        rig.root.position.x += dx / distance * Math.min(distance, speed);
        rig.root.position.z += dz / distance * Math.min(distance, speed);
        state.facing = Math.atan2(dx, dz);
      }
      rig.root.rotation.y += (state.facing - rig.root.rotation.y) * .16;
      rig.root.scale.setScalar(rig.base * crowdScale);
      choreograph(state, (now - state.since) / 1000);
      projectPlate(state, now);
    }

    animateDJ(dj, now);
    updateCamera(now);
    renderer.render(scene, camera);
  }

  function projectPlate(state, now) {
    const plate = state.node?.querySelector('.sl-plate');
    if (!plate || state.node.classList.contains('is-dragging')) return;
    const projected = state.rig.root.position.clone().add(new THREE.Vector3(0, 2.2 * state.rig.base, 0)).project(camera);
    if (projected.z >= 1) return;
    state.node.style.left = `${((projected.x * .5 + .5) * stage.clientWidth).toFixed(1)}px`;
    state.node.style.top = `${((-projected.y * .5 + .5) * stage.clientHeight).toFixed(1)}px`;
    const distance = camera.position.distanceTo(state.rig.root.position);
    plate.style.setProperty('--pscale', THREE.MathUtils.clamp(1.28 - distance / 31, .68, 1.08).toFixed(2));
    plate.style.setProperty('--popa', THREE.MathUtils.clamp(1.42 - distance / 30, .45, 1).toFixed(2));
    state.node.style.zIndex = String(Math.max(1, Math.round(1200 - distance * 12)));
  }

  function choreograph(state, t) {
    const { rig } = state;
    const b = rig.body;
    b.rotation.set(0, 0, 0);
    rig.leftArm.rotation.set(0, 0, .06); rig.rightArm.rotation.set(0, 0, -.06);
    rig.leftLeg.rotation.x = 0; rig.rightLeg.rotation.x = 0;
    const beat = Math.sin(t * 5 + state.phase);
    if (state.action === 'dance') { rig.leftArm.rotation.z = .7 + beat * .65; rig.rightArm.rotation.z = -.7 - beat * .65; rig.leftLeg.rotation.x = beat * .22; rig.rightLeg.rotation.x = -beat * .22; b.rotation.z = beat * .11; b.position.y = Math.abs(beat) * .08; }
    else if (state.action === 'cheer' || state.action === 'solo') { rig.leftArm.rotation.z = 2.55 + beat * .15; rig.rightArm.rotation.z = -2.55 - beat * .15; b.position.y = Math.abs(Math.sin(t * 8)) * .18; }
    else if (state.action === 'comedy') { b.rotation.z = Math.sin(t * 11) * .38; rig.leftArm.rotation.z = .5 + Math.sin(t * 10) * .8; rig.rightArm.rotation.z = -.5 - Math.sin(t * 9) * .8; }
    else if (state.action === 'run' || state.action === 'walk') { const speed = state.action === 'run' ? 13 : 7; rig.leftLeg.rotation.x = Math.sin(t * speed) * .45; rig.rightLeg.rotation.x = -Math.sin(t * speed) * .45; rig.leftArm.rotation.x = -Math.sin(t * speed) * .34; rig.rightArm.rotation.x = Math.sin(t * speed) * .34; }
    else if (state.action === 'flip') { const q = Math.min(t / 1.2, 1); b.rotation.z = q * Math.PI * 2; b.position.y = Math.sin(q * Math.PI) * 1.35; }
    else if (state.action === 'zero') { b.position.y = .55 + Math.abs(Math.sin(t * 2.2)) * .85; b.rotation.z = Math.sin(t * 2.2) * .15; rig.leftArm.rotation.z = 1.2; rig.rightArm.rotation.z = -1.2; }
    else if (state.action === 'fly') { b.position.y = 2.1 + Math.sin(t * 1.8) * .7; rig.leftArm.rotation.z = 1.8; rig.rightArm.rotation.z = -1.8; b.rotation.x = .18; }
    else if (state.action === 'heart') { rig.leftArm.rotation.z = 1.95 + beat * .1; rig.rightArm.rotation.z = -1.95 - beat * .1; }
    else if (state.action === 'spin') b.rotation.y = t * 5;
    else if (state.action === 'lounge') { rig.rightArm.rotation.z = -.9 + Math.sin(t * 3) * .18; b.rotation.z = Math.sin(t * 2) * .04; }
    else b.position.y = Math.abs(beat) * .03;
  }

  function updateCamera(now) {
    const t = now / 1000;
    let target = new THREE.Vector3(0, 1.1, -1);
    if (focus.id && now < focus.until && rigs.has(focus.id)) {
      const rig = rigs.get(focus.id).rig;
      target.copy(rig.root.position).add(new THREE.Vector3(0, 1.1, 0));
      targetCamera.copy(rig.root.position).add(new THREE.Vector3(3.5, 3.1, 5.1));
    } else if (focus.mode === 'orbit') {
      target.set(0, 1.25, -1); targetCamera.set(Math.sin(t * .08) * 15, 7.6, Math.cos(t * .08) * 15);
    } else if (focus.mode === 'front') {
      target.set(0, 1.2, -1); targetCamera.set(0, 5.8, 17.2);
    } else {
      target.set(0, 1.2, -1); targetCamera.set(Math.sin(t * .045) * 8.8, 7.4 + Math.sin(t * .03) * .5, 15.2 + Math.cos(t * .045) * 2);
    }
    if (focus.shake > .01) { targetCamera.x += (Math.random() - .5) * focus.shake; targetCamera.y += (Math.random() - .5) * focus.shake * .6; focus.shake *= .9; }
    camera.position.lerp(targetCamera, .055); targetLook.lerp(target, .08); camera.lookAt(targetLook); camera.fov += ((focus.id ? 32 : 40) - camera.fov) * .06; camera.updateProjectionMatrix();
  }

  function animateDJ(djState, now) {
    const t = now / 1000; const beat = Math.sin(t * 4.5);
    if (now > djBeat) { djBeat = now + 4200 + Math.random() * 2400; djMove = (djMove + 1) % 3; }
    const { body, leftArm, rightArm, leftLeg, rightLeg } = djState;
    body.rotation.z = 0; body.position.y = 0; leftArm.rotation.set(0, 0, 0); rightArm.rotation.set(0, 0, 0);
    if (djMove === 0) { leftArm.rotation.x = -1.0 + beat * .2; rightArm.rotation.x = -1.0 - beat * .2; }
    else if (djMove === 1) { leftArm.rotation.z = 2.3 + beat * .15; rightArm.rotation.z = -2.3 - beat * .15; body.position.y = Math.abs(beat) * .1; }
    else { leftArm.rotation.z = .8 + Math.sin(t * 6) * .65; rightArm.rotation.z = -.8 - Math.sin(t * 6 + 1.2) * .65; body.rotation.z = Math.sin(t * 6) * .1; }
    leftLeg.rotation.x = beat * .12; rightLeg.rotation.x = -beat * .12;
  }

  function resize() { const w = Math.max(1, stage.clientWidth); const h = Math.max(1, stage.clientHeight); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, rigs.size > 24 ? 1.05 : 1.35)); }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(stage);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !raf) raf = requestAnimationFrame(frame); });
  window.addEventListener('pagehide', () => { disposed = true; resizeObserver.disconnect(); cancelAnimationFrame(raf); renderer.dispose(); });
  canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); disposed = true; canvas.remove(); stage.classList.remove('has-3d'); });
  resize();
  raf = requestAnimationFrame(frame);
}

function hash(value) { let result = 17; for (const character of String(value)) result = (result * 31 + character.charCodeAt(0)) >>> 0; return result; }

function createResources() {
  const geometries = {
    capsule: new THREE.CapsuleGeometry(.22, .44, 4, 10),
    helmet: new THREE.SphereGeometry(.32, 14, 10),
    visor: new THREE.SphereGeometry(.27, 14, 10),
    arm: new THREE.CapsuleGeometry(.075, .32, 3, 8),
    leg: new THREE.CapsuleGeometry(.095, .3, 3, 8),
    boot: new THREE.BoxGeometry(.18, .1, .28),
    pack: new THREE.BoxGeometry(.34, .42, .16),
    hand: new THREE.SphereGeometry(.09, 8, 6),
    shadow: new THREE.CircleGeometry(.55, 16)
  };
  const materials = {
    white: new THREE.MeshStandardMaterial({ color: 0xf4f0e7, roughness: .42, metalness: .18 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x20233f, roughness: .68, metalness: .3 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xffd36e, emissive: 0x7d4e11, emissiveIntensity: .5, roughness: .32, metalness: .45 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x11152d, emissive: 0x102a4c, emissiveIntensity: .65, roughness: .1, metalness: .65 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x10172b, roughness: .64, metalness: .36 }),
    lounge: new THREE.MeshStandardMaterial({ color: 0x3b2855, roughness: .7, metalness: .18 }),
    loungeTrim: new THREE.MeshStandardMaterial({ color: 0x6c4e79, roughness: .5, metalness: .26 }),
    cyan: new THREE.MeshStandardMaterial({ color: 0x45e4f2, emissive: 0x0b7784, emissiveIntensity: .75, roughness: .3 }),
    pink: new THREE.MeshStandardMaterial({ color: 0xff4f9a, emissive: 0x702244, emissiveIntensity: .5, roughness: .3 }),
    lime: new THREE.MeshStandardMaterial({ color: 0xc8ff51, emissive: 0x547800, emissiveIntensity: .55, roughness: .3 })
  };
  return { geometries, materials, suit: new Map() };
}

function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xc8d9ff, 0x080914, 2.1));
  const key = new THREE.DirectionalLight(0xffe3b0, 2.2); key.position.set(-5, 13, 9); scene.add(key);
  const cyan = new THREE.PointLight(0x35e6f7, 42, 30, 2); cyan.position.set(-6, 5, -1); scene.add(cyan);
  const pink = new THREE.PointLight(0xff4f9a, 34, 27, 2); pink.position.set(7, 5, 1); scene.add(pink);
  const gold = new THREE.PointLight(0xffd36e, 32, 25, 2); gold.position.set(0, 6, -7); scene.add(gold);
}

function buildWorld(world, r) {
  const { materials: m } = r;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 72), m.floor); floor.rotation.x = -Math.PI / 2; floor.position.y = -.18; world.add(floor);
  const outer = new THREE.Mesh(new THREE.TorusGeometry(10.8, .08, 8, 96), m.cyan); outer.rotation.x = Math.PI / 2; outer.position.y = .02; world.add(outer);
  const middle = new THREE.Mesh(new THREE.TorusGeometry(7.6, .065, 8, 84), m.pink); middle.rotation.x = Math.PI / 2; middle.position.y = .03; world.add(middle);
  const stage = new THREE.Mesh(new THREE.CylinderGeometry(3.55, 3.8, .26, 64), m.dark); stage.position.set(0, .02, -.7); world.add(stage);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.08, .07, 8, 64), m.gold); ring.rotation.x = Math.PI / 2; ring.position.set(0, .19, -.7); world.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.25, .045, 8, 64), m.lime); ring2.rotation.x = Math.PI / 2; ring2.position.set(0, .21, -.7); world.add(ring2);
  buildVipLounge(world, r, -7.1, 1.8);
  buildDJDeck(world, r, 0, -7.1);
  buildBar(world, r, 8.1, -1.2);
  buildBackdrop(world, r);
  addStars(world);
}

function buildVipLounge(world, r, x, z) {
  const { materials: m } = r; const lounge = new THREE.Group(); lounge.position.set(x, 0, z); world.add(lounge);
  const platform = new THREE.Mesh(new THREE.BoxGeometry(5.1, .16, 3.2), m.lounge); platform.position.y = .08; lounge.add(platform);
  const sofa = new THREE.BoxGeometry(2.2, .42, .75);
  [-1.25, 1.25].forEach((dx) => { const seat = new THREE.Mesh(sofa, m.loungeTrim); seat.position.set(dx, .46, 0); lounge.add(seat); const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, .8, .18), m.loungeTrim); back.position.set(dx, .86, -.3); lounge.add(back); });
  const table = new THREE.Mesh(new THREE.CylinderGeometry(.72, .72, .12, 32), m.gold); table.position.set(0, .62, .1); lounge.add(table);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.74, .025, 5, 32), m.cyan); rim.rotation.x = Math.PI / 2; rim.position.set(0, .7, .1); lounge.add(rim);
}

function buildDJDeck(world, r, x, z) {
  const { materials: m } = r; const deck = new THREE.Group(); deck.position.set(x, 0, z); world.add(deck);
  const platform = new THREE.Mesh(new THREE.BoxGeometry(6.4, .24, 2.2), m.dark); platform.position.y = .2; deck.add(platform);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(6.5, .08, 2.25), m.gold); trim.position.y = .37; deck.add(trim);
  const console = new THREE.Mesh(new THREE.BoxGeometry(3.6, .52, .52), m.dark); console.position.set(0, .75, .42); deck.add(console);
  [-1.3, 0, 1.3].forEach((xPos, i) => { const knob = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .04, 16), [m.pink, m.cyan, m.lime][i]); knob.position.set(xPos, 1.04, .42); deck.add(knob); });
  const sign = textMesh('DJ عالم التحديات', '#fff1b0', '#1b1630', 5.4, 1.05); sign.position.set(0, 2.4, -.68); deck.add(sign);
}

function buildBar(world, r, x, z) {
  const { materials: m } = r; const bar = new THREE.Group(); bar.position.set(x, 0, z); world.add(bar);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3.5, .78, 1.15), m.lounge); counter.position.y = .5; bar.add(counter);
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.7, .09, 1.25), m.gold); top.position.y = .94; bar.add(top);
  for (let i = -1; i <= 1; i++) { const stool = new THREE.Mesh(new THREE.CylinderGeometry(.22, .28, .6, 12), m.cyan); stool.position.set(i * 1.05, .3, 1); bar.add(stool); }
  const sign = textMesh('ADULT LOUNGE', '#ffd36e', '#1b1630', 3.1, .62); sign.position.set(0, 1.65, -.58); bar.add(sign);
}

function buildBackdrop(world, r) {
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), new THREE.MeshBasicMaterial({ color: 0x0b0f28, side: THREE.DoubleSide })); wall.position.set(0, 5, -13); world.add(wall);
  const sign = textMesh('استراحة الفضاء', '#ffffff', '#15133a', 8.2, 1.7); sign.position.set(0, 6.2, -12.85); world.add(sign);
  const subtitle = textMesh('عالم التحديات · LIVE', '#ffd36e', '#15133a', 4.2, .7); subtitle.position.set(0, 4.95, -12.8); world.add(subtitle);
}

function textMesh(text, color, background, width, height) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256; const ctx = canvas.getContext('2d');
  ctx.fillStyle = background; ctx.globalAlpha = .88; ctx.roundRect(10, 10, 1004, 236, 28); ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.roundRect(10, 10, 1004, 236, 28); ctx.stroke(); ctx.fillStyle = color; ctx.font = '900 74px Cairo, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl'; ctx.fillText(text, 512, 132);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }));
}

function addStars(world) { const positions = []; let seed = 9127; const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; }; for (let i = 0; i < 180; i++) positions.push((random() - .5) * 32, 2 + random() * 18, -13 + random() * 8); const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); world.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xc8d8ff, size: .06, transparent: true, opacity: .82 })) ); }

function buildAvatar(id, isDJ, parent, resources) {
  const { geometries: g, materials: m } = resources; const root = new THREE.Group(); parent.add(root); const body = new THREE.Group(); root.add(body);
  const color = isDJ ? 0xffd36e : [0xff4f9a, 0x35e6f7, 0xc8ff51, 0x9b6dff, 0x64ecad][hash(id) % 5];
  const suit = resources.suit.get(color) || resources.suit.set(color, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: isDJ ? .32 : .12, roughness: .52, metalness: .18 })).get(color);
  const shadow = new THREE.Mesh(g.shadow, new THREE.MeshBasicMaterial({ color: 0x02030b, transparent: true, opacity: .3, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .02; root.add(shadow);
  const pack = new THREE.Mesh(g.pack, m.dark); pack.position.set(0, 1.08, -.27); body.add(pack);
  const torso = new THREE.Mesh(g.capsule, suit); torso.position.y = 1.05; torso.scale.set(.85, .86, .75); body.add(torso);
  const helmet = new THREE.Mesh(g.helmet, m.white); helmet.position.y = 1.82; body.add(helmet);
  const visor = new THREE.Mesh(g.visor, new THREE.MeshStandardMaterial({ color: 0x10142e, emissive: color, emissiveIntensity: .42, roughness: .12, metalness: .65 })); visor.position.set(0, 1.82, .25); visor.scale.set(1, .88, .5); body.add(visor);
  const leftArm = new THREE.Group(), rightArm = new THREE.Group(); leftArm.position.set(-.4, 1.38, 0); rightArm.position.set(.4, 1.38, 0); body.add(leftArm, rightArm);
  [leftArm, rightArm].forEach((arm) => { const limb = new THREE.Mesh(g.arm, m.white); limb.position.y = -.28; arm.add(limb); const hand = new THREE.Mesh(g.hand, suit); hand.position.y = -.54; arm.add(hand); });
  const leftLeg = new THREE.Group(), rightLeg = new THREE.Group(); leftLeg.position.set(-.19, .56, 0); rightLeg.position.set(.19, .56, 0); body.add(leftLeg, rightLeg);
  [leftLeg, rightLeg].forEach((leg) => { const limb = new THREE.Mesh(g.leg, m.white); limb.position.y = -.2; leg.add(limb); const boot = new THREE.Mesh(g.boot, m.dark); boot.position.set(0, -.46, .06); leg.add(boot); });
  if (isDJ) { const band = new THREE.Mesh(new THREE.TorusGeometry(.37, .045, 6, 24), m.gold); band.position.y = 1.84; band.rotation.x = Math.PI / 2; body.add(band); const mic = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .55, 6), m.gold); mic.position.set(.5, 1.45, .25); mic.rotation.z = -.8; body.add(mic); }
  return { root, body, leftArm, rightArm, leftLeg, rightLeg, base: isDJ ? 1.16 : 1 + (hash(id) % 12) / 100 };
}
