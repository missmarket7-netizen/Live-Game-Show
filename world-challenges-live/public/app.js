/* ═══════════════════════════════════════════════════════════════════
   🌎 عالم التحديات — LIVE GAME SHOW ENGINE v11.0 PRO (10/10)
   تصميم هندسي نظيف، متوافق تماماً مع HTML/CSS v11
   ═══════════════════════════════════════════════════════════════════ */

const state = {
  mode: 'single',
  questions: [],
  currentIndex: 0,
  girlsScore: 0,
  boysScore: 0,
  negGirls: 0,
  negBoys: 0,
  girlsRounds: 0,
  boysRounds: 0,
  timerDuration: 10,
  timerValue: 10,
  timerInterval: null,
  isTimerRunning: false,
  isRevealed: false,
  soundEnabled: false,
  history: [],
  fullShowRounds: [],
  currentRoundIndex: 0,
  totalQuestions: 0,
  answeredQuestions: 0,
  activeGift: null,
  shieldTeam: null
};

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

/* ═══ LOCAL STORAGE (v11) ═══ */
const SAVED_KEY = 'wcq_saved_questions_v11';
const MAX_SAVED = 20;

function getSavedQuestions() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); }
  catch { return []; }
}

function saveQuestionSet(entry) {
  const saved = getSavedQuestions();
  saved.unshift(entry);
  if (saved.length > MAX_SAVED) saved.length = MAX_SAVED;
  localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
}

function deleteSavedSet(id) {
  const saved = getSavedQuestions().filter(s => s.id !== id);
  localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  renderSavedList();
}

function useSavedSet(id) {
  const entry = getSavedQuestions().find(s => s.id === id);
  if (!entry || !entry.questions || entry.questions.length === 0) return;
  state.questions = entry.questions;
  state.currentIndex = 0;
  state.girlsScore = 0;
  state.boysScore = 0;
  state.girlsRounds = 0;
  state.boysRounds = 0;
  state.mode = 'single';
  updateScoreBoxes();
  showScreen('gameScreen');
  renderQuestion();
  playSound('begin', 0.6);
  closeSavedModal();
}

window.useSavedSet = useSavedSet;
window.deleteSavedSet = deleteSavedSet;

function renderSavedList() {
  const list = $('savedList');
  const saved = getSavedQuestions();
  if (saved.length === 0) {
    list.innerHTML = '<div class="saved-empty">📭 لا توجد أسئلة محفوظة بعد</div>';
    return;
  }
  list.innerHTML = saved.map(s => `
    <div class="saved-item" data-id="${s.id}">
      <div class="saved-item-title">${s.category || 'بنك'} (${s.count})</div>
      <div class="saved-item-actions">
        <button class="saved-item-btn saved-item-use" style="background:#4d8dff" onclick="window.useSavedSet(${s.id})">▶️ استخدام</button>
        <button class="saved-item-btn saved-item-delete" style="background:#ff4757" onclick="window.deleteSavedSet(${s.id})">🗑️ حذف</button>
      </div>
    </div>
  `).join('');
}

function openSavedModal() { renderSavedList(); $('savedModal').classList.remove('hidden'); }
function closeSavedModal() { $('savedModal').classList.add('hidden'); }

