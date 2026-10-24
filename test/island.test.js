import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tileLayout, tileGround } from '../src/scene/island.js';
import { groundPalette, GROUND_KINDS } from '../src/scene/textures.js';
import { MAIN_CELLS, PLATEAU_CELLS, TOP, PLATEAU_TOP, R } from '../src/scene/hex.js';
test('tileLayout: one entry per cell, plateau cells raised, corners on R', () => {
  const t = tileLayout(MAIN_CELLS); assert.equal(t.length, 7);
  const plateau = t.filter(x => PLATEAU_CELLS.some(p => p[0] === x.cell[0] && p[1] === x.cell[1]));
  assert.equal(plateau.length, 2); assert.ok(plateau.every(x => x.top === PLATEAU_TOP)); assert.ok(t.filter(x => x.top === TOP).length === 5);
  for (const x of t) for (const c of x.corners) assert.ok(Math.abs(Math.hypot(c.x - x.center.x, c.z - x.center.z) - R) < 1e-6);
});
test('groundPalette has a base and accent for every kind', () => {
  for (const k of GROUND_KINDS) { const p = groundPalette(k); assert.ok(p.base >= 0 && p.accent >= 0 && p.base !== p.accent, k); }
  assert.throws(() => groundPalette('lava'));
});
test('every main cell gets a known ground kind, plateau is lawn, centre is brick', () => {
  for (const c of MAIN_CELLS) assert.ok(GROUND_KINDS.includes(tileGround(c)), String(c));
  for (const c of PLATEAU_CELLS) assert.equal(tileGround(c), 'lawn');
  assert.equal(tileGround([0, 0]), 'brick');
});
