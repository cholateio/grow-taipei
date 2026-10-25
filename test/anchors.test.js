import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANCHORS, anchorWorld, LANDMARKS, landmarkWorld, routeBetween } from '../src/actors/anchors.js';
import { MAIN_CELLS, axialToWorld, RING_R, cellTop, PLATEAU_TOP, TOP, edgeMidpoint } from '../src/scene/hex.js';
import { ORDER } from '../src/rules/spec.js';
test('every item and the tower have an anchor inside the walking ring of a main-island cell', () => {
  for (const id of [...ORDER, 'tower']) {
    const a = ANCHORS[id]; assert.ok(a, id); assert.ok(MAIN_CELLS.some(c => c[0] === a.cell[0] && c[1] === a.cell[1]), id);
    assert.ok(Math.hypot(a.dx, a.dz) < RING_R - 0.3, id);
    const w = anchorWorld(id), c = axialToWorld(...a.cell); assert.equal(w.y, cellTop(a.cell)); assert.ok(Math.abs(w.x - c.x - a.dx) < 1e-9);
  }
});
test('no two anchors closer than 0.8', () => {
  const ids = Object.keys(ANCHORS);
  for (const a of ids) for (const b of ids) if (a < b) { const p = anchorWorld(a), q = anchorWorld(b); assert.ok(Math.hypot(p.x - q.x, p.z - q.z) >= 0.8, `${a}-${b}`); }
});
test('landmarks sit on their cells: volcano and spring on the plateau, park in the centre, market with the token cell', () => {
  assert.deepEqual(LANDMARKS.volcano.cell, [0, -1]); assert.deepEqual(LANDMARKS.spring.cell, [1, -1]);
  assert.deepEqual(LANDMARKS.park.cell, [0, 0]); assert.deepEqual(LANDMARKS.market.cell, [0, 1]);
  for (const k of Object.keys(LANDMARKS)) assert.ok(Math.hypot(LANDMARKS[k].dx, LANDMARKS[k].dz) < RING_R - 0.3, k);
  assert.equal(landmarkWorld('volcano').y, PLATEAU_TOP);
});
test('routeBetween goes door → bridge head A → bridge head B → destination with per-cell heights', () => {
  const r = routeBetween([1, 0], { x: 4, z: 0.5 }, [0, 0], { x: 0.6, z: -0.3 });
  assert.equal(r.length, 4); assert.equal(r[0].y, TOP); assert.equal(r[3].y, TOP);
  const { a, b } = edgeMidpoint([1, 0], [0, 0], RING_R * Math.sqrt(3) / 2); assert.ok(Math.abs(r[1].x - a.x) < 1e-9); assert.ok(Math.abs(r[2].x - b.x) < 1e-9);
  assert.throws(() => routeBetween([1, 0], { x: 0, z: 0 }, [-1, 0], { x: 0, z: 0 }), /adjacent/);
});
