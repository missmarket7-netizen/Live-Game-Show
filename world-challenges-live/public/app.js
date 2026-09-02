const state = {
  mode: 'single', questions: [], fullShowRounds: [], currentRoundIndex: 0, currentIndex: 0,
  girlsScore: 0, boysScore: 0, girlsRounds: 0, boysRounds: 0,
  timerDuration: 30, timerValue: 30, timerInterval: null, isTimerRunning: false, isRevealed: false,
  soundEnabled: false, activeGift: null, questionHistory: [], showStartedAt: 0, showClockInterval: null,
  fullShowDuration: 120, shieldTeam: null,
  captains: { girls: ['', '', ''], boys: ['', '', ''] },
  audioQueue: [], isPlayingAudio: false, lastGiftClick: 0, questionAnalytics: {}
};
const SAVED_KEY = 'lgs_saved_sets_v7';
const HISTORY_KEY = 'lgs_question_history_v7';
const SOUND_KEY = 'lgs_sound_v7';
const ANALYTICS_KEY = 'lgs_analytics_v7';
const $ = (id) => document.getElementById(id);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
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
const audioCache = {};
const categoryEmoji = {
  'معلومات عامة': '🧠', 'جغرافيا': '🌍', 'علوم': '🔬', 'تاريخ': '📜',
  'دين': '🕌', 'أسئلة دينية': '🕌', 'لغز': '🧩', 'ألغاز': '🧩',
  'رياضة': '⚽', 'تكنولوجيا': '⌘', 'اختيارات متنوعة': '◈'
};
const fallbackQuestions = [
  { category: 'معلومات عامة', difficulty: 'سهل', question: 'ما هي عاصمة المملكة العربية السعودية؟', options: ['جدة', 'الرياض', 'مكة', 'الدمام'], correctIndex: 1, explanation: 'الرياض هي العاصمة السياسية والإدارية للمملكة.' },
  { category: 'معلومات عامة', difficulty: 'متوسط', question: 'كم عدد ألوان قوس قزح التقليدية؟', options: ['خمسة', 'ستة', 'سبعة', 'ثمانية'], correctIndex: 2, explanation: 'الألوان السبعة هي: الأحمر والبرتقالي والأصفر والأخضر والأزرق والنيلي والبنفسجي.' },
  { category: 'جغرافيا', difficulty: 'سهل', question: 'ما أكبر قارة في العالم من حيث المساحة؟', options: ['أفريقيا', 'آسيا', 'أوروبا', 'أمريكا الشمالية'], correctIndex: 1, explanation: 'آسيا هي أكبر قارات العالم مساحةً وسكاناً.' },
  { category: 'جغرافيا', difficulty: 'متوسط', question: 'ما النهر الذي يمر بمدينة بغداد؟', options: ['النيل', 'الفرات', 'دجلة', 'الأردن'], correctIndex: 2, explanation: 'تقع بغداد على ضفاف نهر دجلة في العراق.' },
  { category: 'علوم', difficulty: 'سهل', question: 'ما أقرب كوكب إلى الشمس؟', options: ['الأرض', 'الزهرة', 'عطارد', 'المريخ'], correctIndex: 2, explanation: 'عطارد هو أقرب كواكب المجموعة الشمسية إلى الشمس.' },
  { category: 'علوم', difficulty: 'متوسط', question: 'ما الرمز الكيميائي للذهب؟', options: ['Ag', 'Au', 'Fe', 'Cu'], correctIndex: 1, explanation: 'Au مأخوذ من الاسم اللاتيني للذهب Aurum.' },
  { category: 'تاريخ', difficulty: 'سهل', question: 'في أي عام تأسست المملكة العربية السعودية بصورتها الحديثة؟', options: ['1925', '1930', '1932', '1940'], correctIndex: 2, explanation: 'أعلن الملك عبدالعزيز توحيد المملكة عام 1932.' },
  { category: 'تاريخ', difficulty: 'متوسط', question: 'من بنى مدينة البتراء التاريخية؟', options: ['الأنباط', 'الفراعنة', 'الرومان', 'الآشوريون'], correctIndex: 0, explanation: 'ازدهرت البتراء عاصمةً للأنباط في جنوب الأردن.' },
  { category: 'دين', difficulty: 'سهل', question: 'كم عدد ركعات صلاة الفجر المفروضة؟', options: ['ركعة واحدة', 'ركعتان', 'ثلاث ركعات', 'أربع ركعات'], correctIndex: 1, explanation: 'صلاة الفجر المفروضة ركعتان.' },
  { category: 'دين', difficulty: 'متوسط', question: 'في أي شهر نزل القرآن الكريم؟', options: ['شعبان', 'رمضان', 'شوال', 'رجب'], correctIndex: 1, explanation: 'نزل القرآن الكريم في شهر رمضان المبارك.' },
  { category: 'لغز', difficulty: 'سهل', question: 'ما الشيء الذي كلما أخذت منه كبر؟', options: ['البحر', 'الحفرة', 'الكتاب', 'الظل'], correctIndex: 1, explanation: 'الحفرة تكبر كلما أخذت من ترابها.' },
  { category: 'لغز', difficulty: 'متوسط', question: 'له أسنان ولا يعض، ما هو؟', options: ['المشط', 'المفتاح', 'المنشار', 'القفل'], correctIndex: 0, explanation: 'المشط له أسنان لكنه لا يعض.' },
  { category: 'رياضة', difficulty: 'سهل', question: 'كم لاعباً من كل فريق يوجد داخل ملعب كرة القدم؟', options: ['9', '10', '11', '12'], correctIndex: 2, explanation: 'يتكون الفريق داخل الملعب من 11 لاعباً.' },
  { category: 'رياضة', difficulty: 'متوسط', question: 'في أي دولة أقيمت أول بطولة لكأس العالم لكرة القدم؟', options: ['البرازيل', 'إيطاليا', 'الأوروغواي', 'فرنسا'], correctIndex: 2, explanation: 'أقيمت أول بطولة عام 1930 في الأوروغواي.' },
  { category: 'تكنولوجيا', difficulty: 'سهل', question: 'ما الشركة التي أسسها بيل غيتس وبول ألين؟', options: ['Apple', 'Google', 'Microsoft', 'IBM'], correctIndex: 2, explanation: 'أسس بيل غيتس وبول ألين شركة Microsoft.' },
  { category: 'تكنولوجيا', difficulty: 'متوسط', question: 'ماذا تعني الأحرف HTML؟', options: ['Hyper Text Markup Language', 'High Tech Modern Language', 'Home Tool Markup Language', 'Hyperlink Text Mode Language'], correctIndex: 0, explanation: 'هي لغة ترميز النص التشعبي المستخدمة لبناء صفحات الويب.' },
  { category: 'اختيارات متنوعة', difficulty: 'سهل', question: 'ما الحيوان المعروف بلقب سفينة الصحراء؟', options: ['الحصان', 'الجمل', 'الفيل', 'الغزال'], correctIndex: 1, explanation: 'يستطيع الجمل تحمل العطش والسير لمسافات طويلة في الصحراء.' },
  { category: 'اختيارات متنوعة', difficulty: 'متوسط', question: 'ما الآلة الموسيقية التي تحتوي عادةً على 88 مفتاحاً؟', options: ['الكمان', 'البيانو', 'العود', 'الناي'], correctIndex: 1, explanation: 'البيانو القياسي يحتوي غالباً على 88 مفتاحاً.' },
  { category: 'معلومات عامة', difficulty: 'صعب', question: 'ما اسم أصغر عظمة في جسم الإنسان؟', options: ['المطرقة', 'الركاب', 'الزند', 'الشظية'], correctIndex: 1, explanation: 'عظمة الركاب توجد في الأذن الوسطى وتعد الأصغر في جسم الإنسان.' },
  { category: 'جغرافيا', difficulty: 'صعب', question: 'ما أعمق نقطة معروفة في المحيطات؟', options: ['خندق ماريانا', 'خندق بورتوريكو', 'خندق تونغا', 'خندق الفلبين'], correctIndex: 0, explanation: 'يقع خندق ماريانا في المحيط الهادئ ويضم أعمق نقطة معروفة.' },
  { category: 'علوم', difficulty: 'صعب', question: 'ما الغاز الأكثر وفرة في الغلاف الجوي للأرض؟', options: ['الأكسجين', 'الهيدروجين', 'النيتروجين', 'ثاني أكسيد الكربون'], correctIndex: 2, explanation: 'يشكل النيتروجين قرابة 78% من الغلاف الجوي.' },
  { category: 'تاريخ', difficulty: 'صعب', question: 'ما الحضارة التي ابتكرت الكتابة المسمارية؟', options: ['المصرية', 'السومرية', 'الفينيقية', 'الإغريقية'], correctIndex: 1, explanation: 'طوّر السومريون الكتابة المسمارية في بلاد الرافدين.' },
  { category: 'رياضة', difficulty: 'صعب', question: 'كم عدد الحلقات في شعار الألعاب الأولمبية؟', options: ['أربع', 'خمس', 'ست', 'سبع'], correctIndex: 1, explanation: 'يتكون الشعار الأولمبي من خمس حلقات متشابكة.' },
  { category: 'تكنولوجيا', difficulty: 'صعب', question: 'أي بروتوكول يستخدم عادةً لتصفح الويب الآمن؟', options: ['FTP', 'HTTP', 'HTTPS', 'SMTP'], correctIndex: 2, explanation: 'HTTPS يضيف طبقة تشفير لحماية الاتصال بالويب.' },
  { category: 'اختيارات متنوعة', difficulty: 'صعب', question: 'ما اسم الظاهرة التي يتغير فيها تردد الموجة بسبب حركة المصدر؟', options: ['تأثير دوبلر', 'الانعكاس الكلي', 'التوصيل', 'الحيود'], correctIndex: 0, explanation: 'تأثير دوبلر يفسر تغير التردد الظاهري مع الحركة النسبية.' }
];

