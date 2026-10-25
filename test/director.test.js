import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDirector, DURATIONS } from '../src/director.js';
const ev = [{ kind: 'placed', item: 'milk' }, { kind: 'grow', item: 'milk', to: 2 }, { kind: 'fx', item: 'boba' }];
const harness = (opts = {}) => {
  const log = [], waits = [];
  const d = createDirector({ wait: ms => { waits.push(ms); return Promise.resolve(); }, onFocus: e => log.push(['focus', e.item]), reducedMotion: opts.reducedMotion, ...(opts.wait ? { wait: opts.wait } : {}) });
  const onEvent = opts.onEvent ? opts.onEvent(d, log) : (e, o) => { log.push([e.kind, o.instant]); return Promise.resolve(); };
  return { d, log, waits, play: () => d.play(ev, onEvent) };
};
test('plays events in order with per-kind durations', async () => {
  const { d, log, waits, play } = harness(); await play();
  assert.deepEqual(log, [['focus','milk'],['placed',false],['focus','milk'],['grow',false],['focus','boba'],['fx',false]]);
  assert.deepEqual(waits, [DURATIONS.placed, DURATIONS.grow, DURATIONS.fx]); assert.equal(d.busy, false);
});
test('skip mid-way applies the rest instantly without waiting', async () => {
  const { log, waits, play } = harness({ onEvent: (d, log) => (e, o) => { log.push([e.kind, o.instant]); if (e.kind === 'placed') d.skip(); return Promise.resolve(); } });
  await play(); assert.deepEqual(log.filter(l => l[0] !== 'focus'), [['placed',false],['grow',true],['fx',true]]); assert.equal(waits.length, 1);
});
test('reduced motion makes every event instant with no waits', async () => {
  const { log, waits, play } = harness({ reducedMotion: true }); await play();
  assert.ok(log.filter(l => l[0] !== 'focus').every(l => l[1] === true)); assert.deepEqual(waits, []);
});
test('play while busy throws', async () => {
  let release; const { d, play } = harness({ wait: () => new Promise(r => { release = r; }) });
  const p = play(); await Promise.resolve(); assert.equal(d.busy, true); assert.throws(() => d.play(ev, () => {}), /busy/); d.skip(); release(); await p;
});
test('abort ends the show at once: no further events, play resolves, not busy (review #3)', async () => {
  let release; const log = [];
  const d = createDirector({ wait: () => new Promise(r => { release = r; }) });
  const p = d.play(ev, e => { log.push(e.kind); return Promise.resolve(); });
  await Promise.resolve(); d.abort(); release(); await p;
  assert.deepEqual(log, ['placed']); assert.equal(d.busy, false);
  const again = d.play(ev, e => { log.push(e.kind); return Promise.resolve(); }); d.skip(); await again;   // 還能再用
  assert.deepEqual(log, ['placed', 'placed', 'grow', 'fx']);
});
test('wait events take no time; a grow takes DURATIONS.grow whether or not it had helpers', async () => {
  const waits = []; const d = createDirector({ wait: ms => { waits.push(ms); return Promise.resolve(); } });
  await d.play([{ kind: 'grow', item: 'milk', via: ['baseball'] }, { kind: 'wait', item: 'milk', waits: [] }, { kind: 'grow', item: 'milk', via: [] }], () => Promise.resolve());
  assert.deepEqual(waits, [DURATIONS.grow, DURATIONS.grow]);
});
// 手感（計畫 3.6）：時間從事件開始算，動畫本身算在裡面；沒演東西的事件不等
test('the timer starts with the event, before the actor finishes', async () => {
  const log = []; const d = createDirector({ wait: ms => { log.push(['wait', ms]); return Promise.resolve(); } });
  await d.play([{ kind: 'grow', item: 'milk' }], () => { log.push(['apply']); return new Promise(r => setTimeout(() => { log.push(['popped']); r(); }, 5)); });
  assert.deepEqual(log, [['wait', DURATIONS.grow], ['apply'], ['popped']]);
});
test('an event that shows nothing does not wait', async () => {
  const d = createDirector({ wait: () => new Promise(() => {}) });
  await d.play([{ kind: 'settle' }, { kind: 'fx', item: 'milk' }], () => Promise.resolve(false));
  assert.equal(d.busy, false);
});
test('settle has its own duration', () => { assert.equal(DURATIONS.settle, 900); assert.equal(DURATIONS.placed, 1100); });
// 審查：放置事件要先飛入，飛的途中按跳過，落地後要立刻套用（opts.instant 是活的）
test('opts.instant turns true when skip happens during the event', async () => {
  const d = createDirector({ wait: () => new Promise(() => {}) }); const seen = [];
  await d.play([{ kind: 'placed', item: 'milk' }], async (e, o) => { seen.push(o.instant); d.skip(); seen.push(o.instant); });
  assert.deepEqual(seen, [false, true]);
});
