(function () {
  'use strict';

  if (window.__AX_V2__) return;
  window.__AX_V2__ = true;

  const CONFIG = {
    giftGoalMax: 20,
    speedQuestions: 3,
    wheelSpinMs: 5000,
    captainCardReset: 'round',
    sounds: {
      speed: ['speed', 'boom'],
      card: ['card', 'teamwork'],
      wheel: ['wheel', 'celebration']
    }
  };

  const AX = {
    speedLeft: 0,
    pendingBlockTeam: null,
    blockedTeam: null,
    pendingX2: false,
    activeX2: false,
    pendingX3: false,
    activeX3: false,
    giftGoal: { girls: 0, boys: 0 },
    captainUsed: { girls: {}, boys: {} },
    wheelBusy: false,
    patched: false
  };

  window.AX = AX;

  function $(id) {
    return document.getElementById(id);
  }

  function $$(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  function esc(value) {
    return String(value || '').replace(/[&<>"']/g, function (ch) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[ch];
    });
  }

  function isTeam(team) {
    return team === 'girls' || team === 'boys';
  }

  function teamLabel(team) {
    if (team === 'girls') return 'البنات';
    if (team === 'boys') return 'الشباب';
    return '';
  }

  function oppositeTeam(team) {
    return team === 'girls' ? 'boys' : 'girls';
  }

  function getState() {
    return window.state || null;
  }

  function callGlobal(name, args) {
    try {
      const fn = window[name];
      if (typeof fn === 'function') {
        return fn.apply(null, args || []);
      }
    } catch (e) {}
  }

  function playSoundSafe(key, volume) {
    callGlobal('playSound', [key, volume == null ? 0.7 : volume]);
  }

  function toastSafe(message, kicker) {
    callGlobal('showToast', [message, kicker || 'ARENA']);
  }

  function updateScoresSafe() {
    callGlobal('updateScores', []);
  }

  function ensureSoundFiles() {
    try {
      if (window.soundFiles) {
        window.soundFiles.speed = CONFIG.sounds.speed;
        window.soundFiles.card = CONFIG.sounds.card;
        window.soundFiles.wheel = CONFIG.sounds.wheel;
      }
    } catch (e) {}
  }

  function removeOverlay(id) {
    const el = $(id);
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  function createOverlay(id, className, html, autoCloseMs) {
    removeOverlay(id);

    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.className = 'ax-overlay ' + className;
    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) {
        removeOverlay(id);
      }
    });

    if (autoCloseMs) {
      setTimeout(function () {
        removeOverlay(id);
      }, autoCloseMs);
    }

    return overlay;
  }

  function miniConfetti() {
    let host = $('axConfettiHost');

    if (!host) {
      host = document.createElement('div');
      host.id = 'axConfettiHost';
      document.body.appendChild(host);
    }

    const colors = ['#ff4f9a', '#35e6f7', '#ffd36e', '#ffffff', '#917aff', '#64ecad'];

    for (let i = 0; i < 34; i += 1) {
      const bit = document.createElement('i');
      bit.className = 'ax-bit';
      bit.style.left = (Math.random() * 100) + '%';
      bit.style.top = (14 + Math.random() * 66) + '%';
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = (Math.random() * 0.28) + 's';
      bit.style.animationDuration = (0.85 + Math.random() * 0.75) + 's';
      host.appendChild(bit);

      (function (node) {
        setTimeout(function () {
          if (node && node.parentNode) {
            node.parentNode.removeChild(node);
          }
        }, 1650);
      })(bit);
    }
  }

  function confettiSafe() {
    callGlobal('fireConfetti', []);
    miniConfetti();
  }

  function ensureBadge(id, className) {
    let el = $(id);

    if (el) return el;

    const host = document.querySelector('.question-card') || document.body;
    el = document.createElement('div');
    el.id = id;
    el.className = 'ax-badge ' + className;
    host.appendChild(el);

    return el;
  }

  function updateBadges() {
    const speedBadge = ensureBadge('axSpeedBadge', 'ax-speed-badge');
    const hasSpeed = AX.speedLeft > 0;

    speedBadge.classList.toggle('hidden', !hasSpeed);
    if (hasSpeed) {
      speedBadge.textContent = '⚡ جولة السرعة — متبقي ' + AX.speedLeft;
    }

    const blockBadge = ensureBadge('axBlockBadge', 'ax-block-badge');
    const hasBlock = Boolean(AX.blockedTeam);

    blockBadge.classList.toggle('hidden', !hasBlock);
    if (hasBlock) {
      blockBadge.textContent = '🟨 ممنوع ' + teamLabel(AX.blockedTeam) + ' من السؤال الحالي';
    }

    const multBadge = ensureBadge('axMultBadge', 'ax-mult-badge');
    const multParts = [];

    if (AX.activeX2) multParts.push('×2');
    if (AX.activeX3) multParts.push('×3');

    multBadge.classList.toggle('hidden', multParts.length === 0);
    if (multParts.length) {
      multBadge.textContent = '✦ ' + multParts.join(' + ');
    }
  }

  function getDock(id, className, afterSelector) {
    let el = $(id);
    if (el) return el;

    const anchor = document.querySelector(afterSelector);
    const parent = anchor && anchor.parentNode ? anchor.parentNode : document.body;

    el = document.createElement('div');
    el.id = id;
    el.className = className;

    if (anchor && anchor.parentNode) {
      parent.insertBefore(el, anchor.nextSibling);
    } else {
      parent.appendChild(el);
    }

    return el;
  }

  function actionHost() {
    const existing = document.querySelector('.show-actions');
    if (existing) return existing;

    return getDock('axActionDock', 'ax-action-dock', '.score-strip');
  }

  function installActionButton(id, text, className, handler) {
    const host = actionHost();
    if (!host || $(id)) return;

    const button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.className = 'ax-btn ' + className;
    button.textContent = text;
    button.addEventListener('click', handler);

    host.appendChild(button);
  }

  /* ═══ 1) جولة السرعة ═══ */

  function startSpeedRound() {
    AX.speedLeft = CONFIG.speedQuestions;

    createOverlay(
      'axSpeedOverlay',
      'ax-speed-overlay',
      '<div class="ax-modal ax-speed-modal">' +
        '<h2>جولة السرعة</h2>' +
        '<p>' + CONFIG.speedQuestions + ' أسئلة</p>' +
      '</div>',
      2600
    );

    confettiSafe();
    playSoundSafe('speed', 0.85);
    toastSafe('جولة السرعة بدأت — ' + CONFIG.speedQuestions + ' أسئلة', 'SPEED');
    updateBadges();
  }

  /* ═══ 2) هدف الهدايا الجماعي ═══ */

  function updateGiftUI() {
    const girlsValue = AX.giftGoal.girls || 0;
    const boysValue = AX.giftGoal.boys || 0;

    const girlsFill = $('axGoalGirlsFill');
    const girlsCount = $('axGoalGirlsNum');
    const boysFill = $('axGoalBoysFill');
    const boysCount = $('axGoalBoysNum');

    if (girlsFill) girlsFill.style.height = ((girlsValue / CONFIG.giftGoalMax) * 100) + '%';
    if (girlsCount) girlsCount.textContent = String(girlsValue);

    if (boysFill) boysFill.style.height = ((boysValue / CONFIG.giftGoalMax) * 100) + '%';
    if (boysCount) boysCount.textContent = String(boysValue);
  }

  function installGiftDock() {
    if ($('axGiftDock')) return;

    const anchor =
      document.querySelector('.gift-stage') ||
      document.querySelector('.gift-buttons') ||
      document.querySelector('.score-strip');

    const parent = anchor && anchor.parentNode ? anchor.parentNode : document.body;

    const dock = document.createElement('div');
    dock.id = 'axGiftDock';
    dock.className = 'ax-gift-dock';

    dock.innerHTML =
      '<div class="ax-goal ax-goal-girls">' +
        '<div class="ax-goal-track"><i id="axGoalGirlsFill"></i></div>' +
        '<div class="ax-goal-count"><span id="axGoalGirlsNum">0</span>/' + CONFIG.giftGoalMax + '</div>' +
        '<button id="axGoalGirlsBtn" type="button" class="ax-goal-btn">🌹👧</button>' +
      '</div>' +
      '<div class="ax-goal ax-goal-boys">' +
        '<div class="ax-goal-track"><i id="axGoalBoysFill"></i></div>' +
        '<div class="ax-goal-count"><span id="axGoalBoysNum">0</span>/' + CONFIG.giftGoalMax + '</div>' +
        '<button id="axGoalBoysBtn" type="button" class="ax-goal-btn">🌹👦</button>' +
      '</div>';

    if (anchor && anchor.parentNode) {
      parent.insertBefore(dock, anchor);
    } else {
      parent.appendChild(dock);
    }

    const girlsButton = $('axGoalGirlsBtn');
    const boysButton = $('axGoalBoysBtn');

    if (girlsButton) {
      girlsButton.addEventListener('click', function () {
        addGift('girls', 1);
      });
    }

    if (boysButton) {
      boysButton.addEventListener('click', function () {
        addGift('boys', 1);
      });
    }

    updateGiftUI();
  }

  function addGift(team, amount) {
    if (!isTeam(team)) return;

    const increment = Math.max(1, Number(amount) || 1);
    AX.giftGoal[team] = Math.min(CONFIG.giftGoalMax, (AX.giftGoal[team] || 0) + increment);

    updateGiftUI();
    playSoundSafe('tick', 0.28);

    if (AX.giftGoal[team] >= CONFIG.giftGoalMax) {
      AX.giftGoal[team] = 0;
      AX.pendingX2 = true;

      updateGiftUI();
      updateBadges();

      createOverlay(
        'axGiftGoalOverlay',
        'ax-gift-overlay',
        '<div class="ax-modal">' +
          '<div class="ax-emoji">🎁</div>' +
          '<h2>الهدف اكتمل</h2>' +
          '<p>السؤال القادم ×2 — فريق ' + esc(teamLabel(team)) + '</p>' +
          '<button type="button" class="ax-close-btn" id="axGiftClose">إغلاق</button>' +
        '</div>',
        3200
      );

      const close = $('axGiftClose');
      if (close) {
        close.addEventListener('click', function () {
          removeOverlay('axGiftGoalOverlay');
        });
      }

      confettiSafe();
      playSoundSafe('celebration', 0.8);
      toastSafe('هدف 20 وردة اكتمل — السؤال القادم ×2', 'GIFT GOAL');
    }
  }

  /* ═══ 3) الكارت الأصفر للكباتن ═══ */

  function detectCaptainTeam(slot, input) {
    if (input) {
      const direct = input.getAttribute('data-team');
      if (direct) return direct;

      const teamHost = input.closest('[data-team]');
      if (teamHost) return teamHost.getAttribute('data-team');
    }

    if (slot.closest('.team-score-girls, .captain-girls, .girls, [data-team="girls"]')) {
      return 'girls';
    }

    if (slot.closest('.team-score-boys, .captain-boys, .boys, [data-team="boys"]')) {
      return 'boys';
    }

    return null;
  }

  function refreshCaptainButtons() {
    $$('.ax-captain-btn').forEach(function (button) {
      const key = button.dataset.axKey || '';
      const parts = key.split(':');
      const team = parts[0];
      const slot = parts[1];
      const used = team && slot && AX.captainUsed[team] && AX.captainUsed[team][slot];

      button.disabled = Boolean(used);
      button.classList.toggle('used', Boolean(used));
    });
  }

  function installCaptainCards() {
    const slots = $$('.captain-slot');
    if (!slots.length) return;

    slots.forEach(function (slot) {
      if (slot.querySelector('.ax-captain-btn')) return;

      const input = slot.querySelector('.captain-input') || slot.querySelector('input');
      const team = detectCaptainTeam(slot, input);
      if (!team) return;

      const slotIndex =
        (input && input.getAttribute('data-slot')) ||
        String(Array.prototype.indexOf.call(slot.parentNode.children, slot));

      const key = team + ':' + slotIndex;
      const used = AX.captainUsed[team] && AX.captainUsed[team][slotIndex];

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ax-captain-btn';
      button.dataset.axKey = key;
      button.textContent = '🟨 مساعدة';
      button.disabled = Boolean(used);
      button.classList.toggle('used', Boolean(used));

      button.addEventListener('click', function () {
        useCaptainCard(team, slotIndex, input ? input.value.trim() : '', button);
      });

      slot.appendChild(button);
    });
  }

  function useCaptainCard(team, slotIndex, captainName, button) {
    if (!AX.captainUsed[team]) {
      AX.captainUsed[team] = {};
    }

    if (AX.captainUsed[team][slotIndex]) {
      toastSafe('هذا الكابتن استخدم الكارت الأصفر بالفعل', 'YELLOW CARD');
      return;
    }

    AX.captainUsed[team][slotIndex] = true;

    if (button) {
      button.disabled = true;
      button.classList.add('used');
    }

    const blocked = oppositeTeam(team);
    AX.pendingBlockTeam = blocked;

    createOverlay(
      'axCaptainCardOverlay',
      'ax-captain-overlay',
      '<div class="ax-modal ax-yellow-modal">' +
        '<h3>' + esc(captainName || ('كابتن ' + teamLabel(team))) + '</h3>' +
        '<div class="ax-yellow-icon">🟨</div>' +
        '<p>ممنوع ' + esc(teamLabel(blocked)) + ' من السؤال القادم</p>' +
        '<button type="button" class="ax-close-btn" id="axCaptainCardClose">إغلاق</button>' +
      '</div>',
      4200
    );

    const close = $('axCaptainCardClose');
    if (close) {
      close.addEventListener('click', function () {
        removeOverlay('axCaptainCardOverlay');
      });
    }

    confettiSafe();
    playSoundSafe('card', 0.85);
    toastSafe('كارت أصفر على ' + teamLabel(blocked), 'YELLOW CARD');
    updateBadges();
  }

  /* ═══ 4) عجلة الحظ ═══ */

  function swapPoints() {
    const st = getState();
    if (!st) return;

    const girls = Number(st.girlsScore) || 0;
    const boys = Number(st.boysScore) || 0;

    st.girlsScore = boys;
    st.boysScore = girls;

    updateScoresSafe();
    toastSafe('تم تبديل النقاط', 'WHEEL');
  }

  function snatchAndRun() {
    const st = getState();
    if (!st) return;

    let girls = Number(st.girlsScore) || 0;
    let boys = Number(st.boysScore) || 0;

    if (girls === boys) {
      if (Math.random() < 0.5) {
        st.girlsScore = Math.max(0, girls - 1);
        st.boysScore = Math.min(5, boys + 1);
      } else {
        st.boysScore = Math.max(0, boys - 1);
        st.girlsScore = Math.min(5, girls + 1);
      }
    } else if (girls > boys) {
      st.girlsScore = Math.max(0, girls - 1);
      st.boysScore = Math.min(5, boys + 1);
    } else {
      st.boysScore = Math.max(0, boys - 1);
      st.girlsScore = Math.min(5, girls + 1);
    }

    updateScoresSafe();
    toastSafe('اخطف واجري — تحركت نقطة', 'WHEEL');
  }

  const WHEEL_RESULTS = [
    {
      id: 'x3',
      title: 'الدعم X3',
      desc: 'نقاط السؤال القادم ×3',
      sound: 'fight',
      apply: function () {
        AX.pendingX3 = true;
        updateBadges();
        toastSafe('الدعم X3 جاهز للسؤال القادم', 'WHEEL');
      }
    },
    {
      id: 'swap',
      title: 'تبديل نقاط',
      desc: 'تم تبديل نقاط البنات والشباب',
      sound: 'days',
      apply: swapPoints
    },
    {
      id: 'yellow',
      title: 'كارت أصفر',
      desc: 'اختر الفريق الذي سيُحظر في السؤال القادم',
      sound: 'teamwork',
      apply: null
    },
    {
      id: 'x2',
      title: 'السؤال التالي X2',
      desc: 'مضاعفة نقاط السؤال القادم',
      sound: 'advice',
      apply: function () {
        AX.pendingX2 = true;
        updateBadges();
        toastSafe('السؤال القادم ×2', 'WHEEL');
      }
    },
    {
      id: 'snatch',
      title: 'اخطف واجري',
      desc: 'نقل نقطة من المتصدر إلى الفريق الآخر',
      sound: 'boom',
      apply: snatchAndRun
    }
  ];

  WHEEL_RESULTS.forEach(function (result, index) {
    result.index = index;
  });

  function openWheel() {
    if (AX.wheelBusy || $('axWheelOverlay')) return;

    AX.wheelBusy = true;

    const result = WHEEL_RESULTS[Math.floor(Math.random() * WHEEL_RESULTS.length)];
    const segment = 360 / WHEEL_RESULTS.length;
    const colors = ['#ff4f9a', '#35e6f7', '#ffd36e', '#917aff', '#64ecad'];

    const stops = WHEEL_RESULTS.map(function (item, index) {
      const start = index * segment;
      const end = (index + 1) * segment;
      return colors[index % colors.length] + ' ' + start + 'deg ' + end + 'deg';
    }).join(', ');

    const legend = WHEEL_RESULTS.map(function (item) {
      return '<span>' + esc(item.title) + '</span>';
    }).join('');

    const html =
      '<div class="ax-wheel-stage">' +
        '<div class="ax-wheel-pointer">▼</div>' +
        '<div class="ax-wheel" id="axWheel" style="background: conic-gradient(from 0deg, ' + stops + ')">' +
          '<div class="ax-wheel-hub">🎡</div>' +
        '</div>' +
        '<div class="ax-wheel-legend">' + legend + '</div>' +
        '<div class="ax-wheel-result hidden" id="axWheelResult"></div>' +
      '</div>';

    createOverlay('axWheelOverlay', 'ax-wheel-overlay', html);

    const wheel = $('axWheel');
    const targetRotation = (5 * 360) - ((result.index * segment) + (segment / 2));

    requestAnimationFrame(function () {
      wheel.style.transition = 'transform ' + CONFIG.wheelSpinMs + 'ms cubic-bezier(.12,.78,.18,1)';
      wheel.style.transform = 'rotate(' + targetRotation + 'deg)';
    });

    setTimeout(function () {
      showWheelResult(result);
      AX.wheelBusy = false;
    }, CONFIG.wheelSpinMs + 180);
  }

  function showWheelResult(result) {
    const box = $('axWheelResult');
    if (!box) return;

    box.classList.remove('hidden');

    let inner =
      '<strong>' + esc(result.title) + '</strong>' +
      '<span>' + esc(result.desc) + '</span>';

    if (result.id === 'yellow') {
      inner +=
        '<div class="ax-yellow-choice">' +
          '<button type="button" id="axYCGirls" class="ax-yc-btn ax-yc-girls">👧 البنات</button>' +
          '<button type="button" id="axYCBoys" class="ax-yc-btn ax-yc-boys">👦 الشباب</button>' +
        '</div>';
    } else {
      inner += '<button type="button" class="ax-close-btn" id="axWheelClose">إغلاق</button>';
    }

    box.innerHTML = inner;

    if (result.id === 'yellow') {
      const girlsButton = $('axYCGirls');
      const boysButton = $('axYCBoys');

      function chooseBlockedTeam(team) {
        AX.pendingBlockTeam = team;
        updateBadges();

        confettiSafe();
        playSoundSafe('teamwork', 0.85);
        toastSafe('كارت أصفر على ' + teamLabel(team), 'YELLOW CARD');

        removeOverlay('axWheelOverlay');
      }

      if (girlsButton) {
        girlsButton.addEventListener('click', function () {
          chooseBlockedTeam('girls');
        });
      }

      if (boysButton) {
        boysButton.addEventListener('click', function () {
          chooseBlockedTeam('boys');
        });
      }

      return;
    }

    if (typeof result.apply === 'function') {
      result.apply();
    }

    playSoundSafe(result.sound, 0.85);
    confettiSafe();

    const close = $('axWheelClose');
    if (close) {
      close.addEventListener('click', function () {
        removeOverlay('axWheelOverlay');
      });
    }
  }

  /* ═══ ربط دورة الحياة بدون كسر app.js ═══ */

  function beginQuestion() {
    AX.blockedTeam = AX.pendingBlockTeam || null;
    AX.pendingBlockTeam = null;

    AX.activeX2 = Boolean(AX.pendingX2);
    AX.pendingX2 = false;

    AX.activeX3 = Boolean(AX.pendingX3);
    AX.pendingX3 = false;

    if (AX.speedLeft > 0) {
      AX.speedLeft -= 1;
    }

    updateBadges();
    updateGiftUI();
  }

  function resetRound() {
    AX.blockedTeam = null;
    AX.pendingBlockTeam = null;

    AX.activeX2 = false;
    AX.pendingX2 = false;

    AX.activeX3 = false;
    AX.pendingX3 = false;

    AX.speedLeft = 0;

    if (CONFIG.captainCardReset === 'round') {
      AX.captainUsed = { girls: {}, boys: {} };
      refreshCaptainButtons();
    }

    updateBadges();
  }

  function resetShow() {
    resetRound();

    AX.giftGoal = { girls: 0, boys: 0 };
    AX.captainUsed = { girls: {}, boys: {} };

    refreshCaptainButtons();
    updateGiftUI();
  }

  function patchLifecycle() {
    if (AX.patched) return;
    AX.patched = true;

    const originalRenderQuestion = window.renderQuestion;

    if (typeof originalRenderQuestion === 'function') {
      window.renderQuestion = function () {
        const result = originalRenderQuestion.apply(this, arguments);

        try {
          beginQuestion();
        } catch (e) {}

        return result;
      };
    }

    const originalApplyPoint = window.applyPoint;

    if (typeof originalApplyPoint === 'function') {
      window.applyPoint = function (team, points) {
        try {
          if (AX.blockedTeam === team) {
            AX.blockedTeam = null;
            updateBadges();

            toastSafe('محظور بالكارت الأصفر — لا نقاط في هذا السؤال', 'YELLOW CARD');
            playSoundSafe('wrong', 0.4);

            return;
          }
        } catch (e) {}

        let finalPoints = Number(points) || 1;

        try {
          if (AX.activeX2) {
            finalPoints = finalPoints * 2;
            AX.activeX2 = false;
            toastSafe('تم تطبيق ×2', 'MULTIPLIER');
          }

          if (AX.activeX3) {
            finalPoints = finalPoints * 3;
            AX.activeX3 = false;
            toastSafe('تم تطبيق ×3', 'MULTIPLIER');
          }

          updateBadges();
        } catch (e) {}

        return originalApplyPoint.apply(this, [team, finalPoints]);
      };
    }

    const originalFinishRound = window.finishRound;

    if (typeof originalFinishRound === 'function') {
      window.finishRound = function () {
        const result = originalFinishRound.apply(this, arguments);

        try {
          resetRound();
        } catch (e) {}

        return result;
      };
    }

    const originalShowResults = window.showResults;

    if (typeof originalShowResults === 'function') {
      window.showResults = function () {
        const result = originalShowResults.apply(this, arguments);

        try {
          resetShow();
        } catch (e) {}

        return result;
      };
    }
  }

  function observeDynamicUI() {
    if (!window.MutationObserver) return;

    let timer = null;

    function schedule() {
      if (timer) clearTimeout(timer);

      timer = setTimeout(function () {
        installCaptainCards();
        refreshCaptainButtons();
        updateGiftUI();
        updateBadges();
      }, 250);
    }

    const observer = new MutationObserver(schedule);

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function initArenaExtras() {
    ensureSoundFiles();

    installActionButton('axSpeedBtn', '⚡ جولة السرعة', 'ax-speed-btn', startSpeedRound);
    installGiftDock();
    installActionButton('axWheelBtn', '🎡 عجلة الحظ', 'ax-wheel-btn', openWheel);
    installCaptainCards();

    patchLifecycle();

    updateBadges();
    updateGiftUI();
    observeDynamicUI();
  }

  window.ArenaExtras = {
    addGift: addGift,
    startSpeedRound: startSpeedRound,
    openWheel: openWheel,
    resetRound: resetRound,
    resetShow: resetShow,
    state: AX,
    config: CONFIG
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initArenaExtras);
  } else {
    initArenaExtras();
  }
})();
