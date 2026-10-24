import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import * as endings from '../src/rules/endings.js';
const CYBER = ['typhoon','milk','token','baseball','rat','bulb','chip','boba'];   // solutions.md 的賽博龐克正解
function fakes() {
  const ui = { levels: {}, placed: [], busy: [], setLevel(id, lv) { this.levels[id] = lv; }, setPlaced(id) { this.placed.push(id); }, setBusy(f) { this.busy.push(f); }, reset() { this.levels = {}; this.placed = []; } };
  const actors = { applied: [], apply(e) { this.applied.push(e); return Promise.resolve(); }, reset() { this.applied = []; } };
  let busy = false; const director = { get busy() { return busy; }, async play(events, onEvent) { busy = true; for (const e of events) await onEvent(e, { instant: true }); busy = false; }, skip() {} };
  return { ui, actors, director };
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
test('double pick, pick while busy and pick after finish are ignored', async () => {
  const f = fakes(); let finished = 0; const g = createGame({ spec, engine, endings, ...f, onFinished() { finished++; } });
  await g.pick('milk'); assert.equal(await g.pick('milk'), false);
  let release; f.director.play = (events, onEvent) => new Promise(r => { release = async () => { for (const e of events) await onEvent(e, { instant: true }); r(); }; });
  Object.defineProperty(f.director, 'busy', { get: () => !!release });
  const p = g.pick('chip'); assert.equal(await g.pick('bulb'), false); await release(); release = null; await p;
  assert.equal(g.state.lv.chip, 1); assert.equal(g.state.lv.bulb, 0);
  f.director.play = async (events, onEvent) => { for (const e of events) await onEvent(e, { instant: true }); };
  for (const id of ['bulb','token','typhoon','rat','boba','baseball']) await g.pick(id);
  assert.equal(finished, 1); assert.equal(await g.pick('milk'), false);
});
test('reset starts a new state and clears ui/actors', async () => {
  const f = fakes(); const g = createGame({ spec, engine, endings, ...f, onFinished() {} });
  await g.pick('milk'); g.reset(); assert.equal(g.state.lv.milk, 0); assert.deepEqual(f.ui.placed, []); assert.deepEqual(f.actors.applied, []);
});