function getAudio(key) {
  if (audioCache[key]) return audioCache[key];
  const candidates = soundFiles[key] || [key];
  const audio = new Audio('/sounds/' + candidates[0] + '.mp3');
  audio.preload = 'none';
  let candidateIndex = 0;
  audio.addEventListener('error', function() {
    candidateIndex += 1;
    if (candidateIndex < candidates.length) {
      audio.src = '/sounds/' + candidates[candidateIndex] + '.mp3';
    }
  });
  audioCache[key] = audio;
  return audio;
}

function enqueueSound(key, volume) {
  if (typeof volume === 'undefined') volume = 0.55;
  if (!state.soundEnabled) return;
  state.audioQueue.push({ key: key, volume: volume });
  processAudioQueue();
}

function processAudioQueue() {
  if (state.isPlayingAudio || state.audioQueue.length === 0) return;
  state.isPlayingAudio = true;
  var item = state.audioQueue.shift();
  var audio = getAudio(item.key);
  try {
    audio.volume = item.volume;
    audio.onended = function() {
      state.isPlayingAudio = false;
      setTimeout(processAudioQueue, 150);
    };
    audio.onerror = function() {
      state.isPlayingAudio = false;
      processAudioQueue();
    };
    audio.play().catch(function() {
      state.isPlayingAudio = false;
      processAudioQueue();
    });
  } catch (e) {
    state.isPlayingAudio = false;
    processAudioQueue();
  }
}

