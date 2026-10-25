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
test('the queue runs away from the MRT station and everyone faces the cart', async () => {
  const { anchorWorld } = await import('../src/actors/anchors.js');
  const q = boba.view(lv({ boba: 3, milk: 2 }), {})['boba.queue'], st = anchorWorld('token'), cart = anchorWorld('boba');
  for (const p of q.stand) { assert.ok(Math.hypot(p.x - st.x, p.z - st.z) > 0.9, 'clear of the station'); assert.ok(Math.abs(p.yaw - Math.atan2(cart.x - p.x, cart.z - p.z)) < 1e-9); }
});
