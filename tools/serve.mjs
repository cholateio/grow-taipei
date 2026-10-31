// 零依賴靜態伺服器，根目錄預設 = repo。node tools/serve.mjs [port] [--root dist]（--root：看部署用的 dist/，計畫 12）
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };

export function serve(port = 8766, { root = ROOT } = {}) {
  const base = resolve(root);
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(base, path || 'index.html');
    if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  return new Promise(ok => server.listen(port, '127.0.0.1', () => ok(server)));
}

// --root <dir>：從命令列參數拿掉，回傳目錄（沒有就 undefined）；shot.mjs 也用
export function takeRoot(args) {
  const i = args.indexOf('--root');
  if (i < 0) return undefined;
  const [, dir] = args.splice(i, 2);
  return resolve(dir);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), root = takeRoot(args);
  const port = +args[0] || 8766;
  await serve(port, { root });
  console.log(`http://127.0.0.1:${port}/index.html`);
}
