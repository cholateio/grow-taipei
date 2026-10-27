import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, countdownEvent, finaleEvents, TITLE_HOLD } from '../src/game.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import * as endings from '../src/rules/endings.js';
import { enumerate, stats } from '../src/solver/run.js';
const CYBER = stats(enumerate(spec), spec).full.find(r => r.ending.id === 'cyber').order;   // 正解從求解器取，規則改了不用手改
// 假演出層：turn 記下事件與選項、立刻 resolve；hold 記下秒數、立刻 resolve
function fakes() {
  const ui = { levels: {}, placed: [], busy: [], setLevel(id, lv) { this.levels[id] = lv; }, setPlaced(id) { this.placed.push(id); }, setBusy(f) { this.busy.push(f); }, reset() { this.levels = {}; this.placed = []; } };
  const show = { busy: false, turns: [], holds: [], applied: [], aborted: 0, async turn(events, opts) { this.turns.push({ events, opts }); for (const e of events) this.applied.push(e); }, async hold(s) { this.holds.push(s); }, skip() {}, abort() { this.aborted++; }, reset() { this.applied = []; } };
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
  // 8 次放置 + 倒數回合 + 1 個終局回合（不是引擎回合：state.turn 不算它）
  assert.equal(f.show.turns.length, 8 + spec.CLOSING_TURNS + 1); assert.equal(done.state.turn, 8 + spec.CLOSING_TURNS); assert.equal(done.ending.id, 'cyber');
  assert.equal(f.ui.busy.at(-1), false);
});
test('closing turns use montage: true', async () => {
  const f = fakes(); const g = createGame({ spec, engine, endings, ...f, onFinished() {} });
  for (const id of CYBER) await g.pick(id);
  assert.deepEqual(f.show.turns.map(t => !!t.opts?.montage), [...Array(8).fill(false), ...Array(spec.CLOSING_TURNS).fill(true), false]);
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

// ── 最終章（計畫 5 任務 1，設計 §3、§9）──
test('closing turns carry a countdown event first (3, 2, 1), then the finale turn, then hold, then onFinished', async () => {
  const f = fakes(), order = []; let release = null, done = null;
  f.show.hold = function (s) { this.holds.push(s); order.push('hold'); return new Promise(r => { release = r; }); };
  const g = createGame({ spec, engine, endings, ...f, onFinished: (ending, state) => { order.push('finished'); done = { ending, state }; } });
  const last = CYBER.at(-1);
  for (const id of CYBER.slice(0, -1)) await g.pick(id);
  const p = g.pick(last);
  for (let i = 0; i < 20 && !release; i++) await Promise.resolve();
  assert.equal(spec.CLOSING_TURNS, 3);
  const t = f.show.turns;
  assert.equal(t.length, 8 + 3 + 1);
  assert.deepEqual(t[8].events[0], countdownEvent(3)); assert.deepEqual(t[9].events[0], countdownEvent(2)); assert.deepEqual(t[10].events[0], countdownEvent(1));
  assert.deepEqual(countdownEvent(2), { kind: 'countdown', n: 2, flag: { name: 'alarm', value: 2 } });
  for (const k of [8, 9, 10]) assert.equal(t[k].events.at(-1).kind, 'settle');
  assert.equal(t[11].opts.finale, true); assert.ok(!t[11].opts.montage);
  assert.deepEqual(t[11].events, finaleEvents(endings.resolve(g.state, spec)));
  assert.ok(!t[11].events.some(e => e.kind === 'settle'), 'the finale turn is not an engine turn: no settle');
  assert.equal(TITLE_HOLD, 2); assert.deepEqual(f.show.holds, [2]);
  assert.equal(done, null, 'onFinished waits for the hold'); assert.equal(g.finished, false);
  release(); assert.equal(await p, true);
  assert.deepEqual(order, ['hold', 'finished']); assert.equal(done.ending.id, 'cyber'); assert.equal(g.finished, true);
  assert.equal(f.ui.busy.at(-1), false);
});
test('finaleEvents: true ending → missile shield + epilogue; chip max but not all max → missile shield only; else missile hit/deflect only', () => {
  const missile = m => ({ kind: 'missile', outcome: m, flag: { name: 'missile', value: m } });
  assert.deepEqual(finaleEvents({ id: 'cyber', missile: 'shield' }), [missile('shield'), { kind: 'epilogue', ending: 'cyber', flag: { name: 'epilogue', value: 'cyber' } }]);
  assert.deepEqual(finaleEvents({ id: 'alien', missile: 'shield' }), [missile('shield'), { kind: 'epilogue', ending: 'alien', flag: { name: 'epilogue', value: 'alien' } }]);
  // 晶片滿級但不是全 MAX：壞結局（或再接再厲）照樣 shield，沒有尾聲
  const chipMax = { ...engine.createState(spec) }; chipMax.lv = { ...chipMax.lv, chip: spec.ITEMS.chip.max, milk: 1 };
  const r = endings.resolve(chipMax, spec);
  assert.equal(r.missile, 'shield'); assert.notEqual(endings.ENDINGS[r.id].kind, 'true');
  assert.deepEqual(finaleEvents(r), [missile('shield')]);
  assert.deepEqual(finaleEvents({ id: 'shieldDown', missile: 'hit' }), [missile('hit')]);
  assert.deepEqual(finaleEvents({ id: 'typhoonDeflect', missile: 'deflect' }), [missile('deflect')]);
  assert.deepEqual(finaleEvents({ id: 'tryAgain', missile: 'hit' }), [missile('hit')]);
});
test('reset during the finale turn or during hold: no onFinished, new game playable (review focus 1)', async () => {
  for (const when of ['finale', 'hold']) {
    const f = fakes(); let finished = 0, releaseHold = null;
    const g = createGame({ spec, engine, endings, ...f, onFinished() { finished++; } });
    for (const id of CYBER.slice(0, -1)) await g.pick(id);
    const turn = f.show.turn;
    // 終局回合（finale: true）或 hold 停住，其他照常立刻 resolve
    let releaseFinale = null;
    f.show.turn = function (events, opts) { if (opts?.finale && when === 'finale') { this.turns.push({ events, opts }); return new Promise(r => { releaseFinale = r; }); } return turn.call(this, events, opts); };
    f.show.hold = function (s) { this.holds.push(s); return when === 'hold' ? new Promise(r => { releaseHold = r; }) : Promise.resolve(); };
    const p = g.pick(CYBER.at(-1));
    for (let i = 0; i < 20 && !(releaseFinale || releaseHold); i++) await Promise.resolve();
    assert.ok(releaseFinale || releaseHold, `${when} is pending`);
    g.reset(); const busyLen = f.ui.busy.length;
    (releaseFinale ?? releaseHold)(); assert.equal(await p, false, when);
    assert.equal(finished, 0, `${when}: no onFinished after reset`); assert.equal(g.finished, false);
    assert.equal(f.ui.busy.length, busyLen, `${when}: the old game does not touch the ui after reset`);
    if (when === 'finale') assert.deepEqual(f.show.holds, [], 'no hold after a reset finale turn');
    f.show.turn = turn;
    assert.equal(await g.pick('milk'), true, when); assert.equal(g.state.lv.milk, 1); assert.equal(f.ui.levels.milk, 1);
  }
});
