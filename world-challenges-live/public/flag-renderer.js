(function () {
  'use strict';

  if (window.__FLAG_RENDERER_V1__) return;
  window.__FLAG_RENDERER_V1__ = true;

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

  function isFlagPath(text) {
    return typeof text === 'string' && /^\/flags\/[a-z]{2}\.svg$/i.test(text.trim());
  }

  function renderFlagImage(container, src) {
    container.innerHTML = '';
    
    var imgWrapper = document.createElement('div');
    imgWrapper.className = 'huge-flag-container';
    
    var img = document.createElement('img');
    img.src = src;
    img.alt = 'خمن الدولة من العلم';
    img.draggable = false;
    
    imgWrapper.appendChild(img);
    container.appendChild(imgWrapper);
  }

  var originalRenderQuestion = window.renderQuestion;

  window.renderQuestion = function () {
    var result;

    if (typeof originalRenderQuestion === 'function') {
      result = originalRenderQuestion.apply(this, arguments);
    }

    try {
      var q = getCurrentQuestion();
      if (!q || !isFlagPath(q.question)) return result;

      var questionTextEl = $('questionText');
      if (questionTextEl) {
        renderFlagImage(questionTextEl, q.question);
        
        // إخفاء رقم السؤال والفئة لأنها لا معنى لها مع الأعلام
        var numEl = $('questionNumber');
        var catEl = $('categoryBadge');
        if (numEl) numEl.style.display = 'none';
        if (catEl) catEl.textContent = '🏳️ خمن الدولة';
      }

      var grid = $('optionsGrid');
      if (grid) {
        grid.innerHTML = '<div class="think-pill huge-flag-hint">🔍 حدّد الدولة من شكل العلم...</div>';
      }
    } catch (e) {
      console.warn('Flag renderer error:', e);
    }

    return result;
  };
})();
