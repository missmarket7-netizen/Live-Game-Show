/* ═══════════════════════════════════════════════
   🌎 عالم التحديات — LIVE GAME SHOW ENGINE v4 (معدل)
   ═══════════════════════════════════════════════ */

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
};

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── Saved Questions System ───
const SAVED_KEY = 'wcq_saved_questions';
const MAX_SAVED = 20; // حد أقصى 20 مجموعة

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
  state.totalQuestions = entry.questions.length;
  state.answeredQuestions = 0;
  updateScoreBoxes();
  showScreen('gameScreen');
  renderQuestion();
  playSound('start', 0.5);
  closeSavedModal();
}

function renderSavedList() {
  const list = $('savedList');
  const saved = getSavedQuestions();
  if (saved.length === 0) {
    list.innerHTML = '<div class="saved-empty">📭 لا توجد أسئلة محفوظة</div>';
    return;
  }
  list.innerHTML = saved.map(s => {
    const dateStr = s.date || 'غير معروف';
    const cat = s.category || 'غير محدد';
    const diff = s.difficulty || 'غير محدد';
    const count = s.count || (s.questions ? s.questions.length : 0);
    return `
    <div class="saved-item" data-id="${s.id}">
      <div class="saved-item-title">${cat} — ${diff} (${count} سؤال)</div>
      <div class="saved-item-meta">🕐 ${dateStr}</div>
      <div class="saved-item-actions">
        <button class="saved-item-btn saved-item-use" onclick="window.useSavedSet(${s.id})">▶️ استخدام</button>
        <button class="saved-item-btn saved-item-delete" onclick="window.deleteSavedSet(${s.id})">🗑️ حذف</button>
      </div>
    </div>
  `}).join('');
}

function openSavedModal() {
  renderSavedList();
  $('savedModal').classList.remove('hidden');
}

function closeSavedModal() {
  $('savedModal').classList.add('hidden');
}

window.useSavedSet = useSavedSet;
window.deleteSavedSet = deleteSavedSet;

// ─── Audio System ───
const soundFiles = {
  tick: '/sounds/tick.mp3', correct: '/sounds/correct.mp3', wrong: '/sounds/wrong.mp3',
  timerEnd: '/sounds/tick.mp3', win: '/sounds/victory.mp3', celebration: '/sounds/celebration.mp3',
  laugh: '/sounds/laugh.mp3', cheer: '/sounds/cheer.mp3', suspense: '/sounds/suspense.mp3',
  start: '/sounds/start.mp3', roundComplete: '/sounds/round-complete.mp3',
};
const audioCache = {};
function preloadSounds() { Object.entries(soundFiles).forEach(([key, src]) => { const audio = new Audio(src); audio.preload = 'auto'; audioCache[key] = audio; }); }
function playSound(key, volume = 0.5) { if (!state.soundEnabled) return; try { const audio = audioCache[key]; if (audio) { audio.currentTime = 0; audio.volume = volume; audio.play().catch(() => {}); } } catch (e) {} }

// ─── Screen Navigation ───
function showScreen(id) { $$('.screen').forEach(s => s.classList.add('hidden')); $(id).classList.remove('hidden'); }
function showLoading(text) { $('loadingText').textContent = text; $('loadingOverlay').classList.remove('hidden'); }
function hideLoading() { $('loadingOverlay').classList.add('hidden'); }

// ─── Confetti ───
function fireConfetti() {
  const canvas = $('confettiCanvas'); const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const colors = ['#ff4d8d', '#4d8dff', '#ffd700', '#2ed573', '#ffa502', '#9d82ff'];
  const particles = [];
  for (let i = 0; i < 120; i++) particles.push({ x: Math.random() * canvas.width, y: -20 - Math.random() * 100, w: 5 + Math.random() * 7, h: 3 + Math.random() * 5, color: colors[Math.floor(Math.random() * colors.length)], speedY: 2 + Math.random() * 4, speedX: (Math.random() - 0.5) * 3, rotation: Math.random() * 360, rotSpeed: (Math.random() - 0.5) * 8, opacity: 1 });
  let frame = 0;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); let active = false;
    particles.forEach(p => { if (p.opacity <= 0) return; active = true; p.y += p.speedY; p.x += p.speedX; p.rotation += p.rotSpeed; p.opacity -= 0.003; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.rotation * Math.PI) / 180); ctx.globalAlpha = Math.max(0, p.opacity); ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); });
    frame++; if (active && frame < 300) requestAnimationFrame(animate); else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  animate();
}

