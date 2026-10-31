import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import * as THREE from '../vendor/three/three.module.js';
import { normalizeHeight, convertMaterial } from '../src/scene/assets.js';
test('normalizeHeight', () => assert.equal(normalizeHeight({ x: 1, y: 4, z: 1 }, 2), 0.5));
test('convertMaterial keeps colour/map, sets clay params, applies tint and glow by material name', () => {
  const src = new THREE.MeshStandardMaterial({ color: 0x123456, name: 'leafsGreen', metalness: 1 });
  const m = convertMaterial(THREE, src); assert.equal(m.roughness, 0.78); assert.equal(m.metalness, 0); assert.equal(m.color.getHex(), 0x123456);
  assert.equal(convertMaterial(THREE, src, { tint: { leaf: 0x9bbd7e } }).color.getHex(), 0x9bbd7e);
  const g = convertMaterial(THREE, src, { glow: { leaf: 0xff3fa0 } }); assert.equal(g.emissive.getHex(), 0xff3fa0);
});
test('first asset batch is present, CC0-listed and small', () => {
  const files = ['assets/kenney/nature/tree_default.glb','assets/kenney/nature/tree_oak.glb','assets/kenney/nature/tree_detailed.glb','assets/kenney/nature/tree_fat.glb','assets/kenney/nature/tree_small.glb','assets/quat/ships/Boat.glb','assets/quat/ships/BoatWSail.glb'];
  let total = 0; for (const f of files) { assert.ok(existsSync(f), f); total += statSync(f).size; }
  assert.ok(total < 1_000_000);
  const lic = readFileSync('assets/LICENSES.md', 'utf8'); assert.match(lic, /Kenney/); assert.match(lic, /Quaternius/); assert.match(lic, /CC0/);
});
test('every assets/<source>/<pack>/ folder has a CC0 row in LICENSES.md, and the rat and shiba are shipped', async () => {
  const { readdirSync } = await import('node:fs');
  const lic = readFileSync('assets/LICENSES.md', 'utf8');
  for (const src of ['kenney', 'quat', 'kaykit'].filter(s => existsSync(`assets/${s}`))) for (const pack of readdirSync(`assets/${src}`)) assert.ok(lic.includes(`\`${src}/${pack}/\``), `${src}/${pack}`);
  for (const f of ['assets/quat/enemies/Rat.glb', 'assets/quat/animals/ShibaInu.glb']) assert.ok(existsSync(f), f);
});
test('assets.release stops and forgets the animation mixer and glow materials of a spawned model (review #2)', async () => {
  const { createAssets } = await import('../src/scene/assets.js');
  const clip = new THREE.AnimationClip('Rat_Walk', 1, [new THREE.NumberKeyframeTrack('.position[x]', [0, 1], [0, 1])]);
  const loader = { load: (url, ok) => { const s = new THREE.Group(); s.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: 'Grey' }))); ok({ scene: s, animations: [clip] }); } };
  const assets = createAssets(THREE, { loader });
  const m = await assets.spawn('x.glb', { anim: 'walk', glow: { Grey: 0x5fcf7a } });
  assert.equal(assets.mixerCount, 1); assert.equal(assets.glowMaterials.length, 1);
  assets.release(m); assert.equal(assets.mixerCount, 0); assert.equal(assets.glowMaterials.length, 0);
});

// ── 合併載入（計畫 4 任務 3）：一個模型最多兩個 draw call（不發光一個、發光一個），顏色進頂點色 ──
const box = (name, x, color = 0xffffff) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({ name, color })); m.position.x = x; return m; };
const threeMeshScene = () => { const s = new THREE.Group(); s.add(box('Wall', -1, 0x808080), box('Roof', 0, 0x808080)); const g = new THREE.Group(); g.position.y = 1; g.add(box('Door', 1, 0x6a3b1f)); s.add(g); return s; };
const fakeLoader = scene => ({ load: (url, ok) => ok({ scene: scene(), animations: [] }) });
const meshesOf = o => { const out = []; o.traverse(x => { if (x.isMesh) out.push(x); }); return out; };
// 頂點色 → 每種顏色有幾個頂點（線性色比對，容許浮點誤差）
const colourCounts = geo => { const c = geo.attributes.color, out = new Map(); for (let i = 0; i < c.count; i++) { const k = [c.getX(i), c.getY(i), c.getZ(i)].map(v => v.toFixed(3)).join(','); out.set(k, (out.get(k) ?? 0) + 1); } return out; };
const key = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b].map(v => v.toFixed(3)).join(','); };

