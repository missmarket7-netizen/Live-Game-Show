(function () {
  'use strict';

  if (window.__AX_V4__) return;
  window.__AX_V4__ = true;

  var CONFIG = {
    giftGoalMax: 20,
    speedQuestions: 3,
    wheelSpinMs: 5000,
    sounds: {
      speed: ['speed', 'boom'],
      card: ['card', 'teamwork'],
      wheel: ['wheel', 'celebration']
    }
  };

  var AX = {
    speedLeft: 0,
    pendingBlockTeam: null,
    blockedTeam: null,
    pendingX2: false,
    activeX2: false,
    pendingX3: false,
    activeX3: false,
    giftGoal: {
      girls: 0,
      boys: 0
    },
    captainUsed: {
      girls: {},
      boys: {}
    },
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
    if (window.state) return window.state;
    try {
      if (typeof state !== 'undefined') return state;
    } catch (e) {}
    return null;
  }

  function callGlobal(name, args) {
    try {
      var fn = window[name];
      if (typeof fn === 'function') {
        return fn.apply(null, args || []);
      }
    } catch (e) {}
    return null;
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
      if (typeof soundFiles !== 'undefined' && soundFiles) {
        soundFiles.speed = CONFIG.sounds.speed;
        soundFiles.card = CONFIG.sounds.card;
        soundFiles.wheel = CONFIG.sounds.wheel;
      }
    } catch (e) {}
  }

  function removeOverlay(id) {
    var el = $(id);
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  function createOverlay(id, className, html, autoCloseMs) {
    removeOverlay(id);

    var overlay = document.createElement('div');
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
    var host = $('axConfettiHost');

    if (!host) {
      host = document.createElement('div');
      host.id = 'axConfettiHost';
      document.body.appendChild(host);
    }

    var colors = ['#ff4f9a', '#35e6f7', '#ffd36e', '#ffffff', '#917aff', '#64ecad'];

    for (var i = 0; i < 36; i += 1) {
      var bit = document.createElement('i');
      bit.className = 'ax-bit';
      bit.style.left = (Math.random() * 100) + '%';
      bit.style.top = (12 + Math.random() * 68) + '%';
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = (Math.random() * 0.28) + 's';
      bit.style.animationDuration = (0.85 + Math.random() * 0.8) + 's';
      host.appendChild(bit);

      (function (node) {
        setTimeout(function () {
          if (node && node.parentNode) {
            node.parentNode.removeChild(node);
          }
        }, 1700);
      })(bit);
    }
  }

  function confettiSafe() {
    callGlobal('fireConfetti', []);
    miniConfetti();
  }

  function ensureBadge(id, className) {
    var el = $(id);
    if (el) return el;

    var host = document.querySelector('.question-card') || document.body;
    el = document.createElement('div');
    el.id = id;
    el.className = 'ax-badge ' + className;
    host.appendChild(el);

    return el;
  }

  function updateBadges() {
    var speedBadge = ensureBadge('axSpeedBadge', 'ax-speed-badge');
    var hasSpeed = AX.speedLeft > 0;

    speedBadge.classList.toggle('hidden', !hasSpeed);
    if (hasSpeed) {
      speedBadge.textContent = '⚡ جولة السرعة — متبقي ' + AX.speedLeft;
    }

    var blockBadge = ensureBadge('axBlockBadge', 'ax-block-badge');
    var hasBlock = Boolean(AX.blockedTeam);

    blockBadge.classList.toggle('hidden', !hasBlock);
    if (hasBlock) {
      blockBadge.textContent = '🟨 ممنوع ' + teamLabel(AX.blockedTeam) + ' من السؤال الحالي';
    }

    var multBadge = ensureBadge('axMultBadge', 'ax-mult-badge');
    var multParts = [];

    if (AX.activeX2) multParts.push('×2');
    if (AX.activeX3) multParts.push('×3');

    multBadge.classList.toggle('hidden', multParts.length === 0);
    if (multParts.length) {
      multBadge.textContent = '✦ ' + multParts.join(' + ');
    }
  }

  function actionHost() {
    return (
      document.querySelector('.show-actions') ||
      document.querySelector('.control-deck') ||
      document.querySelector('.game-footer') ||
      document.body
    );
  }

  function installActionButton(id, text, className, handler) {
    var host = actionHost();
    if (!host || $(id)) return;

    var button = document.createElement('button');
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

  function installSpeedButton() {
    installActionButton('axSpeedBtn', '⚡ جولة السرعة', 'ax-speed-btn', startSpeedRound);
  }

  /* ═══ 2) هدف الهدايا الجماعي — يمين البنات ويسار الشباب ═══ */

  function updateGiftUI() {
  var girlsValue = AX.giftGoal.girls || 0;
  var boysValue = AX.giftGoal.boys || 0;
  var max = CONFIG.giftGoalMax || 20;

  function setFill(fillEl, value) {
    if (!fillEl) return;

    var numericValue = Number(value) || 0;
    var pct = Math.max(0, Math.min(100, (numericValue / max) * 100));

    fillEl.style.setProperty('--ax-fill-height', pct + '%');
    fillEl.style.height = pct + '%';

    var track = fillEl.parentElement;
    if (track) {
      track.classList.toggle('ax-goal-full', pct >= 100);
    }
  }

  setFill($('axGoalGirlsFill'), girlsValue);
  setFill($('axGoalBoysFill'), boysValue);

  var girlsCount = $('axGoalGirlsNum');
  var boysCount = $('axGoalBoysNum');

  if (girlsCount) girlsCount.textContent = String(girlsValue);
  if (boysCount) boysCount.textContent = String(boysValue);
}



  function setGiftSidesVisible() {
    var gameScreen = $('gameScreen');
    var visible = Boolean(gameScreen && !gameScreen.classList.contains('hidden'));

    var girlsSide = $('axGiftGirlsSide');
    var boysSide = $('axGiftBoysSide');

    if (girlsSide) girlsSide.classList.toggle('ax-off', !visible);
    if (boysSide) boysSide.classList.toggle('ax-off', !visible);
  }

  function installGiftSides() {
    if ($('axGiftGirlsSide') && $('axGiftBoysSide')) {
      updateGiftUI();
      setGiftSidesVisible();
      return;
    }

    var girls = document.createElement('div');
    girls.id = 'axGiftGirlsSide';
    girls.className = 'ax-gift-side ax-gift-side-girls ax-off';
    girls.innerHTML =
      '<div class="ax-goal-track"><i id="axGoalGirlsFill"></i></div>' +
      '<div class="ax-goal-count"><span id="axGoalGirlsNum">0</span>/' + CONFIG.giftGoalMax + '</div>' +
      '<button id="axGoalGirlsBtn" type="button" class="ax-goal-btn" aria-label="هدف هدايا البنات">🌹👧</button>';

    var boys = document.createElement('div');
    boys.id = 'axGiftBoysSide';
    boys.className = 'ax-gift-side ax-gift-side-boys ax-off';
    boys.innerHTML =
      '<div class="ax-goal-track"><i id="axGoalBoysFill"></i></div>' +
      '<div class="ax-goal-count"><span id="axGoalBoysNum">0</span>/' + CONFIG.giftGoalMax + '</div>' +
      '<button id="axGoalBoysBtn" type="button" class="ax-goal-btn" aria-label="هدف هدايا الشباب">🌹👦</button>';

    document.body.appendChild(girls);
    document.body.appendChild(boys);

    var girlsButton = $('axGoalGirlsBtn');
    var boysButton = $('axGoalBoysBtn');

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
    setGiftSidesVisible();
  }

  function addGift(team, amount) {
    if (!isTeam(team)) return;

    var increment = Math.max(1, Number(amount) || 1);
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

      var close = $('axGiftClose');
      if (close) {
        close.addEventListener('click', function () {
          removeOverlay('axGiftGoalOverlay');
        });
      }

      confettiSafe();
      playSoundSafe('advice', 0.82);
      toastSafe('هدف 20 وردة اكتمل — السؤال القادم ×2', 'GIFT GOAL');
    }
  }

  /* ═══ 3) كارت أصفر للكباتن — بجانب زر done فقط ═══ */

  function detectCaptainTeam(slot, input) {
    if (input && input.dataset && input.dataset.team) {
      return input.dataset.team;
    }

    if (input) {
      var teamHost = input.closest('[data-team]');
      if (teamHost) return teamHost.getAttribute('data-team');
    }

    if (slot) {
      if (slot.closest('.girls, .team-girls, .captain-girls, [data-team="girls"]')) {
        return 'girls';
      }

      if (slot.closest('.boys, .team-boys, .captain-boys, [data-team="boys"]')) {
        return 'boys';
      }
    }

    return null;
  }

  function getCaptainSlotIndex(input, slot, team) {
    if (input && input.dataset && input.dataset.slot) {
      return input.dataset.slot;
    }

    if (input && team) {
      var list = $$('.captain-input[data-team="' + team + '"]');
      var idx = list.indexOf(input);
      if (idx >= 0) return String(idx);
    }

    if (slot && slot.parentNode) {
      var kids = Array.prototype.slice.call(slot.parentNode.children);
      var idx2 = kids.indexOf(slot);
      if (idx2 >= 0) return String(idx2);
    }

    return '0';
  }

  function refreshCaptainButtons() {
    $$('.ax-captain-btn').forEach(function (button) {
      var key = button.getAttribute('data-ax-key') || '';
      var parts = key.split(':');
      var team = parts[0];
      var slot = parts[1];
      var used = team && slot && AX.captainUsed[team] && AX.captainUsed[team][slot];

      button.disabled = Boolean(used);
      button.classList.toggle('used', Boolean(used));
    });
  }

  function installCaptainCards() {
    var slots = $$('.captain-slot');

    if (!slots.length) {
      slots = $$('.captain-input').map(function (input) {
        return input.parentElement;
      }).filter(Boolean);
    }

    var seen = [];

    slots.forEach(function (slot) {
      if (!slot || seen.indexOf(slot) !== -1) return;
      seen.push(slot);

      if (slot.querySelector('.ax-captain-btn')) return;

      var input = slot.querySelector('.captain-input') || slot.querySelector('input');
      var team = detectCaptainTeam(slot, input);
      if (!team) return;

      var slotIndex = getCaptainSlotIndex(input, slot, team);
      var key = team + ':' + slotIndex;
      var used = AX.captainUsed[team] && AX.captainUsed[team][slotIndex];

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'ax-captain-btn';
      button.setAttribute('data-ax-key', key);
      button.textContent = '🟨';
      button.title = 'كارت أصفر';
      button.disabled = Boolean(used);
      button.classList.toggle('used', Boolean(used));

      var doneButton = slot.querySelector('.captain-done');

      if (doneButton && doneButton.parentNode) {
        doneButton.parentNode.insertBefore(button, doneButton.nextSibling);
      } else {
        slot.appendChild(button);
      }

      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        useCaptainCard(team, slotIndex, input ? input.value.trim() : '', button);
      });
    });

    refreshCaptainButtons();
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

    var blocked = oppositeTeam(team);
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

    var close = $('axCaptainCardClose');
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

  function clampScore(value) {
    return Math.max(-5, Math.min(5, Number(value) || 0));
  }

  function swapPoints() {
    var st = getState();
    if (!st) return;

    var girls = Number(st.girlsScore) || 0;
    var boys = Number(st.boysScore) || 0;

    st.girlsScore = boys;
    st.boysScore = girls;

    updateScoresSafe();
    toastSafe('تم تبديل النقاط', 'WHEEL');
  }

  function snatchAndRun() {
    var st = getState();
    if (!st) return;

    var girls = clampScore(st.girlsScore);
    var boys = clampScore(st.boysScore);

    if (girls === boys) {
      if (Math.random() < 0.5) {
        st.girlsScore = clampScore(girls - 1);
        st.boysScore = clampScore(boys + 1);
      } else {
        st.boysScore = clampScore(boys - 1);
        st.girlsScore = clampScore(girls + 1);
      }
    } else if (girls > boys) {
      st.girlsScore = clampScore(girls - 1);
      st.boysScore = clampScore(boys + 1);
    } else {
      st.boysScore = clampScore(boys - 1);
      st.girlsScore = clampScore(girls + 1);
    }

    updateScoresSafe();
    toastSafe('اخطف واجري — تحركت نقطة', 'WHEEL');
  }

  var WHEEL_RESULTS = [
    {
      id: 'x3',
      title: 'الدعم X3',
      short: '×3 دعم',
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
      short: 'تبديل',
      desc: 'تم تبديل نقاط البنات والشباب',
      sound: 'days',
      apply: swapPoints
    },
    {
      id: 'yellow',
      title: 'كارت أصفر',
      short: 'كارت',
      desc: 'اختر الفريق الذي سيُحظر في السؤال القادم',
      sound: 'teamwork',
      apply: null
    },
    {
      id: 'x2',
      title: 'السؤال التالي X2',
      short: '×2',
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
      short: 'اخطف',
      desc: 'نقل نقطة من المتصدر إلى الفريق الآخر',
      sound: 'boom',
      apply: snatchAndRun
    }
  ];

  WHEEL_RESULTS.forEach(function (result, index) {
    result.index = index;
  });

  function installWheelTopButton() {
    if ($('axWheelTop')) return;

    var anchor =
      document.querySelector('.gift-stage') ||
      document.querySelector('.gift-buttons') ||
      document.querySelector('.gifts');

    var parent = anchor && anchor.parentNode ? anchor.parentNode : actionHost();
    if (!parent) return;

    var top = document.createElement('div');
    top.id = 'axWheelTop';
    top.className = 'ax-wheel-top';
    top.innerHTML =
      '<button id="axWheelBtn" type="button" class="ax-wheel-main-btn" aria-label="عجلة الحظ">' +
        '<span class="ax-wheel-emoji">❤️‍🔥</span>' +
        '<span class="ax-wheel-label">عجلة الحظ</span>' +
      '</button>';

    if (anchor && anchor.parentNode) {
      parent.insertBefore(top, anchor);
    } else {
      parent.appendChild(top);
    }

    var button = $('axWheelBtn');
    if (button) {
      button.addEventListener('click', openWheel);
    }
  }

  function openWheel() {
    if (AX.wheelBusy || $('axWheelOverlay')) return;

    AX.wheelBusy = true;

    var result = WHEEL_RESULTS[Math.floor(Math.random() * WHEEL_RESULTS.length)];
    var segment = 360 / WHEEL_RESULTS.length;
    var colors = ['#ff4f9a', '#35e6f7', '#ffd36e', '#917aff', '#64ecad'];

    var stops = WHEEL_RESULTS.map(function (item, index) {
      var start = index * segment;
      var end = (index + 1) * segment;
      return colors[index % colors.length] + ' ' + start + 'deg ' + end + 'deg';
    }).join(', ');

    var labels = WHEEL_RESULTS.map(function (item) {
      var angle = item.index * segment + segment / 2;
      var text = item.short || item.title;

      return (
        '<span class="ax-wheel-segment-label" style="--ax-angle:' + angle + 'deg;">' +
        esc(text) +
        '</span>'
      );
    }).join('');

    var html =
      '<div class="ax-wheel-stage">' +
        '<div class="ax-wheel-wrap">' +
          '<div class="ax-wheel-rotor" id="axWheelRotor" style="background: conic-gradient(from 0deg, ' + stops + ');">' +
            labels +
          '</div>' +
          '<div class="ax-wheel-hub-fixed">❤️‍🔥</div>' +
          '<div class="ax-wheel-pointer">▼</div>' +
        '</div>' +
        '<div class="ax-wheel-result hidden" id="axWheelResult"></div>' +
      '</div>';

    createOverlay('axWheelOverlay', 'ax-wheel-overlay', html);

    var rotor = $('axWheelRotor');

    if (!rotor) {
      AX.wheelBusy = false;
      return;
    }

    var center = result.index * segment + segment / 2;
    var targetRotation = (360 * 5) - center;

    requestAnimationFrame(function () {
      rotor.style.transition = 'transform ' + CONFIG.wheelSpinMs + 'ms cubic-bezier(.12,.78,.18,1)';
      rotor.style.transform = 'rotate(' + targetRotation + 'deg)';
    });

    setTimeout(function () {
      showWheelResult(result);
      AX.wheelBusy = false;
    }, CONFIG.wheelSpinMs + 180);
  }

  function showWheelResult(result) {
    var box = $('axWheelResult');
    if (!box) return;

    box.classList.remove('hidden');

    var inner =
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

    playSoundSafe(result.sound, 0.85);
    confettiSafe();

    if (result.id === 'yellow') {
      var girlsButton = $('axYCGirls');
      var boysButton = $('axYCBoys');

      function chooseBlockedTeam(team) {
        AX.pendingBlockTeam = team;
        updateBadges();
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

    try {
      if (typeof result.apply === 'function') {
        result.apply();
      }
    } catch (e) {}

    var close = $('axWheelClose');
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
    setGiftSidesVisible();
  }

  function resetRound() {
    AX.blockedTeam = null;
    AX.pendingBlockTeam = null;

    AX.activeX2 = false;
    AX.pendingX2 = false;

    AX.activeX3 = false;
    AX.pendingX3 = false;

    AX.speedLeft = 0;

    AX.captainUsed = {
      girls: {},
      boys: {}
    };

    refreshCaptainButtons();
    updateBadges();
  }

  function resetShow() {
    resetRound();

    AX.giftGoal = {
      girls: 0,
      boys: 0
    };

    updateGiftUI();
  }

  function patchLifecycle() {
    if (AX.patched) return;
    AX.patched = true;

    var originalRenderQuestion = window.renderQuestion;

    if (typeof originalRenderQuestion === 'function') {
      window.renderQuestion = function () {
        var result = originalRenderQuestion.apply(this, arguments);

        try {
          beginQuestion();
        } catch (e) {}

        return result;
      };
    }

    var originalApplyPoint = window.applyPoint;

    if (typeof originalApplyPoint === 'function') {
      window.applyPoint = function (team, points) {
        try {
          if (AX.blockedTeam === team) {
            AX.blockedTeam = null;
            updateBadges();

            toastSafe('محظور بالكارت الأصفر — لا نقاط في هذا السؤال', 'YELLOW CARD');
            playSoundSafe('wrong', 0.38);

            return;
          }
        } catch (e) {}

        var finalPoints = Number(points) || 1;
        var usedMultiplier = false;

        try {
          if (AX.activeX2) {
            finalPoints = finalPoints * 2;
            AX.activeX2 = false;
            usedMultiplier = true;
          }

          if (AX.activeX3) {
            finalPoints = finalPoints * 3;
            AX.activeX3 = false;
            usedMultiplier = true;
          }

          if (usedMultiplier) {
            toastSafe('تم تطبيق المضاعف', 'MULTIPLIER');
          }

          updateBadges();
        } catch (e) {}

        return originalApplyPoint.apply(this, [team, finalPoints]);
      };
    }

    var originalFinishRound = window.finishRound;

    if (typeof originalFinishRound === 'function') {
      window.finishRound = function () {
        var result = originalFinishRound.apply(this, arguments);

        try {
          resetRound();
        } catch (e) {}

        return result;
      };
    }

    var originalShowResults = window.showResults;

    if (typeof originalShowResults === 'function') {
      window.showResults = function () {
        var result = originalShowResults.apply(this, arguments);

        try {
          resetShow();
        } catch (e) {}

        return result;
      };
    }

    var originalShowScreen = window.showScreen;

    if (typeof originalShowScreen === 'function') {
      window.showScreen = function () {
        var result = originalShowScreen.apply(this, arguments);

        try {
          setGiftSidesVisible();
        } catch (e) {}

        return result;
      };
    }
  }

  function watchGameScreen() {
    var gameScreen = $('gameScreen');

    if (!gameScreen) {
      setTimeout(watchGameScreen, 500);
      return;
    }

    if (window.MutationObserver) {
      new MutationObserver(function () {
        setGiftSidesVisible();
      }).observe(gameScreen, {
        attributes: true,
        attributeFilter: ['class']
      });
    } else {
      setInterval(function () {
        setGiftSidesVisible();
      }, 700);
    }

    setGiftSidesVisible();
  }

  function observeDynamicUI() {
    if (!window.MutationObserver) return;

    var timer = null;

    function schedule() {
      if (timer) clearTimeout(timer);

      timer = setTimeout(function () {
        installGiftSides();
        installCaptainCards();
        installWheelTopButton();
        refreshCaptainButtons();
        updateGiftUI();
        updateBadges();
        setGiftSidesVisible();
      }, 250);
    }

    var observer = new MutationObserver(schedule);

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function initArenaExtras() {
    ensureSoundFiles();

    installSpeedButton();
    installGiftSides();
    installWheelTopButton();
    installCaptainCards();

    patchLifecycle();
    watchGameScreen();

    updateBadges();
    updateGiftUI();
    setGiftSidesVisible();
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