/* ═══ SOUND SYSTEM (أسماء الملفات الفعلية للمشروع) ═══ */
const soundFiles = {
  tick: '/sounds/tick.mp3', correct: '/sounds/correct.mp3', wrong: '/sounds/wrong.mp3', timerEnd: '/sounds/tick.mp3',
  win: '/sounds/victory.mp3', celebration: '/sounds/celebration.mp3', cheer: '/sounds/cheer.mp3', down: '/sounds/down.mp3',
  suspense: '/sounds/suspense.mp3', start: '/sounds/start.mp3',

  rose: '/sounds/gift-rose.mp3', tiktok: '/sounds/gift-tiktok.mp3', donut: '/sounds/gift-dount.mp3',
  cat: '/sounds/gift-cat.mp3', corgi: '/sounds/gift-corgi.mp3', crown: '/sounds/gift-crown.mp3', heart: '/sounds/gift-heart.mp3',

  galaxyGirl: '/sounds/girls-galaxy.mp3', galaxyBoy: '/sounds/boys-galaxy.mp3',

  begin: '/sounds/begin.mp3', end: '/sounds/end.mp3', learn: '/sounds/learn.mp3', boysMood: '/sounds/boys-mood.mp3',
  girlsCaptain: '/sounds/girls-captin.mp3', boysCaptain: '/sounds/boys-captin.mp3',
  girls2captin: '/sounds/girls2captin.mp3', captin2boys: '/sounds/captin2boys.mp3',
  girlsRound: '/sounds/girls-round.mp3', boysRound: '/sounds/boys-round.mp3',
  girlsLose: '/sounds/girls-lose.mp3', boysLose: '/sounds/boys-lose.mp3',
  girlsWin: '/sounds/girls-win.mp3', boysWin: '/sounds/boys-win.mp3',
  longway: '/sounds/Longway.mp3', girlsReplayBoys: '/sounds/girls-replay-boys.mp3', boysReplayGirls: '/sounds/boys-replay-girls.mp3',
  advice: '/sounds/advice.mp3', teamwork: '/sounds/teamwork.mp3', boom: '/sounds/boom.mp3', days: '/sounds/days.mp3',
  kontFeen: '/sounds/kont-feen.mp3', fight: '/sounds/fight.mp3'
};

const audioCache = {};

function preloadSounds() {
  Object.entries(soundFiles).forEach(([key, src]) => {
    const audio = new Audio();
    audio.preload = 'none';
    audio.src = src;
    audioCache[key] = audio;
  });
}

window.playSound = function(key, volume = 0.5) {
  if (!state.soundEnabled) return;
  try {
    const audio = audioCache[key];
    if (audio) {
      audio.currentTime = 0;
      audio.volume = volume;
      audio.load();
      audio.play().catch(() => {});
    }
  } catch (e) {}
};
/* ═══ UI HELPERS ═══ */
function showScreen(id) {
  $$('.screen').forEach(s => s.classList.add('hidden'));
  $(id).classList.remove('hidden');
}
function showLoading(text) { $('loadingText').textContent = text; $('loadingOverlay').classList.remove('hidden'); }
function hideLoading() { $('loadingOverlay').classList.add('hidden'); }
function showCelebration(image, text, soundKey) {
  $('celebrationImg').src = image;
  $('celebrationText').textContent = text;
  $('celebrationOverlay').classList.remove('hidden');
  playSound(soundKey, 0.7);
  setTimeout(() => $('celebrationOverlay').classList.add('hidden'), 2500);
}

/* ═══ CONFETTI ═══ */
function fireConfetti() {
  const canvas = $('confettiCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ['#ff2e7d', '#2e7dff', '#ffd700', '#2ed573', '#ff4757'];
  const particles = [];
  for (let i = 0; i < 120; i++) {
    particles.push({
      x: Math.random() * canvas.width, y: -20 - Math.random() * 100, w: 4 + Math.random() * 6,
      h: 4 + Math.random() * 6, color: colors[Math.floor(Math.random() * colors.length)],
      speedY: 2 + Math.random() * 5, speedX: (Math.random() - 0.5) * 4,
      rotation: Math.random() * 360, rotSpeed: (Math.random() - 0.5) * 10, opacity: 1
    });
  }
  let frame = 0;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let active = false;
    particles.forEach(p => {
      if (p.opacity <= 0) return;
      active = true;
      p.y += p.speedY; p.x += p.speedX; p.rotation += p.rotSpeed; p.opacity -= 0.0025;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.globalAlpha = Math.max(0, p.opacity); ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    });
    frame++;
    if (active && frame < 250) requestAnimationFrame(animate);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  animate();
}

/* ═══ TIMER ═══ */
function updateTimerDisplay() { $('timerDisplay').textContent = state.timerValue; }
function startTimer() {
  if (state.isTimerRunning) return;
  state.isTimerRunning = true;
  state.timerValue = state.timerDuration;
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    state.timerValue--;
    updateTimerDisplay();
    if (state.timerValue <= 0) {
      clearInterval(state.timerInterval);
      state.isTimerRunning = false;
      playSound('timerEnd', 0.5);
    }
  }, 1000);
}
function stopTimer() { clearInterval(state.timerInterval); state.isTimerRunning = false; }