function clearAudioQueue() {
  state.audioQueue = [];
  state.isPlayingAudio = false;
}

function scheduleBeginSound() {
  setTimeout(function() {
    var setupScreen = $('setupScreen');
    if (setupScreen && !setupScreen.classList.contains('hidden')) {
      enqueueSound('begin', 0.8);
    }
  }, 5000);
}

function getSavedSets() { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch (e) { return []; } }
function getHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; } }
function getAnalytics() { try { return JSON.parse(localStorage.getItem(ANALYTICS_KEY) || '{}'); } catch (e) { return {}; } }
function saveHistory() { localStorage.setItem(HISTORY_KEY, JSON.stringify(state.questionHistory.slice(-200))); }
function saveAnalytics() { localStorage.setItem(ANALYTICS_KEY, JSON.stringify(state.questionAnalytics)); }

function trackQuestion(question, wasCorrect) {
  var key = question.question.slice(0, 50);
  if (!state.questionAnalytics[key]) {
    state.questionAnalytics[key] = { q: question.question, attempts: 0, correct: 0, category: question.category };
  }
  state.questionAnalytics[key].attempts++;
  if (wasCorrect) state.questionAnalytics[key].correct++;
  saveAnalytics();
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\u0621-\u064Aa-z0-9]/g, '')
    .trim();
}

function isSimilarQuestion(newQ, historyList) {
  var normalized = normalizeText(newQ);
  if (normalized.length < 10) return false;
  for (var i = 0; i < historyList.length; i++) {
    var oldNormalized = normalizeText(historyList[i]);
    if (oldNormalized === normalized) return true;
    if (normalized.length > 20 && oldNormalized.length > 20) {
      var shorter = normalized.length < oldNormalized.length ? normalized : oldNormalized;
      var longer = normalized.length >= oldNormalized.length ? normalized : oldNormalized;
      if (longer.indexOf(shorter.slice(0, 15)) !== -1) return true;
    }
  }
  return false;
}

function saveQuestionSet(questions, meta) {
  if (!meta) meta = {};
  var sets = getSavedSets();
  sets.unshift({
    id: Date.now(), date: new Date().toLocaleString('ar-SA'), questions: questions,
    category: meta.category || 'اختيارات متنوعة', difficulty: meta.difficulty || 'متوسط',
    count: questions.length, source: meta.source || 'local'
  });
  localStorage.setItem(SAVED_KEY, JSON.stringify(sets.slice(0, 20)));
  updateSavedCount();
}

function updateSavedCount() { var el = $('savedCount'); if (el) el.textContent = getSavedSets().length; }

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, function(char) {
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
    return map[char];
  });
}

function shuffle(list) {
  var items = list.slice();
  for (var i = items.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = items[i]; items[i] = items[j]; items[j] = temp;
  }
  return items;
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  localStorage.setItem(SOUND_KEY, String(state.soundEnabled));
  updateSoundButtons();
  if (state.soundEnabled) enqueueSound('tick', 0.3);
}

function updateSoundButtons() {
  var glyph = state.soundEnabled ? '◉' : '○';
  var ids = ['setupSoundBtn', 'soundToggle'];
  for (var i = 0; i < ids.length; i++) {
    var el = $(ids[i]);
    if (el) {
      el.textContent = glyph;
      if (state.soundEnabled) el.classList.add('sound-on');
      else el.classList.remove('sound-on');
    }
  }
}

