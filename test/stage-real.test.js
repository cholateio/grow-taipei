import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { installFakeDom } from './helpers/fakedom.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { createPeople } from '../src/scene/people.js';
import { createNav } from '../src/show/nav.js';
import { createBlink } from '../src/show/blink.js';
installFakeDom();
const { createStage } = await import('../src/actors/stage.js');
const { createRoster } = await import('../src/show/roster.js');
import { enumerate, stats } from '../src/solver/run.js';
const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);   // 兩條正解（賽博、外星），從求解器取
const modules = await Promise.all(['landmarks', 'tower', 'milk', 'baseball', 'chip', 'rat', 'bulb', 'token', 'boba', 'typhoon'].map(m => import(`../src/actors/${m}.js`)));

// 真模組跑完整一局（賽博與外星兩條解）再 RESET：發光登記表、小人、模型都要回到開局（審查 #1、#2）
test('full games with the real modules leave no glow, walkers or models behind after RESET', async () => {
  const released = [], spawned = [];
  const assets = { spawn: async (path, opts) => { const g = new THREE.Group(); opts?.parent?.add(g); spawned.push(g); return g; }, release: g => { released.push(g); g.removeFromParent(); } };
  const glow = createGlowRegistry(), people = createPeople(THREE, { max: 48 });
  const blink = createBlink(THREE, { people });
  const roster = createRoster(THREE, { people, assets, build: null, nav: createNav(), blink, rail: { offset: 0 } });
  const stage = createStage(THREE, { scene: new THREE.Scene(), spec, modules, ctx: { people, assets, glow }, roster, blink });
  const base = { glow: glow.size, walkers: people.walkers.length, roster: roster.count };   // 開局就有島民名冊（6 人）
  for (const order of SOLUTIONS) {
    let s = engine.createState(spec);
    for (const id of order) { const r = engine.place(s, id, spec); s = r.state; for (const e of r.events) stage.apply(e); await new Promise(res => setTimeout(res, 0)); }
    for (let i = 0; i < spec.CLOSING_TURNS; i++) { const r = engine.advance(s, spec); s = r.state; for (const e of r.events) stage.apply(e); }
    stage.reset(); await new Promise(res => setTimeout(res, 0));
    assert.equal(glow.size, base.glow, order.join()); assert.equal(people.walkers.length, base.walkers); assert.equal(roster.count, base.roster);
  }
  assert.equal(released.length, spawned.length, 'every spawned model released');
});
