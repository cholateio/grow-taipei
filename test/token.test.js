import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as token from '../src/actors/token.js';
test('trainPose: cars trail along the track radius at the right spacing; speed 0 freezes them', () => {
  const { TRACK, trainPose } = token;
  const a = trainPose(5, 0, { cars: 3 }), b = trainPose(5, 1, { cars: 3 });
  for (const p of [a, b]) { assert.ok(Math.abs(Math.hypot(p.x, p.z) - TRACK.radius) < 1e-9); assert.equal(p.y, TRACK.y); }
  assert.ok(Math.abs(Math.hypot(a.x - b.x, a.z - b.z) - 0.6) < 0.01, 'car gap 0.6');
  assert.deepEqual(trainPose(1, 0, { speed: 0 }), trainPose(9, 0, { speed: 0 }));
});
import * as THREE from '../vendor/three/three.module.js';
import { groundAt, axialToWorld, SATELLITES } from '../src/scene/hex.js';
import { createPartFactory } from '../src/actors/parts.js';
import { createGlowRegistry } from '../src/scene/glow.js';
const L = extra => ({ milk: 0, chip: 0, bulb: 0, token: 0, typhoon: 0, rat: 0, boba: 0, baseball: 0, ...extra });
const pylons = s => s.parts.filter(p => p.kind === 'cylinder');

test('token lv1 is a station only', () => assert.deepEqual(Object.keys(token.view(L({ token: 1 }), {})), ['token.main']));
test('token lv2 track has 12 pylons whose heights come from groundAt', () => {
  const v = token.view(L({ token: 2 }), {}), ps = pylons(v['token.track']);
  assert.equal(ps.length, 12); assert.ok(v['token.track'].parts.some(p => p.kind === 'rail'));
  for (const p of ps) { const base = groundAt(p.pos[0], p.pos[2]); assert.ok(Math.abs(p.pos[1] - p.scale[1] / 2 - base) < 1e-9); assert.ok(Math.abs(p.pos[1] + p.scale[1] / 2 - token.TRACK.y) < 1e-9); }
  assert.equal(v['token.train'].cars, 3);
});
test('token lv3 adds two spurs ending on the lighthouse and playground islands; lv4 makes the cars glow', () => {
  const v = token.view(L({ token: 3 }), {}), spur = v['token.spurs'];
  for (const kind of ['lighthouse', 'playground']) {
    const s = SATELLITES.find(x => x.kind === kind), c = axialToWorld(s.q, s.r);
    assert.ok(spur.parts.some(p => p.kind === 'box' && Math.hypot(p.pos[0] - c.x, p.pos[2] - c.z) < 2.2), kind);
  }
  assert.equal(v['token.train'].cars, 5); assert.ok(!v['token.train'].neon);
  assert.ok(token.view(L({ token: 4 }), {})['token.train'].neon);
});
test('flooded turns the station into a pool with two swimmers and stops the train', () => {
  const v = token.view(L({ token: 2 }), { flooded: true });
  assert.ok(v['token.main'].parts.some(p => p.color === 0xa4d4da)); assert.equal(v['token.swimmers'].n, 2); assert.equal(v['token.train'].speed, 0);
});
test('train builder: cars follow trainPose and glow when neon', () => {
  const glow = createGlowRegistry(), f = createPartFactory(THREE, { glow, builders: token.builders });
  const p = f.build({ ...token.view(L({ token: 4 }), {})['token.train'] }); p.update(0.1, 3);
  assert.equal(p.object.children.length, 5); const want = token.trainPose(3, 0);
  assert.ok(Math.abs(p.object.children[0].position.x - want.x) < 1e-9); assert.ok(glow.size > 0);
});
