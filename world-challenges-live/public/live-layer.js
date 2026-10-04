(function () {
  const LIVE_UI_CONFIG = { showAvatar: true, followSound: 'girls-captin', communitySound: ['community-love', 'celebration'], followDurationMs: 4200 };
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  if (window.soundFiles) soundFiles['community-love'] = LIVE_UI_CONFIG.communitySound;
  function expandCaptainSlots() {
    document.querySelectorAll('.captain-slots').forEach((host) => {
      const firstInput = host.querySelector('.captain-input'); if (!firstInput) return;
      const team = firstInput.getAttribute('data-team');
      while (host.children.length < 5) {
        const slot = host.children[0].cloneNode(true); const idx = host.children.length;
        const inp = slot.querySelector('.captain-input'); inp.value = ''; inp.classList.remove('confirmed'); inp.setAttribute('data-slot', String(idx));
        slot.querySelector('.captain-done').addEventListener('click', () => { if (window.confirmCaptain) confirmCaptain(team, String(idx)); });
        host.appendChild(slot);
      }
      if (window.state && state.captains && state.captains[team]) { while (state.captains[team].length < 5) state.captains[team].push(''); }
    });
  }
  function layer() { let l = document.getElementById('liveFxLayer'); if (!l) { l = document.createElement('div'); l.id = 'liveFxLayer'; document.body.appendChild(l); } return l; }
  function showFollowWelcome(name, avatar) {
    const card = document.createElement('div'); card.className = 'follow-welcome';
    card.innerHTML = '<div class="fw-heart">💖</div>' + (LIVE_UI_CONFIG.showAvatar && avatar ? '<img class="fw-avatar" src="' + esc(avatar) + '" alt="">' : '') + '<div class="fw-text"><small>متابع جديد انضم للعائلة</small><strong>' + esc(name) + '</strong></div><div class="fw-msg">نورت يا ' + esc(name) + ' 💖</div>';
    layer().appendChild(card);
    if (window.playSound) playSound(LIVE_UI_CONFIG.followSound, 0.7);
    setTimeout(() => card.classList.add('out'), LIVE_UI_CONFIG.followDurationMs - 600);
    setTimeout(() => card.remove(), LIVE_UI_CONFIG.followDurationMs);
  }
  function communityBurst(name) {
    if (window.fireConfetti) fireConfetti();
    if (window.playSound) playSound('community-love', 0.8);
    if (window.showToast) showToast('💞 ' + name + ' انضم لمجتمعك الخاص!', 'COMMUNITY');
  }
  function renderStats(j) {
    let chip = document.getElementById('liveStatsChip');
    if (!chip) { chip = document.createElement('div'); chip.id = 'liveStatsChip'; document.body.appendChild(chip); }
    const L = j.likes && j.likes[0], S = j.shares && j.shares[0];
    chip.innerHTML = '<div class="ls-row"><span class="ls-ico">👍</span><span>الأكثر إعجاباً:</span><strong>' + (L ? esc(L.name) + ' (' + L.count + ')' : '—') + '</strong></div>' + '<div class="ls-row"><span class="ls-ico">📤</span><span>الأكثر مشاركة:</span><strong>' + (S ? esc(S.name) + ' (' + S.count + ')' : '—') + '</strong></div>';
  }
  function startLeaderboard() { setInterval(async () => { try { const r = await fetch('/live/leaderboard'); const j = await r.json(); if (j.enabled) renderStats(j); } catch (e) {} }, 20000); }
  function connectLive() {
    if (!window.EventSource) return;
    const es = new EventSource('/live/events');
    es.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m.type === 'follow') showFollowWelcome(m.payload.name, m.payload.avatar); else if (m.type === 'community') communityBurst(m.payload.name); };
  }
  document.addEventListener('DOMContentLoaded', () => { expandCaptainSlots(); connectLive(); startLeaderboard(); });
})();
