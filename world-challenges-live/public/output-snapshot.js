(function exposeWorldChallengesSnapshot(root) {
  'use strict';

  const SCHEMA_VERSION = 1;

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

  function outputQuestionText(question) {
    const candidate = safeText(question && question.question, 320);
    const isMediaPath = /^(?:https?:\/\/|\/|(?:public\/)?(?:flags|guess|name|landmarks?|tourism|images)\/)|\.(?:svg|png|jpe?g|webp)(?:[?#]|$)/i.test(candidate);
    if (candidate && !isMediaPath) return candidate;
    const category = safeText(question && question.category, 80);
    if (/خمن\s*(?:الدولة\s*أو\s*المدينة|المدينة)/i.test(category)) return 'خمن الدولة أو المدينة من الصورة';
    if (/خمن\s*الدولة|أعلام/i.test(category)) return 'ما اسم هذه الدولة؟';
    if (/خمن\s*الاسم/i.test(category)) return 'خمن الاسم من الصورة';
    if (/معالم|سياحية/i.test(category)) return 'حدّد المعلم أو الوجهة من الصورة';
    return category ? 'سؤال بصري من فئة ' + category : 'سؤال بصري';
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || raw.schemaVersion !== SCHEMA_VERSION) return null;

    const scores = raw.scores && typeof raw.scores === 'object' ? raw.scores : {};
    const question = raw.question && typeof raw.question === 'object' ? raw.question : {};
    const timer = raw.timer && typeof raw.timer === 'object' ? raw.timer : {};
    const captains = raw.captains && typeof raw.captains === 'object' ? raw.captains : {};
    const sentAt = Number(raw.sentAt);
    if (!Number.isFinite(sentAt) || sentAt <= 0 || sentAt > Date.now() + 5000) return null;

    const ready = Boolean(raw.ready);
    const rawRemainingSeconds = Number(timer.remainingSeconds);
    const rawDurationSeconds = Number(timer.durationSeconds);
    const remainingSeconds = safeNumber(timer.remainingSeconds, 0, 3600, 0);
    const durationSeconds = safeNumber(timer.durationSeconds, 1, 3600, 30);
    const timerRunning = Boolean(timer.running);
    const revealed = Boolean(question.revealed);
    const timerExpired = timer.running === false
      && Number.isFinite(rawRemainingSeconds)
      && Number.isFinite(rawDurationSeconds)
      && rawDurationSeconds > 0
      && rawRemainingSeconds <= 0;
    const answerReleased = ready && (revealed || timerExpired);
    const names = (items) => Array.isArray(items)
      ? items.map((name) => safeText(name, 48)).filter(Boolean).slice(0, 5)
      : [];

    const safeQuestion = {
      text: outputQuestionText({ question: question.text, category: question.category }),
      category: safeText(question.category, 48),
      revealed,
      index: safeNumber(question.index, 0, 99, 0),
      total: safeNumber(question.total, 0, 99, 0)
    };
    if (answerReleased) safeQuestion.answer = safeText(question.answer, 160);

    return {
      schemaVersion: SCHEMA_VERSION,
      sentAt,
      ready,
      scores: {
        girls: safeNumber(scores.girls, -9999, 9999, 0),
        boys: safeNumber(scores.boys, -9999, 9999, 0)
      },
      question: safeQuestion,
      timer: {
        remainingSeconds,
        durationSeconds,
        running: timerRunning
      },
      captains: { girls: names(captains.girls), boys: names(captains.boys) },
      roundNumber: safeNumber(raw.roundNumber, 1, 999, 1)
    };
  }

  function create(state, answerResolver) {
    if (!state || typeof state !== 'object') return null;
    const questions = Array.isArray(state.questions) ? state.questions : [];
    const currentIndex = Math.floor(safeNumber(state.currentIndex, 0, Math.max(questions.length - 1, 0), 0));
    const currentQuestion = questions[currentIndex] || null;
    const durationSeconds = safeNumber(state.timerDuration, 1, 3600, 30);
    const rawTimerValue = Number(state.timerValue);
    const remainingSeconds = safeNumber(state.timerValue, 0, 3600, 0);
    const timerRunning = Boolean(state.isTimerRunning);
    const revealed = Boolean(state.isRevealed);
    const ready = Boolean(currentQuestion);
    const timerExpired = !timerRunning && Number.isFinite(rawTimerValue)
      && Number(state.timerDuration) > 0 && remainingSeconds <= 0;
    const answerReleased = ready && (revealed || timerExpired);

    let answer = '';
    if (answerReleased && currentQuestion) {
      try {
        answer = currentQuestion.source === 'random-host'
          ? 'إجابة حرة — الحكم للمقدم'
          : (typeof answerResolver === 'function' ? answerResolver(currentQuestion) : currentQuestion.answer);
      } catch (error) {
        answer = '';
      }
    }

    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      sentAt: Date.now(),
      ready,
      scores: { girls: state.girlsScore, boys: state.boysScore },
      question: {
        text: outputQuestionText(currentQuestion),
        category: safeText(currentQuestion && currentQuestion.category, 48),
        revealed,
        index: ready ? currentIndex + 1 : 0,
        total: questions.length
      },
      timer: { remainingSeconds, durationSeconds, running: timerRunning },
      captains: state.captains || {},
      roundNumber: state.roundNumber
    };
    if (answerReleased) snapshot.question.answer = answer;
    return normalize(snapshot);
  }

  root.WCQOutputSnapshot = Object.freeze({ create, normalize });
})(typeof window !== 'undefined' ? window : globalThis);
