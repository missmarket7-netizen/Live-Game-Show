(() => {
  'use strict';

  const CHANNEL_NAME = 'wcq-studio-director-v1';
  const CACHE_KEY = 'wcq_studio_director_v1';
  const GAME_CACHE = 'lgs_output_last_snapshot_v1';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  let directorChannel = null;
  let gameChannel = null;
  let state = {
    view: 'wide', merged: false,
    layers: { scores: true, awards: true, branding: true },
    giftLabel: 'لحظة الهدية', giftName: '', weeklyLeader: '', roundStar: ''
  };

  const safeText = (value, maxLength) => String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return state;
    const layers = raw.layers && typeof raw.layers === 'object' ? raw.layers : {};
    return {
      view: ['wide', 'scores', 'awards'].includes(raw.view) ? raw.view : 'wide',
      merged: Boolean(raw.merged),
      layers: { scores: layers.scores !== false, awards: layers.awards !== false, branding: layers.branding !== false },
      giftLabel: safeText(raw.giftLabel || 'لحظة الهدية', 32),
      giftName: safeText(raw.giftName, 44),
      weeklyLeader: safeText(raw.weeklyLeader, 28),
      roundStar: safeText(raw.roundStar, 28)
    };
  }

  function send(type) {
    const payload = { channel: CHANNEL_NAME, type: 'director', state };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(state)); } catch (error) {}
    if (directorChannel) {
      try { directorChannel.postMessage(payload); } catch (error) {}
    }
    if (type === 'game-ping' && gameChannel) {
      try { gameChannel.postMessage({ channel: 'wcq-output-v1', type: 'request-snapshot' }); } catch (error) {}
    }
  }

  function syncControls() {
    $$('[data-view]').forEach((button) => {
      const active = button.dataset.view === state.view;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('#mergeLayers').checked = state.merged;
    $$('[data-layer-toggle]').forEach((input) => { input.checked = state.layers[input.dataset.layerToggle] !== false; });
    $('#giftMoment').value = state.giftName;
    $('#weeklyLeader').value = state.weeklyLeader;
    $('#roundStar').value = state.roundStar;
  }

  function setConnection(live) {
    const badge = $('#controlConnection');
    const text = $('#controlConnectionText');
    badge.classList.toggle('is-live', live);
    badge.classList.toggle('is-idle', !live);
    text.textContent = live ? 'لوحة اللعبة متصلة · السؤال والنتيجة يتحدثان تلقائيًا' : 'افتح لوحة اللعبة في نافذة أخرى لبدء التحديث';
  }

  function checkGameCache() {
    try {
      const snapshot = JSON.parse(localStorage.getItem(GAME_CACHE) || 'null');
      const fresh = snapshot && Date.now() - Number(snapshot.sentAt) < 6500;
      setConnection(Boolean(fresh));
    } catch (error) { setConnection(false); }
  }

  function initChannels() {
    if (typeof BroadcastChannel !== 'function') { checkGameCache(); return; }
    try {
      directorChannel = new BroadcastChannel(CHANNEL_NAME);
      gameChannel = new BroadcastChannel('wcq-output-v1');
      gameChannel.addEventListener('message', (event) => {
        const message = event.data;
        if (!message || message.channel !== 'wcq-output-v1' || message.type !== 'snapshot') return;
        try { localStorage.setItem(GAME_CACHE, JSON.stringify(message.snapshot)); } catch (error) {}
        setConnection(true);
      });
    } catch (error) {
      directorChannel = null;
      gameChannel = null;
    }
    checkGameCache();
    send('director');
  }

  $$('[data-view]').forEach((button) => button.addEventListener('click', () => {
    state.view = button.dataset.view;
    send();
    syncControls();
  }));
  $('#mergeLayers').addEventListener('change', (event) => {
    state.merged = Boolean(event.currentTarget.checked);
    send();
  });
  $$('[data-layer-toggle]').forEach((input) => input.addEventListener('change', () => {
    state.layers[input.dataset.layerToggle] = Boolean(input.checked);
    send();
  }));
  $('#applyAwards').addEventListener('click', () => {
    state.giftName = safeText($('#giftMoment').value, 44);
    state.giftLabel = state.giftName ? 'لحظة الهدية' : 'لحظة الهدية';
    state.weeklyLeader = safeText($('#weeklyLeader').value, 28);
    state.roundStar = safeText($('#roundStar').value, 28);
    send();
    const button = $('#applyAwards');
    const oldText = button.childNodes[0] && button.childNodes[0].textContent;
    button.firstChild.textContent = 'تم تحديث مشهد الاستديو';
    window.setTimeout(() => { button.firstChild.textContent = oldText || 'تحديث لحظات الاستديو '; }, 1800);
  });
  window.addEventListener('storage', (event) => { if (event.key === GAME_CACHE) checkGameCache(); });
  window.setInterval(checkGameCache, 1500);

  try { state = normalize(JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')); } catch (error) {}
  syncControls();
  initChannels();
})();
