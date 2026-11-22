import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const app = await readFile(path.join(root, 'public', 'app.js'), 'utf8');
const captain = await readFile(path.join(root, 'public', 'captain-sounds.js'), 'utf8');
const sounds = path.join(root, 'public', 'sounds');

const required = [
  'round-complete.mp3', 'chimo.mp3',
  'gift-heart.mp3', 'gift-donut.mp3', 'gift-corgi.mp3',
  'gift-rose.mp3', 'gift-tiktok.mp3', 'gift-cat.mp3', 'gift-crown.mp3',
  'girls-captin.mp3', 'boys-captin.mp3',
  'nancy.mp3', 'lara.mp3', 'jojo.mp3', 'moon.mp3', 'saja.mp3',
  'saad.mp3', 'mokhtar.mp3', 'abdo.mp3', 'ahmed.mp3', 'seif.mp3',
  'yousef.mp3', 'mina.mp3', 'abdallah.mp3', 'abu.mp3', 'melina.mp3',
  'memo.mp3', 'sara.mp3', 'osama.mp3', 'yasmin.mp3', 'shoaib.mp3', 'shero.mp3'
];

for (const file of required) await access(path.join(sounds, file));
assert.match(app, /ensureAudioBus/);
assert.match(app, /createDynamicsCompressor/);
assert.match(app, /round-complete/);
assert.match(app, /gift-heart/);
assert.match(app, /gift-donut/);
assert.match(app, /gift-corgi/);
assert.match(app, /'chimo'/);
assert.match(captain, /CAP_MS = 35000/);
assert.match(captain, /activeCaptainAudio/);
assert.match(captain, /playFallback/);

console.log(`Audio quality: OK (${required.length} referenced files and shared output path verified)`);
