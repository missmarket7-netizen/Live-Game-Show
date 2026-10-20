/* ═══ FRAME_CLEAN_V1 — مسح أي إطار/ارتفاع مصطنع ملتصق بعنصر السؤال بعد كل رسم ═══ */
(function () {
  'use strict';
  if (window.__FRAME_CLEAN_V1__) return;
  window.__FRAME_CLEAN_V1__ = true;

  var KILL = [
    'border', 'border-width', 'border-style', 'border-color', 'border-radius',
    'outline', 'background', 'background-color', 'background-image',
    'box-shadow', 'min-height', 'height', 'max-height', 'aspect-ratio',
    'padding', 'display', 'align-items', 'justify-content', 'flex-direction',
    'gap', 'backdrop-filter', '-webkit-backdrop-filter'
  ];

  function strip(el) {
    if (!el || !el.style) return;
    for (var i = 0; i < KILL.length; i++) el.style.removeProperty(KILL[i]);
  }

  function clean() {
    var q = document.getElementById('questionText');
    if (!q) return;

    strip(q);                                   // عنصر السؤال نفسه
    strip(q.parentElement);                     // .question-main إن حمل أنماطًا

    // أغلفة الوسائط/الأعلام الداخلية: مسح أنماطها المباشرة فقط (تبقى الصورة)
    var wraps = q.querySelectorAll('.flag-question-wrap, .question-visual-frame, figure, > div');
    for (var i = 0; i < wraps.length; i++) strip(wraps[i]);

    // أي ابن مباشر يحمل حدودًا/خلفية: تصفيره
    for (var j = 0; j < q.children.length; j++) strip(q.children[j]);
  }

  function hook(name) {
    if (typeof window[name] !== 'function') return;
    var orig = window[name];
    window[name] = function () {
      var r;
      try { r = orig.apply(this, arguments); } catch (e) {}
      setTimeout(clean, 0);
      setTimeout(clean, 80);
      return r;
    };
  }

  function boot() {
    hook('renderQuestion');
    hook('setQuestionVisual');
    clean();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 50); });
  } else {
    setTimeout(boot, 50);
  }
})();
