// 部署（計畫 12 Task 3）：GitHub Pages 發布 dist/（只含遊戲要的 index.html、src、vendor、assets）；分享連結有 description 與 OG
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const meta = (html, attr, key) => new RegExp(`<meta ${attr}="${key}" content="([^"]+)">`).exec(html)?.[1];
test('index.html has a description and og:title / og:description / og:image; the image is in assets/', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.ok(meta(html, 'name', 'description'), 'meta description');
  assert.ok(meta(html, 'property', 'og:title'), 'og:title'); assert.ok(meta(html, 'property', 'og:description'), 'og:description');
  assert.equal(meta(html, 'property', 'og:image'), './assets/og.png');
  assert.ok(existsSync('assets/og.png'), 'assets/og.png');
  const png = readFileSync('assets/og.png');
  assert.equal(png.readUInt32BE(16), 1280, 'og.png is 1280 wide');
});

test('the Pages workflow builds dist/ with only index.html, src, vendor, assets and deploys it', () => {
  const yml = readFileSync('.github/workflows/pages.yml', 'utf8');
  assert.match(yml, /branches:\s*\[\s*main\s*\]/);
  assert.match(yml, /npm run dist/, 'builds with the same command as local');
  assert.match(yml, /actions\/configure-pages@v5/); assert.match(yml, /actions\/upload-pages-artifact@v3[\s\S]*?path:\s*dist/); assert.match(yml, /actions\/deploy-pages@v4/);
  assert.match(yml, /pages:\s*write/); assert.match(yml, /id-token:\s*write/);
  // 沒開 Pages（或 fork）時，失敗訊息要講清楚去哪裡開
  assert.match(yml, /if:\s*failure\(\)[\s\S]*Settings → Pages/);
  const dist = JSON.parse(readFileSync('package.json', 'utf8')).scripts.dist;
  assert.ok(dist, 'npm run dist');
  const copied = dist.match(/rsync[^&]*/)[0];
  for (const p of ['index.html', 'src', 'vendor', 'assets']) assert.match(copied, new RegExp(`(^|\\s)${p}(\\s|$)`), p);
  for (const p of ['shots', 'grow_prototype', 'docs', 'test', 'tools', '.superpowers', 'node_modules']) assert.doesNotMatch(copied, new RegExp(`(^|\\s)${p}(/|\\s|$)`), p);
  assert.match(readFileSync('.gitignore', 'utf8'), /^dist\/$/m);
});

test('tools/serve.mjs serves another root (dist/) when asked', async () => {
  const { serve } = await import('../tools/serve.mjs');
  const root = mkdtempSync(join(tmpdir(), 'serve-')); mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'index.html'), '<p>dist</p>'); writeFileSync(join(root, 'src', 'a.js'), 'export {}');
  const server = await serve(0, { root });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal(await (await fetch(`${base}/`)).text(), '<p>dist</p>');
    const js = await fetch(`${base}/src/a.js`); assert.equal(js.status, 200); assert.match(js.headers.get('content-type'), /javascript/);
    assert.equal((await fetch(`${base}/package.json`)).status, 404, 'nothing outside the root');
  } finally { server.close(); }
});
