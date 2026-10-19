const fs = require('fs');
const path = require('path');

const root = process.cwd();

const report = {
  root: root,
  package: null,
  server: {},
  questions: {
    dirs: [],
    files: [],
    total: 0,
    unique: 0,
    duplicatesCount: 0,
    invalidCount: 0,
    categories: {},
    difficulties: {},
    shapes: {},
    summary: {}
  },
  frontend: {},
  warnings: []
};

function fileExists(p) {
  try {
    return Boolean(p) && fs.existsSync(p);
  } catch (e) {
    return false;
  }
}

function readFile(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    return '';
  }
}

function readJson(p) {
  try {
    return JSON.parse(readFile(p).replace(/^\uFEFF/, ''));
  } catch (e) {
    report.warnings.push('JSON parse failed: ' + p + ' — ' + e.message);
    return null;
  }
}

function firstExisting(paths) {
  for (let i = 0; i < paths.length; i += 1) {
    if (fileExists(paths[i])) return paths[i];
  }
  return null;
}

function inc(obj, key) {
  obj[key] = (obj[key] || 0) + 1;
}

function normalizeArabic(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractQuestions(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.questions)) return payload.questions;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.bank)) return payload.bank;
  return [];
}

/* package.json */
const pkgPath = path.join(root, 'package.json');
if (fileExists(pkgPath)) {
  const pkg = readJson(pkgPath) || {};
  report.package = {
    type: pkg.type || null,
    scripts: Object.keys(pkg.scripts || {}),
    dependencies: Object.keys(pkg.dependencies || {}),
    devDependencies: Object.keys(pkg.devDependencies || {})
  };
} else {
  report.warnings.push('package.json not found');
}

/* server */
const serverPath = firstExisting([
  path.join(root, 'server', 'server.js'),
  path.join(root, 'server.js'),
  path.join(root, 'src', 'server.js'),
  path.join(root, 'index.js')
]);

report.server.path = serverPath;

if (serverPath) {
  const code = readFile(serverPath);

  const envMatches = code.match(/process\.env\.([A-Z0-9_]+)/g) || [];
  report.server.envNames = Array.from(new Set(envMatches.map(function (x) {
    return x.replace('process.env.', '');
  })));

  report.server.checks = {
    hasApiQuestions: /\/api\/questions/.test(code),
    hasGenerate: /\/api\/generate/.test(code),
    hasHealth: /\/api\/health/.test(code),
    hasCycleStatus: /\/api\/cycle-status/.test(code),
    hasResetCycle: /\/api\/reset-cycle/.test(code),
    hasTursoOrLibsql: /turso|libsql|TURSO/i.test(code),
    hasServedState: /served|cycle_state|question_usage|game_state/i.test(code),
    hasAvoid: /avoid/i.test(code),
    hasGraduatedDifficulty: /متدرج/.test(code),
    readsAllJsonMaybe: /readdirSync|\.json|db\$\{/i.test(code),
    importsLiveConnector: /live-connector/.test(code)
  };

  const attachIdx = code.indexOf('attachLiveRoutes');
  const fallbackIdx = code.search(/sendFile|index\.html/);

  report.server.routeOrder = {
    attachLiveRoutesIndex: attachIdx,
    fallbackIndex: fallbackIdx,
    liveProbablyBeforeFallback: (attachIdx >= 0 && fallbackIdx >= 0)
      ? (attachIdx < fallbackIdx)
      : null
  };

  const livePath = firstExisting([
    path.join(path.dirname(serverPath), 'live-connector.js'),
    path.join(root, 'live-connector.js'),
    path.join(root, 'server', 'live-connector.js')
  ]);

  report.server.liveConnectorPath = livePath;

  if (livePath) {
    const lcode = readFile(livePath);
    report.server.liveChecks = {
      hasLiveEvents: /\/live\/events/.test(lcode),
      hasLiveFollow: /\/live\/follow/.test(lcode),
      hasLiveCommunity: /\/live\/community/.test(lcode),
      hasLeaderboard: /\/live\/leaderboard/.test(lcode)
    };
  }
} else {
  report.warnings.push('server file not found in expected paths');
}

/* questions */
const rawDirs = [
  process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'questions')
    : '',
  path.join(root, 'server', 'questions'),
  path.join(root, 'questions'),
  path.join(root, 'data', 'questions'),
  path.join(root, '..', 'questions')
];

const dirsSet = new Set();
rawDirs.forEach(function (d) {
  if (fileExists(d)) dirsSet.add(path.resolve(d));
});

report.questions.dirs = Array.from(dirsSet);

const skipFiles = new Set([
  'generated_questions.json',
  'cycle_state.json',
  'live_state.json',
  'package.json',
  'audit-report.json'
]);

const seen = new Map();
const duplicates = [];
const invalid = [];
let total = 0;

