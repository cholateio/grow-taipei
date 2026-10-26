// test/renderer.test.js：截圖回報 draw call 的取樣（任務 12）——模型都載好、連續幾幀之後才回報，取最少的那一幀，只回報一次
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakedom.js';
installFakeDom();
const { createCallSampler } = await import('../src/scene/renderer.js');

test('createCallSampler waits for 5 frames with nothing loading, reports the most calls of those frames once', () => {
  const sample = createCallSampler(), seen = [];
  const feed = (calls, pending = 0) => { const r = sample({ calls, tris: calls * 10, pending }); if (r) seen.push(r); return r; };
  for (const c of [138, 144, 215]) assert.equal(feed(c, 3), null, 'still loading');
  assert.equal(feed(230), null); assert.equal(feed(224, 1), null, 'a new load restarts the count');
  for (const c of [230, 224, 226, 224]) assert.equal(feed(c), null);
  assert.deepEqual(feed(225), { calls: 230, tris: 2300 });
  assert.equal(feed(100), null, 'only once'); assert.equal(seen.length, 1);
});
// 裁決 R18 審稿：手機（或窄於 800 px）預設 low——省 draw call 的手機畫質要真的用到；網址 ?quality= 照舊優先
test('pickQuality: mobile or ≤ 800 px → low; wide desktop → high; an explicit ?quality wins', async () => {
  const { pickQuality } = await import('../src/scene/renderer.js');
  assert.equal(pickQuality(null, { width: 390, mobile: true }), 'low');
  assert.equal(pickQuality(null, { width: 800, mobile: false }), 'low');
  assert.equal(pickQuality(null, { width: 1280, mobile: true }), 'low');
  assert.equal(pickQuality(null, { width: 1280, mobile: false }), 'high');
  assert.equal(pickQuality('medium', { width: 390, mobile: true }), 'medium');
});