test('spawn with merge: a glb of three meshes with different material names becomes one Mesh whose vertex colours equal the tint per original material (review focus 4)', async () => {
  const { createAssets } = await import('../src/scene/assets.js');
  const assets = createAssets(THREE, { loader: fakeLoader(threeMeshScene) });
  const holder = await assets.spawn('x.glb', { h: 2, tint: { Wall: 0x112233, Roof: 0xd9a066 } });
  const ms = meshesOf(holder);
  assert.equal(ms.length, 1, 'one draw call');
  const [m] = ms;
  assert.ok(m.material.isMeshStandardMaterial && m.material.vertexColors && m.material.flatShading);
  assert.equal(m.material.emissiveIntensity * m.material.emissive.getHex(), 0, 'opaque mesh does not glow');
  const counts = colourCounts(m.geometry);
  assert.deepEqual([...counts.keys()].sort(), [key(0x112233), key(0xd9a066), key(0x6a3b1f)].sort());
  for (const hex of [0x112233, 0xd9a066, 0x6a3b1f]) assert.equal(counts.get(key(hex)), 36, 'each box = 12 triangles × 3 vertices');
  // 位置照原本的節點變換合併：門那塊在 y = 1 那一層，縮放後模型高 h = 2、腳底落地
  holder.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(holder);
  assert.ok(Math.abs(b.max.y - b.min.y - 2) < 1e-6 && Math.abs(b.min.y) < 1e-6, `height ${b.max.y - b.min.y}`);
});

test('merge keeps glow materials emissive via a second mesh at most (draw calls ≤ 2 per model)', async () => {
  const { createAssets } = await import('../src/scene/assets.js');
  const assets = createAssets(THREE, { loader: fakeLoader(threeMeshScene) });
  const holder = await assets.spawn('x.glb', { glow: { Door: 0xff3fa0 } });
  const ms = meshesOf(holder);
  assert.equal(ms.length, 2);
  const lit = ms.filter(m => m.material.emissiveIntensity > 0 && m.material.emissive.getHex());
  assert.equal(lit.length, 1); assert.equal(lit[0].material.emissive.getHex(), 0xff3fa0);
  assert.deepEqual([...colourCounts(lit[0].geometry)], [[key(0xff3fa0), 36]]);
  assert.equal(assets.glowMaterials.length, 1); assert.equal(assets.glowMaterials[0], lit[0].material);
  // 兩種發光色也只多一個 mesh（發光色走頂點色）
  const two = await assets.spawn('x.glb', { glow: { Door: 0xff3fa0, Roof: 0x3fd0ff } });
  assert.equal(meshesOf(two).length, 2);
  // release：材質是這個 holder 自己的，要 dispose；幾何是同一組 (path, tint, glow) 共用的快取，不 dispose
  let disposed = 0, geoDisposed = 0; for (const m of ms) { m.geometry.addEventListener('dispose', () => geoDisposed++); m.material.addEventListener('dispose', () => disposed++); }
  assets.release(holder);
  assert.equal(disposed, 2); assert.equal(geoDisposed, 0); assert.equal(assets.glowMaterials.length, 1, 'only the second model is still listed');
});

test('merged geometry is baked once per (path, tint, glow) and shared; materials stay per spawn', async () => {
  const { createAssets } = await import('../src/scene/assets.js');
  let loads = 0;
  const assets = createAssets(THREE, { loader: { load: (u, ok) => { loads++; ok({ scene: threeMeshScene(), animations: [] }); } } });
  const [a] = meshesOf(await assets.spawn('x.glb', { tint: { Wall: 0x112233 } }));
  const [b] = meshesOf(await assets.spawn('x.glb', { tint: { Wall: 0x112233 }, h: 3 }));
  const [c] = meshesOf(await assets.spawn('x.glb', { tint: { Wall: 0x445566 } }));
  assert.equal(a.geometry, b.geometry); assert.notEqual(a.geometry, c.geometry); assert.notEqual(a.material, b.material);
  assert.equal(loads, 1);
});

test('merge multiplies the source COLOR_0 into the baked colour', async () => {
  const { createAssets } = await import('../src/scene/assets.js');
  const scene = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 0, 0], 3));
    const s = new THREE.Group(); s.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ name: 'Paint', color: 0xffffff, vertexColors: true }))); return s;
  };
  const [m] = meshesOf(await createAssets(THREE, { loader: fakeLoader(scene) }).spawn('v.glb', { tint: { Paint: 0x4080ff } }));
  const t = new THREE.Color(0x4080ff), col = m.geometry.attributes.color;
  const got = i => [col.getX(i), col.getY(i), col.getZ(i)].map(v => +v.toFixed(4));
  assert.deepEqual(got(0), [t.r * 0.5, t.g * 0.5, t.b * 0.5].map(v => +v.toFixed(4)));
  assert.deepEqual(got(2), [t.r, 0, 0].map(v => +v.toFixed(4)));
});

