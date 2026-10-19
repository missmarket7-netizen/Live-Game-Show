(function () {
  "use strict";

  if (window.__ANSWER_LAYER_V1__) return;
  window.__ANSWER_LAYER_V1__ = true;

  function $(id) {
    return document.getElementById(id);
  }

  function getState() {
    return window.state || null;
  }

  function getCurrentQuestion() {
    var st = getState();
    if (!st || !Array.isArray(st.questions)) return null;
    return st.questions[st.currentIndex] || null;
  }

  function getAnswer(q) {
    if (!q) return "";

    if (q.answer && String(q.answer).trim()) {
      return String(q.answer).trim();
    }

    if (Array.isArray(q.options)) {
      if (q.options.length === 1) {
        return String(q.options[0] || "").trim();
      }

      if (q.options.length > 1) {
        var idx = Number(q.correctIndex);
        if (Number.isInteger(idx) && idx >= 0 && idx < q.options.length) {
          return String(q.options[idx] || "").trim();
        }
      }
    }

    return "";
  }

  function isFree(q) {
    if (!q) return true;
    if (getAnswer(q)) return false;
    return !Array.isArray(q.options) || q.options.length === 0;
  }

  window.isFreeQuestion = isFree;

  var originalRevealAnswer = window.revealAnswer;

  window.revealAnswer = function () {
    try {
      var st = getState();
      if (!st || st.isRevealed) return;

      var q = getCurrentQuestion();
      if (!q) return;

      st.isRevealed = true;

      if (typeof window.stopTimer === "function") {
        window.stopTimer();
      }

      var answer = getAnswer(q);
      var answerEl = $("answerText");
      var explanationEl = $("explanationText");
      var revealBox = $("answerReveal");
      var revealBtn = $("revealBtn");

      if (answerEl) {
        answerEl.textContent = answer || "🎤 إجابة حرة — الحكم للمضيف";
      }

      if (explanationEl) {
        explanationEl.textContent = q.explanation || "معلومة إضافية للمقدم.";
      }

      if (revealBox) {
        revealBox.classList.remove("hidden");
        revealBox.classList.add("reveal-anim");
      }

      if (revealBtn) {
        revealBtn.disabled = true;
      }

      if (typeof window.playSound === "function") {
        window.playSound(answer ? "correct" : "tick", 0.35);
      }
    } catch (e) {
      if (typeof originalRevealAnswer === "function") {
        originalRevealAnswer.apply(this, arguments);
      }
    }
  };

  var originalRenderQuestion = window.renderQuestion;

  window.renderQuestion = function () {
    var result;

    if (typeof originalRenderQuestion === "function") {
      result = originalRenderQuestion.apply(this, arguments);
    }

    try {
      var q = getCurrentQuestion();
      var grid = $("optionsGrid");

      if (!grid) return result;

      grid.innerHTML = "";

      var pill = document.createElement("div");
      pill.className = "think-pill";

      if (isFree(q)) {
        pill.textContent = "⚡ سؤال سرعة — إجابة حرة، الحكم للمضيف";
      } else {
        pill.textContent = "🔒 الإجابة مخفية — تظهر عند كشف الإجابة";
      }

      grid.appendChild(pill);
    } catch (e) {}

    return result;
  };
})();
