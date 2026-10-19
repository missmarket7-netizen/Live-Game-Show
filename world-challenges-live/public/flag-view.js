/* ═══ FLAG_VIEW_V1 — إصلاح عرض أسئلة الأعلام ونص السؤال — بدون أي تغيير في التصميم ═══ */
(function () {
  'use strict';
  if (window.__FLAG_VIEW_V1__) return;
  window.__FLAG_VIEW_V1__ = true;

  var PLACEHOLDERS = ['جاهز للسؤال الأول؟', '—', ''];

  function current() {
    var s = window.state;
    return s && Array.isArray(s.questions) ? (s.questions[s.currentIndex] || null) : null;
  }

  function titleNodes() {
    var out = [];
    var byId = document.getElementById('questionText');
    if (byId) out.push(byId);
    Array.prototype.forEach.call(
      document.querySelectorAll('.question-main h1, .redesigned-question-card h1'),
      function (n) { if (out.indexOf(n) === -1) out.push(n); }
    );
    return out;
  }

  function isFlag(q) {
    if (!q) return false;
    if (/خمن\s*الدولة|أعلام|flags/i.test(String(q.category || ''))) return true;
    var t = String(q.question || '').trim();
    return /(^|\/)flags\/[a-z]{2}\.(svg|png|jpe?g|webp)/i.test(t) ||
           /^https?:\/\/\S+\.(svg|png|jpe?g|webp)/i.test(t);
  }

  function normalizeSrc(raw) {
    var t = String(raw || '').trim().replace(/\/+$/, '');
    if (/^https?:\/\//i.test(t)) return t;
    t = t.replace(/^\.?\//, '');
    if (!/^(flags|images)\//i.test(t)) t = 'flags/' + t;
    return '/' + t;
  }

  function flagCode(src) {
    var m = String(src || '').match(/([a-z]{2})\.(?:svg|png|jpe?g|webp)/i);
    return m ? m[1].toLowerCase() : '';
  }

  function paintFlag(node, q) {
    var src = normalizeSrc(q.question || q.image || q.flag);
    var code = flagCode(src);
    if (node.getAttribute('data-flag-src') === src && node.querySelector('img.flag-question-img')) return;

    node.setAttribute('data-flag-src', src);
    node.classList.add('is-flag-question');
    node.textContent = '';

    var wrap = document.createElement('div');
    wrap.className = 'flag-question-wrap';

    var img = document.createElement('img');
    img.className = 'flag-question-img';
    img.alt = 'علم الدولة';
    img.src = src;
    img.onerror = function () {
      if (code && String(img.src).indexOf('flagcdn.com') === -1) {
        img.onerror = null;
        img.src = 'https://flagcdn.com/w320/' + code + '.png';
      } else if (!img.dataset.fell) {
        img.dataset.fell = '1';
        img.onerror = null;
        var fb = document.createElement('div');
        fb.className = 'flag-question-fallback';
        fb.textContent = '🏳️';
        img.replaceWith(fb);
      }
    };

    var p = document.createElement('p');
    p.className = 'flag-question-prompt';
    p.textContent = 'ما اسم هذه الدولة؟';

    wrap.appendChild(img);
    wrap.appendChild(p);
    node.appendChild(wrap);
  }

  function paintText(node, q) {
    if (node.querySelector('img.flag-question-img') || node.querySelector('.flag-question-wrap')) {
      node.textContent = '';
      node.removeAttribute('data-flag-src');
      node.classList.remove('is-flag-question');
    }
    var t = String(node.textContent || '').trim();
    var looksPath = /(^|\/)flags\/[a-z]{2}\./i.test(t) || /^https?:\/\/\S+\.(svg|png)/i.test(t);
    var isPlaceholder = PLACEHOLDERS.indexOf(t) !== -1;
    if (isPlaceholder || looksPath || t !== String(q.question || '')) {
      node.textContent = q.question || '';
    }
    node.removeAttribute('data-flag-src');
  }

  function paint() {
    var q = current();
    if (!q) return;
    titleNodes().forEach(function (node) {
      try {
        if (isFlag(q)) paintFlag(node, q);
        else paintText(node, q);
      } catch (e) {}
    });
  }

  function wrapFn(name, marker, after) {
    if (window[marker]) return;
    if (typeof window[name] !== 'function') return;
    window[marker] = true;
    var orig = window[name];
    window[name] = function () {
      var r;
      try { r = orig.apply(this, arguments); } catch (e) {}
      try { after(); } catch (e) {}
      return r;
    };
  }

  function boot() {
    wrapFn('renderQuestion', '__FLAG_VIEW_WRAPPED__', function () {
      setTimeout(paint, 0);
      setTimeout(paint, 120);
    });
    wrapFn('revealAnswer', '__FLAG_VIEW_REVEAL_WRAPPED__', function () {
      var q = current();
      if (q && q.answer && (!q.options || !q.options.length)) {
        var a = document.getElementById('answerText');
        if (a) a.textContent = q.answer;
      }
    });
    paint();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 60); });
  } else {
    setTimeout(boot, 60);
  }

  if (window.MutationObserver) {
    var t = null;
    new MutationObserver(function () {
      if (t) clearTimeout(t);
      t = setTimeout(paint, 80);
    }).observe(document.body, { childList: true, subtree: true });
  }
})();
