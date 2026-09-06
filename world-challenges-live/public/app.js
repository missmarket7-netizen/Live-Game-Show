const state = {
  mode: 'single', questions: [], fullShowRounds: [], currentRoundIndex: 0, currentIndex: 0,
  girlsScore: 0, boysScore: 0, girlsRounds: 0, boysRounds: 0,
  timerDuration: 30, timerValue: 30, timerInterval: null, isTimerRunning: false, isRevealed: false,
  soundEnabled: false, activeGift: null, questionHistory: [], showStartedAt: 0, showClockInterval: null,
  fullShowDuration: 120, shieldGirls: false, shieldBoys: false,
  captains: { girls: ['', '', ''], boys: ['', '', ''] }
};
const SAVED_KEY = 'lgs_saved_sets_v7';
const HISTORY_KEY = 'lgs_question_history_v7';
const SOUND_KEY = 'lgs_sound_v7';
const $ = (id) => document.getElementById(id);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
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
const categoryEmoji = { 'معلومات عامة': '🧠', 'جغرافيا': '🌍', 'علوم': '🔬', 'تاريخ': '📜', 'دين': '🕌', 'أسئلة دينية': '🕌', 'ألغاز': '🧩', 'لغز': '🧩', 'رياضة': '⚽', 'تكنولوجيا': '⌘', 'سينما مصرية': '🎬', 'سينما عربية': '🎬', 'سرعة': '⚡', 'اختيارات متنوعة': '◈' };

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
  if (!state.soundEnabled) return;
  if (volume === undefined) volume = 0.55;
  const audio = getAudio(key);
  try { audio.currentTime = 0; audio.volume = volume; audio.play().catch(() => {}); } catch (e) {}
}
function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  localStorage.setItem(SOUND_KEY, String(state.soundEnabled));
  updateSoundButtons();
  if (state.soundEnabled) { const s = $('setupScreen'); if (s && !s.classList.contains('hidden')) playSound('begin', 0.8); }
}
function updateSoundButtons() {
  const g = state.soundEnabled ? '◉' : '○';
  ['setupSoundBtn', 'soundToggle'].forEach((id) => { const el = $(id); if (el) { el.textContent = g; el.classList.toggle('sound-on', state.soundEnabled); } });
}
function getSavedSets() { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch (e) { return []; } }
function getHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; } }
function saveHistory() { localStorage.setItem(HISTORY_KEY, JSON.stringify(state.questionHistory.slice(-200))); }
function saveQuestionSet(questions, meta) {
  meta = meta || {};
  const sets = getSavedSets();
  sets.unshift({ id: Date.now(), date: new Date().toLocaleString('ar-SA'), questions: questions, category: meta.category || 'اختيارات متنوعة', difficulty: meta.difficulty || 'متوسط', count: questions.length, source: meta.source || 'local' });
  localStorage.setItem(SAVED_KEY, JSON.stringify(sets.slice(0, 20)));
  updateSavedCount();
}
function updateSavedCount() { const el = $('savedCount'); if (el) el.textContent = getSavedSets().length; }
function escapeHtml(v) { return String(v).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function shuffle(list) { const a = list.slice(); for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function showScreen(id) { $$('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== id)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function showLoading(m) { $('loadingText').textContent = m; $('loadingOverlay').classList.remove('hidden'); }
function hideLoading() { $('loadingOverlay').classList.add('hidden'); }
function showToast(text, kicker) {
  if (!kicker) kicker = 'SHOW CONTROL';
  $('captainToastKicker').textContent = kicker; $('captainToastText').textContent = text;
  $('captainToast').classList.remove('hidden');
  clearTimeout(showToast.timeout); showToast.timeout = setTimeout(() => $('captainToast').classList.add('hidden'), 3100);
}
function formatClock() { const s = Math.floor((Date.now() - state.showStartedAt) / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function startShowClock() { state.showStartedAt = Date.now(); clearInterval(state.showClockInterval); state.showClockInterval = setInterval(() => { if ($('showClock')) $('showClock').textContent = formatClock(); }, 1000); }
function updateScores() {
  $('girlsScoreValue').textContent = state.girlsScore; $('boysScoreValue').textContent = state.boysScore;
  $('girlsProgress').style.width = Math.min(100, Math.max(0, state.girlsScore) * 20) + '%';
  $('boysProgress').style.width = Math.min(100, Math.max(0, state.boysScore) * 20) + '%';
  $('girlsRoundsWon').textContent = state.girlsRounds + ' جولات'; $('boysRoundsWon').textContent = state.boysRounds + ' جولات';
  $('roundResults').textContent = state.girlsRounds + ' - ' + state.boysRounds;
  const rn = state.mode === 'fullshow' ? (state.currentRoundIndex + 1) : (state.girlsRounds + state.boysRounds + 1);
  if ($('roundDisplay')) $('roundDisplay').textContent = 'الجولة ' + rn;
  $('teamShieldGirls').classList.toggle('hidden', !state.shieldGirls);
  $('teamShieldBoys').classList.toggle('hidden', !state.shieldBoys);
}
function updateTimer() { $('timerDisplay').textContent = state.timerValue; $('timerRing').classList.toggle('urgent', state.timerValue <= 3 && state.timerValue > 0); }
function stopTimer() { clearInterval(state.timerInterval); state.timerInterval = null; state.isTimerRunning = false; $('startTimerBtn').disabled = false; }
function startTimer() {
  if (state.isTimerRunning || state.isRevealed) return;
  state.isTimerRunning = true; $('startTimerBtn').disabled = true;
  state.timerValue = state.timerDuration; updateTimer(); playSound('tick', 0.25);
  state.timerInterval = setInterval(() => {
    state.timerValue -= 1; updateTimer();
    if (state.timerValue > 0 && state.timerValue <= 3) playSound('tick', 0.24);
    if (state.timerValue <= 0) { stopTimer(); playSound('wrong', 0.35); showToast('انتهى الوقت — اكشف الإجابة!', 'TIME UP'); }
  }, 1000);
}
function isFreeQuestion(q) { return !q || !Array.isArray(q.options) || q.options.length === 0; }
function renderQuestion() {
  const q = state.questions[state.currentIndex]; if (!q) return;
  stopTimer(); state.isRevealed = false; state.timerValue = state.timerDuration; updateTimer(); updateScores();
  $('roundProgress').textContent = String(state.currentIndex + 1).padStart(2, '0') + ' / ' + String(state.questions.length).padStart(2, '0');
  $('questionCounter').textContent = 'السؤال ' + String(state.currentIndex + 1).padStart(2, '0') + ' / ' + String(state.questions.length).padStart(2, '0');
  $('questionNumber').textContent = String(state.currentIndex + 1).padStart(2, '0');
  $('categoryBadge').textContent = (categoryEmoji[q.category] || '◈') + ' ' + (q.category || 'اختيارات متنوعة');
  $('questionText').textContent = q.question;
  $('answerText').textContent = '—'; $('explanationText').textContent = '—'; $('answerReveal').classList.add('hidden');
  $('revealBtn').disabled = false; $('nextBtn').disabled = false;
  $('sourceBadge').textContent = q.source === 'ai' ? 'AI BANK READY' : 'LOCAL BANK READY';
  $('questionSource').textContent = q.source === 'ai' ? 'AUTO-SAVED / AI' : 'AUTO-SAVED';
  const grid = $('optionsGrid'); grid.innerHTML = '';
  if (isFreeQuestion(q)) {
    const pill = document.createElement('div');
    pill.className = 'free-answer-pill';
    pill.textContent = '🎤 إجابة حرة — الحكم للمضيف';
    grid.appendChild(pill);
  } else {
    q.options.slice(0, 4).forEach((opt, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'option-btn';
      b.dataset.letter = String.fromCharCode(65 + i); b.textContent = opt;
      b.addEventListener('click', () => selectAnswer(i)); grid.appendChild(b);
    });
  }
  $$('.gift-button').forEach((b) => b.classList.remove('is-active'));
  $('activeGiftBanner').classList.add('hidden');
}
function revealAnswer() {
  if (state.isRevealed) return;
  const q = state.questions[state.currentIndex]; if (!q) return;
  state.isRevealed = true; stopTimer();
  if (!isFreeQuestion(q)) {
    $$('.option-btn').forEach((b, i) => { b.classList.remove('selected'); if (i === q.correctIndex) b.classList.add('correct'); });
    $('answerText').textContent = String.fromCharCode(65 + q.correctIndex) + '. ' + q.options[q.correctIndex];
  } else { $('answerText').textContent = '🎤 إجابة حرة'; }
  $('explanationText').textContent = q.explanation || 'معلومة إضافية للمقدم.';
  $('answerReveal').classList.remove('hidden'); $('revealBtn').disabled = true;
}
function selectAnswer(i) {
  if (state.isRevealed) return;
  const q = state.questions[state.currentIndex]; const ok = i === q.correctIndex;
  $$('.option-btn').forEach((b, bi) => { b.classList.toggle('selected', bi === i); if (bi === i && !ok) b.classList.add('wrong'); });
  playSound(ok ? 'correct' : 'wrong', 0.5); revealAnswer();
}
function closeGiftBanner() { state.activeGift = null; $('activeGiftBanner').classList.add('hidden'); $$('.gift-button').forEach((b) => b.classList.remove('is-active')); }
function selectGift(gift) {
  state.activeGift = gift;
  $$('.gift-button').forEach((b) => b.classList.toggle('is-active', b.dataset.gift === gift));
  if (gift === 'galaxy' || gift === 'wheel' || gift === 'heart' || gift === 'donut' || gift === 'corgi') {
    const t = { heart: 'اختر الفريق لتفعيل درع الحماية', donut: 'اختر الفريق (الجولة للبنات دائماً)', corgi: 'اختر الفريق (10 جولات للبنات دائماً)', galaxy: 'اختر الفريق (+50 جولة)', wheel: 'اختر الفريق (+100 جولة)' }[gift];
    $('activeGiftText').textContent = t; $('activeGiftBanner').classList.remove('hidden'); return;
  }
  if (gift === 'rose') { subtractPoint('boys', true); playSound('gift-rose', 0.6); }
  else if (gift === 'tiktok') { subtractPoint('girls', true); playSound('gift-tiktok', 0.6); }
  else if (gift === 'cat') { state.boysRounds += 1; state.girlsScore = 0; state.boysScore = 0; playSound('gift-cat', 0.65); showToast('+1 جولة لفريق الشباب', 'GIFT LOCKED'); updateScores(); }
  else if (gift === 'crown') { state.boysRounds += 10; state.girlsScore = 0; state.boysScore = 0; playSound('gift-crown', 0.65); showToast('+10 جولات لفريق الشباب', 'GIFT LOCKED'); updateScores(); }
  setTimeout(() => { state.activeGift = null; $$('.gift-button').forEach((b) => b.classList.remove('is-active')); }, 450);
}
function resolveGift(team) {
  const gift = state.activeGift; if (!gift) return;
  if (gift === 'heart') {
    if (team === 'girls') state.shieldGirls = true; else state.shieldBoys = true;
    playSound('gift-heart', 0.7); showToast('درع الحماية لفريق ' + (team === 'girls' ? 'البنات' : 'الشباب'), 'PROTECTION ON');
    closeGiftBanner(); updateScores(); return;
  }
  if (gift === 'donut') {
    state.girlsRounds += 1; state.girlsScore = 0; state.boysScore = 0;
    playSound(team === 'girls' ? 'gift-donut' : 'gift-cat', 0.65); showToast('+1 جولة لفريق البنات', 'GIFT LOCKED');
    closeGiftBanner(); updateScores(); return;
  }
  if (gift === 'corgi') {
    state.girlsRounds += 10; state.girlsScore = 0; state.boysScore = 0;
    playSound(team === 'girls' ? 'gift-corgi' : 'gift-crown', 0.65); showToast('+10 جولات لفريق البنات', 'GIFT LOCKED');
    closeGiftBanner(); updateScores(); return;
  }
  const add = gift === 'galaxy' ? 50 : 100;
  if (team === 'girls') { state.girlsRounds += add; playSound('girls-wheel', 0.7); }
  else { state.boysRounds += add; playSound('boys-wheel', 0.7); }
  showToast('+' + add + ' جولة لفريق ' + (team === 'girls' ? 'البنات' : 'الشباب'), 'GIFT LOCKED');
  state.girlsScore = 0; state.boysScore = 0; closeGiftBanner(); updateScores();
}
function subtractPoint(team, viaGift) {
  if ((team === 'girls' && state.shieldGirls) || (team === 'boys' && state.shieldBoys)) { playSound('gift-heart', 0.4); showToast('فريق ' + (team === 'girls' ? 'البنات' : 'الشباب') + ' محمي بالدرع', 'SHIELD ACTIVE'); return; }
  if (team === 'girls') state.girlsScore = Math.max(-5, state.girlsScore - 1); else state.boysScore = Math.max(-5, state.boysScore - 1);
  updateScores(); if (!viaGift) playSound('wrong', 0.25);
}
function applyPoint(team, points) {
  if (!points) points = 1;
  if (team === 'girls') state.girlsScore = state.girlsScore < 0 ? Math.min(0, state.girlsScore + points) : Math.min(5, state.girlsScore + points);
  else state.boysScore = state.boysScore < 0 ? Math.min(0, state.boysScore + points) : Math.min(5, state.boysScore + points);
  updateScores(); playSound('correct', 0.28);
  if ((team === 'girls' && state.girlsScore >= 5) || (team === 'boys' && state.boysScore >= 5)) showToast('اكتملت 5 نقاط! اضغط "الجولة التالية"', 'ROUND READY');
}
function finishRound() {
  stopTimer();
  const rn = state.mode === 'fullshow' ? (state.currentRoundIndex + 1) : (state.girlsRounds + state.boysRounds + 1);
  let winner = 'تعادل رائع بين الفريقين';
  if (state.girlsScore >= 5 || (state.girlsScore > state.boysScore && state.girlsScore > 0)) { state.girlsRounds += 1; winner = 'فوز فريق البنات'; playSound('girls-round', 0.7); setTimeout(() => playSound('boys-lose', 0.35), 400); }
  else if (state.boysScore >= 5 || (state.boysScore > state.girlsScore && state.boysScore > 0)) { state.boysRounds += 1; winner = 'فوز فريق الشباب'; playSound('boys-round', 0.7); setTimeout(() => playSound('girls-lose', 0.35), 400); }
  else playSound('girls-round', 0.35);
  updateScores();
  $('roundEndNumber').textContent = 'الجولة ' + rn; $('roundEndWinner').textContent = winner;
  $('roundEndGirlsScore').textContent = state.girlsScore; $('roundEndBoysScore').textContent = state.boysScore;
  $('roundEndOverlay').classList.remove('hidden'); fireConfetti();
  state.shieldGirls = false; state.shieldBoys = false; state.girlsScore = 0; state.boysScore = 0; updateScores();
}
function continueAfterRound() {
  $('roundEndOverlay').classList.add('hidden');
  if (state.mode === 'fullshow' && state.currentRoundIndex < state.fullShowRounds.length - 1) {
    state.currentRoundIndex += 1; state.questions = state.fullShowRounds[state.currentRoundIndex].questions;
    state.currentIndex = 0; renderQuestion(); return;
  }
  showResults();
}
function nextQuestion() {
  if (!state.isRevealed) { showToast('اكشف الإجابة أولاً ثم انتقل', 'HOST TIP'); return; }
  if (state.currentIndex < state.questions.length - 1) { state.currentIndex += 1; renderQuestion(); startTimer(); }
  else finishRound();
}
function showResults() {
  stopTimer(); showScreen('resultsScreen');
  $('finalGirlsScore').textContent = state.girlsRounds; $('finalBoysScore').textContent = state.boysRounds;
  const w = $('winnerText');
  if (state.girlsRounds > state.boysRounds) { w.textContent = 'فريق البنات فاز!'; w.style.color = 'var(--pink-hot)'; playSound('girls-win', 0.8); }
  else if (state.boysRounds > state.girlsRounds) { w.textContent = 'فريق الشباب فاز!'; w.style.color = 'var(--cyan)'; playSound('boys-win', 0.8); }
  else { w.textContent = 'تعادل أبطال الليلة'; w.style.color = 'var(--gold-hot)'; playSound('end', 0.75); }
  setTimeout(() => playSound('end', 0.35), 700); fireConfetti();
}
function fireConfetti() {
  const c = $('confettiCanvas'); const ctx = c.getContext('2d'); c.width = window.innerWidth; c.height = window.innerHeight;
  const colors = ['#f45ca0', '#5de2ff', '#ffd36e', '#64ecad', '#917aff'];
  const ps = Array.from({ length: 105 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * 100, size: 3 + Math.random() * 5, speed: 2 + Math.random() * 3.5, drift: (Math.random() - 0.5) * 2.6, spin: Math.random() * 6.28, color: colors[Math.floor(Math.random() * colors.length)], alpha: 1 }));
  let f = 0;
  const an = () => { ctx.clearRect(0, 0, c.width, c.height); let act = false; ps.forEach((p) => { if (p.alpha <= 0) return; act = true; p.y += p.speed; p.x += p.drift; p.spin += 0.08; p.alpha -= 0.006; ctx.save(); ctx.globalAlpha = p.alpha; ctx.fillStyle = p.color; ctx.translate(p.x, p.y); ctx.rotate(p.spin); ctx.fillRect(-p.size / 2, -p.size / 2, p.size * 1.5, p.size); ctx.restore(); }); if (act && f < 260) { f += 1; requestAnimationFrame(an); } else ctx.clearRect(0, 0, c.width, c.height); };
  an();
}
function confirmCaptain(team, slot) {
  const inp = document.querySelector('.captain-input[data-team="' + team + '"][data-slot="' + slot + '"]');
  if (!inp) return;
  const name = inp.value.trim(); if (!name) { showToast('اكتب اسم الكابتن أولاً', 'HOST TIP'); return; }
  inp.value = name; inp.classList.add('confirmed'); state.captains[team][slot] = name;
  showCaptainReveal(name, team); playSound(team === 'girls' ? 'girls-captin' : 'boys-captin', 0.8);
}
function showCaptainReveal(name, team) {
  const o = $('captainRevealOverlay'); if (!o) return;
  $('captainRevealName').textContent = name;
  o.classList.remove('hidden', 'team-girls', 'team-boys');
  o.classList.add(team === 'girls' ? 'team-girls' : 'team-boys');
  clearTimeout(showCaptainReveal.timeout); showCaptainReveal.timeout = setTimeout(() => o.classList.add('hidden'), 10000);
}
async function fetchBank(params) {
  const r = await fetch('/api/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, params, { avoid: state.questionHistory.slice(-100) })) });
  const d = await r.json(); return Array.isArray(d.questions) ? d.questions : [];
}
async function fetchAI(params) {
  const r = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, params, { avoid: state.questionHistory.slice(-100) })) });
  const d = await r.json(); return Array.isArray(d.questions) ? d.questions : [];
}
function pushHistory(qs) { state.questionHistory = state.questionHistory.concat(qs.map((q) => q.question)).slice(-200); saveHistory(); }
async function generateSingleRound(useAI) {
  const category = $('category').value || 'اختيارات متنوعة';
  const difficulty = $('difficulty').value || 'متوسط';
  const count = Math.max(3, Math.min(30, Number($('count').value) || 10));
  showLoading(useAI ? 'نولّد أسئلة AI خليط...' : 'نجهز الأسئلة من البنك...');
  try {
    const qs = useAI ? await fetchAI({ count: count, category: category, difficulty: difficulty }) : await fetchBank({ count: count, category: category, difficulty: difficulty });
    if (qs.length > 0) {
      state.questions = qs; state.fullShowRounds = []; state.mode = 'single'; state.currentIndex = 0; state.currentRoundIndex = 0;
      state.girlsScore = 0; state.boysScore = 0; state.girlsRounds = 0; state.boysRounds = 0;
      pushHistory(qs); saveQuestionSet(qs, { category: category, difficulty: difficulty, source: qs[0] ? qs[0].source : 'local' });
      prepareGame();
    } else showToast('لا توجد أسئلة متاحة حالياً', 'SHOW CONTROL');
  } catch (e) { showToast('خطأ في جلب الأسئلة', 'ERROR'); }
  hideLoading();
}
async function generateFullShow(useAI) {
  const total = 30;
  showLoading(useAI ? 'نولّد فصول اللايف AI...' : 'نرتب فصول اللايف...');
  try {
    const qs = useAI ? await fetchAI({ count: total, category: 'اختيارات متنوعة', difficulty: 'متوسط' }) : await fetchBank({ count: total, category: 'اختيارات متنوعة', difficulty: 'متوسط' });
    if (qs.length > 0) {
      const chunk = Math.ceil(qs.length / 3);
      state.fullShowRounds = [0, 1, 2].map((i) => ({ title: i === 2 ? 'الجولة الذهبية' : 'الجولة ' + (i + 1), questions: qs.slice(i * chunk, (i + 1) * chunk) })).filter((r) => r.questions.length > 0);
      state.mode = 'fullshow'; state.currentRoundIndex = 0; state.questions = state.fullShowRounds[0].questions; state.currentIndex = 0;
      state.girlsScore = 0; state.boysScore = 0; state.girlsRounds = 0; state.boysRounds = 0;
      pushHistory(qs); saveQuestionSet(qs, { category: 'مسابقة', difficulty: 'متدرج', source: qs[0] ? qs[0].source : 'local' });
      prepareGame();
    } else showToast('لا توجد أسئلة متاحة حالياً', 'SHOW CONTROL');
  } catch (e) { showToast('خطأ في تجهيز اللايف', 'ERROR'); }
  hideLoading();
}
function prepareGame() { updateScores(); showScreen('gameScreen'); startShowClock(); renderQuestion(); playSound('begin', 0.75); }
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
  state.girlsScore = 0; state.boysScore = 0; state.girlsRounds = 0; state.boysRounds = 0;
  $('savedModal').classList.add('hidden'); prepareGame();
}
function deleteSavedSet(id) { localStorage.setItem(SAVED_KEY, JSON.stringify(getSavedSets().filter((s) => s.id !== id))); renderSavedList(); }
function initSetup() {
  $$('.mode-tab').forEach((t) => t.addEventListener('click', () => { $$('.mode-tab').forEach((x) => x.classList.remove('is-active')); t.classList.add('is-active'); state.mode = t.dataset.mode; $('fullShowOptions').hidden = state.mode !== 'fullshow'; $('categoryField').hidden = state.mode === 'fullshow'; }));
  $$('.stepper-btn').forEach((b) => b.addEventListener('click', () => { const i = $('count'); const c = Number(i.value) || 10; i.value = Math.max(3, Math.min(30, c + (b.dataset.action === 'plus' ? 1 : -1))); }));
  $$('[data-duration]').forEach((b) => b.addEventListener('click', () => { $$('[data-duration]').forEach((x) => x.classList.remove('is-active')); b.classList.add('is-active'); state.fullShowDuration = Number(b.dataset.duration); }));
  $$('[data-timer]').forEach((b) => b.addEventListener('click', () => { $$('[data-timer]').forEach((x) => x.classList.remove('is-active')); b.classList.add('is-active'); state.timerDuration = Number(b.dataset.timer); state.timerValue = state.timerDuration; }));
  $('generateBtn').addEventListener('click', () => state.mode === 'fullshow' ? generateFullShow(true) : generateSingleRound(true));
  $('savedStartBtn').addEventListener('click', () => state.mode === 'fullshow' ? generateFullShow(false) : generateSingleRound(false));
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
  hideLoading(); updateTimer();
}
document.addEventListener('DOMContentLoaded', init);
