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
test('playground kids come with the shuttle and need a school; forest tourists and the shop need the chain', () => {
  // 小孩是坐接駁車（物品 v2：代幣 Lv8）來的：代幣 Lv8 的劇本 hold 住名冊、在車旁 spawn
  assert.equal(sat.view(lv({ token: 7, milk: 3 }), {})['sat.playground'], undefined);
  assert.equal(sat.view(lv({ token: 8, milk: 1 }), {})['sat.playground'], undefined);
  assert.equal(sat.view(lv({ token: 8, milk: 2 }), {})['sat.playground'], undefined, 'milk Lv2 is the breakfast shop: no schoolkids yet (items v2)');
  const kids = sat.view(lv({ token: 8, milk: 3 }), {})['sat.playground'], s = SATELLITES.find(x => x.kind === 'playground'), c = axialToWorld(s.q, s.r);
  assert.deepEqual([kids.kind, kids.n, kids.accessory, kids.home.kind, kids.home.r], ['roster', 2, 'none', 'wander', 0.5]);
  assert.ok(Math.hypot(kids.home.at.x - c.x, kids.home.at.z - c.z) < 0.5, 'wanders on the playground island');
  // 配件跟鮮奶格的小孩一樣（物品 v2 §4.2：Lv6 棒球帽、Lv7 學士帽、Lv8 白袍、Lv9 起帽子拋掉了）
  assert.deepEqual([3, 5, 6, 7, 8, 9, 10].map(n => sat.view(lv({ token: 8, milk: n }), {})['sat.playground'].accessory), ['none', 'none', 'cap', 'mortar', 'coat', 'none', 'none']);
  assert.equal(sat.view(lv({ boba: 3 }), {})['sat.forest'], undefined); assert.equal(sat.view(lv({ boba: 4 }), {})['sat.forest'].n, 2); assert.equal(sat.view(lv({ boba: 3 }), {})['sat.forestShop'], undefined);
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
    const pts = [s.at, ...(s.parts ?? []).map(p => ({ x: s.at.x + p.pos[0], z: s.at.z + p.pos[2] })), ...(s.stand ?? []), ...(Array.isArray(s.path) ? s.path : []), ...(s.spots ?? []), ...(s.home?.spots ?? [])];
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

// 計畫 3.8 Task 6：衛星島上的名冊（遊樂場小孩、小森林觀光客）家不在主島走路格上——名冊不從入口走進來（衛星島照舊：
// 小孩由代幣 Lv5 在接駁車旁 spawn、觀光客跟著珍奶分店閃白出現），所以沒有 entry，入口檢查沒有東西要查
import { entryProblems, rosterSpots } from './helpers/actors.js';
import { cellAt } from '../src/scene/hex.js';
import { createNav } from '../src/show/nav.js';
test('satellite rosters live off the main island: no entry declared, nothing for the entry check', () => {
  const nav = createNav();
  for (const extra of [{ token: 8, milk: 3 }, { token: 6, milk: 5, boba: 4 }, allMax]) {
    const v = sat.view(lv(extra), {}), rosters = Object.entries(v).filter(([, d]) => d.kind === 'roster');
    assert.ok(rosters.length, JSON.stringify(extra));
    for (const [k, d] of rosters) {
      assert.equal(d.home.entry, undefined, k);
      assert.ok(rosterSpots(d).every(p => cellAt(p.x, p.z) === null), `${k} lives on its satellite island`);
    }
    assert.deepEqual(entryProblems(v, nav), []);
  }
});

// §14.3：燈塔亮了（燈泡 ≥2）之後有一位守塔人在燈塔島上繞圈（衛星島的 wander 走 ringPath）；燈還沒亮就沒有
test('satellites: lighthouse keeper appears at bulb ≥ 2 and rings the island; absent below', async () => {
  assert.equal(sat.view(lv({ bulb: 1 }), {})['sat.keeper'], undefined);
  const s = SATELLITES.find(x => x.kind === 'lighthouse'), c = axialToWorld(s.q, s.r);
  for (const bulb of [2, 3, 5]) {
    const k = sat.view(lv({ bulb }), {})['sat.keeper'];
    assert.deepEqual([k.kind, k.n, k.home.kind, k.home.entry], ['roster', 1, 'wander', undefined], `bulb ${bulb}`);
    assert.ok(Math.hypot(k.home.at.x - c.x, k.home.at.z - c.z) < 0.3, 'circles the lighthouse');
    assert.ok(k.home.r > 0.3 && k.home.r < 0.9, `ring r ${k.home.r} clear of the tower, on the island`);
  }
  const { headlessShow } = await import('./helpers/show.js'), { show, run } = await headlessShow();
  let st = engine.createState(spec);
  for (const id of stats(enumerate(spec), spec).full[0].order) {
    const r = engine.place(st, id, spec); st = r.state; await run([...r.events, { kind: 'settle' }], { instant: true });
    if (st.lv.bulb >= 2) break;
    assert.equal(show.roster.members('sat.keeper').length, 0, 'no keeper before the light');
  }
  const [m] = show.roster.members('sat.keeper'), k = sat.view(show.stage.lv, show.stage.flags)['sat.keeper'].home, start = { ...m.pos };
  let far = 0;
  for (let i = 0; i < 120; i++) {
    show.update(1 / 30, 100 + i / 30);
    assert.equal(cellAt(m.pos.x, m.pos.z), null, 'stays on the lighthouse island');
    assert.ok(Math.abs(Math.hypot(m.pos.x - k.at.x, m.pos.z - k.at.z) - k.r) < 0.05, 'on the ring');
    far = Math.max(far, Math.hypot(m.pos.x - start.x, m.pos.z - start.z));
  }
  assert.ok(far > 0.3, 'walks round');
});
// 守塔人跟燈塔的燈同一拍出現（燈泡 Lv2 電工走最後一段時），不是回合末才冒出來（審查）
test('the keeper appears on the same frame as the lighthouse light during bulb Lv2', async () => {
  const { headlessShow } = await import('./helpers/show.js'), { show, run } = await headlessShow(), update = show.update;
  let frame = 0, light = null, keeper = null;
  show.update = (dt, t) => { update(dt, t); frame++; if (light === null && show.stage.partObject('sat.lighthouse')) light = frame; if (keeper === null && show.roster.members('sat.keeper').length) keeper = frame; };
  let st = engine.createState(spec), done = false;
  for (const id of stats(enumerate(spec), spec).full[0].order) {
    const r = engine.place(st, id, spec); st = r.state;
    for (const e of [...r.events, { kind: 'settle' }]) {
      if (!done && e.kind === 'grow' && e.item === 'bulb' && e.to === 2) { await run([e]); done = true; }
      else await run([e], { instant: true });
    }
    if (done) break;
  }
  assert.ok(done && light !== null, 'the light comes on during the live bulb Lv2');
  assert.equal(keeper, light, `keeper on frame ${keeper}, light on frame ${light}`);
});
