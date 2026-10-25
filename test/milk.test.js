import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as spec from '../src/rules/spec.js';
import * as milk from '../src/actors/milk.js';
import { anchorWorld } from '../src/actors/anchors.js';
import { RING_R } from '../src/scene/hex.js';
import { ROOFS, roofColor } from '../src/actors/palette.js';
import { lv, worldPoints, distToCell } from './helpers/actors.js';
import { installFakeDom } from './helpers/fakedom.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { createPeople } from '../src/scene/people.js';
installFakeDom();
const { createStage } = await import('../src/actors/stage.js');

test('roofColor cycles coral → navy → yellow after the typhoon rebuild', () => {
  assert.deepEqual(ROOFS, [0xdb6a41, 0x3f5a8a, 0xfcea8b]);
  assert.equal(roofColor(0xdb6a41, false), 0xdb6a41); assert.equal(roofColor(0xdb6a41, true), 0x3f5a8a); assert.equal(roofColor(0xfcea8b, true), 0xdb6a41);
});
test('milk climbs one storey a level: 1 crate, 2 one-storey school + 3 kids, 3 two storeys + tall kids, 4 three storeys + flag', () => {
  assert.deepEqual(Object.keys(milk.view(lv({ milk: 1 }), {})), ['milk.main']);
  const windows = n => milk.view(lv({ milk: n }), {})['milk.main'].parts.filter(p => p.win).length;
  assert.equal(windows(2), 4); assert.equal(windows(3), 8); assert.equal(windows(4), 12);
  assert.equal(milk.view(lv({ milk: 2 }), {})['milk.kids'].n, 3); assert.equal(milk.view(lv({ milk: 3 }), {})['milk.kids'].scale, 1.3);
  assert.ok(milk.view(lv({ milk: 4 }), {})['milk.main'].parts.some(p => p.flag), 'flag goes up at Lv4');
});
test('lv5 clock tower and caps; lv6 university with an arch gate and mortarboards', () => {
  const v5 = milk.view(lv({ milk: 5 }), {}), v6 = milk.view(lv({ milk: 6 }), {});
  assert.ok(v5['milk.main'].parts.some(p => p.glow), 'clock face'); assert.equal(v5['milk.kids'].accessory, 'cap');
  assert.equal(v6['milk.gate'].kind, 'compound', 'arch gate'); assert.equal(v6['milk.kids'].accessory, 'mortar');
  assert.equal(v5['milk.gate'], undefined);
});
test('knocking milk back from 6 removes the university and its graduates (review focus 3)', async () => {
  const scene = new THREE.Scene(), people = createPeople(THREE, { max: 8 });
  const stage = createStage(THREE, { scene, spec, modules: [milk], ctx: { people, assets: null, glow: createGlowRegistry() } });
  await stage.apply({ kind: 'placed', item: 'milk', to: 1 }, { instant: true });
  for (let n = 2; n <= 6; n++) await stage.apply({ kind: 'grow', item: 'milk', from: n - 1, to: n, via: [] }, { instant: true });
  assert.ok(people.walkers.every(w => w.accessory === 'mortar'));
  await stage.apply({ kind: 'fx', item: 'milk', cause: 'rat', delta: { target: 'milk', from: 6, to: 5 } }, { instant: true });
  assert.ok(people.walkers.length === 3 && people.walkers.every(w => w.accessory === 'cap'));
  assert.ok(!stage.partKeys().includes('milk.gate'));
});
test('rats ≥2 or typhoon Lv2 send the kids home and light the windows', () => {
  for (const extra of [{ rat: 2 }, { typhoon: 2 }]) {
    const v = milk.view(lv({ milk: 3, ...extra }), {});
    assert.equal(v['milk.kids'], undefined, JSON.stringify(extra)); assert.ok(v['milk.main'].parts.some(p => p.glow === 0xffc777));
  }
  assert.ok(milk.view(lv({ milk: 3, typhoon: 3 }), {})['milk.kids'], 'back out after the storm');
});
test('milk 5 with a ballfield relocates the kids next to the dome (little league)', () => {
  const v = milk.view(lv({ milk: 5, baseball: 2 }), {}), b = anchorWorld('baseball');
  const c = v['milk.kids'].path.reduce((a, p) => ({ x: a.x + p.x / 24, z: a.z + p.z / 24 }), { x: 0, z: 0 });
  assert.ok(Math.hypot(c.x - b.x, c.z - b.z) < 2.5); assert.ok(Math.hypot(c.x - b.x, c.z - (b.z + 1.05)) > 0.9, 'off the gate where players and fans stand');
});
test('typhoon Lv3 swaps the school roof colour', () => {
  const roof = v => v['milk.main'].parts.find(p => p.kind === 'hip').color;
  assert.notEqual(roof(milk.view(lv({ milk: 2 }), {})), roof(milk.view(lv({ milk: 2, typhoon: 3 }), {})));
});
test('milk 2→1 removes the kids and frees walkers (review focus 3)', async () => {
  const scene = new THREE.Scene(), people = createPeople(THREE, { max: 8 });
  const stage = createStage(THREE, { scene, spec, modules: [milk], ctx: { people, assets: null, glow: createGlowRegistry() } });
  await stage.apply({ kind: 'placed', item: 'milk', to: 1 }, { instant: true }); await stage.apply({ kind: 'grow', item: 'milk', from: 1, to: 2 }, { instant: true });
  assert.equal(people.walkers.length, 3);
  await stage.apply({ kind: 'fx', item: 'milk', cause: 'rat', delta: { target: 'milk', from: 2, to: 1 } }, { instant: true });
  assert.equal(people.walkers.length, 0);
});
test('every milk part stays inside the milk cell', () => {
  for (const n of [1, 2, 3, 4, 5, 6]) for (const s of Object.values(milk.view(lv({ milk: n }), {}))) for (const p of worldPoints(s)) assert.ok(distToCell(p, [-1, 0]) < RING_R, `lv${n}`);
});
