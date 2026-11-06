import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { createPeople, ringPath } from '../src/scene/people.js';
import { createPartFactory, orbitPose, rampRest, rampSurface, RAMP_T } from '../src/actors/parts.js';
import { createPathCursor } from '../src/scene/path.js';

const setup = (extra = {}) => {
  const glow = createGlowRegistry(), people = createPeople(THREE, { max: 8 });
  const loaded = [];
  const assets = { spawn: async (path, o) => { const g = new THREE.Group(); g.name = path; o.parent?.add(g); loaded.push(g); return g; } };
  return { glow, people, assets, loaded, f: createPartFactory(THREE, { people, assets, glow, builders: {}, ...extra }) };
};
const at = { x: 1, y: 2, z: 3 };

test('compound: non-glow parts merge into one clay mesh, glow parts into their own registered mesh; dispose unregisters', () => {
  const { f, glow } = setup();
  const p = f.build({ kind: 'compound', at, parts: [{ kind: 'box', pos: [0, 0.5, 0], scale: 1, color: 0xff0000 }, { kind: 'sphere', pos: [0, 1, 0], scale: 0.3, color: 0xfcea8b, glow: 0xfcea8b }] });
  assert.equal(p.object.children.length, 2); assert.deepEqual(p.object.position.toArray(), [1, 2, 3]); assert.equal(glow.size, 1);
  assert.ok(p.object.children.every(m => m.castShadow));
  p.dispose(); assert.equal(glow.size, 0);
});
test('compound: same-material parts collapse into one mesh and the clay material is shared across compounds', () => {
  const { f } = setup();
  const box = c => ({ kind: 'box', pos: [0, 0, 0], scale: 1, color: c });
  const a = f.build({ kind: 'compound', at, parts: [box(0xff0000), box(0x00ff00), { kind: 'cone', pos: [0, 1, 0], scale: 1, color: 0x0000ff }] });
  const b = f.build({ kind: 'compound', at, parts: [box(0xff0000)] });
  assert.equal(a.object.children.length, 1); assert.equal(a.object.children[0].material, b.object.children[0].material);
  assert.ok(a.object.children[0].geometry.attributes.color, 'vertex colours carry the part colours');
});
// 計畫 13 任務 4（火山 builder）：零件也可以直接帶一份非索引的 geometry（builder 自己算的錐）——套位置矩陣、自己有頂點色就留著（沒有就塗 color），
// 跟 kit 零件併進同一個 mesh；帶 glow 的照樣進發光 mesh
test('compound: a part may carry its own non-indexed geometry (kept vertex colours) and merges with kit parts', () => {
  const { f, glow } = setup();
  const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(); g.deleteAttribute('uv');
  const cols = new Float32Array(g.attributes.position.count * 3).fill(0.5); g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const lava = new THREE.BoxGeometry(0.2, 0.2, 0.2).toNonIndexed(), before = [...g.attributes.position.array];
  const p = f.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: [
    { geometry: g, pos: [3, 0, 0] }, { kind: 'box', pos: [0, 0, 0], scale: 1, color: 0xff0000 }, { geometry: lava, pos: [0, 2, 0], color: 0xdb6a41, glow: 0xdb6a41 },
  ] });
  assert.equal(p.object.children.length, 2); assert.equal(glow.size, 1);
  const clay = p.object.children.find(m => !m.material.emissive?.getHex()), c = clay.geometry.attributes.color, q = clay.geometry.attributes.position;
  let grey = 0; for (let i = 0; i < q.count; i++) if (q.getX(i) > 2 && Math.abs(c.getX(i) - 0.5) < 1e-6) grey++;
  assert.equal(grey, g.attributes.position.count, 'own vertex colours kept, moved by pos');
  assert.deepEqual([...g.attributes.position.array], before, 'the source geometry is not modified');
});
// 修正輪 1（審稿 Minor）：帶 geometry 的零件入口防呆——索引幾何先攤平、沒有法線就自己算，照樣跟 kit 零件併得起來
test('compound: a geometry part that is indexed and has no normals is flattened and gets normals before merging', () => {
  const { f } = setup();
  const g = new THREE.BoxGeometry(1, 1, 1); g.deleteAttribute('normal'); g.deleteAttribute('uv');
  assert.ok(g.index && !g.attributes.normal);
  const p = f.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: [{ geometry: g, pos: [0, 0, 0], color: 0x00ff00 }, { kind: 'box', pos: [2, 0, 0], scale: 1, color: 0xff0000 }] });
  assert.equal(p.object.children.length, 1);
  const merged = p.object.children[0].geometry;
  assert.equal(merged.index, null); assert.ok(merged.attributes.normal && merged.attributes.color);
  assert.equal(merged.attributes.position.count, 36 * 2, 'two boxes, 36 vertices each');
  assert.ok(g.index && !g.attributes.normal, 'the source geometry is untouched');
});
test('compound applies part position, scale and rotation to the merged geometry', () => {
  const { f } = setup();
  const p = f.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: [{ kind: 'box', pos: [5, 0, 0], scale: [2, 1, 1], color: 0xffffff }] });
  const box = new THREE.Box3().setFromObject(p.object); assert.ok(Math.abs(box.min.x - 4) < 1e-6 && Math.abs(box.max.x - 6) < 1e-6);
});
test('people part spawns n walkers and removes them on dispose', () => {
  const { f, people } = setup();
  const p = f.build({ kind: 'people', at, n: 3, path: ringPath({ x: 0, z: 0 }, 1, 0.65), speed: 0.4, accessory: 'cap' });
  assert.equal(people.walkers.length, 3); p.dispose(); assert.equal(people.walkers.length, 0);
});
test('glb part: model loads under a holder at spec.at; a model arriving after dispose is dropped', async () => {
  const { f, loaded } = setup();
  const p = f.build({ kind: 'glb', at, path: 'quat/enemies/Rat.glb', h: 0.2 });
  await new Promise(r => setTimeout(r, 0)); assert.equal(loaded.length, 1); assert.ok(p.object.getObjectByName('quat/enemies/Rat.glb'));
  const q = f.build({ kind: 'glb', at, path: 'x.glb', h: 0.2 }); q.dispose(); await new Promise(r => setTimeout(r, 0));
  assert.equal(loaded[1].parent?.parent ?? null, null, 'late model not attached to a live holder');
});
test('glb loop: the model walks the world-space path (offset by spec.at)', async () => {
  const { f } = setup();
  const p = f.build({ kind: 'glb', at, path: 'a.glb', h: 0.2, loop: { path: ringPath({ x: 1, z: 3 }, 1, 2), speed: 1 } });
  await new Promise(r => setTimeout(r, 0)); p.update(0.3, 0.3);
  const m = p.object.children[0], w = new THREE.Vector3(); p.object.updateMatrixWorld(true); m.getWorldPosition(w);
  assert.ok(Math.abs(Math.hypot(w.x - 1, w.z - 3) - 1) < 0.05, 'stays on the ring');
});
test('smoke: puffs rise and fade, then wrap', () => {
  const { f } = setup();
  const p = f.build({ kind: 'smoke', at, n: 4, size: 0.3, rise: 1.8 });
  assert.equal(p.object.children.length, 4); p.update(0, 0);
  const y0 = p.object.children[0].position.y; p.update(0.5, 0.5);
  const c = p.object.children[0]; assert.ok(c.position.y > y0); assert.ok(c.material.opacity > 0 && c.material.opacity < 1);
});
test('module builders are dispatched by kind with (THREE, spec, ctx)', () => {
  let got; const { f } = setup({ builders: { crane: (T, spec, ctx) => { got = [T, spec, ctx]; return { object: new T.Group() }; } } });
  const p = f.build({ kind: 'crane', at }); assert.equal(got[0], THREE); assert.deepEqual(p.object.position.toArray(), [1, 2, 3]);
});
test('unknown kind throws with the kind name', () => { const { f } = setup(); assert.throws(() => f.build({ kind: 'nope', at }), /nope/); });
test('createPathCursor walks a closed loop and bounces on an open path', () => {
  const sq = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }];
  const c = createPathCursor(sq, { loop: true }); c.advance(1.5); const p = c.locate(); assert.ok(Math.abs(p.x - 1) < 1e-9 && Math.abs(p.z - 0.5) < 1e-9);
  c.advance(4); assert.ok(Math.abs(c.locate().x - 1) < 1e-9 && Math.abs(c.locate().z - 0.5) < 1e-9, 'wraps after 4');
  const o = createPathCursor(sq.slice(0, 2), { loop: false }); o.advance(1.5); assert.ok(Math.abs(o.locate().x - 0.5) < 1e-9, 'bounced back');
});
test('glb part releases its model from the asset system on dispose, and releases a model that loads after dispose (review #2)', async () => {
  const released = [], assets = { spawn: async () => new THREE.Group(), release: m => released.push(m) };
  const f = createPartFactory(THREE, { glow: createGlowRegistry(), assets, builders: {} });
  const a = f.build({ kind: 'glb', at, path: 'a.glb', h: 1 }); await new Promise(r => setTimeout(r, 0)); a.dispose();
  const b = f.build({ kind: 'glb', at, path: 'b.glb', h: 1 }); b.dispose(); await new Promise(r => setTimeout(r, 0));
  assert.equal(released.length, 2);
});
test('fireworks: one InstancedMesh of 60 sparks that bursts out from the centre and falls, no shadows', () => {
  const { f } = setup();
  const p = f.build({ kind: 'fireworks', at, colors: [0xff3fa0, 0x3fe0ff] }), mesh = p.object.children[0];
  assert.equal(mesh.count, 60); assert.equal(mesh.castShadow, false);
  const m = new THREE.Matrix4(), v = new THREE.Vector3(); p.update(0, 0.05); mesh.getMatrixAt(0, m); const r0 = v.setFromMatrixPosition(m).length();
  p.update(0, 0.5); mesh.getMatrixAt(0, m); assert.ok(v.setFromMatrixPosition(m).length() > r0, 'spreads out');
});

