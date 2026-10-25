import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as boba from '../src/actors/boba.js';
import { RING_R } from '../src/scene/hex.js';
import { lv, worldPoints, distToCell } from './helpers/actors.js';

test('boba lv1 is the cart', () => assert.deepEqual(Object.keys(boba.view(lv({ boba: 1 }), {})), ['boba.main']));
test('lv2 queues six tourists with suitcases facing the cart', () => {
  const q = boba.view(lv({ boba: 2 }), {})['boba.queue']; assert.equal(q.n, 6); assert.equal(q.stand.length, 6); assert.equal(q.accessory, 'suitcase');
});
test('lv3 fountain plaza; milk ≥2 makes it ten with a fresh-milk sign', () => {
  const a = boba.view(lv({ boba: 3 }), {}), b = boba.view(lv({ boba: 3, milk: 2 }), {});
  assert.ok(a['boba.main'].parts.some(p => p.kind === 'dome')); assert.equal(a['boba.queue'].n, 6); assert.equal(b['boba.queue'].n, 10);
  const sign = v => v['boba.main'].parts.find(p => p.sign).color; assert.notEqual(sign(a), sign(b));
});
test('boba parts and queue stay in the token cell', () => {
  for (const n of [1, 2, 3]) for (const s of Object.values(boba.view(lv({ boba: n, milk: 2 }), {}))) for (const p of worldPoints(s)) assert.ok(distToCell(p, [0, 1]) < RING_R, `lv${n}`);
});