// ─── Timer ───
function updateTimerDisplay() { const display = $('timerDisplay'); display.textContent = state.timerValue; if (state.timerValue <= 3) display.classList.add('urgent'); else display.classList.remove('urgent'); }
function startTimer() {
  if (state.isTimerRunning) return; state.isTimerRunning = true; $('startTimerBtn').disabled = true;
  state.timerValue = state.timerDuration; updateTimerDisplay(); playSound('tick', 0.3);
  state.timerInterval = setInterval(() => {
    state.timerValue--; updateTimerDisplay();
    if (state.timerValue > 0 && state.timerValue <= 3) playSound('tick', 0.3);
    if (state.timerValue <= 0) { clearInterval(state.timerInterval); state.isTimerRunning = false; $('startTimerBtn').disabled = false; playSound('timerEnd', 0.4); }
  }, 1000);
}
function stopTimer() { clearInterval(state.timerInterval); state.isTimerRunning = false; $('startTimerBtn').disabled = false; }

// ─── Score Boxes & Negative Counters ───
function updateScoreBoxes() {
  const girlsBoxes = $$('#girlsScoreBoxes .score-box');
  const boysBoxes = $$('#boysScoreBoxes .score-box');
  girlsBoxes.forEach((box, i) => { box.classList.toggle('filled-girls', i < state.girlsScore); box.textContent = i < state.girlsScore ? (i + 1) : ''; });
  boysBoxes.forEach((box, i) => { box.classList.toggle('filled-boys', i < state.boysScore); box.textContent = i < state.boysScore ? (i + 1) : ''; });
  $('girlsRoundsWon').textContent = `🏆 ${state.girlsRounds}`;
  $('boysRoundsWon').textContent = `🏆 ${state.boysRounds}`;
  $('negGirlsValue').textContent = state.negGirls;
  $('negBoysValue').textContent = state.negBoys;
}

function addPoint(team) {
  let points = 1;
  if (state.activeGift === 'star') points = 2;
  if (team === 'girls') { state.girlsScore = Math.min(state.girlsScore + points, 5); playSound('cheer', 0.5); }
  else { state.boysScore = Math.min(state.boysScore + points, 5); playSound('cheer', 0.5); }
  updateScoreBoxes(); state.activeGift = null;
}

function minusPoint(team) { // أزرار -1 للمقدم
  if (team === 'girls') { if (state.girlsScore > 0) { state.girlsScore--; playSound('click', 0.3); } }
  else { if (state.boysScore > 0) { state.boysScore--; playSound('click', 0.3); } }
  updateScoreBoxes();
}

function updateNegative(team, action) {
  if (team === 'girls') {
    if (action === 'minus') state.negGirls = Math.max(-5, state.negGirls - 1);
    if (action === 'plus') state.negGirls = Math.min(0, state.negGirls + 1);
  } else {
    if (action === 'minus') state.negBoys = Math.max(-5, state.negBoys - 1);
    if (action === 'plus') state.negBoys = Math.min(0, state.negBoys + 1);
  }
  updateScoreBoxes();
}

// ─── Gift System ───
function initGifts() {
  $$('.gift-item').forEach(item => {
    item.addEventListener('click', () => {
      const gift = item.dataset.gift; state.activeGift = gift; playSound('suspense', 0.3);
      $$('.gift-item').forEach(g => g.style.borderColor = 'transparent');
      item.style.borderColor = 'var(--gold)';
      setTimeout(() => {
        if (gift === 'bomb') eliminateWrongAnswer();
        else if (gift === 'time') { state.timerDuration += 10; state.timerValue = state.timerDuration; updateTimerDisplay(); }
        // يمكن إضافة منطق الهدايا الجديدة هنا حسب رغبتك (كأس، قلب، وغيرها)
      }, 300);
    });
  });
}

