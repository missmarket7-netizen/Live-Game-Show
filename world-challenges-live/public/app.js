/* ═══ عالم التحديات — Clean Production Build v18 ═══ */
const state = {
  mode: 'single', questions: [], fullShowRounds: [], currentRoundIndex: 0, currentIndex: 0,
  girlsScore: 0, boysScore: 0, girlsRounds: 0, boysRounds: 0,
  timerDuration: 30, timerValue: 30, timerInterval: null, isTimerRunning: false, isRevealed: false,
  soundEnabled: false, activeGift: null, questionHistory: [], showStartedAt: 0, showClockInterval: null,
  fullShowDuration: 120, shieldGirls: false, shieldBoys: false, roundNumber: 1, isLoadingMore: false,
  x2Active: false, captains: { girls: ['', '', '', '', ''], boys: ['', '', '', '', ''] }
};
const SAVED_KEY = 'lgs_saved_sets_v7';
const HISTORY_KEY = 'lgs_question_history_v7';
const SOUND_KEY = 'lgs_sound_v7';
const THEME_KEY = 'lgs_theme_v1';
const $ = (id) => document.getElementById(id);
const safeOn = (id, evt, fn) => { const el = $(id); if (el) el.addEventListener(evt, fn); return el; };
const $$ = (s) => Array.from(document.querySelectorAll(s));
const soundFiles = {
  'gift-rose': ['gift-rose'], 'gift-donut': ['gift-dount', 'gift-donut'], 'gift-corgi': ['gift-corgi'],
  'gift-heart': ['gift-heart'], 'gift-tiktok': ['gift-tiktok'], 'gift-cat': ['gift-cat'],
  'gift-crown': ['gift-crown'], begin: ['begin'], end: ['end'], learn: ['learn'], 'boys-mood': ['boys-mood'],
  'girls-captin': ['girls-captin'], 'boys-captin': ['boys-captin'], 'girls-galaxy': ['girls-galaxy'],
  'boys-galaxy': ['boys-galaxy'], 'girls-wheel': ['girls-wheel', 'girls-galaxy'], 'boys-wheel': ['boys-wheel', 'boys-galaxy'],
  girls2captin: ['girls2captin', 'girls-captin'], captin2boys: ['captin2boys', 'boys-captin'],
  'girls-round': ['girls-round'], 'boys-round': ['boys-round'], 'girls-lose': ['girls-lose'], 'boys-lose': ['boys-lose'],
  'girls-win': ['girls-win'], 'boys-win': ['boys-win'], Longway: ['longway', 'Longway'],
  'girls-replay-boys': ['girls-replay-boys'], 'boys-replay-girls': ['boys-replay-girls'],
  advice: ['advice'], teamwork: ['teamwork'], boom: ['boom'], days: ['days'],
  'kont-feen': ['kont-feen'], fight: ['fight'], tick: ['tick'], correct: ['correct'], wrong: ['wrong'],
  laugh: ['laugh'], celebration: ['celebration'], cheer: ['cheer'], 'community-love': ['community-love', 'celebration']
};
const audioCache = {};
const categoryEmoji = {
  'معلومات عامة': '🧠', 'جغرافيا': '🌍', 'علوم': '🔬', 'تاريخ': '📜', 'دين': '🕌',
  'أسئلة دينية': '🕌', 'ألغاز': '🧩', 'لغز': '🧩', 'رياضة': '⚽', 'تكنولوجيا': '⌘',
  'سرعة': '⚡', 'اختيارات متنوعة': '◈'
};

/* __WEBAUDIO_V1__ — الصوت عبر Web Audio: تشغيل أكثر استقراراً داخل الصفحة */
let audioCtx = null;
const bufferPromises = {};
const activeSources = {};

function getCtx() {
  if (audioCtx) return audioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    audioCtx = new AC({ latencyHint: 'interactive' });
  } catch (e) {
    audioCtx = null;
  }
  return audioCtx;
}

function unlockAudio() {
  const ctx = getCtx();
  if (ctx && ctx.state !== 'running') {
    try {
      ctx.resume();
    } catch (e) {}
  }
}

['pointerdown', 'touchstart', 'click', 'keydown'].forEach((evt) => {
  document.addEventListener(evt, unlockAudio, { passive: true });
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) unlockAudio();
});

function decodeBuf(ctx, arrayBuffer) {
  return new Promise((resolve, reject) => {
    const result = ctx.decodeAudioData(arrayBuffer, resolve, reject);
    if (result && typeof result.then === 'function') {
      result.then(resolve, reject);
    }
  });
}

function loadBuffer(key) {
  if (bufferPromises[key]) return bufferPromises[key];

  const ctx = getCtx();
  const candidates = soundFiles[key] || [key];

  bufferPromises[key] = (async () => {
    if (!ctx) return null;

    for (let i = 0; i < candidates.length; i += 1) {
      try {
        const res = await fetch('/sounds/' + candidates[i] + '.mp3');
        if (!res.ok) continue;
        const arrayBuffer = await res.arrayBuffer();
        return await decodeBuf(ctx, arrayBuffer);
      } catch (e) {
        // جرّب المرشح التالي
      }
    }

    return null;
  })();

  return bufferPromises[key];
}

function preloadSounds(keys) {
  const list = keys || Object.keys(soundFiles);
  list.reduce((chain, key) => chain.then(() => loadBuffer(key)), Promise.resolve());
}

function startBuffer(key, buffer, volume, onEnd) {
  const ctx = getCtx();
  if (!ctx || !buffer) return false;

  try {
    const previous = activeSources[key];
    if (previous) {
      previous.onended = null;
      try {
        previous.stop();
      } catch (e) {}
    }

    const sourceNode = ctx.createBufferSource();
    const gainNode = ctx.createGain();

    gainNode.gain.value = volume;
    sourceNode.buffer = buffer;
    sourceNode.connect(gainNode);
    gainNode.connect(ctx.destination);

    sourceNode.onended = () => {
      if (activeSources[key] === sourceNode) {
        delete activeSources[key];
      }
      if (onEnd) onEnd();
    };

    activeSources[key] = sourceNode;
    sourceNode.start(0);
    return true;
  } catch (e) {
    return false;
  }
}

/* احتياطي فقط إذا فشل Web Audio */
function getAudio(key) {
  if (audioCache[key]) return audioCache[key];

  const candidates = soundFiles[key] || [key];
  const audio = new Audio('/sounds/' + candidates[0] + '.mp3');
  audio.preload = 'none';

  let index = 0;
  audio.addEventListener('error', () => {
    index += 1;
    if (index < candidates.length) {
      audio.src = '/sounds/' + candidates[index] + '.mp3';
    }
  });

  audioCache[key] = audio;
  return audio;
}

function htmlPlay(key, volume, onEnd) {
  try {
    const audio = getAudio(key);
    audio.currentTime = 0;
    audio.volume = volume;
    audio.onended = onEnd || null;
    audio.onerror = onEnd || null;
    audio.play().catch(() => {
      if (onEnd) onEnd();
    });
  } catch (e) {
    if (onEnd) onEnd();
  }
}

function playSound(key, volume) {
  if (!state.soundEnabled) return;

  const safeVolume = volume == null ? 0.55 : volume;
  unlockAudio();

  if (!getCtx()) {
    htmlPlay(key, safeVolume);
    return;
  }

  loadBuffer(key).then((buffer) => {
    if (!state.soundEnabled) return;
    if (!startBuffer(key, buffer, safeVolume)) {
      htmlPlay(key, safeVolume);
    }
  });
}

function playSequential(keys, onDone) {
  const step = (index) => {
    if (index >= keys.length) {
      if (onDone) onDone();
      return;
    }

    if (!state.soundEnabled) {
      step(index + 1);
      return;
    }

    const next = () => step(index + 1);
    const key = keys[index];

    unlockAudio();

    if (!getCtx()) {
      htmlPlay(key, 0.75, next);
      return;
    }

    loadBuffer(key).then((buffer) => {
      if (!startBuffer(key, buffer, 0.75, next)) {
        htmlPlay(key, 0.75, next);
      }
    });
  };

  step(0);
}

