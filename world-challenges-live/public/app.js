const state = {
  mode: 'single', questions: [], fullShowRounds: [], currentRoundIndex: 0, currentIndex: 0,
  girlsScore: 0, boysScore: 0, girlsRounds: 0, boysRounds: 0,
  timerDuration: 30, timerValue: 30, timerInterval: null, isTimerRunning: false, isRevealed: false,
  soundEnabled: false, activeGift: null, questionHistory: [], showStartedAt: 0, showClockInterval: null,
  fullShowDuration: 120, shieldTeam: null, tempSupporterTeam: null
};
const SAVED_KEY = 'lgs_saved_sets_v4';
const HISTORY_KEY = 'lgs_question_history_v4';
const SOUND_KEY = 'lgs_sound_v4';
const $ = (id) => document.getElementById(id);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

/* مطابقة أسماء الأصوات مع المستودع */
const soundFiles = {
  'gift-rose': ['gift-rose'], 'gift-donut': ['gift-dount', 'gift-donut'], 'gift-corgi': ['gift-corgi'],
  'gift-heart': ['gift-heart'], 'gift-tiktok': ['gift-tiktok'], 'gift-cat': ['gift-cat'],
  'gift-crown': ['gift-crown'], begin: ['begin'], end: ['end'], learn: ['learn'], 'boys-mood': ['boys-mood'],
  'girls-captin': ['girls-captin'], 'boys-captin': ['boys-captin'], 'girls-galaxy': ['girls-galaxy'],
  'boys-galaxy': ['boys-galaxy'], girls2captin: ['girls2captin'], captin2boys: ['captin2boys'],
  'girls-round': ['girls-round'], 'boys-round': ['boys-round'], 'girls-lose': ['girls-lose'], 'boys-lose': ['boys-lose'],
  'girls-win': ['girls-win'], 'boys-win': ['boys-win'], Longway: ['Longway'], 'girls-replay-boys': ['girls-replay-boys'],
  'boys-replay-girls': ['boys-replay-girls'], advice: ['advice'], teamwork: ['teamwork'], boom: ['boom'], days: ['days'],
  'kont-feen': ['kont-feen'], fight: ['fight'], tick: ['tick'], correct: ['correct'], wrong: ['wrong']
};
const audioCache = new Map();

function preloadSounds() {
  Object.entries(soundFiles).forEach(([key, names]) => {
    // دعم تعدد الأسماء للبحث عن الملف
    const candidates = names.map(name => `/sounds/${name}.mp3`);
    const audio = new Audio();
    audio.preload = 'none';
    audio.src = candidates[0]; // سيتم تجربة الاسم الأول ثم البدائل عبر آلية error
    audio.dataset.candidates = JSON.stringify(candidates);
    audioCache.set(key, audio);
  });
}