test('a Kenney colormap glb (doubleSided) merges into one DoubleSide mesh with the palette colour baked in', async () => {
  const { GLTFLoader } = await import('../vendor/three/addons/loaders/GLTFLoader.js');
  const { createAssets } = await import('../src/scene/assets.js');
  // Node 沒有解 PNG 的能力：貼圖換成假的 1×1 圖，像素由 pixels 給（色票格 #336699）
  const fakeTexture = () => ({ name: 'fakeTexture', loadTexture: () => { const t = new THREE.Texture({ width: 1, height: 1 }); t.flipY = false; return Promise.resolve(t); } });
  const loader = { load: (url, ok, _, fail) => { const b = readFileSync(url); new GLTFLoader().register(fakeTexture).parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', ok, fail); } };
  const assets = createAssets(THREE, { base: 'assets/', loader, pixels: () => ({ width: 1, height: 1, data: new Uint8ClampedArray([0x33, 0x66, 0x99, 255]) }) });
  const src = await assets.load('kenney/food/cup-tea.glb');
  let sides = []; src.scene.traverse(o => { if (o.isMesh) sides.push(o.material.side); });
  assert.ok(sides.includes(THREE.DoubleSide), 'the source is doubleSided');
  const ms = meshesOf(await assets.spawn('kenney/food/cup-tea.glb'));
  assert.equal(ms.length, 1); assert.equal(ms[0].material.side, THREE.DoubleSide);
  assert.deepEqual([...colourCounts(ms[0].geometry).keys()], [key(0x336699)]);
  // 舊版 Kenney（材質色、單面）合併後維持單面
  const [speeder] = meshesOf(await createAssets(THREE, { base: 'assets/', loader }).spawn('kenney/space/craft_speederA.glb'));
  assert.equal(speeder.material.side, THREE.FrontSide);
});

test('merge: false keeps one mesh per source mesh with converted materials; animated or skinned models are never merged', async () => {
  const { createAssets } = await import('../src/scene/assets.js');
  const assets = createAssets(THREE, { loader: fakeLoader(threeMeshScene) });
  const plain = await assets.spawn('x.glb', { merge: false, tint: { Wall: 0x112233 } });
  const ms = meshesOf(plain);
  assert.equal(ms.length, 3); assert.equal(ms.find(m => m.material.name === 'Wall').material.color.getHex(), 0x112233);
  const clip = new THREE.AnimationClip('Walk', 1, [new THREE.NumberKeyframeTrack('.position[x]', [0, 1], [0, 1])]);
  const anim = createAssets(THREE, { loader: { load: (u, ok) => ok({ scene: threeMeshScene(), animations: [clip] }) } });
  assert.equal(meshesOf(await anim.spawn('x.glb', { anim: 'walk' })).length, 3);
});

test('merge bakes a colormap texture into vertex colours (Kenney kits) and a "#rrggbb" tint key recolours one swatch', async () => {
  const { createAssets } = await import('../src/scene/assets.js');
  // 2×1 的色票圖：左半紅、右半藍；三角形的 uv 落在哪半就拿哪色
  const image = { width: 2, height: 1 }, pixels = () => ({ width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]) });
  const scene = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0.2, 0.5, 0.3, 0.5, 0.25, 0.4, 0.7, 0.5, 0.8, 0.5, 0.75, 0.4], 2));
    const map = new THREE.Texture(image); map.flipY = false;
    const s = new THREE.Group(); s.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ name: 'colormap', map }))); return s;
  };
  const assets = createAssets(THREE, { loader: fakeLoader(scene), pixels });
  const [m] = meshesOf(await assets.spawn('k.glb'));
  assert.equal(m.material.map, null);
  assert.deepEqual([...colourCounts(m.geometry)].sort(), [[key(0xff0000), 3], [key(0x0000ff), 3]].sort());
  const [t] = meshesOf(await assets.spawn('k.glb', { tint: { '#0000ff': 0x9bbd7e } }));
  assert.deepEqual([...colourCounts(t.geometry)].sort(), [[key(0xff0000), 3], [key(0x9bbd7e), 3]].sort());
});