/* تحميل مسبق للمؤثرات الأساسية بعد أول لمسة */
document.addEventListener('pointerdown', function preloadOnce() {
  document.removeEventListener('pointerdown', preloadOnce);
  preloadSounds([
    'tick',
    'correct',
    'wrong',
    'begin',
    'girls-round',
    'boys-round',
    'girls-lose',
    'boys-lose',
    'celebration',
    'girls-captin',
    'boys-captin'
  ]);
}, { passive: true });

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  const b = $('themeToggleBtn');
  if (b) b.textContent = (t === 'light') ? '🌙' : '☀️';
}

function currentTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) { return 'dark'; }
}

function toggleTheme() {
  applyTheme(currentTheme() === 'light' ? 'dark' : 'light');
}

function initTheme() {
  if (!$('themeToggleBtn')) {
    const b = document.createElement('button');
    b.id = 'themeToggleBtn';
    b.type = 'button';
    b.className = 'theme-toggle-btn';
    b.addEventListener('click', toggleTheme);
    document.body.appendChild(b);
  }
  applyTheme(currentTheme());
}

function getSavedSets() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch (e) { return []; }
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; }
}

function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(state.questionHistory.slice(-400)));
}

function saveQuestionSet(questions, meta) {
  meta = meta || {};
  const sets = getSavedSets();
  sets.unshift({
    id: Date.now(),
    date: new Date().toLocaleString('ar-SA'),
    questions: questions,
    category: meta.category || 'اختيارات متنوعة',
    difficulty: meta.difficulty || 'متوسط',
    count: questions.length,
    source: meta.source || 'local'
  });
  localStorage.setItem(SAVED_KEY, JSON.stringify(sets.slice(0, 20)));
  updateSavedCount();
}

function updateSavedCount() {
  const el = $('savedCount');
  if (el) el.textContent = getSavedSets().length;
}

function escapeHtml(v) {
  return String(v).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  localStorage.setItem(SOUND_KEY, String(state.soundEnabled));
  updateSoundButtons();
  if (state.soundEnabled) {
    const s = $('setupScreen');
    if (s && !s.classList.contains('hidden')) playSound('begin', 0.35);
  }
}

function updateSoundButtons() {
  const glyph = state.soundEnabled ? '◉' : '○';
  ['setupSoundBtn', 'soundToggle'].forEach((id) => {
    if ($(id)) {
      $(id).textContent = glyph;
      $(id).classList.toggle('sound-on', state.soundEnabled);
    }
  });
}

function showScreen(id) {
  $$('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  ensureSoundButtonVisible();
}

function showLoading(msg) {
  if ($('loadingText')) $('loadingText').textContent = msg;
  if ($('loadingOverlay')) $('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
  if ($('loadingOverlay')) $('loadingOverlay').classList.add('hidden');
}

function showToast(text, kicker) {
  if (!kicker) kicker = 'SHOW CONTROL';
  if ($('captainToastKicker')) $('captainToastKicker').textContent = kicker;
  if ($('captainToastText')) $('captainToastText').textContent = text;
  if ($('captainToast')) $('captainToast').classList.remove('hidden');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => { if ($('captainToast')) $('captainToast').classList.add('hidden'); }, 3100);
}

function formatClock() {
  const sec = Math.floor((Date.now() - state.showStartedAt) / 1000);
  return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
}

function startShowClock() {
  state.showStartedAt = Date.now();
  clearInterval(state.showClockInterval);
  state.showClockInterval = setInterval(() => {
    if ($('showClock')) $('showClock').textContent = formatClock();
  }, 1000);
}

function updateScores() {
  if ($('girlsScoreValue')) $('girlsScoreValue').textContent = state.girlsScore;
  if ($('boysScoreValue')) $('boysScoreValue').textContent = state.boysScore;
  if ($('girlsProgress')) $('girlsProgress').style.width = Math.min(100, Math.max(0, state.girlsScore) * 20) + '%';
  if ($('boysProgress')) $('boysProgress').style.width = Math.min(100, Math.max(0, state.boysScore) * 20) + '%';
  if ($('girlsRoundsWon')) $('girlsRoundsWon').textContent = state.girlsRounds + ' جولات';
  if ($('boysRoundsWon')) $('boysRoundsWon').textContent = state.boysRounds + ' جولات';
  if ($('roundResults')) $('roundResults').textContent = state.girlsRounds + ' - ' + state.boysRounds;
  if ($('roundDisplay')) $('roundDisplay').textContent = 'الجولة ' + state.roundNumber;
  if ($('teamShieldGirls')) $('teamShieldGirls').classList.toggle('hidden', !state.shieldGirls);
  if ($('teamShieldBoys')) $('teamShieldBoys').classList.toggle('hidden', !state.shieldBoys);
}

function updateTimer() {
  if ($('timerDisplay')) $('timerDisplay').textContent = state.timerValue;
  if ($('timerRing')) $('timerRing').classList.toggle('urgent', state.timerValue <= 3 && state.timerValue > 0);
}

function stopTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  state.isTimerRunning = false;
  if ($('startTimerBtn')) $('startTimerBtn').disabled = false;
}

function startTimer() {
  if (state.isTimerRunning || state.isRevealed) return;
  state.isTimerRunning = true;
  $('startTimerBtn').disabled = true;
  state.timerValue = state.timerDuration;
  updateTimer();
  playSound('tick', 0.25);
  state.timerInterval = setInterval(() => {
    state.timerValue -= 1;
    updateTimer();
    if (state.timerValue > 0 && state.timerValue <= 3) playSound('tick', 0.24);
    if (state.timerValue <= 0) {
      stopTimer();
      playSound('wrong', 0.35);
      showToast('انتهى الوقت — اكشف الإجابة!', 'TIME UP');
    }
  }, 1000);
}
/* ═══ شريط الراعي الرسمي ═══ */
function injectSponsor() {
  const html = '<div class="sponsor-strip"><img src="/images/qaddaha.png" alt="قدها؟"><div class="ss-text"><small>الراعي الرسمي</small><strong>قدها؟</strong></div></div>';
  [['setupScreen', '.setup-topbar'], ['gameScreen', '.live-topbar'], ['resultsScreen', '.results-hero']].forEach((pair) => {
    const screen = document.getElementById(pair[0]);
    if (!screen) return;
    if (screen.querySelector('.sponsor-strip')) return;
    const anchor = screen.querySelector(pair[1]);
    if (!anchor) return;
    anchor.insertAdjacentHTML('afterend', html);
  });
}

function expandCaptainSlots() {
  $$('.captain-slots').forEach((host) => {
    const firstInput = host.querySelector('.captain-input');
    if (!firstInput) return;
    const team = firstInput.getAttribute('data-team');
    while (host.children.length < 5) {
      const slot = host.children[0].cloneNode(true);
      const idx = host.children.length;
      const inp = slot.querySelector('.captain-input');
      inp.value = '';
      inp.classList.remove('confirmed');
      inp.setAttribute('data-slot', String(idx));
      slot.querySelector('.captain-done').addEventListener('click', () => confirmCaptain(team, String(idx)));
      host.appendChild(slot);
    }
  });
}

function isFreeQuestion(q) {
  return !q || !Array.isArray(q.options) || q.options.length === 0;
}

