/* ═══ UI_RESCUE_V1 — طبقة إنقاذ أخيرة ومنعزلة: لا تعدل أي ملف آخر ═══ */
(function () {
  'use strict';
  if (window.__UI_RESCUE_V1__) return;
  window.__UI_RESCUE_V1__ = true;

  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function cur() {
    var s = window.state;
    return s && Array.isArray(s.questions) ? (s.questions[s.currentIndex] || null) : null;
  }

  /* ── الأعلام ── */
  function flagSrc(q) {
    var raw = String((q && (q.question || q.image || q.flag)) || '').trim();
    if (!raw) return '';
    raw = raw.replace(/\/+$/, '');
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^\/?flags\//i.test(raw)) return '/' + raw.replace(/^\/+/, '');
    var m = raw.match(/^([a-z]{2})$/i);
    if (m) return '/flags/' + m[1].toLowerCase() + '.svg';
    return '';
  }
  function isFlag(q) {
    if (!q) return false;
    if (/خمن\s*الدولة|أعلام|flags/i.test(String(q.category || ''))) return true;
    return !!flagSrc(q);
  }

  /* ── إصلاح 1: رسم نص السؤال في كل العقدة المرئية والمكررة ── */
  var paintKey = '';
  function paintQuestion(force) {
    var q = cur();
    var key = q ? (String(window.state.currentIndex) + '|' + String(q.question || '') ) : 'none';
    if (!force && key === paintKey) return;
    paintKey = key;

    var nodes = qsa('#questionText, .question-main h1, .redesigned-question-card h1');
    if (!nodes.length || !q) return;

    nodes.forEach(function (el) {
      if (isFlag(q)) {
        var src = flagSrc(q);
        el.classList.add('is-flag-question');
        el.innerHTML = '';
        var wrap = document.createElement('div');
        wrap.className = 'flag-question-wrap';
        var img = document.createElement('img');
        img.className = 'flag-question-img';
        img.alt = 'علم الدولة';
        img.loading = 'eager';
        img.src = src;
        img.onerror = function () {
          var m = src.match(/\/flags\/([a-z]{2})\./i) || src.match(/flagcdn\.com\/w\d+\/([a-z]{2})\./i);
          if (m && String(img.src).indexOf('flagcdn') === -1) {
            img.onerror = null;
            img.src = 'https://flagcdn.com/w320/' + m[1].toLowerCase() + '.png';
          } else {
            wrap.innerHTML = '<div class="flag-question-fallback">🏳️</div>';
          }
        };
        var p = document.createElement('p');
        p.className = 'flag-question-prompt';
        p.textContent = 'ما اسم هذه الدولة؟';
        wrap.appendChild(img);
        wrap.appendChild(p);
        el.appendChild(wrap);
      } else {
        el.classList.remove('is-flag-question');
        el.textContent = q.question || '';
      }
    });
  }

  var origRender = window.renderQuestion;
  window.renderQuestion = function () {
    var r;
    try { r = origRender ? origRender.apply(this, arguments) : undefined; } catch (e) {}
    setTimeout(function () { paintQuestion(true); }, 0);
    return r;
  };

  /* ── إصلاح 2: أعمدة هدف الهدايا تصبح داخل التدفق (لا تغطي الأزرار) ── */
  function dockGiftGoals() {
    var sides = qsa('.ax-gift-side');
    if (!sides.length) return;

    var strip = qs('#uiGiftStrip');
    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'uiGiftStrip';
      strip.className = 'ui-gift-strip';
      var anchor = qs('.score-strip') || qs('.redesigned-question-card') || qs('.question-card');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(strip, anchor.nextSibling);
      else (qs('.show-stage') || document.body).appendChild(strip);
    }

    sides.forEach(function (s) {
      if (s.parentNode !== strip) strip.appendChild(s);
    });
  }

  /* ── إصلاح 3: زرّا الثيم والمؤثرات في شريط سفلي محجوز ── */
  function buildDock() {
    var dock = qs('#uiDock');
    if (!dock) {
      dock = document.createElement('div');
      dock.id = 'uiDock';
      document.body.appendChild(dock);
      document.body.classList.add('ui-dock-on');
    }

    var theme = qs('#themeToggleBtn');
    if (theme && theme.parentNode !== dock) dock.appendChild(theme);

    var soundWrap = qs('.floating-sound-controls');
    if (!soundWrap) {
      var sb = qs('#floatingSoundBtn');
      if (sb) soundWrap = sb.parentElement;
    }
    if (soundWrap && soundWrap.parentNode !== dock) dock.appendChild(soundWrap);

    var resBtn = qs('#floatingSoundBtnResults');
    if (resBtn) {
      var rw = resBtn.closest('.floating-sound-controls') || resBtn;
      if (!dock.contains(rw)) rw.style.display = 'none';
    }
  }

  function refresh() {
    dockGiftGoals();
    buildDock();
    paintQuestion(false);
  }

  var t = null;
  function schedule() {
    if (t) clearTimeout(t);
    t = setTimeout(refresh, 120);
  }

  if (window.MutationObserver) {
    new MutationObserver(schedule).observe(document.body, { childList: true });
  }
  setInterval(schedule, 2000);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(refresh, 80); });
  } else {
    setTimeout(refresh, 80);
  }
})();