/* ═══ SCORING (أفضل هندسة للنقاط) ═══ */
function updateScoreBoxes() {
  const gB = $$('#girlsScoreBoxes .score-box');
  const bB = $$('#boysScoreBoxes .score-box');
  gB.forEach((box, i) => { box.classList.toggle('filled-girls', i < state.girlsScore); box.textContent = i < state.girlsScore ? '✓' : ''; });
  bB.forEach((box, i) => { box.classList.toggle('filled-boys', i < state.boysScore); box.textContent = i < state.boysScore ? '✓' : ''; });
  $('girlsRoundsWon').textContent = `🏆 ${state.girlsRounds}`;
  $('boysRoundsWon').textContent = `🏆 ${state.boysRounds}`;
  $('negGirlsValue').textContent = state.negGirls;
  $('negBoysValue').textContent = state.negBoys;
}

function addPoint(team) {
  if (team === 'girls') state.girlsScore = Math.min(state.girlsScore + 1, 5);
  else state.boysScore = Math.min(state.boysScore + 1, 5);
  playSound('cheer', 0.5);
  updateScoreBoxes();
}

// إكمال الدالة الناقصة كما طلبت
function minusPoint(team) {
  if (team === 'girls') {
    if (state.girlsScore > 0) state.girlsScore--;
  } else {
    if (state.boysScore > 0) state.boysScore--;
  }
  playSound('down', 0.4);
  updateScoreBoxes();
}

function updateNegative(team, action) {
  if (state.shieldTeam === team) return;
  if (team === 'girls') {
    if (action === 'minus') state.negGirls = Math.max(-5, state.negGirls - 1);
    else state.negGirls = Math.min(0, state.negGirls + 1);
  } else {
    if (action === 'minus') state.negBoys = Math.max(-5, state.negBoys - 1);
    else state.negBoys = Math.min(0, state.negBoys + 1);
  }
  updateScoreBoxes();
}

/* ═══ GIFTS SYSTEM (متوافق مع HTML v11) ═══ */
function showTeamPicker(giftType) {
  const modal = $('teamPickerModal');
  modal.classList.remove('hidden');
  state.activeGift = giftType;
  $('pickerTitle').textContent = `أهداء ${giftType}`;
}

window.giveGiftToTeam = function(team) {
  $('teamPickerModal').classList.add('hidden');
  const gift = state.activeGift;
  let soundKey = '', actionText = '', img = '';

  if (gift === 'galaxy') {
    if (team === 'girls') { soundKey = 'galaxyGirl'; img = '/images/gift-galaxy.png'; actionText = '✨ المجرة للبنات!'; }
    else { soundKey = 'galaxyBoy'; img = '/images/gift-galaxy.png'; actionText = '✨ المجرة للشباب!'; }
  } else if (gift === 'whale') {
    if (team === 'girls') { soundKey = 'galaxyGirl'; img = '/images/gift-whale.png'; actionText = '🐋 الحوت للبنات!'; }
    else { soundKey = 'galaxyBoy'; img = '/images/gift-whale.png'; actionText = '🐋 الحوت للشباب!'; }
  } else if (gift === 'donut') {
    if (team === 'girls') { soundKey = 'donut'; state.girlsRounds++; img = '/images/gift-donut.png'; actionText = '🍩 جولة للبنات!'; }
    else { soundKey = 'cat'; state.boysRounds++; img = '/images/gift-donut.png'; actionText = '🍩 جولة للشباب!'; }
  } else if (gift === 'corgi') {
    if (team === 'girls') { soundKey = 'corgi'; state.girlsRounds += 10; img = '/images/gift-corgi.png'; actionText = '🐶 +10 للبنات!'; }
    else { soundKey = 'crown'; state.boysRounds += 10; img = '/images/gift-corgi.png'; actionText = '🐶 +10 للشباب!'; }
  }

  showCelebration(img, actionText, soundKey);
  updateScoreBoxes();
  state.activeGift = null;
};

window.activateShield = function(team) {
  $('teamPickerModal').classList.add('hidden');
  state.shieldTeam = team;
  if (team === 'girls') { state.negGirls = 0; $('teamShieldGirls').classList.remove('hidden'); $('teamShieldBoys').classList.add('hidden'); }
  else { state.negBoys = 0; $('teamShieldBoys').classList.remove('hidden'); $('teamShieldGirls').classList.add('hidden'); }
  playSound('heart', 0.6);
  showCelebration('/images/gift-heart.png', `❤️ درع لـ ${team === 'girls' ? 'البنات' : 'الشباب'}`, 'heart');
  updateScoreBoxes();
};