/* ═══ عرض السؤال والإجابة المخفية ═══ */
function renderQuestion() {
  const q = state.questions[state.currentIndex];
  if (!q) return;
  stopTimer();
  state.isRevealed = false;
  state.timerValue = state.timerDuration;
  updateTimer();
  updateScores();
  $('roundProgress').textContent = String(state.currentIndex + 1).padStart(2, '0') + ' / ' + String(state.questions.length).padStart(2, '0');
  $('questionCounter').textContent = 'السؤال ' + String(state.currentIndex + 1).padStart(2, '0') + ' / ' + String(state.questions.length).padStart(2, '0');
  $('questionNumber').textContent = String(state.currentIndex + 1).padStart(2, '0');
  $('categoryBadge').textContent = (categoryEmoji[q.category] || '◈') + ' ' + (q.category || 'اختيارات متنوعة');
  $('questionText').textContent = q.question;
  $('answerText').textContent = '—';
  $('explanationText').textContent = '—';
  $('answerReveal').classList.add('hidden');
  $('revealBtn').disabled = false;
  $('nextBtn').disabled = false;
  $('sourceBadge').textContent = q.source === 'ai' ? 'AI BANK READY' : 'LOCAL BANK READY';
  $('questionSource').textContent = q.source === 'ai' ? 'AUTO-SAVED / AI' : 'AUTO-SAVED';
  const grid = $('optionsGrid');
  grid.innerHTML = '';
  const pill = document.createElement('div');
  pill.className = 'think-pill';
  pill.textContent = isFreeQuestion(q)
    ? '⚡ سؤال سرعة — إجابة حرة، الحكم للمضيف'
    : '🤔 فكّروا جيدا… الإجابة الصحيحة تظهر عند «كشف الإجابة»';
  grid.appendChild(pill);
  const card = document.querySelector('.question-card');
  if (card) {
    card.classList.remove('enter');
    void card.offsetWidth;
    card.classList.add('enter');
  }
  $$('.gift-button').forEach((b) => b.classList.remove('is-active'));
  $('activeGiftBanner').classList.add('hidden');
}

function revealAnswer() {
  if (state.isRevealed) return;
  const q = state.questions[state.currentIndex];
  if (!q) return;
  state.isRevealed = true;
  stopTimer();
  if (isFreeQuestion(q)) {
    $('answerText').textContent = '🎤 إجابة حرة — الحكم للمضيف';
  } else {
    $('answerText').textContent = String.fromCharCode(65 + q.correctIndex) + '. ' + q.options[q.correctIndex];
  }
  $('explanationText').textContent = q.explanation || 'معلومة إضافية للمقدم.';
  $('answerReveal').classList.remove('hidden');
  $('answerReveal').classList.add('reveal-anim');
  $('revealBtn').disabled = true;
}

/* ═══ نظام الهدايا والدروع ═══ */
function closeGiftBanner() {
  state.activeGift = null;
  $('activeGiftBanner').classList.add('hidden');
  $$('.gift-button').forEach((b) => b.classList.remove('is-active'));
}

function selectGift(gift) {
  state.activeGift = gift;
  $$('.gift-button').forEach((b) => b.classList.toggle('is-active', b.dataset.gift === gift));
  if (gift === 'galaxy' || gift === 'wheel' || gift === 'heart' || gift === 'donut' || gift === 'corgi') {
    const tipMap = {
      heart: 'اختر الفريق لتفعيل درع الحماية',
      donut: 'اختر الفريق (الجولة للبنات دائما)',
      corgi: 'اختر الفريق (10 جولات للبنات دائما)',
      galaxy: 'اختر الفريق (+50 جولة)',
      wheel: 'اختر الفريق (+100 جولة)'
    };
    $('activeGiftText').textContent = tipMap[gift];
    $('activeGiftBanner').classList.remove('hidden');
    playSound('tick', 0.28);
    return;
  }
  if (gift === 'rose') {
    subtractPoint('boys', true);
    playSound('gift-rose', 0.6);
  } else if (gift === 'tiktok') {
    subtractPoint('girls', true);
    playSound('gift-tiktok', 0.6);
  } else if (gift === 'cat') {
    state.boysRounds += 1;
    state.girlsScore = 0;
    state.boysScore = 0;
    playSound('gift-cat', 0.65);
    showToast('+1 جولة لفريق الشباب', 'GIFT LOCKED');
    updateScores();
  } else if (gift === 'crown') {
    state.boysRounds += 10;
    state.girlsScore = 0;
    state.boysScore = 0;
    playSound('gift-crown', 0.65);
    showToast('+10 جولات لفريق الشباب', 'GIFT LOCKED');
    updateScores();
  }
  setTimeout(() => {
    state.activeGift = null;
    $$('.gift-button').forEach((b) => b.classList.remove('is-active'));
  }, 450);
}

function resolveGift(team) {
  const gift = state.activeGift;
  if (!gift) return;
  if (gift === 'heart') {
    if (team === 'girls') state.shieldGirls = true;
    else state.shieldBoys = true;
    playSound('gift-heart', 0.7);
    showToast('درع الحماية لفريق ' + (team === 'girls' ? 'البنات' : 'الشباب'), 'PROTECTION ON');
    closeGiftBanner();
    updateScores();
    return;
  }
  if (gift === 'donut') {
    state.girlsRounds += 1;
    state.girlsScore = 0;
    state.boysScore = 0;
    playSound(team === 'girls' ? 'gift-donut' : 'gift-cat', 0.65);
    showToast('+1 جولة لفريق البنات', 'GIFT LOCKED');
    closeGiftBanner();
    updateScores();
    return;
  }
  if (gift === 'corgi') {
    state.girlsRounds += 10;
    state.girlsScore = 0;
    state.boysScore = 0;
    playSound(team === 'girls' ? 'gift-corgi' : 'gift-crown', 0.65);
    showToast('+10 جولات لفريق البنات', 'GIFT LOCKED');
    closeGiftBanner();
    updateScores();
    return;
  }
  const addAmount = gift === 'galaxy' ? 50 : 100;
  if (team === 'girls') {
    state.girlsRounds += addAmount;
    playSound('girls-wheel', 0.7);
  } else {
    state.boysRounds += addAmount;
    playSound('boys-wheel', 0.7);
  }
  showToast('+' + addAmount + ' جولة لفريق ' + (team === 'girls' ? 'البنات' : 'الشباب'), 'GIFT LOCKED');
  state.girlsScore = 0;
  state.boysScore = 0;
  closeGiftBanner();
  updateScores();
}

function subtractPoint(team, viaGift) {
  if ((team === 'girls' && state.shieldGirls) || (team === 'boys' && state.shieldBoys)) {
    playSound('gift-heart', 0.4);
    showToast('فريق ' + (team === 'girls' ? 'البنات' : 'الشباب') + ' محمي بالدرع', 'SHIELD ACTIVE');
    return;
  }
  if (team === 'girls') state.girlsScore = Math.max(-5, state.girlsScore - 1);
  else state.boysScore = Math.max(-5, state.boysScore - 1);
  updateScores();
  if (!viaGift) playSound('wrong', 0.25);
}