function getSavedSets() { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; } }
function getHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; } }
function saveHistory() { localStorage.setItem(HISTORY_KEY, JSON.stringify(state.questionHistory.slice(-180))); }
function saveQuestionSet(questions, meta = {}) {
  const sets = getSavedSets();
  sets.unshift({ id: Date.now(), date: new Date().toLocaleString('ar-SA'), questions, category: meta.category || 'اختيارات متنوعة', difficulty: meta.difficulty || 'متوسط', count: questions.length, source: meta.source || 'local' });
  localStorage.setItem(SAVED_KEY, JSON.stringify(sets.slice(0, 20)));
  updateSavedCount();
}
function updateSavedCount() { const el = $('savedCount'); if (el) el.textContent = getSavedSets().length; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function shuffle(list) { const items = [...list]; for (let i = items.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; } return items; }

function playSound(key, volume = .55) {
  if (!state.soundEnabled) return;
  const audio = audioCache.get(key);
  if (!audio) return;
  
  // منطق تجربة الأسماء البديلة
  const candidates = JSON.parse(audio.dataset.candidates || '[]');
  let attempt = 0;
  const tryPlay = () => {
    audio.src = candidates[attempt];
    audio.load();
    audio.onerror = () => {
      attempt += 1;
      if (attempt < candidates.length) tryPlay();
    };
    audio.oncanplaythrough = () => {
      audio.currentTime = 0;
      audio.volume = volume;
      audio.play().catch(() => {});
    };
  };
  tryPlay();
}
function toggleSound() { state.soundEnabled = !state.soundEnabled; localStorage.setItem(SOUND_KEY, String(state.soundEnabled)); updateSoundButtons(); }
function updateSoundButtons() { const glyph = state.soundEnabled ? '◉' : '○'; ['setupSoundBtn', 'soundToggle'].forEach((id) => { if ($(id)) { $(id).textContent = glyph; $(id).classList.toggle('sound-on', state.soundEnabled); } }); }

function showScreen(id) { $$('.screen').forEach((screen) => screen.classList.toggle('hidden', screen.id !== id)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function showLoading(message) { $('loadingText').textContent = message; $('loadingOverlay').classList.remove('hidden'); }
function hideLoading() { $('loadingOverlay').classList.add('hidden'); }
function showToast(text, kicker = 'SHOW CONTROL') { $('captainToastKicker').textContent = kicker; $('captainToastText').textContent = text; $('captainToast').classList.remove('hidden'); clearTimeout(showToast.timeout); showToast.timeout = setTimeout(() => $('captainToast').classList.add('hidden'), 3100); }
function formatClock() { const seconds = Math.floor((Date.now() - state.showStartedAt) / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function startShowClock() { state.showStartedAt = Date.now(); clearInterval(state.showClockInterval); state.showClockInterval = setInterval(() => { if ($('showClock')) $('showClock').textContent = formatClock(); }, 1000); }

function updateScores() {
  $('girlsScoreValue').textContent = state.girlsScore; $('boysScoreValue').textContent = state.boysScore;
  $('girlsProgress').style.width = `${Math.min(100, state.girlsScore * 10)}%`; $('boysProgress').style.width = `${Math.min(100, state.boysScore * 10)}%`;
  $('girlsRoundsWon').textContent = `${state.girlsRounds} جولات`; $('boysRoundsWon').textContent = `${state.boysRounds} جولات`;
  $('roundResults').textContent = `${state.girlsRounds} - ${state.boysRounds}`;
  // تحديث إظهار الدرع
  $('teamShieldGirls').classList.toggle('hidden', state.shieldTeam !== 'girls');
  $('teamShieldBoys').classList.toggle('hidden', state.shieldTeam !== 'boys');
}
function updateTimer() { $('timerDisplay').textContent = state.timerValue; $('timerRing').classList.toggle('urgent', state.timerValue <= 3 && state.timerValue > 0); }
function stopTimer() { clearInterval(state.timerInterval); state.timerInterval = null; state.isTimerRunning = false; $('startTimerBtn').disabled = false; }
/* نقطة 8: الصوت يعمل فقط عند الضغط */
function startTimer() {
  if (state.isTimerRunning || state.isRevealed) return;
  state.isTimerRunning = true; $('startTimerBtn').disabled = true; state.timerValue = state.timerDuration; updateTimer(); playSound('tick', .25);
  state.timerInterval = setInterval(() => {
    state.timerValue -= 1; updateTimer();
    if (state.timerValue > 0 && state.timerValue <= 3) playSound('tick', .24);
    if (state.timerValue <= 0) { stopTimer(); playSound('wrong', .35); showToast('انتهى الوقت — اكشف الإجابة!', 'TIME UP'); }
  }, 1000);
}
function renderQuestion() {
  const question = state.questions[state.currentIndex]; if (!question) return;
  stopTimer(); state.isRevealed = false; state.timerValue = state.timerDuration; state.activeGift = null; updateTimer();
  $('roundDisplay').textContent = state.mode === 'fullshow' ? `الجولة ${state.currentRoundIndex + 1}` : 'الجولة 1';
  $('roundProgress').textContent = `${String(state.currentIndex + 1).padStart(2, '0')} / ${String(state.questions.length).padStart(2, '0')}`;
  $('questionCounter').textContent = `السؤال ${String(state.currentIndex + 1).padStart(2, '0')} / ${String(state.questions.length).padStart(2, '0')}`;
  $('questionNumber').textContent = String(state.currentIndex + 1).padStart(2, '0');
  $('categoryBadge').textContent = `${question.category || 'اختيارات متنوعة'}`;
  $('questionText').textContent = question.question;
  $('answerText').textContent = '—'; $('explanationText').textContent = '—'; $('answerReveal').classList.add('hidden');
  $('revealBtn').disabled = false; $('nextBtn').disabled = false; $('sourceBadge').textContent = question.source === 'ai' ? 'AI BANK READY' : 'LOCAL BANK READY';
  $('questionSource').textContent = question.source === 'ai' ? 'AUTO-SAVED / AI' : 'AUTO-SAVED';
  const grid = $('optionsGrid'); grid.innerHTML = '';
  (question.options || []).slice(0, 4).forEach((option, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'option-btn'; button.dataset.letter = String.fromCharCode(65 + index); button.textContent = option; button.addEventListener('click', () => selectAnswer(index)); grid.appendChild(button);
  });
  $$('.gift-button').forEach((button) => button.classList.remove('is-active'));
  $('activeGiftBanner').classList.add('hidden');
  /* نقطة 8: إزالة الصوت التلقائي من renderQuestion - يعمل فقط عند الضغط */
}
function revealAnswer() {
  if (state.isRevealed) return;
  const question = state.questions[state.currentIndex]; if (!question) return;
  state.isRevealed = true; stopTimer();
  $$('.option-btn').forEach((button, index) => { button.classList.remove('selected'); if (index === question.correctIndex) button.classList.add('correct'); });
  $('answerText').textContent = `${String.fromCharCode(65 + question.correctIndex)}. ${question.options[question.correctIndex]}`;
  $('explanationText').textContent = question.explanation || 'معلومة إضافية للمقدم غير متاحة.'; $('answerReveal').classList.remove('hidden'); $('revealBtn').disabled = true;
}
function selectAnswer(index) {
  if (state.isRevealed) return;
  const question = state.questions[state.currentIndex]; const buttons = $$('.option-btn');
  buttons.forEach((button, buttonIndex) => { button.classList.toggle('selected', buttonIndex === index); if (buttonIndex === index && buttonIndex !== question.correctIndex) button.classList.add('wrong'); });
  playSound(index === question.correctIndex ? 'correct' : 'wrong', .5); revealAnswer();
}

/* نقطة 3: منطق الهدايا مع الدرع */
function applyPoint(team, points = 1) {
  if (team === 'girls') {
    if (state.girlsScore < 0) state.girlsScore = Math.min(0, state.girlsScore + points);
    else state.girlsScore = Math.min(5, state.girlsScore + points);
  } else {
    if (state.boysScore < 0) state.boysScore = Math.min(0, state.boysScore + points);
    else state.boysScore = Math.min(5, state.boysScore + points);
  }
  updateScores(); playSound('correct', .28);
}
function subtractPoint(team) {
  // الدرع يحمي من الخصم
  if (state.shieldTeam === team) {
    playSound('gift-heart', .4);
    return;
  }
  if (team === 'girls') state.girlsScore = Math.max(-5, state.girlsScore - 1);
  else state.boysScore = Math.max(-5, state.boysScore - 1);
  updateScores(); playSound('wrong', .25);
}

function selectGift(gift) {
  const directSounds = { rose: 'gift-rose', heart: 'gift-heart', tiktok: 'gift-tiktok', cat: 'gift-cat', crown: 'gift-crown' };
  state.activeGift = gift; $$('.gift-button').forEach((button) => button.classList.toggle('is-active', button.dataset.gift === gift));
  if (directSounds[gift]) { playSound(directSounds[gift], .62); showToast(`${gift === 'heart' ? 'قلب الحماية' : 'الهدية'} وصلت إلى الاستوديو`, 'GIFT MOMENT'); return; }
  const names = { donut: 'الدونتس', corgi: 'الكورجي', galaxy: 'المجرة', whale: 'الحوت' };
  $('activeGiftText').textContent = `اختَر الفريق مع ${names[gift]}`; $('activeGiftBanner').classList.remove('hidden'); playSound('tick', .28);
}
function resolveGift(team) {
  const gift = state.activeGift; if (!gift) return;

  /* نقطة 3: هدية القلب (درع) */
  if (gift === 'heart') {
    state.shieldTeam = team;
    if (team === 'girls') { state.girlsScore = Math.max(0, state.girlsScore); }
    else { state.boysScore = Math.max(0, state.boysScore); }
    playSound('gift-heart', .65);
    showToast(`الدرع يحمي ${team === 'girls' ? 'البنات' : 'الشباب'}`, 'SAFE PLAY');
    state.activeGift = null; $('activeGiftBanner').classList.add('hidden');
    $$('.gift-button').forEach((button) => button.classList.remove('is-active'));
    updateScores(); return;
  }

  /* نقطة 3: الهدايا التي تضيف جولات وتصفّر النقاط */
  if (gift === 'galaxy' || gift === 'whale' || gift === 'donut' || gift === 'corgi' || gift === 'cat' || gift === 'crown') {
    let roundsToAdd = 0;
    if (gift === 'galaxy') roundsToAdd = 50;
    else if (gift === 'whale') roundsToAdd = 100;
    else if (gift === 'donut') roundsToAdd = 1;
    else if (gift === 'corgi') roundsToAdd = 10;
    else if (gift === 'cat') roundsToAdd = 1;
    else if (gift === 'crown') roundsToAdd = 10;

    if (team === 'girls') {
      state.girlsRounds += roundsToAdd;
      playSound(gift === 'galaxy' || gift === 'whale' ? 'girls-galaxy' : (gift === 'corgi' ? 'gift-corgi' : 'gift-donut'), .7);
      showToast(`+${roundsToAdd} جولة للبنات`, 'GIFT LOCKED');
    } else {
      state.boysRounds += roundsToAdd;
      playSound(gift === 'galaxy' || gift === 'whale' ? 'boys-galaxy' : (gift === 'cat' ? 'gift-cat' : 'gift-crown'), .7);
      showToast(`+${roundsToAdd} جولة للشباب`, 'GIFT LOCKED');
    }

    state.girlsScore = 0; state.boysScore = 0;
    state.activeGift = null; $('activeGiftBanner').classList.add('hidden');
    $$('.gift-button').forEach((button) => button.classList.remove('is-active'));
    updateScores(); return;
  }

  /* نقطة 3: الهدايا المباشرة (خصم) */
  if (gift === 'rose') { subtractPoint('boys'); playSound('gift-rose', .6); }
  else if (gift === 'tiktok') { subtractPoint('girls'); playSound('gift-tiktok', .6); }
  state.activeGift = null; $('activeGiftBanner').classList.add('hidden');
  $$('.gift-button').forEach((button) => button.classList.remove('is-active'));
}

/* نقطة 1: تسجيل الكابتن */
function confirmCaptain(team) {
  const inputs = document.querySelectorAll(`#${team}Captain1, #${team}Captain2, #${team}Captain3`);
  const captains = Array.from(inputs).map(input => input.value.trim()).filter(name => name);
  if (captains.length === 0) { showToast('اكتب اسم الكابتن أولاً', 'CAPTAIN ERROR'); return; }
  
  if (team === 'girls') playSound('girls-captin', .7);
  else playSound('boys-captin', .7);
  
  captains.forEach((captain, index) => {
    setTimeout(() => {
      showToast(`${captain} دخلت المواجهة`, `${team === 'girls' ? 'GIRLS' : 'BOYS'} CAPTAIN`);
    }, index * 1000);
  });
}
function finishRound() {
  stopTimer();
  const currentRound = state.currentRoundIndex + 1; let winner = 'تعادل رائع بين الفريقين';
  if (state.girlsScore >= 5) { state.girlsRounds += 1; winner = 'فوز فريق البنات'; playSound('girls-round', .7); setTimeout(() => playSound('boys-lose', .35), 12000); }
  else if (state.boysScore >= 5) { state.boysRounds += 1; winner = 'فوز فريق الشباب'; playSound('boys-round', .7); setTimeout(() => playSound('girls-lose', .35), 12000); }
  else if (state.girlsScore > state.boysScore) { state.girlsRounds += 1; winner = 'فوز فريق البنات'; playSound('girls-round', .7); setTimeout(() => playSound('boys-lose', .35), 12000); }
  else if (state.boysScore > state.girlsScore) { state.boysRounds += 1; winner = 'فوز فريق الشباب'; playSound('boys-round', .7); setTimeout(() => playSound('girls-lose', .35), 12000); }
  else playSound('girls-round', .35);

  updateScores(); $('roundEndNumber').textContent = `الجولة ${currentRound}`; $('roundEndWinner').textContent = winner; $('roundEndGirlsScore').textContent = state.girlsScore; $('roundEndBoysScore').textContent = state.boysScore; $('roundEndOverlay').classList.remove('hidden'); fireConfetti();
  state.girlsScore = 0; state.boysScore = 0; state.shieldTeam = null; updateScores();
}
function continueAfterRound() { $('roundEndOverlay').classList.add('hidden'); if (state.mode === 'fullshow' && state.currentRoundIndex < state.fullShowRounds.length - 1) { state.currentRoundIndex += 1; state.questions = state.fullShowRounds[state.currentRoundIndex].questions; state.currentIndex = 0; renderQuestion(); showToast(`نبدأ ${state.fullShowRounds[state.currentRoundIndex].title}`, 'NEXT ROUND'); return; } showResults(); }
function nextQuestion() { if (!state.isRevealed) { showToast('اكشف الإجابة أولاً ثم انتقل', 'HOST TIP'); return; } if (state.currentIndex < state.questions.length - 1) { state.currentIndex += 1; renderQuestion(); } else finishRound(); }
function showResults() {
  stopTimer(); showScreen('resultsScreen'); $('finalGirlsScore').textContent = state.girlsRounds; $('finalBoysScore').textContent = state.boysRounds;
  const winner = $('winnerText');
  if (state.girlsRounds > state.boysRounds) { winner.textContent = 'فريق البنات فاز!'; winner.style.color = 'var(--pink-hot)'; playSound('girls-win', .8); }
  else if (state.boysRounds > state.girlsRounds) { winner.textContent = 'فريق الشباب فاز!'; winner.style.color = 'var(--cyan)'; playSound('boys-win', .8); }
  else { winner.textContent = 'تعادل أبطال الليلة'; winner.style.color = 'var(--gold-hot)'; playSound('end', .75); }
  setTimeout(() => playSound('end', .35), 700); fireConfetti();
}
function fireConfetti() {
  const canvas = $('confettiCanvas'); const ctx = canvas.getContext('2d'); canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const colors = ['#f45ca0', '#5de2ff', '#ffd36e', '#64ecad', '#917aff'];
  const particles = Array.from({ length: 105 }, () => ({ x: Math.random() * canvas.width, y: -20 - Math.random() * 100, size: 3 + Math.random() * 5, speed: 2 + Math.random() * 3.5, drift: (Math.random() - .5) * 2.6, spin: Math.random() * 6.28, color: colors[Math.floor(Math.random() * colors.length)], alpha: 1 }));
  let frame = 0; const animate = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); let active = false; particles.forEach((p) => { if (p.alpha <= 0) return; active = true; p.y += p.speed; p.x += p.drift; p.spin += .08; p.alpha -= .006; ctx.save(); ctx.globalAlpha = p.alpha; ctx.fillStyle = p.color; ctx.translate(p.x, p.y); ctx.rotate(p.spin); ctx.fillRect(-p.size / 2, -p.size / 2, p.size * 1.5, p.size); ctx.restore(); }); if (active && frame < 260) { frame += 1; requestAnimationFrame(animate); } else ctx.clearRect(0, 0, canvas.width, canvas.height); }; animate();
}

async function fetchQuestions(params) {
  try {
    const response = await fetch('/api/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...params, avoid: state.questionHistory.slice(-100) }) });
    if (!response.ok) throw new Error('API unavailable'); const data = await response.json();
    const questions = Array.isArray(data.questions) ? data.questions : [];
    if (!questions.length) throw new Error('Empty response');
    return questions;
  } catch { return []; }
}
async function generateSingleRound() {
  const category = $('category').value; const difficulty = $('difficulty').value; const count = Math.max(3, Math.min(30, Number($('count').value) || 10)); $('count').value = count;
  showLoading('نجهز بنك الأسئلة...');
  const questions = await fetchQuestions({ category, difficulty, count });
  if (questions.length > 0) { state.questions = questions; state.fullShowRounds = []; state.currentRoundIndex = 0; state.currentIndex = 0; state.mode = 'single'; state.girlsScore = 0; state.boysScore = 0; state.girlsRounds = 0; state.boysRounds = 0; state.questionHistory = [...state.questionHistory, ...questions.map((question) => question.question)].slice(-180); saveHistory(); saveQuestionSet(questions, { category, difficulty, source: questions[0]?.source }); prepareGame(); }
  else { showToast('لا توجد أسئلة متاحة حالياً', 'SHOW CONTROL'); }
  hideLoading();
}
async function generateFullShow() {
  const plan = Array.from({ length: 3 }, (_, index) => ({ title: `الجولة ${index + 1}`, category: index === 0 ? 'معلومات عامة' : index === 1 ? 'جغرافيا' : 'اختيارات متنوعة', difficulty: index === 0 ? 'سهل' : index === 1 ? 'متوسط' : 'صعب', count: 10 }));
  state.fullShowRounds = []; showLoading('نرتب فصول اللايف...');
  for (let index = 0; index < plan.length; index += 1) { $('loadingText').textContent = `نجهز ${plan[index].title} — ${index + 1} / ${plan.length}`; const questions = await fetchQuestions(plan[index]); state.fullShowRounds.push({ ...plan[index], questions }); state.questionHistory = [...state.questionHistory, ...questions.map((question) => question.question)].slice(-180); }
  saveHistory(); saveQuestionSet(state.fullShowRounds.flatMap((round) => round.questions), { category: 'مسابقة', difficulty: 'متدرج' }); state.mode = 'fullshow'; state.currentRoundIndex = 0; state.questions = state.fullShowRounds[0].questions; state.currentIndex = 0; state.girlsScore = 0; state.boysScore = 0; state.girlsRounds = 0; state.boysRounds = 0; prepareGame(); hideLoading();
}
function prepareGame() {
  updateScores(); showScreen('gameScreen'); startShowClock(); renderQuestion();
  playSound('begin', .75);
}
function renderSavedList() {
  const saved = getSavedSets(); const list = $('savedList'); updateSavedCount();
  if (!saved.length) { list.innerHTML = '<div class="saved-empty">لا توجد جولات محفوظة بعد.<br />كل جولة AI جديدة ستظهر هنا تلقائياً.</div>'; return; }
  list.innerHTML = saved.map((entry) => `<article class="saved-item"><div class="saved-item-title">${escapeHtml(entry.category)} — ${escapeHtml(entry.difficulty)} <span>(${entry.count} سؤال)</span></div><div class="saved-item-meta">${escapeHtml(entry.date)} · ${entry.source === 'ai' ? 'AI GENERATED' : 'LOCAL BANK'}</div><div class="saved-item-actions"><button class="saved-item-btn saved-item-use" data-use="${entry.id}" type="button">استخدام الجولة</button><button class="saved-item-btn saved-item-delete" data-delete="${entry.id}" type="button">حذف</button></div></article>`).join('');
  $$('[data-use]').forEach((button) => button.addEventListener('click', () => useSavedSet(Number(button.dataset.use)))); $$('[data-delete]').forEach((button) => button.addEventListener('click', () => deleteSavedSet(Number(button.dataset.delete))));
}
function openSaved() { renderSavedList(); $('savedModal').classList.remove('hidden'); }
function useSavedSet(id) {
  const entry = getSavedSets().find((saved) => saved.id === id); if (!entry) return;
  state.questions = entry.questions; state.fullShowRounds = []; state.mode = 'single'; state.currentRoundIndex = 0; state.currentIndex = 0; state.girlsScore = 0; state.boysScore = 0; state.girlsRounds = 0; state.boysRounds = 0; $('savedModal').classList.add('hidden'); prepareGame();
}
function deleteSavedSet(id) { localStorage.setItem(SAVED_KEY, JSON.stringify(getSavedSets().filter((entry) => entry.id !== id))); renderSavedList(); }

/* نقطة 2: إخفاء الزر في البداية وإظهاره في اللعبة/النتائج */
function initFloatingSound() {
  const setupScreen = $('setupScreen');
  const gameScreen = $('gameScreen');
  const resultsScreen = $('resultsScreen');
  
  // الأزرار داخل كل شاشة
  const gameBtn = $('floatingSoundBtn');
  const gameBoard = $('floatingSoundBoard');
  const resultsBtn = $('floatingSoundBtnResults');
  const resultsBoard = $('floatingSoundBoardResults');
  
  if (gameBtn) {
    gameBtn.addEventListener('click', () => gameBoard.classList.toggle('hidden'));
    if ($('closeFloatingSound')) $('closeFloatingSound').addEventListener('click', () => gameBoard.classList.add('hidden'));
  }
  if (resultsBtn) {
    resultsBtn.addEventListener('click', () => resultsBoard.classList.toggle('hidden'));
    if ($('closeFloatingSoundResults')) $('closeFloatingSoundResults').addEventListener('click', () => resultsBoard.classList.add('hidden'));
  }
}

function initSetup() {
  $$('.mode-tab').forEach((tab) => tab.addEventListener('click', () => { $$('.mode-tab').forEach((item) => item.classList.remove('is-active')); tab.classList.add('is-active'); state.mode = tab.dataset.mode; $('fullShowOptions').hidden = state.mode !== 'fullshow'; $('categoryField').hidden = state.mode === 'fullshow'; }));
  $$('.stepper-btn').forEach((button) => button.addEventListener('click', () => { const input = $('count'); const current = Number(input.value) || 10; input.value = Math.max(3, Math.min(50, current + (button.dataset.action === 'plus' ? 1 : -1))); }));
  $$('[data-duration]').forEach((button) => button.addEventListener('click', () => { $$('[data-duration]').forEach((item) => item.classList.remove('is-active')); button.classList.add('is-active'); state.fullShowDuration = Number(button.dataset.duration); }));
  $$('[data-timer]').forEach((button) => button.addEventListener('click', () => { $$('[data-timer]').forEach((item) => item.classList.remove('is-active')); button.classList.add('is-active'); state.timerDuration = Number(button.dataset.timer); state.timerValue = state.timerDuration; }));
  $('generateBtn').addEventListener('click', () => state.mode === 'fullshow' ? generateFullShow() : generateSingleRound());
  $('savedStartBtn').addEventListener('click', openSaved);
  $('savedQuestionsBtn').addEventListener('click', openSaved);
  $('setupSoundBtn').addEventListener('click', toggleSound);
}
function initGame() {
  $('soundToggle').addEventListener('click', toggleSound); $('startTimerBtn').addEventListener('click', startTimer); $('revealBtn').addEventListener('click', revealAnswer); $('nextBtn').addEventListener('click', nextQuestion);
  $('girlsPlusBtn').addEventListener('click', () => applyPoint('girls')); $('girlsMinusBtn').addEventListener('click', () => subtractPoint('girls')); $('boysPlusBtn').addEventListener('click', () => applyPoint('boys')); $('boysMinusBtn').addEventListener('click', () => subtractPoint('boys'));
  $('nextRoundBtn').addEventListener('click', finishRound);
  $('endGameBtn').addEventListener('click', showResults);
  $('newRoundBtn').addEventListener('click', () => { stopTimer(); showScreen('setupScreen'); });
  $$('.gift-button').forEach((button) => button.addEventListener('click', () => selectGift(button.dataset.gift)));
  $('pickGirlsBtn').addEventListener('click', () => resolveGift('girls')); $('pickBoysBtn').addEventListener('click', () => resolveGift('boys')); $('cancelGiftBtn').addEventListener('click', () => { state.activeGift = null; $('activeGiftBanner').classList.add('hidden'); $$('.gift-button').forEach((button) => button.classList.remove('is-active')); });
  $('roundEndContinueBtn').addEventListener('click', continueAfterRound);
}
function initResults() { $('replayBtn').addEventListener('click', () => { stopTimer(); showScreen('setupScreen'); }); $$('.sound-trigger').forEach((button) => button.addEventListener('click', () => { playSound(button.dataset.sound, .7); button.classList.add('is-active'); setTimeout(() => button.classList.remove('is-active'), 300); })); }
function initOverlays() { $('closeSavedBtn').addEventListener('click', () => $('savedModal').classList.add('hidden')); ['savedModal', 'roundEndOverlay'].forEach((id) => $(id).addEventListener('click', (event) => { if (event.target.id === id) $(id).classList.add('hidden'); })); }
function init() {
  preloadSounds(); initFloatingSound(); state.questionHistory = getHistory(); state.soundEnabled = localStorage.getItem(SOUND_KEY) === 'true'; updateSoundButtons(); updateSavedCount(); initSetup(); initGame(); initResults(); initOverlays(); hideLoading(); updateTimer();
}
document.addEventListener('DOMContentLoaded', init);
