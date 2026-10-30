import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldEffects, stepWorld } from '../src/actors/world.js';
import { TIMES } from '../src/scene/daynight.js';
import { lv } from './helpers/actors.js';

test('worldEffects: lamps set the clock, blackout kills the glow at night', () => {
  assert.deepEqual(worldEffects(lv({}), {}), { time: TIMES.day, peopleVisible: true, glowScale: 1, storm: 0, rain: 0, mood: 'normal' });
  assert.equal(worldEffects(lv({ bulb: 3 }), {}).time, TIMES.dusk); assert.equal(worldEffects(lv({ bulb: 4 }), {}).time, TIMES.dusk); assert.equal(worldEffects(lv({ bulb: 5 }), {}).time, TIMES.night);
  assert.deepEqual(worldEffects(lv({ bulb: 2 }), { blackout: true }), { time: TIMES.night, peopleVisible: true, glowScale: 0, storm: 0, rain: 0, mood: 'normal' });
});
// 物品 v2 §4.4：燈泡 Lv3 霓虹／傍晚、Lv5 全島 LED／夜晚、Lv9 全島賽博霓虹（發光加強）
test('worldEffects keys on the bulb ladder: dusk at 3, night at 5, the neon glow boost at 9', () => {
  const at = n => worldEffects(lv({ bulb: n }), {});
  assert.equal(at(2).time, TIMES.day); assert.equal(at(3).time, TIMES.dusk); assert.equal(at(4).time, TIMES.dusk);
  assert.equal(at(5).time, TIMES.night); assert.equal(at(8).time, TIMES.night); assert.equal(at(9).time, TIMES.night);
  for (const n of [0, 3, 5, 8]) assert.equal(at(n).glowScale, 1, `bulb ${n}`);
  assert.ok(at(9).glowScale > 1, 'the island-wide cyber neon glows brighter');
  assert.equal(worldEffects(lv({ bulb: 9 }), { blackout: true }).glowScale, 0, 'a blackout still kills every glow');
});
// 唯一正解 2026-10-31 §5.1（修正輪 1：只看等級，沒有 meta.landing）：Lv1（放下那回合）大雨，移站之後（Lv2–3）雨小（LINGER），Lv4 放晴；人從不整群消失
test('the storm pours at typhoon Lv1 (the placement turn), is lighter while the cloud moves on (Lv2–3), and clears at Lv4', () => {
  const pour = worldEffects(lv({ typhoon: 1 }), {});
  assert.equal(pour.storm, 1); assert.equal(pour.rain, 1);
  assert.equal(pour.peopleVisible, true, 'people hide one by one at their doors (roster), never the whole group');
  for (const n of [2, 3]) {
    const linger = worldEffects(lv({ typhoon: n }), {});
    assert.equal(linger.peopleVisible, true); assert.equal(linger.storm, 0.35, `Lv${n}`); assert.equal(linger.rain, 0.35);
  }
  const after = worldEffects(lv({ typhoon: 4 }), {}); assert.equal(after.storm, 0); assert.equal(after.rain, 0);
  assert.equal(worldEffects(lv({}), {}).storm, 0, 'no typhoon, no storm');
});
test('stepWorld eases toward the target: ~98% in one second, snaps when close, never overshoots', () => {
  const from = worldEffects(lv({}), {}), to = { ...worldEffects(lv({ bulb: 5, typhoon: 1 }), {}), peopleVisible: false };
  let w = from; for (let i = 0; i < 60; i++) { w = stepWorld(w, to, 1 / 60); assert.ok(w.time <= to.time && w.storm <= 1); }
  assert.ok((w.time - from.time) / (to.time - from.time) > 0.97); assert.equal(w.peopleVisible, false, 'people switch at once');
  for (let i = 0; i < 120; i++) w = stepWorld(w, to, 1 / 60);
  assert.deepEqual(w, to);
  assert.equal(stepWorld(to, to, 1 / 60), to, 'settled returns the same object');
});
// 最終章 §6、§8：命中全島躺平、外星尾聲第三隻眼——全島效果多一個 mood，stepWorld 不緩動它、原樣切過去
test('worldEffects.mood: hit → lie, alien epilogue → alien, otherwise normal; stepWorld carries mood through unchanged', () => {
  assert.equal(worldEffects(lv({}), {}).mood, 'normal');
  assert.equal(worldEffects(lv({}), { missile: 'hit' }).mood, 'lie');
  assert.equal(worldEffects(lv({}), { missile: 'shield' }).mood, 'normal');
  assert.equal(worldEffects(lv({}), { missile: 'deflect' }).mood, 'normal');
  assert.equal(worldEffects(lv({}), { missile: 'shield', epilogue: 'alien' }).mood, 'alien');
  assert.equal(worldEffects(lv({}), { missile: 'shield', epilogue: 'cyber' }).mood, 'normal');
  const from = worldEffects(lv({}), {}), to = worldEffects(lv({}), { missile: 'hit' });
  const w = stepWorld(from, to, 1 / 60);
  assert.notEqual(w, from, 'a mood-only change is not dropped as "same"');
  assert.equal(w.mood, 'lie', 'mood switches at once');
  assert.equal(stepWorld(to, to, 1 / 60), to);
});
