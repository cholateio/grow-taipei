import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { installFakeDom } from './helpers/fakedom.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { createPeople } from '../src/scene/people.js';
installFakeDom();
const { createStage } = await import('../src/actors/stage.js');
const modules = await Promise.all(['landmarks', 'tower', 'milk', 'baseball', 'chip', 'rat', 'bulb', 'token', 'boba', 'typhoon'].map(m => import(`../src/actors/${m}.js`)));

// 真模組跑完整一局（賽博與外星兩條解）再 RESET：發光登記表、小人、模型都要回到開局（審查 #1、#2）
test('full games with the real modules leave no glow, walkers or models behind after RESET', async () => {
  const released = [], spawned = [];
  const assets = { spawn: async () => { const g = new THREE.Group(); spawned.push(g); return g; }, release: g => released.push(g) };
  const glow = createGlowRegistry(), people = createPeople(THREE, { max: 48 });
  const stage = createStage(THREE, { scene: new THREE.Scene(), spec, modules, ctx: { people, assets, glow } });
  const base = { glow: glow.size, walkers: people.walkers.length };
  for (const order of [['typhoon', 'milk', 'token', 'baseball', 'rat', 'bulb', 'chip', 'boba'], ['typhoon', 'milk', 'token', 'baseball', 'rat', 'bulb', 'boba', 'chip']]) {
    let s = engine.createState(spec);
    for (const id of order) { const r = engine.place(s, id, spec); s = r.state; for (const e of r.events) await stage.apply(e, { instant: true }); await new Promise(res => setTimeout(res, 0)); }
    stage.reset(); await new Promise(res => setTimeout(res, 0));
    assert.equal(glow.size, base.glow, order.join()); assert.equal(people.walkers.length, base.walkers);
  }
  assert.equal(released.length, spawned.length, 'every spawned model released');
});