function initGifts() {
  $$('.gift-item').forEach(item => {
    item.addEventListener('click', () => {
      const gift = item.dataset.gift;
      
      // الهدايا التي تفتح نافذة اختيار الفريق
      if (item.dataset.picker === 'true' || gift === 'galaxy' || gift === 'whale' || gift === 'donut' || gift === 'corgi') {
        showTeamPicker(gift);
        return;
      }

      // زر القلب (الدرع) يفتح نافذة الفريق أيضاً
      if (gift === 'heart') {
        showTeamPicker('heart');
        return;
      }

      // الهدايا المباشرة
      switch(gift) {
        case 'rose':
          if (state.boysScore > 0) state.boysScore--; else state.negBoys = Math.max(-5, state.negBoys - 1);
          playSound('rose', 0.6); showCelebration('/images/gift-rose.png', '🌹 خصم من الشباب!', 'rose'); break;
        case 'tiktok':
          if (state.girlsScore > 0) state.girlsScore--; else state.negGirls = Math.max(-5, state.negGirls - 1);
          playSound('tiktok', 0.6); showCelebration('/images/gift-tiktok.png', '🎵 خصم من البنات!', 'tiktok'); break;
        case 'cat':
          state.boysRounds++; playSound('cat', 0.6); showCelebration('/images/gift-cat.png', '🐱 جولة للشباب!', 'cat'); break;
        case 'crown':
          state.boysRounds += 10; playSound('crown', 0.6); showCelebration('/images/gift-crown.png', '👑 +10 للشباب!', 'crown'); break;
      }
      updateScoreBoxes();
    });
  });
}

/* ═══ RENDER & QUESTION LOGIC ═══ */
function renderQuestion() {
  const q = state.questions[state.currentIndex];
  if (!q) return;
  state.isRevealed = false;
  stopTimer();
  $('questionCounter').textContent = `السؤال ${state.currentIndex + 1} / ${state.questions.length}`;
  $('questionText').textContent = q.question;
  const grid = $('optionsGrid');
  grid.innerHTML = '';
  (q.options || []).forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = opt;
    btn.onclick = () => selectOption(i);
    grid.appendChild(btn);
  });
  $('answerReveal').classList.add('hidden');
  playSound('suspense', 0.3);
}

function selectOption(index) {
  if (state.isRevealed) return;
  const q = state.questions[state.currentIndex];
  const btns = $$('.option-btn');
  btns.forEach((b, i) => {
    b.classList.remove('correct', 'wrong');
    if (i === q.correctIndex) b.classList.add('correct');
    if (i === index && i !== q.correctIndex) b.classList.add('wrong');
  });
  if (index === q.correctIndex) playSound('correct', 0.5);
  else playSound('wrong', 0.4);
  revealAnswer();
}

function revealAnswer() {
  if (state.isRevealed) return;
  state.isRevealed = true;
  const q = state.questions[state.currentIndex];
  $('answerReveal').classList.remove('hidden');
  $('answerText').textContent = `${String.fromCharCode(65 + q.correctIndex)}. ${q.options[q.correctIndex]}`;
  $('explanationText').textContent = q.explanation || 'لا يوجد شرح إضافي.';
  $('revealBtn').disabled = true;
}
/* ═══ ROUND & RESULTS LOGIC ═══ */
function editRounds(team) {
  const current = team === 'girls' ? state.girlsRounds : state.boysRounds;
  const newVal = prompt(`أدخل عدد الجولات لـ ${team === 'girls' ? 'البنات' : 'الشباب'}:`, current);
  if (newVal !== null && !isNaN(parseInt(newVal)) && parseInt(newVal) >= 0) {
    if (team === 'girls') state.girlsRounds = parseInt(newVal);
    else state.boysRounds = parseInt(newVal);
    updateScoreBoxes();
  }
}
window.editRounds = editRounds;

function nextQuestion() {
  if (state.currentIndex < state.questions.length - 1) {
    state.currentIndex++;
    renderQuestion();
  } else {
    if (state.mode === 'fullshow' && state.currentRoundIndex < state.fullShowRounds.length - 1) {
      state.currentRoundIndex++;
      state.questions = state.fullShowRounds[state.currentRoundIndex].questions;
      state.currentIndex = 0;
      state.girlsScore = 0; state.boysScore = 0;
      state.negGirls = 0; state.negBoys = 0;
      state.shieldTeam = null;
      $('teamShieldGirls').classList.add('hidden'); $('teamShieldBoys').classList.add('hidden');
      updateScoreBoxes(); renderQuestion();
    } else {
      showResults();
    }
  }
}