/* ═══ قصاصات النقاط الموجهة (بنات = الجانب الأيمن، شباب = الجانب الأيسر) ═══ */
function burstAt(team) {
  const isGirls = team === 'girls';
  const W = window.innerWidth;
  const H = window.innerHeight;
  const colors = isGirls
    ? ['#ff4f9a', '#ff83bd', '#ffd36e', '#ffffff']
    : ['#35e6f7', '#5de2ff', '#ffd36e', '#ffffff'];
  const dir = isGirls ? -1 : 1; // البنات يتحركن للداخل من اليمين، الشباب من اليسار
  for (let i = 0; i < 40; i++) {
    const bit = document.createElement('i');
    bit.className = 'point-bit-direct';
    // يبدأ داخل شريط ضيق عند حافة الجانب الخاص بالفريق
    const edgeOffset = 12 + Math.random() * 70;
    const startX = isGirls ? W - edgeOffset : edgeOffset;
    const startY = H * (0.12 + Math.random() * 0.7);
    bit.style.left = startX + 'px';
    bit.style.top = startY + 'px';
    bit.style.background = colors[i % colors.length];
    document.body.appendChild(bit);
    // حركة أفقية قصيرة للداخل فيبقى القصاص في جانبه، وسقوط للأسفل
    const driftX = dir * (30 + Math.random() * 130);
    const driftY = 60 + Math.random() * 220;
    const rot = Math.random() * 720 - 360;
    const dur = 1100 + Math.random() * 600;
    const done = (function (b) { return function () { b.remove(); }; })(bit);
    if (bit.animate) {
      bit.animate([
        { transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', opacity: 1 },
        { transform: 'translate(calc(-50% + ' + (driftX * 0.5) + 'px), calc(-50% - ' + (30 + Math.random() * 50) + 'px)) scale(1.1) rotate(' + (rot * 0.5) + 'deg)', opacity: 1, offset: 0.3 },
        { transform: 'translate(calc(-50% + ' + driftX + 'px), calc(-50% + ' + driftY + 'px)) scale(.3) rotate(' + rot + 'deg)', opacity: 0 }
      ], { duration: dur, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = done;
    } else {
      setTimeout(done, 1300);
    }
  }
}

function applyPoint(team, points) {
  if (!points) points = 1;
  if (team === 'girls') {
    state.girlsScore = state.girlsScore < 0
      ? Math.min(0, state.girlsScore + points)
      : Math.min(5, state.girlsScore + points);
  } else {
    state.boysScore = state.boysScore < 0
      ? Math.min(0, state.boysScore + points)
      : Math.min(5, state.boysScore + points);
  }
  updateScores();
  playSound('correct', 0.28);
  burstAt(team);
  if (state.girlsScore >= 5 || state.boysScore >= 5) {
    showToast('اكتملت 5 نقاط! اضغط «الجولة التالية»', 'ROUND READY');
  }
}

/* ═══ إنهاء الجولة مع دعم X2 ═══ */
function finishRound() {
  stopTimer();
  const card = document.querySelector('.question-card');
  if (card) {
    card.classList.remove('round-sweep-host');
    void card.offsetWidth;
    card.classList.add('round-sweep-host');
  }
  let winnerMsg = 'تعادل رائع بين الفريقين';
  const multiplier = state.x2Active ? 2 : 1;
  if (state.girlsScore >= 5 || (state.girlsScore > state.boysScore && state.girlsScore > 0)) {
    state.girlsRounds += multiplier;
    winnerMsg = 'فوز فريق البنات' + (multiplier > 1 ? ' (×2!)' : '');
    playSequential(['girls-round', 'boys-lose']);
  } else if (state.boysScore >= 5 || (state.boysScore > state.girlsScore && state.boysScore > 0)) {
    state.boysRounds += multiplier;
    winnerMsg = 'فوز فريق الشباب' + (multiplier > 1 ? ' (×2!)' : '');
    playSequential(['boys-round', 'girls-lose']);
  } else {
    playSound('girls-round', 0.35);
  }
  state.x2Active = false;
  updateScores();
  $('roundEndNumber').textContent = 'الجولة ' + state.roundNumber;
  $('roundEndWinner').textContent = winnerMsg;
  $('roundEndGirlsScore').textContent = state.girlsScore;
  $('roundEndBoysScore').textContent = state.boysScore;
  $('roundEndOverlay').classList.remove('hidden');
  fireConfetti();
  state.shieldGirls = false;
  state.shieldBoys = false;
  state.girlsScore = 0;
  state.boysScore = 0;
  updateScores();
}

function continueAfterRound() {
  $('roundEndOverlay').classList.add('hidden');
  state.roundNumber += 1;
  if (state.mode === 'fullshow' && state.currentRoundIndex < state.fullShowRounds.length - 1) {
    state.currentRoundIndex += 1;
    state.questions = state.fullShowRounds[state.currentRoundIndex].questions;
    state.currentIndex = 0;
    updateScores();
    renderQuestion();
    showToast('نبدأ الجولة ' + state.roundNumber, 'NEXT ROUND');
    return;
  }
  loadMoreQuestions();
}

function nextQuestion() {
  if (!state.isRevealed) {
    showToast('اكشف الإجابة أولا ثم انتقل', 'HOST TIP');
    return;
  }
  if (state.currentIndex < state.questions.length - 1) {
    state.currentIndex += 1;
    renderQuestion();
    startTimer();
  } else {
    loadMoreQuestions();
  }
}

async function loadMoreQuestions() {
  if (state.isLoadingMore) return;
  state.isLoadingMore = true;
  showLoading('نحمّل أسئلة جديدة — الجولة مستمرة...');
  try {
    const avoidList = state.questionHistory.concat(state.questions.map((qq) => qq.question)).slice(-150);
    const qs = await fetchQuestions({ category: 'اختيارات متنوعة', difficulty: 'متوسط', count: 10, avoid: avoidList });
    if (qs.length > 0) {
      state.questions = state.questions.concat(qs);
      state.questionHistory = state.questionHistory.concat(qs.map((qq) => qq.question)).slice(-400);
      saveHistory();
      state.currentIndex += 1;
      renderQuestion();
      startTimer();
      showToast('تمت إضافة ' + qs.length + ' أسئلة — الجولة مستمرة', 'BANK LOADED');
    } else {
      showToast('لا أسئلة إضافية — اضغط «الجولة التالية»', 'SHOW CONTROL');
    }
  } catch (err) {
    showToast('تعذر التحميل — اضغط «الجولة التالية»', 'SHOW CONTROL');
  }
  hideLoading();
  state.isLoadingMore = false;
}
/* ═══ صفحة النتائج والفائزين ═══ */
function showResults() {
  stopTimer();
  showScreen('resultsScreen');
  $('finalGirlsScore').textContent = state.girlsRounds;
  $('finalBoysScore').textContent = state.boysRounds;
  const w = $('winnerText');
  let winSound = null;
  let team = null;
  if (state.girlsRounds > state.boysRounds) {
    w.textContent = 'فريق البنات فاز!';
    w.style.color = 'var(--pink-hot)';
    winSound = 'girls-win';
    team = 'girls';
  } else if (state.boysRounds > state.girlsRounds) {
    w.textContent = 'فريق الشباب فاز!';
    w.style.color = 'var(--cyan)';
    winSound = 'boys-win';
    team = 'boys';
  } else {
    w.textContent = 'تعادل أبطال الليلة';
    w.style.color = 'var(--gold-hot)';
    team = 'draw';
  }
  showWinnerLights(team);
  // ⛔ NO playSound('end') here — disabled per host request
  if (winSound && state.soundEnabled) playSound(winSound, 0.85);
  fireConfetti();
}

function fireConfetti() {
  const canvas = $('confettiCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const palette = ['#f45ca0', '#5de2ff', '#ffd36e', '#64ecad', '#917aff'];
  const particles = Array.from({ length: 105 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 100,
    size: 3 + Math.random() * 5,
    speed: 2 + Math.random() * 3.5,
    drift: (Math.random() - 0.5) * 2.6,
    spin: Math.random() * 6.28,
    color: palette[Math.floor(Math.random() * palette.length)],
    alpha: 1
  }));
  let frameCount = 0;
  const animateLoop = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let anyActive = false;
    particles.forEach((p) => {
      if (p.alpha <= 0) return;
      anyActive = true;
      p.y += p.speed;
      p.x += p.drift;
      p.spin += 0.08;
      p.alpha -= 0.006;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size * 1.5, p.size);
      ctx.restore();
    });
    if (anyActive && frameCount < 260) {
      frameCount += 1;
      requestAnimationFrame(animateLoop);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };
  animateLoop();
}

function bits(count, colorsArr) {
  let outputStr = '';
  for (let k = 0; k < count; k++) {
    const leftPos = Math.random() * 100;
    const delayVal = Math.random() * 1.8;
    const durVal = 2.2 + Math.random() * 1.8;
    const szVal = 6 + Math.random() * 8;
    outputStr += '<i style="left:' + leftPos + '%;width:' + szVal + 'px;height:' + (szVal * 1.45) + 'px;background:' + colorsArr[k % colorsArr.length] + ';animation-delay:' + delayVal + 's;animation-duration:' + durVal + 's"></i>';
  }
  return outputStr;
}

function showWinnerLights(teamType) {
  let overlayEl = document.getElementById('winnerLightsOverlay');
  if (!overlayEl) {
    overlayEl = document.createElement('div');
    overlayEl.id = 'winnerLightsOverlay';
    document.body.appendChild(overlayEl);
  }
  const isGirlsTeam = teamType === 'girls';
  const isBoysTeam = teamType === 'boys';
  const imgPath = isGirlsTeam ? '/images/girls.jpg' : isBoysTeam ? '/images/boys.jpg' : '/images/logo.png';
  const titleTxt = isGirlsTeam ? 'فريق البنات' : isBoysTeam ? 'فريق الشباب' : 'تعادل أبطال الليلة';
  const clrArr = isGirlsTeam
    ? ['#ff4f9a', '#ff83bd', '#ffd36e', '#ffffff']
    : isBoysTeam
      ? ['#35e6f7', '#5de2ff', '#ffd36e', '#ffffff']
      : ['#ffd36e', '#fff0a4', '#ff83bd', '#5de2ff'];
  overlayEl.className = 'winner-lights ' + (isGirlsTeam ? 'girls' : isBoysTeam ? 'boys' : 'draw');
  overlayEl.innerHTML = '<div class="wl-rays"></div><div class="wl-confetti">' + bits(38, clrArr) + '</div><div class="wl-card"><img src="' + imgPath + '" alt=""><strong>' + escapeHtml(titleTxt) + '</strong><span>WINNER NIGHT</span></div>';
  clearTimeout(showWinnerLights.tmout);
  showWinnerLights.tmout = setTimeout(() => {
    overlayEl.classList.add('out');
    setTimeout(() => {
      if (overlayEl && overlayEl.parentNode) overlayEl.remove();
    }, 700);
  }, 5200);
}

/* ═══ الكباتن وكشفهم بالأشعة ═══ */
function confirmCaptain(teamKey, slotIdx) {
  const inputEl = document.querySelector('.captain-input[data-team="' + teamKey + '"][data-slot="' + slotIdx + '"]');
  if (!inputEl) return;
  const captainName = inputEl.value.trim();
  if (!captainName) {
    showToast('اكتب اسم الكابتن أولا', 'HOST TIP');
    return;
  }
  inputEl.value = captainName;
  inputEl.classList.add('confirmed');
  state.captains[teamKey][slotIdx] = captainName;
  showCaptainReveal(captainName, teamKey);
  playSound(teamKey === 'girls' ? 'girls-captin' : 'boys-captin', 0.8);
}

function showCaptainReveal(nameStr, teamKey) {
  const overlayBox = $('captainRevealOverlay');
  if (!overlayBox) return;
  const girlSide = teamKey === 'girls';
  const picUrl = girlSide ? '/images/girls.jpg' : '/images/boys.jpg';
  const huePalette = girlSide
    ? ['#ff4f9a', '#ff83bd', '#ffd36e', '#ffffff']
    : ['#35e6f7', '#5de2ff', '#ffd36e', '#ffffff'];
  overlayBox.classList.remove('hidden', 'team-girls', 'team-boys');
  overlayBox.classList.add(girlSide ? 'team-girls' : 'team-boys');
  overlayBox.innerHTML =
    '<div class="cr-rays"></div>' +
    '<div class="cr-confetti">' + bits(30, huePalette) + '</div>' +
    '<div class="cr-card">' +
      '<img class="cr-team-img" src="' + picUrl + '" alt="">' +
      '<span class="captain-reveal-kicker">ON AIR CAPTAIN</span>' +
      '<h2>' + escapeHtml(nameStr) + '</h2>' +
    '</div>';
  clearTimeout(showCaptainReveal.tmout);
  showCaptainReveal.tmout = setTimeout(() => overlayBox.classList.add('hidden'), 10000);
}

/* ═══ زر X2 ونافذة الانتباه ═══ */
function activateX2() {
  state.x2Active = true;
  playSound('celebration', 0.85);
  setTimeout(() => playSound('tick', 0.6), 300);
  showX2AttentionOverlay();
}

function showX2AttentionOverlay() {
  let x2Overlay = document.getElementById('x2AttentionOverlay');
  if (!x2Overlay) {
    x2Overlay = document.createElement('div');
    x2Overlay.id = 'x2AttentionOverlay';
    document.body.appendChild(x2Overlay);
  }
  const goldHues = ['#ffd36e', '#fff0a4', '#ff83bd', '#5de2ff', '#ffffff'];
  x2Overlay.className = 'x2-overlay active';
  x2Overlay.innerHTML =
    '<div class="x2-rays"></div>' +
    '<div class="x2-confetti">' + bits(40, goldHues) + '</div>' +
    '<div class="x2-card">' +
      '<div class="x2-badge">×2</div>' +
      '<h2>جولة X2</h2>' +
      '<p>جولة لمضاعفة النقاط تؤجل استخدام الدعم</p>' +
      '<button id="x2CloseBtn" type="button">إغلاق</button>' +
    '</div>';
  const dismissBtn = document.getElementById('x2CloseBtn');
  if (dismissBtn) dismissBtn.addEventListener('click', hideX2Overlay);
  x2Overlay.addEventListener('click', (evtObj) => {
    if (evtObj.target === x2Overlay) hideX2Overlay();
  });
  clearTimeout(showX2AttentionOverlay.tmout);
  showX2AttentionOverlay.tmout = setTimeout(hideX2Overlay, 6000);
}

function hideX2Overlay() {
  const refEl = document.getElementById('x2AttentionOverlay');
  if (!refEl) return;
  refEl.classList.add('out');
  setTimeout(() => {
    if (refEl && refEl.parentNode) refEl.remove();
  }, 700);
}

function createX2Button() {
  if (document.getElementById('x2RoundBtn')) return;
  const deckArea = document.querySelector('.show-actions') || document.querySelector('.control-deck');
  if (!deckArea) return;
  const actionBtn = document.createElement('button');
  actionBtn.id = 'x2RoundBtn';
  actionBtn.type = 'button';
  actionBtn.className = 'text-control x2-special-btn';
  actionBtn.innerHTML = '<span>✦</span> جولة X2';
  actionBtn.addEventListener('click', activateX2);
  deckArea.insertBefore(actionBtn, deckArea.firstChild);
}

/* ═══ حركة محيطية فقط ═══ */
function initActivity() {
  if ($('liveActivity')) return;
  const ambientLayer = document.createElement('div');
  ambientLayer.id = 'liveActivity';
  ambientLayer.innerHTML = '<div class="act-marquee"><span id="actMarqueeText"></span></div><div class="act-eq"><i></i><i></i><i></i><i></i><i></i></div>';
  document.body.appendChild(ambientLayer);
  const tickerMessages = ['🔥 اللايف مشتعل', '🎁 اسحب هدية الآن', '👧 البنات ضد الشباب 👦', '🛡️ درع الحماية جاهز', '🏆 من سيفوز الليلة؟', '⭐ فعّل الصوت للتفاعل الكامل'];
  $('actMarqueeText').textContent = (tickerMessages.join(' • ') + ' • ').repeat(3);
}

/* ═══ جلب الأسئلة من السيرفر ═══ */
async function fetchQuestions(apiParams) {
  try {
    const respObj = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, apiParams, { avoid: (apiParams.avoid || state.questionHistory.slice(-150)) }))
    });
    if (!respObj.ok) throw new Error('API unavailable');
    const jsonBody = await respObj.json();
    const rawQs = Array.isArray(jsonBody.questions) ? jsonBody.questions : [];
    if (!rawQs.length) throw new Error('Empty');
    return rawQs.map((item) => Object.assign({}, item, { source: item.source || 'bank' }));
  } catch (fetchErr) {
    return [];
  }
}