function eliminateWrongAnswer() {
  const q = state.questions[state.currentIndex]; if (!q) return;
  const buttons = $$('.option-btn'); let eliminated = 0;
  buttons.forEach((btn, i) => { if (i !== q.correctIndex && eliminated < 2) { btn.style.opacity = '0.3'; btn.disabled = true; eliminated++; } });
}

// ─── Question Rendering ───
function renderQuestion() {
  const q = state.questions[state.currentIndex]; if (!q) return;
  state.isRevealed = false; stopTimer();
  $('timerDisplay').classList.remove('urgent'); state.timerValue = state.timerDuration; updateTimerDisplay();
  const roundNum = state.mode === 'fullshow' ? state.currentRoundIndex + 1 : 1;
  $('roundDisplay').textContent = `الجولة ${roundNum}`;
  $('questionCounter').textContent = `السؤال ${state.currentIndex + 1} / ${state.questions.length}`;
  $('categoryBadge').textContent = `${getCategoryEmoji(q.category)} ${q.category}`;
  const qText = $('questionText'); qText.style.opacity = '0'; qText.textContent = q.question;
  setTimeout(() => { qText.style.transition = 'all 0.4s ease'; qText.style.opacity = '1'; }, 50);
  const grid = $('optionsGrid'); grid.innerHTML = '';
  const options = q.options || [];
  options.forEach((opt, i) => {
    const btn = document.createElement('button'); btn.className = 'option-btn'; btn.dataset.letter = String.fromCharCode(65 + i); btn.textContent = opt; btn.onclick = () => selectOption(i); grid.appendChild(btn);
  });
  $('answerReveal').classList.add('hidden'); $('revealBtn').disabled = false; $('nextBtn').disabled = false;
  $$('.gift-item').forEach(g => g.style.borderColor = 'transparent');
  $$('.option-btn').forEach(b => { b.style.opacity = '1'; b.disabled = false; });
  playSound('suspense', 0.3);
}

function getCategoryEmoji(cat) { const map = { 'معلومات عامة': '🧠', 'جغرافيا': '🌍', 'علوم': '🔬', 'تاريخ': '📜', 'أسئلة دينية': '🕌', 'ألغاز': '🧩', 'أماكن سياحية': '✈️', 'أفلام': '🎬', 'رياضة': '⚽', 'تكنولوجيا': '💻', 'اختيارات متنوعة': '🎲' }; return map[cat] || '🎯'; }

function selectOption(index) {
  if (state.isRevealed) return;
  const q = state.questions[state.currentIndex];
  const buttons = $$('.option-btn');
  buttons.forEach((btn, i) => { btn.classList.remove('selected', 'correct', 'wrong'); if (i === index) btn.classList.add('selected'); if (i === q.correctIndex) btn.classList.add('correct'); if (i === index && i !== q.correctIndex) btn.classList.add('wrong'); });
  if (index === q.correctIndex) { playSound('correct', 0.5); setTimeout(() => playSound('celebration', 0.4), 400); }
  else { playSound('wrong', 0.4); setTimeout(() => playSound('laugh', 0.3), 300); }
  revealAnswer();
}

function revealAnswer() {
  if (state.isRevealed) return; state.isRevealed = true; stopTimer();
  const q = state.questions[state.currentIndex];
  const buttons = $$('.option-btn'); buttons.forEach((btn, i) => { btn.classList.remove('selected'); if (i === q.correctIndex) btn.classList.add('correct'); });
  $('answerReveal').classList.remove('hidden'); $('answerText').textContent = `${String.fromCharCode(65 + q.correctIndex)}. ${q.options[q.correctIndex]}`;
  $('explanationText').textContent = q.explanation || 'لا يوجد شرح إضافي.'; $('revealBtn').disabled = true; state.answeredQuestions++;
}

// ─── Next Question & Round Navigation ───
function nextQuestion() {
  if (state.currentIndex < state.questions.length - 1) { state.currentIndex++; renderQuestion(); }
  else {
    if (state.mode === 'fullshow' && state.currentRoundIndex < state.fullShowRounds.length - 1) {
      recordRoundWinner(); playSound('roundComplete', 0.5); state.currentRoundIndex++;
      state.questions = state.fullShowRounds[state.currentRoundIndex].questions;
      state.currentIndex = 0; state.girlsScore = 0; state.boysScore = 0;
      state.negGirls = 0; state.negBoys = 0; updateScoreBoxes(); renderQuestion();
    } else { recordRoundWinner(); showResults(); }
  }
}