// الجولة التالية اليدوية (عند الضغط على الزر)
function nextRoundManually() {
  stopTimer();
  let winnerText = '';
  if (state.girlsScore > state.boysScore) {
    state.girlsRounds++; winnerText = '🎉 مبروك للبنات!';
    playSound('girlsRound'); setTimeout(() => playSound('boysLose'), 1500);
  } else if (state.boysScore > state.girlsScore) {
    state.boysRounds++; winnerText = '🎉 مبروك للشباب!';
    playSound('boysRound'); setTimeout(() => playSound('girlsLose'), 1500);
  } else {
    winnerText = '🤝 تعادل!';
  }
  updateScoreBoxes();
  fireConfetti(); playSound('win', 0.6);
  $('roundEndNumber').textContent = `الجولة ${state.mode === 'fullshow' ? state.currentRoundIndex + 1 : 1}`;
  $('roundEndWinner').textContent = winnerText;
  $('roundEndOverlay').classList.remove('hidden');
  state.girlsScore = 0; state.boysScore = 0;
  state.negGirls = 0; state.negBoys = 0;
  state.shieldTeam = null;
  $('teamShieldGirls').classList.add('hidden'); $('teamShieldBoys').classList.add('hidden');
  updateScoreBoxes();
}

function continueAfterRound() {
  $('roundEndOverlay').classList.add('hidden');
  state.currentIndex = 0;
  updateScoreBoxes();
  renderQuestion();
}

function showResults() {
  showScreen('resultsScreen');
  fireConfetti();
  if (state.girlsRounds > state.boysRounds) playSound('girlsWin', 0.7);
  else if (state.boysRounds > state.girlsRounds) playSound('boysWin', 0.7);
  else playSound('end', 0.6);

  $('finalGirlsScore').textContent = state.girlsRounds;
  $('finalBoysScore').textContent = state.boysRounds;
  const wText = $('winnerText');
  if (state.girlsRounds > state.boysRounds) wText.textContent = '👑 فوز فريق البنات!';
  else if (state.boysRounds > state.girlsRounds) wText.textContent = '👑 فوز فريق الشباب!';
  else wText.textContent = '🤝 تعادل مثير!';
  playSound('celebration', 0.5);
}

/* ═══ GENERATION (Zero API) ═══ */
function generateSingleRound() {
  const count = Number($('count').value) || 10;
  showLoading('جاري تحميل الأسئلة من البنك...');
  fetch('/api/questions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count, avoid: state.history.slice(-200), generateNew: false })
  })
  .then(res => res.json())
  .then(data => {
    hideLoading();
    if (data.error) throw new Error(data.error);
    if (data.questions && data.questions.length > 0) {
      state.questions = data.questions;
      state.currentIndex = 0;
      state.girlsScore = 0; state.boysScore = 0;
      state.girlsRounds = 0; state.boysRounds = 0;
      state.mode = 'single';
      state.history = [...state.history, ...data.questions.map(q => q.question)].slice(-500);
      saveQuestionSet({ id: Date.now(), date: new Date().toLocaleString('ar-SA'), category: 'بنك', difficulty: 'متنوع', count: data.questions.length, questions: data.questions });
      updateScoreBoxes();
      showScreen('gameScreen');
      renderQuestion();
      playSound('begin', 0.5);
    }
  }).catch(err => { hideLoading(); alert('خطأ: ' + err.message); });
}

