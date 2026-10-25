import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as typhoon from '../src/actors/typhoon.js';
import { worldEffects } from '../src/actors/world.js';
import { TIMES } from '../src/scene/daynight.js';
import { landmarkWorld } from '../src/actors/anchors.js';
import { lv } from './helpers/actors.js';
import { createPartFactory } from '../src/actors/parts.js';
import { createGlowRegistry } from '../src/scene/glow.js';

test('typhoon lv1: one grey cloud high above the island, no rain', () => {
  const v = typhoon.view(lv({ typhoon: 1 }), {}); assert.deepEqual(Object.keys(v), ['typhoon.main']);
  assert.equal(v['typhoon.main'].kind, 'cloud'); assert.ok(v['typhoon.main'].parts.every(p => p.pos[1] >= 4));
});
test('lv2: spinning storm ring + rain; lv3: rainbow + riverside park, no rain', () => {
  const v2 = typhoon.view(lv({ typhoon: 2 }), {});
  assert.ok(v2['typhoon.main'].spin > 0); assert.ok(v2['typhoon.main'].parts.length >= 8); assert.equal(v2['typhoon.rain'].kind, 'rain');
  const v3 = typhoon.view(lv({ typhoon: 3 }), {});
  assert.equal(v3['typhoon.rain'], undefined); assert.equal(v3['typhoon.main'].parts.filter(p => p.kind === 'rail').length, 3);
  const park = landmarkWorld('park'); assert.ok(Math.hypot(v3['typhoon.park'].at.x - park.x, v3['typhoon.park'].at.z - park.z) < 1e-9);
});
test('delivery scooter exists only at lv2 with boba placed', () => {
  assert.equal(typhoon.view(lv({ typhoon: 2 }), {})['typhoon.scooter'], undefined);
  assert.equal(typhoon.view(lv({ typhoon: 2, boba: 1 }), {})['typhoon.scooter'].kind, 'scooter');
  assert.equal(typhoon.view(lv({ typhoon: 3, boba: 1 }), {})['typhoon.scooter'], undefined);
});
test('rain part: 240 instances, none cast shadows, drops fall', () => {
  const f = createPartFactory(THREE, { glow: createGlowRegistry(), builders: typhoon.builders });
  const p = f.build(typhoon.view(lv({ typhoon: 2 }), {})['typhoon.rain']), mesh = p.object.children[0];
  assert.equal(mesh.count, 240); assert.equal(mesh.castShadow, false);
  const m = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3();
  p.update(0, 0.1); mesh.getMatrixAt(0, m); a.setFromMatrixPosition(m); p.update(0, 0.2); mesh.getMatrixAt(0, m); b.setFromMatrixPosition(m);
  assert.ok(b.y < a.y || b.y > 5, 'falls (or wrapped to the top)');
});
test('cloud spins and scooter circles the centre cell', () => {
  const f = createPartFactory(THREE, { glow: createGlowRegistry(), builders: typhoon.builders });
  const c = f.build(typhoon.view(lv({ typhoon: 2 }), {})['typhoon.main']); c.update(0.5, 1); assert.notEqual(c.object.children[0].rotation.y, 0);
  const s = f.build(typhoon.view(lv({ typhoon: 2, boba: 1 }), {})['typhoon.scooter']); s.update(0, 0); const p0 = s.object.children[0].position.clone(); s.update(0, 1);
  assert.ok(p0.distanceTo(s.object.children[0].position) > 0.5); assert.ok(Math.abs(Math.hypot(p0.x, p0.z) - 1.95) < 1e-6);
});
test('worldEffects: lamps set the clock, typhoon Lv2 sends people indoors, blackout kills the glow at night', () => {
  assert.deepEqual(worldEffects(lv({}), {}), { time: TIMES.day, peopleVisible: true, glowScale: 1 });
  assert.equal(worldEffects(lv({ bulb: 3 }), {}).time, TIMES.dusk); assert.equal(worldEffects(lv({ bulb: 4 }), {}).time, TIMES.night);
  assert.equal(worldEffects(lv({ typhoon: 2 }), {}).peopleVisible, false); assert.equal(worldEffects(lv({ typhoon: 3 }), {}).peopleVisible, true);
  assert.deepEqual(worldEffects(lv({ bulb: 2 }), { blackout: true }), { time: TIMES.night, peopleVisible: true, glowScale: 0 });
});