function showScreen(id) {
  var screens = $$('.screen');
  for (var i = 0; i < screens.length; i++) {
    if (screens[i].id === id) screens[i].classList.remove('hidden');
    else screens[i].classList.add('hidden');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showLoading(message) { $('loadingText').textContent = message; $('loadingOverlay').classList.remove('hidden'); }
function hideLoading() { $('loadingOverlay').classList.add('hidden'); }

function showToast(text, kicker) {
  if (!kicker) kicker = 'SHOW CONTROL';
  $('captainToastKicker').textContent = kicker;
  $('captainToastText').textContent = text;
  $('captainToast').classList.remove('hidden');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(function() { $('captainToast').classList.add('hidden'); }, 3100);
}

function formatClock() {
  var seconds = Math.floor((Date.now() - state.showStartedAt) / 1000);
  var m = String(Math.floor(seconds / 60)).padStart(2, '0');
  var s = String(seconds % 60).padStart(2, '0');
  return m + ':' + s;
}

function startShowClock() {
  state.showStartedAt = Date.now();
  clearInterval(state.showClockInterval);
  state.showClockInterval = setInterval(function() {
    if ($('showClock')) $('showClock').textContent = formatClock();
  }, 1000);
}

function updateScores() {
  $('girlsScoreValue').textContent = state.girlsScore;
  $('boysScoreValue').textContent = state.boysScore;
  $('girlsProgress').style.width = Math.min(100, Math.max(0, state.girlsScore) * 20) + '%';
  $('boysProgress').style.width = Math.min(100, Math.max(0, state.boysScore) * 20) + '%';
  $('girlsRoundsWon').textContent = state.girlsRounds + ' جولات';
  $('boysRoundsWon').textContent = state.boysRounds + ' جولات';
  $('roundResults').textContent = state.girlsRounds + ' - ' + state.boysRounds;
  var roundNumber = state.mode === 'fullshow' ? (state.currentRoundIndex + 1) : (state.girlsRounds + state.boysRounds + 1);
  if ($('roundDisplay')) $('roundDisplay').textContent = 'الجولة ' + roundNumber;
  $('teamShieldGirls').classList.toggle('hidden', state.shieldTeam !== 'girls');
  $('teamShieldBoys').classList.toggle('hidden', state.shieldTeam !== 'boys');
}

function updateTimer() {
  $('timerDisplay').textContent = state.timerValue;
  $('timerRing').classList.toggle('urgent', state.timerValue <= 3 && state.timerValue > 0);
}

function stopTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  state.isTimerRunning = false;
  $('startTimerBtn').disabled = false;
}

function startTimer() {
  if (state.isTimerRunning || state.isRevealed) return;
  state.isTimerRunning = true;
  $('startTimerBtn').disabled = true;
  state.timerValue = state.timerDuration;
  updateTimer();
  enqueueSound('tick', 0.25);
  state.timerInterval = setInterval(function() {
    state.timerValue -= 1;
    updateTimer();
    if (state.timerValue > 0 && state.timerValue <= 3) enqueueSound('tick', 0.24);
    if (state.timerValue <= 0) {
      stopTimer();
      enqueueSound('wrong', 0.35);
      showToast('انتهى الوقت — اكشف الإجابة!', 'TIME UP');
    }
  }, 1000);
}

function renderQuestion() {
  var question = state.questions[state.currentIndex];
  if (!question) return;
  stopTimer();
  state.isRevealed = false;
  state.timerValue = state.timerDuration;
  updateTimer();
  updateScores();
  $('roundProgress').textContent = String(state.currentIndex + 1).padStart(2, '0') + ' / ' + String(state.questions.length).padStart(2, '0');
  $('questionCounter').textContent = 'السؤال ' + String(state.currentIndex + 1).padStart(2, '0') + ' / ' + String(state.questions.length).padStart(2, '0');
  $('questionNumber').textContent = String(state.currentIndex + 1).padStart(2, '0');
  var emoji = categoryEmoji[question.category] || '◈';
  $('categoryBadge').textContent = emoji + ' ' + (question.category || 'اختيارات متنوعة');
  $('questionText').textContent = question.question;
  $('answerText').textContent = '—';
  $('explanationText').textContent = '—';
  $('answerReveal').classList.add('hidden');
  $('revealBtn').disabled = false;
  $('nextBtn').disabled = false;
  $('sourceBadge').textContent = question.source === 'ai' ? 'AI BANK READY' : 'LOCAL BANK READY';
  $('questionSource').textContent = question.source === 'ai' ? 'AUTO-SAVED / AI' : 'AUTO-SAVED';
  var grid = $('optionsGrid');
  grid.innerHTML = '';
  var options = (question.options || []).slice(0, 4);
  for (var i = 0; i < options.length; i++) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'option-btn';
    button.dataset.letter = String.fromCharCode(65 + i);
    button.textContent = options[i];
    (function(idx) {
      button.addEventListener('click', function() { selectAnswer(idx); });
    })(i);
    grid.appendChild(button);
  }
  var giftButtons = $$('.gift-button');
  for (var g = 0; g < giftButtons.length; g++) giftButtons[g].classList.remove('is-active');
  $('activeGiftBanner').classList.add('hidden');
}

function revealAnswer() {
  if (state.isRevealed) return;
  var question = state.questions[state.currentIndex];
  if (!question) return;
  state.isRevealed = true;
  stopTimer();
  var buttons = $$('.option-btn');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.remove('selected');
    if (i === question.correctIndex) buttons[i].classList.add('correct');
  }
  $('answerText').textContent = String.fromCharCode(65 + question.correctIndex) + '. ' + question.options[question.correctIndex];
  $('explanationText').textContent = question.explanation || 'معلومة إضافية للمقدم غير متاحة.';
  $('answerReveal').classList.remove('hidden');
  $('revealBtn').disabled = true;
}

function selectAnswer(index) {
  if (state.isRevealed) return;
  var question = state.questions[state.currentIndex];
  var buttons = $$('.option-btn');
  var isCorrect = index === question.correctIndex;
  for (var i = 0; i < buttons.length; i++) {
    if (i === index) {
      buttons[i].classList.add('selected');
      if (!isCorrect) buttons[i].classList.add('wrong');
    } else {
      buttons[i].classList.remove('selected');
    }
  }
  enqueueSound(isCorrect ? 'correct' : 'wrong', 0.5);
  trackQuestion(question, isCorrect);
  revealAnswer();
}

function closeGiftBanner() {
  state.activeGift = null;
  $('activeGiftBanner').classList.add('hidden');
  var giftButtons = $$('.gift-button');
  for (var i = 0; i < giftButtons.length; i++) giftButtons[i].classList.remove('is-active');
}