function generateFullShow() {
  showLoading('جاري تجهيز اللايف الكامل...');
  fetch('/api/questions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count: 200, avoid: state.history.slice(-200), generateNew: false })
  })
  .then(res => res.json())
  .then(data => {
    hideLoading();
    if (data.error) throw new Error(data.error);
    const allQ = data.questions;
    const rounds = [];
    for (let i = 0; i < 20; i++) rounds.push({ questions: allQ.slice(i * 10, (i + 1) * 10) });
    state.fullShowRounds = rounds;
    state.currentRoundIndex = 0;
    state.questions = rounds[0].questions;
    state.currentIndex = 0;
    state.girlsScore = 0; state.boysScore = 0;
    state.girlsRounds = 0; state.boysRounds = 0;
    state.mode = 'fullshow';
    state.history = [...state.history, ...allQ.map(q => q.question)].slice(-500);
    saveQuestionSet({ id: Date.now(), date: new Date().toLocaleString('ar-SA'), category: 'لايف كامل 20 جولة', difficulty: 'متنوع', count: allQ.length, questions: allQ });
    updateScoreBoxes();
    showScreen('gameScreen');
    renderQuestion();
    playSound('begin', 0.5);
  }).catch(err => { hideLoading(); alert('خطأ: ' + err.message); });
}

/* ═══ FLOATING SOUND BOARD (لوحة الصوت العائمة) ═══ */
const floatingBtn = $('floatingSoundBtn');
const floatingBoard = $('floatingSoundBoard');
if (floatingBtn) floatingBtn.addEventListener('click', () => floatingBoard.classList.toggle('hidden'));
if ($('closeFloatingSound')) $('closeFloatingSound').addEventListener('click', () => floatingBoard.classList.add('hidden'));

/* ═══ CAPTAIN SOUNDS (أصوات الكابتن عند الكتابة) ═══ */
const girlsCaptainBox = $('girlsCaptainName');
const boysCaptainBox = $('boysCaptainName');

if (girlsCaptainBox) {
  girlsCaptainBox.addEventListener('blur', () => {
    const name = girlsCaptainBox.textContent.trim().replace('👑 ', '');
    if (name) { playSound('girlsCaptain', 0.7); showCelebration('/images/girl-team.png', `👑 كابتن البنات: ${name}`, 'girlsCaptain'); }
  });
}
if (boysCaptainBox) {
  boysCaptainBox.addEventListener('blur', () => {
    const name = boysCaptainBox.textContent.trim().replace('👑 ', '');
    if (name) { playSound('boysCaptain', 0.7); showCelebration('/images/boy-team.png', `👑 كابتن الشباب: ${name}`, 'boysCaptain'); }
  });
}

/* ═══ INIT SETUP UI ═══ */
function initSetupUI() {
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.mode = tab.dataset.mode;
    });
  });
  $('generateBtn').addEventListener('click', async () => {
    if (state.mode === 'fullshow') await generateFullShow();
    else await generateSingleRound();
  });
  $('savedQuestionsBtn').addEventListener('click', openSavedModal);
}

/* ═══ INIT GAME UI ═══ */
function initGameUI() {
  $('startTimerBtn').addEventListener('click', startTimer);
  $('revealBtn').addEventListener('click', revealAnswer);
  $('nextBtn').addEventListener('click', nextQuestion);
  $('girlsPlusBtn').addEventListener('click', () => addPoint('girls'));
  $('girlsMinusBtn').addEventListener('click', () => minusPoint('girls'));
  $('boysPlusBtn').addEventListener('click', () => addPoint('boys'));
  $('boysMinusBtn').addEventListener('click', () => minusPoint('boys'));
  $('nextRoundBtn').addEventListener('click', nextRoundManually);
  $('newRoundBtn').addEventListener('click', () => location.reload());
  $('roundEndContinueBtn').addEventListener('click', continueAfterRound);
  $('closeSavedBtn').addEventListener('click', closeSavedModal);
  
  // ربط أزرار العدادات السالبة
  $$('.neg-btn').forEach(btn => {
    btn.addEventListener('click', () => updateNegative(btn.dataset.team, btn.dataset.action));
  });
}

function initResultsUI() {
  $('replayBtn').addEventListener('click', () => location.reload());
}

/* ═══ INIT FUNCTION (نقطة البداية النهائية) ═══ */
function init() {
  preloadSounds();
  initSetupUI();
  initGameUI();
  initResultsUI();
  initGifts();
  
  const soundPref = localStorage.getItem('wcq_sound') === 'true';
  state.soundEnabled = soundPref;
  $('soundToggle').textContent = soundPref ? '🔊' : '🔇';
  $('soundToggle').addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem('wcq_sound', state.soundEnabled);
    $('soundToggle').textContent = state.soundEnabled ? '🔊' : '🔇';
  });
  
  hideLoading();
}

document.addEventListener('DOMContentLoaded', init);
