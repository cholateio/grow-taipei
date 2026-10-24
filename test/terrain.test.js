import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basinHeight, heightColor, treeSpots } from '../src/scene/terrain.js';
import { mulberry32 } from '../src/scene/random.js';
test('basin: sea floor at centre, ring mountains far out, camera side pressed down', () => {
  assert.ok(basinHeight(0, 0) < 0); assert.ok(basinHeight(0, -38) > 12);
  assert.ok(basinHeight(0, 38) < basinHeight(0, -38) * 0.6);
});
test('no dry plain between the satellites and the mountains', () => {
  for (const r of [16, 18, 20, 22]) for (const a of [0, 1, 2, 3, 4, 5]) assert.ok(basinHeight(Math.cos(a) * r, Math.sin(a) * r) < -0.18, `r=${r}`);
});
test('terrace quantization only above 3', () => {
  const y = basinHeight(0, -45); assert.ok(Math.abs(y / 0.6 - Math.round(y / 0.6)) < 1e-9);
});
test('heightColor bands', () => {
  assert.equal(heightColor(-1), 0x8fb3ad); assert.equal(heightColor(1), 0xd9c9a3); assert.equal(heightColor(5), 0xaec493); assert.equal(heightColor(10), 0xa3b986); assert.equal(heightColor(15), 0x6f8a62); assert.equal(heightColor(25), 0xb2a38d);
});
test('treeSpots stay on the slopes and are deterministic', () => {
  const a = treeSpots(200, mulberry32(5), basinHeight), b = treeSpots(200, mulberry32(5), basinHeight);
  assert.deepEqual(a, b); assert.equal(a.length, 200);
  for (const t of a) { const r = Math.hypot(t.x, t.z); assert.ok(r >= 16 && r <= 52); assert.ok(t.y >= 1.5); assert.ok(t.s >= .8 && t.s <= 1.8); }
});
