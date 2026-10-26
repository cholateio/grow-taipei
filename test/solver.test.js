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
import { chipEighth } from '../src/solver/run.js';
const all = enumerate(spec), st = stats(all, spec);
test('check passes on the shipped spec (exactly two full orders, one cyber one alien)', () => {
  const c = check(all, spec);
  assert.deepEqual(c.failures, []);
  assert.deepEqual(st.full.map(r => [r.order.join(','), r.ending.id]).sort(), [
    ['bulb,token,milk,chip,baseball,boba,rat,typhoon', 'cyber'],
    ['bulb,token,milk,chip,baseball,rat,boba,typhoon', 'alien'],
  ]);
});
// 裁決 R3：最後一回合 4 個到 MAX 是 61 級的下限（鮮奶、晶片、棒球、第 7 個都零餘裕），颱風要在倒數第 2 回合放晴
test('both full orders spread MAX over turns 9–11 with at most 4 in the last turn', () => {
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
