import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANCHORS, anchorWorld } from '../src/actors/anchors.js';
import { MAIN_CELLS, axialToWorld, RING_R, cellTop } from '../src/scene/hex.js';
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
