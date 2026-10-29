import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enumerate, stats, check, greedyOrder, playOrder } from '../src/solver/run.js';
import * as spec from '../src/rules/spec.js';
import { createState, place, advance } from '../src/rules/engine.js';

test('enumerate visits all 40320 orders without throwing', () => {
  const r = enumerate(spec); assert.equal(r.length, 40320);
  assert.ok(r.every(x => x.ending && typeof x.maxCount === 'number'));
});
test('stats shape', () => {
  const s = stats(enumerate(spec), spec);
  assert.equal(s.total, 40320); assert.equal(s.maxHist.length, 9);
  assert.ok(s.avgMax >= 0 && s.avgMax <= 8); assert.ok('cyber' in s.byEnding || 'tryAgain' in s.byEnding);
});
test('check returns ok=false with named failures on a spec that has zero full solutions', () => {
  const never = { ...spec, ITEMS: structuredClone(spec.ITEMS) }; never.ITEMS.milk.up[2] = { minLevel: ['milk', 9] };
  const c = check(enumerate(never), never);
  assert.equal(c.ok, false); assert.ok(c.failures.some(f => /剛好 2/.test(f)));
});
test('greedyOrder is a permutation of ORDER', () => {
  assert.deepEqual([...greedyOrder(spec)].sort(), [...spec.ORDER].sort());
});
test('playOrder of a fixed order is deterministic', () => {
  const a = playOrder(spec.ORDER, spec), b = playOrder(spec.ORDER, spec);
  assert.deepEqual(a.state, b.state); assert.equal(a.ending.id, b.ending.id);
});
import { pacing } from '../src/solver/run.js';
// 節奏（回到 GROW 2026-10-29 設計 §5）：有物品到 MAX 的回合 ≥ 2；同一回合到 MAX 不設上限（GROW 的收尾是最後一回合大家到 MAX）；倒數回合也算
const late = {
  ORDER: ['a', 'b', 'c'], CLOSING_TURNS: 2,
  ITEMS: { a: { name: 'A', max: 2, up: { 2: { age: ['a', 3] } } }, b: { name: 'B', max: 2, up: { 2: { age: ['b', 2] } } }, c: { name: 'C', max: 2, up: { 2: { age: ['c', 1] } } } },
  AFTER_TURN: [], STORIES: { placed: { a: '', b: '', c: '' }, grow: { a: { 2: '' }, b: { 2: '' }, c: { 2: '' } } },
};
test('pacing check rejects a solution whose MAXes all land in one turn', () => {
  const p = pacing([{ order: ['a', 'b', 'c'] }], late);
  assert.equal(p.ok, false); assert.equal(p.maxTurns, 1); assert.ok(p.failures.some(f => /至少 2/.test(f)));
});
test('pacing counts closing turns as turns and still reports maxMaxesPerTurn', () => {
  const p = pacing([{ order: ['a', 'b', 'c'] }], late);
  assert.equal(p.maxGrowsPerTurn, 3, 'all three grow in turn 4, the first closing turn'); assert.equal(p.maxMaxesPerTurn, 3);
  assert.ok(pacing([{ order: ['a', 'b', 'c'] }], { ...late, CLOSING_TURNS: 0 }).maxGrowsPerTurn === 0);
});
test('check #6 is wired: a spec failing pacing fails check', () => {
  const results = [{ order: ['a', 'b', 'c'], maxCount: 3, ending: { id: 'cyber' }, satisfied: [], state: {} }];
  assert.ok(check(results, late).failures.some(f => /節奏/.test(f)));
});