// زر الجولة التالية (يحسب الجولة للفريق المكتمل النقاط)
function nextRoundManually() {
  stopTimer();
  // تحديد الفريق الفائز بالجولة (الأعلى نقاطاً أو من أكمل 5 نقاط)
  let winnerText = '';
  if (state.girlsScore >= state.boysScore) {
    if (state.girlsScore > 0) { state.girlsRounds++; winnerText = '🎉 مبروك للبنات!'; }
  } 
  if (state.boysScore >= state.girlsScore) {
    if (state.boysScore > 0) { state.boysRounds++; winnerText = '🎉 مبروك للشباب!'; }
  }
  if (winnerText === '') winnerText = '🤝 لا توجد نقاط مكتملة!';

  updateScoreBoxes();
  fireConfetti(); playSound('win', 0.6);

  // التحضير للجولة التالية: تصفير النقاط والعدادات والانتقال للسؤال التالي
  state.girlsScore = 0; state.boysScore = 0;
  state.negGirls = 0; state.negBoys = 0;
  updateScoreBoxes();

  if (state.currentIndex < state.questions.length - 1) {
    state.currentIndex++;
    renderQuestion();
  } else {
    // إذا انتهت الأسئلة، ننتقل للجولة التالية في وضع اللايف الكامل أو نعرض النتائج
    if (state.mode === 'fullshow' && state.currentRoundIndex < state.fullShowRounds.length - 1) {
      state.currentRoundIndex++;
      state.questions = state.fullShowRounds[state.currentRoundIndex].questions;
      state.currentIndex = 0; renderQuestion();
    } else { showResults(); }
  }
}


function recordRoundWinner() {
  if (state.girlsScore > state.boysScore) state.girlsRounds++;
  else if (state.boysScore > state.girlsScore) state.boysRounds++;
  updateScoreBoxes();
}

function endRound() {
  stopTimer();
  let winnerText = '';
  if (state.girlsScore > state.boysScore) { winnerText = '🎉 مبروك لفريق البنات!'; state.girlsRounds++; }
  else if (state.boysScore > state.girlsScore) { winnerText = '🎉 مبروك لفريق الشباب!'; state.boysRounds++; }
  else { winnerText = '🤝 تعادل! جولة رائعة من الفريقين!'; }
  updateScoreBoxes();
  $('roundEndNumber').textContent = `الجولة ${state.mode === 'fullshow' ? state.currentRoundIndex + 1 : 1}`;
  $('roundEndWinner').textContent = winnerText;
  $('roundEndGirlsScore').textContent = state.girlsScore;
  $('roundEndBoysScore').textContent = state.boysScore;
  const girlsScoreEl = $('roundEndGirlsScore'); const boysScoreEl = $('roundEndBoysScore');
  girlsScoreEl.style.color = state.girlsScore > state.boysScore ? 'var(--pink)' : (state.girlsScore === state.boysScore ? 'var(--gold)' : 'var(--text-dim)');
  boysScoreEl.style.color = state.boysScore > state.girlsScore ? 'var(--blue)' : (state.girlsScore === state.boysScore ? 'var(--gold)' : 'var(--text-dim)');
  $('roundEndOverlay').classList.remove('hidden');
  if (state.girlsScore !== state.boysScore) { playSound('win', 0.6); fireConfetti(); }
  else { playSound('roundComplete', 0.5); }
}

function continueAfterRound() {
  $('roundEndOverlay').classList.add('hidden');
  state.girlsScore = 0; state.boysScore = 0; state.negGirls = 0; state.negBoys = 0;
  state.currentIndex = 0; updateScoreBoxes();
  if (state.questions && state.questions.length > 0) { state.questions = shuffleArray([...state.questions]); }
  renderQuestion();
}

