// test/blink.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createPeople } from '../src/scene/people.js';
import { createBlink, BLINK } from '../src/show/blink.js';

const twoMeshes = () => {
  const g = new THREE.Group(), a = new THREE.MeshStandardMaterial({ color: 0xdb6a41 }), b = new THREE.MeshBasicMaterial({ color: 0x5a88b2 });
  const inner = new THREE.Group(); inner.add(new THREE.Mesh(new THREE.BoxGeometry(), b));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(), a), inner);
  return { g, a, b, meshes: () => { const out = []; g.traverse(o => { if (o.isMesh) out.push(o); }); return out; } };
};
const colourOf = (people, name, i) => { const c = new THREE.Color(); people.group.getObjectByName(`people:${name}`).getColorAt(i, c); return c.getHex(); };

test('part blinks white for 0.15 s then restores every mesh material', () => {
  assert.equal(BLINK, 0.15);
  const blink = createBlink(THREE, { people: createPeople(THREE, { max: 2 }) }), { g, a, b, meshes } = twoMeshes();
  blink.part(g); assert.equal(blink.count, 1);
  const [m1, m2] = meshes(); assert.equal(m1.material, m2.material, 'one shared white material');
  assert.ok(m1.material.isMeshBasicMaterial); assert.equal(m1.material.color.getHex(), 0xffffff);
  blink.update(0.1); assert.notEqual(m1.material, a, 'still white at 0.1 s');
  blink.update(0.06); assert.deepEqual([m1.material, m2.material], [a, b]); assert.equal(blink.count, 0);
});
test('a part blinked again while white keeps its original materials and restarts the timer', () => {
  const blink = createBlink(THREE, { people: createPeople(THREE, { max: 2 }) }), { g, a, b, meshes } = twoMeshes();
  blink.part(g); blink.update(0.1); blink.part(g); assert.equal(blink.count, 1);
  blink.update(0.1); assert.notEqual(meshes()[0].material, a, 'timer restarted');
  blink.update(0.06); assert.deepEqual(meshes().map(m => m.material), [a, b]);
});
test('part calls onEnd when the blink ends, by update or clear', () => {
  const blink = createBlink(THREE, { people: createPeople(THREE, { max: 2 }) }), ends = [];
  blink.part(twoMeshes().g, BLINK, () => ends.push('a')); blink.part(twoMeshes().g, 0.3, () => ends.push('b'));
  blink.update(0.16); assert.deepEqual(ends, ['a']); blink.clear(); assert.deepEqual(ends, ['a', 'b']);
});
test('walker blinks via people.flashInstance and repaints after', () => {
  const people = createPeople(THREE, { max: 4 }), blink = createBlink(THREE, { people });
  const w = people.spawn({ controlled: true, shirt: 0xdb6a41 }), other = people.spawn({ controlled: true, shirt: 0x5a88b2 });
  blink.walker(w); assert.equal(blink.count, 1);
  assert.equal(colourOf(people, 'body', 0), 0xffffff); assert.equal(colourOf(people, 'head', 0), 0xffffff); assert.equal(colourOf(people, 'body', 1), 0x5a88b2, 'others untouched');
  w.setAccessory('cap'); assert.equal(colourOf(people, 'body', 0), 0xffffff, 'repaint keeps the blink');
  blink.update(0.16); assert.equal(colourOf(people, 'body', 0), 0xdb6a41); assert.equal(blink.count, 0);
  assert.equal(other.shirt, 0x5a88b2);
});
test('a blinking walker removed mid-blink is harmless; others keep their colours', () => {
  const people = createPeople(THREE, { max: 4 }), blink = createBlink(THREE, { people });
  const w = people.spawn({ controlled: true, shirt: 0xdb6a41 }), other = people.spawn({ controlled: true, shirt: 0x5a88b2 });
  blink.walker(other); blink.walker(w); w.remove();
  assert.equal(colourOf(people, 'body', 0), 0xffffff, 'the survivor (now index 0) stays white after the repaint');
  blink.update(0.2); assert.equal(colourOf(people, 'body', 0), 0x5a88b2); assert.equal(blink.count, 0);
});
test('stop ends one blink at once and calls its onEnd; the others keep going', () => {
  const people = createPeople(THREE, { max: 2 }), blink = createBlink(THREE, { people }), x = twoMeshes(), y = twoMeshes(), ends = [];
  const w = people.spawn({ controlled: true, shirt: 0xdb6a41 });
  blink.part(x.g, BLINK, () => ends.push('x')); blink.part(y.g); blink.walker(w);
  blink.stop(x.g); assert.deepEqual(x.meshes().map(m => m.material), [x.a, x.b]); assert.deepEqual(ends, ['x']); assert.equal(blink.count, 2);
  blink.stop(w); assert.equal(colourOf(people, 'body', 0), 0xdb6a41); assert.equal(blink.count, 1);
  blink.stop(x.g); assert.deepEqual(ends, ['x'], 'stopping twice is harmless');
});
test('clear restores at once', () => {
  const people = createPeople(THREE, { max: 2 }), blink = createBlink(THREE, { people }), { g, a, b, meshes } = twoMeshes();
  const w = people.spawn({ controlled: true, shirt: 0xdb6a41 });
  blink.part(g, 5); blink.walker(w, 5); assert.equal(blink.count, 2);
  blink.clear(); assert.equal(blink.count, 0); assert.deepEqual(meshes().map(m => m.material), [a, b]); assert.equal(colourOf(people, 'body', 0), 0xdb6a41);
});
