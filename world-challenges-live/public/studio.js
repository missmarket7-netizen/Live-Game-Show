(() => {
  'use strict';

  const GAME_CHANNEL = 'wcq-output-v1';
  const DIRECTOR_CHANNEL = 'wcq-studio-director-v1';
  const GAME_CACHE = 'lgs_output_last_snapshot_v1';
  const DIRECTOR_CACHE = 'wcq_studio_director_v1';
  const STALE_AFTER_MS = 6500;
  const node = (id) => document.getElementById(id);
  const stage = node('studioStage');
  const connection = node('studioConnection');
  const connectionText = node('studioConnectionText');
  let lastGameAt = 0;
  let gameState = null;

  const safeText = (value, max = 180) => String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  const safeNumber = (value, min, max, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };
  const defaultDirector = () => ({
    view: 'wide', merged: false,
    layers: { scores: true, awards: true, branding: true },
    giftLabel: 'لحظة الهدية', giftName: '', weeklyLeader: '', roundStar: ''
  });

  function normalizeDirector(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const layers = source.layers && typeof source.layers === 'object' ? source.layers : {};
    return {
      view: ['wide', 'scores', 'awards'].includes(source.view) ? source.view : 'wide',
      merged: Boolean(source.merged),
      layers: {
        scores: layers.scores !== false,
        awards: layers.awards !== false,
        branding: layers.branding !== false
      },
      giftLabel: safeText(source.giftLabel || 'لحظة الهدية', 32),
      giftName: safeText(source.giftName, 44),
      weeklyLeader: safeText(source.weeklyLeader, 28),
      roundStar: safeText(source.roundStar, 28)
    };
  }

  function normalizeGame(raw) {
    if (!raw || raw.schemaVersion !== 1 || typeof raw !== 'object') return null;
    const scores = raw.scores && typeof raw.scores === 'object' ? raw.scores : {};
    const question = raw.question && typeof raw.question === 'object' ? raw.question : {};
    const timer = raw.timer && typeof raw.timer === 'object' ? raw.timer : {};
    const captains = raw.captains && typeof raw.captains === 'object' ? raw.captains : {};
    const names = (items) => Array.isArray(items) ? items.map((name) => safeText(name, 40)).filter(Boolean).slice(0, 5) : [];
    const girls = Number(scores.girls);
    const boys = Number(scores.boys);
    const sentAt = Number(raw.sentAt);
    if (!Number.isFinite(girls) || !Number.isFinite(boys) || !Number.isFinite(sentAt)) return null;
    const duration = safeNumber(timer.durationSeconds, 1, 3600, 30);
    return {
      ready: Boolean(raw.ready),
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
      roundNumber: safeNumber(raw.roundNumber, 1, 999, 1)
    };
  }

  function setCaptains(id, names) {
    const target = node(id);
    if (!target) return;
    target.textContent = names.length ? names.slice(0, 2).join(' · ') : 'بانتظار التسمية';
    target.title = names.join('، ');
  }

  function renderGame(snapshot) {
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
    stage.dataset.view = director.view;
    stage.dataset.merged = String(director.merged);
    stage.classList.toggle('hide-scores', !director.layers.scores);
    stage.classList.toggle('hide-awards', !director.layers.awards);
    stage.classList.toggle('hide-branding', !director.layers.branding);
    node('studioGiftLabel').textContent = director.giftLabel || 'لحظة الهدية';
    node('studioGiftName').textContent = director.giftName || 'بانتظار لحظة مميزة';
    node('studioWeeklyLeader').textContent = director.weeklyLeader || 'لم يتم التحديد';
    node('studioRoundStar').textContent = director.roundStar || 'لم يتم التحديد';
  }

  function setConnection(live) {
    connection.classList.toggle('is-live', live);
    connection.classList.toggle('is-offline', !live);
    connectionText.textContent = live ? 'اللعبة متصلة · بث الحالة مباشر' : 'بانتظار لوحة اللعبة';
    node('studioOfflineNotice').hidden = live;
  }

  function acceptGame(event) {
    const message = event && event.data;
    if (!message || message.channel !== GAME_CHANNEL || message.type !== 'snapshot') return;
    const snapshot = normalizeGame(message.snapshot);
    if (!snapshot) return;
    lastGameAt = Date.now();
    try { localStorage.setItem(GAME_CACHE, JSON.stringify(message.snapshot)); } catch (error) {}
    renderGame(snapshot);
    setConnection(true);
  }

  function acceptDirector(event) {
    const message = event && event.data;
    if (!message || message.channel !== DIRECTOR_CHANNEL || message.type !== 'director') return;
    renderDirector(message.state);
  }

  try {
    const cachedGame = normalizeGame(JSON.parse(localStorage.getItem(GAME_CACHE) || 'null'));
    if (cachedGame) { renderGame(cachedGame); lastGameAt = cachedGame.sentAt; }
  } catch (error) {}
  try { renderDirector(JSON.parse(localStorage.getItem(DIRECTOR_CACHE) || 'null') || defaultDirector()); }
  catch (error) { renderDirector(defaultDirector()); }

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
        if (snapshot) { lastGameAt = Date.now(); renderGame(snapshot); setConnection(true); }
      } catch (error) {}
    }
    if (event.key === DIRECTOR_CACHE && event.newValue) {
      try { renderDirector(JSON.parse(event.newValue)); } catch (error) {}
    }
  });

  setConnection(Boolean(lastGameAt && Date.now() - lastGameAt <= STALE_AFTER_MS));
  window.setInterval(() => setConnection(Boolean(lastGameAt && Date.now() - lastGameAt <= STALE_AFTER_MS)), 1000);
})();
