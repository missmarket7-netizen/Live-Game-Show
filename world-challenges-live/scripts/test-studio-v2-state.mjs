import assert from 'node:assert/strict';
import '../public/studio-v2-state.js';

const contract = globalThis.WCQStudioV2State;
assert.ok(contract, 'the v2 state contract should be exposed for server and browser use');
assert.deepEqual(contract.defaults(), {
  scene: 'wide',
  presenterCue: 'idle',
  layers: { scoreboard: true, branding: true, presenter: true, question: true }
});

const safe = contract.normalize({
  scene: 'gift',
  presenterCue: 'thanks',
  layers: { scoreboard: false, branding: true, presenter: false, question: true, operatorKey: 'MUST_NOT_SURVIVE' },
  giftLabel: '<script>alert(1)</script>',
  answer: 'SECRET'
});
assert.deepEqual(safe, {
  scene: 'gift',
  presenterCue: 'thanks',
  layers: { scoreboard: false, branding: true, presenter: false, question: true }
});
assert.doesNotMatch(JSON.stringify(safe), /script|SECRET|operatorKey|giftLabel/);

assert.deepEqual(contract.normalize({
  scene: '<img src=x onerror=alert(1)>',
  presenterCue: 'https://example.invalid/clip.mp4',
  layers: { scoreboard: 'false', unexpected: false }
}), {
  scene: 'wide',
  presenterCue: 'idle',
  layers: { scoreboard: true, branding: true, presenter: true, question: true }
});
assert.deepEqual(contract.normalize(null), contract.defaults());
console.log('Studio v2 state contract: PASS (scene/cue enums and layer allowlist only; unapproved fields discarded).');
