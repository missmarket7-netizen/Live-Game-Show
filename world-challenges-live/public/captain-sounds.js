/* CAPTAIN_AUDIO_UNIFY_V1 — توجيه مؤثرات الكباتن عبر ناقل Web Audio نفسه عند توفره */
var CSOrigAudio = window.Audio;
function CSUnifiedAudio(src) {
  var bridge = window.WCQ_AUDIO;
  if (!bridge || !bridge.available || !bridge.available()) return new CSOrigAudio(src);
  var shim = {
    src: src || '',
    volume: 0.9,
    currentTime: 0,
    paused: true,
    ended: false,
    onended: null,
    onerror: null,
    _handlers: { ended: [], error: [] },
    addEventListener: function (type, fn) { if (shim._handlers[type]) shim._handlers[type].push(fn); },
    removeEventListener: function () {},
    _fire: function (type) {
      var fns = shim._handlers[type] || [];
      for (var i = 0; i < fns.length; i++) { try { fns[i]({ target: shim }); } catch (e) {} }
      var direct = type === 'ended' ? shim.onended : shim.onerror;
      if (direct) { try { direct({ target: shim }); } catch (e) {} }
    },
    _key: function () { return (String(shim.src).match(/\/sounds\/([^\/?]+)\.mp3/) || [, ''])[1]; },
    play: function () {
      var key = shim._key();
      if (!key) { shim._fire('error'); return Promise.resolve(); }
      shim.paused = false; shim.ended = false;
      bridge.playKey(key, shim.volume, {
        onEnd: function () { shim.ended = true; shim.paused = true; shim._fire('ended'); },
        onFail: function () { shim._fire('error'); }
      });
      return Promise.resolve();
    },
    pause: function () {
      var key = shim._key();
      if (key && bridge.stopKey) bridge.stopKey(key);
      shim.paused = true;
    },
    cloneNode: function () { return CSUnifiedAudio(shim.src); }
  };
  return shim;
}

