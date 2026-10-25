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