async function fetchAIQuestions(aiParams) {
  try {
    const aiResp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, aiParams, { avoid: state.questionHistory.slice(-300) }))
    });
    if (!aiResp.ok) throw new Error('AI unavailable');
    const aiJson = await aiResp.json();
    const aiQs = Array.isArray(aiJson.questions) ? aiJson.questions : [];
    if (!aiQs.length) throw new Error('AI empty');
    return aiQs.map((entry) => Object.assign({}, entry, { source: 'ai' }));
  } catch (aiErr) {
    return [];
  }
}

const MIX_PLAN = [
  { title: 'الجولة 1', category: 'اختيارات متنوعة', difficulty: 'سهل', count: 10 },
  { title: 'الجولة 2', category: 'اختيارات متنوعة', difficulty: 'متوسط', count: 10 },
  { title: 'الجولة الذهبية', category: 'اختيارات متنوعة', difficulty: 'صعب', count: 10 }
];

function resetMatch() {
  state.currentIndex = 0;
  state.currentRoundIndex = 0;
  state.roundNumber = 1;
  state.girlsScore = 0;
  state.boysScore = 0;
  state.girlsRounds = 0;
  state.boysRounds = 0;
  state.shieldGirls = false;
  state.shieldBoys = false;
  state.x2Active = false;
}
async function aiSingleRound() {
  const chosenCat = $('category').value || 'اختيارات متنوعة';
  const chosenDiff = $('difficulty').value || 'متوسط';
  const chosenCnt = Math.max(3, Math.min(30, Number($('count').value) || 10));
  $('count').value = chosenCnt;
  showLoading('نولّد أسئلة AI جديدة خليط...');
  try {
    let generatedQs = await fetchAIQuestions({ category: chosenCat, difficulty: chosenDiff, count: chosenCnt });
    if (!generatedQs.length) generatedQs = await fetchQuestions({ category: chosenCat, difficulty: chosenDiff, count: chosenCnt });
    if (generatedQs.length > 0) {
      state.questions = generatedQs;
      state.fullShowRounds = [];
      state.mode = 'single';
      resetMatch();
      state.questionHistory = state.questionHistory.concat(generatedQs.map((gq) => gq.question)).slice(-400);
      saveHistory();
      saveQuestionSet(generatedQs, { category: chosenCat, difficulty: chosenDiff, source: generatedQs[0] ? generatedQs[0].source : 'local' });
      prepareGame();
      showToast(generatedQs[0] && generatedQs[0].source === 'ai' ? 'أسئلة AI جديدة — حُفظت تلقائيا' : 'تم السحب من البنك', 'STUDIO READY');
    } else {
      showToast('لا توجد أسئلة متاحة حاليا', 'SHOW CONTROL');
    }
  } catch (genErr) {
    showToast('تعذر تجهيز الجولة', 'SHOW CONTROL');
  }
  hideLoading();
}

