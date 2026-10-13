/* ═══ X2 Patch Layer v1 — Sound Button + Point Confetti + Round Multiplier ═══ */
(function () {
  'use strict';

  /* ─── أدوات مساعدة عامة ─── */
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else setTimeout(fn, 50); // تأخير طفيف لضمان تحميل app.js أولاً
  }

  function esc(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function bits(count, colors) {
    let out = '';
    for (let i = 0; i < count; i++) {
      const left = Math.random() * 100, delay = Math.random() * 1.8, dur = 2.2 + Math.random() * 1.8, sz = 6 + Math.random() * 8;
      out += '<i style="left:' + left + '%;width:' + sz + 'px;height:' + (sz * 1.45) + 'px;background:' + colors[i % colors.length] + ';animation-delay:' + delay + 's;animation-duration:' + dur + 's"></i>';
    }
    return out;
  }

  /* ════════════════════════════════════════════════════════
     1) إظهار زر المؤثرات الصوتية في كل الشاشات (بما فيها النتائج)
     ════════════════════════════════════════════════════════ */
  function ensureSoundButtonVisible() {
    const btn = document.getElementById('floatingSoundBtn');
    if (!btn) return;
    btn.style.display = 'grid';
    btn.style.visibility = 'visible';
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    btn.classList.remove('hidden');
  }

  function watchScreensForSoundBtn() {
    ['setupScreen', 'gameScreen', 'resultsScreen'].forEach(function (id) {
      const el = document.getElementById(id);
      if (!el || !window.MutationObserver) return;
      new MutationObserver(ensureSoundButtonVisible).observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    ensureSoundButtonVisible();
  }

  /* ════════════════════════════════════════════════════════
     2) قصاصات ورق عند إضافة نقطة لأي فريق
     ════════════════════════════════════════════════════════ */
  function burstAt(team) {
    const sel = team === 'girls' ? '.team-score-girls' : '.team-score-boys';
    const card = document.querySelector(sel);
    if (!card || !card.getBoundingClientRect) return;

    const r = card.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const colors = team === 'girls'
      ? ['#ff4f9a', '#ff83bd', '#ffd36e', '#ffffff']
      : ['#35e6f7', '#5de2ff', '#ffd36e', '#ffffff'];

    for (let i = 0; i < 18; i++) {
      const bit = document.createElement('i');
      bit.className = 'point-bit-direct';
      bit.style.left = cx + 'px';
      bit.style.top = cy + 'px';
      bit.style.background = colors[i % colors.length];
      document.body.appendChild(bit);

      const ang = Math.random() * Math.PI * 2, dist = 55 + Math.random() * 95;
      const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 35, rot = Math.random() * 720 - 360;

      if (bit.animate) {
        bit.animate([
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(.22) rotate(' + rot + 'deg)', opacity: 0 }
        ], { duration: 720 + Math.random() * 320, easing: 'cubic-bezier(.2,.7,.3,1)' })
          .onfinish = (function (b) { return function () { b.remove(); }; })(bit);
      } else {
        setTimeout((function (b) { return function () { b.remove(); }; })(bit), 900);
      }
    }
  }

  function hookApplyPoint() {
    if (typeof window.applyPoint !== 'function') return;
    const original = window.applyPoint;
    window.applyPoint = function (team, points) {
      const result = original.call(this, team, points);
      burstAt(team);
      return result;
    };
  }

  /* ════════════════════════════════════════════════════════
     3) زر جولة X2 + نافذة الانتباه بالإضاءة والقصاصات والصوت
     ════════════════════════════════════════════════════════ */
  function createX2Button() {
    if (document.getElementById('x2RoundBtn')) return;
    const deck = document.querySelector('.show-actions') || document.querySelector('.control-deck');
    if (!deck) return;

    const btn = document.createElement('button');
    btn.id = 'x2RoundBtn';
    btn.type = 'button';
    btn.className = 'text-control x2-special-btn';
    btn.innerHTML = '<span>✦</span> جولة X2';
    btn.addEventListener('click', showX2Overlay);
    deck.insertBefore(btn, deck.firstChild);
  }

  function showX2Overlay() {
    let overlay = document.getElementById('x2AttentionOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'x2AttentionOverlay';
      document.body.appendChild(overlay);
    }

    const colors = ['#ffd36e', '#fff0a4', '#ff83bd', '#5de2ff', '#ffffff'];
    overlay.className = 'x2-overlay active';
    overlay.innerHTML =
      '<div class="x2-rays"></div>' +
      '<div class="x2-confetti">' + bits(40, colors) + '</div>' +
      '<div class="x2-card">' +
        '<div class="x2-badge">×2</div>' +
        '<h2>جولة X2</h2>' +
        '<p>جولة لمضاعفة النقاط تؤجل استخدام الدعم</p>' +
        '<button id="x2CloseBtn" type="button">إغلاق</button>' +
      '</div>';

    // مؤثر صوتي للتنبيه والجذب
    if (typeof playSound === 'function') {
      try { playSound('begin', 0.85); } catch (e) {}
      setTimeout(function () { try { playSound('tick', 0.6); } catch (e) {} }, 300);
    }

    const closeBtn = document.getElementById('x2CloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', hideX2Overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) hideX2Overlay(); });

    clearTimeout(showX2Overlay.timeout);
    showX2Overlay.timeout = setTimeout(hideX2Overlay, 6000);
  }

  function hideX2Overlay() {
    const overlay = document.getElementById('x2AttentionOverlay');
    if (!overlay) return;
    overlay.classList.add('out');
    setTimeout(function () { if (overlay && overlay.parentNode) overlay.remove(); }, 700);
  }

  /* ─── التشغيل الرئيسي بعد تحميل app.js ─── */
  ready(function () {
    watchScreensForSoundBtn();
    hookApplyPoint();
    createX2Button();
  });
})();
