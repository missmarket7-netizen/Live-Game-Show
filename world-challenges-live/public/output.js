(() => {
  'use strict';

  const CHANNEL_NAME = 'wcq-output-v1';
  const CACHE_KEY = 'lgs_output_last_snapshot_v1';
  const STALE_AFTER_MS = 5500;
  const node = (id) => document.getElementById(id);
  const statusNode = node('connectionStatus');
  const statusText = node('connectionText');
  let lastMessageAt = 0;
  let lastSnapshot = null;

  function safeText(value, maxLength) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  function safeNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }

  function normalizeSnapshot(raw) {
    if (!raw || raw.schemaVersion !== 1 || typeof raw !== 'object') return null;
    const scores = raw.scores && typeof raw.scores === 'object' ? raw.scores : {};
    const question = raw.question && typeof raw.question === 'object' ? raw.question : {};
    const timer = raw.timer && typeof raw.timer === 'object' ? raw.timer : {};
    const captains = raw.captains && typeof raw.captains === 'object' ? raw.captains : {};
    const names = (items) => Array.isArray(items) ? items.map((name) => safeText(name, 48)).filter(Boolean).slice(0, 5) : [];
    const sentAt = safeNumber(raw.sentAt, 0, Date.now() + 5000, 0);
    if (!sentAt || !Number.isFinite(Number(scores.girls)) || !Number.isFinite(Number(scores.boys))) return null;
    return {
      schemaVersion: 1,
      sentAt,
      ready: Boolean(raw.ready),
      scores: {
        girls: safeNumber(scores.girls, -9999, 9999, 0),
        boys: safeNumber(scores.boys, -9999, 9999, 0)
      },
      question: { text: safeText(question.text, 320) },
      timer: {
        remainingSeconds: safeNumber(timer.remainingSeconds, 0, 3600, 0),
        durationSeconds: safeNumber(timer.durationSeconds, 1, 3600, 30),
        running: Boolean(timer.running)
      },
      captains: { girls: names(captains.girls), boys: names(captains.boys) }
    };
  }

  function renderCaptains(container, names) {
    if (!container) return;
    container.replaceChildren();
    if (!names.length) {
      const empty = document.createElement('span');
      empty.className = 'captain-empty';
      empty.textContent = 'بانتظار التسمية';
      container.appendChild(empty);
      return;
    }
    names.forEach((name) => {
      const label = document.createElement('span');
      label.textContent = name;
      container.appendChild(label);
    });
  }

  function renderSnapshot(snapshot) {
    lastSnapshot = snapshot;
    node('girlsScore').textContent = String(snapshot.scores.girls);
    node('boysScore').textContent = String(snapshot.scores.boys);
    node('questionText').textContent = snapshot.ready && snapshot.question.text
      ? snapshot.question.text
      : 'جاهزون؟ بانتظار بداية المنافسة';
    node('timerValue').textContent = snapshot.ready
      ? String(snapshot.timer.remainingSeconds).padStart(2, '0')
      : '--';
    node('timerState').textContent = snapshot.timer.running ? 'الوقت جارٍ' : 'المؤقت متوقف';
    const progress = snapshot.ready
      ? Math.max(0, Math.min(100, (snapshot.timer.remainingSeconds / snapshot.timer.durationSeconds) * 100))
      : 0;
    node('timerProgress').style.width = progress + '%';
    renderCaptains(node('girlsCaptains'), snapshot.captains.girls);
    renderCaptains(node('boysCaptains'), snapshot.captains.boys);
  }

  function setStatus(isLive) {
    if (!statusNode || !statusText) return;
    statusNode.classList.toggle('is-live', isLive);
    statusNode.classList.toggle('is-stale', !isLive);
    statusText.textContent = isLive ? 'تحديث مباشر' : 'التحديث متوقف';
  }

  function acceptMessage(event) {
    const message = event && event.data;
    if (!message || message.channel !== CHANNEL_NAME || message.type !== 'snapshot') return;
    const snapshot = normalizeSnapshot(message.snapshot);
    if (!snapshot) return;
    lastMessageAt = Date.now();
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot)); } catch (storageError) {}
    renderSnapshot(snapshot);
    setStatus(true);
  }

  try {
    const cached = normalizeSnapshot(JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'));
    if (cached) renderSnapshot(cached);
  } catch (storageError) {}

  try {
    if (typeof BroadcastChannel === 'function') {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener('message', acceptMessage);
    }
  } catch (channelError) {}

  setStatus(false);
  window.setInterval(() => {
    setStatus(Boolean(lastMessageAt && Date.now() - lastMessageAt <= STALE_AFTER_MS));
  }, 1000);
})();
