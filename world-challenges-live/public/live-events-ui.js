/* ═══ LIVE_EVENTS_UI_V3 — شريط دائم + نقر يعرض آخر 3 حسابات (اسم وصورة) ═══ */
(function () {
  'use strict';
  if (window.__LIVE_EVENTS_UI_V3__) return;
  window.__LIVE_EVENTS_UI_V3__ = true;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function st() { return window.state || null; }

  var META = { topLikes: [], topShares: [], recentLikes: [], recentShares: [] };
  window.__LIVE_META = META;

  function mergeMeta(d) {
    if (!d) return;
    if (Array.isArray(d.likes)) META.topLikes = d.likes;
    if (Array.isArray(d.shares)) META.topShares = d.shares;
    if (Array.isArray(d.recentLikes)) META.recentLikes = d.recentLikes;
    if (Array.isArray(d.recentShares)) META.recentShares = d.recentShares;
  }

  /* ── الشريط: ظاهر دائمًا بنفس المكان القديم #liveStatsChip ── */
  function chipHTML() {
    var s = st();
    var aud = (s && s.audience) || { girls: 0, boys: 0 };
    var tl = META.topLikes[0];
    var ts = META.topShares[0];
    return '<div class="ls-row" data-metric="likes"><span class="ls-ico">👍</span><span>الأكثر إعجابا: </span><strong>' + (tl ? esc(tl.name) + ' (' + tl.count + ')' : '—') + '</strong></div>' +
           '<div class="ls-row" data-metric="shares"><span class="ls-ico">📤</span><span>الأكثر مشاركة: </span><strong>' + (ts ? esc(ts.name) + ' (' + ts.count + ')' : '—') + '</strong></div>' +
           '<div class="ls-row" data-metric="none"><span class="ls-ico">👥</span><span>سباق الجمهور: </span><strong>بنات ' + (aud.girls || 0) + ' · شباب ' + (aud.boys || 0) + '</strong></div>';
  }
  function renderChip() {
    var chip = document.getElementById('liveStatsChip');
    if (!chip) {
      chip = document.createElement('div');
      chip.id = 'liveStatsChip';
      document.body.appendChild(chip);
    }
    chip.classList.remove('hidden');
    chip.innerHTML = chipHTML();
  }
  /* نفس الدالة التي يستدعيها poll في app.js — لكن بدون حذف الشريط أبدًا */
  window.renderLiveStats = function (statsJson) {
    mergeMeta(statsJson);
    renderChip();
  };

  /* ── لوحة آخر 3 حسابات ── */
  function openPopup(metric) {
    var pop = document.getElementById('liveTopPopup');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'liveTopPopup';
      document.body.appendChild(pop);
    }
    var title = metric === 'likes' ? '👍 آخر 3 أعجبوا بالبث' : '📤 آخر 3 شاركوا البث';
    var list = (metric === 'likes' ? META.recentLikes : META.recentShares).slice(0, 3);
    pop.innerHTML = '<h4>' + title + '</h4>';
    if (!list.length) {
      pop.innerHTML += '<div class="ltp-empty">لا توجد بيانات بعد — بانتظار تفاعل اللايف</div>';
    }
    list.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'ltp-row';
      var av;
      if (p && p.avatar) {
        av = document.createElement('img');
        av.src = p.avatar;
        av.alt = '';
        av.onerror = function () {
          var fb = document.createElement('span');
          fb.className = 'ltp-avatar-fb';
          fb.textContent = (p.name || '؟').charAt(0);
          if (av.parentNode) av.replaceWith(fb);
        };
      } else {
        av = document.createElement('span');
        av.className = 'ltp-avatar-fb';
        av.textContent = (p && p.name ? p.name : '؟').charAt(0);
      }
      var nm = document.createElement('span');
      nm.className = 'ltp-name';
      nm.textContent = (p && p.name) || 'مشاهد';
      row.appendChild(av);
      row.appendChild(nm);
      if (p && p.count) {
        var ct = document.createElement('span');
        ct.className = 'ltp-count';
        ct.textContent = '×' + p.count;
        row.appendChild(ct);
      }
      pop.appendChild(row);
    });
    pop.classList.add('open');
    clearTimeout(openPopup.t);
    openPopup.t = setTimeout(closePopup, 7000);
  }
  function closePopup() {
    var pop = document.getElementById('liveTopPopup');
    if (pop) pop.classList.remove('open');
  }

  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    var chipRow = e.target.closest('#liveStatsChip [data-metric]');
    if (chipRow) {
      var metric = chipRow.getAttribute('data-metric');
      if (metric === 'none') { closePopup(); return; }
      fetch('/live/leaderboard')
        .then(function (r) { return r.json(); })
        .then(function (d) { mergeMeta(d); renderChip(); openPopup(metric); })
        .catch(function () { openPopup(metric); });
      return;
    }
    if (!e.target.closest('#liveTopPopup')) closePopup();
  });

  /* ── ترحيب سينمائي وسط الشاشة (متابع / أحبني) ── */
  function centerWelcome(o) {
    var host = document.getElementById('liveCenterStage');
    if (!host) {
      host = document.createElement('div');
      host.id = 'liveCenterStage';
      host.className = 'live-center-stage';
      document.body.appendChild(host);
    }
    var card = document.createElement('div');
    card.className = 'live-center-card ' + (o.cls || '');
    card.innerHTML =
      '<div class="lc-emoji">' + o.emoji + '</div>' +
      '<div class="lc-title">' + o.title + '</div>' +
      '<div class="lc-name">' + esc(o.name) + '</div>' +
      (o.sub ? '<div class="lc-sub">' + esc(o.sub) + '</div>' : '') +
      '<span class="lc-ring"></span>';
    host.appendChild(card);
    while (host.children.length > 2) host.removeChild(host.firstChild);
    setTimeout(function () { card.classList.add('out'); }, 3800);
    setTimeout(function () { if (card.parentNode) card.parentNode.removeChild(card); }, 4600);
  }
  window.showFollowWelcome = function (name, avatar, uniqueId) {
    centerWelcome({ emoji: '💖', title: 'انضم للعائلة', name: name, sub: uniqueId ? '@' + uniqueId : '', cls: 'ev-follow' });
  };
  window.communityBurst = function (name, avatar, uniqueId, gift, count) {
    centerWelcome({ emoji: '💞', title: 'انضم لمجتمعك الخاص', name: name, sub: (gift || '') + (count > 1 ? ' ×' + count : ''), cls: 'ev-community' });
    try { if (typeof window.confettiDirect === 'function') window.confettiDirect(); } catch (e) {}
  };

  /* ── سباق الجمهور + توستات ── */
  function pulse(el) { el.classList.remove('ax-pulse'); void el.offsetWidth; el.classList.add('ax-pulse'); }
  function addAudience(team) {
    var s = st();
    if (!s) return;
    if (!s.audience) s.audience = { girls: 0, boys: 0 };
    s.audience[team] = (s.audience[team] || 0) + 1;
    ['audienceGirls', 'axAudienceGirls', 'teamAudienceGirls', 'audGirls'].forEach(function (id) {
      if (team !== 'girls') return;
      var el = document.getElementById(id);
      if (el) { el.textContent = s.audience.girls; pulse(el); }
    });
    ['audienceBoys', 'axAudienceBoys', 'teamAudienceBoys', 'audBoys'].forEach(function (id) {
      if (team !== 'boys') return;
      var el = document.getElementById(id);
      if (el) { el.textContent = s.audience.boys; pulse(el); }
    });
    renderChip();
  }
  function toast(html, cls) {
    var host = document.getElementById('liveEventsStack');
    if (!host) {
      host = document.createElement('div');
      host.id = 'liveEventsStack';
      host.className = 'live-ev-stack';
      document.body.appendChild(host);
    }
    var card = document.createElement('div');
    card.className = 'live-ev-card' + (cls ? ' ' + cls : '');
    card.innerHTML = html;
    host.appendChild(card);
    while (host.children.length > 4) host.removeChild(host.firstChild);
    setTimeout(function () { card.classList.add('out'); }, 3200);
    setTimeout(function () { if (card.parentNode) card.parentNode.removeChild(card); }, 3800);
  }
  function mergeRecentClient(arr, p) {
    if (!p) return arr;
    var key = p.uniqueId || p.name;
    var out = arr.filter(function (x) { return (x.uniqueId || x.name) !== key; });
    out.unshift(p);
    return out.slice(0, 12);
  }

  /* ── SSE ── */
  function connect() {
    if (!window.EventSource) return;
    var es = new EventSource('/live/events');
    es.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      var p = m.payload || {};
      if (m.type === 'leaderboard-update') {
        mergeMeta(p);
        renderChip();
      } else if (m.type === 'like') {
        META.recentLikes = mergeRecentClient(META.recentLikes, p);
        renderChip();
      } else if (m.type === 'share') {
        META.recentShares = mergeRecentClient(META.recentShares, p);
        renderChip();
      } else if (m.type === 'gift') {
        toast('🎁 <strong>' + esc(p.name) + '</strong> أرسل <b>' + esc(p.gift) + '</b>' + (p.count > 1 ? ' ×' + p.count : ''), 'ev-gold');
      } else if (m.type === 'audience-join') {
        addAudience(p.team);
        toast((p.team === 'girls' ? '👧' : '👦') + ' <strong>' + esc(p.name) + '</strong> مع فريق ' + (p.team === 'girls' ? 'البنات' : 'الشباب'), p.team === 'girls' ? 'ev-girls' : 'ev-boys');
      }
    };
    es.onerror = function () { es.close(); setTimeout(connect, 6000); };
  }

  function boot() {
    renderChip(); /* ظاهر دائمًا من أول لحظة */
    fetch('/live/leaderboard').then(function (r) { return r.json(); }).then(function (d) {
      mergeMeta(d); renderChip();
    }).catch(function () {});
    connect();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