// 最終章（設計 §6）：矽盾擋下隕石時碎成一發煙火——once 建好即終態（藏著、不自己放）；burst() 放一發（1.2 s，自己的時鐘，不看全域 t）
// 然後藏起來、一直藏著；再 burst() 再放一發（隕石重新發射）、finish() 直接藏好
test('fireworks once: bursts for 1.2 s then hides the mesh and stays hidden', () => {
  const { f } = setup();
  const p = f.build({ kind: 'fireworks', at, once: true, colors: [0xff3fa0, 0x3fe0ff] }), mesh = p.object.children[0];
  const m = new THREE.Matrix4(), v = new THREE.Vector3(), r = () => { mesh.getMatrixAt(0, m); return v.setFromMatrixPosition(m).length(); };
  const play = (secs, t0 = 100) => { for (let i = 0; i < Math.round(secs * 30); i++) p.update(1 / 30, t0 + i / 30); };
  assert.equal(mesh.visible, false, 'built finished: hidden'); play(2); assert.equal(mesh.visible, false, 'does not burst on its own');
  p.object.userData.burst(); p.update(0.05, 100.05); assert.ok(mesh.visible, 'bursting'); const r0 = r();
  play(0.5); assert.ok(mesh.visible); assert.ok(r() > r0, 'spreads out on its own clock (global t ignored)');
  play(0.75); assert.equal(mesh.visible, false, 'hidden after 1.2 s');
  play(5); assert.equal(mesh.visible, false, 'stays hidden (no second burst)');
  p.object.userData.burst(); p.update(0.05, 0); assert.ok(mesh.visible, 'burst() fires again'); assert.ok(r() < r0 * 2, 'from the centre');
  play(1.3); assert.equal(mesh.visible, false);
  p.object.userData.burst(); p.update(0.05, 0); p.object.userData.finish(); assert.equal(mesh.visible, false, 'finish() hides at once');
  play(0.5); assert.equal(mesh.visible, false);
  // 沒有 once：照舊每 1.2 秒一發，一直看得到
  const loop = f.build({ kind: 'fireworks', at }); loop.update(0, 5); assert.ok(loop.object.children[0].visible);
  p.dispose(); loop.dispose();
});

