import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { walkPose, ringPath, SHIRTS, createPeople, WALK_RADIUS, ACCESSORIES } from '../src/scene/people.js';
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
