(() => {
  const $ = (id) => document.getElementById(id);
  const button = $('musicToggle');
  const label = $('musicLabel');
  let audioContext = null;
  let master = null;
  let timer = null;
  let active = false;
  const notes = [196, 246.94, 293.66, 369.99, 440];
  let noteIndex = 0;
  function playNote() {
    if (!active || !audioContext || !master) return;
    const osc = audioContext.createOscillator(); const gain = audioContext.createGain();
    osc.type = 'sine'; osc.frequency.value = notes[noteIndex % notes.length];
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(0.035, audioContext.currentTime + 0.6); gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 3.8);
    osc.connect(gain).connect(master); osc.start(); osc.stop(audioContext.currentTime + 4); noteIndex += 1;
  }
  async function startMusic() {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') await audioContext.resume();
    master = master || audioContext.createGain(); master.gain.value = 0.34; master.connect(audioContext.destination); active = true; playNote(); timer = window.setInterval(playNote, 2200);
    button.classList.add('is-on'); button.setAttribute('aria-pressed', 'true'); label.textContent = 'إيقاف الموسيقى';
  }
  function stopMusic() { active = false; if (timer) window.clearInterval(timer); timer = null; if (master) master.gain.exponentialRampToValueAtTime(0.0001, (audioContext?.currentTime || 0) + 0.5); button.classList.remove('is-on'); button.setAttribute('aria-pressed', 'false'); label.textContent = 'الموسيقى'; }
  button?.addEventListener('click', () => active ? stopMusic() : startMusic().catch(() => { label.textContent = 'الموسيقى غير متاحة'; }));

  const stage = $('loungeStage');
  const layer = $('participantLayer');
  const countLabel = $('participantCount');
  const connectionLabel = $('loungeConnection');
  const toast = $('actionToast');
  const participants = new Map();
  let selectedGender = 'female';
  let tileId = 0;
  const avatarFor = (gender) => gender === 'male' ? '/images/.boy.png' : '/images/girl.png';
  const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function showToast(text) { toast.textContent = text; toast.classList.add('is-visible'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 2600); }
  function updateCount() { countLabel.textContent = `${participants.size} / 12`; }
  function stableId(data) { return String(data.uniqueId || data.name || `manual-${++tileId}`).trim().toLowerCase(); }
  function positionFor(index) { const slots = [[17,54],[36,62],[56,55],[76,61],[26,73],[47,76],[68,74],[84,75],[10,70],[90,68],[41,46],[63,45]]; const p = slots[index % slots.length]; return { left:p[0], top:p[1] }; }
  function renderParticipant(p) {
    const node = document.createElement('div'); node.className = 'participant'; node.dataset.id = p.id; node.dataset.gender = p.gender; node.style.left = `${p.left}%`; node.style.top = `${p.top}%`; node.innerHTML = `<div class="participant-nameplate"><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.uniqueId ? '@' + p.uniqueId : p.source === 'tiktok' ? 'TikTok LIVE' : 'ضيف يدوي')}</small></div><div class="participant-avatar-wrap"><img class="participant-avatar" src="${escapeHtml(p.avatar || avatarFor(p.gender))}" alt="${escapeHtml(p.name)}"><span class="participant-move-hint">✦</span></div><div class="participant-tools"><button type="button" data-gender-toggle>${p.gender === 'female' ? 'ذكر' : 'أنثى'}</button><button type="button" data-remove>×</button></div>`;
    layer.appendChild(node); p.node = node; bindDrag(p); bindParticipantTools(p); updateCount(); return node;
  }
  function bindParticipantTools(p) {
    p.node.querySelector('[data-gender-toggle]').addEventListener('click', (event) => { event.stopPropagation(); p.gender = p.gender === 'female' ? 'male' : 'female'; p.node.dataset.gender = p.gender; p.node.querySelector('.participant-avatar').src = p.avatar || avatarFor(p.gender); event.currentTarget.textContent = p.gender === 'female' ? 'ذكر' : 'أنثى'; });
    p.node.querySelector('[data-remove]').addEventListener('click', (event) => { event.stopPropagation(); removeParticipant(p.id); });
  }
  function bindDrag(p) {
    let dragging = false; let offsetX = 0; let offsetY = 0;
    const move = (event) => { if (!dragging) return; const point = event.touches ? event.touches[0] : event; const rect = stage.getBoundingClientRect(); const x = clamp(point.clientX - rect.left - offsetX, 0, rect.width - p.node.offsetWidth); const y = clamp(point.clientY - rect.top - offsetY, 0, rect.height - p.node.offsetHeight); p.left = x / rect.width * 100; p.top = y / rect.height * 100; p.node.style.left = `${p.left}%`; p.node.style.top = `${p.top}%`; };
    const end = () => { dragging = false; p.node.classList.remove('is-focused'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); };
    p.node.addEventListener('pointerdown', (event) => { if (event.target.closest('button')) return; dragging = true; p.node.classList.add('is-focused'); const rect = p.node.getBoundingClientRect(); offsetX = event.clientX - rect.left; offsetY = event.clientY - rect.top; window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); });
  }
  function addParticipant(data, source = 'manual') {
    if (participants.size >= 12) { showToast('الساحة ممتلئة — أزل شخصية قبل الإضافة'); return null; }
    const id = stableId(data); if (participants.has(id)) { const existing = participants.get(id); existing.pulse = Date.now(); existing.node?.classList.add('is-focused'); setTimeout(() => existing.node?.classList.remove('is-focused'), 900); showToast(`${existing.name} موجود بالفعل في الساحة`); return existing; }
    const pos = positionFor(participants.size); const p = { id, name: data.name || data.uniqueId || 'مشارك', uniqueId: data.uniqueId || '', avatar: data.avatar || '', gender: data.gender === 'male' ? 'male' : 'female', source, left:pos.left, top:pos.top, node:null, queue:Promise.resolve() }; participants.set(id, p); renderParticipant(p); showToast(`${p.name} دخل استراحة الفضاء`); return p;
  }
  function removeParticipant(id) { const p = participants.get(id); if (!p) return; p.node.classList.add('is-exiting'); setTimeout(() => { p.node.remove(); participants.delete(id); updateCount(); }, 1100); }
  function focusParticipant(p, duration) { stage.classList.add('camera-zoom'); p.node.classList.add('is-focused'); clearTimeout(p.focusTimer); p.focusTimer = setTimeout(() => { stage.classList.remove('camera-zoom'); p.node.classList.remove('is-focused'); }, duration); }
  const actionMeta = { CHEER:['احتفال قصير','anim-cheer'], COMEDY:['حركة كوميدية','anim-comedy'], DANCE:['رقص','anim-dance'], RUN_CHAOS:['جري وشغب','anim-run'], FLIP_DANCE:['شقلبة ورقص','anim-flip'], SOLO_DANCE:['عرض منفرد','anim-solo'], ZERO_GRAVITY:['Zero Gravity','anim-zero'] };
  function runAction(data) {
    const candidates = [...participants.values()]; if (!candidates.length) { showToast('وصلت الهدية — أضف مشاركًا أولًا'); return; }
    const key = stableId(data); const p = participants.get(key) || candidates[Math.floor(Math.random() * candidates.length)]; const duration = Number(data.duration) || 4000; const meta = actionMeta[data.action] || ['حركة خاصة','anim-dance'];
    p.queue = p.queue.then(() => new Promise((resolve) => { focusParticipant(p, duration); p.node.classList.remove(...Object.values(actionMeta).map((x) => x[1])); void p.node.offsetWidth; p.node.classList.add(meta[1]); showToast(`${p.name} · ${meta[0]} · ${data.gift || 'هدية'}`); setTimeout(() => { p.node.classList.remove(meta[1]); resolve(); }, duration); }));
  }
  document.querySelectorAll('.gender-choice').forEach((choice) => choice.addEventListener('click', () => { selectedGender = choice.dataset.gender; document.querySelectorAll('.gender-choice').forEach((item) => item.classList.toggle('is-active', item === choice)); }));
  $('manualParticipantForm')?.addEventListener('submit', (event) => { event.preventDefault(); const name = $('manualName').value.trim(); if (!name) return; addParticipant({ name, avatar:$('manualAvatar').value.trim(), gender:selectedGender }, 'manual'); event.target.reset(); });
  $('clearParticipants')?.addEventListener('click', () => [...participants.keys()].forEach(removeParticipant));
  function connectLive() {
    if (!window.EventSource) { connectionLabel.textContent = 'المتصفح لا يدعم البث المباشر — الإدخال اليدوي جاهز'; return; }
    const es = new EventSource('/live/events');
    es.onmessage = (event) => { let message; try { message = JSON.parse(event.data); } catch (_) { return; } const payload = message.payload || {};
      if (message.type === 'status') { connectionLabel.textContent = payload.connected ? 'TikTok متصل — الدخول التلقائي فعال' : 'TikTok غير متصل — الإدخال اليدوي جاهز'; }
      if (message.type === 'hello') connectionLabel.textContent = payload.connected ? 'TikTok متصل — الدخول التلقائي فعال' : 'TikTok غير متصل — الإدخال اليدوي جاهز';
      if (message.type === 'lounge-join') addParticipant({ name:payload.name, uniqueId:payload.uniqueId, avatar:payload.avatar, gender:'female' }, 'tiktok');
      if (message.type === 'lounge-gift') runAction(payload);
    };
    es.onerror = () => { connectionLabel.textContent = 'TikTok غير متصل — الإدخال اليدوي جاهز'; };
  }
  connectLive();
})();