// ── 矽盾罩（晶片 Lv9、結局；R48 起只剩待命與全亮）：半球、半透明淡藍、六角格紋（程式產生的貼圖，快取共用），一個 mesh ──
import * as partsMod from '../src/actors/parts.js';
const { SHIELD, shieldPose } = partsMod;
const shieldOf = (f, state, r = 7.6) => f.build({ kind: 'shield', at, r, state });
const run = (p, secs, fn) => { for (let i = 0; i < secs * 30; i++) { p.update(1 / 30, i / 30); fn?.(i / 30); } };
test('shield: one transparent basic mesh, single-sided, no depth write, hex-grid texture shared between builds; radius r, centred on at', () => {
  const { f } = setup(), a = shieldOf(f, 'standby'), b = shieldOf(f, 'full');
  assert.equal(a.object.children.length, 1);
  const [m] = a.object.children, mat = m.material;
  assert.ok(mat.isMeshBasicMaterial && mat.transparent && mat.depthWrite === false && mat.side !== THREE.DoubleSide);
  assert.ok(mat.map?.isDataTexture, 'procedural hex-grid texture'); assert.equal(b.object.children[0].material.map.source, mat.map.source, 'pixels generated once (each part clones the texture for its own scroll offset)');
  assert.equal(m.castShadow, false);
  const box = new THREE.Box3().setFromObject(a.object);
  assert.ok(Math.abs(box.max.y - (at.y + 7.6)) < 0.05 && Math.abs(box.min.y - at.y) < 0.05, 'a hemisphere standing on at');
  assert.ok(Math.abs(box.max.x - box.min.x - 15.2) < 0.1, 'radius r');
  // 貼圖：邊線不透明、格心淡
  const d = mat.map.image.data, alphas = new Set(); for (let i = 3; i < d.length; i += 4) alphas.add(d[i]);
  assert.ok(Math.max(...alphas) === 255 && Math.min(...alphas) < 80, 'bright hex edges over a faint fill');
  a.dispose(); b.dispose();
});
// R48（使用者 2026-11-06：矽盾只有在真結局才會長）：晶片 Lv8 的測試（閃三下）與隕石警告裡的試升失敗整段拿掉——只剩 standby／full
test('R48: shieldPose knows only standby and full; the test / fail poses and their durations are gone', () => {
  for (const state of ['test', 'fail']) assert.throws(() => shieldPose(state, 0), new RegExp(state));
  for (const k of ['SHIELD_TEST_DUR', 'SHIELD_FAIL', 'SHIELD_FAIL_DUR']) assert.equal(partsMod[k], undefined, k);
  for (const k of ['flashes', 'period', 'retract', 'test']) assert.equal(SHIELD[k], undefined, `SHIELD.${k}`);
});
test('shieldPose standby stays a faint outline forever (visible, opacity 0.06–0.22, brightens with the 101 pulse every 3 s); full is bright', () => {
  const ops = [];
  for (let t = 0; t < 30; t += 0.05) { const p = shieldPose('standby', t); assert.ok(p.visible && p.scale === 1); ops.push(p.opacity); }
  assert.ok(Math.min(...ops) >= 0.06 && Math.max(...ops) <= 0.22, `${Math.min(...ops)}–${Math.max(...ops)}`);
  assert.ok(Math.max(...ops) - Math.min(...ops) > 0.04, 'it pulses');
  assert.ok(Math.abs(shieldPose('standby', 1) .opacity - shieldPose('standby', 4).opacity) < 1e-9, 'period 3 s');
  assert.ok(shieldPose('full', 0.5).opacity >= 0.45 && shieldPose('full', 0.5).visible);
});
// 使用者 2026-11-04：「防護罩在擋完隕石就可以消失了」——full 從撞上那一刻（建好）算：0–0.8 s 全亮（煙火在這段放），
// 0.8–1.6 s 淡到 0、同時微微脹大 1 → 1.08，1.6 s 起藏起來（不畫，draw call 少一個）
test('shieldPose full: bright (SHIELD.full, scale 1) until 0.8 s, fades to 0 while swelling to 1.08× by 1.6 s, then hidden', () => {
  assert.deepEqual(SHIELD.fade, [0.8, 1.6]); assert.equal(SHIELD.swell, 1.08);
  for (let t = 0; t < 0.8; t += 0.05) assert.deepEqual(shieldPose('full', t), { opacity: SHIELD.full, scale: 1, visible: true }, `t ${t.toFixed(2)}`);
  let prev = shieldPose('full', 0.8);
  assert.ok(prev.visible && Math.abs(prev.opacity - SHIELD.full) < 1e-9 && Math.abs(prev.scale - 1) < 1e-9, 'continuous at 0.8 s');
  for (let t = 0.85; t < 1.6; t += 0.05) {
    const p = shieldPose('full', t);
    assert.ok(p.visible && p.opacity < prev.opacity && p.scale > prev.scale && p.scale < 1.08, `t ${t.toFixed(2)}: fading and swelling`);
    prev = p;
  }
  assert.ok(prev.opacity < 0.02 && prev.scale > 1.07, 'almost gone just before 1.6 s');
  for (const t of [1.6, 2, 10, Infinity]) { const p = shieldPose('full', t); assert.equal(p.visible, false, `t ${t}`); assert.equal(p.opacity, 0); }
});
// 罩子零件（full）建好時就是演完的樣子（藏著：跳過、截圖、舞台重建都沒有罩子）；隕石劇本叫 test() 才從撞上那一刻演，1.6 s 後自己藏好
test('shield builder, full: built hidden (the end state); test() plays it from impact — bright, then hidden again 1.6 s later', () => {
  const { f } = setup(), p = shieldOf(f, 'full'), [m] = p.object.children;
  assert.equal(m.visible, false, 'built hidden'); run(p, 0.5); assert.equal(m.visible, false, 'stays hidden until played');
  p.object.userData.test(); assert.ok(m.visible && Math.abs(m.material.opacity - SHIELD.full) < 1e-9, 'bright at impact');
  run(p, 0.5); assert.ok(m.visible && Math.abs(m.material.opacity - SHIELD.full) < 1e-9, 'still bright at 0.5 s');
  run(p, 1.2); assert.equal(m.visible, false, 'gone by 1.7 s');
  p.object.userData.test(); p.object.userData.finish(); assert.equal(m.visible, false, 'finish() jumps to hidden');
  p.dispose();
});
test('shield part follows shieldPose: standby keeps a scrolling faint outline from the first frame', () => {
  const { f } = setup(), s = shieldOf(f, 'standby'), [ms] = s.object.children, y0 = ms.material.map.offset.y;
  assert.ok(ms.visible, 'standby shows from the first frame');
  run(s, 2); assert.ok(ms.visible && ms.material.opacity < 0.25); assert.notEqual(ms.material.map.offset.y, y0, 'hex grid scrolls');
  s.dispose();
});

