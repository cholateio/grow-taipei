import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { createPeople, ringPath } from '../src/scene/people.js';
import { createPartFactory, orbitPose } from '../src/actors/parts.js';
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

// 最終章（設計 §6）：矽盾擋下飛彈時碎成一發煙火——once 建好即終態（藏著、不自己放）；burst() 放一發（1.2 s，自己的時鐘，不看全域 t）
// 然後藏起來、一直藏著；再 burst() 再放一發（飛彈重新發射）、finish() 直接藏好
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

// ── 矽盾罩（晶片 Lv8／9、結局）：半球、半透明淡藍、六角格紋（程式產生的貼圖，快取共用），一個 mesh ──
import { SHIELD, SHIELD_TEST_DUR, shieldPose } from '../src/actors/parts.js';
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
test('shieldPose test: three opacity flashes, then it retracts to scale 0 and hides; done by SHIELD_TEST_DUR', () => {
  assert.equal(SHIELD.flashes, 3);
  let peaks = 0, prev = 0, rising = false;
  for (let t = 0; t <= SHIELD_TEST_DUR + 0.5; t += 1 / 60) {
    const p = shieldPose('test', t);
    if (p.opacity > prev) rising = true; else if (rising && p.opacity < prev) { peaks++; rising = false; assert.ok(prev > 0.4, `flash ${peaks} peak ${prev.toFixed(2)}`); }
    prev = p.opacity;
  }
  assert.equal(peaks, 3);
  const mid = shieldPose('test', SHIELD_TEST_DUR - SHIELD.retract / 2); assert.ok(mid.visible && mid.scale > 0.1 && mid.scale < 0.9, 'retracting');
  const end = shieldPose('test', SHIELD_TEST_DUR + 0.01); assert.equal(end.visible, false); assert.equal(end.scale, 0);
  assert.ok(SHIELD_TEST_DUR <= 4, `${SHIELD_TEST_DUR} s`);
});
test('shieldPose standby stays a faint outline forever (visible, opacity 0.06–0.22, brightens with the 101 pulse every 3 s); full is bright', () => {
  const ops = [];
  for (let t = 0; t < 30; t += 0.05) { const p = shieldPose('standby', t); assert.ok(p.visible && p.scale === 1); ops.push(p.opacity); }
  assert.ok(Math.min(...ops) >= 0.06 && Math.max(...ops) <= 0.22, `${Math.min(...ops)}–${Math.max(...ops)}`);
  assert.ok(Math.max(...ops) - Math.min(...ops) > 0.04, 'it pulses');
  assert.ok(Math.abs(shieldPose('standby', 1) .opacity - shieldPose('standby', 4).opacity) < 1e-9, 'period 3 s');
  assert.ok(shieldPose('full', 2).opacity >= 0.45 && shieldPose('full', 2).visible);
});
test('shield part follows shieldPose: a test shield is built already retracted; test() plays the flashes then hides, finish() jumps to the end; standby keeps a scrolling faint outline', () => {
  const { f } = setup(), p = shieldOf(f, 'test'), [m] = p.object.children, ops = [];
  assert.equal(m.visible, false, 'built retracted (a rebuild never replays the flashes)');
  run(p, 1); assert.equal(m.visible, false, 'stays retracted until the script starts the test');
  p.object.userData.test();
  run(p, SHIELD_TEST_DUR + 0.5, () => ops.push(m.visible ? m.material.opacity : 0));
  assert.ok(Math.max(...ops) > 0.4); assert.equal(m.visible, false); assert.equal(m.scale.x, 0);
  p.object.userData.test(); run(p, 0.5); assert.ok(m.visible); p.object.userData.finish(); assert.equal(m.visible, false); run(p, 1); assert.equal(m.visible, false);
  const s = shieldOf(f, 'standby'), [ms] = s.object.children, y0 = ms.material.map.offset.y;
  run(s, 2); assert.ok(ms.visible && ms.material.opacity < 0.25); assert.notEqual(ms.material.map.offset.y, y0, 'hex grid scrolls');
  for (const x of [p, s]) x.dispose();
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
// 裁決 R15：蒙太奇倍速——test({ speed: 2 }) 閃三下、收起來都快兩倍
test('shield test({ speed: 2 }) runs the flashes at double speed (hidden by half of SHIELD_TEST_DUR)', () => {
  const { f } = setup(), s = shieldOf(f, 'test'), [m] = s.object.children;
  s.object.userData.test({ speed: 2 }); run(s, SHIELD_TEST_DUR / 2 - 0.2); assert.ok(m.visible, 'still showing just before half time');
  run(s, 0.3); assert.equal(m.visible, false, 'retracted by half time');
  s.object.userData.test(); run(s, SHIELD_TEST_DUR / 2 + 0.1); assert.ok(m.visible, 'a plain test() is back to ×1');
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
const roadsterSpec = () => ({
  at: { x: 0, y: 0, z: 0 }, r: 2, h: 5, speed: 2.5, phase: 0, legs: [1.4, 1.0], squash: 0.03,
  park: { x: 5, y: 1, z: 0, yaw: -Math.PI / 2 }, ramp: { x: -0.35 * Math.cos(RAMP_A), y: 0.35 * Math.sin(RAMP_A), z: 0 },
});
const total = s => s.legs[0] + 2 * Math.PI / s.speed + s.legs[1];
test('orbitPose park + ramp: starts at park, climbs along the ramp direction, ends parked (done) with a squash in the last 0.3 s', () => {
  const s = roadsterSpec(), T = total(s), p0 = orbitPose(s, 0, 'park');
  assert.ok(Math.hypot(p0.x - 5, p0.y - 1, p0.z) < 1e-9 && Math.abs(p0.yaw - s.park.yaw) < 1e-9 && !p0.done, 'starts at park facing park.yaw');
  const mid = orbitPose(s, s.legs[0] / 2, 'park');
  assert.ok(mid.y > s.park.y + 0.05, `higher than park (${mid.y.toFixed(3)})`);
  assert.ok(Math.abs(mid.z) < 1e-9 && mid.x < s.park.x, 'xz on the ramp line, ahead of park');
  // 斜坡上：位置在 park 到坡頂那段線段上
  const onRamp = orbitPose(s, 0.3, 'park'), k = (s.park.x - onRamp.x) / -s.ramp.x;
  assert.ok(k > 0 && k < 1 && Math.abs(onRamp.y - (s.park.y + s.ramp.y * k)) < 1e-9, 'slides up the ramp');
  for (const t of [T, T + 5, Infinity]) { const e = orbitPose(s, t, 'park'); assert.deepEqual(e, { x: 5, y: 1, z: 0, yaw: s.park.yaw, done: true }); }
  for (const t of [T - 0.25, T - 0.15, T - 0.05]) {
    const p = orbitPose(s, t, 'park');
    assert.ok(p.squash > 0 && p.squash <= s.squash + 1e-9, `t ${t.toFixed(2)} squash ${p.squash}`);
    assert.ok(Math.hypot(p.x - 5, p.y - 1, p.z) < 1e-9 && Math.abs(p.yaw - s.park.yaw) < 1e-9, 'wheels on the roof, facing park.yaw');
  }
  assert.ok(!(orbitPose(s, T - 0.4, 'park').squash > 0), 'no squash before touchdown');
});
test('orbitPose puff: on the ramp (0.6 s before lift-off) and 0.3 s before touchdown, nowhere else; no puff/squash on specs without ramp/squash', () => {
  const s = roadsterSpec(), T = total(s), puff = t => orbitPose(s, t, 'park').puff;
  for (const t of [0, 0.3, 0.55]) assert.ok(puff(t) >= 0 && puff(t) < 1, `t ${t} puffing (${puff(t)})`);
  for (const t of [T - 0.55, T - 0.4]) assert.ok(puff(t) >= 0 && puff(t) < 1, `t ${t.toFixed(2)} puffing before touchdown`);
  for (const t of [0.65, 1.0, 2.5, T - 0.7, T - 0.2, T + 1]) assert.equal(puff(t) ?? null, null, `t ${t.toFixed(2)} no puff`);
  const plain = { at: { x: 0, y: 0, z: 0 }, r: 2, h: 4, speed: 2.5, legs: [1.2, 0.8], from: { x: 9, y: 3, z: 9 }, park: { x: 2, y: 1, z: 3 } };
  for (const t of [0, 0.3, total(plain) - 0.1]) { const p = orbitPose(plain, t); assert.equal(p.puff ?? null, null); assert.ok(!(p.squash > 0)); }
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
  p.object.userData.fly(); p.update(0.2, 0.2);
  assert.ok(Math.hypot(car.position.x - 5, car.position.z) < 0.35 && puffs[0].visible, 'on the ramp, puffing');
  p.update(1.0, 1.2); assert.ok(!puffs[0].visible, 'climbing: no puffs');
  p.object.userData.fly(); p.update(0.2, 0.2); p.object.userData.land(); assert.ok(!puffs[0].visible, 'land() hides the puffs');
  // 落地壓一下：最後 0.3 s 車身 y 方向壓扁、輪底（模型原點）還在停車點
  p.object.userData.fly(); p.update(total(s) - 0.15, 9);
  const m = body[0].parent === car ? body[0] : body[0].parent;
  assert.ok(Math.hypot(car.position.x - 5, car.position.y - 1, car.position.z) < 1e-9, 'on the roof');
  assert.ok(m.scale.y < 1, `squashed (scale.y ${m.scale.y.toFixed(3)})`);
  p.update(0.2, 9.2); assert.equal(m.scale.y, 1, 'springs back');
  p.dispose();
});
