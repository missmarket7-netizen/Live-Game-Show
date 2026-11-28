import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, '..');
const siteDir = path.join(repoDir, 'maroo-poc');
const portValue = Number(process.env.MAROO_POC_PORT || 4179);
if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) {
  throw new Error('MAROO_POC_PORT must be an integer from 1 to 65535.');
}

const allowedFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.bundle.js', ['app.bundle.js', 'text/javascript; charset=utf-8']]
]);
const securityHeaders = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' blob:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; worker-src 'none'",
  'Permissions-Policy': 'camera=(self), microphone=()',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin'
};

const server = http.createServer(async (request, response) => {
  const headers = { ...securityHeaders };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { ...headers, Allow: 'GET, HEAD', 'Content-Length': '0' });
    response.end();
    return;
  }

  let pathname;
  try {
    const requestTarget = request.url || '/';
    const rawPath = requestTarget.split('?', 1)[0];
    if (!rawPath.startsWith('/')) throw new Error('Invalid request target.');
    pathname = decodeURIComponent(rawPath);
    if (rawPath.includes('\\') || pathname.includes('\\') || pathname.split('/').some((part) => part === '..' || part === '.')) {
      response.writeHead(400, { ...headers, 'Content-Length': '0' });
      response.end();
      return;
    }
  } catch {
    response.writeHead(400, { ...headers, 'Content-Length': '0' });
    response.end();
    return;
  }

  const entry = allowedFiles.get(pathname);
  if (!entry) {
    response.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': '9' });
    response.end(request.method === 'HEAD' ? undefined : 'Not found');
    return;
  }

  try {
    const [filename, contentType] = entry;
    const body = await readFile(path.join(siteDir, filename));
    response.writeHead(200, { ...headers, 'Content-Type': contentType, 'Content-Length': String(body.byteLength) });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    const body = Buffer.from('Unavailable');
    response.writeHead(503, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': String(body.byteLength) });
    response.end(request.method === 'HEAD' ? undefined : body);
  }
});

server.on('error', (error) => {
  console.error(`Maroo PoC server error: ${error.message}`);
  process.exitCode = 1;
});
server.listen(portValue, '127.0.0.1', () => {
  console.log(`Maroo PoC available at http://127.0.0.1:${portValue}/`);
});
