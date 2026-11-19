(() => {
  'use strict';

  const CHANNEL_NAME = 'wcq-output-v1';
  const CACHE_KEY = 'lgs_output_last_snapshot_v1';
  const STALE_AFTER_MS = 5500;
  const node = (id) => document.getElementById(id);
  const statusNode = node('connectionStatus');
  const statusText = node('connectionText');
  let lastServerAt = 0;
  let lastLocalAt = 0;
  let lastSnapshot = null;

  function normalizeSnapshot(raw) {
    const contract = window.WCQOutputSnapshot;
    return contract && typeof contract.normalize === 'function' ? contract.normalize(raw) : null;
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
    const answer = node('answerText');
    if (answer) {
      answer.textContent = snapshot.question.answer || '';
      answer.hidden = !snapshot.question.answer;
    }
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

  function setStatus(mode) {
    if (!statusNode || !statusText) return;
    const serverLive = mode === 'server';
    const localOnly = mode === 'local';
    statusNode.classList.toggle('is-live', serverLive);
    statusNode.classList.toggle('is-local', localOnly);
    statusNode.classList.toggle('is-stale', mode === 'stale');
    statusText.textContent = serverLive ? 'تحديث مستقل عبر الخادم'
      : localOnly ? 'تحديث محلي فقط · OBS غير مضمون'
        : 'التحديث متوقف';
  }

  function currentConnectionMode() {
    const now = Date.now();
    const fresh = (timestamp) => timestamp > 0 && now >= timestamp && now - timestamp <= STALE_AFTER_MS;
    if (fresh(lastServerAt)) return 'server';
    if (fresh(lastLocalAt)) return 'local';
    return 'stale';
  }

  function acceptSnapshot(raw, source, sourceUpdatedAt) {
    const snapshot = normalizeSnapshot(raw);
    if (!snapshot) return;
    if (lastSnapshot && snapshot.sentAt < lastSnapshot.sentAt) return;
    const publishedAt = Number(sourceUpdatedAt);
    if (source === 'server') {
      if (Number.isFinite(publishedAt) && publishedAt > 0) lastServerAt = publishedAt;
    } else {
      lastLocalAt = snapshot.sentAt;
    }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot)); } catch (storageError) {}
    renderSnapshot(snapshot);
    setStatus(currentConnectionMode());
  }

  function acceptMessage(event) {
    const message = event && event.data;
    if (!message || message.channel !== CHANNEL_NAME || message.type !== 'snapshot') return;
    acceptSnapshot(message.snapshot, 'local');
  }

  async function pollIndependentSnapshot() {
    try {
      const response = await fetch('/api/output-snapshot', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      if (response.status === 204) return;
      const payload = await response.json();
      acceptSnapshot(payload && payload.snapshot, 'server', payload && payload.updatedAt);
    } catch (networkError) {}
  }

  try {
    const cached = normalizeSnapshot(JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'));
    if (cached) renderSnapshot(cached);
  } catch (storageError) {}

  try {
    if (typeof BroadcastChannel === 'function') {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener('message', acceptMessage);
      channel.postMessage({ channel: CHANNEL_NAME, type: 'request-snapshot' });
    }
  } catch (channelError) {}

  setStatus('stale');
  pollIndependentSnapshot();
  window.setInterval(pollIndependentSnapshot, 1000);
  window.setInterval(() => {
    setStatus(currentConnectionMode());
  }, 1000);
})();
