#!/usr/bin/env node
// Minimal static server for dist/ (Replit / local preview). The app itself still
// makes zero network requests – this only delivers the single HTML file.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const port = Number(process.env.PORT || 3000);
const file = resolve('dist/index.html');
createServer((req, res) => {
  if (!existsSync(file)) { res.writeHead(503, { 'content-type': 'text/plain' }); res.end('dist/index.html missing – run: npm run build'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(readFileSync(file));
}).listen(port, '0.0.0.0', () => console.log(`GBS Fit-Gap Workbench on http://0.0.0.0:${port}`));
