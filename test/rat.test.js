import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as rat from '../src/actors/rat.js';
import * as landmarks from '../src/actors/landmarks.js';
import { ENGINEER_ROUTE } from '../src/actors/chip.js';
import { landmarkWorld } from '../src/actors/anchors.js';
import { lv } from './helpers/actors.js';
import { createPartFactory } from '../src/actors/parts.js';
import { createGlowRegistry } from '../src/scene/glow.js';

test('ratMode precedence: dome > alien > cyber > train > spring > nest > one', () => {
  assert.equal(rat.ratMode(lv({ rat: 1 }), {}), 'one');
  assert.equal(rat.ratMode(lv({ rat: 2 }), {}), 'nest');
  assert.equal(rat.ratMode(lv({ rat: 3 }), {}), 'spring');
  assert.equal(rat.ratMode(lv({ rat: 3, token: 2 }), {}), 'train');
  assert.equal(rat.ratMode(lv({ rat: 4, token: 2 }), { ratBranch: 'cyber' }), 'cyber');
  assert.equal(rat.ratMode(lv({ rat: 4 }), { ratBranch: 'alien' }), 'alien');
  assert.equal(rat.ratMode(lv({ rat: 4 }), { ratBranch: 'alien', domeRats: true }), 'dome');
  assert.equal(rat.ratMode(lv({ rat: 0 }), {}), null);
});
test('rat lv4 without ratBranch falls back to plain rats (review focus 4)', () => {
  assert.doesNotThrow(() => rat.view(lv({ rat: 4 }), {})); assert.equal(rat.ratMode(lv({ rat: 4 }), {}), 'spring');
  assert.equal(rat.ratMode(lv({ rat: 4, token: 3 }), {}), 'train');
});
test('every mode uses the Quaternius rat; a nest has five', () => {
  for (const [l, f] of [[{ rat: 1 }, {}], [{ rat: 2 }, {}], [{ rat: 3 }, {}], [{ rat: 3, token: 2 }, {}], [{ rat: 4 }, { ratBranch: 'cyber' }], [{ rat: 4 }, { ratBranch: 'alien' }], [{ rat: 2 }, { domeRats: true }]]) {
    const v = rat.view(lv(l), f), rats = Object.values(v).filter(s => s.kind === 'rats');
    assert.ok(rats.length && rats.every(s => s.path === 'quat/enemies/Rat.glb'), JSON.stringify(l));
  }
  assert.equal(rat.view(lv({ rat: 2 }), {})['rat.pack'].n, 5);
});
test('cyber rats are silver and follow the engineer route; alien rat is big, green, glowing, three-eyed at the spring', () => {
  const c = rat.view(lv({ rat: 4 }), { ratBranch: 'cyber' })['rat.pack'];
  assert.equal(c.loop.path, ENGINEER_ROUTE); assert.equal(c.tint.Grey, 0xc0c8d0); assert.ok(c.antenna);
  const a = rat.view(lv({ rat: 4 }), { ratBranch: 'alien' })['rat.main'], s = landmarkWorld('spring');
  assert.ok(a.h >= 0.4); assert.equal(a.glow.Grey, 0x5fcf7a); assert.ok(a.eye && a.wave); assert.ok(Math.hypot(a.at.x - s.x, a.at.z - s.z) < 1.2);
});
test('rats bathing turn the hot spring green-ish; rats on the train do not', () => {
  const water = v => v['landmarks.spring'].parts[1].color;
  assert.notEqual(water(landmarks.view(lv({ rat: 3 }), {})), water(landmarks.view(lv({}), {})));
  assert.equal(water(landmarks.view(lv({ rat: 3, token: 2 }), {})), water(landmarks.view(lv({}), {})));
});
test('rats builder spawns n models and moves them along the loop; train rats ride the roof', async () => {
  const assets = { spawn: async (p, o) => new THREE.Group() };
  const f = createPartFactory(THREE, { glow: createGlowRegistry(), assets, builders: rat.builders });
  const p = f.build(rat.view(lv({ rat: 2 }), {})['rat.pack']); await new Promise(r => setTimeout(r, 0));
  assert.equal(p.object.children.length, 5);
  const t = f.build(rat.view(lv({ rat: 3, token: 2 }), {})['rat.pack']); await new Promise(r => setTimeout(r, 0)); t.update(0.1, 2);
  const w = new THREE.Vector3(); t.object.updateMatrixWorld(true); t.object.children[0].children[0].getWorldPosition(w);
  assert.ok(w.y > 2, 'up on the elevated train');
});
test('rats builder disposes its antennas and eyes: glow registry back to zero (review #1)', async () => {
  const glow = createGlowRegistry(), assets = { spawn: async () => new THREE.Group() };
  const f = createPartFactory(THREE, { glow, assets, builders: rat.builders });
  for (const flags of [{ ratBranch: 'cyber' }, { ratBranch: 'alien' }]) {
    const key = flags.ratBranch === 'cyber' ? 'rat.pack' : 'rat.main', p = f.build(rat.view(lv({ rat: 4 }), flags)[key]);
    await new Promise(r => setTimeout(r, 0)); assert.ok(glow.size > 0 || flags.ratBranch === 'alien'); p.dispose(); assert.equal(glow.size, 0, flags.ratBranch);
  }
});
test('rats on a flooded line sit still on the stopped train (review #3)', async () => {
  const s = rat.view(lv({ rat: 3, token: 2 }), { flooded: true })['rat.pack']; assert.equal(s.train.speed, 0);
  const f = createPartFactory(THREE, { glow: createGlowRegistry(), assets: { spawn: async () => new THREE.Group() }, builders: rat.builders });
  const p = f.build(s); await new Promise(r => setTimeout(r, 0));
  p.update(0.1, 1); const a = p.object.children[0].position.clone(); p.update(0.1, 7); assert.ok(a.distanceTo(p.object.children[0].position) < 1e-9);
});
