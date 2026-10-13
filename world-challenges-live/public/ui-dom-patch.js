/* ═══ UI DOM Patch: تنظيف قائمة الموسيقى + المؤقت + الهدايا + نص الكباتن ═══ */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function setGift(btn, cfg) {
    btn.innerHTML = '';

    const img = document.createElement('img');
    img.className = 'gift-img';
    img.alt = btn.dataset.gift || 'هدية';
    img.src = cfg.img;

    if (cfg.fallback) {
      img.addEventListener('error', function () {
        img.src = cfg.fallback;
      }, { once: true });
    }

    btn.appendChild(img);

    if (cfg.label) {
      const label = document.createElement('span');
      label.className = 'gift-name';
      label.textContent = cfg.label;
      btn.appendChild(label);
    }

    if (cfg.small) {
      const small = document.createElement('small');
      small.textContent = cfg.small;
      btn.appendChild(small);
    }
  }

  function patch() {
    // 1) حذف قائمة الموسيقى العائمة ولوحة المؤثرات وأسفل النتائج
    document.querySelectorAll('.floating-sound-controls, .floating-soundboard-panel, .soundboard')
      .forEach(function (el) { el.remove(); });

    // 2) حذف نص دخول المواجهة والكباتن من شاشة الأسئلة
    document.querySelectorAll('.captain-command .command-heading')
      .forEach(function (el) { el.remove(); });

    // 3) ضبط مؤقت صفحة البداية على 20 / 30 / 40
    const timerRow = Array.from(document.querySelectorAll('.option-row'))
      .find(function (row) { return /وقت الإجابة/.test(row.textContent); });

    if (timerRow) {
      const group = timerRow.querySelector('.pill-group');
      if (group) {
        group.innerHTML = '';
        ['20', '30', '40'].forEach(function (value) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'pill' + (value === '30' ? ' is-active' : '');
          button.dataset.timer = value;
          button.textContent = value + ' ث';
          group.appendChild(button);
        });
      }
    }

    // 4) إعادة بناء أزرار الهدايا بالصور المطلوبة بدون كلمات وردة/TikTok
    const configs = {
      rose: {
        img: '/images/gift-rose.png',
        small: '−1 شباب'
      },
      donut: {
        img: '/images/gift-donut.png',
        small: '+1 جولة'
      },
      corgi: {
        img: '/images/gift-corgi.png',
        small: '+10 جولات'
      },
      heart: {
        img: '/images/gift-heart.png',
        label: 'درع الحماية',
        small: 'حماية الفريق'
      },
      galaxy: {
        img: '/images/gift-galaxy.png',
        small: '+50 جولة'
      },
      wheel: {
        img: '/images/gift-whale.png',
        fallback: '/images/gift-wheel.png',
        small: '+100 جولة'
      },
      tiktok: {
        img: '/images/gift-tiktok.png',
        small: '−1 بنات'
      },
      cat: {
        img: '/images/gift-cat.png',
        small: '+1 جولة'
      },
      crown: {
        img: '/images/gift-crown.png',
        small: '+10 جولات'
      }
    };

    document.querySelectorAll('.gift-button').forEach(function (btn) {
      const cfg = configs[btn.dataset.gift];
      if (cfg) setGift(btn, cfg);
    });
  }

  ready(patch);
})();
