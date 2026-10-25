import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldEffects, stepWorld } from '../src/actors/world.js';
import { TIMES } from '../src/scene/daynight.js';
import { lv } from './helpers/actors.js';

test('worldEffects: lamps set the clock, blackout kills the glow at night', () => {
  assert.deepEqual(worldEffects(lv({}), {}), { time: TIMES.day, peopleVisible: true, glowScale: 1, storm: 0, rain: 0 });
  assert.equal(worldEffects(lv({ bulb: 3 }), {}).time, TIMES.dusk); assert.equal(worldEffects(lv({ bulb: 4 }), {}).time, TIMES.dusk); assert.equal(worldEffects(lv({ bulb: 5 }), {}).time, TIMES.night);
  assert.deepEqual(worldEffects(lv({ bulb: 2 }), { blackout: true }), { time: TIMES.night, peopleVisible: true, glowScale: 0, storm: 0, rain: 0 });
});
// 錄影審查 2026-10-25：颱風被大巨蛋卡在 Lv2 時，全島的人不能消失到結局
test('the typhoon clears the streets only on its landing turn; a lingering storm is lighter', () => {
  const landing = worldEffects(lv({ typhoon: 2 }), {}, { landing: true }), linger = worldEffects(lv({ typhoon: 2 }), {}, { landing: false });
  assert.equal(landing.storm, 1); assert.equal(landing.rain, 1);
  assert.equal(landing.peopleVisible, true, 'people hide one by one at their doors (roster), never the whole group');
  assert.equal(linger.peopleVisible, true); assert.equal(linger.storm, 0.35); assert.equal(linger.rain, 0.35);
  assert.equal(worldEffects(lv({ typhoon: 2 }), {}).peopleVisible, true, 'no meta = not landing');
  const after = worldEffects(lv({ typhoon: 3 }), {}, { landing: false }); assert.equal(after.storm, 0); assert.equal(after.rain, 0);
});
test('stepWorld eases toward the target: ~98% in one second, snaps when close, never overshoots', () => {
  const from = worldEffects(lv({}), {}), to = { ...worldEffects(lv({ bulb: 5, typhoon: 2 }), {}, { landing: true }), peopleVisible: false };
  let w = from; for (let i = 0; i < 60; i++) { w = stepWorld(w, to, 1 / 60); assert.ok(w.time <= to.time && w.storm <= 1); }
  assert.ok((w.time - from.time) / (to.time - from.time) > 0.97); assert.equal(w.peopleVisible, false, 'people switch at once');
  for (let i = 0; i < 120; i++) w = stepWorld(w, to, 1 / 60);
  assert.deepEqual(w, to);
  assert.equal(stepWorld(to, to, 1 / 60), to, 'settled returns the same object');
});