// ── 海底電纜（晶片 Lv6、燈泡 Lv8）：沿 path（世界座標）的管子；暗的時候一個黏土 mesh（連登陸桿），通電多一條發光管，progress 讓光從頭跑到尾 ──
const cablePath = [{ x: -3, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }, { x: 3, y: 0.5, z: 0 }];
const cableOf = (f, lit) => f.build({ kind: 'cable', at: { x: 3, y: 0, z: 0 }, path: cablePath, r: 0.05, lit, color: 0x211d1d, glow: 0x3fe0ff, parts: [{ kind: 'cylinder', pos: [0, 0.25, 0], scale: [0.05, 0.5, 0.05], color: 0x9c7a4e }] });
test('cable: dark = one clay mesh along the path (with the landing pole); lit adds one glowing tube; progress runs the light along it', () => {
  const { f } = setup(), dark = cableOf(f, false), lit = cableOf(f, true);
  assert.equal(dark.object.children.length, 1); assert.equal(lit.object.children.length, 2);
  const box = new THREE.Box3().setFromObject(dark.object);
  assert.ok(box.min.x < -2.9 + 0 && box.max.x > 2.9 && box.max.z > 1.9, 'follows the world path (offset by at)');
  const glow = lit.object.children.find(m => m.material.isMeshBasicMaterial);
  assert.ok(glow, 'lit tube is self-lit'); assert.equal(glow.material.color.getHex(), 0x3fe0ff);
  const total = glow.geometry.index ? glow.geometry.index.count : glow.geometry.attributes.position.count;
  lit.object.userData.progress(0); assert.equal(glow.geometry.drawRange.count, 0);
  lit.object.userData.progress(0.5); assert.ok(glow.geometry.drawRange.count > total * 0.4 && glow.geometry.drawRange.count < total * 0.6);
  lit.object.userData.progress(1); assert.ok(glow.geometry.drawRange.count >= total);
  dark.dispose(); lit.dispose();
});
// 裁決 R15：蒙太奇倍速——test({ speed: 2 }) 全亮、淡掉都快兩倍（R48 起只有 full 用 test()）
test('shield full test({ speed: 2 }) plays twice as fast (hidden by half of SHIELD.fade[1])', () => {
  const { f } = setup(), s = shieldOf(f, 'full'), [m] = s.object.children, half = SHIELD.fade[1] / 2;
  s.object.userData.test({ speed: 2 }); run(s, half - 0.2); assert.ok(m.visible, 'still showing just before half time');
  run(s, 0.3); assert.equal(m.visible, false, 'gone by half time');
  s.object.userData.test(); run(s, half + 0.1); assert.ok(m.visible, 'a plain test() is back to ×1');
  s.dispose();
});
// 裁決 R18：?quality=low（手機）的 draw call 預算 ≤ 150——飛天車、無人機（orbit）不畫；fly／land 照樣叫得動（劇本不用分）
test('quality low: an orbit part builds nothing but keeps fly/land callable', () => {
  const { f, loaded } = setup({ quality: 'low' });
  const p = f.build({ kind: 'orbit', at, path: 'x.glb', size: 0.3, r: 1, h: 2, speed: 1, from: at, park: { ...at, yaw: 0 } });
  assert.equal(p.object.children.length, 0); assert.equal(loaded.length, 0, 'no glb spawned');
  assert.doesNotThrow(() => { p.object.userData.fly({ delay: 0, speed: 2 }); p.object.userData.land(); p.update?.(0.1, 0.1); });
});
// 裁決 R18 審稿：?quality=low——compound 發光的部分照顏色併進同一個 mesh；low: false 的點綴零件不畫；煙最多兩團
test('quality low: a compound is one mesh (glow merged into clay), low:false parts build empty, smoke has ≤ 2 puffs', () => {
  const { f } = setup({ quality: 'low' }), meshes = o => { let n = 0; o.traverse(x => { if (x.isMesh) n++; }); return n; };
  const parts = [{ kind: 'box', pos: [0, 0, 0], scale: 1, color: 0xffffff }, { kind: 'box', pos: [1, 0, 0], scale: 1, color: 0xff0000, glow: 0xff0000 }];
  assert.equal(meshes(f.build({ kind: 'compound', at, parts }).object), 1);
  assert.equal(meshes(setup().f.build({ kind: 'compound', at, parts }).object), 2, 'normal quality keeps the glow mesh');
  const skip = f.build({ kind: 'compound', at, parts, low: false }); assert.equal(meshes(skip.object), 0); assert.deepEqual(skip.object.position.toArray(), [1, 2, 3]);
  assert.equal(meshes(f.build({ kind: 'smoke', at, n: 6 }).object), 2);
});
test('quality low: glb parts are spawned without glow (one merged mesh per model)', async () => {
  const seen = [], assets = { spawn: async (path, o) => { seen.push(o.glow); return new THREE.Group(); } };
  for (const quality of ['high', 'low']) setup({ quality, assets }).f.build({ kind: 'glb', at, path: 'x.glb', h: 1, glow: { Sign: 0xff3fa0 } });
  await Promise.resolve(); assert.deepEqual(seen, [{ Sign: 0xff3fa0 }, null]);
});

