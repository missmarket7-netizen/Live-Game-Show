(function(){
  const card = () => document.querySelector('.question-card');
  const flash = () => { const c=card(); if(!c) return; const f=document.createElement('div'); f.className='qa-flash'; c.appendChild(f); setTimeout(()=>f.remove(),500); };
  const enter = () => { const c=card(); if(!c) return; c.classList.remove('enter'); void c.offsetWidth; c.classList.add('enter'); };
  const press = (b) => { if(!b) return; b.classList.remove('press'); void b.offsetWidth; b.classList.add('press'); setTimeout(()=>b.classList.remove('press'),160); };
  const pulse = (team) => { const el=document.querySelector(team==='girls'?'.team-score-girls':'.team-score-boys'); if(!el) return; el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); setTimeout(()=>el.classList.remove('pulse'),520); };
  const sweep = () => { const c=card(); if(!c) return; const s=document.createElement('div'); s.className='round-sweep'; s.innerHTML='<i></i>'; c.appendChild(s); setTimeout(()=>s.remove(),700); };

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if(!t) return;
    if (t.matches('.deck-button,.mini-control,.text-control,.option-btn')) press(t);
    if (t.id === 'nextBtn') { flash(); setTimeout(enter, 60); }
    if (t.id === 'revealBtn') { setTimeout(() => { const r=document.querySelector('.answer-reveal'); if(r) r.classList.add('reveal-anim'); }, 30); }
    if (t.id === 'girlsPlusBtn' || t.id === 'girlsMinusBtn') pulse('girls');
    if (t.id === 'boysPlusBtn' || t.id === 'boysMinusBtn') pulse('boys');
    if (t.id === 'roundEndContinueBtn') { sweep(); setTimeout(enter, 80); }
  }, true);

  /* دخول بطاقة السؤال تلقائياً مع كل سؤال جديد */
  let lastQ = null;
  const qn = document.getElementById('questionNumber');
  if (qn) new MutationObserver(() => { if (qn.textContent !== lastQ) { lastQ = qn.textContent; enter(); } })
    .observe(qn, { childList:true, characterData:true, subtree:true });
})();