function shuffleArray(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ─── Results ───
function showResults() {
  showScreen('resultsScreen'); fireConfetti(); playSound('win', 0.6);
  setTimeout(() => playSound('celebration', 0.5), 600); setTimeout(() => playSound('cheer', 0.5), 1200);
  $('finalGirlsScore').textContent = state.girlsRounds; $('finalBoysScore').textContent = state.boysRounds;
  const winnerText = $('winnerText');
  if (state.girlsRounds > state.boysRounds) { winnerText.textContent = '🎉 فريق البنات فاز! 👑'; winnerText.style.color = 'var(--pink)'; }
  else if (state.boysRounds > state.girlsRounds) { winnerText.textContent = '🎉 فريق الشباب فاز! 👑'; winnerText.style.color = 'var(--blue)'; }
  else { winnerText.textContent = '🤝 تعادل! كل الفرق رائعة!'; winnerText.style.color = 'var(--gold)'; }
}

// ─── Full Show Generator ───
function generateFullShowPlan(duration) {
  const categories = ['معلومات عامة', 'جغرافيا', 'علوم', 'تاريخ', 'أسئلة دينية', 'ألغاز', 'رياضة', 'تكنولوجيا'];
  const difficulties = ['سهل', 'متوسط', 'صعب']; const questionsPerMin = 2;
  const totalQuestions = Math.floor(duration / 60 * questionsPerMin); const questionsPerRound = 10;
  const numRounds = Math.ceil(totalQuestions / questionsPerRound); const rounds = [];
  for (let i = 0; i < numRounds; i++) {
    const isGolden = i === numRounds - 1; const cat = isGolden ? 'اختيارات متنوعة' : categories[i % categories.length];
    const diff = isGolden ? 'صعب' : difficulties[i % difficulties.length];
    const count = isGolden ? Math.min(5, totalQuestions - i * questionsPerRound) : Math.min(questionsPerRound, totalQuestions - i * questionsPerRound);
    if (count <= 0) break;
    rounds.push({ title: isGolden ? 'الجولة الذهبية 🔥' : `الجولة ${i + 1}`, category: cat, difficulty: diff, count, emoji: getCategoryEmoji(cat) });
  }
  return rounds;
}

// ─── API ───
async function fetchQuestions(params) {
  const res = await fetch('/api/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
  const data = await res.json(); if (!res.ok) throw new Error(data.error || 'فشل في توليد الأسئلة'); return data.questions;
}

async function generateSingleRound() {
  const category = $('category').value; const difficulty = $('difficulty').value; const count = Number($('count').value) || 10;
  showLoading('جاري تجهيز الأسئلة...');
  try {
    const questions = await fetchQuestions({ category, difficulty, count, avoid: state.history.slice(-200) });
    if (!Array.isArray(questions) || questions.length === 0) throw new Error('لم يتم توليد أي أسئلة');
    state.questions = questions; state.currentIndex = 0; state.girlsScore = 0; state.boysScore = 0;
    state.girlsRounds = 0; state.boysRounds = 0; state.totalQuestions = questions.length; state.answeredQuestions = 0;
    state.mode = 'single'; state.history = [...state.history, ...questions.map(q => q.question)].slice(-500);
    localStorage.setItem('wcq_history', JSON.stringify(state.history));
    saveQuestionSet({ id: Date.now(), date: new Date().toLocaleString('ar-SA'), category, difficulty, count, questions });
    updateScoreBoxes(); showScreen('gameScreen'); renderQuestion(); playSound('start', 0.5);
  } catch (e) { alert(e.message); } finally { hideLoading(); }
}

async function generateFullShow() {
  const duration = state.fullShowDuration || 120; const plan = generateFullShowPlan(duration);
  state.fullShowRounds = []; state.currentRoundIndex = 0; showLoading('جاري تجهيز اللايف الكامل...');
  try {
    for (let i = 0; i < plan.length; i++) {
      $('loadingText').textContent = `جاري تجهيز الجولة ${i + 1} من ${plan.length}...`;
      const questions = await fetchQuestions({ category: plan[i].category, difficulty: plan[i].difficulty, count: plan[i].count, avoid: state.history.slice(-200) });
      state.fullShowRounds.push({ ...plan[i], questions });
      state.history = [...state.history, ...questions.map(q => q.question)].slice(-500);
    }
    localStorage.setItem('wcq_history', JSON.stringify(state.history));
    state.questions = state.fullShowRounds[0].questions; state.currentIndex = 0;
    state.girlsScore = 0; state.boysScore = 0; state.girlsRounds = 0; state.boysRounds = 0;
    state.totalQuestions = state.fullShowRounds.reduce((sum, r) => sum + r.questions.length, 0); state.answeredQuestions = 0; state.mode = 'fullshow';
    updateScoreBoxes(); showScreen('gameScreen'); renderQuestion(); playSound('start', 0.5);
  } catch (e) { alert(e.message); } finally { hideLoading(); }
}

// ─── Setup UI ───
function initSetupUI() {
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => { $$('.tab').forEach(t => t.classList.remove('active')); tab.classList.add('active'); state.mode = tab.dataset.mode; $('fullShowOptions').style.display = state.mode === 'fullshow' ? 'block' : 'none'; $('categoryGroup').style.display = state.mode === 'fullshow' ? 'none' : 'block'; });
  });
  $$('.num-btn').forEach(btn => {
    btn.addEventListener('click', () => { const input = $('count'); let val = Number(input.value) || 10; if (btn.dataset.action === 'minus') val = Math.max(1, val - 1); else val = Math.min(50, val + 1); input.value = val; });
  });
  $$('[data-duration]').forEach(chip => {
    chip.addEventListener('click', () => { $$('[data-duration]').forEach(c => c.classList.remove('active')); chip.classList.add('active'); state.fullShowDuration = Number(chip.dataset.duration); });
  });
  $$('[data-timer]').forEach(chip => {
    chip.addEventListener('click', () => { $$('[data-timer]').forEach(c => c.classList.remove('active')); chip.classList.add('active'); state.timerDuration = Number(chip.dataset.timer); });
  });
  $('generateBtn').addEventListener('click', async () => { if (state.mode === 'fullshow') await generateFullShow(); else await generateSingleRound(); });
  $('savedQuestionsBtn').addEventListener('click', openSavedModal);
  $('closeSavedBtn').addEventListener('click', closeSavedModal);
  $('savedModal').addEventListener('click', (e) => { if (e.target === $('savedModal') || e.target.classList.contains('saved-modal-backdrop')) { closeSavedModal(); } });
}