// ── 飛天車改 Tesla Roadster（設計 §4.6）：屋頂斜坡起飛（ramp）、冷氣體噴嘴冒白煙（puff）、四輪落地壓一下回彈（squash）──
// 停車點 (5, 1, 0)、圓心原點、phase 0 → 軌道入口 E = (2, 1 + 4, 0) 剛好在斜坡方向（−x）上
const RAMP_A = 20 * Math.PI / 180;
// 停車點 (5, 1, 0) 車頭朝 −x；坡腳在車鼻前 0.02（離原點 0.29）；圓心原點、phase 0 → 軌道入口 E = (2, 5, 0) 剛好在坡道方向上
const POINTS = [[-0.27, 0.015], [-0.17, 0], [0.17, 0], [0.27, 0.015]];
const roadsterSpec = () => ({
  at: { x: 0, y: 0, z: 0 }, r: 2, h: 5, speed: 2.5, phase: 0, legs: [1.4, 1.0], squash: 0.03,
  park: { x: 5, y: 1, z: 0, yaw: -Math.PI / 2 }, ramp: { foot: { x: 4.71, y: 1, z: 0 }, yaw: -Math.PI / 2, len: 0.35, angle: RAMP_A, points: POINTS },
});
const total = s => s.legs[0] + 2 * Math.PI / s.speed + s.legs[1];
// 車身在 pose 下各接觸點的世界位置（YXZ：先仰 pitch 再轉 yaw），換成離坡腳的水平距離 x、高 y
const contactsOf = (s, p) => POINTS.map(([a, u]) => {
  const th = p.pitch ?? 0, fa = a * Math.cos(th) - u * Math.sin(th), fy = a * Math.sin(th) + u * Math.cos(th);
  const wx = p.x + Math.sin(p.yaw) * fa, wz = p.z + Math.cos(p.yaw) * fa, r = s.ramp;
  return { x: (wx - r.foot.x) * Math.sin(r.yaw) + (wz - r.foot.z) * Math.cos(r.yaw), y: p.y + fy - r.foot.y, side: (wx - r.foot.x) * Math.cos(r.yaw) - (wz - r.foot.z) * Math.sin(r.yaw) };
});
test('orbitPose park + ramp: drives flat on the roof, climbs the ramp, then up the line to the orbit; ends parked (done) with a squash in the last 0.3 s', () => {
  const s = roadsterSpec(), T = total(s), p0 = orbitPose(s, 0, 'park');
  assert.ok(Math.hypot(p0.x - 5, p0.y - 1, p0.z) < 1e-9 && Math.abs(p0.yaw - s.park.yaw) < 1e-9 && !p0.done && !(p0.pitch > 0), 'starts at park facing park.yaw, level');
  const flat = orbitPose(s, 0.05, 'park'); assert.ok(flat.x < 5 && Math.abs(flat.y - 1) < 1e-9 && !(flat.pitch > 0), 'rolls forward flat on the roof first');
  const mid = orbitPose(s, s.legs[0] / 2, 'park');
  assert.ok(mid.y > s.park.y + 0.05, `higher than park (${mid.y.toFixed(3)})`);
  assert.ok(Math.abs(mid.z) < 1e-9 && mid.x < s.park.x, 'xz on the ramp line, ahead of park');
  for (const t of [T, T + 5, Infinity]) { const e = orbitPose(s, t, 'park'); assert.deepEqual(e, { x: 5, y: 1, z: 0, yaw: s.park.yaw, done: true }); }
  for (const t of [T - 0.25, T - 0.15, T - 0.05]) {
    const p = orbitPose(s, t, 'park');
    assert.ok(p.squash > 0 && p.squash <= s.squash + 1e-9, `t ${t.toFixed(2)} squash ${p.squash}`);
    assert.ok(Math.hypot(p.x - 5, p.y - 1, p.z) < 1e-9 && Math.abs(p.yaw - s.park.yaw) < 1e-9, 'wheels on the roof, facing park.yaw');
  }
  assert.ok(!(orbitPose(s, T - 0.4, 'park').squash > 0), 'no squash before touchdown');
});
test('orbitPose ramp leg rides the profile: no contact point below roof/ramp, one touching while the nose is on the ramp, pitch rising to lift-off; the climb starts where the ramp leg ends', () => {
  const s = roadsterSpec(), run = 0.35 * Math.cos(RAMP_A), surf = x => (x < 0 ? 0 : x * Math.tan(RAMP_A));
  let onRamp = 0, prevPitch = 0;
  for (let t = 0; t < RAMP_T; t += 0.01) {
    const p = orbitPose(s, t, 'park'), cs = contactsOf(s, p), nose = cs[3];
    for (const c of cs) if (c.x <= run) assert.ok(c.y >= surf(c.x) - 1e-6, `t ${t.toFixed(2)}: contact at x ${c.x.toFixed(3)} is ${(c.y - surf(c.x)).toFixed(4)} below the surface`);
    if (nose.x >= 0.05 && nose.x <= run) {
      onRamp++;
      const gap = Math.min(...cs.filter(c => c.x >= 0 && c.x <= run).map(c => c.y - surf(c.x)));
      assert.ok(gap <= 0.01, `t ${t.toFixed(2)}: underside ${gap.toFixed(4)} above the ramp`);
    }
    assert.ok((p.pitch ?? 0) >= prevPitch - 1e-6, 'pitch only rises on the way up'); prevPitch = p.pitch ?? 0;
  }
  assert.ok(onRamp >= 10, `the nose spends frames on the ramp (${onRamp})`);
  const end = orbitPose(s, RAMP_T - 1e-9, 'park'), climb = orbitPose(s, RAMP_T, 'park');
  assert.ok(Math.hypot(end.x - climb.x, end.y - climb.y, end.z - climb.z) < 0.01 && Math.abs(end.pitch - climb.pitch) < 0.01, 'no jump at lift-off');
  assert.ok(end.pitch > 0.1, `pitched up at lift-off (${end.pitch.toFixed(3)} rad)`);
  const front = contactsOf(s, end)[2]; assert.ok(Math.abs(front.x - run) < 0.01, 'front wheels at the top of the ramp when it lifts off');
  const r0 = rampRest(s.ramp, -0.4); assert.ok(r0.th === 0 && Math.abs(r0.y0) < 1e-9, 'level on the flat roof');
  assert.equal(rampSurface(s.ramp, run + 0.01), -Infinity, 'nothing beyond the top');
});
test('orbitPose puff: once the nose is over the ramp and 0.3 s before touchdown, nowhere else; no puff/squash on specs without ramp/squash; bad legs throw', () => {
  const s = roadsterSpec(), T = total(s), puff = t => orbitPose(s, t, 'park').puff;
  for (const t of [0, 0.05]) assert.equal(puff(t) ?? null, null, `t ${t}: still rolling on the roof`);
  for (const t of [0.3, 0.55]) assert.ok(puff(t) >= 0 && puff(t) < 1, `t ${t} puffing (${puff(t)})`);
  for (const t of [T - 0.55, T - 0.4]) assert.ok(puff(t) >= 0 && puff(t) < 1, `t ${t.toFixed(2)} puffing before touchdown`);
  for (const t of [0.65, 1.0, 2.5, T - 0.7, T - 0.2, T + 1]) assert.equal(puff(t) ?? null, null, `t ${t.toFixed(2)} no puff`);
  const plain = { at: { x: 0, y: 0, z: 0 }, r: 2, h: 4, speed: 2.5, legs: [1.2, 0.8], from: { x: 9, y: 3, z: 9 }, park: { x: 2, y: 1, z: 3 } };
  for (const t of [0, 0.3, total(plain) - 0.1]) { const p = orbitPose(plain, t); assert.equal(p.puff ?? null, null); assert.ok(!(p.squash > 0)); }
  assert.throws(() => orbitPose({ ...s, legs: [0.5, 1] }, 0, 'park'), /park 5\.00, 0\.00.*legs\[0\]/);
  assert.throws(() => orbitPose({ ...s, legs: [1.4, 0.3] }, 0, 'park'), /legs\[1\]/);
});
test('orbit with model.parts: built from primitives (no glb spawned, one mesh); puffs show on the ramp and hide once flying and after land()', () => {
  const { f, loaded } = setup(), s = { kind: 'orbit', ...roadsterSpec(), model: { parts: [
    { kind: 'box', pos: [0, 0.08, 0], scale: [0.27, 0.07, 0.54], color: 0xdb6a41 },
    { kind: 'cylinder', pos: [0.12, 0.04, 0.17], scale: [0.08, 0.035, 0.08], rot: [0, 0, Math.PI / 2], color: 0x211d1d },
  ] } };
  const p = f.build(s), car = p.object.children[0], meshes = o => { const n = []; o.traverse(x => { if (x.isMesh || x.isInstancedMesh) n.push(x); }); return n; };
  assert.equal(loaded.length, 0, 'no glb');
  const puffs = meshes(car).filter(m => m.isInstancedMesh), body = meshes(car).filter(m => !m.isInstancedMesh);
  assert.equal(body.length, 1, 'one merged clay mesh'); assert.equal(puffs.length, 1); assert.equal(puffs[0].count, 3, 'three puffs');
  assert.ok(!puffs[0].visible, 'parked: no puffs');
  p.object.userData.fly({ delay: 0.2 }); p.update(0.1, 0.1); assert.ok(!puffs[0].visible, 'waiting for its stagger: no puffs');
  p.object.userData.fly(); p.update(0.3, 0.3);
  assert.ok(Math.hypot(car.position.x - 5, car.position.z) < 0.6 && puffs[0].visible, 'on the ramp, puffing');
  p.update(1.0, 1.2); assert.ok(!puffs[0].visible, 'climbing: no puffs');
  p.object.userData.fly(); p.update(0.3, 0.3); p.object.userData.land(); assert.ok(!puffs[0].visible, 'land() hides the puffs');
  // 落地壓一下：最後 0.3 s 車身 y 方向壓扁、輪底（模型原點）還在停車點
  p.object.userData.fly(); p.update(total(s) - 0.15, 9);
  const m = body[0].parent === car ? body[0] : body[0].parent;
  assert.ok(Math.hypot(car.position.x - 5, car.position.y - 1, car.position.z) < 1e-9, 'on the roof');
  assert.ok(m.scale.y < 1, `squashed (scale.y ${m.scale.y.toFixed(3)})`);
  p.update(0.2, 9.2); assert.equal(m.scale.y, 1, 'springs back');
  p.dispose();
});
