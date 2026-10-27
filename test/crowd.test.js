// test/crowd.test.js：show/crowd.js——島民名單、離某點最近的島民（趕工的 hero）、全島抬頭（最終章計畫 5 任務 2）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import { createState } from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { cellAt, SATELLITES, axialToWorld, TOP } from '../src/scene/hex.js';
import { anchorWorld } from '../src/actors/anchors.js';
import { headlessShow, turnSteps } from './helpers/show.js';
const { islanders, heroNear, lookUp, crowd } = await import('../src/show/crowd.js');
const { B } = await import('../src/show/beats.js');

const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);
const everyone = show => show.roster.keys().flatMap(k => show.roster.members(k));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// 第一條正解放完八個（倒數回合之前）：島上有島民、工程師、老鼠（模型）、衛星島上的人
async function placedShow() {
  const h = await headlessShow(), order = SOLUTIONS[0];
  let s = createState(spec);
  for (const step of turnSteps(order).slice(0, order.length)) {
    const r = step(s); s = r.state;
    await h.run([...r.events, { kind: 'settle' }], { instant: true });
  }
  return h;
}

test('islanders excludes hidden, arriving, riding, model members and anyone off the main island; heroNear returns the nearest one', async () => {
  const { show } = await placedShow(), c = { roster: show.roster };
  const all = everyone(show);
  assert.ok(all.some(m => !m.walker), 'the cast includes models (rats)');
  assert.ok(show.roster.members('chip.engineers').length >= 2, 'engineers on the island');
  const list = islanders(c);
  assert.ok(list.length >= 6, `islanders found (${list.length})`);
  for (const m of list) assert.ok(m.walker && !m.hidden && !m.arriving && m.mode === 'home' && cellAt(m.pos.x, m.pos.z));
  assert.ok(list.some(m => show.roster.members('chip.engineers').includes(m)), 'engineers count as islanders');
  // 每一種排除：拿名單裡的人改掉一個條件
  const [a, b, d, e, f] = list, sat = SATELLITES[0], off = axialToWorld(sat.q, sat.r);
  a.hidden = true; b.arriving = true; d.mode = 'script';
  const walker = e.walker; e.walker = null;   // 模型（老鼠）沒有 walker
  const pos = { ...f.pos }; Object.assign(f.pos, { x: off.x, y: TOP, z: off.z });   // 衛星島上
  const left = islanders(c);
  for (const m of [a, b, d, e, f]) assert.ok(!left.includes(m));
  assert.equal(left.length, list.length - 5);
  // 坐車頂的（老鼠的 ride）不算：它們是模型
  for (const m of all.filter(m => m.mode === 'home' && !m.walker)) assert.ok(!left.includes(m));
  // heroNear：名單裡離 p 最近的（平面距離）
  for (const p of ['chip', 'milk', 'bulb', 'baseball'].map(anchorWorld)) {
    const hero = heroNear(c, p), best = Math.min(...left.map(m => dist(m.pos, p)));
    assert.ok(left.includes(hero)); assert.equal(dist(hero.pos, p), best);
  }
  // max：cost 超過的不算；cost：自己量「近」（趕工量走路秒數）
  const p0 = anchorWorld('chip'), h0 = heroNear(c, p0), d0 = dist(h0.pos, p0);
  assert.equal(heroNear(c, p0, { max: d0 }), h0); assert.notEqual(heroNear(c, p0, { max: d0 - 1e-6 }), h0);
  const far = left.reduce((x, y) => (dist(y.pos, p0) > dist(x.pos, p0) ? y : x));
  assert.equal(heroNear(c, p0, { cost: m => -dist(m.pos, p0) }), far, 'cost decides who is nearest');
  a.hidden = false; b.arriving = false; d.mode = 'home'; e.walker = walker; Object.assign(f.pos, pos);
  assert.equal(heroNear({ roster: { keys: () => [], members: () => [] } }, anchorWorld('chip')), null, 'nobody → null');
});

test('lookUp turns at most 24 islanders toward the point and release sends them home', async () => {
  const { show } = await placedShow();
  // gesture／home 只用到名冊
  const c = { roster: show.roster, speed: 1 }, at = { x: -6, y: 2.5, z: -30 };
  const before = islanders(c);
  for (const max of [24, 3]) {
    const up = lookUp(B, at, 1.2, max);
    assert.equal(up.look.length, max); assert.ok(up.look.every(g => g.kind === 'gesture' && g.dur === 1.2));
    const started = up.look.map(g => g.start(c) !== false);
    const n = Math.min(max, before.length);
    assert.equal(started.filter(Boolean).length, n, `${n} islanders look up`);
    up.look.forEach((g, i) => { if (started[i]) g.step(1, 0.1, c); });
    const lookers = everyone(show).filter(m => m.walker?.gesture?.kind === 'look');
    assert.equal(lookers.length, n);
    for (const m of lookers) assert.ok(Math.abs(m.walker.gesture.yaw - Math.atan2(at.x - m.pos.x, at.z - m.pos.z)) < 1e-9, 'faces the point');
    up.look.forEach((g, i) => { if (started[i]) g.end(c); });
    assert.equal(everyone(show).filter(m => m.mode === 'script').length, n, 'claimed while looking');
    up.release.start(c);
    assert.equal(everyone(show).filter(m => m.mode === 'script').length, 0, 'release sends them home');
  }
});

test('crowd builds its together at start from the list it is given, and skips an empty list', () => {
  const ran = [], beat = d => ({ kind: 'wait', dur: d, start() { ran.push(d); } });
  const g = crowd(B, () => [beat(1), beat(2)]), c = {};
  assert.equal(g.dur(c), 0, 'no length before it starts');
  g.start(c); assert.equal(g.dur(c), 2); assert.deepEqual(ran, [1, 2]); g.end(c);
  assert.equal(crowd(B, () => []).start(c), false);
});
