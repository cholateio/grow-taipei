import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as chip from '../src/actors/chip.js';
import { anchorWorld } from '../src/actors/anchors.js';
import { cellAt, RING_R } from '../src/scene/hex.js';
import { lv, worldPoints, distToCell } from './helpers/actors.js';

test('chip lv1 site: fence, cones, crane, one helmeted worker', () => {
  const v = chip.view(lv({ chip: 1 }), {});
  assert.ok(v['chip.main'].parts.filter(p => p.kind === 'cone').length >= 3); assert.equal(v['chip.crane'].kind, 'crane');
  assert.equal(v['chip.worker'].accessory, 'helmet'); assert.equal(v['chip.engineers'], undefined);
});
test('chip lv2 factory smokes and sends 2 engineers in coats to 101', () => {
  const v = chip.view(lv({ chip: 2 }), {});
  assert.equal(v['chip.smoke'].kind, 'smoke'); assert.equal(v['chip.crane'], undefined);
  assert.equal(v['chip.engineers'].n, 2); assert.equal(v['chip.engineers'].accessory, 'coat'); assert.equal(v['chip.engineers'].path, chip.ENGINEER_ROUTE); assert.equal(v['chip.engineers'].loop, false);
});
test('chip lv3: four engineers on bikes; rats ≥2 turns one into a detective with a magnifier', () => {
  const v3 = chip.view(lv({ chip: 3 }), {}); assert.equal(v3['chip.engineers'].n, 4); assert.equal(v3['chip.engineers'].accessory, 'bike');
  const vr = chip.view(lv({ chip: 3, rat: 2 }), {}); assert.equal(vr['chip.engineers'].n, 3); assert.equal(vr['chip.detective'].accessory, 'glass');
  assert.equal(chip.view(lv({ chip: 2, rat: 2 }), {})['chip.detective'], undefined, 'needs chip ≥3');
});
test('lv4 headquarters is a glass dome', () => {
  assert.ok(chip.view(lv({ chip: 4 }), {})['chip.main'].parts.some(p => p.kind === 'dome' && p.color === 0x9cc3bf));
});
test('ENGINEER_ROUTE starts in the chip cell and ends at the tower foot', () => {
  const r = chip.ENGINEER_ROUTE, t = anchorWorld('tower');
  assert.deepEqual(cellAt(r[0].x, r[0].z), [1, 0]); assert.deepEqual(cellAt(r.at(-1).x, r.at(-1).z), [0, 0]);
  assert.ok(Math.hypot(r.at(-1).x - t.x, r.at(-1).z - t.z) < 1.3);
});
test('chip buildings stay inside the chip cell', () => {
  for (const n of [1, 2, 3, 4, 5]) for (const [k, s] of Object.entries(chip.view(lv({ chip: n }), {}))) if (s.kind === 'compound') for (const p of worldPoints(s)) assert.ok(distToCell(p, [1, 0]) < RING_R, `lv${n} ${k}`);
});
