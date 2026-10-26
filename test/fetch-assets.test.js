// tools/fetch-assets.mjs 的離線測試：網路換成假的 get，下載內容用 test/fixtures/fetch-assets/ 的小 zip。
//   kenney_fake-kit.zip：License.txt（CC0）、Models/GLB format/a|b|c|d.glb（a 引用 Textures/colormap.png，d 是 Draco 壓縮）、Models/FBX format/a.fbx
//   kaykit-fake-bits.zip：KayKit-Fake-Bits-1.0-main/addons/kaykit_fake_bits/Assets/LICENSE.txt、gltf/thing.gltf（+thing.bin、fake_texture.png）、gltf/other.gltf、obj/thing.obj
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchAssets, readZip, glbJson } from '../tools/fetch-assets.mjs';

const FIX = 'test/fixtures/fetch-assets/';
const glb = j => { let s = Buffer.from(JSON.stringify(j)); s = Buffer.concat([s, Buffer.alloc((4 - s.length % 4) % 4, 0x20)]); const h = Buffer.alloc(20); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(20 + s.length, 8); h.writeUInt32LE(s.length, 12); h.writeUInt32LE(0x4e4f534a, 16); return Buffer.concat([h, s]); };
const MIRROR = 'https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/';
const mirrorLicenses = [
  '| Pack id | Pack name | License | Source URL |', '| --- | --- | --- | --- |',
  '| `buildings_pack_2` | Ultimate Buildings Pack | CC0-1.0 | https://quaternius.com/packs/ultimatetexturedbuildings.html |',
  '| `qal_pack` | Some New Pack | QAL | https://quaternius.com/packs/new.html |',
  '', '| Pack id | Model directory |', '| --- | --- |', '| `buildings_pack_2` | `public/glb/buildings_pack_3/` |',
].join('\n');
const web = {
  'https://kenney.nl/assets/fake-kit': Buffer.from('<a href="https://kenney.nl/media/pages/assets/fake-kit/ab12-34/kenney_fake-kit.zip">Download</a>'),
  'https://kenney.nl/media/pages/assets/fake-kit/ab12-34/kenney_fake-kit.zip': readFileSync(FIX + 'kenney_fake-kit.zip'),
  'https://github.com/KayKit-Game-Assets/KayKit-Fake-Bits-1.0/archive/refs/heads/main.zip': readFileSync(FIX + 'kaykit-fake-bits.zip'),
  [MIRROR + 'LICENSES.md']: Buffer.from(mirrorLicenses),
  [MIRROR + 'public/glb/buildings_pack_3/Shop.glb']: glb({ asset: { version: '2.0' } }),
  [MIRROR + 'public/glb/qal_pack/X.glb']: glb({ asset: { version: '2.0' } }),
};
const fakeGet = seen => async url => { seen.push(url); if (!web[url]) throw new Error('404 ' + url); return web[url]; };
const LIC = '# 素材授權\n\n| 路徑 | 來源 | 授權 |\n|---|---|---|\n| `kenney/nature/` | Kenney — Nature Kit 2.1 | CC0 1.0 |\n\nCC0 全文：https://creativecommons.org/publicdomain/zero/1.0/\n';
const sandbox = () => { const root = mkdtempSync(join(tmpdir(), 'fetch-assets-')); mkdirSync(join(root, 'assets')); writeFileSync(join(root, 'assets/LICENSES.md'), LIC); return root; };
const entries = [
  { source: 'kenney', pack: 'fake-kit', files: ['a.glb', 'b.glb'], into: 'kenney/fake' },
  { source: 'quat', pack: 'buildings_pack_3', files: ['Shop.glb'], into: 'quat/shops' },
  { source: 'kaykit', pack: 'Fake-Bits', files: ['thing.gltf'], into: 'kaykit/fake' },
];

test('readZip lists and inflates both stored and deflated entries', () => {
  const k = readZip(readFileSync(FIX + 'kenney_fake-kit.zip'));
  assert.ok(k.has('Models/GLB format/a.glb') && k.has('License.txt'));
  assert.match(k.get('License.txt').toString(), /Creative Commons Zero/);
  assert.deepEqual(glbJson(k.get('Models/GLB format/a.glb')).images, [{ uri: 'Textures/colormap.png' }]);
  assert.match(readZip(readFileSync(FIX + 'kaykit-fake-bits.zip')).get('KayKit-Fake-Bits-1.0-main/addons/kaykit_fake_bits/Assets/gltf/thing.bin').toString('hex'), /^0{8}$/);
});

