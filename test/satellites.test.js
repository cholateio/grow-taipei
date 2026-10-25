import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import * as sat from '../src/actors/satellites.js';
import { SATELLITES, axialToWorld, R } from '../src/scene/hex.js';
import { lv } from './helpers/actors.js';
import { installFakeDom } from './helpers/fakedom.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { createPeople } from '../src/scene/people.js';
import { createPartFactory } from '../src/actors/parts.js';
import { enumerate, stats } from '../src/solver/run.js';
installFakeDom();
const { createStage } = await import('../src/actors/stage.js');
const allMax = Object.fromEntries(spec.ORDER.map(id => [id, spec.ITEMS[id].max]));

test('windmill blades: idle 1, storm 6 with wobble, blackout 0, after the storm back to 1', () => {
  assert.equal(sat.view(lv({}), {})['sat.windmill'].speed, 1);
  const storm = sat.view(lv({ typhoon: 2 }), {})['sat.windmill']; assert.equal(storm.speed, 6); assert.ok(storm.wobble);
  assert.equal(sat.view(lv({ bulb: 2 }), { blackout: true })['sat.windmill'].speed, 0);
  assert.equal(sat.view(lv({ typhoon: 3 }), {})['sat.windmill'].speed, 1);
  const f = createPartFactory(THREE, { glow: createGlowRegistry(), builders: sat.builders }), p = f.build(sat.view(lv({}), {})['sat.windmill']);
  p.update(0.5, 0.5); assert.notEqual(p.object.children[0].rotation.z, 0, 'blades turn');
});
test('lighthouse lights at bulb 2, sweeps at bulb 3, dark in a blackout', () => {
  assert.equal(sat.view(lv({ bulb: 1 }), {})['sat.lighthouse'], undefined);
  assert.ok(sat.view(lv({ bulb: 2 }), {})['sat.lighthouse']); assert.equal(sat.view(lv({ bulb: 2 }), {})['sat.beam'], undefined);
  assert.equal(sat.view(lv({ bulb: 3 }), {})['sat.beam'].kind, 'beam');
  assert.equal(sat.view(lv({ bulb: 3 }), { blackout: true })['sat.lighthouse'], undefined);
});
test('playground kids need the spur and a school; forest tourists need a queue; the shop needs the chain', () => {
  assert.equal(sat.view(lv({ token: 3, milk: 3 }), {})['sat.playground'], undefined);
  const kids = sat.view(lv({ token: 4, milk: 2 }), {})['sat.playground']; assert.equal(kids.n, 2); assert.equal(kids.accessory, 'none');
  assert.equal(sat.view(lv({ token: 4, milk: 5 }), {})['sat.playground'].accessory, 'cap');
  assert.equal(sat.view(lv({ boba: 2 }), {})['sat.forest'].n, 2); assert.equal(sat.view(lv({ boba: 3 }), {})['sat.forestShop'], undefined);
  assert.equal(sat.view(lv({ boba: 4 }), {})['sat.forestShop'].kind, 'compound');
});
test('camp at chip 3, rocks get rats at rat 3 (not alongside the cyber army), chest opens only when everything is MAX', () => {
  assert.equal(sat.view(lv({ chip: 2 }), {})['sat.camp'], undefined); assert.ok(sat.view(lv({ chip: 3 }), {})['sat.camp'].parts.some(p => p.glow));
  assert.equal(sat.view(lv({ rat: 3 }), {})['sat.rocks'].kind, 'rats');
  assert.equal(sat.view(lv({ rat: 5 }), { ratBranch: 'cyber' })['sat.rocks'], undefined, 'skeleton budget: 10 army + shiba');
  assert.equal(sat.view(lv({}), {})['sat.chest'].open, false); assert.equal(sat.view(allMax, {})['sat.chest'].open, true);
  assert.ok(sat.view(allMax, {})['sat.chest'].parts.some(p => p.glow));
});
test('boats: 2, 4 with a queue, 6 with the chain, none in the storm', () => {
  assert.equal(sat.view(lv({}), {})['sat.boats'].n, 2); assert.equal(sat.view(lv({ boba: 2 }), {})['sat.boats'].n, 4);
  assert.equal(sat.view(lv({ boba: 4 }), {})['sat.boats'].n, 6); assert.equal(sat.view(lv({ boba: 4, typhoon: 2 }), {})['sat.boats'], undefined);
});
test('every satellite part sits on its island (within R of the island centre) except boats', () => {
  const centres = SATELLITES.map(s => axialToWorld(s.q, s.r));
  for (const v of [sat.view(allMax, {}), sat.view(lv({ token: 4, milk: 5, boba: 4, chip: 3, rat: 3, bulb: 3 }), {})]) for (const [k, s] of Object.entries(v)) {
    if (k === 'sat.boats') continue;
    const pts = [s.at, ...(s.parts ?? []).map(p => ({ x: s.at.x + p.pos[0], z: s.at.z + p.pos[2] })), ...(s.stand ?? []), ...(Array.isArray(s.path) ? s.path : []), ...(s.spots ?? [])];
    for (const p of pts) assert.ok(centres.some(c => Math.hypot(p.x - c.x, p.z - c.z) < R), `${k} ${JSON.stringify(p)}`);
  }
});
test('satellites reset to the opening state (review focus 4)', async () => {
  const modules = await Promise.all(['landmarks', 'tower', 'milk', 'baseball', 'chip', 'rat', 'bulb', 'token', 'boba', 'typhoon', 'satellites'].map(m => import(`../src/actors/${m}.js`)));
  const assets = { spawn: async () => new THREE.Group(), release() {} }, people = createPeople(THREE, { max: 48 });
  const stage = createStage(THREE, { scene: new THREE.Scene(), spec, modules, ctx: { people, assets, glow: createGlowRegistry() } });
  let s = engine.createState(spec);
  for (const id of stats(enumerate(spec), spec).full[0].order) { const r = engine.place(s, id, spec); s = r.state; for (const e of r.events) stage.apply(e); }
  for (let i = 0; i < spec.CLOSING_TURNS; i++) { const r = engine.advance(s, spec); s = r.state; for (const e of r.events) stage.apply(e); }
  assert.ok(stage.partKeys().includes('sat.forestShop'));
  stage.reset();
  assert.deepEqual(stage.partKeys().filter(k => k.startsWith('sat.')).sort(), ['sat.boats', 'sat.chest', 'sat.windmill']);
});
