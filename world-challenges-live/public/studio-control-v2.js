(() => {
  'use strict';

  const CHANNEL_NAME = 'wcq-studio-v2-director-v1';
  const CACHE_KEY = 'wcq_studio_v2_director_v1';
  const OPERATOR_KEY_STORAGE_KEY = 'wcq_operator_write_key_v2';
  const FRESH_FOR_MS = 6500;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const contract = window.WCQStudioV2State;
  let state = contract.defaults();
  let operatorKey = '';
  let sentAt = 0;
  let channel = null;
  let pollTimer = 0;
  let pollsPending = false;

  function normalize(raw) {
    return contract.normalize(raw);
  }

  function setSyncStatus(message, status) {
    const element = $('#syncStatus');
    element.textContent = message;
    if (status) element.dataset.state = status;
    else delete element.dataset.state;
  }

  function setConnection(id, connected, message, error = false) {
    const badge = $('#' + id);
    const text = $('#' + id + 'Text');
    badge.classList.toggle('is-live', Boolean(connected));
    badge.classList.toggle('is-idle', !connected && !error);
    badge.classList.toggle('is-error', Boolean(error));
    text.textContent = message;
  }

  function syncControls() {
    $$('[data-scene]').forEach((button) => {
      const active = button.dataset.scene === state.scene;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('#presenterCue').value = state.presenterCue;
    $$('[data-layer]').forEach((input) => {
      input.checked = state.layers[input.dataset.layer] !== false;
    });
  }

  function persistLocal() {
    const payload = { channel: CHANNEL_NAME, type: 'state', state: normalize(state), sentAt };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch (error) {}
    if (channel) {
      try { channel.postMessage(payload); } catch (error) {}
    }
  }

  function nextSentAt() {
    sentAt = Math.max(Date.now(), sentAt + 1);
    return sentAt;
  }

  async function publishState() {
    nextSentAt();
    state = normalize(state);
    persistLocal();
    if (!operatorKey) {
      setSyncStatus('تحديث محلي فقط؛ أدخل مفتاح المشغّل لمزامنة المخرج عبر الخادم.', 'error');
      return;
    }
    setSyncStatus('جارٍ إرسال إعدادات v2 إلى الخادم…', 'pending');
    try {
      const response = await fetch('/api/studio-v2-state', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-Operator-Key': operatorKey },
        body: JSON.stringify({ state, sentAt })
      });
      if (response.ok) {
        setSyncStatus('إعدادات v2 متزامنة · حالة المخرج منفصلة عن اللعبة.', 'success');
      } else if (response.status === 401 || response.status === 503) {
        operatorKey = '';
        try { sessionStorage.removeItem(OPERATOR_KEY_STORAGE_KEY); } catch (error) {}
        setSyncStatus(response.status === 503 ? 'مفتاح المشغّل غير مضبوط على الخادم؛ بقيت المعاينة محلية.' : 'رفض الخادم المفتاح؛ أعد التحقق.', 'error');
      } else if (response.status === 429) {
        setSyncStatus('بلغت الكتابات حد المعدل؛ انتظر قبل إرسال تغيير آخر.', 'error');
      } else if (response.status === 409) {
        setSyncStatus('وصل إعداد أحدث إلى الخادم؛ أعد تحميل الحالة قبل المتابعة.', 'error');
      } else {
        setSyncStatus('تعذرت مزامنة إعدادات v2؛ استمر العرض المحلي.', 'error');
      }
    } catch (error) {
      setSyncStatus('الخادم غير متاح؛ التغيير المحلي في هذا التبويب ما زال قائماً.', 'error');
    }
  }

  function acceptRemote(payload, announce = false) {
    const remoteSentAt = Number(payload && payload.sentAt);
    const normalized = payload && payload.state ? normalize(payload.state) : null;
    if (!normalized || !Number.isFinite(remoteSentAt) || remoteSentAt <= 0 || remoteSentAt < sentAt) return false;
    state = normalized;
    sentAt = remoteSentAt;
    syncControls();
    if (announce) persistLocal();
    return true;
  }

  async function loadRemoteState() {
    try {
      const response = await fetch('/api/studio-v2-state', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('v2_state_read_failed');
      const payload = await response.json();
      const remoteSentAt = Number(payload && payload.sentAt) || 0;
      if (Number(payload && payload.updatedAt) > 0 && remoteSentAt > 0) {
        acceptRemote(payload, true);
        setSyncStatus('تم استرجاع إعدادات v2 المنقّاة من الخادم.', 'success');
      } else {
        setSyncStatus(operatorKey ? 'لا توجد إعدادات منشورة بعد؛ التحكم المحلي متاح.' : 'الخادم متصل للقراءة؛ الكتابة تتطلب مفتاح المشغّل.', operatorKey ? 'pending' : '');
      }
      setConnection('studioConnection', true, 'مخرج v2 متصل بالخادم');
      return true;
    } catch (error) {
      setConnection('studioConnection', false, 'تعذر اتصال إعدادات المخرج بالخادم', true);
      return false;
    }
  }

  async function validateAndConnect(candidate) {
    const key = String(candidate || '').trim();
    if (!key) {
      setSyncStatus('أدخل مفتاح المشغّل الذي ضبطه مالك الخادم.', 'error');
      return false;
    }
    setSyncStatus('جارٍ التحقق من مفتاح المشغّل…', 'pending');
    try {
      const response = await fetch('/api/operator/verify', {
        cache: 'no-store',
        headers: { 'X-Operator-Key': key }
      });
      if (!response.ok) {
        operatorKey = '';
        try { sessionStorage.removeItem(OPERATOR_KEY_STORAGE_KEY); } catch (error) {}
        setSyncStatus(response.status === 429 ? 'توقفت محاولات التحقق مؤقتًا؛ انتظر ثم أعد المحاولة.' : (response.status === 503 ? 'المفتاح غير مضبوط على الخادم؛ لم يتم ربط الكتابة.' : 'المفتاح مرفوض؛ بقي التحكم محلياً.'), 'error');
        return false;
      }
      operatorKey = key;
      try { sessionStorage.setItem(OPERATOR_KEY_STORAGE_KEY, key); } catch (error) {}
      $('#operatorKeyInput').value = '';
      setSyncStatus('تم التحقق؛ تتم قراءة إعدادات المخرج العامة…', 'pending');
      await loadRemoteState();
      return true;
    } catch (error) {
      operatorKey = '';
      setSyncStatus('تعذر الاتصال للتحقق؛ بقي التحكم محلياً.', 'error');
      return false;
    }
  }

  async function refreshConnections() {
    if (pollsPending) return;
    pollsPending = true;
    try {
      const response = await fetch('/api/output-snapshot', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (response.status === 204) {
        setConnection('gameConnection', false, 'لا توجد لقطة لعبة منشورة بعد');
      } else if (!response.ok) {
        throw new Error('game_snapshot_read_failed');
      } else {
        const payload = await response.json();
        const updatedAt = Number(payload && payload.updatedAt) || 0;
        const age = Date.now() - updatedAt;
        if (updatedAt > 0 && age >= 0 && age <= FRESH_FOR_MS) {
          setConnection('gameConnection', true, 'لقطة اللعبة متصلة · بياناتها للقراءة فقط');
        } else {
          setConnection('gameConnection', false, 'لقطة اللعبة قديمة أو متوقفة · المخرج يحتفظ بآخر لقطة');
        }
      }
      const stateResponse = await fetch('/api/studio-v2-state', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!stateResponse.ok) throw new Error('v2_state_read_failed');
      setConnection('studioConnection', true, 'مخرج v2 متصل بالخادم');
    } catch (error) {
      setConnection('studioConnection', false, 'الخادم غير متاح · قد تبقى المعاينة المحلية', true);
      setConnection('gameConnection', false, 'تعذر قراءة حالة لقطة اللعبة', true);
    } finally {
      pollsPending = false;
      pollTimer = window.setTimeout(refreshConnections, 2000);
    }
  }

  const keyForm = $('#operatorKeyForm');
  keyForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void validateAndConnect($('#operatorKeyInput').value);
  });

  $$('[data-scene]').forEach((button) => button.addEventListener('click', () => {
    state.scene = button.dataset.scene;
    syncControls();
    void publishState();
  }));
  $('#presenterCue').addEventListener('change', (event) => {
    state.presenterCue = event.currentTarget.value;
    void publishState();
  });
  $$('[data-layer]').forEach((input) => input.addEventListener('change', () => {
    state.layers[input.dataset.layer] = Boolean(input.checked);
    void publishState();
  }));

  if (typeof BroadcastChannel === 'function') {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener('message', (event) => {
        const message = event.data;
        if (!message || message.channel !== CHANNEL_NAME || message.type !== 'state') return;
        acceptRemote(message);
      });
    } catch (error) { channel = null; }
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== CACHE_KEY || !event.newValue) return;
    try { acceptRemote(JSON.parse(event.newValue)); } catch (error) {}
  });
  window.addEventListener('pagehide', () => {
    if (pollTimer) window.clearTimeout(pollTimer);
    if (channel) channel.close();
  }, { once: true });

  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && cached.state) {
      state = normalize(cached.state);
      sentAt = Number(cached.sentAt) || 0;
    }
  } catch (error) {}
  syncControls();
  void loadRemoteState();
  void refreshConnections();

  try {
    const savedKey = sessionStorage.getItem(OPERATOR_KEY_STORAGE_KEY) || '';
    if (savedKey) void validateAndConnect(savedKey);
  } catch (error) {}
})();
