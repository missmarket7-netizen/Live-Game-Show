/* FLAG_VIEW_V2 — رسم موحّد وثابت لأسئلة الأعلام بعد انتهاء كل طبقات الواجهة */
(function () {
  'use strict';
  if (window.__FLAG_VIEW_V2__) return;
  window.__FLAG_VIEW_V2__ = true;

  var RETRIES = [0, 80, 180, 360, 700];
  var paintTimer = null;
  var lastKey = '';

  function stateNow() {
    return window.state || null;
  }

  function currentQuestion() {
    var s = stateNow();
    return s && Array.isArray(s.questions) ? (s.questions[s.currentIndex] || null) : null;
  }

  function isFlagQuestion(q) {
    if (!q) return false;
    var category = String(q.category || '').trim();
    var value = String(q.question || q.image || q.flag || '').trim();
    return /خمن\s*الدولة|أعلام|flags/i.test(category) || /(?:^|\/)flags\/[a-z]{2}\.(?:svg|png|jpe?g|webp)(?:$|\?)/i.test(value);
  }

  function flagSource(q) {
    var value = String(q.question || q.image || q.flag || '').trim().replace(/\\/g, '/');
    value = value.replace(/^\.?\//, '');
    value = value.replace(/^public\//i, '');
    if (/^https?:\/\//i.test(value)) return value;
    if (!/^flags\//i.test(value)) {
      var code = value.match(/(?:^|\/)flags\/([a-z]{2})\.(?:svg|png|jpe?g|webp)/i);
      value = code ? 'flags/' + code[1].toLowerCase() + '.svg' : 'flags/' + value.replace(/^\/+/, '');
    }
    return '/' + value.replace(/^\/+/, '');
  }

  function titleNode() {
    return document.getElementById('questionText');
  }

  function makeImage(src, q, host) {
    var wrapper = document.createElement('div');
    wrapper.className = 'flag-question-wrap stable-flag-wrap';
    wrapper.setAttribute('data-stable-flag', src);

    var img = document.createElement('img');
    img.className = 'flag-question-img stable-flag-img';
    img.alt = q.answer ? 'علم ' + String(q.answer) : 'علم الدولة';
    img.draggable = false;
    img.loading = 'eager';
    img.decoding = 'async';
    img.src = src;

    img.onerror = function () {
      wrapper.classList.add('flag-load-error');
      img.removeAttribute('src');
      var error = wrapper.querySelector('.flag-question-fallback');
      if (!error) {
        error = document.createElement('div');
        error.className = 'flag-question-fallback';
        error.textContent = '🏳️ تعذر تحميل العلم';
        wrapper.appendChild(error);
      }
    };

    var prompt = document.createElement('p');
    prompt.className = 'flag-question-prompt';
    prompt.textContent = 'ما اسم هذه الدولة؟';
    wrapper.appendChild(img);
    wrapper.appendChild(prompt);
    host.replaceChildren(wrapper);
  }

  function paint() {
    var q = currentQuestion();
    var host = titleNode();
    if (!q || !host) return;

    if (!isFlagQuestion(q)) {
      host.classList.remove('is-flag-question', 'question-media-host', 'is-flag-visual');
      return;
    }

    var src = flagSource(q);
    var key = String(stateNow().currentIndex) + '|' + src;
    var current = host.querySelector('.stable-flag-wrap');
    if (!current || current.getAttribute('data-stable-flag') !== src || lastKey !== key) {
      host.classList.remove('question-media-host', 'is-landmark-visual');
      host.classList.add('is-flag-question', 'question-media-host', 'is-flag-visual');
      host.setAttribute('data-flag-src', src);
      makeImage(src, q, host);
      lastKey = key;
    }

    var number = document.getElementById('questionNumber');
    var category = document.getElementById('categoryBadge');
    if (number) number.style.display = 'none';
    if (category) category.textContent = '🏳️ خمن الدولة';

    var grid = document.getElementById('optionsGrid');
    if (grid && !grid.querySelector('.stable-flag-hint')) {
      grid.replaceChildren();
      var hint = document.createElement('div');
      hint.className = 'think-pill huge-flag-hint stable-flag-hint';
      hint.textContent = '🔍 حدّد الدولة من شكل العلم… الإجابة تظهر عند الكشف';
      grid.appendChild(hint);
    }
  }

  function schedulePaint() {
    RETRIES.forEach(function (delay) {
      window.setTimeout(paint, delay);
    });
  }

  function wrap(name, marker) {
    if (window[marker] || typeof window[name] !== 'function') return;
    window[marker] = true;
    var original = window[name];
    window[name] = function () {
      var result = original.apply(this, arguments);
      schedulePaint();
      return result;
    };
  }

  function boot() {
    wrap('renderQuestion', '__FLAG_RENDER_WRAP_V2__');
    schedulePaint();
    if (window.MutationObserver) {
      var observer = new MutationObserver(function () {
        if (paintTimer) window.clearTimeout(paintTimer);
        paintTimer = window.setTimeout(paint, 40);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { window.setTimeout(boot, 40); });
  } else {
    window.setTimeout(boot, 40);
  }
})();