async function aiFullShow() {
  state.fullShowRounds = [];
  showLoading('نولّد فصول اللايف بالـ AI...');
  try {
    for (let mi = 0; mi < MIX_PLAN.length; mi += 1) {
      $('loadingText').textContent = 'نجهز ' + MIX_PLAN[mi].title + ' — ' + (mi + 1) + ' / ' + MIX_PLAN.length;
      let batchQs = await fetchAIQuestions(MIX_PLAN[mi]);
      if (!batchQs.length) batchQs = await fetchQuestions(MIX_PLAN[mi]);
      state.fullShowRounds.push(Object.assign({}, MIX_PLAN[mi], { questions: batchQs }));
      state.questionHistory = state.questionHistory.concat(batchQs.map((bq) => bq.question)).slice(-400);
    }
    saveHistory();
    saveQuestionSet(state.fullShowRounds.flatMap((rd) => rd.questions), { category: 'لايف كامل', difficulty: 'متدرج', source: 'ai' });
    state.mode = 'fullshow';
    state.questions = state.fullShowRounds[0].questions;
    resetMatch();
    prepareGame();
    showToast('لايف AI خليط جاهز — محفوظ تلقائيا', 'STUDIO READY');
  } catch (fullErr) {
    showToast('تعذر تجهيز اللايف', 'SHOW CONTROL');
  }
  hideLoading();
}

async function bankFullShowMixed() {
  state.fullShowRounds = [];
  showLoading('نرتب فصول اللايف من البنك (خليط)...');
  try {
    for (let bi = 0; bi < MIX_PLAN.length; bi += 1) {
      $('loadingText').textContent = 'نجهز ' + MIX_PLAN[bi].title + ' — ' + (bi + 1) + ' / ' + MIX_PLAN.length;
      const bankBatch = await fetchQuestions(MIX_PLAN[bi]);
      state.fullShowRounds.push(Object.assign({}, MIX_PLAN[bi], { questions: bankBatch }));
      state.questionHistory = state.questionHistory.concat(bankBatch.map((bb) => bb.question)).slice(-400);
    }
    saveHistory();
    saveQuestionSet(state.fullShowRounds.flatMap((br) => br.questions), { category: 'لايف كامل', difficulty: 'متدرج' });
    state.mode = 'fullshow';
    state.questions = state.fullShowRounds[0].questions;
    resetMatch();
    prepareGame();
  } catch (bankFullErr) {
    showToast('تعذر تجهيز اللايف', 'SHOW CONTROL');
  }
  hideLoading();
}

async function bankSingleRound() {
  const bankCat = $('category').value || 'اختيارات متنوعة';
  const bankDiff = $('difficulty').value || 'متوسط';
  const bankCnt = Math.max(3, Math.min(30, Number($('count').value) || 10));
  $('count').value = bankCnt;
  showLoading('نجهز الأسئلة من البنك...');
  try {
    const pulledQs = await fetchQuestions({ category: bankCat, difficulty: bankDiff, count: bankCnt });
    if (pulledQs.length > 0) {
      state.questions = pulledQs;
      state.fullShowRounds = [];
      state.mode = 'single';
      resetMatch();
      state.questionHistory = state.questionHistory.concat(pulledQs.map((pq) => pq.question)).slice(-400);
      saveHistory();
      saveQuestionSet(pulledQs, { category: bankCat, difficulty: bankDiff, source: pulledQs[0] ? pulledQs[0].source : 'local' });
      prepareGame();
    } else {
      showToast('لا توجد أسئلة متاحة حاليا', 'SHOW CONTROL');
    }
  } catch (pullErr) {
    showToast('تعذر تجهيز الجولة', 'SHOW CONTROL');
  }
  hideLoading();
}

document.addEventListener('click', (clickEvt) => {
  const genTarget = clickEvt.target.closest('#generateBtn');
  if (genTarget) {
    clickEvt.stopPropagation();
    clickEvt.preventDefault();
    if (state.mode === 'fullshow') aiFullShow();
    else aiSingleRound();
    return;
  }
  const savedTarget = clickEvt.target.closest('#savedStartBtn');
  if (savedTarget) {
    clickEvt.stopPropagation();
    clickEvt.preventDefault();
    if (state.mode === 'fullshow') bankFullShowMixed();
    else bankSingleRound();
    return;
  }
}, true);

function prepareGame() {
  updateScores();
  showScreen('gameScreen');
  startShowClock();
  renderQuestion();
  createX2Button();
  playSound('begin', 0.75);
}