test('a downloaded glb loads through the real GLTFLoader and merges to one mesh carrying every material colour', async () => {
  const { GLTFLoader } = await import('../vendor/three/addons/loaders/GLTFLoader.js');
  const { createAssets } = await import('../src/scene/assets.js');
  const loader = { load: (url, ok, _, fail) => { const b = readFileSync(url); new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', ok, fail); } };
  const assets = createAssets(THREE, { base: 'assets/', loader });
  const path = 'quat/village/MarketStand_1.glb', src = await assets.load(path);
  const want = new Set(), mats = new Set(); let verts = 0;
  src.scene.traverse(o => {
    if (!o.isMesh) return; const g = o.geometry; verts += g.index ? g.index.count : g.attributes.position.count;
    for (const mt of [].concat(o.material)) { mats.add(mt.name); const c = /Wood/i.test(mt.name) ? new THREE.Color(0x9c7a4e) : mt.color; want.add([c.r, c.g, c.b].map(v => v.toFixed(3)).join(',')); }
  });
  assert.ok(mats.size >= 3, [...mats].join());
  const holder = await assets.spawn(path, { h: 1, tint: { Wood: 0x9c7a4e } });
  const ms = meshesOf(holder);
  assert.equal(ms.length, 1);
  assert.equal(ms[0].geometry.attributes.position.count, verts, 'every triangle survives the merge');
  const counts = colourCounts(ms[0].geometry);
  assert.deepEqual([...counts.keys()].sort(), [...want].sort(), 'tinted Wood*, every other material keeps its own colour');
});

test('every file in tools/assets.json is shipped under assets/<into>/, uncompressed, < 300 KB each, < 8 MB new in total, with a CC0 row', async () => {
  const entries = JSON.parse(readFileSync('tools/assets.json', 'utf8'));
  const lic = readFileSync('assets/LICENSES.md', 'utf8');
  let total = 0;
  for (const e of entries) {
    assert.ok(['kenney', 'quat', 'kaykit'].includes(e.source), e.pack);
    assert.match(lic, new RegExp('\\| `' + e.into + '/` \\|.*CC0'), e.into);
    for (const f of e.files) {
      const p = `assets/${e.into}/${f}`; assert.ok(existsSync(p), p);
      const size = statSync(p).size; assert.ok(size < 300_000, `${p} ${size}`);
      const txt = readFileSync(p).subarray(0, 64_000).toString('latin1');
      assert.doesNotMatch(txt, /KHR_draco_mesh_compression|EXT_meshopt_compression/, p);
    }
  }
  // 總量算整個資料夾（含 colormap.png、.bin 這些附檔）
  const { readdirSync } = await import('node:fs');
  for (const into of new Set(entries.map(e => e.into))) for (const f of readdirSync(`assets/${into}`, { recursive: true })) { const st = statSync(`assets/${into}/${f}`); if (st.isFile()) total += st.size; }
  assert.ok(total < 8_000_000, `${total}`);
});

test('docs/assets/manifest.md has one row per level of every item (60), each with a status', async () => {
  const { ITEMS, ORDER } = await import('../src/rules/spec.js');
  // 共用（鐵鎚）與結局／最終章（紅色飛天車）的列不是物品的級，不算
  const rows = readFileSync('docs/assets/manifest.md', 'utf8').split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| 物品') && !l.startsWith('| 共用') && !l.startsWith('| 結局')).map(l => l.split('|').map(s => s.trim()));
  for (const id of ORDER) for (let lv = 1; lv <= ITEMS[id].max; lv++) {
    const hit = rows.filter(r => r[1] === ITEMS[id].name && parseInt(r[2], 10) === lv);
    assert.equal(hit.length, 1, `${ITEMS[id].name} ${lv}`); assert.match(hit[0][6], /^(現有|換新|待做)/);
  }
  assert.equal(rows.length, ORDER.reduce((s, id) => s + ITEMS[id].max, 0));
});
// 截圖回報 draw call 要等模型載好（任務 12：演完那一幀模型還在載，少算 80 多個 call）：pending 數著載入中的 spawn
test('assets.pending counts spawns still loading (the shot report waits for 0)', async () => {
  const { createAssets } = await import('../src/scene/assets.js');
  let release;
  const gate = new Promise(r => { release = r; });
  const loader = { load: (url, ok) => { gate.then(() => { const scene = new THREE.Group(); scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())); ok({ scene, animations: [] }); }); } };
  const assets = createAssets(THREE, { loader });
  assert.equal(assets.pending, 0);
  const a = assets.spawn('a.glb'), b = assets.spawn('a.glb');
  assert.equal(assets.pending, 2);
  release(); await Promise.all([a, b]); assert.equal(assets.pending, 0);
  const bad = createAssets(THREE, { loader: { load: (u, ok, p, fail) => fail(new Error('404')) } });
  await assert.rejects(bad.spawn('x.glb')); assert.equal(bad.pending, 0, 'a failed load is not pending forever');
});