// ─── Game UI ───
function initGameUI() {
  $('startTimerBtn').addEventListener('click', startTimer);
  $('revealBtn').addEventListener('click', revealAnswer);
  $('nextBtn').addEventListener('click', nextQuestion);
  
  // أزرار الجولات والنقاط
  $('girlsPlusBtn').addEventListener('click', () => addPoint('girls'));
  $('girlsMinusBtn').addEventListener('click', () => minusPoint('girls'));
  $('boysPlusBtn').addEventListener('click', () => addPoint('boys'));
  $('boysMinusBtn').addEventListener('click', () => minusPoint('boys'));
  
  // أزرار العدادات السالبة (-5 إلى 0)
  $$('.neg-btn').forEach(btn => {
    btn.addEventListener('click', () => updateNegative(btn.dataset.team, btn.dataset.action));
  });

  // زر الجولة التالية
  $('nextRoundBtn').addEventListener('click', nextRoundManually);

  $('endRoundBtn').addEventListener('click', endRound);
  $('newRoundBtn').addEventListener('click', () => location.reload());
  $('roundEndContinueBtn').addEventListener('click', continueAfterRound);
}

function initResultsUI() { $('replayBtn').addEventListener('click', () => { location.reload(); }); }

// ─── Init ───
function init() {
  preloadSounds(); initSetupUI(); initGameUI(); initResultsUI(); initGifts();
  const soundPref = localStorage.getItem('wcq_sound') === 'true'; state.soundEnabled = soundPref;
  $('soundToggle').textContent = soundPref ? '🔊' : '🔇';
  $('soundToggle').addEventListener('click', () => { state.soundEnabled = !state.soundEnabled; localStorage.setItem('wcq_sound', state.soundEnabled); $('soundToggle').textContent = state.soundEnabled ? '🔊' : '🔇'; if (state.soundEnabled) playSound('click', 0.4); });
  hideLoading();
}
document.addEventListener('DOMContentLoaded', init);
