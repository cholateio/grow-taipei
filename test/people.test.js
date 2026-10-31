import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { walkPose, ringPath, SHIRTS, createPeople, WALK_RADIUS, ACCESSORIES, duckPose } from '../src/scene/people.js';
import { R } from '../src/scene/hex.js';
test('walkPose amplitudes', () => {
  const p = walkPose(Math.PI / 2); assert.ok(Math.abs(p.leg - .55) < 1e-9); assert.ok(Math.abs(p.arm + .45) < 1e-9); assert.ok(Math.abs(p.bob - .012) < 1e-9);
  assert.equal(walkPose(0).leg, 0);
});
test('ringPath is a closed loop on the ring', () => {
  const p = ringPath({ x: 1, z: 2 }, 1.8, 0.65, 24); assert.equal(p.length, 24);
  for (const q of p) { assert.ok(Math.abs(Math.hypot(q.x - 1, q.z - 2) - 1.8) < 1e-9); assert.equal(q.y, 0.65); }
});
test('islanders walk inside the hexagon (WALK_RADIUS below the inradius)', () => {
  assert.ok(WALK_RADIUS < R * Math.sqrt(3) / 2 - 0.1);
});
test('eight shirt colours', () => assert.equal(SHIRTS.length, 8));
test('spawn/remove keeps instanced part counts in step and walkers move along the path', () => {
  const people = createPeople(THREE, { max: 4 });
  const a = people.spawn({ path: ringPath({ x: 0, z: 0 }, 1.5, 0.65), speed: 0.4 });
  const b = people.spawn({ path: ringPath({ x: 4, z: 0 }, 1.5, 0.65), speed: 0.4 });
  const counts = () => people.group.children.map(m => m.count);
  assert.ok(counts().every(n => n > 0));
  const before = { ...a.pos }; people.update(0.5, 0.5, 20);
  assert.ok(Math.hypot(a.pos.x - before.x, a.pos.z - before.z) > 0.15);
  const full = counts(); b.remove(); assert.ok(counts().every((n, i) => n < full[i]));
  assert.throws(() => { for (let i = 0; i < 5; i++) people.spawn({ path: ringPath({ x: 0, z: 0 }, 1, 0.65) }); }, /max/);
});
test('accessories: coat paints the shirt white and shows a badge; bike hides the legs and shows wheels', () => {
  const people = createPeople(THREE, { max: 4 });
  people.spawn({ path: ringPath({ x: 0, z: 0 }, 1, 0.65), accessory: 'coat' });
  const col = new THREE.Color(); people.group.getObjectByName('people:body').getColorAt(0, col); assert.equal(col.getHex(), 0xffffff);
  people.spawn({ path: ringPath({ x: 0, z: 0 }, 1, 0.65), accessory: 'bike' }); people.update(0.016, 0.016);
  const m = new THREE.Matrix4(), s = new THREE.Vector3(), scaleOf = (name, i) => { people.group.getObjectByName(name).getMatrixAt(i, m); m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s); return s.x; };
  assert.equal(scaleOf('people:legL', 1), 0); assert.ok(scaleOf('people:wheelF', 1) > 0); assert.equal(scaleOf('people:wheelF', 0), 0);
  assert.ok(scaleOf('people:badge', 0) > 0); assert.equal(scaleOf('people:badge', 1), 0);
});
test('helmet, suitcase and magnifier each show only on their wearer', () => {
  const people = createPeople(THREE, { max: 4 }), m = new THREE.Matrix4(), s = new THREE.Vector3();
  const scaleOf = (name, i) => { people.group.getObjectByName(name).getMatrixAt(i, m); m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s); return s.x; };
  for (const a of ['helmet', 'suitcase', 'glass']) people.spawn({ path: ringPath({ x: 0, z: 0 }, 1, 0.65), accessory: a });
  people.update(0.016, 0.016);
  assert.ok(scaleOf('people:helmet', 0) > 0 && scaleOf('people:helmet', 1) === 0);
  assert.ok(scaleOf('people:case', 1) > 0 && scaleOf('people:case', 2) === 0);
  assert.ok(scaleOf('people:lens', 2) > 0 && scaleOf('people:lens', 0) === 0);
});
test('stand: no path needed, stays put, faces yaw, does not swing its legs', () => {
  const people = createPeople(THREE, { max: 2 }); const w = people.spawn({ stand: { x: 1, y: 0.65, z: 2, yaw: 1 } });
  people.update(0.5, 0.5); assert.deepEqual([w.pos.x, w.pos.z], [1, 2]);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(); people.group.getObjectByName('people:body').getMatrixAt(0, m); m.decompose(new THREE.Vector3(), q, new THREE.Vector3());
  assert.ok(Math.abs(new THREE.Euler().setFromQuaternion(q).y - 1) < 1e-6);
  const a = new THREE.Matrix4(), b = new THREE.Matrix4(); people.group.getObjectByName('people:legL').getMatrixAt(0, a); people.update(0.3, 0.8); people.group.getObjectByName('people:legL').getMatrixAt(0, b);
  assert.ok(a.equals(b), 'legs still');
});
test('scale multiplies the whole figure', () => {
  const people = createPeople(THREE, { max: 2 }); people.spawn({ stand: { x: 0, y: 0, z: 0, yaw: 0 } }); people.spawn({ stand: { x: 2, y: 0, z: 0, yaw: 0 }, scale: 1.3 });
  people.update(0, 0, 20); const m = new THREE.Matrix4(), s = new THREE.Vector3(), head = people.group.getObjectByName('people:head');
  head.getMatrixAt(0, m); m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s); const k0 = s.x;
  head.getMatrixAt(1, m); m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s); assert.ok(Math.abs(s.x / k0 - 1.3) < 1e-6);
});
test('ACCESSORIES lists the eleven kinds', () => assert.deepEqual(ACCESSORIES, ['none', 'cap', 'coat', 'suitcase', 'glass', 'helmet', 'bike', 'mortar', 'vest', 'uniform', 'apron']));
test('mortar board: a flat black square on the head, only on its wearer', () => {
  const people = createPeople(THREE, { max: 2 }), m = new THREE.Matrix4(), s = new THREE.Vector3();
  people.spawn({ stand: { x: 0, y: 0, z: 0, yaw: 0 }, accessory: 'mortar' }); people.spawn({ stand: { x: 1, y: 0, z: 0, yaw: 0 } }); people.update(0, 0);
  const mesh = people.group.getObjectByName('people:mortar'); mesh.getMatrixAt(0, m); m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s); assert.ok(s.x > 0);
  mesh.getMatrixAt(1, m); m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s); assert.equal(s.x, 0);
});
test('a controlled walker stays where setPose puts it and only swings legs while walking', () => {
  const people = createPeople(THREE, { max: 4 }); const w = people.spawn({ controlled: true });
  w.setPose({ x: 1, y: 0.65, z: 2, yaw: 0.5, walking: false }); people.update(0.5, 0.5); assert.deepEqual(w.pos, { x: 1, y: 0.65, z: 2 });
  const m = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion();
  const legRx = () => { people.group.getObjectByName('people:legL').getMatrixAt(0, m); m.decompose(new THREE.Vector3(), q, new THREE.Vector3()); return e.setFromQuaternion(q).x; };
  const still = legRx(); w.setPose({ x: 1, y: 0.65, z: 2, yaw: 0.5, walking: true }); people.update(0.016, 0.7); assert.notEqual(legRx(), still);
});
test('new accessories vest, uniform and apron show only on their wearer; setAccessory swaps in place', () => {
  const people = createPeople(THREE, { max: 4 }), m = new THREE.Matrix4(), s = new THREE.Vector3();
  const scaleOf = (name, i) => { people.group.getObjectByName(name).getMatrixAt(i, m); m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s); return s.x; };
  const a = people.spawn({ controlled: true, accessory: 'vest' }), b = people.spawn({ controlled: true, accessory: 'uniform' }), c = people.spawn({ controlled: true, accessory: 'apron' });
  people.update(0.016, 0.016);
  assert.ok(scaleOf('people:vest', 0) > 0 && scaleOf('people:vest', 1) === 0);
  assert.ok(scaleOf('people:cap', 1) > 0 && scaleOf('people:cap', 0) === 0);
  assert.ok(scaleOf('people:apron', 2) > 0 && scaleOf('people:apron', 0) === 0);
  const col = new THREE.Color(); people.group.getObjectByName('people:cap').getColorAt(1, col); assert.equal(col.getHex(), 0x3f5a8a);
  b.setAccessory('glass'); people.update(0.016, 0.03); assert.equal(scaleOf('people:cap', 1), 0); assert.ok(scaleOf('people:lens', 1) > 0);
  assert.ok(ACCESSORIES.includes('vest') && ACCESSORIES.includes('uniform') && ACCESSORIES.includes('apron'));
});
test('gestures: knock leans the body, jump lifts it, look overrides yaw', () => {
  const people = createPeople(THREE, { max: 2 }); const w = people.spawn({ controlled: true }); w.setPose({ x: 0, y: 0, z: 0, yaw: 0, walking: false });
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const bodyAt = () => { people.group.getObjectByName('people:body').getMatrixAt(0, m); m.decompose(p, q, new THREE.Vector3()); return { y: p.y, rx: e.setFromQuaternion(q).x, ry: e.y }; };
  people.update(0.016, 0); const base = bodyAt();
  w.gesture = { kind: 'knock', k: 0.125 }; people.update(0.016, 0); assert.ok(Math.abs(bodyAt().rx - base.rx) > 0.2);
  w.gesture = { kind: 'jump', k: 0.25 }; people.update(0.016, 0); assert.ok(bodyAt().y - base.y > 0.09);
  w.gesture = { kind: 'look', k: 0.5, yaw: 1.2 }; people.update(0.016, 0); assert.ok(Math.abs(bodyAt().ry - 1.2) < 1e-6);
  w.gesture = null; people.update(0.016, 0); assert.ok(Math.abs(bodyAt().y - base.y) < 1e-9);
});
// look 沒帶 yaw：照原本朝向，不能讓矩陣變 NaN（終審 Minor 3）
test('look without a yaw keeps the walker facing and the body matrix finite', () => {
  const people = createPeople(THREE, { max: 2 }); const w = people.spawn({ controlled: true }); w.setPose({ x: 0.3, y: 0, z: 0.2, yaw: 0.7, walking: false });
  w.gesture = { kind: 'look', k: 0.5 }; people.update(0.016, 0);
  const m = new THREE.Matrix4(); people.group.getObjectByName('people:body').getMatrixAt(0, m);
  assert.ok(m.elements.every(Number.isFinite), 'body matrix is finite');
});
// 蓋東西（§14.2；計畫 11 §設計 4）：右手拿鐵鎚敲一下——前 45 % 舉起（手從垂著舉過頭、身體後仰 0.05 rad）、
// 接著 15 % 落下（手揮到身前、身體前傾 0.15 rad）、最後 40 % 停住。鐵鎚借 handle（握柄 0.14、木頭）和 case（鎚頭 0.05 × 0.05 × 0.08、鐵灰）
// 兩個零件，只在動作中換上鐵鎚的大小與顏色；轉向建築用 0.2 秒轉過去，不在一幀內翻面
test("gesture 'build' is one hammer blow: raise 45 %, strike 15 %, hold 40 %, with a visible wood-and-steel hammer only while the gesture runs", () => {
  const people = createPeople(THREE, { max: 2 }); const w = people.spawn({ controlled: true }); w.setPose({ x: 0, y: 0, z: 0, yaw: 0, walking: false });
  const m = new THREE.Matrix4(), s = new THREE.Vector3(), c = new THREE.Color();
  // 繞 x 的總角度（rx 會超過 ±π/2，不用 Euler 拆）：rx(a) 的矩陣 e[5] = cos a、e[6] = sin a（朝向 yaw 0）
  const rxOf = name => { people.group.getObjectByName(name).getMatrixAt(0, m); return Math.atan2(m.elements[6], m.elements[5]); };
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const leanOf = () => rxOf('people:body');                     // 身體前傾（正）／後仰（負）
  const armOf = () => wrap(rxOf('people:armR') - leanOf());     // 手臂相對身體：0 垂著、−π 舉直
  const scaleOf = name => { people.group.getObjectByName(name).getMatrixAt(0, m); m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s); return s.clone(); };
  const posOf = name => { people.group.getObjectByName(name).getMatrixAt(0, m); return new THREE.Vector3().setFromMatrixPosition(m); };
  const colorOf = name => { people.group.getObjectByName(name).getColorAt(0, c); return c.getHex(); };
  const yawOf = () => { people.group.getObjectByName('people:body').getMatrixAt(0, m); return Math.atan2(m.elements[8], m.elements[10]); };
  const build = (k, yaw, dur = 1.6) => { w.gesture = { kind: 'build', k, dur, ...(yaw === undefined ? {} : { yaw }) }; people.update(0.016, 0); };
  people.update(0.016, 0);
  assert.equal(scaleOf('people:handle').x, 0); assert.equal(scaleOf('people:case').x, 0);
  const handleInk = colorOf('people:handle');
  // 舉起：k 0 → 0.45 手一路往上（角度一路變小），身體慢慢後仰到 0.05
  build(0); assert.ok(Math.abs(armOf()) < 0.05, `starts from rest (${armOf().toFixed(2)})`); assert.ok(Math.abs(leanOf()) < 1e-6);
  let prev = armOf();
  for (let i = 1; i <= 9; i++) {
    build(i * 0.05); const a = armOf(); assert.ok(a < prev + 1e-9, `raising at k ${(i * 0.05).toFixed(2)}`); prev = a;
    assert.ok(scaleOf('people:handle').x > 0 && scaleOf('people:case').x > 0, `hammer shown at k ${(i * 0.05).toFixed(2)}`);
  }
  build(0.45); assert.ok(armOf() < -2.6, `overhead at k 0.45 (${armOf().toFixed(2)})`); assert.ok(Math.abs(leanOf() + 0.05) < 1e-6, `leans back 0.05 (${leanOf().toFixed(3)})`);
  assert.ok(posOf('people:case').y > 0.4, `hammer head above the head (${posOf('people:case').y.toFixed(2)})`);
  const up = armOf();
  // 落下：k 0.45 → 0.6 揮到身前（比舉起快得多），身體前傾 0.15；鎚頭在身前、低處
  build(0.525); assert.ok(armOf() > up && armOf() < -1.0, `mid-strike (${armOf().toFixed(2)})`);
  build(0.6); const down = armOf();
  assert.ok(down > -1.1 && down < -0.4, `down in front at k 0.6 (${down.toFixed(2)})`); assert.ok(Math.abs(leanOf() - 0.15) < 1e-6, `leans forward 0.15 (${leanOf().toFixed(3)})`);
  assert.ok((down - up) / 0.15 > 2 * (0 - up) / 0.45, 'the strike is at least twice as fast as the raise');
  const head = posOf('people:case'); assert.ok(head.z > 0.12 && head.y < 0.15, `hammer head low in front (${head.y.toFixed(2)}, ${head.z.toFixed(2)})`);
  // 停住：0.6 → 1 一動不動
  for (const k of [0.7, 0.85, 1]) { build(k); assert.ok(Math.abs(armOf() - down) < 1e-6 && Math.abs(leanOf() - 0.15) < 1e-6, `holds at k ${k}`); }   // 實例矩陣是 float32
  // 鐵鎚：握柄 0.14、鎚頭 0.05 × 0.05 × 0.08，鎚頭在握柄末端（兩個中心相距半根握柄）
  build(0.3);
  assert.ok(Math.abs(scaleOf('people:handle').y * 0.05 - 0.14) < 1e-6, `handle 0.14 long (${(scaleOf('people:handle').y * 0.05).toFixed(3)})`);
  const hd = scaleOf('people:case'); assert.ok(Math.abs(hd.x * 0.07 - 0.05) < 1e-6 && Math.abs(hd.y * 0.09 - 0.05) < 1e-6 && Math.abs(hd.z * 0.04 - 0.08) < 1e-6, 'head 0.05 × 0.05 × 0.08');
  assert.ok(Math.abs(posOf('people:case').distanceTo(posOf('people:handle')) - 0.07) < 1e-6, 'head at the end of the handle');
  assert.equal(colorOf('people:handle'), 0x9b6b43, 'wooden handle while building'); assert.equal(colorOf('people:case'), 0x8a8f96, 'steel head');
  // 短的按一下（燈泡開關 0.25 s）：同一套兩段，只是壓縮
  build(0.45, undefined, 0.25); assert.ok(armOf() < -2.6, 'a short press still raises to overhead at k 0.45');
  build(0.6, undefined, 0.25); assert.ok(Math.abs(armOf() - down) < 1e-6, 'and strikes down by k 0.6');
  // 轉向：0 → 接近 180° 用 0.2 秒（k × dur）轉過去
  build(0, 3.0); assert.ok(Math.abs(yawOf()) < 1e-6, 'no snap at the first frame');
  build(0.05 / 1.6, 3.0); const mid = yawOf(); assert.ok(mid > 0.3 && mid < 2.7, `easing (${mid.toFixed(2)})`);
  build(0.2 / 1.6, 3.0); assert.ok(Math.abs(yawOf() - 3.0) < 1e-6, 'faces the building after 0.2 s');
  w.gesture = { kind: 'wave', k: 0.3 }; people.update(0.016, 0); assert.equal(scaleOf('people:handle').x, 0, 'not on other gestures');
  assert.equal(colorOf('people:handle'), handleInk, 'handle colour restored');
  w.gesture = null; people.update(0.016, 0); assert.equal(scaleOf('people:handle').x, 0); assert.equal(scaleOf('people:case').x, 0);
  assert.ok(Math.abs(leanOf()) < 1e-6, 'upright again');
  assert.equal(people.group.getObjectByName('people:toolHandle'), undefined, 'no extra meshes (draw calls)');
});
test('look on a walker eases the turn over 0.2 s instead of snapping', () => {
  const people = createPeople(THREE, { max: 2 }); const w = people.spawn({ controlled: true }); w.setPose({ x: 0, y: 0, z: 0, yaw: 0, walking: false });
  const m = new THREE.Matrix4(), yawOf = () => { people.group.getObjectByName('people:body').getMatrixAt(0, m); return Math.atan2(m.elements[8], m.elements[10]); };
  w.gesture = { kind: 'look', k: 0, dur: 0.6, yaw: -2.5 }; people.update(0.016, 0); assert.ok(Math.abs(yawOf()) < 1e-6);
  w.gesture = { kind: 'look', k: 0.05 / 0.6, dur: 0.6, yaw: -2.5 }; people.update(0.016, 0); assert.ok(yawOf() < -0.3 && yawOf() > -2.2, `easing ${yawOf().toFixed(2)}`);
  w.gesture = { kind: 'look', k: 0.5, dur: 0.6, yaw: -2.5 }; people.update(0.016, 0); assert.ok(Math.abs(yawOf() + 2.5) < 1e-6);
});
// draw call（任務 12）：沒有人用到的配件 InstancedMesh 整個不畫（count 照舊；空的 instanced draw 也算一個 call）
test('accessory meshes nobody wears this frame are not drawn', () => {
  const people = createPeople(THREE, { max: 4 }), mesh = n => people.group.getObjectByName(`people:${n}`);
  const w = people.spawn({ path: ringPath({ x: 0, z: 0 }, 1, 0.65, 8) });
  people.update(0.1, 0.1);
  for (const n of ['body', 'head', 'shadow', 'legL']) assert.equal(mesh(n).visible, true, n);
  for (const n of ['mortar', 'tassel', 'helmet', 'wheelF', 'lens', 'badge', 'vest', 'apron', 'case']) assert.equal(mesh(n).visible, false, n);
  w.setAccessory('mortar');
  people.update(0.1, 0.2);
  assert.equal(mesh('mortar').visible, true); assert.equal(mesh('tassel').visible, true); assert.equal(mesh('helmet').visible, false);
});
// 裁決 R18 審稿：?quality=low 不畫眼睛與影子圓片
test('low people skip the eyes and the shadow disc', () => {
  const people = createPeople(THREE, { max: 4, low: true }), mesh = n => people.group.getObjectByName(`people:${n}`);
  people.spawn({ path: ringPath({ x: 0, z: 0 }, 1, 0.65, 8) }); people.update(0.1, 0.1);
  for (const n of ['eyeL', 'eyeR', 'shadow']) assert.equal(mesh(n).visible, false, n);
  assert.equal(mesh('body').visible, true);
});
// 最終章 §6、§8：全島心情。lie＝躺平（繞 x −90°、腳底為軸、抬高 0.1）右手比讚、不走路；alien＝額頭正中第三隻眼
const partMesh = (people, name) => people.group.children.find(m => m.name === `people:${name}`);
const matAt = (people, name, i) => { const m = new THREE.Matrix4(); partMesh(people, name).getMatrixAt(i, m); return m; };
const decompose = m => { const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s); return { p, q, s }; };
test('setMood lie: every walker matrix is rotated −90° about x (body lies flat, y of head ≈ ground + 0.1) and the right arm points up; walking stops', () => {
  const people = createPeople(THREE, { max: 4 });
  const a = people.spawn({ path: ringPath({ x: 0, z: 0 }, 1.5, 0.65), speed: 0.4 });
  const b = people.spawn({ stand: { x: 3, y: 0.65, z: 1, yaw: 0 } });
  people.setMood('lie'); people.update(0.1, 0.1, 20);
  const before = { ...a.pos };
  people.update(0.5, 0.6, 20);
  assert.ok(Math.hypot(a.pos.x - before.x, a.pos.z - before.z) < 1e-9, 'lying walkers do not advance along the path');
  for (const [i, w] of [a, b].entries()) {
    const head = decompose(matAt(people, 'head', i));
    assert.ok(Math.abs(head.p.y - (w.pos.y + 0.1)) < 1e-6, `head lies at ground + 0.1 (got ${head.p.y - w.pos.y})`);
    // 身體的局部 +y（頭頂方向）變成水平、局部 +z（臉）朝天：繞 x −90°
    const bodyUp = new THREE.Vector3(0, 1, 0).applyQuaternion(decompose(matAt(people, 'body', i)).q);
    const face = new THREE.Vector3(0, 0, 1).applyQuaternion(head.q);
    assert.ok(Math.abs(bodyUp.y) < 1e-6, 'body axis is horizontal');
    assert.ok(face.y > 0.999, 'face looks at the sky (lying on the back)');
    // 右手：肩到手的方向往天上（比讚），左手平放
    const arm = matAt(people, 'armR', i), sh = new THREE.Vector3(0, 0.04, 0).applyMatrix4(arm), hand = new THREE.Vector3(0, -0.04, 0).applyMatrix4(arm);
    assert.ok(hand.y - sh.y > 0.03, 'right arm points up');
    const armL = matAt(people, 'armL', i), lsh = new THREE.Vector3(0, 0.04, 0).applyMatrix4(armL), lhand = new THREE.Vector3(0, -0.04, 0).applyMatrix4(armL);
    assert.ok(Math.abs(lhand.y - lsh.y) < 1e-6, 'left arm lies along the body');
  }
  // 腿不擺：兩次 update 腿的矩陣一樣
  const leg1 = matAt(people, 'legL', 0); people.update(0.3, 0.9, 20);
  assert.ok(leg1.equals(matAt(people, 'legL', 0)), 'legs are still');
  people.setMood('normal'); people.update(0.1, 1, 20);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(decompose(matAt(people, 'body', 1)).q);
  assert.ok(up.y > 0.999, 'normal stands up again');
  assert.throws(() => people.setMood('dance'), /mood/);
});
test('setMood alien: the eye3 instanced mesh is visible with one instance per walker on the forehead centre; normal hides it', () => {
  const people = createPeople(THREE, { max: 4 });
  people.spawn({ stand: { x: 1, y: 0.65, z: 2, yaw: 0 } });
  people.spawn({ path: ringPath({ x: 0, z: 0 }, 1.5, 0.65), speed: 0.4 });
  const eye3 = partMesh(people, 'eye3');
  people.update(0.1, 0.1, 20);
  assert.equal(eye3.visible, false, 'normal: no third eye');
  people.setMood('alien'); people.update(0.1, 0.2, 20);
  assert.equal(eye3.visible, true); assert.equal(eye3.count, 2);
  const p = decompose(matAt(people, 'eye3', 0)).p;
  assert.ok(Math.abs(p.x - 1) < 1e-6 && Math.abs(p.y - (0.65 + 0.305)) < 1e-6 && Math.abs(p.z - (2 + 0.064)) < 1e-6, `forehead centre (got ${p.toArray()})`);
  const eyeL = decompose(matAt(people, 'eyeL', 0)).p;
  assert.ok(p.y > eyeL.y, 'above the two eyes');
  const before = { ...people.walkers[1].pos }; people.update(0.5, 0.7, 20);
  assert.ok(Math.hypot(people.walkers[1].pos.x - before.x, people.walkers[1].pos.z - before.z) > 0.15, 'alien walkers keep walking');
  people.setMood('normal'); people.update(0.1, 0.8, 20);
  assert.equal(eye3.visible, false, 'normal hides it again');
});
test('low quality keeps eye3 in alien mood (the normal eyes stay skipped)', () => {
  const people = createPeople(THREE, { max: 4, low: true });
  people.spawn({ stand: { x: 0, y: 0.65, z: 0, yaw: 0 } });
  people.setMood('alien'); people.update(0.1, 0.1, 20);
  assert.equal(partMesh(people, 'eye3').visible, true);
  assert.equal(partMesh(people, 'eyeL').visible, false); assert.equal(partMesh(people, 'eyeR').visible, false);
});
// 計畫 13 §設計 5：蹲下護頭（duck，飛彈警告）——整個人下蹲 0.05（修正輪 1：0.08＋腿前轉 1.2 像坐在地上、腳尖插地）、腿往前彎 0.6 rad 並收短
// （腳底留在站著時的高度）、兩手往前上抬到 −2.6 rad 護住頭；前 15 % 蹲下去、中間 70 % 停住、最後 15 % 站回來
test("gesture 'duck': crouch 0.05 with legs bent 0.6 rad (feet stay on the ground), both arms up to −2.6 rad over the head; 15 % in, 70 % hold, 15 % out", () => {
  assert.deepEqual(duckPose(0), { drop: 0, arm: 0, knee: 0 });
  assert.deepEqual(duckPose(1), { drop: 0, arm: 0, knee: 0 });
  for (const k of [0.15, 0.5, 0.85]) { const d = duckPose(k); assert.ok(Math.abs(d.drop - 0.05) < 1e-9 && Math.abs(d.arm + 2.6) < 1e-9 && Math.abs(d.knee + 0.6) < 1e-9, `full crouch at k ${k}`); }
  assert.ok(duckPose(0.07).drop > 0 && duckPose(0.07).drop < 0.05, 'going down'); assert.ok(duckPose(0.93).drop > 0 && duckPose(0.93).drop < 0.05, 'coming up');
  const people = createPeople(THREE, { max: 2 }); const w = people.spawn({ controlled: true }); w.setPose({ x: 0, y: 0, z: 0, yaw: 0, walking: false });
  const m = new THREE.Matrix4();
  const yOf = name => { people.group.getObjectByName(name).getMatrixAt(0, m); return new THREE.Vector3().setFromMatrixPosition(m).y; };
  const rxOf = name => { people.group.getObjectByName(name).getMatrixAt(0, m); return Math.atan2(m.elements[6], m.elements[5]); };
  // 腿的膠囊（半長 0.03＋半徑 0.022）底下那顆半球的中心：站著時離地 0.015，蹲下也不低於它（腳不插地）
  const footY = name => { people.group.getObjectByName(name).getMatrixAt(0, m); return new THREE.Vector3(0, -0.03, 0).applyMatrix4(m).y; };
  people.update(0.016, 0); const rest = { body: yOf('people:body'), head: yOf('people:head'), legL: rxOf('people:legL'), foot: footY('people:legL') };
  w.gesture = { kind: 'duck', k: 0.5, dur: 1.0 }; people.update(0.016, 0);
  assert.ok(Math.abs(rest.body - yOf('people:body') - 0.05) < 1e-6 && Math.abs(rest.head - yOf('people:head') - 0.05) < 1e-6, 'the whole figure drops 0.05');
  for (const a of ['people:armL', 'people:armR']) assert.ok(Math.abs(rxOf(a) + 2.6) < 1e-6, `${a} up to −2.6`);
  assert.ok(Math.abs(rxOf('people:legL') - rest.legL + 0.6) < 1e-6 && Math.abs(rxOf('people:legR') + 0.6) < 1e-6, 'legs bent forward 0.6');
  for (const leg of ['people:legL', 'people:legR']) assert.ok(footY(leg) >= rest.foot - 1e-6, `${leg} foot stays on the ground (${footY(leg).toFixed(4)} vs ${rest.foot.toFixed(4)})`);
  w.gesture = null; people.update(0.016, 0); assert.ok(Math.abs(yOf('people:body') - rest.body) < 1e-9, 'back up');
  // 躺平時一律不做動作
  people.setMood('lie'); w.gesture = { kind: 'duck', k: 0.5 }; people.update(0.016, 0); const lying = yOf('people:body'); people.setMood('normal');
  w.gesture = null; people.setMood('lie'); people.update(0.016, 0); assert.ok(Math.abs(yOf('people:body') - lying) < 1e-9, 'no duck while lying');
});
