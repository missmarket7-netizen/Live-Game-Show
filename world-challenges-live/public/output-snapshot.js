(function exposeWorldChallengesSnapshot(root) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const QUESTION_KINDS = new Set(['choice', 'free', 'flag', 'image-guess']);
  const MOMENT_TYPES = new Set(['score', 'round-win', 'round-loss', 'draw', 'match-win']);
  const MOMENT_TEAMS = new Set(['girls', 'boys', 'draw']);
  function createSourceId() {
    const bytes = new Uint8Array(16);
    try {
      if (!root.crypto || typeof root.crypto.getRandomValues !== 'function') throw new Error('secure_random_unavailable');
      root.crypto.getRandomValues(bytes);
    } catch (error) {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  const SNAPSHOT_SOURCE_ID = createSourceId();
  let snapshotSequence = 0;
  const LOCAL_MEDIA_PATHS = new Set([
    'ad.svg ae.svg af.svg ag.svg ai.svg al.svg am.svg ao.svg aq.svg ar.svg as.svg at.svg au.svg aw.svg ax.svg az.svg ba.svg bb.svg bd.svg be.svg bf.svg bg.svg bh.svg bi.svg bj.svg bl.svg bm.svg bn.svg bo.svg bq.svg br.svg bs.svg bt.svg bv.svg bw.svg by.svg bz.svg ca.svg cc.svg cd.svg cf.svg cg.svg ch.svg ci.svg ck.svg cl.svg cm.svg cn.svg co.svg cr.svg cu.svg cv.svg cw.svg cx.svg cy.svg cz.svg de.svg dj.svg dk.svg dm.svg do.svg dz.svg ec.svg ee.svg eg.svg eh.svg er.svg es.svg et.svg fi.svg fj.svg fk.svg fm.svg fo.svg fr.svg ga.svg gb.svg gd.svg ge.svg gf.svg gg.svg gh.svg gi.svg gl.svg gm.svg gn.svg gp.svg gq.svg gr.svg gs.svg gt.svg gu.svg gw.svg gy.svg hk.svg hm.svg hn.svg hr.svg ht.svg hu.svg id.svg ie.svg il.svg im.svg in.svg io.svg iq.svg ir.svg is.svg it.svg je.svg jm.svg jo.svg jp.svg ke.svg kg.svg kh.svg ki.svg km.svg kn.svg kp.svg kr.svg kw.svg ky.svg kz.svg la.svg lb.svg lc.svg li.svg lk.svg lr.svg ls.svg lt.svg lu.svg lv.svg ly.svg ma.svg mc.svg md.svg me.svg mf.svg mg.svg mh.svg mk.svg ml.svg mm.svg mn.svg mo.svg mp.svg mq.svg mr.svg ms.svg mt.svg mu.svg mv.svg mw.svg mx.svg my.svg mz.svg na.svg nc.svg ne.svg nf.svg ng.svg ni.svg nl.svg no.svg np.svg nr.svg nu.svg nz.svg om.svg pa.svg pe.svg pf.svg pg.svg ph.svg pk.svg pl.svg pm.svg pn.svg pr.svg ps.svg pt.svg pw.svg py.svg qa.svg re.svg ro.svg rs.svg ru.svg rw.svg sa.svg sb.svg sc.svg sd.svg se.svg sg.svg sh.svg si.svg sj.svg sk.svg sl.svg sm.svg sn.svg so.svg sr.svg ss.svg st.svg sv.svg sx.svg sy.svg sz.svg tc.svg td.svg tf.svg tg.svg th.svg tj.svg tk.svg tl.svg tm.svg tn.svg to.svg tr.svg tt.svg tv.svg tw.svg tz.svg ua.svg ug.svg um.svg us.svg uy.svg uz.svg va.svg vc.svg ve.svg vg.svg vi.svg vn.svg vu.svg wf.svg ws.svg xx.svg ye.svg yt.svg za.svg zm.svg zw.svg'.split(' ').map((name) => '/flags/' + name),
    '01.jpg 010.jpg 011.jpg 012.jpg 013.jpg 014.jpg 015.jpg 016.jpg 017.jpg 018.jpg 02.jpg 03.jpg 04.jpg 05.jpg 06.jpg 07.jpg 08.jpg 09.jpg'.split(' ').map((name) => '/guess/' + name),
    '001.jpg 002.jpg 003.jpg 004.jpg 005.jpg 006.jpg'.split(' ').map((name) => '/name/' + name)
  ].flat());

  function safeText(value, maxLength) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  function safeNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }

  function safeMoment(moment) {
    if (!moment || typeof moment !== 'object' || Array.isArray(moment)) return null;
    if (typeof moment.id !== 'string' || moment.id.length > 100 || !MOMENT_TYPES.has(moment.type)) return null;
    const id = safeText(moment.id, 100);
    if (!/^[a-zA-Z0-9._:-]{1,100}$/.test(id)) return null;
    if (moment.team !== null && !MOMENT_TEAMS.has(moment.team)) return null;
    if ((moment.type === 'score' || moment.type === 'round-win' || moment.type === 'round-loss')
      && !['girls', 'boys'].includes(moment.team)) return null;
    const sentAt = moment.sentAt;
    if (typeof sentAt !== 'number' || !Number.isFinite(sentAt)
      || sentAt < 1000000000000 || sentAt > Date.now()) return null;
    return { id, type: moment.type, team: moment.team, sentAt };
  }

  function safeMediaSrc(value) {
    if (typeof value !== 'string') return '';
    let candidate = value.trim();
    if (!candidate || /[\u0000-\u0020\\?#%]/.test(candidate)) return '';
    candidate = candidate.replace(/^\/?public\//i, '/');
    if (!candidate.startsWith('/')) candidate = '/' + candidate;
    if (!/^\/(?:flags|guess|name)\/[a-z0-9][a-z0-9._-]*$/i.test(candidate)) return '';
    const canonical = candidate.toLowerCase();
    return LOCAL_MEDIA_PATHS.has(canonical) ? canonical : '';
  }

  function questionCandidates(question) {
    if (!question || typeof question !== 'object') return [];
    return ['image', 'imageUrl', 'media', 'asset', 'visual', 'question']
      .map((key) => question[key])
      .filter((value) => typeof value === 'string' && value.trim());
  }

  function questionMediaSrc(question) {
    for (const candidate of questionCandidates(question)) {
      const safe = safeMediaSrc(candidate);
      if (safe) return safe;
    }
    return '';
  }

  function questionKind(question, mediaSrc) {
    const category = safeText(question && question.category, 120);
    if ((mediaSrc && mediaSrc.startsWith('/flags/')) || /أعلام|خمن\s*الدولة(?!\s*أو\s*المدينة)(?:\s|$)/i.test(category)) return 'flag';
    if ((mediaSrc && !mediaSrc.startsWith('/flags/')) || /خمن\s*(?:الاسم|الدولة\s*أو\s*المدينة|المدينة)|معالم|سياحية/i.test(category)) return 'image-guess';
    return Array.isArray(question && question.options) && question.options.length > 0 ? 'choice' : 'free';
  }

  function safeOptions(options) {
    return Array.isArray(options)
      ? options.map((option) => safeText(option, 140)).filter(Boolean).slice(0, 8)
      : [];
  }

  function neutralMediaAlt(kind) {
    if (kind === 'flag') return 'علم دولة للتخمين';
    if (kind === 'image-guess') return 'صورة للتخمين';
    return '';
  }

  function outputQuestionText(question) {
    const candidate = safeText(question && question.question, 320);
    const isMediaPath = /^(?:https?:\/\/|\/|(?:public\/)?(?:flags|guess|name|landmarks?|tourism|images)\/)|\.(?:svg|png|jpe?g|webp)(?:[?#]|$)/i.test(candidate);
    if (candidate && !isMediaPath) return candidate;
    const category = safeText(question && question.category, 80);
    if (/خمن\s*(?:الدولة\s*أو\s*المدينة|المدينة)/i.test(category)) return 'خمن الدولة أو المدينة من الصورة';
    if (/خمن\s*الدولة|أعلام/i.test(category)) return 'ما اسم هذه الدولة؟';
    if (/خمن\s*الاسم/i.test(category)) return 'خمن الاسم من الصورة';
    if (/معالم|سياحية/i.test(category)) return 'حدّد المعلم أو الوجهة من الصورة';
    return category ? 'سؤال بصري من فئة ' + category : 'سؤال بصري';
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || raw.schemaVersion !== SCHEMA_VERSION) return null;

    const scores = raw.scores && typeof raw.scores === 'object' ? raw.scores : {};
    const question = raw.question && typeof raw.question === 'object' ? raw.question : {};
    const timer = raw.timer && typeof raw.timer === 'object' ? raw.timer : {};
    const captains = raw.captains && typeof raw.captains === 'object' ? raw.captains : {};
    const sentAt = Number(raw.sentAt);
    if (!Number.isFinite(sentAt) || sentAt <= 0 || sentAt > Date.now() + 5000) return null;

    const ready = Boolean(raw.ready);
    const rawRemainingSeconds = Number(timer.remainingSeconds);
    const rawDurationSeconds = Number(timer.durationSeconds);
    const remainingSeconds = safeNumber(timer.remainingSeconds, 0, 3600, 0);
    const durationSeconds = safeNumber(timer.durationSeconds, 1, 3600, 30);
    const timerRunning = Boolean(timer.running);
    const revealed = Boolean(question.revealed);
    const timerExpired = timer.running === false
      && Number.isFinite(rawRemainingSeconds)
      && Number.isFinite(rawDurationSeconds)
      && rawDurationSeconds > 0
      && rawRemainingSeconds <= 0;
    const answerReleased = ready && (revealed || timerExpired);
    const names = (items) => Array.isArray(items)
      ? items.map((name) => safeText(name, 48)).filter(Boolean).slice(0, 5)
      : [];

    const safeQuestion = {
      text: outputQuestionText({ question: question.text, category: question.category }),
      category: safeText(question.category, 48),
      revealed,
      index: safeNumber(question.index, 0, 99, 0),
      total: safeNumber(question.total, 0, 99, 0)
    };
    if (QUESTION_KINDS.has(question.kind)) {
      safeQuestion.kind = question.kind;
      if (Array.isArray(question.options)) safeQuestion.options = safeOptions(question.options);
      const mediaSrc = safeMediaSrc(question.mediaSrc);
      if (mediaSrc) safeQuestion.mediaSrc = mediaSrc;
      const mediaAlt = neutralMediaAlt(question.kind);
      if (mediaAlt) safeQuestion.mediaAlt = mediaAlt;
    }
    if (answerReleased) safeQuestion.answer = safeText(question.answer, 160);

    const safeSnapshot = {
      schemaVersion: SCHEMA_VERSION,
      sentAt,
      ready,
      scores: {
        girls: safeNumber(scores.girls, -9999, 9999, 0),
        boys: safeNumber(scores.boys, -9999, 9999, 0)
      },
      question: safeQuestion,
      timer: {
        remainingSeconds,
        durationSeconds,
        running: timerRunning
      },
      captains: { girls: names(captains.girls), boys: names(captains.boys) },
      roundNumber: safeNumber(raw.roundNumber, 1, 999, 1)
    };
    if (typeof raw.sourceId === 'string' && /^[a-f0-9]{32}$/i.test(raw.sourceId)
      && Number.isSafeInteger(raw.sequence) && raw.sequence > 0) {
      safeSnapshot.sourceId = raw.sourceId.toLowerCase();
      safeSnapshot.sequence = raw.sequence;
    }
    const moment = safeMoment(raw.moment);
    if (moment) safeSnapshot.moment = moment;
    return safeSnapshot;
  }

  function create(state, answerResolver) {
    if (!state || typeof state !== 'object') return null;
    const questions = Array.isArray(state.questions) ? state.questions : [];
    const currentIndex = Math.floor(safeNumber(state.currentIndex, 0, Math.max(questions.length - 1, 0), 0));
    const currentQuestion = questions[currentIndex] || null;
    const durationSeconds = safeNumber(state.timerDuration, 1, 3600, 30);
    const rawTimerValue = Number(state.timerValue);
    const remainingSeconds = safeNumber(state.timerValue, 0, 3600, 0);
    const timerRunning = Boolean(state.isTimerRunning);
    const revealed = Boolean(state.isRevealed);
    const ready = Boolean(currentQuestion);
    const timerExpired = !timerRunning && Number.isFinite(rawTimerValue)
      && Number(state.timerDuration) > 0 && remainingSeconds <= 0;
    const answerReleased = ready && (revealed || timerExpired);

    let answer = '';
    if (answerReleased && currentQuestion) {
      try {
        answer = currentQuestion.source === 'random-host'
          ? 'إجابة حرة — الحكم للمقدم'
          : (typeof answerResolver === 'function' ? answerResolver(currentQuestion) : currentQuestion.answer);
      } catch (error) {
        answer = '';
      }
    }

    const mediaSrc = questionMediaSrc(currentQuestion);
    const kind = questionKind(currentQuestion, mediaSrc);
    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      sentAt: Date.now(),
      sourceId: SNAPSHOT_SOURCE_ID,
      sequence: ++snapshotSequence,
      ready,
      scores: { girls: state.girlsScore, boys: state.boysScore },
      question: {
        text: outputQuestionText(currentQuestion),
        category: safeText(currentQuestion && currentQuestion.category, 48),
        revealed,
        index: ready ? currentIndex + 1 : 0,
        total: questions.length,
        kind,
        options: safeOptions(currentQuestion && currentQuestion.options),
        ...(mediaSrc ? { mediaSrc } : {}),
        ...(neutralMediaAlt(kind) ? { mediaAlt: neutralMediaAlt(kind) } : {})
      },
      timer: { remainingSeconds, durationSeconds, running: timerRunning },
      captains: state.captains || {},
      roundNumber: state.roundNumber,
      moment: state.moment
    };
    if (answerReleased) snapshot.question.answer = answer;
    return normalize(snapshot);
  }

  root.WCQOutputSnapshot = Object.freeze({ create, normalize });
})(typeof window !== 'undefined' ? window : globalThis);
