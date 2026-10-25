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
test('milk lv1 is only the crate; lv2 spawns 3 kids on the playground; lv3 makes them 1.3×; lv4 gives caps and a clock tower', () => {
  assert.deepEqual(Object.keys(milk.view(lv({ milk: 1 }), {})), ['milk.main']);
  const v2 = milk.view(lv({ milk: 2 }), {}); assert.equal(v2['milk.kids'].n, 3); assert.equal(v2['milk.kids'].scale ?? 1, 1);
  assert.equal(milk.view(lv({ milk: 3 }), {})['milk.kids'].scale, 1.3);
  const v4 = milk.view(lv({ milk: 4 }), {}); assert.equal(v4['milk.kids'].accessory, 'cap');
  assert.ok(v4['milk.main'].parts.length > milk.view(lv({ milk: 3 }), {})['milk.main'].parts.length, 'clock tower adds parts');
  assert.ok(v4['milk.main'].parts.some(p => p.glow), 'clock face glows');
});
test('rats ≥2 or typhoon Lv2 send the kids home and light the windows', () => {
  for (const extra of [{ rat: 2 }, { typhoon: 2 }]) {
    const v = milk.view(lv({ milk: 3, ...extra }), {});
    assert.equal(v['milk.kids'], undefined, JSON.stringify(extra)); assert.ok(v['milk.main'].parts.some(p => p.glow === 0xffc777));
  }
  assert.ok(milk.view(lv({ milk: 3, typhoon: 3 }), {})['milk.kids'], 'back out after the storm');
});
test('milk 4 with a dome relocates the kids to the dome gate (little league)', () => {
  const v = milk.view(lv({ milk: 4, baseball: 2 }), {}), b = anchorWorld('baseball');
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
  for (const n of [1, 2, 3, 4]) for (const s of Object.values(milk.view(lv({ milk: n }), {}))) for (const p of worldPoints(s)) assert.ok(distToCell(p, [-1, 0]) < RING_R, `lv${n}`);
});
