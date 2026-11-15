/* ═══ SPACE LOUNGE V5 — مصدر الحقيقة الوحيد: بيانات + DOM + SSE ═══ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('loungeStage'), layer = $('participantLayer'), fx = $('fxLayer');
  var countLabel = $('participantCount'), connLabel = $('loungeConnection');
  var toast = $('actionToast'), camLabel = $('cameraLabel');
  var MAX = 50, tileId = 0;
  var participants = new Map();

  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  function hashHue(id) { var h = 17; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h % 360; }

  var ZONES = { floor: [32, 68, 32, 68], bar: [74, 90, 38, 62], roam: [8, 92, 22, 84] };
  var ZONE_LABEL = { floor: 'يرقص على المسرح', bar: 'عند البار', roam: 'يتجول بالمحطة' };

  function setLogicalPosition(node, left, top) { node.dataset.sceneLeft = String(left); node.dataset.sceneTop = String(top); node.style.left = left + '%'; node.style.top = top + '%'; }
  function randomPosition(zone) { var r = ZONES[zone] || ZONES.roam; return { left: r[0] + Math.random() * (r[1] - r[0]), top: r[2] + Math.random() * (r[3] - r[2]) }; }
  function stableId(data) { return String(data.uniqueId || data.name || ('manual-' + (++tileId))).trim().toLowerCase(); }

  function showToast(text) { toast.textContent = text; toast.classList.add('is-visible'); clearTimeout(showToast.t); showToast.t = setTimeout(function () { toast.classList.remove('is-visible'); }, 2600); }

  /* ── صوت محيطي اختياري (بدون تشغيل تلقائي) ── */
  var actx = null, master = null, musicOn = false, noteIdx = 0, musicTimer = null;
  var NOTES = [196, 246.94, 293.66, 369.99, 440, 293.66];
  function playSfx(kind) {
    if (!actx || !master) return;
    var pat = { join: [330, .045, .18], step: [220, .028, .12], gift: [520, .065, .24], focus: [740, .045, .32] };
    var p = pat[kind] || pat.step;
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = kind === 'gift' || kind === 'focus' ? 'triangle' : 'sine';
    o.frequency.setValueAtTime(p[0], actx.currentTime);
    o.frequency.exponentialRampToValueAtTime(p[0] * (kind === 'join' ? 1.45 : .72), actx.currentTime + p[2]);
    g.gain.setValueAtTime(.0001, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(p[1], actx.currentTime + .025);
    g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + p[2]);
    o.connect(g).connect(master); o.start(); o.stop(actx.currentTime + p[2] + .03);
  }
  function playNote() {
    if (!musicOn || !actx) return;
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = NOTES[noteIdx++ % NOTES.length];
    g.gain.setValueAtTime(.0001, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(.035, actx.currentTime + .6);
    g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + 3.4);
    o.connect(g).connect(master); o.start(); o.stop(actx.currentTime + 3.6);
  }
  $('musicToggle').addEventListener('click', function () {
    var btn = this;
    if (!musicOn) {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      master = master || actx.createGain(); master.gain.value = .34; master.connect(actx.destination);
      musicOn = true; playNote();
      musicTimer = setInterval(playNote, 1800);
      btn.classList.add('is-on'); btn.setAttribute('aria-pressed', 'true'); btn.textContent = '♪ إيقاف';
    } else {
      musicOn = false; clearInterval(musicTimer); musicTimer = null;
      btn.classList.remove('is-on'); btn.setAttribute('aria-pressed', 'false'); btn.textContent = '♪ الموسيقى';
    }
  });

  function updateCount() {
    countLabel.textContent = participants.size + ' / ' + MAX;
    var scale = clamp(1 - Math.max(0, participants.size - 8) * .012, .52, 1).toFixed(3);
    stage.style.setProperty('--sl-scale', scale);
    participants.forEach(function (p) { if (p.node) p.node.style.setProperty('--sl-scale', scale); });
  }

  function emitFx(kind, p) {
    if (!fx || !p) return;
    while (fx.children.length > 24) fx.removeChild(fx.firstChild);
    for (var i = 0; i < 6; i++) {
      var s = document.createElement('span');
      s.className = 'fx-spark';
      s.textContent = kind === 'gift' ? '✦' : '·';
      s.style.left = p.left + '%'; s.style.top = p.top + '%';
      s.style.setProperty('--dx', (Math.cos(i / 6 * Math.PI * 2) * 26) + 'px');
      s.style.setProperty('--dy', (Math.sin(i / 6 * Math.PI * 2) * 26) + 'px');
      fx.appendChild(s);
      setTimeout(function (n) { return function () { n.remove(); }; }(s), 950);
    }
  }

  /* ── بناء عقدة المشارك: اسم + @حساب فقط (لا جنس، لا صورة) ── */
  function renderParticipant(p) {
    var node = document.createElement('div');
    node.className = 'sl-participant zone-' + p.zone;
    node.dataset.id = p.id;
    setLogicalPosition(node, p.left, p.top);
    node.innerHTML =
      '<div class="sl-plate" style="--pc:hsl(' + hashHue(p.id) + ' 90% 62%)">' +
      '<b><i></i>' + esc(p.name) + '</b>' +
      '<small>' + esc(p.uniqueId ? '@' + p.uniqueId : (p.source === 'tiktok' ? 'TikTok LIVE' : 'ضيف المحطة')) + '</small>' +
      '<em class="sl-status">' + ZONE_LABEL[p.zone] + '</em>' +
      '<span class="sl-x" title="إخراج">×</span>' +
      '</div>';
    layer.appendChild(node);
    p.node = node;
    node.querySelector('.sl-x').addEventListener('click', function (e) { e.stopPropagation(); removeParticipant(p.id); });
    bindDrag(p);
    return node;
  }

  function zoneForPoint(x, y) {
    var zones = stage.querySelectorAll('.sl-zone');
    for (var i = 0; i < zones.length; i++) {
      var r = zones[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return zones[i].dataset.zone;
    }
    return 'roam';
  }
  function applyZone(p, zone) {
    if (p.zone === zone) return;
    p.zone = zone;
    p.node.classList.remove('zone-floor', 'zone-bar', 'zone-roam');
    p.node.classList.add('zone-' + zone);
    var st = p.node.querySelector('.sl-status');
    if (st) st.textContent = ZONE_LABEL[zone];
  }

  function scheduleWander(p, delay) {
    clearTimeout(p.wanderTimer);
    p.wanderTimer = setTimeout(function () { wander(p); }, delay || (7000 + Math.random() * 7000));
  }
  function wander(p) {
    if (!participants.has(p.id)) return;
    if (p.dragging || p.busy || Date.now() < (p.holdUntil || 0)) { scheduleWander(p, 3000); return; }
    var choices = p.zone === 'floor' ? ['floor', 'roam', 'bar'] : p.zone === 'bar' ? ['bar', 'roam', 'floor'] : ['roam', 'floor', 'bar'];
    var zone = choices[Math.floor(Math.random() * choices.length)];
    var pos = randomPosition(zone);
    p.node.classList.add('is-walking');
    setLogicalPosition(p.node, pos.left, pos.top);
    p.left = pos.left; p.top = pos.top;
    applyZone(p, zone);
    setTimeout(function () { if (p.node) p.node.classList.remove('is-walking'); }, 1300);
    scheduleWander(p);
  }

  function bindDrag(p) {
    var ox = 0, oy = 0;
    var move = function (ev) {
      if (!p.dragging) return;
      var pt = ev.touches ? ev.touches[0] : ev;
      var r = stage.getBoundingClientRect();
      p.left = clamp((pt.clientX - r.left - ox) / r.width * 100, 2, 98);
      p.top = clamp((pt.clientY - r.top - oy) / r.height * 100, 8, 92);
      setLogicalPosition(p.node, p.left, p.top);
    };
    var end = function (ev) {
      if (!p.dragging) return;
      p.dragging = false; p.holdUntil = Date.now() + 20000;
      p.node.classList.remove('is-focused', 'is-dragging');
      removeEventListener('pointermove', move); removeEventListener('pointerup', end);
      var pt = ev.changedTouches ? ev.changedTouches[0] : ev;
      applyZone(p, zoneForPoint(pt.clientX, pt.clientY));
      scheduleWander(p, 20000);
    };
    p.node.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('.sl-x')) return;
      p.dragging = true; clearTimeout(p.wanderTimer);
      p.node.classList.add('is-focused', 'is-dragging');
      var r = p.node.getBoundingClientRect();
      ox = ev.clientX - r.left; oy = ev.clientY - r.top;
      addEventListener('pointermove', move); addEventListener('pointerup', end);
    });
  }

  function addParticipant(data, source) {
    if (participants.size >= MAX) { showToast('الساحة ممتلئة — الحد 50 رائدًا'); return null; }
    var id = stableId(data);
    if (participants.has(id)) {
      var ex = participants.get(id);
      if (ex.node) { ex.node.classList.add('is-focused'); setTimeout(function () { ex.node && ex.node.classList.remove('is-focused'); }, 900); }
      showToast(ex.name + ' موجود بالفعل في الساحة');
      return ex;
    }
    var zone = participants.size % 3 === 0 ? 'floor' : (participants.size % 3 === 1 ? 'roam' : 'bar');
    var pos = randomPosition(zone);
    var p = { id: id, name: data.name || data.uniqueId || 'رائد', uniqueId: data.uniqueId || '', source: source || 'manual', zone: zone, left: pos.left, top: pos.top, node: null, queue: Promise.resolve(), pending: 0, dragging: false, busy: false, holdUntil: 0 };
    participants.set(id, p);
    renderParticipant(p);
    updateCount();
    showToast(p.name + ' دخل المحطة');
    emitFx('join', p); playSfx('join');
    scheduleWander(p, 4500 + Math.random() * 5000);
    return p;
  }
  function removeParticipant(id) {
    var p = participants.get(id);
    if (!p) return;
    clearTimeout(p.wanderTimer);
    p.node.classList.add('is-exiting');
    setTimeout(function () { p.node.remove(); participants.delete(id); updateCount(); }, 1100);
  }

  /* ── الهدايا → رقصات + كاميرا سينمائية ── */
  var ACTION = {
    CHEER: ['احتفال', 'anim-cheer', 3200], COMEDY: ['حركة كوميدية', 'anim-comedy', 3600],
    DANCE: ['رقص', 'anim-dance', 4200], RUN_CHAOS: ['جري وشغب', 'anim-run', 4200],
    FLIP_DANCE: ['شقلبة', 'anim-flip', 3800], SOLO_DANCE: ['عرض منفرد', 'anim-solo', 4600],
    ZERO_GRAVITY: ['انعدام جاذبية', 'anim-zero', 6000], FLY: ['طيران', 'anim-fly', 5200]
  };
  function showCamLabel(text, ms) {
    camLabel.textContent = text;
    camLabel.classList.add('is-visible');
    clearTimeout(showCamLabel.t);
    showCamLabel.t = setTimeout(function () { camLabel.classList.remove('is-visible'); }, ms || 3600);
  }
  function runAction(data) {
    var list = Array.from(participants.values());
    if (!list.length) { showToast('وصلت هدية — أضف رائدًا أولًا'); return; }
    var p = participants.get(stableId(data)) || list[Math.floor(Math.random() * list.length)];
    var meta = ACTION[data.action] || ACTION.DANCE;
    var dur = Number(data.duration) || meta[2];
    var big = Number(data.diamonds || 0) >= 4500 || data.action === 'ZERO_GRAVITY' || data.action === 'SOLO_DANCE' || data.action === 'FLIP_DANCE';
    p.queue = p.queue.then(function () {
      return new Promise(function (resolve) {
        p.busy = true;
        applyZone(p, 'floor');
        emitFx('gift', p); playSfx('gift');
        if (window.SpaceLounge3D) {
          window.SpaceLounge3D.focus(p.id, dur);
          if (big) window.SpaceLounge3D.shake(1);
        }
        showCamLabel('🎯 ' + p.name + ' · ' + meta[0], dur);
        p.node.classList.add(meta[1], 'is-focused');
        showToast(p.name + ' · ' + meta[0] + (data.gift ? ' · ' + data.gift : ''));
        setTimeout(function () {
          p.node.classList.remove(meta[1], 'is-focused');
          p.busy = false; scheduleWander(p, 4500); resolve();
        }, dur);
      });
    });
  }
  function groupAction(kind) {
    var cls = kind === 'zero' ? 'anim-zero' : kind === 'fly' ? 'anim-fly' : 'anim-dance';
    var label = kind === 'zero' ? '🪽 انعدام جاذبية جماعي!' : kind === 'fly' ? '🚀 عاصفة طيران!' : '💃 رقصة جماعية على المسرح!';
    participants.forEach(function (p) {
      applyZone(p, 'floor');
      p.node.classList.add(cls, 'is-focused');
      setTimeout(function () { if (p.node) p.node.classList.remove(cls, 'is-focused'); }, 6000);
    });
    if (window.SpaceLounge3D) window.SpaceLounge3D.shake(.4);
    showToast(label);
  }

  /* ── SSE: ربط تيك توك المجاني ── */
  function connectLive() {
    if (new URLSearchParams(location.search).get('perf') === '50') return;
    if (!window.EventSource) { connLabel.innerHTML = '<span class="dot"></span> الإدخال اليدوي جاهز'; return; }
    var es = new EventSource('/live/events');
    es.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      var p = m.payload || {};
      if (m.type === 'hello' || m.type === 'status') {
        connLabel.classList.toggle('is-on', !!p.connected);
        connLabel.innerHTML = '<span class="dot"></span> ' + (p.connected ? 'TikTok متصل — دخول تلقائي' : 'بانتظار الاتصال…');
      } else if (m.type === 'lounge-join') {
        addParticipant({ name: p.name, uniqueId: p.uniqueId }, 'tiktok');
      } else if (m.type === 'lounge-gift') {
        runAction(p);
      }
    };
    es.onerror = function () { connLabel.classList.remove('is-on'); connLabel.innerHTML = '<span class="dot"></span> إعادة الاتصال…'; };
  }

  /* ── لوحة المضيف والأزرار ── */
  $('manualParticipantForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('manualName').value.trim();
    if (!name) return;
    addParticipant({ name: name, uniqueId: $('manualHandle').value.trim() }, 'manual');
    this.reset();
  });
  $('clearParticipants').addEventListener('click', function () { Array.from(participants.keys()).forEach(removeParticipant); });
  $('groupDanceBtn').addEventListener('click', function () { groupAction('dance'); });
  $('zeroGBtn').addEventListener('click', function () { groupAction('zero'); });
  $('flyBtn').addEventListener('click', function () { groupAction('fly'); });
  $('hostPanelToggle').addEventListener('click', function () { $('hostPanel').classList.toggle('is-collapsed'); });
  $('toggleFullscreen').addEventListener('click', function () {
    if (!document.fullscreenElement) { if (stage.requestFullscreen) stage.requestFullscreen(); }
    else if (document.exitFullscreen) document.exitFullscreen();
  });
  var CAM_MODES = [['sweep', '🎥 مسح'], ['orbit', '🛰 مداري'], ['front', '🎯 أمامي']];
  var camIdx = 0;
  $('cameraBtn').addEventListener('click', function () {
    camIdx = (camIdx + 1) % CAM_MODES.length;
    this.textContent = CAM_MODES[camIdx][1];
    if (window.SpaceLounge3D) window.SpaceLounge3D.setMode(CAM_MODES[camIdx][0]);
  });

  /* ── مسبار الأداء ?perf=50 ── */
  function runPerformanceProbe() {
    if (new URLSearchParams(location.search).get('perf') !== '50') return;
    var t0 = performance.now();
    for (var i = 0; i < MAX; i++) addParticipant({ name: 'رائد ' + (i + 1), uniqueId: 'probe_' + i }, 'perf');
    var addMs = performance.now() - t0;
    var t1 = performance.now();
    for (var f = 0; f < 60; f++) participants.forEach(function (p, idx) { setLogicalPosition(p.node, 10 + ((idx + f) % 80), 25 + ((idx + f) % 55)); });
    document.body.dataset.spacePerf = JSON.stringify({ participants: participants.size, addMs: +addMs.toFixed(1), motionMs: +(performance.now() - t1).toFixed(1) });
    showToast('مسبار الأداء: ' + participants.size + ' رائدًا — النتائج في dataset');
  }

  window.SpaceLounge = { participants: participants, add: addParticipant, run: runAction, group: groupAction };
  connectLive();
  runPerformanceProbe();
  updateCount();
})();
