(() => {
  'use strict';

  const CHANNEL_NAME = 'wcq-studio-director-v1';
  const CACHE_KEY = 'wcq_studio_director_v1';
  const OPERATOR_KEY_STORAGE_KEY = 'wcq_operator_write_key_v1';
  const GAME_CACHE = 'lgs_output_last_snapshot_v1';
  const GAME_CHANNEL_NAME = 'wcq-output-v1';
  const SCORE_COMMAND_CHANNEL = 'wcq-studio-score-command-v1';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  let directorChannel = null;
  let gameChannel = null;
  let scoreCommandChannel = null;
  let operatorKey = '';
  let directorSentAt = 0;
  let gameConnected = false;
  let gameSnapshot = null;
  let preserveScoreStatusUntil = 0;
  const pendingCommands = new Map();
  let state = {
    view: 'wide', merged: false,
    layers: { scores: true, awards: true, branding: true },
    giftLabel: 'لحظة الهدية', giftName: '', weeklyLeader: '', roundStar: ''
  };

  const safeText = (value, maxLength) => String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);

  function normalizeGameSnapshot(raw) {
    const snapshotBuilder = window.WCQOutputSnapshot;
    if (!snapshotBuilder || typeof snapshotBuilder.normalize !== 'function') return null;
    return snapshotBuilder.normalize(raw);
  }

  function normalize(raw) {
    const contract = window.WCQStudioDirectorState;
    return contract && typeof contract.normalize === 'function' ? contract.normalize(raw) : state;
  }

  function directorSyncStatus(message, status) {
    const element = $('#directorSyncStatus');
    if (!element) return;
    element.textContent = message;
    if (status) element.dataset.state = status;
    else delete element.dataset.state;
  }

  function nextDirectorSentAt() {
    directorSentAt = Math.max(Date.now(), directorSentAt + 1);
    return directorSentAt;
  }

  async function publishDirectorState(sentAt) {
    if (!operatorKey) {
      directorSyncStatus('التغييرات محلية في هذا التبويب فقط؛ تحقّق من مفتاح المشغّل لربط OBS.', 'error');
      return;
    }
    directorSyncStatus('جارٍ مزامنة إعدادات المشهد مع OBS…', 'pending');
    try {
      const response = await fetch('/api/studio-director-state', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-Operator-Key': operatorKey },
        body: JSON.stringify({ state, sentAt })
      });
      if (response.ok) {
        directorSyncStatus('مشهد OBS مستقل متصل · تم حفظ آخر إعدادات المخرج على الخادم.', 'success');
      } else if (response.status === 401 || response.status === 503) {
        directorSyncStatus(response.status === 401 ? 'رفض الخادم المفتاح؛ أعد التحقق من قيمة المشغّل.' : 'مفتاح المشغّل غير مضبوط على الخادم؛ OBS المستقل غير متاح.', 'error');
      } else if (response.status === 429) {
        directorSyncStatus('وصلت لوحة المخرج إلى حد الكتابة؛ انتظر قليلًا ثم أعد التغيير.', 'error');
      } else if (response.status === 409) {
        directorSyncStatus('وصل تحديث أحدث إلى الخادم؛ أعد تحميل مشهد الاستديو لمزامنته.', 'error');
      } else {
        directorSyncStatus('تعذرت مزامنة المشهد؛ ستبقى المعاينة المحلية متاحة.', 'error');
      }
    } catch (error) {
      directorSyncStatus('الخادم غير متاح الآن؛ التغييرات المحلية محفوظة في هذا التبويب.', 'error');
    }
  }

  async function loadRemoteDirectorState() {
    try {
      const response = await fetch('/api/studio-director-state', { cache: 'no-store' });
      if (!response.ok) throw new Error('director_read_failed');
      const payload = await response.json();
      const sentAt = Number(payload && payload.sentAt) || 0;
      if (payload && Number(payload.updatedAt) > 0 && payload.state && sentAt > 0) {
        state = normalize(payload.state);
        directorSentAt = Math.max(directorSentAt, sentAt);
        syncControls();
        send(false);
        directorSyncStatus('تم استرجاع إعدادات المشهد من الخادم؛ OBS مستقل عن تبويبات المتصفح.', 'success');
      } else {
        directorSyncStatus('لم تُنشر إعدادات بعد؛ سيتم رفع إعدادات لوحة المخرج الحالية.', 'pending');
        send(true);
      }
      return true;
    } catch (error) {
      directorSyncStatus('تعذرت قراءة إعدادات الخادم؛ المعاينة المحلية لم تتغير.', 'error');
      return false;
    }
  }

  async function validateAndConnect(candidate) {
    const key = String(candidate || '').trim();
    if (!key) {
      directorSyncStatus('أدخل مفتاح المشغّل الذي ضبطه مالك الخادم.', 'error');
      return;
    }
    directorSyncStatus('جارٍ التحقق من مفتاح المشغّل…', 'pending');
    try {
      const response = await fetch('/api/operator/verify', {
        cache: 'no-store',
        headers: { 'X-Operator-Key': key }
      });
      if (!response.ok) {
        if (response.status === 429) {
          directorSyncStatus('توقفت محاولات التحقق مؤقتًا؛ انتظر قليلًا ثم أعد المحاولة.', 'error');
          return;
        }
        operatorKey = '';
        try { sessionStorage.removeItem(OPERATOR_KEY_STORAGE_KEY); } catch (error) {}
        directorSyncStatus(response.status === 503 ? 'المفتاح غير مضبوط على الخادم؛ لم يتم ربط OBS.' : 'المفتاح مرفوض؛ لم يتم ربط OBS.', 'error');
        return;
      }
      operatorKey = key;
      try { sessionStorage.setItem(OPERATOR_KEY_STORAGE_KEY, key); } catch (error) {}
      const input = $('#directorKeyInput');
      if (input) input.value = '';
      await loadRemoteDirectorState();
    } catch (error) {
      operatorKey = '';
      directorSyncStatus('تعذر الاتصال بالخادم للتحقق؛ لم يتغير المشهد المحلي.', 'error');
    }
  }

  function send(publishRemote = true) {
    const sentAt = nextDirectorSentAt();
    const payload = { channel: CHANNEL_NAME, type: 'director', state, sentAt };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch (error) {}
    if (directorChannel) {
      try { directorChannel.postMessage(payload); } catch (error) {}
    }
    if (publishRemote) void publishDirectorState(sentAt);
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

  function scoreStatus(message, error, preserve = false) {
    const status = $('#scoreControlStatus');
    status.textContent = message;
    status.classList.toggle('is-error', Boolean(error));
    status.classList.toggle('is-success', !error);
    if (preserve) preserveScoreStatusUntil = Date.now() + 4000;
  }

  function refreshScoreButtons() {
    const canScore = gameConnected && gameSnapshot && gameSnapshot.ready && scoreCommandChannel;
    $$('[data-score-team]').forEach((button) => {
      const team = button.dataset.scoreTeam;
      button.disabled = !canScore || pendingCommands.has(team);
      button.setAttribute('aria-disabled', String(button.disabled));
    });
    if (!gameConnected) {
      scoreStatus('افتح لوحة اللعبة في نافذة أخرى لتفعيل التحكم.', true);
    } else if (!gameSnapshot || !gameSnapshot.ready) {
      scoreStatus('اللوحة متصلة؛ ابدأ الجولة في اللعبة أولًا.', true);
    } else if (!pendingCommands.size && Date.now() >= preserveScoreStatusUntil) {
      scoreStatus('جاهز · كل ضغطة تطبّق نقطة داخل اللعبة.', false);
    }
  }

  function setConnection(live) {
    gameConnected = Boolean(live);
    const badge = $('#controlConnection');
    const text = $('#controlConnectionText');
    badge.classList.toggle('is-live', gameConnected);
    badge.classList.toggle('is-idle', !gameConnected);
    text.textContent = gameConnected ? 'لوحة اللعبة متصلة · السؤال والنتيجة يتحدثان تلقائيًا' : 'افتح لوحة اللعبة في نافذة أخرى لبدء التحديث';
    refreshScoreButtons();
  }

  function renderScore(snapshot) {
    if (!snapshot || !snapshot.scores) return;
    const girls = Number(snapshot.scores.girls);
    const boys = Number(snapshot.scores.boys);
    if (!Number.isFinite(girls) || !Number.isFinite(boys)) return;
    gameSnapshot = {
      ready: Boolean(snapshot.ready),
      scores: { girls, boys },
      sentAt: Number(snapshot.sentAt) || Date.now()
    };
    $('#controlGirlsScore').textContent = String(girls);
    $('#controlBoysScore').textContent = String(boys);
    $('#scoreControlSnapshot').textContent = `${girls} — ${boys}`;
    refreshScoreButtons();
  }

  function checkGameCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(GAME_CACHE) || 'null');
      const snapshot = normalizeGameSnapshot(raw);
      if (snapshot) {
        try { localStorage.setItem(GAME_CACHE, JSON.stringify(snapshot)); } catch (storageError) {}
      } else if (raw) {
        try { localStorage.removeItem(GAME_CACHE); } catch (storageError) {}
      }
      const age = snapshot ? Date.now() - snapshot.sentAt : Infinity;
      const fresh = Boolean(snapshot && age >= 0 && age < 6500);
      if (fresh) renderScore(snapshot);
      else if (snapshot && snapshot.scores) renderScore(Object.assign({}, snapshot, { ready: false }));
      else gameSnapshot = null;
      setConnection(fresh);
    } catch (error) {
      gameSnapshot = null;
      setConnection(false);
    }
  }

  function applyAck(message) {
    const match = Array.from(pendingCommands.entries()).find((entry) => entry[1].id === message.id);
    if (!match) return;
    const [team, pending] = match;
    window.clearTimeout(pending.timeout);
    pendingCommands.delete(team);
    if (message.scores) {
      renderScore({ ready: Boolean(gameSnapshot && gameSnapshot.ready), scores: message.scores, sentAt: Date.now() });
    }
    if (message.ok) {
      const label = pending.team === 'girls' ? 'فريق البنات' : 'فريق الشباب';
      scoreStatus(message.delta > 0 ? `أُضيفت نقطة إلى ${label}.` : `خُصمت نقطة من ${label}.`, false, true);
    } else {
      scoreStatus(safeText(message.reason || 'لم تُطبّق النقطة؛ تحقّق من الجولة.', 90), true, true);
    }
  }

  function sendScore(team, delta, button) {
    if (!['girls', 'boys'].includes(team) || ![-1, 1].includes(delta)) return;
    if (!gameConnected || !gameSnapshot || !gameSnapshot.ready || !scoreCommandChannel) {
      scoreStatus('لا توجد جولة نشطة في لوحة اللعبة؛ لم يتغير أي رصيد.', true);
      return;
    }
    if (pendingCommands.has(team)) return;
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `wcq-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timeout = window.setTimeout(() => {
      if (!pendingCommands.has(team)) return;
      pendingCommands.delete(team);
      scoreStatus('لم يصل تأكيد اللعبة. تحقق من تبويب اللعبة قبل إعادة الضغط.', true);
      refreshScoreButtons();
    }, 2200);
    pendingCommands.set(team, { team, delta, timeout });
    scoreStatus('جارٍ إرسال أمر النقطة إلى اللعبة…', false);
    refreshScoreButtons();
    try {
      scoreCommandChannel.postMessage({
        channel: SCORE_COMMAND_CHANNEL,
        type: 'adjust-score',
        id,
        team,
        delta
      });
      pendingCommands.get(team).id = id;
    } catch (error) {
      window.clearTimeout(timeout);
      pendingCommands.delete(team);
      scoreStatus('تعذر إرسال الأمر؛ لم يتغير الرصيد.', true);
      refreshScoreButtons();
    }
  }

  function initChannels() {
    if (typeof BroadcastChannel !== 'function') {
      checkGameCache();
      scoreStatus('هذا المتصفح لا يدعم قناة التحكم المباشر.', true);
      return;
    }
    try {
      directorChannel = new BroadcastChannel(CHANNEL_NAME);
      gameChannel = new BroadcastChannel(GAME_CHANNEL_NAME);
      scoreCommandChannel = new BroadcastChannel(SCORE_COMMAND_CHANNEL);
      gameChannel.addEventListener('message', (event) => {
        const message = event.data;
        if (!message || message.channel !== GAME_CHANNEL_NAME || message.type !== 'snapshot') return;
        const safeSnapshot = normalizeGameSnapshot(message.snapshot);
        if (!safeSnapshot) return;
        try { localStorage.setItem(GAME_CACHE, JSON.stringify(safeSnapshot)); } catch (error) {}
        const age = Date.now() - safeSnapshot.sentAt;
        const fresh = age >= 0 && age < 6500;
        renderScore(fresh ? safeSnapshot : Object.assign({}, safeSnapshot, { ready: false }));
        setConnection(fresh);
      });
      scoreCommandChannel.addEventListener('message', (event) => {
        const message = event.data;
        if (!message || message.channel !== SCORE_COMMAND_CHANNEL || message.type !== 'score-ack') return;
        applyAck(message);
      });
      gameChannel.postMessage({ channel: GAME_CHANNEL_NAME, type: 'request-snapshot' });
    } catch (error) {
      directorChannel = null;
      gameChannel = null;
      scoreCommandChannel = null;
    }
    checkGameCache();
    send(false);
  }

  const directorKeyForm = $('#directorKeyForm');
  if (directorKeyForm) directorKeyForm.addEventListener('submit', (event) => {
    event.preventDefault();
    validateAndConnect($('#directorKeyInput').value);
  });

  async function connectStoredOperatorKey() {
    let saved = '';
    try { saved = sessionStorage.getItem(OPERATOR_KEY_STORAGE_KEY) || ''; } catch (error) {}
    if (!saved) {
      directorSyncStatus('المعاينة المحلية متاحة؛ لإرسال المشهد إلى OBS أدخل مفتاح المشغّل.', 'error');
      return;
    }
    await validateAndConnect(saved);
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
  $$('[data-score-team]').forEach((button) => button.addEventListener('click', () => {
    sendScore(button.dataset.scoreTeam, Number(button.dataset.scoreDelta), button);
  }));
  $('#applyAwards').addEventListener('click', () => {
    state.giftName = safeText($('#giftMoment').value, 44);
    state.giftLabel = 'لحظة الهدية';
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

  try {
    const cachedDirector = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    state = normalize(cachedDirector && cachedDirector.state ? cachedDirector.state : cachedDirector);
    directorSentAt = Number(cachedDirector && cachedDirector.sentAt) || 0;
  } catch (error) {}
  syncControls();
  initChannels();
  void connectStoredOperatorKey();
})();
