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
  assert.deepEqual(ITEMS.typhoon.delay, { 3: { and: [{ minLevel: ['baseball', 3] }, { maxLevel: ['chip', 7] }] } });
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
// 計畫 5b（設計 2026-10-28 §3）：最後只長一輪；鮮奶不連跳（使用者：學校一下升太多級很突兀）
import { CLOSING_TURNS } from '../src/rules/spec.js';
test('CLOSING_TURNS is 1 and milk is steady', () => {
  assert.equal(CLOSING_TURNS, 1);
  assert.equal(ITEMS.milk.steady, true);
  assert.deepEqual(ORDER.filter(id => ITEMS[id].steady), ['milk']);
});

// 看得見的因果與離島三段（2026-10-28 設計 §2、§3）：Lv3 以上沒有「自己長」——每一級的條件都提到至少一個別的物品（minLevel／present），
// 條件裡任何地方都不能藏 always（or(auto, …) 等於自己長）。Lv2 可以自己長（剛放下那一回合的小成長）；颱風例外（天氣不是被誰觸發的）
import { helperDeps } from '../src/rules/engine.js';
test('no auto up[] from Lv3 on except typhoon; every condition from Lv3, and every or-branch in it, names at least one helper (minLevel/present)', () => {
  const hasAlways = c => !!c && typeof c === 'object' && (c.always || [...(c.and || []), ...(c.or || [])].some(hasAlways));
  for (const id of ORDER) {
    if (id === 'typhoon') continue;
    for (const kind of ['up', 'jump']) for (const n in ITEMS[id][kind] || {}) {
      if (+n < 3) continue;
      const c = ITEMS[id][kind][n];
      assert.ok(!hasAlways(c), `${id} ${kind}[${n}] grows by itself`);
      assert.ok(helperDeps(c, id).length > 0, `${id} ${kind}[${n}] names no helper: ${JSON.stringify(c)}`);
      // or 的每一支也要提到幫手：只有一支有幫手的話，另一支成立時就是「自己長」（via 會是空的，演不出拜訪）
      const ors = x => !x || typeof x !== 'object' ? [] : [...(x.or ? [x] : []), ...[...(x.and || []), ...(x.or || [])].flatMap(ors)];
      for (const o of ors(c)) for (const alt of o.or) assert.ok(helperDeps(alt, id).length > 0, `${id} ${kind}[${n}] has an or-branch without a helper: ${JSON.stringify(alt)}`);
    }
  }
});
test('baseball Lv3 (the dome) needs the milk Little League: min(milk, 3) alongside the token cap', () => {
  assert.ok(helperDeps(ITEMS.baseball.up[3], 'baseball').includes('milk'));
  const leaves = c => !c || typeof c !== 'object' ? [] : [c, ...(c.and || []).flatMap(leaves), ...(c.or || []).flatMap(leaves)];
  assert.ok(leaves(ITEMS.baseball.up[3]).some(l => l.minLevel?.[0] === 'milk' && l.minLevel[1] === 3), 'min(milk, 3)');
});
