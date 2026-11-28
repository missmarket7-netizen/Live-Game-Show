(function exposeStudioV2State(root) {
  'use strict';

  const SCENES = Object.freeze(['wide', 'question', 'score', 'gift', 'reveal', 'win', 'loss']);
  const PRESENTER_CUES = Object.freeze(['idle', 'welcome', 'thanks', 'celebrate', 'win', 'loss', 'laugh', 'fun', 'dance']);
  const LAYERS = Object.freeze(['scoreboard', 'branding', 'presenter', 'question']);
  const DEFAULT_STATE = Object.freeze({
    scene: 'wide',
    presenterCue: 'idle',
    layers: Object.freeze({ scoreboard: true, branding: true, presenter: true, question: true })
  });

  function normalize(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const rawLayers = source.layers && typeof source.layers === 'object' && !Array.isArray(source.layers)
      ? source.layers
      : {};
    const layers = {};
    for (const name of LAYERS) layers[name] = rawLayers[name] !== false;
    return {
      scene: SCENES.includes(source.scene) ? source.scene : DEFAULT_STATE.scene,
      presenterCue: PRESENTER_CUES.includes(source.presenterCue) ? source.presenterCue : DEFAULT_STATE.presenterCue,
      layers
    };
  }

  function defaults() {
    return normalize(DEFAULT_STATE);
  }

  root.WCQStudioV2State = Object.freeze({ SCENES, PRESENTER_CUES, LAYERS, normalize, defaults });
})(typeof window !== 'undefined' ? window : globalThis);
