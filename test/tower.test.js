import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as tower from '../src/actors/tower.js';
import { anchorWorld } from '../src/actors/anchors.js';
import { createPartFactory } from '../src/actors/parts.js';
import { createGlowRegistry } from '../src/scene/glow.js';
const zero = { milk: 0, chip: 0, bulb: 0, token: 0, typhoon: 0, rat: 0, boba: 0, baseball: 0 };
const lvOf = (total, extra = {}) => ({ ...zero, milk: Math.min(4, total), chip: Math.min(5, Math.max(0, total - 4)), bulb: Math.max(0, Math.min(4, total - 9)), token: Math.max(0, Math.min(4, total - 13)), boba: Math.max(0, Math.min(3, total - 17)), baseball: Math.max(0, Math.min(4, total - 20)), ...extra });
const tiers = v => v['tower.main'].parts.filter(p => p.kind === 'frustum4').length;

test('stageOf thresholds (§5.2)', () => {
  assert.equal(tower.stageOf(0), 'site'); assert.equal(tower.stageOf(6), 'site'); assert.equal(tower.stageOf(7), 'half');
  assert.equal(tower.stageOf(14), 'half'); assert.equal(tower.stageOf(15), 'full'); assert.equal(tower.stageOf(22), 'full'); assert.equal(tower.stageOf(23), 'lit');
});
test('view: site has a crane and cones, half 4 tiers + crane, full 8 tiers + cap and no crane, lit glows', () => {
  const site = tower.view(zero, {}), half = tower.view(lvOf(8), {}), full = tower.view(lvOf(16), {}), lit = tower.view(lvOf(24), {});
  assert.equal(tiers(site), 1); assert.ok(site['tower.crane']); assert.ok(site['tower.main'].parts.some(p => p.kind === 'cone'));
  assert.equal(tiers(half), 5); assert.ok(half['tower.crane']);
  assert.equal(tiers(full), 10); assert.equal(full['tower.crane'], undefined);
  assert.ok(!full['tower.main'].parts.some(p => p.glow)); assert.ok(lit['tower.main'].parts.some(p => p.glow));
});
test('antenna appears at chip 4 and pulses at chip 5; light show needs bulb 4', () => {
  assert.equal(tower.view({ ...zero, chip: 3 }, {})['tower.antenna'], undefined);
  assert.equal(tower.view({ ...zero, chip: 4 }, {})['tower.antenna'].kind, 'compound');
  assert.equal(tower.view({ ...zero, chip: 5 }, {})['tower.antenna'].kind, 'pulse');
  assert.equal(tower.view({ ...zero, bulb: 3 }, {})['tower.show'], undefined);
  assert.equal(tower.view({ ...zero, bulb: 4 }, {})['tower.show'].kind, 'lightshow');
});
test('the antenna sits on the spire top of whatever stage the tower is in', () => {
  const v = tower.view({ ...zero, chip: 4 }, {}), top = Math.max(...v['tower.main'].parts.map(p => p.pos[1] + (Array.isArray(p.scale) ? p.scale[1] : p.scale) / 2));
  assert.ok(Math.abs(v['tower.antenna'].parts[0].pos[1] - top) < 0.6);
});
test('all tower parts stand on the tower anchor', () => {
  const a = anchorWorld('tower');
  for (const v of [tower.view(zero, {}), tower.view(lvOf(30, { chip: 5, bulb: 4 }), {})]) for (const k in v) assert.deepEqual(v[k].at, a, k);
});
test('crane, pulse and lightshow builders animate', () => {
  const glow = createGlowRegistry(); glow.setNight(1);
  const f = createPartFactory(THREE, { glow, people: null, assets: null, builders: tower.builders });
  const crane = f.build(tower.view(zero, {})['tower.crane']); const jib = crane.object.getObjectByName('jib');
  crane.update(0.1, 1); const r1 = jib.rotation.y; crane.update(0.1, 3); assert.notEqual(jib.rotation.y, r1);
  const pulse = f.build(tower.view({ ...zero, chip: 5 }, {})['tower.antenna']); const m = pulse.materials[0];
  pulse.update(0.1, 0.75); const a = m.emissiveIntensity; pulse.update(0.1, 2.25); assert.notEqual(m.emissiveIntensity, a);
  const show = f.build(tower.view({ ...zero, bulb: 4 }, {})['tower.show']); const c0 = show.materials[0].emissive.getHex();
  show.update(0.1, 1); assert.notEqual(show.materials[0].emissive.getHex(), c0);
  for (const p of [crane, pulse, show]) p.dispose?.(); assert.equal(glow.size, 0);
});
