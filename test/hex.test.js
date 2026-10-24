import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R, SPACING, TOP, axialToWorld, hexCorners, MAIN_CELLS, PLATEAU_CELLS, adjacentPairs, edgeMidpoint, SATELLITES, cellTop, RING_R } from '../src/scene/hex.js';
import { bridgeDecks } from '../src/scene/bridge.js';
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('axialToWorld follows the pointy-top formula', () => {
  const p = axialToWorld(1, 0); assert.ok(near(p.x, Math.sqrt(3) * SPACING)); assert.ok(near(p.z, 0));
  const q = axialToWorld(0, 1); assert.ok(near(q.x, Math.sqrt(3) * SPACING / 2)); assert.ok(near(q.z, 1.5 * SPACING));
});
test('hexCorners: six corners on the circumradius, first one toward -z', () => {
  const c = hexCorners(1, 2, R); assert.equal(c.length, 6);
  for (const p of c) assert.ok(near(Math.hypot(p.x - 1, p.z - 2), R));
  assert.ok(near(c[0].x, 1)); assert.ok(near(c[0].z, 2 - R));
});
test('main island is a centre plus one ring, plateau cells are in it, 12 adjacencies', () => {
  assert.equal(MAIN_CELLS.length, 7);
  for (const c of PLATEAU_CELLS) assert.ok(MAIN_CELLS.some(m => m[0] === c[0] && m[1] === c[1]));
  assert.equal(adjacentPairs(MAIN_CELLS).length, 12);
  assert.equal(cellTop([0, 0]), TOP); assert.ok(cellTop([0, -1]) > TOP);
});
test('neighbouring tiles leave a ~0.45 water channel', () => {
  const a = axialToWorld(0, 0), b = axialToWorld(1, 0);
  assert.ok(near(Math.hypot(b.x - a.x, b.z - a.z) - 2 * (R * Math.sqrt(3) / 2), 0.45, 0.05));
});
test('edgeMidpoint gives two points on the ring circles facing each other', () => {
  const { a, b } = edgeMidpoint([0, 0], [1, 0]);
  const ca = axialToWorld(0, 0), cb = axialToWorld(1, 0);
  assert.ok(near(Math.hypot(a.x - ca.x, a.z - ca.z), RING_R)); assert.ok(near(Math.hypot(b.x - cb.x, b.z - cb.z), RING_R));
  assert.ok(b.x > a.x);
});
test('satellites are outside the main island and apart from each other', () => {
  assert.equal(SATELLITES.length, 7);
  for (const s of SATELLITES) { const p = axialToWorld(s.q, s.r); assert.ok(Math.hypot(p.x, p.z) > 3 * SPACING, s.kind); }
  for (const s of SATELLITES) for (const t of SATELLITES) if (s !== t) {
    const p = axialToWorld(s.q, s.r), u = axialToWorld(t.q, t.r); assert.ok(Math.hypot(p.x - u.x, p.z - u.z) >= SPACING * 1.9, `${s.kind}-${t.kind}`);
  }
});
test('satellites stay within the overview frame (radius ≤ 15)', () => {
  for (const s of SATELLITES) { const p = axialToWorld(s.q, s.r); assert.ok(Math.hypot(p.x, p.z) <= 15, s.kind); }
});
test('bridgeDecks: 9 decks from a to b with a sine arch', () => {
  const d = bridgeDecks({ x: 0, z: 0 }, { x: 1, z: 0 });
  assert.equal(d.length, 9); assert.ok(near(d[0].x, 0, 0.1)); assert.ok(near(d[8].x, 1, 0.1));
  assert.ok(near(Math.max(...d.map(k => k.y)), TOP + 0.08, 1e-6)); assert.ok(near(d[0].y, TOP, 1e-6));
});