function selectGift(gift) {
  var now = Date.now();
  if (now - state.lastGiftClick < 800) return;
  state.lastGiftClick = now;
  state.activeGift = gift;
  var giftButtons = $$('.gift-button');
  for (var i = 0; i < giftButtons.length; i++) {
    if (giftButtons[i].dataset.gift === gift) giftButtons[i].classList.add('is-active');
    else giftButtons[i].classList.remove('is-active');
  }
  if (gift === 'galaxy' || gift === 'wheel' || gift === 'heart') {
    $('activeGiftText').textContent = gift === 'heart' ? 'اختر الفريق لتفعيل درع الحماية' : 'اختر الفريق لتفعيل الدمار الشامل';
    $('activeGiftBanner').classList.remove('hidden');
    enqueueSound('tick', 0.28);
    return;
  }
  if (gift === 'rose') { subtractPoint('boys', true); enqueueSound('gift-rose', 0.6); }
  else if (gift === 'tiktok') { subtractPoint('girls', true); enqueueSound('gift-tiktok', 0.6); }
  else if (gift === 'donut') { state.girlsRounds += 1; state.girlsScore = 0; state.boysScore = 0; enqueueSound('gift-donut', 0.65); showToast('+1 جولة لفريق البنات', 'GIFT LOCKED'); updateScores(); }
  else if (gift === 'corgi') { state.girlsRounds += 10; state.girlsScore = 0; state.boysScore = 0; enqueueSound('gift-corgi', 0.65); showToast('+10 جولات لفريق البنات', 'GIFT LOCKED'); updateScores(); }
  else if (gift === 'cat') { state.boysRounds += 1; state.girlsScore = 0; state.boysScore = 0; enqueueSound('gift-cat', 0.65); showToast('+1 جولة لفريق الشباب', 'GIFT LOCKED'); updateScores(); }
  else if (gift === 'crown') { state.boysRounds += 10; state.girlsScore = 0; state.boysScore = 0; enqueueSound('gift-crown', 0.65); showToast('+10 جولات لفريق الشباب', 'GIFT LOCKED'); updateScores(); }
  setTimeout(function() {
    state.activeGift = null;
    var btns = $$('.gift-button');
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove('is-active');
  }, 450);
}

function resolveGift(team) {
  var gift = state.activeGift;
  if (!gift) return;
  if (gift === 'heart') {
    state.shieldTeam = team;
    enqueueSound('gift-heart', 0.7);
    showToast('درع الحماية لفريق ' + (team === 'girls' ? 'البنات' : 'الشباب'), 'PROTECTION ON');
    closeGiftBanner();
    updateScores();
    return;
  }
  var roundsToAdd = 0;
  if (gift === 'galaxy') roundsToAdd = 50;
  else if (gift === 'wheel') roundsToAdd = 100;
  var giftSound = team === 'girls' ? 'girls-galaxy' : 'boys-galaxy';
  if (team === 'girls') state.girlsRounds += roundsToAdd;
  else state.boysRounds += roundsToAdd;
  enqueueSound(giftSound, 0.7);
  showToast('+' + roundsToAdd + ' جولة لفريق ' + (team === 'girls' ? 'البنات' : 'الشباب'), 'GIFT LOCKED');
  state.girlsScore = 0;
  state.boysScore = 0;
  closeGiftBanner();
  updateScores();
}

function subtractPoint(team, viaGift) {
  if (state.shieldTeam === team) {
    enqueueSound('gift-heart', 0.4);
    showToast('فريق ' + (team === 'girls' ? 'البنات' : 'الشباب') + ' محمي بالدرع', 'SHIELD ACTIVE');
    return;
  }
  if (team === 'girls') state.girlsScore = Math.max(-5, state.girlsScore - 1);
  else state.boysScore = Math.max(-5, state.boysScore - 1);
  updateScores();
  if (!viaGift) enqueueSound('wrong', 0.25);
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
  updateScores();
  enqueueSound('correct', 0.28);
  if ((team === 'girls' && state.girlsScore >= 5) || (team === 'boys' && state.boysScore >= 5)) {
    showToast('اكتملت 5 نقاط! اضغط "الجولة التالية" لإعلان الفائز', 'ROUND READY');
  }
}

function finishRound() {
  stopTimer();
  clearAudioQueue();
  var currentRound = state.currentRoundIndex + 1;
  var winner = 'تعادل رائع بين الفريقين';
  if (state.girlsScore >= 5 || (state.girlsScore > state.boysScore && state.girlsScore > 0)) {
    state.girlsRounds += 1;
    winner = 'فوز فريق البنات';
    enqueueSound('girls-round', 0.7);
    setTimeout(function() { enqueueSound('boys-lose', 0.35); }, 500);
  } else if (state.boysScore >= 5 || (state.boysScore > state.girlsScore && state.boysScore > 0)) {
    state.boysRounds += 1;
    winner = 'فوز فريق الشباب';
    enqueueSound('boys-round', 0.7);
    setTimeout(function() { enqueueSound('girls-lose', 0.35); }, 500);
  } else {
    enqueueSound('girls-round', 0.35);
  }
  updateScores();
  $('roundEndNumber').textContent = 'الجولة ' + currentRound;
  $('roundEndWinner').textContent = winner;
  $('roundEndGirlsScore').textContent = state.girlsScore;
  $('roundEndBoysScore').textContent = state.boysScore;
  $('roundEndOverlay').classList.remove('hidden');
  fireConfetti();
  state.girlsScore = 0;
  state.boysScore = 0;
  state.shieldTeam = null;
  updateScores();
}

function continueAfterRound() {
  $('roundEndOverlay').classList.add('hidden');
  if (state.mode === 'fullshow' && state.currentRoundIndex < state.fullShowRounds.length - 1) {
    state.currentRoundIndex += 1;
    state.questions = state.fullShowRounds[state.currentRoundIndex].questions;
    state.currentIndex = 0;
    renderQuestion();
    return;
  }
  showResults();
}

function nextQuestion() {
  if (!state.isRevealed) { showToast('اكشف الإجابة أولاً ثم انتقل', 'HOST TIP'); return; }
  if (state.currentIndex < state.questions.length - 1) {
    state.currentIndex += 1;
    renderQuestion();
    startTimer();
  } else {
    finishRound();
  }
}

