import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as bulb from '../src/actors/bulb.js';
import { landmarkWorld } from '../src/actors/anchors.js';
import { cellAt } from '../src/scene/hex.js';
import { lv, worldPoints } from './helpers/actors.js';
const heads = s => s.parts.filter(p => p.kind === 'sphere');

test('bulb lv1 is one street lamp', () => {
  const v = bulb.view(lv({ bulb: 1 }), {}); assert.deepEqual(Object.keys(v), ['bulb.main']); assert.equal(heads(v['bulb.main']).length, 1);
});
test('lv2: fifteen lamps on the five low cells plus two market stalls', () => {
  const v = bulb.view(lv({ bulb: 2 }), {}); assert.equal(heads(v['bulb.lamps']).length, 15);
  const cells = new Set(worldPoints(v['bulb.lamps']).filter((_, i) => i % 2).map(p => String(cellAt(p.x, p.z))));
  assert.deepEqual([...cells].sort(), ['-1,0', '-1,1', '0,0', '0,1', '1,0']);
  const m = landmarkWorld('market'); assert.ok(Math.hypot(v['bulb.market'].at.x - m.x, v['bulb.market'].at.z - m.z) < 1e-9);
});
test('lv3 neon alternates pink and blue', () => {
  const g = heads(bulb.view(lv({ bulb: 3 }), {})['bulb.lamps']).map(p => p.glow);
  assert.ok(g.includes(0xff3fa0) && g.includes(0x3fe0ff));
});
test('blackout strips every glow from the bulb views', () => {
  const v = bulb.view(lv({ bulb: 2 }), { blackout: true });
  for (const s of Object.values(v)) assert.ok(!s.parts.some(p => p.glow));
});
