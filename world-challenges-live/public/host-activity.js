(function(){
  'use strict';
  var q = function(s){ return document.querySelector(s); };
  var card = function(){ return q('.question-card'); };
  var replay = function(el, cls, ms){ if(!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(function(){ el.classList.remove(cls); }, ms); };

  /* 1+6) دخول السؤال + بدء العداد تلقائياً لكل سؤال (الأول والجولات التالية) */
  var _render = window.renderQuestion;
  window.renderQuestion = function(){ var r = _render.apply(this, arguments); replay(card(), 'enter', 420); if (window.startTimer) startTimer(); return r; };

  /* 2) نبضة بدء العداد */
  var _startTimer = window.startTimer;
  window.startTimer = function(){ var was = (state && state.isTimerRunning); var r = _startTimer.apply(this, arguments); if (!was && state && state.isTimerRunning) replay(q('.timer-ring'), 'start-pulse', 600); return r; };

  /* 4+نبضة الاختيار) تأخير الكشف 140ms لتظهر نبضة selected ثم الكشف بأنيميشن */
  var _reveal = window.revealAnswer;
  window.revealAnswer = function(){ var a = arguments, s = this; setTimeout(function(){ _reveal.apply(s, a); replay(q('.answer-reveal'), 'reveal-anim', 460); }, 140); };

  /* 5) نبضة نقاط للفريق المتغيّر فقط */
  var pulseTeam = function(team){ replay(q(team === 'girls' ? '.team-score-girls' : '.team-score-boys'), 'pulse', 560); };
  var _apply = window.applyPoint;
  window.applyPoint = function(team){ var r = _apply.apply(this, arguments); pulseTeam(team); return r; };
  var _sub = window.subtractPoint;
  window.subtractPoint = function(team){ var r = _sub.apply(this, arguments); pulseTeam(team); return r; };

  /* 7) انتقال الجولة: sweep على بطاقة السؤال عند إنهاء الجولة */
  var _finish = window.finishRound;
  window.finishRound = function(){ replay(card(), 'round-sweep-host', 720); return _finish.apply(this, arguments); };

  /* 3) لمس الأزرار — محصور داخل السؤال ولوحة التحكم فقط (لا هدايا/أعلى) */
  document.addEventListener('click', function(e){
    var t = e.target.closest('button'); if (!t) return;
    if (!t.closest('.question-card, .control-deck')) return;
    replay(t, 'press', 170);
  }, true);
})();
