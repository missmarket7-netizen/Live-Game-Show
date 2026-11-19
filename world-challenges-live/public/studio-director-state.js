(function exposeStudioDirectorState(root) {
  'use strict';

  const DEFAULT_STATE = Object.freeze({
    view: 'wide',
    merged: false,
    layers: Object.freeze({ scores: true, awards: true, branding: true }),
    giftLabel: 'لحظة الهدية',
    giftName: '',
    weeklyLeader: '',
    roundStar: ''
  });

  function safeText(value, maxLength) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  function normalize(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const layers = source.layers && typeof source.layers === 'object' ? source.layers : {};
    return {
      view: ['wide', 'scores', 'awards'].includes(source.view) ? source.view : DEFAULT_STATE.view,
      merged: Boolean(source.merged),
      layers: {
        scores: layers.scores !== false,
        awards: layers.awards !== false,
        branding: layers.branding !== false
      },
      giftLabel: safeText(source.giftLabel || DEFAULT_STATE.giftLabel, 32),
      giftName: safeText(source.giftName, 44),
      weeklyLeader: safeText(source.weeklyLeader, 28),
      roundStar: safeText(source.roundStar, 28)
    };
  }

  function defaults() {
    return normalize(DEFAULT_STATE);
  }

  root.WCQStudioDirectorState = Object.freeze({ normalize, defaults });
})(typeof window !== 'undefined' ? window : globalThis);
