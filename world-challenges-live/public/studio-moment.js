(function exposeStudioMoment(root) {
  'use strict';

  function createGate(storage, storageKey) {
    let lastId = '';
    try {
      lastId = storage && typeof storage.getItem === 'function'
        ? String(storage.getItem(storageKey) || '')
        : '';
    } catch (error) {
      lastId = '';
    }

    return Object.freeze({
      accept(moment) {
        if (!moment || typeof moment.id !== 'string') return false;
        const id = moment.id.trim();
        if (!id || id === lastId) return false;
        lastId = id;
        try {
          if (storage && typeof storage.setItem === 'function') storage.setItem(storageKey, id);
        } catch (error) {
          // In-memory deduplication remains active when sessionStorage is unavailable.
        }
        return true;
      },
      lastId() { return lastId; }
    });
  }

  root.WCQStudioMoment = Object.freeze({ createGate });
})(typeof window !== 'undefined' ? window : globalThis);
