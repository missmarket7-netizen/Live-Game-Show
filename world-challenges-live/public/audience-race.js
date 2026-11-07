/* AUDIENCE_RACE_V1 — عجلة مواجهة مزدوجة، مستقلة عن الأسئلة والهدايا */
(function () {
  'use strict';
  var KEY = 'world-challenges-audience-race-v1';
  var MAX = 30;
  var MIN = 5;
  var busy = false;
  var pending = { girls: [], boys: [] };

  function $(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function norm(value) { return clean(value).toLocaleLowerCase('ar'); }
  function randomIndex(length) {
    if (length < 2) return 0;
    if (window.crypto && window.crypto.getRandomValues) {
      var a = new Uint32Array(1); window.crypto.getRandomValues(a); return a[0] % length;
    }
    return Math.floor(Math.random() * length);
  }
  function baseState() {
    return {
      girls: { all: [], available: [], picked: [] },
      boys: { all: [], available: [], picked: [] },
      matches: [],
      last: null
    };
  }
  var data = baseState();
  try { data = Object.assign(baseState(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  ['girls', 'boys'].forEach(function (team) {
    data[team] = data[team] || { all: [], available: [], picked: [] };
    data[team].all = Array.isArray(data[team].all) ? data[team].all : [];
    data[team].picked = Array.isArray(data[team].picked) ? data[team].picked : [];
    data[team].available = Array.isArray(data[team].available) ? data[team].available : data[team].all.slice();
  });
  data.matches = Array.isArray(data.matches) ? data.matches : [];

  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
  function toast(message) { if (typeof window.showToast === 'function') window.showToast(message, 'AUDIENCE RACE'); }
  function teamLabel(team) { return team === 'girls' ? 'البنات' : 'الشباب'; }
  function getAvailable(team) { return data[team].available.filter(function (n) { return data[team].all.some(function (a) { return norm(a) === norm(n); }); }); }
  function setStatus(text) { var el = $('audienceRaceStatus'); if (el) el.textContent = text; }

  function overlay() {
    var old = $('audienceRaceOverlay');
    if (old) return old;
    var el = document.createElement('div');
    el.id = 'audienceRaceOverlay'; el.className = 'audience-race-overlay hidden';
    el.innerHTML = '<div class="audience-race-card" dir="rtl">' +
      '<div class="audience-race-head"><div><span class="audience-race-kicker">AUDIENCE SHOWDOWN</span><h2>سباق الجمهور</h2><p>اختيار مواجهة مباشرة من الفريقين</p></div><button id="audienceRaceClose" class="audience-race-close" type="button">×</button></div>' +
      '<div class="audience-race-layout"><aside class="audience-roster girls-roster"><h3>فريق البنات <b id="audienceGirlsCount">0</b></h3><div class="audience-add"><input id="audienceGirlsInput" maxlength="32" placeholder="اسم المشاهدة"><button id="audienceGirlsAdd" type="button">إضافة</button></div><div id="audienceGirlsList" class="audience-list"></div><div class="audience-roster-foot"><span>متاح <b id="audienceGirlsAvailable">0</b></span><span>اختير <b id="audienceGirlsPicked">0</b></span></div><button id="audienceGirlsReset" class="audience-reset" type="button">إعادة دورة البنات</button></aside>' +
      '<main class="audience-wheel-main"><div class="audience-wheel-stage"><div class="audience-wheel-pointer">▼</div><div id="audienceOuterWheel" class="audience-wheel audience-wheel-outer"></div><div id="audienceInnerWheel" class="audience-wheel audience-wheel-inner"></div><div class="audience-wheel-hub">VS</div></div><button id="audienceSpin" class="audience-spin" type="button">ابدأ المواجهة</button><div id="audienceResult" class="audience-result hidden"></div><p id="audienceRaceStatus" class="audience-race-status">أضف 5 أسماء على الأقل لكل فريق للبدء</p></main>' +
      '<aside class="audience-roster boys-roster"><h3>فريق الشباب <b id="audienceBoysCount">0</b></h3><div class="audience-add"><input id="audienceBoysInput" maxlength="32" placeholder="اسم المشاهد"><button id="audienceBoysAdd" type="button">إضافة</button></div><div id="audienceBoysList" class="audience-list"></div><div class="audience-roster-foot"><span>متاح <b id="audienceBoysAvailable">0</b></span><span>اختير <b id="audienceBoysPicked">0</b></span></div><button id="audienceBoysReset" class="audience-reset" type="button">إعادة دورة الشباب</button></aside></div>' +
      '<div class="audience-race-footer"><span>الإضافة أثناء الدوران تدخل في المواجهة التالية</span><button id="audienceRaceResetAll" type="button">إعادة الفريقين</button></div></div>';
    document.body.appendChild(el);
    bind(); return el;
  }
  function bind() {
    $('audienceRaceClose').onclick = close;
    $('audienceSpin').onclick = spin;
    $('audienceGirlsAdd').onclick = function () { add('girls'); };
    $('audienceBoysAdd').onclick = function () { add('boys'); };
    $('audienceGirlsInput').onkeydown = function (e) { if (e.key === 'Enter') add('girls'); };
    $('audienceBoysInput').onkeydown = function (e) { if (e.key === 'Enter') add('boys'); };
    $('audienceGirlsReset').onclick = function () { resetTeam('girls'); };
    $('audienceBoysReset').onclick = function () { resetTeam('boys'); };
    $('audienceRaceResetAll').onclick = resetAll;
  }
  function add(team) {
    var input = $('audience' + (team === 'girls' ? 'Girls' : 'Boys') + 'Input');
    var value = clean(input.value);
    if (!value) return setStatus('اكتب اسمًا قبل الإضافة');
    if (data[team].all.length >= MAX) return setStatus('الحد الأقصى 30 اسمًا لفريق ' + teamLabel(team));
    if (data[team].all.some(function (n) { return norm(n) === norm(value); }) || pending[team].some(function (n) { return norm(n) === norm(value); })) return setStatus('الاسم موجود بالفعل داخل الفريق');
    if (busy) pending[team].push(value); else { data[team].all.push(value); data[team].available.push(value); save(); }
    input.value = ''; render(); setStatus(busy ? 'تمت جدولة الاسم للمواجهة التالية' : 'تمت إضافة ' + value);
  }
  function remove(team, name) {
    if (busy) return setStatus('انتظر انتهاء الدوران قبل تعديل القوائم');
    data[team].all = data[team].all.filter(function (n) { return norm(n) !== norm(name); });
    data[team].available = data[team].available.filter(function (n) { return norm(n) !== norm(name); }); save(); render();
  }
  function edit(team, oldName) {
    if (busy) return setStatus('انتظر انتهاء الدوران قبل تعديل القوائم');
    var next = clean(window.prompt('تعديل اسم المشاهد:', oldName) || '');
    if (!next || norm(next) === norm(oldName)) return;
    if (data[team].all.some(function (n) { return norm(n) === norm(next) && norm(n) !== norm(oldName); })) return setStatus('الاسم الجديد موجود بالفعل داخل الفريق');
    data[team].all = data[team].all.map(function (n) { return norm(n) === norm(oldName) ? next : n; });
    data[team].available = data[team].available.map(function (n) { return norm(n) === norm(oldName) ? next : n; });
    data[team].picked = data[team].picked.map(function (n) { return norm(n) === norm(oldName) ? next : n; });
    data.matches.forEach(function (match) { if (team === 'girls' && norm(match.girls) === norm(oldName)) match.girls = next; if (team === 'boys' && norm(match.boys) === norm(oldName)) match.boys = next; });
    if (data.last) { if (team === 'girls' && norm(data.last.girls) === norm(oldName)) data.last.girls = next; if (team === 'boys' && norm(data.last.boys) === norm(oldName)) data.last.boys = next; }
    save(); render(); setStatus('تم تعديل الاسم بنجاح');
  }
  function resetTeam(team) {
    if (busy || !window.confirm('إعادة أسماء ' + teamLabel(team) + ' إلى قائمة الاختيار؟')) return;
    data[team].available = data[team].all.slice(); data[team].picked = []; save(); render(); toast('تمت إعادة دورة ' + teamLabel(team));
  }
  function resetAll() {
    if (busy || !window.confirm('سيتم مسح سجل المواجهات وإعادة الفريقين. هل تريد المتابعة؟')) return;
    ['girls', 'boys'].forEach(function (t) { data[t].available = data[t].all.slice(); data[t].picked = []; }); data.matches = []; data.last = null; save(); render(); toast('تمت إعادة دورة الفريقين');
  }
  function list(team) {
    return data[team].all.map(function (name) {
      var picked = data[team].picked.some(function (n) { return norm(n) === norm(name); });
      return '<div class="audience-name ' + (picked ? 'is-picked' : '') + '"><span>' + esc(name) + '</span><small>' + (picked ? 'تم الاختيار' : 'متاح') + '</small><button data-edit-team="' + team + '" data-edit-name="' + esc(name) + '" type="button" aria-label="تعديل">✎</button><button data-remove-team="' + team + '" data-remove-name="' + esc(name) + '" type="button" aria-label="حذف">×</button></div>';
    }).join('') || '<em>لم تتم إضافة أسماء بعد</em>';
  }
  function renderWheel(team, id, outer) {
    var names = getAvailable(team); var wheel = $(id); if (!wheel) return;
    wheel.innerHTML = ''; wheel.style.setProperty('--segments', Math.max(1, names.length));
    var colors = outer ? ['#123b68', '#176b91', '#0e506f', '#239cb5'] : ['#6e235c', '#9e2b70', '#6e2f8f', '#c13d86'];
    wheel.style.background = names.length ? 'conic-gradient(' + names.map(function (_, i) { return colors[i % colors.length] + ' ' + (i * 360 / names.length) + 'deg ' + ((i + 1) * 360 / names.length) + 'deg'; }).join(',') + ')' : 'conic-gradient(#222943 0 360deg)';
    names.forEach(function (name, i) { var label = document.createElement('span'); label.className = 'audience-wheel-label'; label.style.setProperty('--angle', (i * 360 / names.length + 180 / names.length) + 'deg'); label.textContent = name; wheel.appendChild(label); });
  }
  function render() {
    if (!$('audienceRaceOverlay')) return;
    ['girls', 'boys'].forEach(function (team) {
      var cap = team[0].toUpperCase() + team.slice(1);
      $('audience' + cap + 'List').innerHTML = list(team);
      $('audience' + cap + 'Count').textContent = data[team].all.length;
      $('audience' + cap + 'Available').textContent = getAvailable(team).length;
      $('audience' + cap + 'Picked').textContent = data[team].picked.length;
    });
    document.querySelectorAll('[data-remove-team]').forEach(function (button) { button.onclick = function () { remove(button.dataset.removeTeam, button.dataset.removeName); }; });
    document.querySelectorAll('[data-edit-team]').forEach(function (button) { button.onclick = function () { edit(button.dataset.editTeam, button.dataset.editName); }; });
    renderWheel('boys', 'audienceOuterWheel', true); renderWheel('girls', 'audienceInnerWheel', false);
    var can = data.girls.all.length >= MIN && data.boys.all.length >= MIN && getAvailable('girls').length > 0 && getAvailable('boys').length > 0 && !busy;
    $('audienceSpin').disabled = !can;
    if (!busy && can) setStatus('جاهز لاختيار مواجهة جديدة');
    if (!busy && (data.girls.all.length < MIN || data.boys.all.length < MIN)) setStatus('يلزم إدخال 5 أسماء على الأقل لكل فريق للبدء');
    else if (!busy && (!getAvailable('girls').length || !getAvailable('boys').length)) setStatus('انتهت أسماء أحد الفريقين — أعد الدورة أو أضف أسماء جديدة');
  }
  function spin() {
    var girls = getAvailable('girls'), boys = getAvailable('boys');
    if (data.girls.all.length < MIN || data.boys.all.length < MIN) return setStatus('يلزم إدخال 5 أسماء على الأقل لكل فريق للبدء');
    if (girls.length < 1 || boys.length < 1 || busy) return setStatus('انتهت أسماء أحد الفريقين — أعد الدورة أو أضف أسماء جديدة');
    busy = true; render(); $('audienceResult').classList.add('hidden');
    var gi = randomIndex(girls.length), bi = randomIndex(boys.length), innerTurns = 4 + randomIndex(3), outerTurns = 5 + randomIndex(3);
    var inner = $('audienceInnerWheel'), outer = $('audienceOuterWheel');
    var ia = -(gi * 360 / girls.length + 180 / girls.length), oa = bi * 360 / boys.length + 180 / boys.length;
    inner.style.setProperty('--spin-to', (innerTurns * 360 + ia) + 'deg'); outer.style.setProperty('--spin-to', (-outerTurns * 360 + oa) + 'deg');
    inner.classList.add('is-spinning'); outer.classList.add('is-spinning');
    window.setTimeout(function () {
      inner.classList.remove('is-spinning'); outer.classList.remove('is-spinning');
      var pickedGirls = girls[gi], pickedBoys = boys[bi];
      data.girls.available = data.girls.available.filter(function (n) { return norm(n) !== norm(pickedGirls); }); data.boys.available = data.boys.available.filter(function (n) { return norm(n) !== norm(pickedBoys); });
      data.girls.picked.push(pickedGirls); data.boys.picked.push(pickedBoys); data.last = { girls: pickedGirls, boys: pickedBoys, at: new Date().toISOString() }; data.matches.push(data.last); save();
      Object.keys(pending).forEach(function (team) { pending[team].forEach(function (n) { data[team].all.push(n); data[team].available.push(n); }); pending[team] = []; }); save(); busy = false; render(); showResult(pickedGirls, pickedBoys);
    }, 5200);
  }
  function showResult(girls, boys) {
    var box = $('audienceResult'); box.classList.remove('hidden'); box.innerHTML = '<span>مواجهة جديدة</span><strong><i>' + esc(girls) + '</i><b>VS</b><i>' + esc(boys) + '</i></strong><div><button id="audienceConfirm" type="button">تأكيد المواجهة</button><button id="audienceCancel" type="button">إلغاء الاختيار</button></div>';
    $('audienceConfirm').onclick = function () { box.classList.add('hidden'); toast('تم تأكيد مواجهة ' + girls + ' ضد ' + boys); if (typeof window.fireConfetti === 'function') window.fireConfetti(); };
    $('audienceCancel').onclick = function () { data.girls.available.push(girls); data.boys.available.push(boys); data.girls.picked = data.girls.picked.filter(function (n) { return norm(n) !== norm(girls); }); data.boys.picked = data.boys.picked.filter(function (n) { return norm(n) !== norm(boys); }); data.matches.pop(); data.last = null; save(); box.classList.add('hidden'); render(); toast('تم إلغاء الاختيار وإعادة الاسمين'); };
  }
  function open() { var el = overlay(); el.classList.remove('hidden'); render(); }
  function close() { if (busy) return setStatus('انتظر انتهاء الدوران قبل الإغلاق'); var el = $('audienceRaceOverlay'); if (el) el.classList.add('hidden'); }
  window.openAudienceRace = open;
})();
