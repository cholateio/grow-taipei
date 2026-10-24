import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEYFRAMES, TIMES, lerpColor, sample, sunDirection } from '../src/scene/daynight.js';
test('keyframes cover a full day and wrap', () => {
  assert.equal(KEYFRAMES[0][0], 0); assert.equal(KEYFRAMES.at(-1)[0], 1440);
  assert.deepEqual(KEYFRAMES.at(-1).slice(1), KEYFRAMES[0].slice(1));
  assert.deepEqual(sample(1440), sample(0));
});
test('exact keyframe at noon', () => {
  const s = sample(720); assert.equal(s.skyTop, 0x9fd0ec); assert.equal(s.horizon, 0xf4eee3); assert.equal(s.night, 0); assert.equal(s.sunI, 2.9);
});
test('interpolates linearly between keyframes', () => {
  assert.equal(sample(1200).night, 0.875);                 // 1140:.75 → 1260:1
  assert.equal(lerpColor(0x000000, 0xffffff, 0.5), 0x808080);
  assert.equal(sample(1200).sunI, 1.25);
});
test('TIMES map to the spec moods', () => {
  assert.equal(sample(TIMES.day).night, 0); assert.ok(sample(TIMES.dusk).night > 0 && sample(TIMES.dusk).night < 1); assert.equal(sample(TIMES.night).night, 1);
});
test('sunDirection is unit length, high at noon, and quantized to 10 minutes', () => {
  const d = sunDirection(720); assert.ok(Math.abs(Math.hypot(d.x, d.y, d.z) - 1) < 1e-9); assert.ok(d.y > 0.8);
  assert.deepEqual(sunDirection(723), sunDirection(720)); assert.notDeepEqual(sunDirection(730), sunDirection(720));
  assert.ok(sunDirection(0).z > 0, 'sun stays on the camera side');
});