function showResults() {
  stopTimer();
  clearAudioQueue();
  showScreen('resultsScreen');
  $('finalGirlsScore').textContent = state.girlsRounds;
  $('finalBoysScore').textContent = state.boysRounds;
  var winner = $('winnerText');
  if (state.girlsRounds > state.boysRounds) {
    winner.textContent = 'فريق البنات فاز!';
    winner.style.color = 'var(--pink-hot)';
    enqueueSound('girls-win', 0.8);
    setTimeout(function() { enqueueSound('end', 0.35); }, 800);
  } else if (state.boysRounds > state.girlsRounds) {
    winner.textContent = 'فريق الشباب فاز!';
    winner.style.color = 'var(--cyan)';
    enqueueSound('boys-win', 0.8);
    setTimeout(function() { enqueueSound('end', 0.35); }, 800);
  } else {
    winner.textContent = 'تعادل أبطال الليلة';
    winner.style.color = 'var(--gold-hot)';
    enqueueSound('end', 0.75);
  }
  setTimeout(function() { fireConfetti(); }, 300);
}

function fireConfetti() {
  var canvas = $('confettiCanvas');
  var ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  var colors = ['#f45ca0', '#5de2ff', '#ffd36e', '#64ecad', '#917aff'];
  var particles = [];
  for (var i = 0; i < 105; i++) {
    particles.push({
      x: Math.random() * canvas.width, y: -20 - Math.random() * 100,
      size: 3 + Math.random() * 5, speed: 2 + Math.random() * 3.5,
      drift: (Math.random() - 0.5) * 2.6, spin: Math.random() * 6.28,
      color: colors[Math.floor(Math.random() * colors.length)], alpha: 1
    });
  }
  var frame = 0;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var active = false;
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (p.alpha <= 0) continue;
      active = true;
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
    }
    if (active && frame < 260) { frame += 1; requestAnimationFrame(animate); }
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  animate();
}

function confirmCaptain(team, slot) {
  var input = document.querySelector('.captain-input[data-team="' + team + '"][data-slot="' + slot + '"]');
  if (!input) return;
  var name = input.value.trim();
  if (!name) { showToast('اكتب اسم الكابتن أولاً', 'HOST TIP'); return; }
  input.value = name;
  input.classList.add('confirmed');
  state.captains[team][slot] = name;
  showCaptainReveal(name, team);
  enqueueSound(team === 'girls' ? 'girls-captin' : 'boys-captin', 0.8);
}

function showCaptainReveal(name, team) {
  var overlay = $('captainRevealOverlay');
  if (!overlay) return;
  $('captainRevealName').textContent = name;
  overlay.classList.remove('hidden', 'team-girls', 'team-boys');
  overlay.classList.add(team === 'girls' ? 'team-girls' : 'team-boys');
  clearTimeout(showCaptainReveal.timeout);
  showCaptainReveal.timeout = setTimeout(function() { overlay.classList.add('hidden'); }, 10000);
}

function localGenerate(params) {
  var category = params.category || 'اختيارات متنوعة';
  var difficulty = params.difficulty || 'متوسط';
  var count = params.count || 10;
  var pool = fallbackQuestions.filter(function(q) {
    return (category === 'اختيارات متنوعة' || q.category === category) && q.difficulty === difficulty;
  });
  if (pool.length < count) pool = fallbackQuestions.filter(function(q) {
    return category === 'اختيارات متنوعة' || q.category === category;
  });
  if (pool.length < count) pool = fallbackQuestions.filter(function(q) { return q.difficulty === difficulty; });
  if (pool.length < count) pool = fallbackQuestions;
  var old = {};
  var hist = state.questionHistory.slice(-100);
  for (var i = 0; i < hist.length; i++) old[hist[i]] = true;
  var fresh = shuffle(pool.filter(function(q) { return !old[q.question]; }));
  var combined = fresh.concat(shuffle(pool));
  return combined.slice(0, count).map(function(q) {
    return Object.assign({}, q, { source: 'local', id: 'local_' + Date.now() + '_' + Math.random() });
  });
}

async function fetchQuestions(params) {
  try {
    var response = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, params, { avoid: state.questionHistory.slice(-100) }))
    });
    if (!response.ok) throw new Error('API unavailable');
    var data = await response.json();
    var questions = Array.isArray(data.questions) ? data.questions : [];
    if (!questions.length) throw new Error('Empty response');
    return questions.map(function(q) {
      return Object.assign({}, q, { source: data.meta && data.meta.source === 'ai' ? 'ai' : (q.source || 'local') });
    });
  } catch (e) {
    return localGenerate(params);
  }
}

async function generateSingleRound() {
  var category = $('category').value || 'اختيارات متنوعة';
  var difficulty = $('difficulty').value || 'متوسط';
  var count = Math.max(3, Math.min(30, Number($('count').value) || 10));
  $('count').value = count;
  showLoading('نجهز بنك الأسئلة...');
  try {
    var questions = await fetchQuestions({ category: category, difficulty: difficulty, count: count });
    state.questions = questions;
    state.fullShowRounds = [];
    state.mode = 'single';
    state.currentIndex = 0;
    state.currentRoundIndex = 0;
    state.girlsScore = 0; state.boysScore = 0;
    state.girlsRounds = 0; state.boysRounds = 0;
    var newQs = [];
    for (var i = 0; i < questions.length; i++) newQs.push(questions[i].question);
    state.questionHistory = state.questionHistory.concat(newQs).slice(-200);
    saveHistory();
    saveQuestionSet(questions, { category: category, difficulty: difficulty, source: questions[0] ? questions[0].source : 'local' });
    prepareGame();
  } catch (error) {
    showToast('تعذر تجهيز الجولة', 'SHOW CONTROL');
  } finally {
    hideLoading();
  }
}