function renderSavedList() {
  const storedSets = getSavedSets();
  const listBox = $('savedList');
  updateSavedCount();
  if (!storedSets.length) {
    listBox.innerHTML = '<div class="saved-empty">لا توجد جولات محفوظة بعد.</div>';
    return;
  }
  listBox.innerHTML = storedSets.map((setItem) =>
    '<article class="saved-item">' +
      '<div class="saved-item-title">' + escapeHtml(setItem.category) + ' — ' + escapeHtml(setItem.difficulty) + ' <span>(' + setItem.count + ')</span></div>' +
      '<div class="saved-item-meta">' + escapeHtml(setItem.date) + ' · ' + (setItem.source === 'ai' ? 'AI GENERATED' : 'LOCAL BANK') + '</div>' +
      '<div class="saved-item-actions">' +
        '<button class="saved-item-btn saved-item-use" data-use="' + setItem.id + '" type="button">استخدام</button>' +
        '<button class="saved-item-btn saved-item-delete" data-delete="' + setItem.id + '" type="button">حذف</button>' +
      '</div>' +
    '</article>'
  ).join('');
  $$('[data-use]').forEach((useBtn) => useBtn.addEventListener('click', () => useSavedSet(Number(useBtn.dataset.use))));
  $$('[data-delete]').forEach((delBtn) => delBtn.addEventListener('click', () => deleteSavedSet(Number(delBtn.dataset.delete))));
}

function openSaved() {
  renderSavedList();
  $('savedModal').classList.remove('hidden');
}

function useSavedSet(targetId) {
  const matchedSet = getSavedSets().find((ss) => ss.id === targetId);
  if (!matchedSet) return;
  state.questions = matchedSet.questions;
  state.fullShowRounds = [];
  state.mode = 'single';
  resetMatch();
  $('savedModal').classList.add('hidden');
  prepareGame();
}

function deleteSavedSet(removeId) {
  const remaining = getSavedSets().filter((rs) => rs.id !== removeId);
  localStorage.setItem(SAVED_KEY, JSON.stringify(remaining));
  renderSavedList();
}