dirsSet.forEach(function (dir) {
  let files = [];
  try {
    files = fs.readdirSync(dir);
  } catch (e) {
    report.warnings.push('cannot read dir: ' + dir);
    return;
  }

  files.sort();

  files.forEach(function (file) {
    const lower = file.toLowerCase();
    if (!lower.endsWith('.json') || skipFiles.has(lower)) return;

    const full = path.join(dir, file);
    const payload = readJson(full);
    const items = extractQuestions(payload);

    report.questions.files.push({
      path: full,
      count: items.length
    });

    items.forEach(function (item) {
      total += 1;

      const question = String((item && item.question) || '').trim();
      const key = normalizeArabic(question);

      if (!key) {
        invalid.push({ file: full, reason: 'empty question' });
        return;
      }

      if (seen.has(key)) {
        report.questions.duplicatesCount += 1;
        if (duplicates.length < 100) {
          duplicates.push({
            question: question,
            firstFile: seen.get(key).file,
            currentFile: full
          });
        }
      } else {
        seen.set(key, { file: full, question: question });
      }

      const category = String((item && item.category) || '').trim() || 'غير محددة';
      const difficulty = String((item && item.difficulty) || '').trim() || 'غير محددة';

      inc(report.questions.categories, category);
      inc(report.questions.difficulties, difficulty);

      const options = item && item.options;

      if (Array.isArray(options)) {
        inc(report.questions.shapes, 'options_length_' + options.length);

        const ci = Number(item.correctIndex);

        if (options.length === 1 && ci === 0) {
          inc(report.questions.shapes, 'single_answer_valid');
        }

        if (options.length === 4 && Number.isInteger(ci) && ci >= 0 && ci < 4) {
          inc(report.questions.shapes, 'multi_choice_valid');
        }

        if (options.length === 0) {
          inc(report.questions.shapes, 'free_question');
        }
      } else {
        inc(report.questions.shapes, 'no_options_array');
      }

      if (item && item.answer && String(item.answer).trim()) {
        inc(report.questions.shapes, 'has_answer_field');
      }

      if (item && item.explanation && String(item.explanation).trim()) {
        inc(report.questions.shapes, 'has_explanation');
      }

      const validOptions = Array.isArray(options)
        && options.length > 0
        && Number.isInteger(Number(item.correctIndex))
        && Number(item.correctIndex) >= 0
        && Number(item.correctIndex) < options.length;

      const validAnswer = Boolean(item && item.answer && String(item.answer).trim());

      if (!validOptions && !validAnswer) {
        report.questions.invalidCount += 1;
        if (invalid.length < 100) {
          invalid.push({
            file: full,
            question: question,
            reason: 'no valid options/correctIndex and no answer field'
          });
        }
      }
    });
  });
});

report.questions.total = total;
report.questions.unique = seen.size;
report.questions.duplicates = duplicates;
report.questions.invalidSamples = invalid;

report.questions.summary = {
  total: total,
  unique: seen.size,
  duplicates: report.questions.duplicatesCount,
  invalid: report.questions.invalidCount,
  singleAnswerValid: report.questions.shapes.single_answer_valid || 0,
  multiChoiceValid: report.questions.shapes.multi_choice_valid || 0,
  freeQuestions: report.questions.shapes.free_question || 0,
  hasAnswerField: report.questions.shapes.has_answer_field || 0,
  hasExplanation: report.questions.shapes.has_explanation || 0
};

/* frontend */
const appPath = firstExisting([
  path.join(root, 'public', 'app.js'),
  path.join(root, 'app.js')
]);

report.frontend.appPath = appPath;

if (appPath) {
  const code = readFile(appPath);

  report.frontend.appChecks = {
    hasRevealAnswer: /function\s+revealAnswer|revealAnswer\s*=/.test(code),
    rendersOptions: /optionsGrid|option-btn/.test(code),
    usesAnswerText: /answerText/.test(code),
    usesExplanationText: /explanationText/.test(code),
    hasIsFreeQuestion: /isFreeQuestion/.test(code),
    hasSingleAnswerPatch: /__SINGLE_ANSWER_REVEAL_V1__/.test(code),
    callsApiQuestions: /\/api\/questions/.test(code),
    historyKey: (code.match(/lgs_question_history_v\d+/) || [null])[0],
    savedKey: (code.match(/lgs_saved_sets_v\d+/) || [null])[0]
  };
} else {
  report.warnings.push('app.js not found');
}

const indexPath = firstExisting([
  path.join(root, 'public', 'index.html'),
  path.join(root, 'index.html')
]);

report.frontend.indexPath = indexPath;

if (indexPath) {
  const html = readFile(indexPath);

  const scripts = (html.match(/<script[^>]+src=["']([^"']+)["']/g) || []).map(function (s) {
    return s.replace(/.*src=["']([^"']+)["'].*/, '$1');
  });

  const styles = (html.match(/<link[^>]+href=["']([^"']+\.css[^"']*)["']/g) || []).map(function (s) {
    return s.replace(/.*href=["']([^"']+)["'].*/, '$1');
  });

  report.frontend.scripts = scripts;
  report.frontend.styles = styles;

  report.frontend.scriptOrder = {
    appIndex: scripts.findIndex(function (s) {
      return /app\.js/.test(s);
    }),
    arenaIndex: scripts.findIndex(function (s) {
      return /arena-extras\.js/.test(s);
    }),
    featuresIndex: scripts.findIndex(function (s) {
      return /features\.js/.test(s);
    })
  };
} else {
  report.warnings.push('index.html not found');
}

console.log(JSON.stringify(report, null, 2));
