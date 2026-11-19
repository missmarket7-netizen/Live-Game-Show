const DEFAULT_ENDPOINT = '/live';

function clean(value, max = 240) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

export class TikTokLiveClient {
  constructor({ endpoint = DEFAULT_ENDPOINT, onEvent = () => {}, onStatus = () => {} } = {}) {
    this.endpoint = endpoint.replace(/\/$/, '');
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.source = null;
    this.status = 'offline';
  }

  async connect({ uniqueId, roomId } = {}) {
    const requestedUser = clean(uniqueId, 100).replace(/^@/, '');
    const requestedRoom = clean(roomId, 100);
    const response = await fetch(`${this.endpoint}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ uniqueId: requestedUser, roomId: requestedRoom })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'تعذر بدء اتصال TikTok LIVE');
    this.openEvents();
    this.setStatus(data.status?.connected ? 'connected' : 'connecting', { ...data, requestedUser, requestedRoom });
    return { ...data, requestedUser, requestedRoom };
  }

  openEvents() {
    if (this.source) this.source.close();
    this.source = new EventSource(`${this.endpoint}/events`);
    this.source.onopen = () => this.setStatus('connected');
    this.source.onerror = () => this.setStatus('reconnecting');
    this.source.onmessage = (message) => {
      let envelope = {};
      try { envelope = JSON.parse(message.data); } catch { envelope = { type: 'unknown', payload: { raw: message.data } }; }
      const type = String(envelope.type || 'unknown');
      const payload = envelope.payload && typeof envelope.payload === 'object' ? envelope.payload : {};
      if (type === 'status' || type === 'hello') this.setStatus(payload.connected ? 'connected' : 'offline', payload);
      else if (type === 'connected') this.setStatus('connected', payload);
      else if (type === 'disconnected' || type === 'liveEnd') this.setStatus('offline', payload);
      else if (type === 'error') this.setStatus('error', payload);
      this.onEvent({ type, ...payload });
    };
  }

  async disconnect() {
    if (this.source) { this.source.close(); this.source = null; }
    this.setStatus('offline');
    return { ok: true, mode: 'local-event-stream' };
  }

  setStatus(status, data = {}) { this.status = status; this.onStatus({ status, ...data }); }
}

export function createTikTokLiveClient(options) { return new TikTokLiveClient(options); }
