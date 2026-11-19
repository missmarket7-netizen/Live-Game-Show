(() => {
  'use strict';

  const GAME_CHANNEL = 'wcq-output-v1';
  const DIRECTOR_CHANNEL = 'wcq-studio-director-v1';
  const GAME_CACHE = 'lgs_studio_game_last_snapshot_v1';
  const DIRECTOR_CACHE = 'wcq_studio_director_v1';
  const STALE_AFTER_MS = 6500;
  const node = (id) => document.getElementById(id);
  const stage = node('studioStage');
  const connection = node('studioConnection');
  const connectionText = node('studioConnectionText');
  const tiktokConnection = node('studioTikTokStatus');
  const tiktokConnectionText = node('studioTikTokText');
  let lastGameLocalAt = 0;
  let lastGameServerAt = 0;
  let lastDirectorSentAt = 0;
  let gameState = null;
  let directorState = null;
  let giftTimer = 0;
  let giftRestoreTimer = 0;

  const safeText = (value, max = 180) => String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  const safeNumber = (value, min, max, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };
  const defaultDirector = () => {
    const contract = window.WCQStudioDirectorState;
    return contract && typeof contract.defaults === 'function' ? contract.defaults() : {
      view: 'wide', merged: false,
      layers: { scores: true, awards: true, branding: true },
      giftLabel: 'لحظة الهدية', giftName: '', weeklyLeader: '', roundStar: ''
    };
  };

  function normalizeDirector(raw) {
    const contract = window.WCQStudioDirectorState;
    return contract && typeof contract.normalize === 'function' ? contract.normalize(raw) : defaultDirector();
  }

  function normalizeGame(raw) {
    const snapshotBuilder = window.WCQOutputSnapshot;
    if (!snapshotBuilder || typeof snapshotBuilder.normalize !== 'function') return null;
    const safeSnapshot = snapshotBuilder.normalize(raw);
    if (!safeSnapshot) return null;
    const scores = safeSnapshot.scores;
    const question = safeSnapshot.question;
    const timer = safeSnapshot.timer;
    const captains = safeSnapshot.captains;
    const names = (items) => Array.isArray(items) ? items.map((name) => safeText(name, 40)).filter(Boolean).slice(0, 5) : [];
    const girls = Number(scores.girls);
    const boys = Number(scores.boys);
    const sentAt = Number(safeSnapshot.sentAt);
    if (!Number.isFinite(girls) || !Number.isFinite(boys) || !Number.isFinite(sentAt)) return null;
    const duration = safeNumber(timer.durationSeconds, 1, 3600, 30);
    return {
      ready: Boolean(safeSnapshot.ready),
      sentAt: safeNumber(sentAt, 0, Date.now() + 5000, 0),
      scores: { girls: safeNumber(girls, -9999, 9999), boys: safeNumber(boys, -9999, 9999) },
      question: {
        text: safeText(question.text, 320),
        answer: safeText(question.answer, 160),
        category: safeText(question.category, 48),
        revealed: Boolean(question.revealed),
        index: safeNumber(question.index, 0, 99, 0),
        total: safeNumber(question.total, 0, 99, 0)
      },
      timer: {
        remaining: safeNumber(timer.remainingSeconds, 0, 3600),
        duration,
        running: Boolean(timer.running)
      },
      captains: { girls: names(captains.girls), boys: names(captains.boys) },
      roundNumber: safeNumber(safeSnapshot.roundNumber, 1, 999, 1)
    };
  }

  function setCaptains(id, names) {
    const target = node(id);
    if (!target) return;
    target.textContent = names.length ? names.slice(0, 2).join(' · ') : 'بانتظار بيانات اللعبة';
    target.title = names.join('، ');
  }

  function clearScoreFocus() {
    stage.classList.remove('is-score-focus');
    delete stage.dataset.scoreFocus;
  }

  function animateScoreChange(previous, snapshot) {
    if (!previous) return;
    const girlsChanged = previous.scores.girls !== snapshot.scores.girls;
    const boysChanged = previous.scores.boys !== snapshot.scores.boys;
    if (!girlsChanged && !boysChanged) return;
    const team = girlsChanged && !boysChanged ? 'girls'
      : boysChanged && !girlsChanged ? 'boys'
        : Math.abs(snapshot.scores.girls - previous.scores.girls) >= Math.abs(snapshot.scores.boys - previous.scores.boys) ? 'girls' : 'boys';
    stage.dataset.scoreFocus = team;
    stage.classList.add('is-score-focus');
    node('studioQuestionStage').setAttribute('aria-hidden', 'true');
  }

  function renderGame(snapshot) {
    const previous = gameState;
    if (previous) {
      const questionChanged = previous.question.index !== snapshot.question.index
        || previous.question.text !== snapshot.question.text
        || (!previous.ready && snapshot.ready);
      if (questionChanged) {
        clearScoreFocus();
        node('studioQuestionStage').removeAttribute('aria-hidden');
      } else {
        animateScoreChange(previous, snapshot);
      }
    }
    gameState = snapshot;
    stage.classList.toggle('is-idle', !snapshot.ready);
    node('studioGirlsScore').textContent = String(snapshot.scores.girls);
    node('studioBoysScore').textContent = String(snapshot.scores.boys);
    setCaptains('studioGirlsCaptains', snapshot.captains.girls);
    setCaptains('studioBoysCaptains', snapshot.captains.boys);
    node('studioQuestionCategory').textContent = snapshot.question.category || 'سؤال المواجهة';
    node('studioQuestionIndex').textContent = snapshot.question.total
      ? `السؤال ${String(snapshot.question.index || 1).padStart(2, '0')} / ${String(snapshot.question.total).padStart(2, '0')}`
      : (snapshot.ready ? 'سؤال المواجهة' : 'جاهزون؟');
    const questionText = node('studioQuestionText');
    questionText.textContent = snapshot.ready && snapshot.question.text ? snapshot.question.text : 'استعدوا للحظة التحدي…';
    questionText.classList.toggle('is-long', questionText.textContent.length > 88);

    node('studioTimerValue').textContent = snapshot.ready ? String(snapshot.timer.remaining).padStart(2, '0') : '--';
    const bar = node('studioTimerProgress');
    bar.style.width = snapshot.ready ? `${Math.max(0, Math.min(100, snapshot.timer.remaining / snapshot.timer.duration * 100))}%` : '0%';
    const timerValue = node('studioTimerValue').parentElement;
    timerValue.classList.toggle('is-urgent', snapshot.timer.remaining > 0 && snapshot.timer.remaining <= 5);
    node('studioTimerLabel').textContent = snapshot.timer.running ? 'الوقت يجري…' : (snapshot.ready ? 'لحظة التفكير' : 'المؤقت جاهز');
    node('studioRoundLabel').textContent = `الجولة ${snapshot.roundNumber} · عالم التحديات`;

    const expired = snapshot.ready && snapshot.timer.duration > 0 && snapshot.timer.remaining === 0;
    const answerVisible = snapshot.ready && (snapshot.question.revealed || expired);
    const answer = node('studioAnswer');
    const prompt = node('studioAnswerPrompt');
    if (answerVisible && snapshot.question.answer) {
      node('studioAnswerText').textContent = snapshot.question.answer;
      answer.hidden = false;
      prompt.hidden = true;
    } else {
      answer.hidden = true;
      prompt.hidden = !snapshot.ready;
      node('studioAnswerText').textContent = '';
      prompt.textContent = snapshot.ready ? 'فكّروا بسرعة… الإجابة لم تُكشف بعد' : 'تبدأ لحظة الكشف مع أول سؤال';
    }
  }

  function renderDirector(raw) {
    const director = normalizeDirector(raw);
    directorState = director;
    stage.dataset.view = director.view;
    stage.dataset.merged = String(director.merged);
    stage.classList.toggle('hide-scores', !director.layers.scores);
    stage.classList.toggle('hide-awards', !director.layers.awards);
    stage.classList.toggle('hide-branding', !director.layers.branding);
    node('studioGiftLabel').textContent = director.giftLabel || 'لحظة الهدية';
    node('studioGiftName').textContent = director.giftName || 'بانتظار لحظة مميزة';
    node('studioGiftMeta').textContent = director.giftName ? 'لحظة يختارها المخرج' : 'هدية المشاهدين تصنع لحظات البرنامج';
    node('studioWeeklyLeader').textContent = director.weeklyLeader || 'لم يتم التحديد';
    node('studioRoundStar').textContent = director.roundStar || 'لم يتم التحديد';
  }

  function setConnection(mode) {
    const serverLive = mode === 'server';
    const localLive = mode === 'local';
    connection.classList.toggle('is-live', serverLive);
    connection.classList.toggle('is-local', localLive);
    connection.classList.toggle('is-offline', !serverLive && !localLive);
    connectionText.textContent = serverLive
      ? 'مصدر الخادم متصل · OBS مستقل عن تبويبات اللعبة'
      : localLive ? 'معاينة محلية فقط · قناة الخادم غير متاحة' : 'مصدر اللعبة متوقف · آخر لقطة محفوظة';
    const notice = node('studioOfflineNotice');
    notice.hidden = serverLive;
    notice.textContent = localLive
      ? 'تنبيه تشغيل: هذا تحديث محلي فقط؛ تحقق من اتصال الخادم قبل الاعتماد على المشهد في OBS.'
      : 'مصدر التحديث متوقف. يحتفظ المشهد بآخر لقطة صالحة حتى عودة المصدر.';
  }

  function setTikTokConnection(live, message) {
    tiktokConnection.classList.toggle('is-live', Boolean(live));
    tiktokConnection.classList.toggle('is-offline', !live);
    tiktokConnectionText.textContent = message || (live ? 'TikTok LIVE متصل' : 'هدايا TikTok غير متصلة');
  }

  function acceptGame(event) {
    const message = event && event.data;
    if (!message || message.channel !== GAME_CHANNEL || message.type !== 'snapshot') return;
    const snapshotBuilder = window.WCQOutputSnapshot;
    const safeSnapshot = snapshotBuilder && typeof snapshotBuilder.normalize === 'function'
      ? snapshotBuilder.normalize(message.snapshot)
      : null;
    const snapshot = normalizeGame(safeSnapshot);
    if (!snapshot) return;
    lastGameLocalAt = Date.now();
    try { localStorage.setItem(GAME_CACHE, JSON.stringify(safeSnapshot)); } catch (error) {}
    renderGame(snapshot);
    updateConnectionStatus();
  }

  function acceptDirector(event) {
    const message = event && event.data;
    if (!message || message.channel !== DIRECTOR_CHANNEL || message.type !== 'director') return;
    acceptDirectorState(message.state, message.sentAt);
  }

  function acceptDirectorState(raw, sentAtValue) {
    const payload = raw && typeof raw === 'object' && raw.state && typeof raw.state === 'object' ? raw : null;
    const state = payload ? payload.state : raw;
    const sentAt = Number(payload ? payload.sentAt : sentAtValue) || 0;
    if (sentAt && sentAt < lastDirectorSentAt) return;
    renderDirector(state);
    if (sentAt) lastDirectorSentAt = sentAt;
  }

  async function pollServerGame() {
    try {
      const response = await fetch('/api/output-snapshot', { cache: 'no-store' });
      if (response.status === 204) {
        lastGameServerAt = 0;
        updateConnectionStatus();
        return;
      }
      if (!response.ok) throw new Error('game_snapshot_unavailable');
      const payload = await response.json();
      const snapshot = normalizeGame(payload && payload.snapshot);
      const updatedAt = Number(payload && payload.updatedAt) || 0;
      if (!snapshot || !updatedAt) throw new Error('game_snapshot_invalid');
      lastGameServerAt = updatedAt;
      if (!gameState || snapshot.sentAt >= gameState.sentAt) renderGame(snapshot);
    } catch (error) {
      lastGameServerAt = 0;
    }
    updateConnectionStatus();
  }

  async function pollServerDirector() {
    try {
      const response = await fetch('/api/studio-director-state', { cache: 'no-store' });
      if (!response.ok) throw new Error('director_state_unavailable');
      const payload = await response.json();
      const sentAt = Number(payload && payload.sentAt) || 0;
      if (payload && Number(payload.updatedAt) > 0 && payload.state && sentAt >= lastDirectorSentAt) {
        acceptDirectorState(payload.state, sentAt);
        try { localStorage.setItem(DIRECTOR_CACHE, JSON.stringify({ state: directorState, sentAt })); } catch (error) {}
      }
    } catch (error) {
      // Keep the last valid director state; the game-source status is shown independently.
    }
  }

  function updateConnectionStatus() {
    const serverAge = Date.now() - lastGameServerAt;
    const localAge = Date.now() - lastGameLocalAt;
    if (lastGameServerAt && serverAge >= 0 && serverAge <= STALE_AFTER_MS) setConnection('server');
    else if (lastGameLocalAt && localAge >= 0 && localAge <= STALE_AFTER_MS) setConnection('local');
    else setConnection('offline');
  }

  function renderLeaderboard(payload) {
    const entries = payload && Array.isArray(payload.gifts) ? payload.gifts : [];
    const top = entries.find((item) => item && safeText(item.name || item.uniqueId, 36));
    if (!top) {
      node('studioLiveStar').textContent = 'بانتظار التفاعل';
      node('studioLiveStarMeta').textContent = 'يظهر الترتيب عند وصول البيانات';
      return;
    }
    node('studioLiveStar').textContent = safeText(top.name || top.uniqueId, 36);
    const value = safeNumber(top.count, 0, 100000000, 0);
    node('studioLiveStarMeta').textContent = value ? `متصدر الهدايا · ${value} ماسة` : 'متصدر الهدايا المباشر';
  }

  function showGift(payload) {
    if (!payload || typeof payload !== 'object') return;
    const sender = safeText(payload.name || payload.uniqueId || 'مشاهد كريم', 36);
    const gift = safeText(payload.gift || payload.giftKey || 'هدية', 28);
    const count = safeNumber(payload.count, 1, 9999, 1);
    const detail = `أهدى ${gift}${count > 1 ? ` × ${count}` : ''}`;
    node('studioGiftLabel').textContent = 'هدية مباشرة';
    node('studioGiftName').textContent = sender;
    node('studioGiftMeta').textContent = detail;
    node('giftSpotlightName').textContent = sender;
    node('giftSpotlightDetail').textContent = detail;
    const spotlight = node('giftSpotlight');
    spotlight.hidden = false;
    spotlight.classList.remove('gift-spotlight');
    void spotlight.offsetWidth;
    spotlight.classList.add('gift-spotlight');
    node('studioGiftCard').classList.remove('is-live-gift');
    void node('studioGiftCard').offsetWidth;
    node('studioGiftCard').classList.add('is-live-gift');
    window.clearTimeout(giftTimer);
    window.clearTimeout(giftRestoreTimer);
    giftTimer = window.setTimeout(() => {
      spotlight.hidden = true;
      node('studioGiftCard').classList.remove('is-live-gift');
    }, 4300);
    giftRestoreTimer = window.setTimeout(() => {
      if (directorState) {
        node('studioGiftLabel').textContent = directorState.giftLabel || 'لحظة الهدية';
        node('studioGiftName').textContent = directorState.giftName || 'بانتظار لحظة مميزة';
        node('studioGiftMeta').textContent = directorState.giftName ? 'لحظة يختارها المخرج' : 'هدية المشاهدين تصنع لحظات البرنامج';
      }
    }, 5200);
  }

  function initLiveEvents() {
    if (typeof EventSource !== 'function') return;
    try {
      const events = new EventSource('/live/events');
      events.onmessage = (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch (error) { return; }
        if (!message || typeof message.type !== 'string') return;
        if (message.type === 'hello') {
          const connected = Boolean(message.payload && message.payload.connected);
          setTikTokConnection(connected, connected ? 'TikTok LIVE متصل' : 'TikTok بانتظار الاتصال');
        } else if (message.type === 'gift') {
          showGift(message.payload);
        } else if (message.type === 'leaderboard-update') {
          renderLeaderboard(message.payload);
        }
      };
      events.onerror = () => setTikTokConnection(false, 'بيانات TikTok متوقفة · المشهد مستمر');
    } catch (error) {
      setTikTokConnection(false, 'هدايا TikTok غير متصلة · المشهد مستمر');
    }
  }

  try {
    const snapshotBuilder = window.WCQOutputSnapshot;
    const cachedRaw = JSON.parse(localStorage.getItem(GAME_CACHE) || 'null');
    const cachedSafe = snapshotBuilder && typeof snapshotBuilder.normalize === 'function'
      ? snapshotBuilder.normalize(cachedRaw)
      : null;
    const cachedGame = normalizeGame(cachedSafe);
    if (cachedGame) { renderGame(cachedGame); }
    if (cachedSafe) localStorage.setItem(GAME_CACHE, JSON.stringify(cachedSafe));
  } catch (error) {}
  try {
    const cachedDirector = JSON.parse(localStorage.getItem(DIRECTOR_CACHE) || 'null') || defaultDirector();
    acceptDirectorState(cachedDirector);
  } catch (error) { renderDirector(defaultDirector()); }

  try {
    if (typeof BroadcastChannel === 'function') {
      const gameChannel = new BroadcastChannel(GAME_CHANNEL);
      const directorChannel = new BroadcastChannel(DIRECTOR_CHANNEL);
      gameChannel.addEventListener('message', acceptGame);
      directorChannel.addEventListener('message', acceptDirector);
    }
  } catch (error) {}

  window.addEventListener('storage', (event) => {
    if (event.key === GAME_CACHE && event.newValue) {
      try {
        const snapshot = normalizeGame(JSON.parse(event.newValue));
        if (snapshot) {
          lastGameLocalAt = Date.now() - Math.max(0, Date.now() - snapshot.sentAt);
          renderGame(snapshot);
          updateConnectionStatus();
        }
      } catch (error) {}
    }
    if (event.key === DIRECTOR_CACHE && event.newValue) {
      try { acceptDirectorState(JSON.parse(event.newValue)); } catch (error) {}
    }
  });

  initLiveEvents();
  void pollServerGame();
  void pollServerDirector();
  window.setInterval(pollServerGame, 1000);
  window.setInterval(pollServerDirector, 1000);
  window.setInterval(updateConnectionStatus, 1000);
})();
