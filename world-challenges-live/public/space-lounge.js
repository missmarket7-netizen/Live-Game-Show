(() => {
  const button = document.getElementById('musicToggle');
  const label = document.getElementById('musicLabel');
  let audioContext = null;
  let master = null;
  let timer = null;
  let active = false;
  const notes = [196, 246.94, 293.66, 369.99, 440];
  let index = 0;

  function playNote() {
    if (!active || !audioContext || !master) return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.value = notes[index % notes.length];
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.035, audioContext.currentTime + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 3.8);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(audioContext.currentTime + 4);
    index += 1;
  }

  async function startMusic() {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') await audioContext.resume();
    master = master || audioContext.createGain();
    master.gain.value = 0.34;
    master.connect(audioContext.destination);
    active = true;
    playNote();
    timer = window.setInterval(playNote, 2200);
    button.classList.add('is-on');
    button.setAttribute('aria-pressed', 'true');
    label.textContent = 'إيقاف الموسيقى';
  }

  function stopMusic() {
    active = false;
    if (timer) window.clearInterval(timer);
    timer = null;
    if (master) master.gain.exponentialRampToValueAtTime(0.0001, (audioContext?.currentTime || 0) + 0.5);
    button.classList.remove('is-on');
    button.setAttribute('aria-pressed', 'false');
    label.textContent = 'الموسيقى';
  }

  button?.addEventListener('click', () => {
    if (active) stopMusic();
    else startMusic().catch(() => { label.textContent = 'الموسيقى غير متاحة'; });
  });
})();
