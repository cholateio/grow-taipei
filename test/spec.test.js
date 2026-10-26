import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORDER, ITEMS, AFTER_TURN, STORIES } from '../src/rules/spec.js';
import { compile } from '../src/rules/conditions.js';

test('eight items in fixed order with spec max levels', () => {
  assert.deepEqual(ORDER, ['milk','chip','bulb','token','typhoon','rat','boba','baseball']);
  assert.deepEqual(ORDER.map(id => ITEMS[id].name), ['鮮奶','晶片','燈泡','代幣','颱風','老鼠','珍奶','棒球']);
});
// 物品 v2（2026-10-26 §2、§4）：級數分層，合計 61 級；跳級六個、每物品最多一個
test('maxes are milk 10, token 10, chip 9, bulb 9, baseball 8, boba 7, rat 5, typhoon 3; exactly six jumps, at most one per item', () => {
  const maxes = Object.fromEntries(ORDER.map(id => [id, ITEMS[id].max]));
  assert.deepEqual(maxes, { milk: 10, chip: 9, bulb: 9, token: 10, typhoon: 3, rat: 5, boba: 7, baseball: 8 });
  assert.equal(ORDER.reduce((n, id) => n + ITEMS[id].max, 0), 61);
  const jumps = ORDER.flatMap(id => Object.keys(ITEMS[id].jump || {}).map(n => [id, +n]));
  assert.equal(jumps.length, 6);
  for (const id of ORDER) assert.ok(Object.keys(ITEMS[id].jump || {}).length <= 1, `${id} has more than one jump`);
  assert.deepEqual(jumps.map(([id]) => id).sort(), ['baseball', 'boba', 'bulb', 'chip', 'milk', 'token']);
  for (const [id, n] of jumps) assert.ok(n >= 3 && n <= ITEMS[id].max, `${id} jump[${n}] out of range`);
});
test('every up/jump condition references a level the other item can reach', () => {
  const refs = c => !c || typeof c !== 'object' ? [] : [
    ...('minLevel' in c ? [c.minLevel] : []), ...('maxLevel' in c ? [c.maxLevel] : []),
    ...(c.and || []).flatMap(refs), ...(c.or || []).flatMap(refs), ...(c.not ? refs(c.not) : []),
  ];
  for (const id of ORDER) for (const kind of ['up', 'jump', 'delay']) for (const n in ITEMS[id][kind] || {}) {
    for (const [other, k] of refs(ITEMS[id][kind][n])) {
      assert.ok(other in ITEMS, `${id} ${kind}[${n}] names ${other}`);
      assert.ok(k >= 0 && k <= ITEMS[other].max, `${id} ${kind}[${n}] asks ${other} ${k} (max ${ITEMS[other].max})`);
    }
  }
});
test('jump and delay conditions compile; typhoon Lv3 has the dome delay', () => {
  const ctx = { max: Object.fromEntries(ORDER.map(id => [id, ITEMS[id].max])) };
  for (const id of ORDER) for (const kind of ['jump', 'delay']) for (const n in ITEMS[id][kind] || {}) assert.doesNotThrow(() => compile(ITEMS[id][kind][n], ctx));
  assert.deepEqual(ITEMS.typhoon.delay, { 3: { minLevel: ['baseball', 3] } });
});
test('every level 2..max has an explicit up condition that compiles', () => {
  const ctx = { max: Object.fromEntries(ORDER.map(id => [id, ITEMS[id].max])) };
  for (const id of ORDER) for (let n = 2; n <= ITEMS[id].max; n++) {
    assert.ok(ITEMS[id].up[n], `${id} up[${n}] missing`);
    assert.doesNotThrow(() => compile(ITEMS[id].up[n], ctx));
  }
});
test('every action and stall condition compiles', () => {
  const ctx = { max: Object.fromEntries(ORDER.map(id => [id, ITEMS[id].max])) };
  const all = [...AFTER_TURN];
  for (const id of ORDER) { all.push(...(ITEMS[id].fx || [])); for (const k in ITEMS[id].onLevel || {}) all.push(...ITEMS[id].onLevel[k]); all.push(...(ITEMS[id].stall || [])); }
  for (const a of all) { if (a.when) assert.doesNotThrow(() => compile(a.when, ctx)); if (a.branch) assert.doesNotThrow(() => compile(a.branch.when, ctx)); }
});
test('typhoon Lv2 check exists with the five spec steps in order', () => {
  const steps = ITEMS.typhoon.onLevel[2];
  assert.equal(steps.length, 5);
  assert.equal(steps[0].lock, 'bulb'); assert.equal(steps[0].flag.name, 'blackout');
  assert.equal(steps[1].lock, 'token'); assert.equal(steps[1].flag.name, 'flooded');
  assert.equal(steps[2].flag.name, 'domeRats');
  assert.equal(steps[4].delta.target, 'boba'); assert.equal(steps[4].delta.by, 1);
});
// 設計 §3 寫晶片 ≥6；求解器發現全滿的順序裡老鼠到 Lv4 時晶片一定已經 7 或 8，所以門檻改成 8（矽盾測試）
test('rat Lv4 branches on chip >= 8; the bite is a placement reaction while milk ≤ 2', () => {
  const b = ITEMS.rat.onLevel[4].find(a => a.branch);
  assert.deepEqual(b.branch, { flag: 'ratBranch', when: { minLevel: ['chip', 8] }, then: 'cyber', else: 'alien' });
  const bite = ITEMS.rat.fx.find(a => a.delta);
  assert.deepEqual(bite.delta, { target: 'milk', by: -1 });
  assert.ok(!ITEMS.rat.onLevel[2], 'no more bite at rat Lv2');
});
test('every item has a placed story and a story per level', () => {
  for (const id of ORDER) { assert.ok(STORIES.placed[id]); for (let n = 2; n <= ITEMS[id].max; n++) assert.ok(STORIES.grow[id][n], `${id} story ${n}`); }
});
