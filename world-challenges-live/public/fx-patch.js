/* ═══ FX Patch Layer: Sound Button Everywhere + Cat/Crown Fallback + Point Confetti + Captain/Winner Images ═══ */
(function () {
  'use strict';

  var GIRLS_IMG = '/images/girls.jpg';
  var BOYS_IMG = '/images/boys.jpg';
  var CAT_FALLBACK = '🐱';
  var CROWN_FALLBACK = '👑';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  /* ─── 1) إبقاء زر المؤثرات ظاهراً في كل الشاشات بما فيها النتائج ─── */
  function keepSoundButtonVisible() {
    var btn = document.getElementById('floatingSoundBtn');
    if (!btn) return;
    btn.style.display = 'grid';
    btn.style.visibility = 'visible';
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    // ضمان عدم إخفائه بأي class hidden لاحقاً
    btn.classList.remove('hidden');
  }

  /* مراقبة تغيير الشاشات لإعادة إظهار الزر دائماً */
  function watchScreens() {
    var screens = ['setupScreen', 'gameScreen', 'resultsScreen'];
    screens.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || !window.MutationObserver) return;
      new MutationObserver(keepSoundButtonVisible).observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    keepSoundButtonVisible();
  }

  /* ─── 2) بدائل emoji لصور cat و crown عند فشل التحميل ─── */
  function patchGiftImages() {
    document.querySelectorAll('.gift-button').forEach(function (btn) {
      var key = btn.dataset.gift;
      if (key !== 'cat' && key !== 'crown') return;

      var img = btn.querySelector('img.gift-img');
      if (!img) return;

      img.addEventListener('error', function () {
        var span = document.createElement('span');
        span.className = 'gift-art';
        span.textContent = key === 'cat' ? CAT_FALLBACK : CROWN_FALLBACK;
        span.style.fontSize = '20px';
        span.style.lineHeight = '1';
        img.replaceWith(span);
      }, { once: true });
    });
  }

  /* ─── 3) قصاصات عند تسجيل نقطة لأي فريق ─── */
  function burstAt(team) {
    var selector = team === 'girls' ? '.team-score-girls' : '.team-score-boys';
    var card = document.querySelector(selector);
    if (!card) return;

    var rect = card.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;

    var colors = team === 'girls'
      ? ['#ff4f9a', '#ff83bd', '#ffd36e', '#ffffff']
      : ['#35e6f7', '#5de2ff', '#ffd36e', '#ffffff'];

    for (var i = 0; i < 18; i++) {
      var bit = document.createElement('i');
      bit.className = 'fx-point-bit';
      bit.style.left = cx + 'px';
      bit.style.top = cy + 'px';
      bit.style.background = colors[i % colors.length];
      document.body.appendChild(bit);

      var angle = Math.random() * Math.PI * 2;
      var dist = 55 + Math.random() * 95;
      var dx = Math.cos(angle) * dist;
      var dy = Math.sin(angle) * dist - 35;
      var rot = Math.random() * 720 - 360;

      if (bit.animate) {
        bit.animate([
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(.22) rotate(' + rot + 'deg)', opacity: 0 }
        ], {
          duration: 720 + Math.random() * 320,
          easing: 'cubic-bezier(.2,.7,.3,1)'
        }).onfinish = (function (b) { return function () { b.remove(); }; })(bit);
      } else {
        setTimeout((function (b) { return function () { b.remove(); }; })(bit), 900);
      }
    }
  }

  function hookApplyPoint() {
    if (typeof window.applyPoint !== 'function') return;
    var original = window.applyPoint;
    window.applyPoint = function (team, points) {
      var result = original.call(this, team, points);
      burstAt(team);
      return result;
    };
  }

  /* ─── 4 & 5) صور الكابتن والفائز للبنات/الشباب ─── */
  function patchCaptainReveal() {
    if (typeof window.showCaptainReveal !== 'function') return;
    var original = window.showCaptainReveal;
    window.showCaptainReveal = function (name, team) {
      // استدعاء الأصلي أولاً لبناء الهيكل
      original.call(this, name, team);
      // ثم حقن الصورة الصحيحة خلف الاسم
      var overlay = document.getElementById('captainRevealOverlay');
      if (!overlay) return;
      var imgSrc = team === 'girls' ? GIRLS_IMG : BOYS_IMG;
      var existing = overlay.querySelector('.fx-captain-img');
      if (existing) existing.remove();
      var img = document.createElement('img');
      img.className = 'fx-captain-img';
      img.src = imgSrc;
      img.alt = '';
      overlay.insertBefore(img, overlay.firstChild);
    };
  }

  function patchWinnerImage() {
    if (typeof window.showResults !== 'function') return;
    var original = window.showResults;
    window.showResults = function () {
      original.call(this);
      var winnerText = document.getElementById('winnerText');
      if (!winnerText) return;
      var hero = winnerText.closest('.results-hero');
      if (!hero) return;
      var orbit = hero.querySelector('.winner-orbit img');
      if (!orbit) return;
      if (/البنات/.test(winnerText.textContent)) orbit.src = GIRLS_IMG;
      else if (/الشباب/.test(winnerText.textContent)) orbit.src = BOYS_IMG;
    };
  }

  ready(function () {
    watchScreens();
    patchGiftImages();
    hookApplyPoint();
    patchCaptainReveal();
    patchWinnerImage();
  });
})();