function generateFullShowPlan(duration) {
  var total = duration === 60 ? 12 : duration === 180 ? 24 : 18;
  var chunk = Math.ceil(total / 3);
  var categories = ['معلومات عامة', 'جغرافيا', 'علوم', 'اختيارات متنوعة'];
  var plan = [];
  for (var i = 0; i < 3; i++) {
    var count = Math.min(chunk, total - i * chunk);
    if (count > 0) {
      plan.push({
        title: i === 2 ? 'الجولة الذهبية' : 'الجولة ' + (i + 1),
        category: categories[i],
        difficulty: i === 0 ? 'سهل' : i === 1 ? 'متوسط' : 'صعب',
        count: count
      });
    }
  }
  return plan;
}

async function generateFullShow() {
  var plan = generateFullShowPlan(state.fullShowDuration);
  state.fullShowRounds = [];
  showLoading('نرتب فصول اللايف...');
  try {
    for (var index = 0; index < plan.length; index++) {
      $('loadingText').textContent = 'نجهز ' + plan[index].title + ' — ' + (index + 1) + ' / ' + plan.length;
      var questions = await fetchQuestions(plan[index]);
      state.fullShowRounds.push(Object.assign({}, plan[index], { questions: questions }));
      var newQs = [];
      for (var i = 0; i < questions.length; i++) newQs.push(questions[i].question);
      state.questionHistory = state.questionHistory.concat(newQs).slice(-200);
    }
    saveHistory();
    var allQs = [];
    for (var r = 0; r < state.fullShowRounds.length; r++) {
      allQs = allQs.concat(state.fullShowRounds[r].questions);
    }
    saveQuestionSet(allQs, { category: 'مسابقة', difficulty: 'متدرج', source: 'ai' });
    state.mode = 'fullshow';
    state.currentRoundIndex = 0;
    state.questions = state.fullShowRounds[0].questions;
    state.currentIndex = 0;
    state.girlsScore = 0; state.boysScore = 0;
    state.girlsRounds = 0; state.boysRounds = 0;
    prepareGame();
  } catch (error) {
    showToast('تعذر تجهيز اللايف', 'SHOW CONTROL');
  } finally {
    hideLoading();
  }
}

function prepareGame() {
  updateScores();
  showScreen('gameScreen');
  startShowClock();
  renderQuestion();
  enqueueSound('begin', 0.75);
}

function renderSavedList() {
  var saved = getSavedSets();
  var list = $('savedList');
  updateSavedCount();
  if (!saved.length) {
    list.innerHTML = '<div class="saved-empty">لا توجد جولات محفوظة بعد.<br />كل جولة AI جديدة ستظهر هنا تلقائياً.</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < saved.length; i++) {
    var entry = saved[i];
    html += '<article class="saved-item">';
    html += '<div class="saved-item-title">' + escapeHtml(entry.category) + ' — ' + escapeHtml(entry.difficulty) + ' <span>(' + entry.count + ' سؤال)</span></div>';
    html += '<div class="saved-item-meta">' + escapeHtml(entry.date) + ' · ' + (entry.source === 'ai' ? 'AI GENERATED' : 'LOCAL BANK') + '</div>';
    html += '<div class="saved-item-actions">';
    html += '<button class="saved-item-btn saved-item-use" data-use="' + entry.id + '" type="button">استخدام الجولة</button>';
    html += '<button class="saved-item-btn saved-item-delete" data-delete="' + entry.id + '" type="button">حذف</button>';
    html += '</div></article>';
  }
  list.innerHTML = html;
  var useBtns = $$('[data-use]');
  for (var u = 0; u < useBtns.length; u++) {
    (function(btn) {
      btn.addEventListener('click', function() { useSavedSet(Number(btn.dataset.use)); });
    })(useBtns[u]);
  }
  var delBtns = $$('[data-delete]');
  for (var d = 0; d < delBtns.length; d++) {
    (function(btn) {
      btn.addEventListener('click', function() { deleteSavedSet(Number(btn.dataset.delete)); });
    })(delBtns[d]);
  }
}

function openSaved() { renderSavedList(); $('savedModal').classList.remove('hidden'); }

function useSavedSet(id) {
  var saved = getSavedSets();
  var entry = null;
  for (var i = 0; i < saved.length; i++) { if (saved[i].id === id) { entry = saved[i]; break; } }
  if (!entry) return;
  state.questions = entry.questions;
  state.fullShowRounds = [];
  state.mode = 'single';
  state.currentRoundIndex = 0;
  state.currentIndex = 0;
  state.girlsScore = 0; state.boysScore = 0;
  state.girlsRounds = 0; state.boysRounds = 0;
  $('savedModal').classList.add('hidden');
  prepareGame();
}

function deleteSavedSet(id) {
  var saved = getSavedSets().filter(function(entry) { return entry.id !== id; });
  localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  renderSavedList();
}

