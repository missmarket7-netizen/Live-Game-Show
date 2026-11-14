/* ═══ SPACE LOUNGE 3D V5 — ذيل المشهد (الحزمة في three-r187.bundle.js) ═══ */
var slStage = document.getElementById("loungeStage"), slLayer = document.getElementById("participantLayer");
if (slStage && slLayer && window.WebGLRenderingContext && typeof Na === "function") { try { SL4(); } catch (e) { slStage.classList.remove("has-3d"); console.warn("[lounge3d]", e); } }
else if (slStage && slLayer) { console.info("[lounge3d] الحزمة غير محملة — يبقى وضع DOM"); }
function SL4() {
  var cv = document.createElement("canvas"); cv.className = "sl3-canvas";
  var R = new Na({ canvas: cv, antialias: window.innerWidth > 700, alpha: false, powerPreference: "high-performance" });
  R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  R.outputColorSpace = Pe; R.toneMapping = Ss; R.toneMappingExposure = 1.12; R.shadowMap.enabled = false;
  slStage.insertBefore(cv, slStage.firstChild); slStage.classList.add("has-3d");
  var SC = new is(); SC.background = new Ft(0x05060d); SC.fog = new ns(0x05060d, 26, 78);
  var CAM = new Be(46, 1, .1, 140); CAM.position.set(0, 4.6, 11);
  var BPM = 100, BEAT0 = performance.now();
  function pulse(t) { var b = ((t - BEAT0) / 60000 * BPM) % 1; return (1 - b) * (1 - b); }
  SC.add(new ms(0x8fb7ff, 0x2a1c08, 1.72));
  var key = new xs(0xfff2cc, 2.25); key.position.set(-5, 12, 8); SC.add(key);
  var pc = new Fi(0x35e6f7, 35, 24, 2); pc.position.set(-5, 5, -1); SC.add(pc);
  var pp = new Fi(0xff4f9a, 26, 19, 2); pp.position.set(5, 4, 3); SC.add(pp);
  var G = { box: new je(.5, .5, .5), cap: new ds(.22, .42, 3, 7), helm: new Ln(.44, 12, 9), vis: new Ln(.33, 12, 9), sph: new Ln(.13, 8, 6), shd: new oi(.53, 16), boot: new je(.38, .22, .48) };
  var M = { trim: new ce({ color: 0xea8c37, roughness: .48, metalness: .12 }), glass: new ce({ color: 0x101418, emissive: 0x10173d, roughness: .2, metalness: .18 }), pack: new ce({ color: 0x40384c, roughness: .76 }), gold: new ce({ color: 0xf3cf5b, emissive: 0x592405, emissiveIntensity: .5, roughness: .55 }), shd: new In({ color: 0x020208, transparent: true, opacity: .27, depthWrite: false }), floor: new ce({ color: 0x0a0c18, roughness: .88, metalness: .08 }), plat: new ce({ color: 0x1b2233, roughness: .66, metalness: .3 }), wall: new In({ color: 0x070a18, side: ze }) };
  var PAL = [0xff4f9a, 0x35e6f7, 0xc8ff51, 0xffd36e, 0x9b6dff, 0x64ecad, 0xff6d88, 0x4e83ff];
  var suitCache = new Map();
  function suitMat(c, em) { var k = c + "|" + em; if (!suitCache.has(k)) suitCache.set(k, new ce({ color: c, roughness: .62, metalness: .1, emissive: c, emissiveIntensity: em })); return suitCache.get(k); }
  function hash(s) { var h = 17; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  var ringMats = [];
  function ring(rad, col, y, tube) { var m = new ce({ color: col, emissive: col, emissiveIntensity: .55, roughness: .4 }); ringMats.push(m); var t = new Lt(new gn(rad, tube || .05, 5, 64), m); t.rotation.x = Math.PI / 2; t.position.y = y; SC.add(t); }
  var fl = new Lt(new oi(10.5, 64), M.floor); fl.rotation.x = -Math.PI / 2; fl.position.y = -.16; SC.add(fl);
  var gr = new ys(21, 28, 0x4e5a80, 0x2a3350); gr.position.y = -.145; gr.material.transparent = true; gr.material.opacity = .16; SC.add(gr);
  ring(9.6, 0x35e6f7, .012); ring(6.4, 0xff4f9a, .014); ring(3.5, 0xffd36e, .016, .06);
  var stp = new Lt(new Xe(3.3, 3.5, .22, 48), M.plat); stp.position.set(0, .02, -.6); SC.add(stp);
  var srm1 = new ce({ color: 0xffd36e, emissive: 0x8a6a18, emissiveIntensity: .5, roughness: .44 }); ringMats.push(srm1);
  var sr1 = new Lt(new gn(2.75, .05, 5, 48), srm1); sr1.rotation.x = Math.PI / 2; sr1.position.set(0, .14, -.6); SC.add(sr1);
  var srm2 = new ce({ color: 0x35e6f7, emissive: 0x0b7285, emissiveIntensity: .5, roughness: .4 }); ringMats.push(srm2);
  var sr2 = new Lt(new gn(2.0, .028, 4, 40), srm2); sr2.rotation.x = Math.PI / 2; sr2.position.set(0, .15, -.6); SC.add(sr2);
  var bar = new de(); bar.position.set(7.4, 0, -1.2); bar.rotation.y = -Math.PI / 2.6; SC.add(bar);
  var bb = new Lt(new je(4.6, 1.05, .8), M.plat); bb.position.y = .52; bar.add(bb);
  var bt = new Lt(new je(4.9, .1, 1.0), M.gold); bt.position.y = 1.08; bar.add(bt);
  var rail = new Lt(new Xe(.05, .05, 4.6, 8), M.trim); rail.rotation.z = Math.PI / 2; rail.position.set(0, 1.35, .55); bar.add(rail);
  [0xff4f9a, 0x35e6f7, 0xc8ff51, 0xffd36e, 0x9b6dff].forEach(function (c, i) { var bm = new ce({ color: c, emissive: c, emissiveIntensity: .8, roughness: .2 }); ringMats.push(bm); var bo = new Lt(new Xe(.07, .09, .42, 8), bm); bo.position.set(-1.8 + i * .9, 1.32, 0); bar.add(bo); });
  var booth = new de(); booth.position.set(0, 0, -6.6); SC.add(booth);
  var dk = new Lt(new je(5.2, 1.15, 1.6), new ce({ color: 0x1a1f3a, roughness: .45, metalness: .5 })); dk.position.y = .58; booth.add(dk);
  var tr = new Lt(new je(5.4, .09, 1.7), new ce({ color: 0xc8ff51, emissive: 0x5c8a00, emissiveIntensity: .8, roughness: .3 })); tr.position.y = 1.18; booth.add(tr); ringMats.push(tr.material);
  [-2.9, 2.9].forEach(function (sx) { var sp = new Lt(new je(.9, 2.2, .8), new ce({ color: 0x11141f, roughness: .8 })); sp.position.set(sx, 1.1, -.4); booth.add(sp); var cm = new ce({ color: 0x35e6f7, emissive: 0x0b7285, emissiveIntensity: .6, roughness: .4 }); ringMats.push(cm); var co = new Lt(new oi(.32, 20), cm); co.position.set(sx, 1.5, .02); co.rotation.y = Math.PI; booth.add(co); });
  for (var pi = 0; pi < 8; pi++) { var ang = pi / 8 * Math.PI * 2; var col = new Lt(new Xe(.35, .35, 12, 8), new ce({ color: 0x11141f, roughness: .6, metalness: .5 })); col.position.set(Math.cos(ang) * 12, 6, Math.sin(ang) * 12); SC.add(col); var sm = new ce({ color: pi % 2 ? 0xff4f9a : 0x35e6f7, emissive: pi % 2 ? 0xff4f9a : 0x35e6f7, emissiveIntensity: .7, roughness: .3 }); ringMats.push(sm); var strip = new Lt(new je(.08, 11, .08), sm); strip.position.copy(col.position); SC.add(strip); }
  var wl = new Lt(new Yn(30, 14), M.wall); wl.position.set(0, 5, -13); SC.add(wl);
  (function () { var c = document.createElement("canvas"); c.width = 1024; c.height = 256; var x = c.getContext("2d"); x.fillStyle = "rgba(8,18,31,.85)"; x.roundRect(8, 8, 1008, 240, 40); x.fill(); x.strokeStyle = "rgba(103,217,210,.7)"; x.lineWidth = 5; x.roundRect(10, 10, 1004, 236, 38); x.stroke(); x.direction = "rtl"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#edf7fa"; x.font = "900 78px Cairo, sans-serif"; x.fillText("استراحة الفضاء", 512, 100); x.fillStyle = "#e6bd70"; x.font = "700 40px Cairo, sans-serif"; x.fillText("عالم التحديات · المحطة المدارية", 512, 185); var t = new cs(c); t.colorSpace = Pe; var bn = new Lt(new Yn(9.5, 2.4), new In({ map: t, transparent: true, side: ze })); bn.position.set(0, 7.4, -12.6); SC.add(bn); })();
  var pl = new Lt(new Ln(1.5, 20, 14), new ce({ color: 0x7a5cd6, roughness: .9 })); pl.position.set(-8.5, 6.5, -11); pl.scale.set(1.2, .85, .6); SC.add(pl);
  var prr = new Lt(new gn(2.0, .04, 4, 32), M.gold); prr.position.copy(pl.position); prr.rotation.set(.9, .2, -.3); SC.add(prr);
  (function () { var a = [], seed = 9317; function rnd() { seed = seed * 16807 % 2147483647; return seed / 2147483647; } for (var i = 0; i < 160; i++) a.push((rnd() - .5) * 60, 3 + rnd() * 26, -20 + rnd() * 10); var g = new Ee(); g.setAttribute("position", new Zt(a, 3)); SC.add(new os(g, new Di({ color: 0xbfd4ff, size: .07, sizeAttenuation: true, transparent: true, opacity: .8 }))); })();
  var dust = (function () { var n = 200, a = new Float32Array(n * 3); for (var i = 0; i < n; i++) { a[i * 3] = (Math.random() - .5) * 18; a[i * 3 + 1] = Math.random() * 7; a[i * 3 + 2] = (Math.random() - .5) * 18; } var g = new Ee(); g.setAttribute("position", new Zt(a, 3)); var p = new os(g, new Di({ color: 0xc8ff51, size: .05, sizeAttenuation: true, transparent: true, opacity: .5, blending: vo, depthWrite: false })); SC.add(p); return p; })();
  var beams = [], lasers = [];
  for (var bi = 0; bi < 4; bi++) { var piv = new de(); piv.position.set(bi % 2 ? 4.5 : -4.5, 8.5, bi < 2 ? -5 : 4); SC.add(piv); var bm = new In({ color: [0xff4f9a, 0x35e6f7, 0xc8ff51, 0xffd36e][bi], transparent: true, opacity: .10, blending: vo, depthWrite: false, side: ze }); var cone = new Lt(new fs(.9, 8.5, 12, 1, true), bm); cone.position.y = -4.25; cone.rotation.x = Math.PI; piv.add(cone); beams.push({ piv: piv, ph: bi * 1.7 }); }
  for (var li = 0; li < 6; li++) { var lm = new In({ color: li % 2 ? 0x35e6f7 : 0xff4f9a, transparent: true, opacity: .35, blending: vo, depthWrite: false }); var lz = new Lt(new je(.03, .03, 16), lm); lz.position.set(0, 8.8, -6.4); SC.add(lz); lasers.push({ m: lz, ph: li * 1.05 }); }
  function buildRig(id, isDJ) {
    var H = hash(id); var color = isDJ ? 0xffd36e : PAL[H % PAL.length]; var em = isDJ ? .55 : .18 + (H % 5) * .08;
    var root = new de(); SC.add(root); var body = new de(); root.add(body);
    var sh = new Lt(G.shd, M.shd); sh.rotation.x = -Math.PI / 2; sh.position.y = .018; root.add(sh);
    var pk = new Lt(G.box, M.pack); pk.position.set(0, 1.15, -.35); pk.scale.set(.62, .84, .56); body.add(pk);
    var to = new Lt(G.cap, suitMat(color, em)); to.position.y = 1.1; to.scale.set(.82, .78, .72); body.add(to);
    var hm = new Lt(G.helm, new ce({ color: 0xeaf9ff, roughness: .35, metalness: .25 })); hm.position.y = 1.92; hm.scale.setScalar(.78); body.add(hm);
    var vm = new ce({ color: 0x0a0f1c, emissive: color, emissiveIntensity: isDJ ? 1.1 : .8, roughness: .15, metalness: .4 });
    var vs = new Lt(G.vis, vm); vs.position.set(0, 1.94, .3); vs.scale.set(1, .88, .45); body.add(vs);
    var ch = new Lt(G.box, M.gold); ch.position.set(0, 1.16, .43); ch.scale.set(.24, .18, .1); body.add(ch);
    var nb = new Lt(G.sph, M.gold); nb.position.set(0, 1.16, .51); nb.scale.setScalar(.38); body.add(nb);
    var arms = [], legs = [];
    [-.39, .39].forEach(function (sx) { var s2 = new de(); s2.position.set(sx, 1.42, 0); body.add(s2); var a2 = new Lt(G.cap, M.trim); a2.position.y = -.3; a2.scale.set(.31, .57, .34); s2.add(a2); var hd = new Lt(G.sph, suitMat(color, em)); hd.position.y = -.56; hd.scale.set(1.6, 1.4, 1.5); s2.add(hd); arms.push(s2); });
    [-.18, .18].forEach(function (sx) { var s2 = new de(); s2.position.set(sx, .56, 0); body.add(s2); var l2 = new Lt(G.cap, M.trim); l2.position.y = -.2; l2.scale.set(.34, .51, .36); s2.add(l2); var b2 = new Lt(G.boot, M.pack); b2.position.set(0, -.45, .07); b2.scale.set(.76, .44, .96); s2.add(b2); legs.push(s2); });
    if (isDJ) { var hp = new Lt(new gn(.34, .05, 5, 20), new ce({ color: 0x11141f, roughness: .6 })); hp.position.set(0, 1.95, 0); hp.rotation.z = Math.PI / 2; body.add(hp); }
    return { root: root, body: body, la: arms[0], ra: arms[1], ll: legs[0], rl: legs[1], vm: vm, base: isDJ ? 1.05 : .94 + (H % 14) / 100 };
  }
  var dj = buildRig("dj-marwan", true); dj.root.position.set(0, 1.16, -6.2); dj.root.rotation.y = Math.PI;
  var djS = ["mix", "hands", "dance", "point"], djI = 0, djN = 0;
  function animDJ(t, now) {
    if (now > djN) { djN = now + 4200 + Math.random() * 3000; djI = (djI + 1) % 4; }
    var s = djS[djI], b = Math.sin(t * 4.4);
    dj.la.rotation.z = 0; dj.ra.rotation.z = 0; dj.la.rotation.x = 0; dj.ra.rotation.x = 0; dj.body.rotation.z = 0; dj.body.position.y = 0; dj.body.rotation.y = 0;
    if (s === "mix") { dj.la.rotation.x = -1.1 + b * .25; dj.ra.rotation.x = -1.1 - b * .25; dj.body.rotation.z = b * .04; }
    else if (s === "hands") { dj.la.rotation.z = 2.4 + b * .15; dj.ra.rotation.z = -2.4 - b * .15; dj.body.position.y = Math.abs(b) * .08; }
    else if (s === "dance") { dj.la.rotation.z = .8 + Math.sin(t * 6) * .7; dj.ra.rotation.z = -.8 - Math.sin(t * 6 + 1.3) * .7; dj.body.rotation.z = Math.sin(t * 6) * .1; }
    else { dj.ra.rotation.z = -1.5 + Math.sin(t * 3) * .2; dj.la.rotation.x = -.4; dj.body.rotation.y = Math.sin(t * 1.5) * .25; }
  }
  var rigs = new Map();
  var SEL = ".sl-participant, .astronaut-participant";
  function plateOf(n) { return n.querySelector(".sl-plate") || n.querySelector(".participant-nameplate") || n.firstElementChild; }
  function ensure(id) { if (rigs.has(id)) return rigs.get(id); var r = buildRig(id, false); var s = { rig: r, action: "idle", since: 0, exit: 0, from: new O(), auto: 0, autoKind: "dance", autoNext: 0, greet: 0, phase: hash(id) % 628 / 100, facing: 0, tx: 0, tz: 0 }; rigs.set(id, s); return s; }
  function drop(id) { var s = rigs.get(id); if (s) { SC.remove(s.rig.root); rigs.delete(id); } }
  var AN = ["cheer", "comedy", "dance", "run", "flip", "solo", "zero", "fly", "heart", "spin"];
  function classAct(n) { for (var i = 0; i < AN.length; i++) if (n.classList.contains("anim-" + AN[i])) return AN[i]; return null; }
  function zoneAct(n) { if (n.classList.contains("zone-bar") || n.classList.contains("zone-coffee")) return "bar"; if (n.classList.contains("zone-floor") || n.classList.contains("zone-stage")) return "dance"; return null; }
  function clampN(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function choreo(s, k, tt, P) {
    var r = s.rig, b = r.body;
    b.rotation.z = 0; b.rotation.x = 0; r.la.rotation.x = 0; r.ra.rotation.x = 0; r.ll.rotation.x = 0; r.rl.rotation.x = 0; b.position.y = .03 + P * .04;
    if (k === "dance") { r.la.rotation.z = .6 + Math.sin(tt * 5) * .7; r.ra.rotation.z = -.6 - Math.sin(tt * 5 + 1.2) * .7; r.ll.rotation.x = Math.sin(tt * 5) * .22; r.rl.rotation.x = -Math.sin(tt * 5) * .22; b.rotation.z = Math.sin(tt * 5) * .12; }
    else if (k === "cheer") { r.la.rotation.z = 2.55 + Math.sin(tt * 9) * .15; r.ra.rotation.z = -2.55 - Math.sin(tt * 9) * .15; b.position.y += Math.abs(Math.sin(tt * 8)) * .22; }
    else if (k === "comedy") { b.rotation.z = Math.sin(tt * 11) * .38; r.la.rotation.z = .5 + Math.sin(tt * 10) * .8; r.ra.rotation.z = -.5 - Math.sin(tt * 9 + 1) * .8; }
    else if (k === "run") { r.ll.rotation.x = Math.sin(tt * 13) * .45; r.rl.rotation.x = -Math.sin(tt * 13) * .45; r.la.rotation.x = -Math.sin(tt * 13) * .35; r.ra.rotation.x = Math.sin(tt * 13) * .35; }
    else if (k === "flip") { var q = Math.min(tt / 1.4, 1); b.rotation.z = q * Math.PI * 2; b.position.y += Math.sin(q * Math.PI) * 1.6; }
    else if (k === "solo") { r.root.rotation.y += .07; r.la.rotation.z = 1.3 + Math.sin(tt * 7) * .5; r.ra.rotation.z = -1.3 - Math.sin(tt * 7 + 2) * .5; }
    else if (k === "zero") { b.position.y = .5 + Math.abs(Math.sin(tt * 2.2)) * .9; b.rotation.z = Math.sin(tt * 2.2) * .15; r.la.rotation.z = 1.2 + Math.sin(tt * 2) * .3; r.ra.rotation.z = -1.2 - Math.sin(tt * 2) * .3; }
    else if (k === "fly") { b.position.y = 2.2 + Math.sin(tt * 1.8) * .8; r.la.rotation.z = 1.9; r.ra.rotation.z = -1.9; b.rotation.x = .18; }
    else if (k === "heart") { r.la.rotation.z = 1.95 + Math.sin(tt * 6) * .1; r.ra.rotation.z = -1.95 - Math.sin(tt * 6) * .1; }
    else if (k === "spin") { r.root.rotation.y += .15; }
    else if (k === "walk") { r.ll.rotation.x = Math.sin(tt * 7) * .4; r.rl.rotation.x = -Math.sin(tt * 7) * .4; r.la.rotation.x = -Math.sin(tt * 7) * .3; r.ra.rotation.x = Math.sin(tt * 7) * .3; }
    else if (k === "bar") { r.ra.rotation.z = -.95 + Math.sin(tt * 3.2) * .18; b.rotation.z = Math.sin(tt * 2) * .05; }
    else { b.position.y = .03 + P * .05; r.la.rotation.z = .06 + Math.sin(tt * 4.3 + s.phase) * .12; r.ra.rotation.z = -.06 - Math.sin(tt * 4.3 + s.phase) * .12; b.rotation.y = Math.sin(tt * .8 + s.phase) * .07; }
  }
  var mode = "sweep", focusId = null, focusUntil = 0, shakeP = 0;
  var look = new O(0, 1.2, -1.2), lookT = new O(0, 1.2, -1.2), posT = new O(0, 4.6, 11);
  window.SpaceLounge3D = {
    focus: function (id, ms) { focusId = id; focusUntil = performance.now() + (ms || 4000); },
    shake: function (p) { shakeP = Math.max(shakeP, p || .5); },
    setMode: function (m) { mode = m; },
    resetBeat: function () { BEAT0 = performance.now(); },
    count: function () { return rigs.size; }
  };
  window.SpaceLounge3DReady = true;
  var bubbles = [], tmpV = new O();
  function bubble(x, z) { var c = document.createElement("canvas"); c.width = c.height = 64; var cx = c.getContext("2d"); cx.font = "44px sans-serif"; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.fillText(["👋", "😂", "✦", "☕"][Math.floor(Math.random() * 4)], 32, 34); var t = new cs(c); t.colorSpace = Pe; var m = new Lt(new Yn(.9, .9), new In({ map: t, transparent: true, side: ze, depthWrite: false })); m.position.set(x, 2.6, z); SC.add(m); bubbles.push({ m: m, until: performance.now() + 1500 }); }
  var last = 0, raf = 0, dead = false, FRAME = 1000 / 30, nextGreet = 0;
  function frame(now) {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden || now - last < FRAME) return;
    last = now;
    var t = now / 1000, P = pulse(now);
    var nodes = slLayer.querySelectorAll(SEL);
    var cs = clampN(1 - Math.max(0, nodes.length - 8) * .011, .55, 1);
    var seen = {};
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i], id = node.dataset.id;
      if (!id) continue;
      seen[id] = 1;
      var s = ensure(id);
      var left = parseFloat(node.dataset.sceneLeft || "50"), top = parseFloat(node.dataset.sceneTop || "60");
      s.tx = clampN((left - 50) * .165, -9, 9); s.tz = clampN((top - 55) * .16 - 1, -7.5, 6.5);
      if (node.classList.contains("is-exiting")) {
        if (!s.exit) { s.exit = now; s.from.copy(s.rig.root.position); }
        var k2 = Math.min(1, (now - s.exit) / 1000);
        s.rig.root.position.lerpVectors(s.from, new O(8.5, 0, -8), k2);
        s.rig.root.scale.setScalar(Math.max(.05, 1 - k2 * .5) * s.rig.base * cs);
        choreo(s, "walk", t * 2, P);
        continue;
      }
      var dx = s.tx - s.rig.root.position.x, dz = s.tz - s.rig.root.position.z, dist = Math.sqrt(dx * dx + dz * dz);
      var act = classAct(node);
      if (!act && now < s.auto) act = s.autoKind;
      if (!act && node.classList.contains("is-walking")) act = "walk";
      if (!act) act = zoneAct(node);
      if (!act) { if (!s.autoNext || now > s.autoNext) { s.autoNext = now + 7000 + Math.random() * 9000; s.autoKind = AN[Math.floor(Math.random() * 7)]; s.auto = now + 2400 + Math.random() * 2000; } act = "idle"; }
      if (act !== s.action) { s.action = act; s.since = now; }
      var tt = (now - s.since) / 1000;
      if (dist > .18 && act !== "zero" && act !== "fly" && act !== "flip" && act !== "spin") { var sp = Math.min(dist, 1.5 * .033); s.rig.root.position.x += dx / dist * sp; s.rig.root.position.z += dz / dist * sp; s.facing = Math.atan2(dx, dz); }
      if (act !== "spin" && act !== "solo") s.rig.root.rotation.y = s.facing;
      choreo(s, act, tt, P);
      s.rig.root.scale.setScalar(s.rig.base * cs);
      s.rig.vm.emissiveIntensity = .7 + P * .5;
      var plate = plateOf(node);
      if (plate && !node.classList.contains("is-dragging")) {
        tmpV.set(s.rig.root.position.x, 2.45 * s.rig.root.scale.y, s.rig.root.position.z).project(CAM);
        if (tmpV.z < 1) {
          var px = (tmpV.x * .5 + .5) * slStage.clientWidth, py = (-tmpV.y * .5 + .5) * slStage.clientHeight;
          var d = CAM.position.distanceTo(s.rig.root.position);
          node.style.left = px.toFixed(1) + "px"; node.style.top = py.toFixed(1) + "px";
          node.style.zIndex = String(Math.max(1, Math.round(1200 - d * 12)));
          plate.style.setProperty("--pscale", clampN(1.3 - d / 26, .68, 1.12).toFixed(2));
          plate.style.setProperty("--popa", clampN(1.45 - d / 24, .4, 1).toFixed(2));
        }
      }
    }
    rigs.forEach(function (s, id) { if (!seen[id]) drop(id); });
    if (now > nextGreet) {
      nextGreet = now + 3600;
      var arr = [];
      rigs.forEach(function (s, id) { if (!s.exit && s.action === "idle" && now > (s.greet || 0)) arr.push([id, s]); });
      if (arr.length > 1) {
        var a = arr[Math.floor(Math.random() * arr.length)], b2 = null, bd = 2.6;
        for (var j = 0; j < arr.length; j++) { if (arr[j] === a) continue; var d2 = a[1].rig.root.position.distanceTo(arr[j][1].rig.root.position); if (d2 < bd) { bd = d2; b2 = arr[j]; } }
        if (b2) {
          a[1].greet = b2[1].greet = now + 3000; a[1].auto = b2[1].auto = now + 3000; a[1].autoKind = b2[1].autoKind = "cheer";
          a[1].facing = Math.atan2(b2[1].rig.root.position.x - a[1].rig.root.position.x, b2[1].rig.root.position.z - a[1].rig.root.position.z);
          b2[1].facing = Math.atan2(a[1].rig.root.position.x - b2[1].rig.root.position.x, a[1].rig.root.position.z - b2[1].rig.root.position.z);
          bubble((a[1].rig.root.position.x + b2[1].rig.root.position.x) / 2, (a[1].rig.root.position.z + b2[1].rig.root.position.z) / 2);
        }
      }
    }
    animDJ(t, now);
    for (var ri = 0; ri < ringMats.length; ri++) ringMats[ri].emissiveIntensity = .45 + P * .55;
    for (var bI = 0; bI < beams.length; bI++) { beams[bI].piv.rotation.y = Math.sin(t * .5 + beams[bI].ph) * .9; beams[bI].piv.rotation.z = Math.sin(t * .33 + beams[bI].ph) * .35; }
    for (var lI = 0; lI < lasers.length; lI++) { lasers[lI].m.rotation.y = t * .6 + lasers[lI].ph; lasers[lI].m.rotation.x = Math.sin(t * .8 + lasers[lI].ph) * .35; }
    dust.rotation.y = t * .02; dust.position.y = (t * .12) % 2;
    for (var bu = bubbles.length - 1; bu >= 0; bu--) { bubbles[bu].m.position.y += .012; if (now > bubbles[bu].until) { SC.remove(bubbles[bu].m); bubbles.splice(bu, 1); } }
    if (focusId && now < focusUntil && rigs.has(focusId)) {
      var fr = rigs.get(focusId).rig.root.position;
      var dir = new O(fr.x, 0, fr.z); if (dir.lengthSq() < .01) dir.set(0, 0, 1); dir.normalize();
      posT.set(fr.x + dir.x * 2.4 + 1.2, 2.1, fr.z + dir.z * 2.4 + 3.2); lookT.set(fr.x, 1.25, fr.z);
    } else {
      focusId = null;
      if (mode === "sweep") { posT.set(Math.sin(t * .07) * 7.2, 4.4 + Math.sin(t * .05) * .5, 10.6 + Math.cos(t * .07) * 1.2); lookT.set(0, 1.2, -1.2); }
      else if (mode === "orbit") { posT.set(Math.sin(t * .06) * 11.5, 5.2, Math.cos(t * .06) * 11.5); lookT.set(0, 1.1, -1); }
      else { posT.set(0, 3.4, 12.8); lookT.set(0, 1.4, -2); }
    }
    if (shakeP > .01) { shakeP *= .9; posT.x += (Math.random() - .5) * shakeP * .5; posT.y += (Math.random() - .5) * shakeP * .35; }
    CAM.position.lerp(posT, .055); look.lerp(lookT, .075); CAM.lookAt(look);
    CAM.fov = 46 - P * 1.2; CAM.updateProjectionMatrix();
    R.render(SC, CAM);
  }
  function resize() { var w = Math.max(1, slStage.clientWidth), h = Math.max(1, slStage.clientHeight); CAM.aspect = w / h; CAM.updateProjectionMatrix(); R.setSize(w, h, false); R.setPixelRatio(Math.min(window.devicePixelRatio || 1, rigs.size > 24 ? 1.1 : 1.5)); }
  window.addEventListener("resize", resize);
  cv.addEventListener("webglcontextlost", function (e) { e.preventDefault(); dead = true; cv.remove(); });
  window.addEventListener("pagehide", function () { if (dead) return; dead = true; cancelAnimationFrame(raf); R.dispose(); SC.traverse(function (o) { if (o.isMesh || o.isPoints) { o.geometry.dispose(); if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); }); else o.material.dispose(); } }); }, { once: true });
  resize();
  raf = requestAnimationFrame(frame);
}