/* ═══ CAPTAIN_CUSTOM_SOUNDS_V1 — مؤثر خاص باسم الكابتن (حد 35 ثانية) + احتياطي الفريق ═══ */
(function () {
  'use strict';
  if (window.__CAPTAIN_SOUNDS_V1__) return;
  window.__CAPTAIN_SOUNDS_V1__ = true;

  var CAP_MS = 35000; /* 35 ثانية فقط من مدة المؤثر */
  var activeCaptainAudio = null;

  var CAPTAINS = [
    { key: 'nancy',    aliases: ['nancy', 'نانسي'] },
    { key: 'lara',     aliases: ['lara', 'لارا'] },
    { key: 'jojo',     aliases: ['jojo', 'جوجو'] },
    { key: 'moon',     aliases: ['mooon', 'moon', 'مون'] },
    { key: 'saja',     aliases: ['saja', 'سچي', 'سجي'] },
    { key: 'chimo',    aliases: ['chimoo', 'chimo', 'chemo', 'شيمو'] },
    { key: 'saad',     aliases: ['saad', 'سعد'] },
    { key: 'mokhtar',  aliases: ['mokhtar', 'المختار', 'مختار'] },
    { key: 'abdo',     aliases: ['abdo', 'عبده'] },
    { key: 'ahmed',    aliases: ['ahmed', 'احمد', 'أحمد'] },
    { key: 'seif',     aliases: ['seif', 'سيف الدين', 'سيف'] },
    { key: 'yousef',   aliases: ['yousef', 'يوسف الهاشمي', 'يوسف'] },
    { key: 'mina',     aliases: ['mina', 'مينا'] },
    { key: 'abdallah', aliases: ['abd allah', 'abdallah', 'عبد الله', 'عبدالله'] },
    { key: 'abu',      aliases: ['abu muhammed', 'abu', 'ابو محمد', 'أبو محمد'] },
    { key: 'melina', aliases: ['melina', 'ميلانيا'] },
    { key: 'memo',     aliases: ['memo', 'ميمو'] },
    { key: 'sara',     aliases: ['sara', 'سارة'] },
    { key: 'osama',    aliases: ['osama', 'أسامة'] },
    { key: 'yasmin',   aliases: ['yasmin', 'ياسمين'] },
    { key: 'shoaib',   aliases: ['shoaib', 'شعيب'] },
    { key: 'shero',    aliases: ['shero', 'شيرو'] },
    { key: 'lana',     aliases: ['lana', 'لانا'] },
    { key: 'asia',     aliases: ['asia', 'آسيا'] },
    { key: 'dahab',    aliases: ['dahab', 'دهب'] },
    { key: 'abdelrahman', aliases: ['abdelrahman', 'abd elrahman', 'عبد الرحمن', 'عبدالرحمن'] },
    { key: 'noha',     aliases: ['noha', 'نهى', 'نهي'] }
  ];

  var FALLBACK_BY_KEY = {
    nancy: 'girls-captin', lara: 'girls-captin', jojo: 'girls-captin',
    moon: 'girls-captin', saja: 'girls-captin', chimo: 'girls-captin',
    saad: 'boys-captin', mokhtar: 'boys-captin', abdo: 'boys-captin',
    ahmed: 'boys-captin', seif: 'boys-captin', yousef: 'boys-captin',
    mina: 'boys-captin', abdallah: 'boys-captin', abu: 'boys-captin', melina: 'girls-captin',
    memo: 'boys-captin',
    sara: 'girls-captin',
    osama: 'boys-captin',
    yasmin: 'girls-captin',
    shoaib: 'boys-captin',
    shero: 'boys-captin',
    lana: 'girls-captin',
    asia: 'girls-captin',
    dahab: 'girls-captin',
    abdelrahman: 'boys-captin',
    noha: 'girls-captin'
  };

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
      .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
      .replace(/\u0649/g, '\u064A')
      .replace(/\s+/g, ' ')
      .trim();
  }

  var EXACT = {};
  var FUZZY = [];
  CAPTAINS.forEach(function (c) {
    c.aliases.forEach(function (a) {
      var n = norm(a);
      if (!n) return;
      if (!EXACT[n]) EXACT[n] = c.key;
      FUZZY.push([n, c.key]);
    });
  });
  FUZZY.sort(function (a, b) { return b[0].length - a[0].length; });

  function keyForName(name) {
    var n = norm(name);
    if (!n) return null;
    if (EXACT[n]) return EXACT[n];
    var tokens = n.split(' ');
    for (var i = 0; i < FUZZY.length; i++) {
      if (tokens.indexOf(FUZZY[i][0]) !== -1) return FUZZY[i][1];
    }
    for (var j = 0; j < FUZZY.length; j++) {
      if (n.indexOf(FUZZY[j][0]) !== -1) return FUZZY[j][1];
    }
    return null;
  }

  function soundEnabled() {
    var s = window.state;
    return !(s && s.soundEnabled === false);
  }

  var origPlaySound = window.playSound;

  /* كتم انتقائي مؤقت لصوت الفريق الأساسي عندما يُشغَّل مؤثر خاص */
  var suppressUntil = 0;
  var SUPPRESS = { 'girls-captin': 1, 'boys-captin': 1 };
  window.playSound = function (key) {
    if (suppressUntil > Date.now() && SUPPRESS[key]) return undefined;
    if (typeof origPlaySound === 'function') return origPlaySound.apply(this, arguments);
    return undefined;
  };

  function playFallback(key) {
    if (typeof origPlaySound === 'function') origPlaySound(key, 0.8);
  }

  /* تشغيل المؤثر الخاص مع حد 35 ثانية، وعند الفشل يحتياطي الفريق */
  function playCapped(key, fallbackKey) {
    if (activeCaptainAudio) {
      try { activeCaptainAudio.pause(); activeCaptainAudio.currentTime = 0; } catch (e) {}
      activeCaptainAudio = null;
    }
    var a = CSUnifiedAudio('/sounds/' + key + '.mp3?v=20261113-audio-compressed');
    a.preload = 'auto';
    a.setAttribute('playsinline', '');
    a.volume = 0.95;
    activeCaptainAudio = a;
    var settled = false;

    function fail() {
      if (settled) return;
      settled = true;
      try { a.pause(); } catch (e) {}
      if (activeCaptainAudio === a) activeCaptainAudio = null;
      playFallback(fallbackKey);
    }

    a.addEventListener('error', fail);

    var timer = setTimeout(function () {
      try { if (!a.paused) { a.pause(); a.currentTime = 0; } } catch (e) {}
      if (activeCaptainAudio === a) activeCaptainAudio = null;
    }, CAP_MS);

    a.addEventListener('ended', function () {
      clearTimeout(timer);
      if (activeCaptainAudio === a) activeCaptainAudio = null;
    });

    var p = a.play();
    if (p && typeof p.catch === 'function') p.catch(fail);
  }

  /* التقاط ضغط تأكيد الكابتن قبل معالج التطبيق */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var btn = t.closest('.captain-done');
    if (!btn) return;

    var slot = btn.closest('.captain-slot') || btn.parentElement;
    var input = slot ? slot.querySelector('.captain-input') : null;
    if (!input) return;

    var key = keyForName(input.value);
    if (!key) return;                 /* اسم غير معروف → السلوك القديم كما هو */
    if (!soundEnabled()) return;

    var team = input.getAttribute('data-team') || '';
    if (!team && slot) {
      var host = slot.closest('[data-team]');
      if (host) team = host.getAttribute('data-team');
    }
    var fallback = FALLBACK_BY_KEY[key] || (team === 'boys' ? 'boys-captin' : 'girls-captin');

    suppressUntil = Date.now() + 300; /* منع تداخل صوت الفريق مع المؤثر الخاص */
    playCapped(key, fallback);
  }, true);
})();
