/* ═══ UI Function Patch: قصاصات النقاط + أشعة الكابتن + احتفال الفائز + منع end ═══ */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function esc(value) {
    return String(value || '').replace(/[&<>"']/g, function (char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char];
    });
  }

  function bits(count, colors) {
    let output = '';
    for (let i = 0; i < count; i += 1) {
      const left = Math.random() * 100;
      const delay = Math.random() * 1.8;
      const duration = 2.2 + Math.random() * 1.8;
      const size = 6 + Math.random() * 8;
      const color = colors[i % colors.length];
      output += '<i style="left:' + left + '%;width:' + size + 'px;height:' + (size * 1.45) + 'px;background:' + color + ';animation-delay:' + delay + 's;animation-duration:' + duration + 's"></i>';
    }
    return output;
  }

  function burstAt(team) {
    const selector = team === 'girls' ? '.team-score-girls' : '.team-score-boys';
    const card = document.querySelector(selector);
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const colors = team === 'girls'
      ? ['#ff4f9a', '#ff83bd', '#ffd36e', '#ffffff']
      : ['#35e6f7', '#5de2ff', '#ffd36e', '#ffffff'];

    for (let i = 0; i < 18; i += 1) {
      const bit = document.createElement('i');
      bit.className = 'point-bit';
      bit.style.left = centerX + 'px';
      bit.style.top = centerY + 'px';
      bit.style.background = colors[i % colors.length];
      document.body.appendChild(bit);

      const angle = Math.random() * Math.PI * 2;
      const distance = 55 + Math.random() * 95;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance - 35;
      const rot = Math.random() * 720 - 360;

      if (bit.animate) {
        bit.animate([
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(.22) rotate(' + rot + 'deg)', opacity: 0 }
        ], {
          duration: 720 + Math.random() * 320,
          easing: 'cubic-bezier(.2,.7,.3,1)'
        }).onfinish = function () {
          bit.remove();
        };
      } else {
        setTimeout(function () { bit.remove(); }, 900);
      }
    }
  }

  function showCaptainRevealNew(name, team) {
    const overlay = document.getElementById('captainRevealOverlay');
    if (!overlay) return;

    const isGirls = team === 'girls';
    const teamImage = isGirls ? '/images/girl-team.png' : '/images/boy-team.png';
    const colors = isGirls
      ? ['#ff4f9a', '#ff83bd', '#ffd36e', '#ffffff']
      : ['#35e6f7', '#5de2ff', '#ffd36e', '#ffffff'];

    overlay.classList.remove('hidden', 'team-girls', 'team-boys');
    overlay.classList.add(isGirls ? 'team-girls' : 'team-boys');

    overlay.innerHTML =
      '<div class="cr-rays"></div>' +
      '<div class="cr-confetti">' + bits(30, colors) + '</div>' +
      '<div class="cr-card">' +
        '<img class="cr-team-img" src="' + teamImage + '" alt="">' +
        '<span class="captain-reveal-kicker">ON AIR CAPTAIN</span>' +
        '<h2>' + esc(name) + '</h2>' +
      '</div>';

    clearTimeout(showCaptainRevealNew.timeout);
    showCaptainRevealNew.timeout = setTimeout(function () {
      overlay.classList.add('hidden');
    }, 10000);
  }

  function showWinnerLights(team) {
    let overlay = document.getElementById('winnerLightsOverlay');

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'winnerLightsOverlay';
      document.body.appendChild(overlay);
    }

    const isGirls = team === 'girls';
    const isBoys = team === 'boys';
    const teamImage = isGirls
      ? '/images/girl-team.png'
      : isBoys
        ? '/images/boy-team.png'
        : '/images/logo.png';

    const title = isGirls
      ? 'فريق البنات'
      : isBoys
        ? 'فريق الشباب'
        : 'تعادل أبطال الليلة';

    const colors = isGirls
      ? ['#ff4f9a', '#ff83bd', '#ffd36e', '#ffffff']
      : isBoys
        ? ['#35e6f7', '#5de2ff', '#ffd36e', '#ffffff']
        : ['#ffd36e', '#fff0a4', '#ff83bd', '#5de2ff'];

    overlay.className = 'winner-lights ' + (isGirls ? 'girls' : isBoys ? 'boys' : 'draw');
    overlay.innerHTML =
      '<div class="wl-rays"></div>' +
      '<div class="wl-confetti">' + bits(38, colors) + '</div>' +
      '<div class="wl-card">' +
        '<img src="' + teamImage + '" alt="">' +
        '<strong>' + esc(title) + '</strong>' +
        '<span>WINNER NIGHT</span>' +
      '</div>';

    clearTimeout(showWinnerLights.timeout);
    showWinnerLights.timeout = setTimeout(function () {
      overlay.classList.add('out');
      setTimeout(function () {
        if (overlay && overlay.parentNode) overlay.remove();
      }, 700);
    }, 5200);
  }

  function showResultsNew() {
    if (typeof state === 'undefined') return;
    if (typeof stopTimer !== 'function' || typeof showScreen !== 'function') return;

    stopTimer();
    showScreen('resultsScreen');

    const finalGirls = document.getElementById('finalGirlsScore');
    const finalBoys = document.getElementById('finalBoysScore');
    const winnerText = document.getElementById('winnerText');

    if (finalGirls) finalGirls.textContent = state.girlsRounds;
    if (finalBoys) finalBoys.textContent = state.boysRounds;

    let winSound = null;
    let team = null;

    if (state.girlsRounds > state.boysRounds) {
      if (winnerText) {
        winnerText.textContent = 'فريق البنات فاز!';
        winnerText.style.color = 'var(--pink-hot)';
      }
      winSound = 'girls-win';
      team = 'girls';
    } else if (state.boysRounds > state.girlsRounds) {
      if (winnerText) {
        winnerText.textContent = 'فريق الشباب فاز!';
        winnerText.style.color = 'var(--cyan)';
      }
      winSound = 'boys-win';
      team = 'boys';
    } else {
      if (winnerText) {
        winnerText.textContent = 'تعادل أبطال الليلة';
        winnerText.style.color = 'var(--gold-hot)';
      }
      team = 'draw';
    }

    showWinnerLights(team);

    // لا تشغيل لمؤثر end هنا نهائيًا
    if (state.soundEnabled && winSound && typeof playSound === 'function') {
      playSound(winSound, 0.85);
    }

    if (typeof fireConfetti === 'function') fireConfetti();
  }

  ready(function () {
    // تنظيف إضافي بعد تحميل app.js
    document.querySelectorAll('.floating-sound-controls, .floating-soundboard-panel, .soundboard')
      .forEach(function (el) { el.remove(); });

    // استبدال زر إنهاء اللايف لضمان عدم استدعاء الدالة القديمة التي تشغّل end
    const endButton = document.getElementById('endGameBtn');
    if (endButton && endButton.parentNode) {
      const clone = endButton.cloneNode(true);
      endButton.parentNode.replaceChild(clone, endButton);
      clone.addEventListener('click', showResultsNew);
    }

    // قصاصات مع كل نقطة
    if (typeof window.applyPoint === 'function') {
      const originalApplyPoint = window.applyPoint;
      window.applyPoint = function (team, points) {
        const result = originalApplyPoint.call(this, team, points);
        burstAt(team);
        return result;
      };
    }

    // ظهور الكابتن بالأشعة والقصاصات وصورة الفريق
    if (typeof window.showCaptainReveal === 'function') {
      window.showCaptainReveal = showCaptainRevealNew;
    }

    // احتفاظ بمرجع عام للدالة الجديدة لو نودي عليها من مكان آخر
    if (typeof window.showResults === 'function') {
      window.showResults = showResultsNew;
    }
  });
})();
