import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORDER, ITEMS, AFTER_TURN, STORIES } from '../src/rules/spec.js';
import { compile } from '../src/rules/conditions.js';

test('eight items in fixed order with spec max levels', () => {
  assert.deepEqual(ORDER, ['milk','chip','bulb','token','typhoon','rat','boba','baseball']);
  assert.deepEqual(ORDER.map(id => ITEMS[id].name), ['鮮奶','晶片','燈泡','代幣','颱風','老鼠','珍奶','棒球']);
});
// 物品 v2（2026-10-26 §2、§4）：級數分層，合計 61 級；回到 GROW（2026-10-29 設計 §3.2）：跳級 13 條，只在燈泡／代幣／晶片／老鼠／珍奶，每物品最多 5 條
test('maxes are milk 10, token 10, chip 9, bulb 9, baseball 8, boba 7, rat 5, typhoon 3; exactly 13 jumps on bulb/token/chip/rat/boba; at most 5 per item', () => {
  const maxes = Object.fromEntries(ORDER.map(id => [id, ITEMS[id].max]));
  assert.deepEqual(maxes, { milk: 10, chip: 9, bulb: 9, token: 10, typhoon: 3, rat: 5, boba: 7, baseball: 8 });
  assert.equal(ORDER.reduce((n, id) => n + ITEMS[id].max, 0), 61);
  const jumps = ORDER.flatMap(id => Object.keys(ITEMS[id].jump || {}).map(n => [id, +n]));
  assert.equal(jumps.length, 13);
  const keys = { bulb: [5, 8], token: [4, 7, 10], chip: [4, 6, 7, 8, 9], rat: [4], boba: [4, 6] };
  for (const id of ORDER) {
    const got = Object.keys(ITEMS[id].jump || {}).map(Number).sort((a, b) => a - b);
    assert.deepEqual(got, keys[id] ?? [], `${id} jump keys`);
    assert.ok(got.length <= 5, `${id} has more than five jumps`);
  }
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
// 計畫 5b（設計 2026-10-28 §3）：最後只長一輪；回到 GROW（2026-10-29 §3.1）：引擎沒有預設跳級，steady 旗標跟著拿掉
import { CLOSING_TURNS } from '../src/rules/spec.js';
import { helperDeps } from '../src/rules/engine.js';
test('CLOSING_TURNS is 1 and no item is steady', () => {
  assert.equal(CLOSING_TURNS, 1);
  assert.ok(ORDER.every(id => !('steady' in ITEMS[id])));
});

// 回到 GROW（2026-10-29 設計 §3.2）：預設自己長；阻擋與跳級都少量、一字不差
const minL = (id, n) => ({ minLevel: [id, n] }), maxL = (id, n) => ({ maxLevel: [id, n] }), pres = id => ({ present: id });
test('blockers: exactly the eight of design §3.2; every other up[] is auto', () => {
  const blockers = { 'milk 3': pres('baseball'), 'baseball 2': minL('milk', 3), 'baseball 3': { and: [maxL('token', 7), minL('milk', 3)] },
    'rat 3': minL('token', 4), 'rat 4': { or: [minL('chip', 3), minL('typhoon', 2)] }, 'typhoon 3': minL('bulb', 6), 'chip 9': minL('typhoon', 2) };
  for (const id of ORDER) for (let n = 2; n <= ITEMS[id].max; n++) {
    const key = `${id} ${n}`, c = ITEMS[id].up[n];
    if (key === 'rat 5') continue;   // 照舊（分岔旗標）
    if (blockers[key]) assert.deepEqual(c, blockers[key], key); else assert.deepEqual(c, { always: true }, `${key} should be auto`);
  }
  assert.ok(ITEMS.rat.up[5].or?.length === 2);
});
test('jumps: exactly the thirteen of design §3.2', () => {
  assert.deepEqual(ITEMS.bulb.jump, { 5: minL('baseball', 4), 8: minL('chip', 4) });
  assert.deepEqual(ITEMS.token.jump, { 4: pres('chip'), 7: minL('bulb', 6), 10: minL('chip', 7) });
  assert.deepEqual(ITEMS.chip.jump, { 4: minL('milk', 4), 6: minL('bulb', 6), 7: minL('token', 7), 8: minL('token', 7), 9: minL('typhoon', 2) });
  assert.deepEqual(ITEMS.rat.jump, { 4: { and: [minL('token', 4), { or: [minL('chip', 3), minL('typhoon', 2)] }] } });
  assert.deepEqual(ITEMS.boba.jump, { 4: minL('chip', 2), 6: minL('token', 7) });
  for (const id of ['milk', 'typhoon', 'baseball']) assert.deepEqual(ITEMS[id].jump ?? {}, {}, id);
});
test('baseball Lv3 (the dome) needs the milk Little League: min(milk, 3) alongside the token cap', () => {
  assert.ok(helperDeps(ITEMS.baseball.up[3], 'baseball').includes('milk'));
  const leaves = c => !c || typeof c !== 'object' ? [] : [c, ...(c.and || []).flatMap(leaves), ...(c.or || []).flatMap(leaves)];
  assert.ok(leaves(ITEMS.baseball.up[3]).some(l => l.minLevel?.[0] === 'milk' && l.minLevel[1] === 3), 'min(milk, 3)');
});
