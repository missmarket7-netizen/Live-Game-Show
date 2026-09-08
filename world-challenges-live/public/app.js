const state = {
  mode: 'single', questions: [], fullShowRounds: [], currentRoundIndex: 0, currentIndex: 0,
  girlsScore: 0, boysScore: 0, girlsRounds: 0, boysRounds: 0,
  timerDuration: 30, timerValue: 30, timerInterval: null, isTimerRunning: false, isRevealed: false,
  soundEnabled: false, activeGift: null, questionHistory: [], showStartedAt: 0, showClockInterval: null,
  fullShowDuration: 120, shieldTeam: null, roundNumber: 1, isLoadingMore: false,
  captains: { girls: ['', '', ''], boys: ['', '', ''] }
};
const SAVED_KEY = 'lgs_saved_sets_v6';
const HISTORY_KEY = 'lgs_question_history_v6';
const SOUND_KEY = 'lgs_sound_v6';
const $ = (id) => document.getElementById(id);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const soundFiles = {
  'gift-rose': ['gift-rose'], 'gift-donut': ['gift-dount', 'gift-donut'], 'gift-corgi': ['gift-corgi'],
  'gift-heart': ['gift-heart'], 'gift-tiktok': ['gift-tiktok'], 'gift-cat': ['gift-cat'],
  'gift-crown': ['gift-crown'], begin: ['begin'], end: ['end'], learn: ['learn'], 'boys-mood': ['boys-mood'],
  'girls-captin': ['girls-captin'], 'boys-captin': ['boys-captin'], 'girls-galaxy': ['girls-galaxy'],
  'boys-galaxy': ['boys-galaxy'], 'girls-wheel': ['girls-wheel', 'girls-galaxy'], 'boys-wheel': ['boys-wheel', 'boys-galaxy'],
  girls2captin: ['girls2captin'], captin2boys: ['captin2boys'],
  'girls-round': ['girls-round'], 'boys-round': ['boys-round'], 'girls-lose': ['girls-lose'], 'boys-lose': ['boys-lose'],
  'girls-win': ['girls-win'], 'boys-win': ['boys-win'], Longway: ['Longway'],
  'girls-replay-boys': ['girls-replay-boys'], 'boys-replay-girls': ['boys-replay-girls'],
  advice: ['advice'], teamwork: ['teamwork'], boom: ['boom'], days: ['days'],
  'kont-feen': ['kont-feen'], fight: ['fight'], tick: ['tick'], correct: ['correct'], wrong: ['wrong']
};
const audioCache = {};
function getAudio(key) {
  if (audioCache[key]) return audioCache[key];
  const candidates = soundFiles[key] || [key];
  const audio = new Audio('/sounds/' + candidates[0] + '.mp3');
  audio.preload = 'none';
  let i = 0;
  audio.addEventListener('error', () => { i += 1; if (i < candidates.length) audio.src = '/sounds/' + candidates[i] + '.mp3'; });
  audioCache[key] = audio;
  return audio;
}
function playSound(key, volume) {
  if (typeof volume === 'undefined') volume = 0.55;
  if (!state.soundEnabled) return;
  const audio = getAudio(key);
  try { audio.currentTime = 0; audio.volume = volume; audio.play().catch(() => {}); } catch (e) {}
}
function scheduleBeginSound() {
  setTimeout(() => {
    const s = $('setupScreen');
    if (s && !s.classList.contains('hidden')) playSound('begin', 0.8);
  }, 5000);
}
function getSavedSets() { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch (e) { return []; } }
function getHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; } }
function saveHistory() { localStorage.setItem(HISTORY_KEY, JSON.stringify(state.questionHistory.slice(-200))); }
function pushHistory(qs) { state.questionHistory = state.questionHistory.concat(qs.map((q) => q.question)).slice(-200); saveHistory(); }
function saveQuestionSet(questions, meta) {
  meta = meta || {};
  const sets = getSavedSets();
  sets.unshift({ id: Date.now(), date: new Date().toLocaleString('ar-SA'), questions: questions, category: meta.category || 'اختيارات متنوعة', difficulty: meta.difficulty || 'متوسط', count: questions.length, source: meta.source || 'local' });
  localStorage.setItem(SAVED_KEY, JSON.stringify(sets.slice(0, 20)));
  updateSavedCount();
}
function updateSavedCount() { const el = $('savedCount'); if (el) el.textContent = getSavedSets().length; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function shuffle(list) { const items = list.slice(); for (let i = items.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); const t = items[i]; items[i] = items[j]; items[j] = t; } return items; }
function toggleSound() { state.soundEnabled = !state.soundEnabled; localStorage.setItem(SOUND_KEY, String(state.soundEnabled)); updateSoundButtons(); if (state.soundEnabled) playSound('begin', 0.35); }
function updateSoundButtons() { const glyph = state.soundEnabled ? '◉' : '○'; ['setupSoundBtn', 'soundToggle'].forEach((id) => { if ($(id)) { $(id).textContent = glyph; $(id).classList.toggle('sound-on', state.soundEnabled); } }); }
function showScreen(id) { $$('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== id)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function showLoading(m) { $('loadingText').textContent = m; $('loadingOverlay').classList.remove('hidden'); }
function hideLoading() { $('loadingOverlay').classList.add('hidden'); }
function showToast(text, kicker) { if (!kicker) kicker = 'SHOW CONTROL'; $('captainToastKicker').textContent = kicker; $('captainToastText').textContent = text; $('captainToast').classList.remove('hidden'); clearTimeout(showToast.timeout); showToast.timeout = setTimeout(() => $('captainToast').classList.add('hidden'), 3100); }
function formatClock() { const s = Math.floor((Date.now() - state.showStartedAt) / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function startShowClock() { state.showStartedAt = Date.now(); clearInterval(state.showClockInterval); state.showClockInterval = setInterval(() => { if ($('showClock')) $('showClock').textContent = formatClock(); }, 1000); }
function updateScores() {
  $('girlsScoreValue').textContent = state.girlsScore; $('boysScoreValue').textContent = state.boysScore;
  $('girlsProgress').style.width = Math.min(100, Math.max(0, state.girlsScore) * 20) + '%';
  $('boysProgress').style.width = Math.min(100, Math.max(0, state.boysScore) * 20) + '%';
  $('girlsRoundsWon').textContent = state.girlsRounds + ' جولات'; $('boysRoundsWon').textContent = state.boysRounds + ' جولات';
  $('roundResults').textContent = state.girlsRounds + ' - ' + state.boysRounds;
  if ($('roundDisplay')) $('roundDisplay').textContent = 'الجولة ' + state.roundNumber;
  $('teamShieldGirls').classList.toggle('hidden', state.shieldTeam !== 'girls');
  $('teamShieldBoys').classList.toggle('hidden', state.shieldTeam !== 'boys');
}
function updateTimer() { $('timerDisplay').textContent = state.timerValue; $('timerRing').classList.toggle('urgent', state.timerValue <= 3 && state.timerValue > 0); }
function stopTimer() { clearInterval(state.timerInterval); state.timerInterval = null; state.isTimerRunning = false; $('startTimerBtn').disabled = false; }
function startTimer() {
  if (state.isTimerRunning || state.isRevealed) return;
  state.isTimerRunning = true; $('startTimerBtn').disabled = true; state.timerValue = state.timerDuration; updateTimer(); playSound('tick', 0.25);
  state.timerInterval = setInterval(() => {
    state.timerValue -= 1; updateTimer();
    if (state.timerValue > 0 && state.timerValue <= 3) playSound('tick', 0.24);
    if (state.timerValue <= 0) { stopTimer(); playSound('wrong', 0.35); showToast('انتهى الوقت — اكشف الإجابة!', 'TIME UP'); }
  }, 1000);
}
function renderQuestion() {
  const question = state.questions[state.currentIndex]; if (!question) return;
  stopTimer(); state.isRevealed = false; state.timerValue = state.timerDuration; updateTimer();
  updateScores();
  $('roundProgress').textContent = String(state.currentIndex + 1).padStart(2, '0') + ' / ' + String(state.questions.length).padStart(2, '0');
  $('questionCounter').textContent = 'السؤال ' + String(state.currentIndex + 1).padStart(2, '0') + ' / ' + String(state.questions.length).padStart(2, '0');
  $('questionNumber').textContent = String(state.currentIndex + 1).padStart(2, '0');
  $('categoryBadge').textContent = question.category || 'اختيارات متنوعة';
  $('questionText').textContent = question.question;
  $('answerText').textContent = '—'; $('explanationText').textContent = '—'; $('answerReveal').classList.add('hidden');
  $('revealBtn').disabled = false; $('nextBtn').disabled = false;
  $('sourceBadge').textContent = question.source === 'ai' ? 'AI BANK READY' : 'LOCAL BANK READY';
  $('questionSource').textContent = question.source === 'ai' ? 'AUTO-SAVED / AI' : 'AUTO-SAVED';
  const grid = $('optionsGrid'); grid.innerHTML = '';
  (question.options || []).slice(0, 4).forEach((option, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'option-btn';
    button.dataset.letter = String.fromCharCode(65 + index); button.textContent = option;
    button.addEventListener('click', () => selectAnswer(index)); grid.appendChild(button);
  });
  if (!question.options || question.options.length === 0) {
    const pill = document.createElement('div'); pill.className = 'think-pill'; pill.textContent = '⚡ سؤال سرعة — إجابة حرة، الحكم للمضيف';
    grid.appendChild(pill);
  }
  $$('.gift-button').forEach((b) => b.classList.remove('is-active'));
  $('activeGiftBanner').classList.add('hidden');
}
function revealAnswer() {
  if (state.isRevealed) return;
  const question = state.questions[state.currentIndex]; if (!question) return;
  state.isRevealed = true; stopTimer();
  const freeAnswer = !question.options || question.options.length === 0;
  $$('.option-btn').forEach((button, index) => { button.classList.remove('selected'); if (!freeAnswer && index === question.correctIndex) button.classList.add('correct'); });
  $('answerText').textContent = freeAnswer ? 'إجابة حرة — يحدد المضيف الفريق الفائز' : String.fromCharCode(65 + question.correctIndex) + '. ' + question.options[question.correctIndex];
  $('explanationText').textContent = question.explanation || 'معلومة إضافية للمقدم غير متاحة.';
  $('answerReveal').classList.remove('hidden'); $('revealBtn').disabled = true;
}
function selectAnswer(index) {
  if (state.isRevealed) return;
  const question = state.questions[state.currentIndex]; const buttons = $$('.option-btn');
  buttons.forEach((button, buttonIndex) => { button.classList.toggle('selected', buttonIndex === index); if (buttonIndex === index && buttonIndex !== question.correctIndex) button.classList.add('wrong'); });
  playSound(index === question.correctIndex ? 'correct' : 'wrong', 0.5); revealAnswer();
}
function closeGiftBanner() {
  state.activeGift = null;
  $('activeGiftBanner').classList.add('hidden');
  $$('.gift-button').forEach((b) => b.classList.remove('is-active'));
}
function selectGift(gift) {
  state.activeGift = gift; $$('.gift-button').forEach((b) => b.classList.toggle('is-active', b.dataset.gift === gift));
  if (gift === 'galaxy' || gift === 'wheel' || gift === 'heart') {
    $('activeGiftText').textContent = gift === 'heart' ? 'اختر الفريق لتفعيل درع الحماية' : 'اختر الفريق لتفعيل الدمار الشامل';
    $('activeGiftBanner').classList.remove('hidden'); playSound('tick', 0.28); return;
  }
  if (gift === 'rose') { subtractPoint('boys', true); playSound('gift-rose', 0.6); }
  else if (gift === 'tiktok') { subtractPoint('girls', true); playSound('gift-tiktok', 0.6); }
  else if (gift === 'donut') { state.girlsRounds += 1; state.girlsScore = 0; state.boysScore = 0; playSound('gift-donut', 0.65); showToast('+1 جولة لفريق البنات', 'GIFT LOCKED'); updateScores(); }
  else if (gift === 'corgi') { state.girlsRounds += 10; state.girlsScore = 0; state.boysScore = 0; playSound('gift-corgi', 0.65); showToast('+10 جولات لفريق البنات', 'GIFT LOCKED'); updateScores(); }
  else if (gift === 'cat') { state.boysRounds += 1; state.girlsScore = 0; state.boysScore = 0; playSound('gift-cat', 0.65); showToast('+1 جولة لفريق الشباب', 'GIFT LOCKED'); updateScores(); }
  else if (gift === 'crown') { state.boysRounds += 10; state.girlsScore = 0; state.boysScore = 0; playSound('gift-crown', 0.65); showToast('+10 جولات لفريق الشباب', 'GIFT LOCKED'); updateScores(); }
  setTimeout(() => { state.activeGift = null; $$('.gift-button').forEach((b) => b.classList.remove('is-active')); }, 450);
}
function resolveGift(team) {
  const gift = state.activeGift; if (!gift) return;
  if (gift === 'heart') {
    state.shieldTeam = team;
    playSound('gift-heart', 0.7); showToast('درع الحماية لفريق ' + (team === 'girls' ? 'البنات' : 'الشباب'), 'PROTECTION ON');
    closeGiftBanner(); updateScores(); return;
  }
  let roundsToAdd = 0;
  if (gift === 'galaxy') roundsToAdd = 50;
  else if (gift === 'wheel') roundsToAdd = 100;
  const giftSound = team === 'girls' ? 'girls-wheel' : 'boys-wheel';
  if (team === 'girls') state.girlsRounds += roundsToAdd; else state.boysRounds += roundsToAdd;
  playSound(giftSound, 0.7);
  showToast('+' + roundsToAdd + ' جولة لفريق ' + (team === 'girls' ? 'البنات' : 'الشباب'), 'GIFT LOCKED');
  state.girlsScore = 0; state.boysScore = 0;
  closeGiftBanner(); updateScores();
}
function subtractPoint(team, viaGift) {
  if (state.shieldTeam === team) { playSound('gift-heart', 0.4); showToast('فريق ' + (team === 'girls' ? 'البنات' : 'الشباب') + ' محمي بالدرع', 'SHIELD ACTIVE'); return; }
  if (team === 'girls') state.girlsScore = Math.max(-5, state.girlsScore - 1);
  else state.boysScore = Math.max(-5, state.boysScore - 1);
  updateScores();
  if (!viaGift) playSound('wrong', 0.25);
}
function applyPoint(team, points) {
  if (!points) points = 1;
  if (team === 'girls') {
    if (state.girlsScore < 0) state.girlsScore = Math.min(0, state.girlsScore + points);
    else state.girlsScore = Math.min(5, state.girlsScore + points);
  } else {
    if (state.boysScore < 0) state.boysScore = Math.min(0, state.boysScore + points);
    else state.boysScore = Math.min(5, state.boysScore + points);
  }
  updateScores(); playSound('correct', 0.28);
  if (state.girlsScore >= 5 || state.boysScore >= 5) showToast('اكتملت 5 نقاط! اضغط «الجولة التالية» لإعلان فوز الجولة', 'ROUND READY');
}
function finishRound() {
  stopTimer();
  const currentRound = state.roundNumber; let winner = 'تعادل رائع بين الفريقين';
  if (state.girlsScore >= 5) { state.girlsRounds += 1; winner = 'فوز فريق البنات'; playSound('girls-round', 0.7); setTimeout(() => playSound('boys-lose', 0.35), 12000); }
  else if (state.boysScore >= 5) { state.boysRounds += 1; winner = 'فوز فريق الشباب'; playSound('boys-round', 0.7); setTimeout(() => playSound('girls-lose', 0.35), 12000); }
  else if (state.girlsScore > state.boysScore) { state.girlsRounds += 1; winner = 'فوز فريق البنات'; playSound('girls-round', 0.7); setTimeout(() => playSound('boys-lose', 0.35), 12000); }
  else if (state.boysScore > state.girlsScore) { state.boysRounds += 1; winner = 'فوز فريق الشباب'; playSound('boys-round', 0.7); setTimeout(() => playSound('girls-lose', 0.35), 12000); }
  else playSound('girls-round', 0.35);
  updateScores();
  $('roundEndNumber').textContent = 'الجولة ' + currentRound;
  $('roundEndWinner').textContent = winner;
  $('roundEndGirlsScore').textContent = state.girlsScore; $('roundEndBoysScore').textContent = state.boysScore;
  $('roundEndOverlay').classList.remove('hidden'); fireConfetti();
  state.girlsScore = 0; state.boysScore = 0; state.shieldTeam = null; updateScores();
}
/* القاعدة الذهبية: استمرار العرض يفتح جولة جديدة دائماً — بلا سقف جولات، وبلا إنهاء تلقائي للايف */
function continueAfterRound() {
  $('roundEndOverlay').classList.add('hidden');
  state.roundNumber += 1;
  if (state.mode === 'fullshow' && state.currentRoundIndex < state.fullShowRounds.length - 1) {
    state.currentRoundIndex += 1;
    state.questions = state.fullShowRounds[state.currentRoundIndex].questions;
    state.currentIndex = 0;
    updateScores(); renderQuestion();
    showToast('نبدأ الجولة ' + state.roundNumber, 'NEXT ROUND');
    return;
  }
  startNextRoundFetch();
}
async function startNextRoundFetch() {
  showLoading('نجهز أسئلة الجولة ' + state.roundNumber + '...');
  try {
    const qs = await fetchBank({ category: 'اختيارات متنوعة', difficulty: 'متوسط', count: 10, avoid: state.questionHistory.slice(-120) });
    if (qs.length > 0) {
      state.questions = qs; state.currentIndex = 0;
      pushHistory(qs);
      updateScores(); renderQuestion();
      showToast('الجولة ' + state.roundNumber + ' على الهواء — اللايف مستمر', 'NEXT ROUND');
    } else {
      showToast('لا أسئلة متاحة لجولة جديدة — اضغط «إنهاء اللايف» لإعلان الفائز', 'SHOW CONTROL');
    }
  } catch (e) {
    showToast('تعذر تحميل جولة جديدة — اضغط «إنهاء اللايف» لإعلان الفائز', 'SHOW CONTROL');
  }
  hideLoading();
}
/* الجولة لا تُغلق وحدها عند آخر سؤال: تُحمَّل أسئلة إضافية وتستمر */
function nextQuestion() {
  if (!state.isRevealed) { showToast('اكشف الإجابة أولاً ثم انتقل', 'HOST TIP'); return; }
  if (state.currentIndex < state.questions.length - 1) { state.currentIndex += 1; renderQuestion(); startTimer(); return; }
  loadMoreQuestions();
}
async function loadMoreQuestions() {
  if (state.isLoadingMore) return;
  state.isLoadingMore = true; showLoading('نحمّل أسئلة إضافية لنفس الجولة...');
  try {
    const avoid = state.questionHistory.concat(state.questions.map((q) => q.question)).slice(-150);
    const qs = await fetchBank({ category: 'اختيارات متنوعة', difficulty: 'متوسط', count: 10, avoid: avoid });
    if (qs.length > 0) {
      state.questions = state.questions.concat(qs);
      pushHistory(qs);
      state.currentIndex += 1; renderQuestion(); startTimer();
      showToast('تمت إضافة ' + qs.length + ' أسئلة — الجولة مستمرة', 'BANK LOADED');
    } else {
      showToast('لا أسئلة إضافية — اضغط «الجولة التالية» لإنهاء الجولة', 'SHOW CONTROL');
    }
  } catch (e) {
    showToast('تعذر التحميل — اضغط «الجولة التالية» لإنهاء الجولة', 'SHOW CONTROL');
  }
  hideLoading(); state.isLoadingMore = false;
}
async function fetchBank(params) {
  try {
    const response = await fetch('/api/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
    const data = await response.json();
    return Array.isArray(data.questions) ? data.questions : [];
  } catch (e) { return []; }
}
function showResults() {
  stopTimer(); showScreen('resultsScreen');
  $('finalGirlsScore').textContent = state.girlsRounds; $('finalBoysScore').textContent = state.boysRounds;
  const winner = $('winnerText');
  if (state.girlsRounds > state.boysRounds) { winner.textContent = 'فريق البنات فاز!'; winner.style.color = 'var(--pink-hot)'; playSound('girls-win', 0.8); }
  else if (state.boysRounds > state.girlsRounds) { winner.textContent = 'فريق الشباب فاز!'; winner.style.color = 'var(--cyan)'; playSound('boys-win', 0.8); }
  else { winner.textContent = 'تعادل أبطال الليلة'; winner.style.color = 'var(--gold-hot)'; playSound('end', 0.75); }
  setTimeout(() => playSound('end', 0.35), 700); fireConfetti();
}
function fireConfetti() {
  const canvas = $('confettiCanvas'); const ctx = canvas.getContext('2d'); canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const colors = ['#f45ca0', '#5de2ff', '#ffd36e', '#64ecad', '#917aff'];
  const particles = Array.from({ length: 105 }, () => ({ x: Math.random() * canvas.width, y: -20 - Math.random() * 100, size: 3 + Math.random() * 5, speed: 2 + Math.random() * 3.5, drift: (Math.random() - 0.5) * 2.6, spin: Math.random() * 6.28, color: colors[Math.floor(Math.random() * colors.length)], alpha: 1 }));
  let frame = 0;
  const animate = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); let active = false; particles.forEach((p) => { if (p.alpha <= 0) return; active = true; p.y += p.speed; p.x += p.drift; p.spin += 0.08; p.alpha -= 0.006; ctx.save(); ctx.globalAlpha = p.alpha; ctx.fillStyle = p.color; ctx.translate(p.x, p.y); ctx.rotate(p.spin); ctx.fillRect(-p.size / 2, -p.size / 2, p.size * 1.5, p.size); ctx.restore(); }); if (active && frame < 260) { frame += 1; requestAnimationFrame(animate); } else ctx.clearRect(0, 0, canvas.width, canvas.height); };
  animate();
}
function confirmCaptain(team, slot) {
  const input = document.querySelector('.captain-input[data-team="' + team + '"][data-slot="' + slot + '"]');
  if (!input) return;
  const name = input.value.trim();
  if (!name) { showToast('اكتب اسم الكابتن أولاً', 'HOST TIP'); return; }
  input.value = name; input.classList.add('confirmed');
  state.captains[team][slot] = name;
  showCaptainReveal(name, team);
  playSound(team === 'girls' ? 'girls-captin' : 'boys-captin', 0.8);
}
function showCaptainReveal(name, team) {
  const overlay = $('captainRevealOverlay'); if (!overlay) return;
  $('captainRevealName').textContent = name;
  overlay.classList.remove('hidden', 'team-girls', 'team-boys');
  overlay.classList.add(team === 'girls' ? 'team-girls' : 'team-boys');
  clearTimeout(showCaptainReveal.timeout);
  showCaptainReveal.timeout = setTimeout(() => overlay.classList.add('hidden'), 10000);
}
async function generateSingleRound() {
  const category = $('category').value || 'اختيارات متنوعة';
  const difficulty = $('difficulty').value || 'متوسط';
  const count = Math.max(3, Math.min(30, Number($('count').value) || 10));
  showLoading('نجهز الأسئلة من البنك...');
  try {
    const questions = await fetchBank({ category: category, difficulty: difficulty, count: count, avoid: state.questionHistory.slice(-100) });
    if (questions.length > 0) {
      state.questions = questions; state.fullShowRounds = []; state.mode = 'single'; state.currentIndex = 0; state.currentRoundIndex = 0;
      state.girlsScore = 0; state.boysScore = 0; state.girlsRounds = 0; state.boysRounds = 0; state.shieldTeam = null;
      pushHistory(questions); saveQuestionSet(questions, { category: category, difficulty: difficulty, source: questions[0] ? questions[0].source : 'local' });
      prepareGame();
    } else showToast('لا توجد أسئلة متاحة حالياً', 'SHOW CONTROL');
  } catch (e) { showToast('خطأ في جلب الأسئلة', 'ERROR'); }
  hideLoading();
}
async function generateFullShow() {
  const plan = [
    { title: 'الجولة 1', category: 'معلومات عامة', difficulty: 'سهل', count: 10 },
    { title: 'الجولة 2', category: 'جغرافيا', difficulty: 'متوسط', count: 10 },
    { title: 'الجولة الذهبية', category: 'اختيارات متنوعة', difficulty: 'صعب', count: 10 }
  ];
  state.fullShowRounds = []; showLoading('نرتب فصول اللايف...');
  try {
    for (let i = 0; i < plan.length; i += 1) {
      $('loadingText').textContent = 'نجهز ' + plan[i].title + ' — ' + (i + 1) + ' / ' + plan.length;
      const questions = await fetchBank({ category: plan[i].category, difficulty: plan[i].difficulty, count: plan[i].count, avoid: state.questionHistory.slice(-100) });
      state.fullShowRounds.push({ title: plan[i].title, questions: questions });
      pushHistory(questions);
    }
    saveQuestionSet(state.fullShowRounds.flatMap((r) => r.questions), { category: 'لايف كامل', difficulty: 'متدرج' });
    state.mode = 'fullshow'; state.currentRoundIndex = 0; state.questions = state.fullShowRounds[0].questions; state.currentIndex = 0;
    state.girlsScore = 0; state.boysScore = 0; state.girlsRounds = 0; state.boysRounds = 0; state.shieldTeam = null;
    prepareGame();
  } catch (e) { showToast('تعذر تجهيز اللايف', 'ERROR'); }
  hideLoading();
}
function prepareGame() {
  state.roundNumber = 1;
  updateScores(); showScreen('gameScreen'); startShowClock(); renderQuestion(); playSound('begin', 0.75);
}
function renderSavedList() {
  const saved = getSavedSets(); const list = $('savedList'); updateSavedCount();
  if (!saved.length) { list.innerHTML = '<div class="saved-empty">لا توجد جولات محفوظة بعد.</div>'; return; }
  list.innerHTML = saved.map((e) => '<article class="saved-item"><div class="saved-item-title">' + escapeHtml(e.category) + ' — ' + escapeHtml(e.difficulty) + ' <span>(' + e.count + ')</span></div><div class="saved-item-meta">' + escapeHtml(e.date) + ' · ' + (e.source === 'ai' ? 'AI GENERATED' : 'LOCAL BANK') + '</div><div class="saved-item-actions"><button class="saved-item-btn saved-item-use" data-use="' + e.id + '" type="button">استخدام</button><button class="saved-item-btn saved-item-delete" data-delete="' + e.id + '" type="button">حذف</button></div></article>').join('');
  $$('[data-use]').forEach((b) => b.addEventListener('click', () => useSavedSet(Number(b.dataset.use))));
  $$('[data-delete]').forEach((b) => b.addEventListener('click', () => deleteSavedSet(Number(b.dataset.delete))));
}
function openSaved() { renderSavedList(); $('savedModal').classList.remove('hidden'); }
function useSavedSet(id) {
  const e = getSavedSets().find((s) => s.id === id); if (!e) return;
  state.questions = e.questions; state.fullShowRounds = []; state.mode = 'single'; state.currentRoundIndex = 0; state.currentIndex = 0;
  state.girlsScore = 0; state.boysScore = 0; state.girlsRounds = 0; state.boysRounds = 0; state.shieldTeam = null;
  $('savedModal').classList.add('hidden'); prepareGame();
}
function deleteSavedSet(id) { localStorage.setItem(SAVED_KEY, JSON.stringify(getSavedSets().filter((s) => s.id !== id))); renderSavedList(); }
function initSetup() {
  $$('.mode-tab').forEach((t) => t.addEventListener('click', () => { $$('.mode-tab').forEach((x) => x.classList.remove('is-active')); t.classList.add('is-active'); state.mode = t.dataset.mode; $('fullShowOptions').hidden = state.mode !== 'fullshow'; $('categoryField').hidden = state.mode === 'fullshow'; }));
  $$('.stepper-btn').forEach((b) => b.addEventListener('click', () => { const i = $('count'); const c = Number(i.value) || 10; i.value = Math.max(3, Math.min(30, c + (b.dataset.action === 'plus' ? 1 : -1))); }));
  $$('[data-duration]').forEach((b) => b.addEventListener('click', () => { $$('[data-duration]').forEach((x) => x.classList.remove('is-active')); b.classList.add('is-active'); state.fullShowDuration = Number(b.dataset.duration); }));
  $$('[data-timer]').forEach((b) => b.addEventListener('click', () => { $$('[data-timer]').forEach((x) => x.classList.remove('is-active')); b.classList.add('is-active'); state.timerDuration = Number(b.dataset.timer); state.timerValue = state.timerDuration; }));
  $('generateBtn').addEventListener('click', () => state.mode === 'fullshow' ? generateFullShow() : generateSingleRound());
  $('savedStartBtn').addEventListener('click', generateSingleRound);
  $('savedQuestionsBtn').addEventListener('click', openSaved);
  $('setupSoundBtn').addEventListener('click', toggleSound);
}
function initGame() {
  $('soundToggle').addEventListener('click', toggleSound);
  $('startTimerBtn').addEventListener('click', startTimer);
  $('revealBtn').addEventListener('click', revealAnswer);
  $('nextBtn').addEventListener('click', nextQuestion);
  $('girlsPlusBtn').addEventListener('click', () => applyPoint('girls'));
  $('girlsMinusBtn').addEventListener('click', () => subtractPoint('girls'));
  $('boysPlusBtn').addEventListener('click', () => applyPoint('boys'));
  $('boysMinusBtn').addEventListener('click', () => subtractPoint('boys'));
  $('nextRoundBtn').addEventListener('click', finishRound);
  $('endGameBtn').addEventListener('click', showResults);
  $('newRoundBtn').addEventListener('click', () => { stopTimer(); showScreen('setupScreen'); });
  $$('.gift-button').forEach((b) => b.addEventListener('click', () => selectGift(b.dataset.gift)));
  $('pickGirlsBtn').addEventListener('click', () => resolveGift('girls'));
  $('pickBoysBtn').addEventListener('click', () => resolveGift('boys'));
  $('cancelGiftBtn').addEventListener('click', closeGiftBanner);
  $('roundEndContinueBtn').addEventListener('click', continueAfterRound);
  $$('.captain-done').forEach((b) => b.addEventListener('click', () => confirmCaptain(b.dataset.team, b.dataset.slot)));
  $$('.sound-trigger').forEach((b) => b.addEventListener('click', () => playSound(b.dataset.sound, 0.7)));
}
function initResults() { $('replayBtn').addEventListener('click', () => { stopTimer(); showScreen('setupScreen'); }); }
function initOverlays() {
  $('closeSavedBtn').addEventListener('click', () => $('savedModal').classList.add('hidden'));
  ['savedModal', 'roundEndOverlay'].forEach((id) => $(id).addEventListener('click', (e) => { if (e.target.id === id) $(id).classList.add('hidden'); }));
}
function initFloatingSound() {
  const gb = $('floatingSoundBtn'); const gp = $('floatingSoundBoard');
  if (gb) { gb.addEventListener('click', () => gp.classList.toggle('hidden')); if ($('closeFloatingSound')) $('closeFloatingSound').addEventListener('click', () => gp.classList.add('hidden')); }
  const rb = $('floatingSoundBtnResults'); const rp = $('floatingSoundBoardResults');
  if (rb) { rb.addEventListener('click', () => rp.classList.toggle('hidden')); if ($('closeFloatingSoundResults')) $('closeFloatingSoundResults').addEventListener('click', () => rp.classList.add('hidden')); }
}
function init() {
  state.questionHistory = getHistory();
  state.soundEnabled = localStorage.getItem(SOUND_KEY) === 'true';
  updateSoundButtons(); updateSavedCount();
  initSetup(); initGame(); initResults(); initOverlays(); initFloatingSound();
  hideLoading(); updateTimer(); scheduleBeginSound();
}
document.addEventListener('DOMContentLoaded', init);
