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
  assert.equal(c.ok, false); assert.ok(c.failures.some(f => /剛好 1/.test(f)));
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

// 唯一正解（設計 2026-10-31 §2、§3）：全 MAX 剛好一條，鮮奶 棒球 代幣 燈泡 晶片 颱風 珍奶 老鼠 ⇒ 賽博龐克
import { chipEighth } from '../src/solver/run.js';
const all = enumerate(spec), st = stats(all, spec);
test('check passes: exactly one full order (snapshot), ending cyber', () => {
  const c = check(all, spec);
  assert.deepEqual(c.failures, []);
  assert.deepEqual(st.full.map(r => [r.order.join(','), r.ending.id]), [['milk,baseball,token,bulb,chip,typhoon,boba,rat', 'cyber']]);
  assert.equal(st.full[0].state.flags.ratBranch, 'cyber');
});
// 設計 §3：MAX 個數分布（修正批次 2：颱風三級＋降級當回合不升級之後的全枚舉）
test('MAX-count histogram matches design 2026-10-31 §3', () => {
  assert.deepEqual(st.maxHist, [3648, 27290, 9114, 180, 60, 21, 3, 3, 1]);   // R25（大停電不再打鮮奶）之後重算
  assert.ok(st.avgMax <= 3.5);
});
// 設計 §3：MAX 落在第 8 回合（棒球、颱風放晴）與第 9 回合（其餘六個）
test('the full order: MAX lands in two turns, baseball and the typhoon in t8 and the other six in t9', () => {
  const p = pacing(st.full, spec); assert.ok(p.ok, p.failures.join('\n'));
  assert.equal(p.maxTurns, 2); assert.equal(p.maxMaxesPerTurn, 6);
});
test('the full order ends with the typhoon cleared (Lv3) before the missile', () => {
  for (const r of st.full) assert.equal(r.state.lv.typhoon, 3);
});
test('report: chipEighth keeps its shape (report item, not an acceptance)', () => {
  const rep = chipEighth(all, spec);
  assert.equal(typeof rep.ok, 'boolean'); assert.ok(rep.best.order[7] === 'chip');
  assert.ok(rep.best.short.every(id => id !== 'chip'));
  assert.equal(rep.ok, rep.best.short.length === 0);
});
// 審稿第 1 輪故事要求：照正解玩不會看到災難附註；颱風擋飛彈、鮮奶過期都當得上標題（不是永遠被前面的蓋掉）
function storyGoals(results, s) {
  const out = [];
  for (const r of s.full) for (const id of ['blackout', 'flood', 'domeFlood', 'cartBlown', 'domeRats', 'alien']) if (r.satisfied.includes(id)) out.push(`${r.order.join(',')} 有 ${id}`);
  for (const id of ['typhoonDeflect', 'milkExpired']) if (!results.some(r => r.ending.id === id)) out.push(`${id} 從來不是標題`);
  if (results.filter(r => r.satisfied.includes('typhoonDeflect')).every(r => r.satisfied.includes('blackout'))) out.push('颱風擋飛彈的順序都是大停電');
  return out;
}
test('story: the true solution carries no disaster extras; typhoonDeflect and milkExpired each title some orders', () => {
  assert.deepEqual(storyGoals(all, st), []);
});
// 設計 2026-10-31 §4.5：新壞結局大巨蛋淹水、珍奶攤被吹走（修正批次 2）、外星改壞結局，各有順序到得了（也當得上標題）
test('domeFlood, cartBlown and alien are each reached (and titled) by some order', () => {
  for (const id of ['domeFlood', 'cartBlown', 'alien']) {
    assert.ok(all.some(r => r.satisfied.includes(id)), `${id} reachable`);
    assert.ok(all.some(r => r.ending.id === id), `${id} titles some order`);
  }
});

// 設計 §3：正解逐回合的級數（跳級算一步）；欄位照 ORDER：鮮奶 晶片 燈泡 代幣 颱風 老鼠 珍奶 棒球
// 修正批次 2：颱風三級——第 6 回合放下 1、第 7 回合 2（暴風圈還在）、第 8 回合 3（放晴）、第 9 回合停在 3；其餘欄不變
const LV = [[2,0,0,0,0,0,0,0],[3,0,0,0,0,0,0,2],[4,0,0,2,0,0,0,3],[5,0,2,4,0,0,0,4],[6,2,3,5,0,0,0,5],[7,4,5,6,1,0,0,6],[8,6,6,7,2,0,2,7],[9,8,8,9,3,2,4,8],[10,9,9,10,3,4,6,8]];
test('the solution follows the design §3 level table turn by turn', () => {
  for (const r of st.full) {
    let s = createState(spec); const rows = [];
    for (const step of [...r.order.map(id => x => place(x, id, spec)), x => advance(x, spec)]) { s = step(s).state; rows.push(spec.ORDER.map(id => s.lv[id])); }
    assert.deepEqual(rows, LV);
  }
});

// 使用者 2026-10-30 那局（晶片、燈泡、珍奶都早於代幣，颱風第 7、老鼠第 8）。修正批次 2（颱風放下那回合全部檢查）之後：
// 颱風放下時代幣 2、棒球 3、珍奶 3 → 捷運淹水、大巨蛋淹水、攤車被吹走一起來（三個都鎖住）；颱風放晴（3）不吹歪；
// 晶片停在 5 → 老鼠沒到分岔；標題卡是「捷運淹水」
const USER_END = [8, 5, 4, 2, 3, 2, 3, 3];   // 欄位照 ORDER：鮮奶 晶片 燈泡 代幣 颱風 老鼠 珍奶 棒球
test('the 2026-10-30 recorded order ends low with the flood bad ending (snapshot)', () => {
  const r = playOrder(['milk', 'baseball', 'chip', 'bulb', 'boba', 'token', 'typhoon', 'rat'], spec);
  assert.deepEqual(spec.ORDER.map(id => r.state.lv[id]), USER_END);
  assert.deepEqual(r.state.locked, { token: true, baseball: true, boba: true });
  assert.deepEqual(r.state.flags, { flooded: true, domeFlood: true, cartBlown: true, milkExpired: true });
  assert.equal(r.ending.id, 'flood'); assert.deepEqual(r.satisfied, ['flood', 'domeFlood', 'cartBlown', 'milkExpired', 'shieldDown']);
});
