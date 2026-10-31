// test/timeline.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimeline, together } from '../src/show/timeline.js';
const log = [];
const beat = (name, dur, extra = {}) => ({ ...extra, kind: name, dur, start: () => { log.push(`${name}:start`); return extra.start?.(); }, step: (k) => { log.push(`${name}:${k.toFixed(2)}`); }, end: () => log.push(`${name}:end`) });
test('beats play one after another, zero-length beats chain within one frame, play resolves when done', async () => {
  log.length = 0; const tl = createTimeline(); let done = false;
  tl.play([beat('a', 0.2), beat('b', 0), beat('c', 0.1)], {}).then(() => { done = true; });
  assert.ok(tl.busy); tl.update(0.1); assert.deepEqual(log, ['a:start', 'a:0.50']);
  tl.update(0.1); assert.deepEqual(log.slice(2), ['a:1.00', 'a:end', 'b:start', 'b:end', 'c:start', 'c:0.00']);
  tl.update(0.1); await Promise.resolve(); assert.ok(done); assert.ok(!tl.busy); assert.ok(Math.abs(tl.elapsed - 0.3) < 1e-9);
});
test('dur may be a function evaluated at start', () => {
  log.length = 0; const tl = createTimeline(); tl.play([beat('w', ctx => ctx.len / 2)], { len: 1 });
  tl.update(0.25); assert.equal(log.at(-1), 'w:0.50');
});
test('skip ends the current beat and runs the rest start→end without stepping', async () => {
  log.length = 0; const tl = createTimeline(); const p = tl.play([beat('a', 1), beat('b', 1), beat('c', 0.5)], {});
  tl.update(0.1); tl.skip(); await p;
  assert.deepEqual(log, ['a:start', 'a:0.10', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']); assert.ok(!tl.busy);
});
test('abort ends the current beat and drops the rest; timeline is reusable', async () => {
  log.length = 0; const tl = createTimeline(); const p = tl.play([beat('a', 1), beat('b', 1)], {}); tl.update(0.1); tl.abort(); await p;
  assert.deepEqual(log, ['a:start', 'a:0.10', 'a:end']); assert.ok(!tl.busy);
  log.length = 0; const q = tl.play([beat('c', 0)], {}); tl.update(0); await q; assert.deepEqual(log, ['c:start', 'c:end']);
});
test('reduced motion plays everything instantly; play while busy throws', async () => {
  log.length = 0; const tl = createTimeline({ reducedMotion: true }); await tl.play([beat('a', 1), beat('b', 1)], {});
  assert.deepEqual(log, ['a:start', 'a:end', 'b:start', 'b:end']);
  const busy = createTimeline(); busy.play([beat('x', 1)], {}); assert.throws(() => busy.play([], {}), /busy/);
});
test('a beat whose start returns false is skipped without taking time', () => {
  log.length = 0; const tl = createTimeline(); tl.play([beat('n', 5, { start: () => false }), beat('b', 0.1)], {}); tl.update(0.05);
  assert.deepEqual(log, ['n:start', 'n:end', 'b:start', 'b:0.50']);
});
test('together runs sub-beats in parallel and lasts as long as the longest', () => {
  log.length = 0; const tl = createTimeline(); tl.play([together([beat('a', 0.2), beat('b', 0.4)]), beat('c', 0)], {});
  tl.update(0.2); assert.ok(log.includes('a:end') && !log.includes('b:end'));
  tl.update(0.2); assert.ok(log.includes('b:end') && log.includes('c:end'));
});
test('a step that throws ends the beat, rejects play, rethrows, and leaves the timeline reusable', async () => {
  log.length = 0; const tl = createTimeline(); const boom = new Error('boom');
  const p = tl.play([{ ...beat('x', 1), step: k => { log.push(`x:${k.toFixed(2)}`); if (k > 0) throw boom; } }, beat('c', 0)], {});
  const settled = p.then(() => 'resolved', e => e);
  assert.throws(() => tl.update(0.1), /boom/); assert.equal(await settled, boom); assert.ok(!tl.busy);
  assert.deepEqual(log, ['x:start', 'x:0.10', 'x:end']); assert.equal(tl.currentKind, null);
  log.length = 0; const q = tl.play([beat('d', 0)], {}); tl.update(0); await q; assert.deepEqual(log, ['d:start', 'd:end']);
});
test('a start that throws mid-chain ends that beat once and never re-steps the finished one', async () => {
  log.length = 0; const tl = createTimeline();
  const p = tl.play([beat('a', 0.1), beat('x', 1, { start: () => { throw new Error('bad start'); } }), beat('c', 0.1)], {});
  const settled = p.then(() => 'resolved', e => e.message);
  assert.throws(() => tl.update(0.1), /bad start/); tl.update(0.1);
  assert.equal(await settled, 'bad start'); assert.ok(!tl.busy);
  assert.deepEqual(log, ['a:start', 'a:1.00', 'a:end', 'x:start', 'x:end']);
});
test('setReducedMotion(true) mid-play jumps straight to the end', async () => {
  log.length = 0; const tl = createTimeline(); const p = tl.play([beat('a', 1), beat('b', 1)], {});
  tl.update(0.1); tl.setReducedMotion(true); await p; tl.update(0.1);
  assert.deepEqual(log, ['a:start', 'a:0.10', 'a:end', 'b:start', 'b:end']); assert.ok(!tl.busy);
});
test('a beat whose start skips its own timeline is ended once and the timeline is left idle', async () => {
  log.length = 0; const tl = createTimeline(); const p = tl.play([beat('s', 1, { start: () => tl.skip() }), beat('b', 1)], {});
  tl.update(0.1); await p; tl.update(0.1);
  assert.deepEqual(log, ['s:start', 's:end', 'b:start', 'b:end']); assert.ok(!tl.busy); assert.equal(tl.currentKind, null);
});
// 裁決 R15：ctx.speed（倒數蒙太奇 2）——拍的 t 與 step 的 dt 都乘 speed，elapsed／currentDur 是真實秒數
test('ctx.speed runs every beat faster: k and step dt scale, elapsed and currentDur stay real seconds', async () => {
  log.length = 0; const tl = createTimeline(), dts = [];
  const p = tl.play([{ ...beat('a', 1), step: (k, dt) => { log.push(`a:${k.toFixed(2)}`); dts.push(dt); } }, together([beat('b', 0.4)])], { speed: 2 });
  tl.update(0.25); assert.equal(log.at(-1), 'a:0.50'); assert.ok(Math.abs(dts[0] - 0.5) < 1e-9, 'step gets show-time dt');
  assert.ok(Math.abs(tl.currentDur - 0.5) < 1e-9, 'currentDur in real seconds');
  tl.update(0.25); tl.update(0.2); await p;
  assert.ok(log.includes('b:end')); assert.ok(Math.abs(tl.elapsed - 0.7) < 1e-9, 'elapsed is real time');
});
// 鎖住的反應要等名冊走到新站位（turn.js 的 lockBeats）：拍可以帶 done(ctx)——每幀 step 之後問一次，真就提早結束（dur 是上限）
test('a beat with done(ctx) ends early once done turns true (dur is the cap); without done it runs its full dur', () => {
  log.length = 0; const tl = createTimeline(), ctx = { ready: false };
  tl.play([beat('h', 2, { done: c => c.ready }), beat('n', 0.1)], ctx);
  tl.update(0.1); tl.update(0.1); assert.deepEqual(log, ['h:start', 'h:0.05', 'h:0.10']);
  ctx.ready = true; tl.update(0.1);
  assert.deepEqual(log.slice(3), ['h:0.15', 'h:end', 'n:start', 'n:0.00']);
  assert.ok(Math.abs(tl.elapsed - 0.3) < 1e-9, `elapsed ${tl.elapsed}`);
  log.length = 0; const capped = createTimeline();
  capped.play([beat('h', 0.2, { done: () => false })], {});
  capped.update(0.1); capped.update(0.1); assert.deepEqual(log, ['h:start', 'h:0.50', 'h:1.00', 'h:end']);
});
