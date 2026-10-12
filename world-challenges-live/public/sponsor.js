/* ═══ طبقة الراعي الرسمي «قدها؟» + افتراض الصعوبة المتدرجة ═══ */
(function () {
  const SPONSOR = { img: '/images/qaddaha.png', name: 'قدها؟', tag: 'الراعي الرسمي لعالم التحديات' };
  function badge(sm) {
    const w = document.createElement('div');
    w.className = 'sponsor-badge' + (sm ? ' sponsor-sm' : '');
    w.innerHTML = '<img src="' + SPONSOR.img + '" alt="' + SPONSOR.name + '"><span><small>' + SPONSOR.tag + '</small><strong>' + SPONSOR.name + '</strong></span>';
    return w;
  }
  function mount() {
    const a = document.querySelector('.setup-topbar .brand-lockup'); if (a && !a.querySelector('.sponsor-badge')) a.appendChild(badge(true));
    const b = document.querySelector('.live-topbar'); if (b && !b.querySelector('.sponsor-badge')) b.appendChild(badge(true));
    const c = document.querySelector('.results-hero'); if (c && !c.querySelector('.sponsor-badge')) c.appendChild(badge(false));
    const sel = document.getElementById('difficulty');
    if (sel && !Array.from(sel.options).some((o) => o.value === 'متدرج')) {
      const o = document.createElement('option'); o.value = 'متدرج'; o.textContent = '⭐ متدرج (سهل → صعب)'; sel.appendChild(o);
    }
    if (sel) sel.value = 'متدرج';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
