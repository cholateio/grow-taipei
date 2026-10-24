import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { walkPose, ringPath, SHIRTS, createPeople, WALK_RADIUS } from '../src/scene/people.js';
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