test('fetch-assets extracts only the listed files into the target dir and appends one LICENSES.md row per pack', async () => {
  const root = sandbox(), seen = [];
  const r = await fetchAssets({ entries, root, tmp: join(root, 'tmp'), get: fakeGet(seen), log: () => {} });
  assert.deepEqual(r.rejected, []);
  // Kenney：只有列出的 a、b（a 引用的色票圖一起帶），沒有 c、d、fbx
  assert.deepEqual(readdirSync(join(root, 'assets/kenney/fake'), { recursive: true }).sort(), ['Textures', 'Textures/colormap.png', 'a.glb', 'b.glb']);
  assert.deepEqual(readdirSync(join(root, 'assets/quat/shops')), ['Shop.glb']);
  assert.deepEqual(readdirSync(join(root, 'assets/kaykit/fake')).sort(), ['fake_texture.png', 'thing.bin', 'thing.gltf']);
  assert.ok(existsSync(join(root, 'tmp/kenney_fake-kit.zip')), 'downloads land in the temp dir');
  const lic = readFileSync(join(root, 'assets/LICENSES.md'), 'utf8'), rows = lic.split('\n').filter(l => l.startsWith('| `'));
  assert.equal(rows.length, 4, rows.join('\n'));
  assert.match(lic, /\| `kenney\/fake\/` \| Kenney — Fake Kit 1\.0（https:\/\/kenney\.nl\/assets\/fake-kit）.*License\.txt.* \| CC0 1\.0 \|/);
  assert.match(lic, /\| `quat\/shops\/` \| Quaternius — Ultimate Buildings Pack（https:\/\/quaternius\.com\/packs\/ultimatetexturedbuildings\.html）.*CC0-1\.0.* \| CC0 1\.0 \|/);
  assert.match(lic, /\| `kaykit\/fake\/` \| KayKit — Fake Bits 1\.0（Kay Lousberg，https:\/\/github\.com\/KayKit-Game-Assets\/KayKit-Fake-Bits-1\.0）.*LICENSE\.txt.* \| CC0 1\.0 \|/);
  assert.ok(lic.indexOf('`kaykit/fake/`') < lic.indexOf('CC0 全文'), 'rows stay inside the table');
  // 再跑一次：同一列就地更新，不重複
  await fetchAssets({ entries, root, tmp: join(root, 'tmp'), get: fakeGet([]), log: () => {} });
  assert.equal(readFileSync(join(root, 'assets/LICENSES.md'), 'utf8'), lic);
});

test('fetch-assets rejects Draco/meshopt files, files over 300 KB, missing files and non-CC0 packs instead of writing them', async () => {
  const root = sandbox();
  web[MIRROR + 'public/glb/buildings_pack_3/Big.glb'] = Buffer.concat([glb({ asset: { version: '2.0' } }), Buffer.alloc(300_000)]);
  const r = await fetchAssets({ root, tmp: join(root, 'tmp'), get: fakeGet([]), log: () => {}, entries: [
    { source: 'kenney', pack: 'fake-kit', files: ['d.glb', 'zzz.glb'], into: 'kenney/fake' },
    { source: 'quat', pack: 'buildings_pack_3', files: ['Big.glb'], into: 'quat/shops' },
    { source: 'quat', pack: 'qal_pack', files: ['X.glb'], into: 'quat/qal' },
  ] });
  const why = Object.fromEntries(r.rejected.map(x => [x.file, x.why]));
  assert.match(why['d.glb'], /KHR_draco_mesh_compression/); assert.match(why['zzz.glb'], /not in/); assert.match(why['Big.glb'], /300/);
  assert.match(why['quat/qal'], /CC0/);
  assert.ok(!existsSync(join(root, 'assets/kenney/fake/d.glb')) && !existsSync(join(root, 'assets/quat/shops/Big.glb')) && !existsSync(join(root, 'assets/quat/qal')));
  assert.doesNotMatch(readFileSync(join(root, 'assets/LICENSES.md'), 'utf8'), /quat\/qal|quat\/shops/, 'no row for a pack that shipped nothing');
});
