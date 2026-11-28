import { accessSync, constants, existsSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const pathEntries = (process.env.PATH || '').split(delimiter).filter(Boolean);
const knownCommands = [
  'chromium',
  'chromium-browser',
  'google-chrome',
  'google-chrome-stable',
  'chrome',
];
const knownPaths = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/opt/google/chrome/chrome',
  '/snap/bin/chromium',
];

function executablePath(candidate) {
  if (!candidate) return undefined;
  const paths = isAbsolute(candidate) || candidate.includes('/')
    ? [candidate]
    : pathEntries.map((directory) => join(directory, candidate));

  return paths.find((path) => {
    try {
      accessSync(path, constants.X_OK);
      return existsSync(path);
    } catch {
      return false;
    }
  });
}

const chromium = [
  executablePath(process.env.CHROMIUM_BIN),
  ...knownCommands.map(executablePath),
  ...knownPaths.map(executablePath),
].find(Boolean);

if (!chromium) {
  console.log('SKIP: Studio V2 layout test requires Chromium; no executable found via CHROMIUM_BIN or known paths.');
  process.exit(0);
}

const testScript = fileURLToPath(new URL('./test-studio-v2-layout.mjs', import.meta.url));
const result = spawnSync(process.execPath, [testScript], {
  stdio: 'inherit',
  env: { ...process.env, CHROMIUM_BIN: chromium },
});

if (result.error) {
  console.error(`Failed to run Studio V2 layout test: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