// 物品 v2（2026-10-26）：兩條正解快照、颱風第 8 個、晶片第 8 個的報告項
// 選擇帶動升級（2026-10-28 §3）：9 回合下颱風一定第 8、老鼠一定第 7；兩條正解只差第 3、4 個先放燈泡（賽博）還是先放代幣（外星）
import { chipEighth } from '../src/solver/run.js';
// 回到 GROW（2026-10-29 設計 §3.2 的表）之後，兩條正解剛好還是這兩條（求解器收到的，見 spec.js 註解）
const all = enumerate(spec), st = stats(all, spec);
test('check passes on the shipped spec: exactly two full orders, one cyber one alien (snapshot the two orders)', () => {
  const c = check(all, spec);
  assert.deepEqual(c.failures, []);
  assert.deepEqual(st.full.map(r => [r.order.join(','), r.ending.id]).sort(), [
    ['milk,baseball,bulb,token,chip,boba,rat,typhoon', 'cyber'],
    ['milk,baseball,token,bulb,chip,boba,rat,typhoon', 'alien'],
  ]);
});
// 回到 GROW（2026-10-29 §5）：賽博 t8 棒球、燈泡到 MAX，t9 其餘六個；外星 t8 棒球，t9 其餘七個
test('both full orders: MAX lands in ≥ 2 turns; cyber maxes baseball+bulb in t8 and the other six in t9, alien baseball in t8 and seven in t9', () => {
  for (const r of st.full) {
    const p = pacing([r], spec); assert.ok(p.ok, p.failures.join('\n')); assert.equal(p.maxTurns, 2);
    assert.equal(p.maxMaxesPerTurn, r.ending.id === 'cyber' ? 6 : 7, r.ending.id);
  }
});
test('a typhoon-eighth order is among the full orders (review focus 3)', () => {
  assert.ok(st.full.some(r => r.order[7] === 'typhoon'));
  for (const r of st.full) assert.equal(r.state.lv.typhoon, 3, 'the rainbow comes before the missile');
});
test('report: with chip eighth every other item reaches max−1 in some order', () => {
  const rep = chipEighth(all, spec);
  assert.equal(typeof rep.ok, 'boolean'); assert.ok(rep.best.order[7] === 'chip');
  assert.ok(rep.best.short.every(id => id !== 'chip'));
  assert.equal(rep.ok, rep.best.short.length === 0);
  assert.equal(rep.ok, true, `best chip-eighth order still leaves ${rep.best.short.join(',')} below max−1`);
});
// 審稿第 1 輪故事要求：照正解玩不會看到災難附註；颱風擋飛彈、鮮奶過期都當得上標題（不是永遠被前面的蓋掉）
function storyGoals(results, s) {
  const out = [];
  for (const r of s.full) for (const id of ['blackout', 'flood', 'domeRats']) if (r.satisfied.includes(id)) out.push(`${r.order.join(',')} 有 ${id}`);
  for (const id of ['typhoonDeflect', 'milkExpired']) if (!results.some(r => r.ending.id === id)) out.push(`${id} 從來不是標題`);
  if (results.filter(r => r.satisfied.includes('typhoonDeflect')).every(r => r.satisfied.includes('blackout'))) out.push('颱風擋飛彈的順序都是大停電');
  return out;
}
test('story: true solutions carry no disaster extras; typhoonDeflect and milkExpired each title some orders', () => {
  assert.deepEqual(storyGoals(all, st), []);
});

// 設計 §3.3：兩條正解逐回合的級數（跳級算一步）
const LV = {
  cyber: [[2,0,0,0,0,0,0,0],[3,0,0,0,0,0,0,2],[4,0,2,0,0,0,0,3],[5,0,3,2,0,0,0,4],[6,2,5,4,0,0,0,5],[7,4,6,5,0,0,2,6],[8,6,8,7,0,2,4,7],[9,8,9,8,2,4,6,8],[10,9,9,10,3,5,7,8]],
  alien: [[2,0,0,0,0,0,0,0],[3,0,0,0,0,0,0,2],[4,0,0,2,0,0,0,3],[5,0,2,3,0,0,0,4],[6,2,3,4,0,0,0,5],[7,4,5,5,0,0,2,6],[8,5,6,7,0,2,4,7],[9,7,8,8,2,4,6,8],[10,9,9,10,3,5,7,8]],
};   // 欄位照 ORDER：鮮奶 晶片 燈泡 代幣 颱風 老鼠 珍奶 棒球
// t8 珍奶是 6 不是 5：颱風登陸的外送爆單 delta 4 → 5、再自己長 5 → 6（設計附錄的表逐回合重播也是 6；t9 的 7 只能從 6 來）
test('both solutions follow the design §3.3 level table turn by turn', () => {
  for (const r of st.full) {
    let s = createState(spec); const rows = [];
    for (const step of [...r.order.map(id => x => place(x, id, spec)), x => advance(x, spec)]) { s = step(s).state; rows.push(spec.ORDER.map(id => s.lv[id])); }
    assert.deepEqual(rows, LV[r.ending.id], r.ending.id);
  }
});
