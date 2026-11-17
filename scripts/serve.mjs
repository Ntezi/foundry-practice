// Serves dist/ under the production base path: node scripts/serve.mjs [port]
// http://localhost:4322/foundry-practice/ behaves like https://ntezi.github.io/foundry-practice/.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { BASE_PATH, PORT } from './config.mjs';

const dist = resolve(import.meta.dirname, '..', 'dist');
const port = Number(process.argv[2] || process.env.PORT || PORT);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };
createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/' || p === BASE_PATH.slice(0, -1)) { res.writeHead(302, { location: BASE_PATH }); res.end(); return; }
  if (!p.startsWith(BASE_PATH)) { res.writeHead(404); res.end('not found (the site lives under ' + BASE_PATH + ')'); return; }
  p = p.slice(BASE_PATH.length - 1);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(dist, p);
  if (!f.startsWith(dist) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(f));
}).listen(port, () => console.log(`Foundry Practice → http://localhost:${port}${BASE_PATH}`));