function initSetup() {
  var modeTabs = $$('.mode-tab');
  for (var i = 0; i < modeTabs.length; i++) {
    (function(tab) {
      tab.addEventListener('click', function() {
        var tabs = $$('.mode-tab');
        for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('is-active');
        tab.classList.add('is-active');
        state.mode = tab.dataset.mode;
        $('fullShowOptions').hidden = state.mode !== 'fullshow';
        $('categoryField').hidden = state.mode === 'fullshow';
      });
    })(modeTabs[i]);
  }
  var stepperBtns = $$('.stepper-btn');
  for (var s = 0; s < stepperBtns.length; s++) {
    (function(button) {
      button.addEventListener('click', function() {
        var input = $('count');
        var current = Number(input.value) || 10;
        input.value = Math.max(3, Math.min(30, current + (button.dataset.action === 'plus' ? 1 : -1)));
      });
    })(stepperBtns[s]);
  }
  var durationBtns = $$('[data-duration]');
  for (var d = 0; d < durationBtns.length; d++) {
    (function(button) {
      button.addEventListener('click', function() {
        var btns = $$('[data-duration]');
        for (var j = 0; j < btns.length; j++) btns[j].classList.remove('is-active');
        button.classList.add('is-active');
        state.fullShowDuration = Number(button.dataset.duration);
      });
    })(durationBtns[d]);
  }
  var timerBtns = $$('[data-timer]');
  for (var t = 0; t < timerBtns.length; t++) {
    (function(button) {
      button.addEventListener('click', function() {
        var btns = $$('[data-timer]');
        for (var j = 0; j < btns.length; j++) btns[j].classList.remove('is-active');
        button.classList.add('is-active');
        state.timerDuration = Number(button.dataset.timer);
        state.timerValue = state.timerDuration;
      });
    })(timerBtns[t]);
  }
  $('generateBtn').addEventListener('click', function() {
    if (state.mode === 'fullshow') generateFullShow();
    else generateSingleRound();
  });
  $('savedStartBtn').addEventListener('click', generateSingleRound);
  $('savedQuestionsBtn').addEventListener('click', openSaved);
  $('setupSoundBtn').addEventListener('click', toggleSound);
}

function initGame() {
  $('soundToggle').addEventListener('click', toggleSound);
  $('startTimerBtn').addEventListener('click', startTimer);
  $('revealBtn').addEventListener('click', revealAnswer);
  $('nextBtn').addEventListener('click', nextQuestion);
  $('girlsPlusBtn').addEventListener('click', function() { applyPoint('girls'); });
  $('girlsMinusBtn').addEventListener('click', function() { subtractPoint('girls'); });
  $('boysPlusBtn').addEventListener('click', function() { applyPoint('boys'); });
  $('boysMinusBtn').addEventListener('click', function() { subtractPoint('boys'); });
  $('nextRoundBtn').addEventListener('click', finishRound);
  $('endGameBtn').addEventListener('click', showResults);
  $('newRoundBtn').addEventListener('click', function() { stopTimer(); showScreen('setupScreen'); });
  var giftButtons = $$('.gift-button');
  for (var i = 0; i < giftButtons.length; i++) {
    (function(button) {
      button.addEventListener('click', function() { selectGift(button.dataset.gift); });
    })(giftButtons[i]);
  }
  $('pickGirlsBtn').addEventListener('click', function() { resolveGift('girls'); });
  $('pickBoysBtn').addEventListener('click', function() { resolveGift('boys'); });
  $('cancelGiftBtn').addEventListener('click', function() {
    state.activeGift = null;
    $('activeGiftBanner').classList.add('hidden');
    var btns = $$('.gift-button');
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove('is-active');
  });
  $('roundEndContinueBtn').addEventListener('click', continueAfterRound);
  var captainBtns = $$('.captain-done');
  for (var c = 0; c < captainBtns.length; c++) {
    (function(button) {
      button.addEventListener('click', function() { confirmCaptain(button.dataset.team, button.dataset.slot); });
    })(captainBtns[c]);
  }
  var soundTriggers = $$('.sound-trigger');
  for (var st = 0; st < soundTriggers.length; st++) {
    (function(button) {
      button.addEventListener('click', function() { enqueueSound(button.dataset.sound, 0.7); });
    })(soundTriggers[st]);
  }
}

function initResults() {
  $('replayBtn').addEventListener('click', function() { stopTimer(); clearAudioQueue(); showScreen('setupScreen'); });
}

function initOverlays() {
  $('closeSavedBtn').addEventListener('click', function() { $('savedModal').classList.add('hidden'); });
  var overlayIds = ['savedModal', 'roundEndOverlay'];
  for (var i = 0; i < overlayIds.length; i++) {
    (function(id) {
      $(id).addEventListener('click', function(event) {
        if (event.target.id === id) $(id).classList.add('hidden');
      });
    })(overlayIds[i]);
  }
}

function initFloatingSound() {
  var gameBtn = $('floatingSoundBtn');
  var gameBoard = $('floatingSoundBoard');
  if (gameBtn) {
    gameBtn.addEventListener('click', function() { gameBoard.classList.toggle('hidden'); });
    if ($('closeFloatingSound')) {
      $('closeFloatingSound').addEventListener('click', function() { gameBoard.classList.add('hidden'); });
    }
  }
  var resultsBtn = $('floatingSoundBtnResults');
  var resultsBoard = $('floatingSoundBoardResults');
  if (resultsBtn) {
    resultsBtn.addEventListener('click', function() { resultsBoard.classList.toggle('hidden'); });
    if ($('closeFloatingSoundResults')) {
      $('closeFloatingSoundResults').addEventListener('click', function() { resultsBoard.classList.add('hidden'); });
    }
  }
}

function init() {
  state.questionHistory = getHistory();
  state.questionAnalytics = getAnalytics();
  state.soundEnabled = localStorage.getItem(SOUND_KEY) === 'true';
  updateSoundButtons();
  updateSavedCount();
  initSetup();
  initGame();
  initResults();
  initOverlays();
  hideLoading();
  updateTimer();
  initFloatingSound();
  scheduleBeginSound();
}

document.addEventListener('DOMContentLoaded', init);
