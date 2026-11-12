/* ═══ LIVE_EVENTS_UI_V2 — ترحيب سينمائي وسط الشاشة + سباق الجمهور + لوحة لحظية بنفس #liveStatsChip ═══ */
(function () {
  'use strict';
  if (window.__LIVE_EVENTS_UI_V2__) return;
  window.__LIVE_EVENTS_UI_V2__ = true;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function st() { return window.state || null; }

  /* 1) نفس المكان الموجود أصلًا: #liveStatsChip + إصلاح عطل ts.count في renderLiveStats */
  function chipHTML() {
    var s = st();
    var lb = (s && s.liveStats) || { likes: [], shares: [] };
    var aud = (s && s.audience) || { girls: 0, boys: 0 };
    var tl = lb.likes && lb.likes[0];
    var ts = lb.shares && lb.shares[0];
    return '<div class="ls-row"><span class="ls-ico">👍</span><span>الأكثر إعجابا: </span><strong>' + (tl ? esc(tl.name) + ' (' + tl.count + ')' : '—') + '</strong></div>' +
           '<div class="ls-row"><span class="ls-ico">📤</span><span>الأكثر مشاركة: </span><strong>' + (ts ? esc(ts.name) + ' (' + ts.count + ')' : '—') + '</strong></div>' +
           '<div class="ls-row"><span class="ls-ico">👥</span><span>سباق الجمهور: </span><strong>بنات ' + (aud.girls || 0) + ' · شباب ' + (aud.boys || 0) + '</strong></div>';
  }
  function renderChip() {
    var s = st();
    if (!s) return;
    var chip = document.getElementById('liveStatsChip');
    if (!s.liveConnected) { if (chip) chip.remove(); return; }
    if (!chip) { chip = document.createElement('div'); chip.id = 'liveStatsChip'; document.body.appendChild(chip); }
    chip.innerHTML = chipHTML();
  }
  window.renderLiveStats = renderChip; /* نفس الدالة التي يستدعيها poll في app.js */

  /* 2) مسرح الترحيب السينمائي وسط الشاشة */
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

  /* المتابع الجديد: اسم وسط الشاشة ثم اختفاء */
  window.showFollowWelcome = function (name, avatar, uniqueId) {
    centerWelcome({ emoji: '💖', title: 'انضم للعائلة', name: name, sub: uniqueId ? '@' + uniqueId : '', cls: 'ev-follow' });
  };

  /* هدية أحبني/أحبك: ترحيب وسط الشاشة ثم اختفاء */
  window.communityBurst = function (name, avatar, uniqueId, gift, count) {
    centerWelcome({ emoji: '💞', title: 'انضم لمجتمعك الخاص', name: name, sub: (gift || '') + (count > 1 ? ' ×' + count : ''), cls: 'ev-community' });
    try { if (typeof window.confettiDirect === 'function') window.confettiDirect(); } catch (e) {}
  };

  /* 3) سباق الجمهور: ملك → شباب، ملكة → بنات */
  function pulse(el) { el.classList.remove('ax-pulse'); void el.offsetWidth; el.classList.add('ax-pulse'); }
  function addAudience(team) {
    var s = st();
    if (!s) return;
    if (!s.audience) s.audience = { girls: 0, boys: 0 };
    s.audience[team] = (s.audience[team] || 0) + 1;
    var ids = team === 'girls'
      ? ['audienceGirls', 'axAudienceGirls', 'teamAudienceGirls', 'audGirls']
      : ['audienceBoys', 'axAudienceBoys', 'teamAudienceBoys', 'audBoys'];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.textContent = s.audience[team]; pulse(el); }
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-audience="' + team + '"]'), function (el) {
      el.textContent = s.audience[team]; pulse(el);
    });
    renderChip();
  }

  /* 4) توستات صغيرة (هدايا/انضمام) */
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

  /* 5) اتصال SSE واحد للطبقة */
  function connect() {
    if (!window.EventSource) return;
    var es = new EventSource('/live/events');
    es.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      var p = m.payload || {};
      var s = st();

      if (m.type === 'gift') {
        toast('🎁 <strong>' + esc(p.name) + '</strong> أرسل <b>' + esc(p.gift) + '</b>' + (p.count > 1 ? ' ×' + p.count : ''), 'ev-gold');
      } else if (m.type === 'audience-join') {
        addAudience(p.team);
        toast((p.team === 'girls' ? '👧' : '👦') + ' <strong>' + esc(p.name) + '</strong> مع فريق ' + (p.team === 'girls' ? 'البنات' : 'الشباب'), p.team === 'girls' ? 'ev-girls' : 'ev-boys');
      } else if (m.type === 'leaderboard-update') {
        if (s) {
          s.liveStats = { likes: p.likes || [], shares: p.shares || [], chats: p.chats || [], gifts: p.gifts || [] };
          renderChip();
        }
      } else if (m.type === 'hello' || m.type === 'status') {
        if (s) s.liveConnected = !!p.connected;
        renderChip();
      }
    };
    es.onerror = function () { es.close(); setTimeout(connect, 6000); };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', connect);
  else connect();
})();
