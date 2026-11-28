(() => {
  'use strict';

  const node = (id) => document.getElementById(id);
  const stage = node('studioStage');
  const connection = node('studioConnection');
  const connectionText = node('studioConnectionText');
  const directorContract = window.WCQStudioV2State;
  const momentContract = window.WCQStudioMoment;
  const DIRECTOR_CHANNEL_NAME = 'wcq-studio-v2-director-v1';
  const DIRECTOR_CACHE_KEY = 'wcq_studio_v2_director_v1';
  const OUTPUT_CHANNEL_NAME = 'wcq-output-v1';
  const MOMENT_STORAGE_KEY = 'wcq_studio_v2_last_moment_id_v1';
  const POLL_DELAY_MS = 1000;
  const DIRECTOR_POLL_DELAY_MS = 1500;
  const STALE_AFTER_MS = 6500;
  const SAFE_MEDIA_PATH = /^\/(?:flags\/[a-z0-9][a-z0-9._-]*\.svg|guess\/[a-z0-9][a-z0-9._-]*\.jpe?g|name\/[a-z0-9][a-z0-9._-]*\.jpe?g)$/i;
  let lastSnapshotAt = 0;
  let lastSnapshotSourceId = '';
  let lastSnapshotSequence = 0;
  let lastUpdatedAt = 0;
  let hasValidSnapshot = false;
  let pollPending = false;
  let pollTimer = 0;
  let directorPollTimer = 0;
  let directorPollPending = false;
  let lastDirectorSentAt = 0;
  let directorChannel = null;
  let outputChannel = null;
  let momentNoticeTimer = 0;

  function safeSessionStorage() {
    try { return window.sessionStorage || null; }
    catch (error) { return null; }
  }

  const momentGate = momentContract && typeof momentContract.createGate === 'function'
    ? momentContract.createGate(safeSessionStorage(), MOMENT_STORAGE_KEY)
    : { accept: () => false };

  function text(value, limit = 320) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, limit);
  }

  function normalizeSnapshot(raw) {
    const contract = window.WCQOutputSnapshot;
    if (!contract || typeof contract.normalize !== 'function') return null;
    return contract.normalize(raw);
  }

  const cueLabels = {
    idle: 'استعداد', welcome: 'ترحيب', thanks: 'شكر', celebrate: 'فرح',
    win: 'فوز', loss: 'خسارة مرحة', laugh: 'ضحك', fun: 'فرفشة', dance: 'رقص'
  };

  function applyDirectorState(raw, sentAt) {
    if (!directorContract || typeof directorContract.normalize !== 'function') return;
    const timestamp = Number(sentAt);
    if (!Number.isFinite(timestamp) || timestamp <= lastDirectorSentAt) return;
    const state = directorContract.normalize(raw);
    lastDirectorSentAt = timestamp;
    stage.dataset.directorScene = state.scene;
    stage.dataset.presenterCue = state.presenterCue;
    const presenterCaption = node('presenterFallbackLabel');
    presenterCaption.textContent = `صورة ثابتة · إشارة المخرج: ${cueLabels[state.presenterCue]} · لا يوجد Rig متصل`;
    const layerNodes = {
      scoreboard: node('studioGirlsScore').closest('.scoreboard'),
      branding: document.querySelector('.brand-ribbon'),
      presenter: node('presenterSafeArea'),
      question: node('questionStage')
    };
    Object.entries(layerNodes).forEach(([name, element]) => {
      if (element) element.classList.toggle('director-layer-off', state.layers[name] === false);
    });
  }

  async function pollDirectorState() {
    if (directorPollPending) return;
    directorPollPending = true;
    try {
      const response = await fetch('/api/studio-v2-state', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('director_state_request_failed');
      const payload = await response.json();
      if (Number(payload && payload.updatedAt) > 0) applyDirectorState(payload.state, payload.sentAt);
    } catch (error) {
      // Keep the public scene on its safe defaults while the server is unavailable.
    } finally {
      directorPollPending = false;
      directorPollTimer = window.setTimeout(pollDirectorState, DIRECTOR_POLL_DELAY_MS);
    }
  }

  function acceptDirectorMessage(message) {
    if (!message || message.channel !== DIRECTOR_CHANNEL_NAME || message.type !== 'state') return;
    applyDirectorState(message.state, message.sentAt);
  }

  if (typeof BroadcastChannel === 'function') {
    try {
      directorChannel = new BroadcastChannel(DIRECTOR_CHANNEL_NAME);
      directorChannel.addEventListener('message', (event) => acceptDirectorMessage(event.data));
    } catch (error) { directorChannel = null; }
  }
  window.addEventListener('storage', (event) => {
    if (event.key !== DIRECTOR_CACHE_KEY || !event.newValue) return;
    try { acceptDirectorMessage(JSON.parse(event.newValue)); } catch (error) {}
  });

  function safeMediaPath(value) {
    if (typeof value !== 'string' || !SAFE_MEDIA_PATH.test(value)) return '';
    return value;
  }

  function setMedia(question) {
    const frame = node('questionMedia');
    const image = node('questionMediaImage');
    const fallback = node('questionMediaFallback');
    const src = safeMediaPath(question && question.mediaSrc);
    image.onerror = null;
    image.removeAttribute('src');
    image.alt = '';
    fallback.hidden = true;
    frame.hidden = !src;
    if (!src) return;

    image.alt = text(question.mediaAlt, 80) || (question.kind === 'flag' ? 'علم دولة للتخمين' : 'صورة للتخمين');
    image.onerror = () => {
      image.hidden = true;
      fallback.hidden = false;
      fallback.textContent = 'الصورة غير متاحة الآن · يستمر السؤال';
    };
    image.onload = () => {
      image.hidden = false;
      fallback.hidden = true;
    };
    image.hidden = false;
    image.src = src;
  }

  function renderOptions(options) {
    const list = node('studioQuestionOptions');
    list.replaceChildren();
    if (!Array.isArray(options) || options.length === 0) {
      list.hidden = true;
      return;
    }
    options.slice(0, 8).forEach((option) => {
      const item = document.createElement('li');
      item.textContent = text(option, 140);
      list.appendChild(item);
    });
    list.hidden = list.childElementCount === 0;
  }

  function renderSnapshot(snapshot) {
    const question = snapshot.question;
    const timer = snapshot.timer;
    const ready = Boolean(snapshot.ready);
    node('studioGirlsScore').textContent = String(snapshot.scores.girls);
    node('studioBoysScore').textContent = String(snapshot.scores.boys);
    node('studioRoundNumber').textContent = ready ? String(snapshot.roundNumber) : '—';
    node('studioQuestionCategory').textContent = text(question.category, 48) || (ready ? 'سؤال المواجهة' : 'بانتظار اللعبة');
    node('studioQuestionIndex').textContent = !ready
      ? 'بانتظار بدء اللعبة'
      : question.total
      ? `السؤال ${String(question.index || 1).padStart(2, '0')} / ${String(question.total).padStart(2, '0')}`
      : 'سؤال المواجهة';
    node('studioQuestionText').textContent = ready && text(question.text) ? text(question.text) : 'بانتظار بدء اللعبة…';

    setMedia(ready ? question : {});
    renderOptions(ready ? question.options : []);

    const remaining = Math.max(0, Math.min(3600, Number(timer.remainingSeconds) || 0));
    const duration = Math.max(1, Math.min(3600, Number(timer.durationSeconds) || 30));
    node('studioTimerValue').textContent = ready ? String(Math.ceil(remaining)).padStart(2, '0') : '—';
    node('studioTimerLabel').textContent = ready ? (timer.running ? 'الوقت يجري…' : 'لحظة التفكير') : 'بانتظار اللعبة';
    node('studioTimerProgress').style.width = ready ? `${Math.max(0, Math.min(100, remaining / duration * 100))}%` : '0%';
    node('studioTimerValueWrap').classList.toggle('is-urgent', ready && remaining > 0 && remaining <= 5);

    const timerExpired = ready && !timer.running && remaining <= 0;
    const released = ready && Boolean(text(question.answer, 160)) && (question.revealed || timerExpired);
    const answer = node('studioAnswer');
    const prompt = node('studioAnswerPrompt');
    node('studioAnswerText').textContent = released ? text(question.answer, 160) : '';
    answer.hidden = !released;
    prompt.hidden = !ready || released;
    prompt.textContent = ready ? 'فكّروا بسرعة… الإجابة مخفية حتى لحظة الكشف' : 'بانتظار بدء اللعبة';
    stage.dataset.questionKind = ['choice', 'free', 'flag', 'image-guess'].includes(question.kind) ? question.kind : 'free';
  }

  function momentLabel(moment) {
    const team = moment.team === 'girls' ? 'فريق البنات' : moment.team === 'boys' ? 'فريق الشباب' : '';
    if (moment.type === 'score') return team ? `تحديث نقاط ${team}` : 'تحديث النقاط';
    if (moment.type === 'round-win') return team ? `فوز ${team} بالجولة` : 'فوز في الجولة';
    if (moment.type === 'round-loss') return team ? `خسارة ${team} للجولة` : 'انتهت الجولة';
    if (moment.type === 'draw') return 'تعادل الجولة';
    if (moment.type === 'match-win') return team ? `فوز ${team} بالمباراة` : 'فوز في المباراة';
    return '';
  }

  function showMomentNotice(moment) {
    const label = momentLabel(moment || {});
    if (!label) return;
    const notice = node('studioMomentNotice');
    if (!notice || !momentGate.accept(moment)) return;
    clearTimeout(momentNoticeTimer);
    notice.textContent = label;
    notice.hidden = false;
    momentNoticeTimer = window.setTimeout(() => {
      notice.hidden = true;
      momentNoticeTimer = 0;
    }, 4000);
  }

  function setConnection(isLive, message) {
    connection.classList.toggle('is-live', isLive);
    connection.classList.toggle('is-offline', !isLive);
    connectionText.textContent = message;
    const notice = node('studioOfflineNotice');
    notice.hidden = isLive || !hasValidSnapshot;
  }

  function updateConnection() {
    const age = Date.now() - lastUpdatedAt;
    const live = lastUpdatedAt > 0 && age >= 0 && age <= STALE_AFTER_MS;
    if (live) setConnection(true, 'لقطة اللعبة متصلة');
    else if (hasValidSnapshot) setConnection(false, 'المصدر متوقف · آخر لقطة محفوظة');
    else setConnection(false, 'بانتظار بداية اللعبة');
  }

  function acceptSnapshot(rawSnapshot, updatedAt) {
    const snapshot = normalizeSnapshot(rawSnapshot);
    const timestamp = Number(updatedAt);
    if (!snapshot || !Number.isFinite(timestamp) || timestamp <= 0) return false;
    const samePublisher = Boolean(snapshot.sourceId && snapshot.sourceId === lastSnapshotSourceId);
    const isNewer = !hasValidSnapshot
      || (samePublisher
        ? Number.isSafeInteger(snapshot.sequence)
          && snapshot.sequence > lastSnapshotSequence
          && snapshot.sentAt >= lastSnapshotAt
        : snapshot.sentAt > lastSnapshotAt);
    if (isNewer) {
      renderSnapshot(snapshot);
      showMomentNotice(snapshot.moment);
      lastSnapshotAt = snapshot.sentAt;
      lastSnapshotSourceId = snapshot.sourceId || '';
      lastSnapshotSequence = Number.isSafeInteger(snapshot.sequence) ? snapshot.sequence : 0;
      hasValidSnapshot = true;
    }
    lastUpdatedAt = Math.max(lastUpdatedAt, timestamp);
    return true;
  }

  function acceptOutputMessage(message) {
    if (!message || message.channel !== OUTPUT_CHANNEL_NAME || message.type !== 'snapshot') return;
    acceptSnapshot(message.snapshot, message.snapshot && message.snapshot.sentAt);
    updateConnection();
  }

  if (typeof BroadcastChannel === 'function') {
    try {
      outputChannel = new BroadcastChannel(OUTPUT_CHANNEL_NAME);
      outputChannel.addEventListener('message', (event) => acceptOutputMessage(event.data));
      outputChannel.postMessage({ channel: OUTPUT_CHANNEL_NAME, type: 'request-snapshot' });
    } catch (error) { outputChannel = null; }
  }

  async function pollSnapshot() {
    if (pollPending) return;
    pollPending = true;
    try {
      const response = await fetch('/api/output-snapshot', {
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (response.status === 204) {
        return;
      }
      if (!response.ok) throw new Error('snapshot_request_failed');
      const payload = await response.json();
      const updatedAt = Number(payload && payload.updatedAt);
      if (!acceptSnapshot(payload && payload.snapshot, updatedAt)) throw new Error('snapshot_payload_invalid');
    } catch (error) {
      if (!lastUpdatedAt || Date.now() - lastUpdatedAt > STALE_AFTER_MS) lastUpdatedAt = 0;
    } finally {
      pollPending = false;
      updateConnection();
      pollTimer = window.setTimeout(pollSnapshot, POLL_DELAY_MS);
    }
  }

  const presenterImage = node('presenterImage');
  presenterImage.addEventListener('error', () => {
    presenterImage.hidden = true;
    node('presenterFallbackLabel').hidden = true;
    node('presenterUnavailable').hidden = false;
  }, { once: true });

  window.addEventListener('online', () => {
    if (pollTimer) window.clearTimeout(pollTimer);
    pollTimer = 0;
    pollSnapshot();
    if (directorPollTimer) window.clearTimeout(directorPollTimer);
    directorPollTimer = 0;
    pollDirectorState();
  });

  window.addEventListener('pagehide', () => {
    if (pollTimer) window.clearTimeout(pollTimer);
    if (directorPollTimer) window.clearTimeout(directorPollTimer);
    if (momentNoticeTimer) window.clearTimeout(momentNoticeTimer);
    if (directorChannel) directorChannel.close();
    if (outputChannel) outputChannel.close();
  }, { once: true });

  updateConnection();
  pollSnapshot();
  pollDirectorState();
})();
