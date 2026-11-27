/* ═══ CAPTAIN_SOUNDS_FULL_V2 — ملف كامل نهائي (استبدال تام، بلا ترقيع) ═══
   مساران نظيفان: جسر WebAudio الموحّد ثم احتياطي HTMLAudio حقيقي.
   حد 35 ثانية + سلسلة احتياطي لا يمكن كتمها + احترام soundEnabled.
   إضافة كابتن جديد = سطر واحد قبل CAPTAINS_TABLE_END + سطر قبل FALLBACK_TABLE_END. */
(function () {
'use strict';
if (window.CAPTAIN_SOUNDS_FULL_V2) return;
window.CAPTAIN_SOUNDS_FULL_V2 = true;

var CAP_MS = 35000;
var SUPPRESS_MS = 350;
var AUDIO_TAG = '?v=20261113-audio-compressed';
var SUPPRESS = { 'girls-captin': 1, 'boys-captin': 1 };

var CAPTAINS = [
{ key: 'nancy', aliases: ['nancy', 'نانسي'] },
{ key: 'lara', aliases: ['lara', 'لارا'] },
{ key: 'jojo', aliases: ['jojo', 'جوجو'] },
{ key: 'moon', aliases: ['mooon', 'moon', 'مون'] },
{ key: 'saja', aliases: ['saja', 'سچي', 'سجي'] },
{ key: 'chimo', aliases: ['chimoo', 'chimo', 'chemo', 'شيمو'] },
{ key: 'saad', aliases: ['saad', 'سعد'] },
{ key: 'mokhtar', aliases: ['mokhtar', 'المختار', 'مختار'] },
{ key: 'abdo', aliases: ['abdo', 'عبده'] },
{ key: 'ahmed', aliases: ['ahmed', 'احمد', 'أحمد'] },
{ key: 'seif', aliases: ['seif', 'سيف الدين', 'سيف'] },
{ key: 'yousef', aliases: ['yousef', 'يوسف الهاشمي', 'يوسف'] },
{ key: 'mina', aliases: ['mina', 'مينا'] },
{ key: 'abdallah', aliases: ['abd allah', 'abdallah', 'عبد الله', 'عبدالله'] },
{ key: 'abu', aliases: ['abu muhammed', 'abu', 'ابو محمد', 'أبو محمد'] },
{ key: 'melina', aliases: ['melina', 'ميلانيا'] },
{ key: 'memo', aliases: ['memo', 'ميمو'] },
{ key: 'sara', aliases: ['sara', 'سارة'] },
{ key: 'osama', aliases: ['osama', 'أسامة'] },
{ key: 'yasmin', aliases: ['yasmin', 'ياسمين'] },
{ key: 'shoaib', aliases: ['shoaib', 'شعيب'] },
{ key: 'shero', aliases: ['shero', 'شيرو'] },
{ key: 'lana', aliases: ['lana', 'لانا'] },
{ key: 'asia', aliases: ['asia', 'آسيا'] },
{ key: 'dahab', aliases: ['dahab', 'دهب'] },
{ key: 'abdelrahman', aliases: ['abdelrahman', 'abd elrahman', 'عبد الرحمن', 'عبدالرحمن'] },
{ key: 'noha', aliases: ['noha', 'نهى', 'نهي'] }
];
/* CAPTAINS_TABLE_END */

var FALLBACK_BY_KEY = {
nancy: 'girls-captin', lara: 'girls-captin', jojo: 'girls-captin',
moon: 'girls-captin', saja: 'girls-captin', chimo: 'girls-captin',
saad: 'boys-captin', mokhtar: 'boys-captin', abdo: 'boys-captin',
ahmed: 'boys-captin', seif: 'boys-captin', yousef: 'boys-captin',
mina: 'boys-captin', abdallah: 'boys-captin', abu: 'boys-captin', melina: 'girls-captin',
memo: 'boys-captin', sara: 'girls-captin', osama: 'boys-captin',
yasmin: 'girls-captin', shoaib: 'boys-captin', shero: 'boys-captin',
lana: 'girls-captin', asia: 'girls-captin', dahab: 'girls-captin',
abdelrahman: 'boys-captin', noha: 'girls-captin'
};
/* FALLBACK_TABLE_END */

function norm(s) {
return String(s || '').toLowerCase()
.replace(/[\u064B-\u0652\u0670\u0640]/g, '')
.replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
.replace(/\u0649/g, '\u064A')
.replace(/\s+/g, ' ')
.trim();
}
var EXACT = {};
var FUZZY = [];
CAPTAINS.forEach(function (c) {
(c.aliases || []).forEach(function (a) {
var n = norm(a);
if (!n) return;
if (!EXACT[n]) EXACT[n] = c.key;
FUZZY.push([n, c.key]);
});
});
FUZZY.sort(function (a, b) { return b[0].length - a[0].length; });
function keyForName(name) {
var n = norm(name);
if (!n) return null;
if (EXACT[n]) return EXACT[n];
var tokens = n.split(' ');
for (var i = 0; i < FUZZY.length; i++) if (tokens.indexOf(FUZZY[i][0]) !== -1) return FUZZY[i][1];
for (var j = 0; j < FUZZY.length; j++) if (n.indexOf(FUZZY[j][0]) !== -1) return FUZZY[j][1];
return null;
}
function soundEnabled() { var s = window.state; return !(s && s.soundEnabled === false); }
function bridge() { return window.WCQ_AUDIO || null; }

/* كتم انتقائي قصير لصوت الفريق الأساسي لحظة تشغيل مؤثر خاص */
var suppressUntil = 0;
var origPlaySound = window.playSound;
window.playSound = function (key) {
if (suppressUntil > Date.now() && SUPPRESS[key]) return undefined;
if (typeof origPlaySound === 'function') return origPlaySound.apply(this, arguments);
return undefined;
};

var active = null;
function stopActive() { if (active) { try { active.stop(); } catch (e) {} active = null; } }

/* الاحتياطي يمر مباشرة بالجسر/الأصل — لا يمر عبر نافذة الكتم أبدًا */
function playFallback(key) {
var b = bridge();
if (b && b.available && b.available()) { try { b.playKey(key, 0.9, {}); return; } catch (e) {} }
if (typeof origPlaySound === 'function') { try { origPlaySound(key, 0.85); return; } catch (e) {} }
try { var a = new Audio('/sounds/' + key + '.mp3'); a.volume = 0.9; a.play().catch(function () {}); } catch (e) {}
}

/* تشغيل مؤثر خاص بحد 35 ثانية مع سقوط مضمون للاحتياطي */
function playCapped(key, fallbackKey) {
stopActive();
if (!soundEnabled()) return;
var settled = false;
var stopFn = null;
var timer = setTimeout(function () { stopActive(); }, CAP_MS);
active = { stop: function () { clearTimeout(timer); if (stopFn) { try { stopFn(); } catch (e) {} } } };
function fail() { if (settled) return; settled = true; stopActive(); playFallback(fallbackKey); }
function end() { if (settled) return; settled = true; stopActive(); }
var b = bridge();
if (b && b.available && b.available()) {
stopFn = function () { try { b.stopKey(key); } catch (e) {} };
try { b.playKey(key, 0.95, { onEnd: end, onFail: fail }); return; } catch (e) {}
}
try {
var a = new Audio('/sounds/' + key + '.mp3' + AUDIO_TAG);
a.preload = 'auto';
a.volume = 0.95;
stopFn = function () { try { a.pause(); a.currentTime = 0; } catch (e) {} };
a.addEventListener('error', fail);
a.addEventListener('ended', end);
var p = a.play();
if (p && typeof p.catch === 'function') p.catch(fail);
} catch (e) { fail(); }
}

/* التقاط تأكيد الكابتن قبل معالج التطبيق */
document.addEventListener('click', function (e) {
var t = e.target;
if (!t || !t.closest) return;
var btn = t.closest('.captain-done');
if (!btn) return;
var slot = btn.closest('.captain-slot') || btn.parentElement;
var input = slot ? slot.querySelector('.captain-input') : null;
if (!input) return;
var key = keyForName(input.value);
if (!key) return;
if (!soundEnabled()) return;
var team = input.getAttribute('data-team') || '';
if (!team && slot) { var host = slot.closest('[data-team]'); if (host) team = host.getAttribute('data-team'); }
var fallback = FALLBACK_BY_KEY[key] || (team === 'boys' ? 'boys-captin' : 'girls-captin');
suppressUntil = Date.now() + SUPPRESS_MS;
try { playCapped(key, fallback); } catch (err) { try { playFallback(fallback); } catch (e2) {} }
}, true);

window.CaptainSounds = { version: 'FULL_V2', keyForName: keyForName, play: playCapped, stop: stopActive };
})();
