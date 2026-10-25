import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as token from '../src/actors/token.js';
test('trainPose: cars trail along the track radius at the right spacing; speed 0 freezes them', () => {
  const { TRACK, trainPose } = token;
  const a = trainPose(5, 0, { cars: 3 }), b = trainPose(5, 1, { cars: 3 });
  for (const p of [a, b]) { assert.ok(Math.abs(Math.hypot(p.x, p.z) - TRACK.radius) < 1e-9); assert.equal(p.y, TRACK.y); }
  assert.ok(Math.abs(Math.hypot(a.x - b.x, a.z - b.z) - 0.6) < 0.01, 'car gap 0.6');
  assert.deepEqual(trainPose(1, 0, { speed: 0 }), trainPose(9, 0, { speed: 0 }));
});
