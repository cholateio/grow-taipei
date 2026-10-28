import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enumerate, stats, check, greedyOrder, playOrder } from '../src/solver/run.js';
import * as spec from '../src/rules/spec.js';

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
// 節奏（主規格 §6.5 #6，物品 v2 裁決 R3 放寬）：同一回合到 MAX ≤ 4 個、有物品到 MAX 的回合 ≥ 3 個；倒數回合也算
const late = {
  ORDER: ['a', 'b', 'c'], CLOSING_TURNS: 2,
  ITEMS: { a: { name: 'A', max: 2, up: { 2: { age: ['a', 3] } } }, b: { name: 'B', max: 2, up: { 2: { age: ['b', 2] } } }, c: { name: 'C', max: 2, up: { 2: { age: ['c', 1] } } } },
  AFTER_TURN: [], STORIES: { placed: { a: '', b: '', c: '' }, grow: { a: { 2: '' }, b: { 2: '' }, c: { 2: '' } } },
};
test('pacing check rejects a solution whose MAXes all land in the closing turns', () => {
  const p = pacing([{ order: ['a', 'b', 'c'] }], late);
  assert.equal(p.ok, false); assert.equal(p.maxTurns, 1); assert.ok(p.failures.some(f => /MAX/.test(f)));
});
test('pacing counts closing turns as turns, and three items maxing together is within the limit', () => {
  const p = pacing([{ order: ['a', 'b', 'c'] }], late);
  assert.equal(p.maxGrowsPerTurn, 3, 'all three grow in turn 4, the first closing turn'); assert.equal(p.maxMaxesPerTurn, 3);
  assert.ok(!p.failures.some(f => /同時到 MAX/.test(f)), 'three at once is allowed');
  assert.ok(pacing([{ order: ['a', 'b', 'c'] }], { ...late, CLOSING_TURNS: 0 }).maxGrowsPerTurn === 0);
});
test('check #6 is wired: a spec failing pacing fails check', () => {
  const results = [{ order: ['a', 'b', 'c'], maxCount: 3, ending: { id: 'cyber' }, satisfied: [], state: {} }];
  assert.ok(check(results, late).failures.some(f => /節奏/.test(f)));
});

// 物品 v2（2026-10-26）：兩條正解快照、颱風第 8 個、晶片第 8 個的報告項
// 選擇帶動升級（2026-10-28 §3）：9 回合下颱風一定第 8、老鼠一定第 7；兩條正解只差第 3、4 個先放燈泡（賽博）還是先放代幣（外星）
import { chipEighth } from '../src/solver/run.js';
// 因果與離島（2026-10-28 §3）：Lv3 以上每一級都要有觸發者之後，兩條正解剛好還是這兩條（求解器收到的，見 spec.js 註解）
const all = enumerate(spec), st = stats(all, spec);
test('check passes on the shipped spec: exactly two full orders, one cyber one alien (snapshot the two orders)', () => {
  const c = check(all, spec);
  assert.deepEqual(c.failures, []);
  assert.deepEqual(st.full.map(r => [r.order.join(','), r.ending.id]).sort(), [
    ['milk,baseball,bulb,token,chip,boba,rat,typhoon', 'cyber'],
    ['milk,baseball,token,bulb,chip,boba,rat,typhoon', 'alien'],
  ]);
});
// 裁決 R3（PACING 照舊 ≤4／≥3）：9 回合裡 MAX 落在第 7、8、9 回合（棒球；鮮奶、燈泡、代幣；晶片、颱風、老鼠、珍奶），最後一輪剛好 4 個
test('both full orders spread MAX over turns 7–9 with at most 4 in the last turn', () => {
  for (const r of st.full) { const p = pacing([r], spec); assert.ok(p.ok, p.failures.join('\n')); assert.equal(p.maxMaxesPerTurn, 4); assert.equal(p.maxTurns, 3); }
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

// 因果與離島（2026-10-28 §2、§3）：兩條正解裡 Lv3 以上的每個升級（颱風除外）都有 via——演出層靠它演拜訪；
// （via 只列真的成立的幫手——那一半由 engine.test 的 satisfiedHelpers 測試管，這裡只看非空）
test('both solutions: every grow to Lv3+ (typhoon aside) carries a non-empty via', () => {
  for (const r of st.full) {
    const { events } = playOrder(r.order, spec);
    for (const e of events) if (e.kind === 'grow' && e.to >= 3 && e.item !== 'typhoon') assert.ok(e.via.length > 0, `${r.order.join(',')}: ${e.item} ${e.from}→${e.to} has no via`);
  }
});
