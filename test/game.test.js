import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import * as endings from '../src/rules/endings.js';
import { enumerate, stats } from '../src/solver/run.js';
const CYBER = stats(enumerate(spec), spec).full.find(r => r.ending.id === 'cyber').order;   // 正解從求解器取，規則改了不用手改
// 假演出層：turn 記下事件與選項、立刻 resolve
function fakes() {
  const ui = { levels: {}, placed: [], busy: [], setLevel(id, lv) { this.levels[id] = lv; }, setPlaced(id) { this.placed.push(id); }, setBusy(f) { this.busy.push(f); }, reset() { this.levels = {}; this.placed = []; } };
  const show = { busy: false, turns: [], applied: [], aborted: 0, async turn(events, opts) { this.turns.push({ events, opts }); for (const e of events) this.applied.push(e); }, skip() {}, abort() { this.aborted++; }, reset() { this.applied = []; } };
  return { ui, show };
}
// 可以手動放行的回合：busy 在 release 之前都是 true
function holdTurns(show) {
  let release = null;
  show.turn = function (events, opts) { this.turns.push({ events, opts }); return new Promise(r => { release = () => { for (const e of events) this.applied.push(e); r(); }; }); };
  Object.defineProperty(show, 'busy', { get: () => !!release, configurable: true });
  return () => { const r = release; release = null; r(); };
}
test('a full solution order finishes with the cyber ending and MAX levels', async () => {
  const f = fakes(); let done = null;
  const g = createGame({ spec, engine, endings, ...f, onFinished: (ending, state) => { done = { ending, state }; } });
  for (const id of CYBER) assert.equal(await g.pick(id), true);
  assert.equal(done.ending.id, 'cyber'); assert.ok(spec.ORDER.every(id => f.ui.levels[id] === spec.ITEMS[id].max));
  assert.deepEqual(f.ui.busy.slice(0, 2), [true, false]);
});
test('ui levels track the engine after every pick, including delta-driven levels', async () => {
  const f = fakes(); const g = createGame({ spec, engine, endings, ...f, onFinished() {} });
  for (const id of ['bulb','boba','typhoon','milk']) { await g.pick(id); for (const k of spec.ORDER) if (g.state.lv[k] > 0) assert.equal(f.ui.levels[k], g.state.lv[k], `${k} after ${id}`); }
});
test('ui.setLevel is called only after the turn resolves', async () => {
  const f = fakes(), release = holdTurns(f.show); const g = createGame({ spec, engine, endings, ...f, onFinished() {} });
  const p = g.pick('milk'); await Promise.resolve();
  assert.deepEqual(f.ui.levels, {}, 'nothing written while the turn plays'); assert.deepEqual(f.ui.placed, ['milk']); assert.deepEqual(f.ui.busy, [true]);
  release(); await p;
  assert.deepEqual(f.ui.levels, { milk: 1 }); assert.deepEqual(f.ui.busy, [true, false]);
});
test('double pick, pick while busy and pick after finish are ignored', async () => {
  const f = fakes(); let finished = 0; const g = createGame({ spec, engine, endings, ...f, onFinished() { finished++; } });
  await g.pick('milk'); assert.equal(await g.pick('milk'), false);
  const turn = f.show.turn, release = holdTurns(f.show);
  const p = g.pick('chip'); assert.equal(await g.pick('bulb'), false); release(); await p;
  assert.equal(g.state.lv.chip, 1); assert.equal(g.state.lv.bulb, 0);
  f.show.turn = turn; Object.defineProperty(f.show, 'busy', { value: false, writable: true });
  for (const id of ['bulb','token','typhoon','rat','boba','baseball']) await g.pick(id);
  assert.equal(finished, 1); assert.equal(await g.pick('milk'), false);
});
test('reset starts a new state and clears ui/show', async () => {
  const f = fakes(); const g = createGame({ spec, engine, endings, ...f, onFinished() {} });
  await g.pick('milk'); g.reset(); assert.equal(g.state.lv.milk, 0); assert.deepEqual(f.ui.placed, []); assert.deepEqual(f.show.applied, []);
  assert.equal(f.show.aborted, 1); assert.equal(g.finished, false);
});
test('reset during a show: the old show cannot touch the new game, which is playable at once (review #3)', async () => {
  // 這個假演出層 abort 時故意不結束回合，確保遊戲自己也會擋掉舊回合結束後的動作
  const f = fakes(), release = holdTurns(f.show); let levels = 0;
  const g = createGame({ spec, engine, endings, ...f, onFinished() {}, onLevels: () => { levels++; } });
  const p = g.pick('bulb'); g.reset();
  assert.equal(f.show.aborted, 1);
  release(); await p;
  assert.equal(g.state.lv.bulb, 0); assert.deepEqual(f.ui.levels, {}); assert.equal(levels, 0); assert.deepEqual(f.ui.busy, [true]);
  const t = fakes().show; f.show.turn = t.turn; Object.defineProperty(f.show, 'busy', { value: false, writable: true });
  assert.equal(await g.pick('milk'), true); assert.equal(g.state.lv.milk, 1); assert.equal(f.ui.levels.milk, 1);
});
test('after the eighth item the game plays CLOSING_TURNS extra growth turns before finishing', async () => {
  const f = fakes(); let done = null;
  const g = createGame({ spec, engine, endings, ...f, onFinished: (ending, state) => { done = { ending, state }; } });
  for (const id of CYBER) await g.pick(id);
  assert.equal(f.show.turns.length, 8 + spec.CLOSING_TURNS); assert.equal(done.state.turn, 8 + spec.CLOSING_TURNS); assert.equal(done.ending.id, 'cyber');
  assert.equal(f.ui.busy.at(-1), false);
});
test('closing turns use montage: true', async () => {
  const f = fakes(); const g = createGame({ spec, engine, endings, ...f, onFinished() {} });
  for (const id of CYBER) await g.pick(id);
  assert.deepEqual(f.show.turns.map(t => !!t.opts?.montage), [...Array(8).fill(false), ...Array(spec.CLOSING_TURNS).fill(true)]);
});
test('onLevels is called once per turn, at turn end, with the engine state', async () => {
  const f = fakes(), calls = []; const g = createGame({ spec, engine, endings, ...f, onFinished() {}, onLevels: (lv, flags, info) => calls.push({ lv: { ...lv }, info }) });
  await g.pick('typhoon'); await g.pick('milk');
  assert.equal(calls.length, 2); assert.ok(calls.every(c => c.info.turnEnd === true)); assert.deepEqual(calls.at(-1).lv, g.state.lv);
});
test('settle is the last event of every turn', async () => {
  const f = fakes(); const g = createGame({ spec, engine, endings, ...f, onFinished() {} });
  await g.pick('milk'); assert.equal(f.show.applied.at(-1).kind, 'settle');
  await g.pick('chip'); assert.equal(f.show.applied.filter(e => e.kind === 'settle').length, 2);
});
