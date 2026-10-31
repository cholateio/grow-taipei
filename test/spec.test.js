import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORDER, ITEMS, AFTER_TURN, STORIES } from '../src/rules/spec.js';
import { compile } from '../src/rules/conditions.js';
const minL = (id, n) => ({ minLevel: [id, n] }), maxL = (id, n) => ({ maxLevel: [id, n] }), pres = id => ({ present: id });

test('eight items in fixed order with spec max levels', () => {
  assert.deepEqual(ORDER, ['milk','chip','bulb','token','typhoon','rat','boba','baseball']);
  assert.deepEqual(ORDER.map(id => ITEMS[id].name), ['鮮奶','晶片','燈泡','代幣','颱風','老鼠','珍奶','棒球']);
});
// 唯一正解（設計 2026-10-31 §2、§4）：珍奶 7 → 6、老鼠 5 → 4；修正批次 2：颱風 4 → 3，合計 59；
// 跳級 11 條（多了晶片 9：在 7 時放晴就直接待命），只在晶片／燈泡／代幣／老鼠／珍奶
test('maxes are milk 10, token 10, chip 9, bulb 9, baseball 8, boba 6, rat 4, typhoon 3 (59 in all); exactly 11 jumps on chip/bulb/token/rat/boba', () => {
  const maxes = Object.fromEntries(ORDER.map(id => [id, ITEMS[id].max]));
  assert.deepEqual(maxes, { milk: 10, chip: 9, bulb: 9, token: 10, typhoon: 3, rat: 4, boba: 6, baseball: 8 });
  assert.equal(ORDER.reduce((n, id) => n + ITEMS[id].max, 0), 59);
  const jumps = ORDER.flatMap(id => Object.keys(ITEMS[id].jump || {}).map(n => [id, +n]));
  assert.equal(jumps.length, 11);
  const keys = { chip: [4, 6, 8, 9], bulb: [5, 8], token: [4, 9], rat: [4], boba: [4, 6] };
  for (const id of ORDER) {
    const got = Object.keys(ITEMS[id].jump || {}).map(Number).sort((a, b) => a - b);
    assert.deepEqual(got, keys[id] ?? [], `${id} jump keys`);
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
// 颱風三級（設計 2026-10-31 §4.3，修正批次 2）：賴在巨蛋的 delay 拿掉；放下當回合不升（up[2] 要 age ≥ 1）
test('jump and delay conditions compile; no item has a delay; typhoon up[2] is age ≥ 1', () => {
  const ctx = { max: Object.fromEntries(ORDER.map(id => [id, ITEMS[id].max])) };
  for (const id of ORDER) for (const kind of ['jump', 'delay']) for (const n in ITEMS[id][kind] || {}) assert.doesNotThrow(() => compile(ITEMS[id][kind][n], ctx));
  for (const id of ORDER) assert.ok(!('delay' in ITEMS[id]), `${id} has a delay`);
  assert.deepEqual(ITEMS.typhoon.up[2], { age: ['typhoon', 1] });
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
// 颱風三級（設計 2026-10-31 §4.3，修正批次 2）：放下那回合一次全部檢查（停電、淹水、巨蛋淹水、鼠災、颱風假、攤車被吹走），之後沒有反應；外送爆單 +1 拿掉了（死規則，協調者裁決）
test('typhoon checks all fire at placement: blackout, flood, dome flood, dome rats, day off, cart blown; no delivery delta, no onLevel', () => {
  const t = ITEMS.typhoon;
  assert.deepEqual(t.fx.map(a => a.when), [
    { and: [pres('bulb'), maxL('bulb', 2)] }, { and: [pres('token'), maxL('token', 3)] }, { and: [pres('baseball'), maxL('baseball', 3)] },
    { and: [minL('rat', 3), minL('baseball', 4)] }, pres('milk'), { and: [pres('boba'), maxL('boba', 3)] },
  ]);
  assert.deepEqual(t.fx.map(a => a.lock ?? null), ['bulb', 'token', 'baseball', null, null, 'boba']);
  assert.deepEqual(t.fx.map(a => a.flag?.name ?? null), ['blackout', 'flooded', 'domeFlood', 'domeRats', null, 'cartBlown']);
  assert.deepEqual(t.fx.map(a => a.delta ?? null), [{ target: 'milk', by: -1 }, null, null, null, null, null]);
  assert.ok(!t.fx.some(a => a.delta?.target === 'boba'), 'no delivery +1 (dead rule removed)');
  assert.deepEqual(t.fx.map(a => a.story), ['全島大停電！冰箱裡的鮮奶…', '捷運站變游泳池了', '球場變游泳池了', '老鼠被大水沖進大巨蛋！', '颱風假！小朋友在家看電視', '珍奶攤車被吹走了']);
  assert.ok(!t.onLevel && !t.delay, 'no checks on the later levels');
});
// 設計 §3 寫晶片 ≥6；求解器發現全滿的順序裡老鼠到 Lv4 時晶片一定已經 7 或 8，所以門檻改成 8（矽盾測試）
// 裁決 2026-10-31：珍奶糖分超標放寬到鮮奶 ≤4（附錄的 ≤2 照這張表到不了）
test('bobaSugar fires at boba Lv4 while milk ≤ 4', () => {
  assert.deepEqual(ITEMS.boba.onLevel[4], [{ when: maxL('milk', 4), flag: { name: 'bobaSugar' }, story: '全島糖分超標' }]);
});
test('rat Lv4 branches on chip >= 8; the bite is the only placement reaction (milk ≤ 2); no boba knock-over', () => {
  const b = ITEMS.rat.onLevel[4].find(a => a.branch);
  assert.deepEqual(b.branch, { flag: 'ratBranch', when: { minLevel: ['chip', 8] }, then: 'cyber', else: 'alien' });
  assert.equal(ITEMS.rat.fx.length, 1, 'only the bite');
  assert.deepEqual(ITEMS.rat.fx[0].when, { and: [pres('milk'), maxL('milk', 2)] });
  assert.deepEqual(ITEMS.rat.fx[0].delta, { target: 'milk', by: -1 });
  assert.ok(!ITEMS.rat.onLevel[2], 'no more bite at rat Lv2');
});
test('every item has a placed story and a story per level', () => {
  for (const id of ORDER) { assert.ok(STORIES.placed[id]); for (let n = 2; n <= ITEMS[id].max; n++) assert.ok(STORIES.grow[id][n], `${id} story ${n}`); }
});
// 設計 2026-10-31 §5.3 的故事句；拿掉的級數不留句子
test('stories of the re-levelled items follow design 2026-10-31 §5.3, with no text for removed levels', () => {
  assert.deepEqual(STORIES.grow.typhoon, { 2: '暴風圈還在島上空', 3: '雨過天晴，彩虹出來了' });
  assert.equal(STORIES.grow.boba[5], '分店開到森林島，燈塔島旗艦店開張'); assert.equal(STORIES.grow.boba[6], '世界珍奶節');
  assert.equal(STORIES.grow.rat[4], '老鼠的最終型態');
  for (const id of ORDER) assert.deepEqual(Object.keys(STORIES.grow[id]).map(Number), Array.from({ length: ITEMS[id].max - 1 }, (_, i) => i + 2), id);
});
// 計畫 5b（設計 2026-10-28 §3）：最後只長一輪；回到 GROW（2026-10-29 §3.1）：引擎沒有預設跳級，steady 旗標跟著拿掉
import { CLOSING_TURNS } from '../src/rules/spec.js';
import { helperDeps } from '../src/rules/engine.js';
test('CLOSING_TURNS is 1 and no item is steady', () => {
  assert.equal(CLOSING_TURNS, 1);
  assert.ok(ORDER.every(id => !('steady' in ITEMS[id])));
});

// 唯一正解（設計 2026-10-31 附錄）：條件表一字不差（每格都是正解那一回合島上有的東西）
const A = { always: true }, and = (...c) => ({ and: c }), or = (...c) => ({ or: c });
const UP = {
  milk: { 2: A, 3: pres('baseball'), 4: A, 5: minL('token', 2), 6: minL('baseball', 3), 7: minL('bulb', 2), 8: minL('chip', 2), 9: A, 10: minL('boba', 2) },
  chip: { 2: A, 3: minL('bulb', 3), 4: minL('milk', 4), 5: A, 6: minL('bulb', 5), 7: minL('token', 7), 8: minL('token', 7), 9: minL('typhoon', 3) },
  bulb: { 2: A, 3: pres('token'), 4: minL('milk', 3), 5: minL('baseball', 4), 6: A, 7: minL('token', 5), 8: minL('chip', 4), 9: minL('token', 7) },
  token: { 2: A, 3: minL('milk', 3), 4: minL('milk', 5), 5: minL('baseball', 2), 6: A, 7: minL('bulb', 5), 8: A, 9: minL('chip', 6), 10: minL('chip', 7) },
  typhoon: { 2: { age: ['typhoon', 1] }, 3: A },
  rat: { 2: or(minL('milk', 2), minL('boba', 2)), 3: minL('token', 4), 4: or(minL('chip', 3), minL('typhoon', 2)) },
  boba: { 2: minL('milk', 3), 3: pres('chip'), 4: minL('chip', 4), 5: and(minL('token', 7), minL('typhoon', 3)), 6: minL('token', 9) },
  baseball: { 2: minL('milk', 3), 3: and(maxL('token', 7), minL('milk', 3)), 4: minL('token', 4), 5: minL('bulb', 3), 6: minL('bulb', 5), 7: minL('token', 6), 8: minL('token', 7) },
};
const JUMP = {
  chip: { 4: minL('milk', 6), 6: and(minL('bulb', 5), minL('token', 6)), 8: and(minL('token', 7), minL('bulb', 6)), 9: minL('typhoon', 3) },
  bulb: { 5: and(minL('baseball', 4), minL('token', 4)), 8: and(minL('chip', 4), minL('token', 5)) },
  token: { 4: and(minL('milk', 5), minL('baseball', 3)), 9: and(minL('chip', 6), minL('bulb', 7)) },
  rat: { 4: and(minL('token', 4), minL('chip', 3)) },
  boba: { 4: and(minL('milk', 3), minL('chip', 4)), 6: and(minL('token', 9), minL('typhoon', 3)) },
};
// 修正批次 2（2026-10-31）：颱風三級、珍奶 5 加颱風 ≥3、晶片 jump[9]；其餘照附錄
test('up conditions: exactly the design 2026-10-31 appendix table (as amended by fix batch 2)', () => {
  for (const id of ORDER) assert.deepEqual(ITEMS[id].up, UP[id], id);
});
test('jumps: exactly the eleven of the design 2026-10-31 appendix (fix batch 2 adds chip 9); milk, typhoon and baseball have none', () => {
  for (const id of ORDER) assert.deepEqual(ITEMS[id].jump ?? {}, JUMP[id] ?? {}, id);
});
test('baseball Lv3 (the dome) needs the milk Little League: min(milk, 3) alongside the token cap', () => {
  assert.ok(helperDeps(ITEMS.baseball.up[3], 'baseball').includes('milk'));
  const leaves = c => !c || typeof c !== 'object' ? [] : [c, ...(c.and || []).flatMap(leaves), ...(c.or || []).flatMap(leaves)];
  assert.ok(leaves(ITEMS.baseball.up[3]).some(l => l.minLevel?.[0] === 'milk' && l.minLevel[1] === 3), 'min(milk, 3)');
});