/* ═══ طبقة تيك توك ═══ */
function liveEsc(rawVal) {
  return String(rawVal).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function showFollowWelcome(followName, followAvatar, followUid) {
  const prevCard = document.getElementById('liveFollowCard');
  if (prevCard) prevCard.remove();
  const welcomeCard = document.createElement('div');
  welcomeCard.id = 'liveFollowCard';
  welcomeCard.className = 'live-follow-card';
  welcomeCard.innerHTML =
    '<div class="lfc-heart">💖</div>' +
    (followAvatar ? '<img class="lfc-avatar" src="' + liveEsc(followAvatar) + '" alt="">' : '') +
    '<div class="lfc-text">' +
      '<small>متابع جديد انضم للعائلة</small>' +
      '<strong>' + liveEsc(followName) + '</strong>' +
      (followUid ? '<span>@' + liveEsc(followUid) + '</span>' : '') +
      '<span>نورت يا ' + liveEsc(followName) + ' 💖</span>' +
    '</div>';
  document.body.appendChild(welcomeCard);
  playSound('girls-captin', 0.7);
  setTimeout(() => welcomeCard.classList.add('out'), 4200);
  setTimeout(() => welcomeCard.remove(), 4800);
}

function communityBurst(commName, commAvatar, commUid, commGift, commCount) {
  fireConfetti();
  playSound('community-love', 0.8);
  showToast('💞 ' + commName + ' انضم لمجتمعك الخاص!' + (commGift ? ' (🎁 ' + commGift + (commCount > 1 ? ' ×' + commCount : '') + ')' : ''), 'COMMUNITY');
}

function renderLiveStats(statsJson) {
  let statsChip = document.getElementById('liveStatsChip');
  if (!statsChip) {
    statsChip = document.createElement('div');
    statsChip.id = 'liveStatsChip';
    document.body.appendChild(statsChip);
  }
  const topLike = statsJson.likes && statsJson.likes[0];
  const topShare = statsJson.shares && statsJson.shares[0];
  statsChip.innerHTML =
    '<div class="ls-row"><span class="ls-ico">👍</span><span>الأكثر إعجابا:</span><strong>' + (topLike ? liveEsc(topLike.name) + ' (' + topLike.count + ')' : '—') + '</strong></div>' +
    '<div class="ls-row"><span class="ls-ico">📤</span><span>الأكثر مشاركة:</span><strong>' + (topShare ? liveEsc(topShare.name) + ' (' + topShare.count + ')' : '—') + '</strong></div>';
}

function startLeaderboardPoll() {
  setInterval(() => {
    fetch('/live/leaderboard')
      .then((lbRes) => lbRes.json())
      .then((lbData) => { if (lbData && lbData.enabled) renderLiveStats(lbData); })
      .catch(() => {});
  }, 15000);
}

function connectLiveStream() {
  if (!window.EventSource) return;
  const eventStream = new EventSource('/live/events');
  eventStream.onmessage = (msgEvent) => {
    let parsedMsg;
    try { parsedMsg = JSON.parse(msgEvent.data); } catch (parseErr) { return; }
    if (parsedMsg.type === 'follow') showFollowWelcome(parsedMsg.payload.name, parsedMsg.payload.avatar, parsedMsg.payload.uniqueId);
    else if (parsedMsg.type === 'community') communityBurst(parsedMsg.payload.name, parsedMsg.payload.avatar, parsedMsg.payload.uniqueId, parsedMsg.payload.gift, parsedMsg.payload.count);
  };
}

/* ═══ ضمان ظهور زر المؤثرات في كل الشاشات ═══ */
function ensureSoundButtonVisible() {
  // التموضع والظهور مضمونان من CSS؛ هنا نتأكد فقط أن الأزرار غير مخفية
  ['floatingSoundBtn', 'floatingSoundBtnResults'].forEach((bid) => {
    const b = $(bid);
    if (b) b.classList.remove('hidden');
  });
}

function watchScreensForSoundBtn() {
  ['setupScreen', 'gameScreen', 'resultsScreen'].forEach((scrId) => {
    const scrElement = document.getElementById(scrId);
    if (!scrElement || !window.MutationObserver) return;
    new MutationObserver(ensureSoundButtonVisible).observe(scrElement, { attributes: true, attributeFilter: ['class'] });
  });
  ensureSoundButtonVisible();
}

function fixTimerPills() {
  const timerRow = Array.from(document.querySelectorAll('.option-row')).find((tr) => /وقت الإجابة/.test(tr.textContent));
  if (!timerRow) return;
  const pillGroup = timerRow.querySelector('.pill-group');
  if (!pillGroup) return;
  pillGroup.innerHTML = '';
  ['20', '30', '40'].forEach((tv) => {
    const tb = document.createElement('button');
    tb.type = 'button';
    tb.className = 'pill' + (tv === '30' ? ' is-active' : '');
    tb.dataset.timer = tv;
    tb.textContent = tv + ' ث';
    pillGroup.appendChild(tb);
  });
}

function patchGiftImages() {
  const giftConfigs = {
    rose: { img: '/images/gift-rose.png', small: '−1 شباب' },
    donut: { img: '/images/gift-donut.png', small: '+1 جولة' },
    corgi: { img: '/images/gift-corgi.png', small: '+10 جولات' },
    heart: { img: '/images/gift-heart.png', label: 'درع الحماية', small: 'حماية الفريق' },
    galaxy: { img: '/images/gift-galaxy.png', small: '+50 جولة' },
    wheel: { img: '/images/gift-whale.png', fallback: '/images/gift-wheel.png', small: '+100 جولة' },
    tiktok: { img: '/images/gift-tiktok.png', small: '−1 بنات' },
    cat: { img: '/images/gift-cat.png', fallbackEmoji: '🐱', small: '+1 جولة' },
    crown: { img: '/images/gift-crown.png', fallbackEmoji: '👑', small: '+10 جولات' }
  };
  $$('.gift-button').forEach((gbtn) => {
    const cfgEntry = giftConfigs[gbtn.dataset.gift];
    if (!cfgEntry) return;
    gbtn.innerHTML = '';
    const imgNode = document.createElement('img');
    imgNode.className = 'gift-img';
    imgNode.alt = gbtn.dataset.gift || 'هدية';
    imgNode.src = cfgEntry.img;
    if (cfgEntry.fallback) imgNode.addEventListener('error', () => { imgNode.src = cfgEntry.fallback; }, { once: true });
    if (cfgEntry.fallbackEmoji) imgNode.addEventListener('error', () => {
      const emojiSpan = document.createElement('span');
      emojiSpan.className = 'gift-art';
      emojiSpan.textContent = cfgEntry.fallbackEmoji;
      emojiSpan.style.fontSize = '20px';
      emojiSpan.style.lineHeight = '1';
      imgNode.replaceWith(emojiSpan);
    }, { once: true });
    gbtn.appendChild(imgNode);
    if (cfgEntry.label) {
      const lblNode = document.createElement('span');
      lblNode.className = 'gift-name';
      lblNode.textContent = cfgEntry.label;
      gbtn.appendChild(lblNode);
    }
    if (cfgEntry.small) {
      const smNode = document.createElement('small');
      smNode.textContent = cfgEntry.small;
      gbtn.appendChild(smNode);
    }
  });
}

function cleanCaptainSection() {
  $$('.captain-command .command-heading').forEach((hdEl) => hdEl.remove());
  const cmdPanel = document.querySelector('.captain-command');
  if (cmdPanel) { cmdPanel.style.paddingTop = '6px'; cmdPanel.style.marginTop = '0'; }
  const colWrap = document.querySelector('.captain-columns');
  if (colWrap) colWrap.style.marginTop = '0';
}

function removeMusicMenus() { /* تم تعطيله للحفاظ على زر المؤثرات */ }

/* ═══ الربط والتشغيل الرئيسي ═══ */
function initSetup() {
  $$('.mode-tab').forEach((tabEl) => tabEl.addEventListener('click', () => {
    $$('.mode-tab').forEach((otherTab) => otherTab.classList.remove('is-active'));
    tabEl.classList.add('is-active');
    state.mode = tabEl.dataset.mode;
    if ($('fullShowOptions')) $('fullShowOptions').hidden = state.mode !== 'fullshow';
    if ($('categoryField')) $('categoryField').hidden = state.mode === 'fullshow';
  }));
  $$('.stepper-btn').forEach((sb) => sb.addEventListener('click', () => {
    const cntInput = $('count');
    if (!cntInput) return;
    const curVal = Number(cntInput.value) || 10;
    cntInput.value = Math.max(3, Math.min(30, curVal + (sb.dataset.action === 'plus' ? 1 : -1)));
  }));
  $$('[data-duration]').forEach((dp) => dp.addEventListener('click', () => {
    $$('[data-duration]').forEach((odp) => odp.classList.remove('is-active'));
    dp.classList.add('is-active');
    state.fullShowDuration = Number(dp.dataset.duration);
  }));
  $$('[data-timer]').forEach((tp) => tp.addEventListener('click', () => {
    $$('[data-timer]').forEach((otp) => otp.classList.remove('is-active'));
    tp.classList.add('is-active');
    state.timerDuration = Number(tp.dataset.timer);
    state.timerValue = state.timerDuration;
  }));
  safeOn('savedQuestionsBtn', 'click', openSaved);
  safeOn('setupSoundBtn', 'click', toggleSound);
}

function initGame() {
  safeOn('soundToggle', 'click', toggleSound);
  safeOn('startTimerBtn', 'click', startTimer);
  safeOn('revealBtn', 'click', revealAnswer);
  safeOn('nextBtn', 'click', nextQuestion);
  safeOn('girlsPlusBtn', 'click', () => applyPoint('girls'));
  safeOn('girlsMinusBtn', 'click', () => subtractPoint('girls'));
  safeOn('boysPlusBtn', 'click', () => applyPoint('boys'));
  safeOn('boysMinusBtn', 'click', () => subtractPoint('boys'));
  safeOn('nextRoundBtn', 'click', finishRound);
  safeOn('endGameBtn', 'click', showResults);
  safeOn('newRoundBtn', 'click', () => { stopTimer(); showScreen('setupScreen'); });
  $$('.gift-button').forEach((gb) => gb.addEventListener('click', () => selectGift(gb.dataset.gift)));
  safeOn('pickGirlsBtn', 'click', () => resolveGift('girls'));
  safeOn('pickBoysBtn', 'click', () => resolveGift('boys'));
  safeOn('cancelGiftBtn', 'click', closeGiftBanner);
  safeOn('roundEndContinueBtn', 'click', continueAfterRound);
  $$('.captain-done').forEach((cd) => cd.addEventListener('click', () => confirmCaptain(cd.dataset.team, cd.dataset.slot)));
  $$('.sound-trigger').forEach((st) => st.addEventListener('click', () => playSound(st.dataset.sound, 0.7)));
}

function initResults() {
  $('replayBtn').addEventListener('click', () => { stopTimer(); showScreen('setupScreen'); });
}

function initOverlays() {
  $('closeSavedBtn').addEventListener('click', () => $('savedModal').classList.add('hidden'));
  ['savedModal', 'roundEndOverlay'].forEach((ovId) => $(ovId).addEventListener('click', (ovEvt) => {
    if (ovEvt.target.id === ovId) $(ovId).classList.add('hidden');
  }));
}

function initFloatingSound() {
  const floatBtnMain = $('floatingSoundBtn');
  const floatPanelMain = $('floatingSoundBoard');
  if (floatBtnMain) {
    floatBtnMain.addEventListener('click', () => floatPanelMain.classList.toggle('hidden'));
    if ($('closeFloatingSound')) $('closeFloatingSound').addEventListener('click', () => floatPanelMain.classList.add('hidden'));
  }
  const floatBtnRes = $('floatingSoundBtnResults');
  const floatPanelRes = $('floatingSoundBoardResults');
  if (floatBtnRes) {
    floatBtnRes.addEventListener('click', () => floatPanelRes.classList.toggle('hidden'));
    if ($('closeFloatingSoundResults')) $('closeFloatingSoundResults').addEventListener('click', () => floatPanelRes.classList.add('hidden'));
  }
}

function init() {
  try { hideLoading(); } catch (e) {}
  // إزالة أي طبقة قد تحجب النقرات
  try {
    document.querySelectorAll('.overlay, .captain-reveal, .loading-overlay, #x2AttentionOverlay, #liveFollowCard').forEach((el) => {
      if (el && !el.classList.contains('hidden') && el.id !== 'setupScreen') {
        /* لا نخفي الشاشات الأساسية */
      }
    });
    ['loadingOverlay','roundEndOverlay','savedModal','captainRevealOverlay'].forEach((oid) => {
      const o = $(oid); if (o) o.classList.add('hidden');
    });
  } catch (e) {}
  try {
    state.questionHistory = getHistory();
    state.soundEnabled = localStorage.getItem(SOUND_KEY) === 'true';
    updateSoundButtons();
    updateSavedCount();
  } catch (e) { console.warn('state init', e); }
  const steps = [
    injectSponsor, expandCaptainSlots, initTheme, initActivity, fixTimerPills,
    patchGiftImages, cleanCaptainSection, watchScreensForSoundBtn,
    initSetup, initGame, initResults, initOverlays, initFloatingSound,
    connectLiveStream, startLeaderboardPoll
  ];
  steps.forEach((fn) => {
    try { if (typeof fn === 'function') fn(); }
    catch (err) { console.error('[init step]', fn && fn.name, err); }
  });
  try { hideLoading(); } catch (e) {}
  try { updateTimer(); } catch (e) {}
  try { ensureSoundButtonVisible(); } catch (e) {}
  // تفويض نقر عام احتياطي للأزرار الحرجة
  document.body.addEventListener('click', (ev) => {
    const t = ev.target.closest('button, .mode-tab, .pill, .gift-button, .option-btn, .mini-control, .deck-button, .primary-cta, .sound-trigger, .stepper-btn');
    if (!t) return;
    // لا نمنع الافتراضي إلا لما نعالج
  }, false);
  console.log('✅ عالم التحديات — init complete v18-safe');
}

document.addEventListener('DOMContentLoaded', init);
