import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldEffects, stepWorld } from '../src/actors/world.js';
import { TIMES, sample } from '../src/scene/daynight.js';
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
// 唯一正解 2026-10-31 §5.1（修正輪 1：只看等級，沒有 meta.landing）；修正批次 2：颱風三級——Lv1（放下那回合）、Lv2 都是全島大雨，Lv3 放晴；人從不整群消失
test('the storm pours island-wide at typhoon Lv1 (the placement turn) and Lv2, and clears at Lv3', () => {
  for (const n of [1, 2]) {
    const pour = worldEffects(lv({ typhoon: n }), {});
    assert.equal(pour.storm, 1, `Lv${n}`); assert.equal(pour.rain, 1);
    assert.equal(pour.peopleVisible, true, 'people hide one by one at their doors (roster), never the whole group');
  }
  const after = worldEffects(lv({ typhoon: 3 }), {}); assert.equal(after.storm, 0); assert.equal(after.rain, 0);
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
test('worldEffects.mood: hit without an epilogue → lie, alien epilogue → alien, otherwise normal; stepWorld carries mood through unchanged', () => {
  assert.equal(worldEffects(lv({}), {}).mood, 'normal');
  assert.equal(worldEffects(lv({}), { missile: 'hit' }).mood, 'lie');
  assert.equal(worldEffects(lv({}), { missile: 'shield' }).mood, 'normal');
  assert.equal(worldEffects(lv({}), { missile: 'deflect' }).mood, 'normal');
  assert.equal(worldEffects(lv({}), { missile: 'shield', epilogue: 'alien' }).mood, 'alien');
  assert.equal(worldEffects(lv({}), { missile: 'shield', epilogue: 'cyber' }).mood, 'normal');
  // 計畫 17：命中之後有收尾的壞結局，收尾裡大家站起來（epilogue 有值就不躺）；外星收尾第三隻眼；沒有收尾的（矽盾未就緒等）躺到最後
  for (const id of ['blackout', 'flood', 'domeFlood', 'cartBlown', 'milkExpired']) assert.equal(worldEffects(lv({}), { missile: 'hit', epilogue: id }).mood, 'normal', id);
  assert.equal(worldEffects(lv({}), { missile: 'hit', epilogue: 'alien' }).mood, 'alien');
  assert.equal(worldEffects(lv({}), { missile: 'deflect', epilogue: 'alien' }).mood, 'alien');
  assert.equal(worldEffects(lv({}), { missile: 'hit', alarm: 1 }).mood, 'lie', 'no epilogue: lie to the end');
  const from = worldEffects(lv({}), {}), to = worldEffects(lv({}), { missile: 'hit' });
  const w = stepWorld(from, to, 1 / 60);
  assert.notEqual(w, from, 'a mood-only change is not dropped as "same"');
  assert.equal(w.mood, 'lie', 'mood switches at once');
  assert.equal(stepWorld(to, to, 1 / 60), to);
});
// 計畫 17：大停電收尾的「漆黑」——比夜晚更黑：天空近黑、環境光（半球光）約夜晚的 0.15 倍、月光一樣壓到 0.15 倍；日、黃昏、夜晚不動
test('TIMES.pitch (1380) is darker than night: a near-black sky and about 0.15× the night light; day / dusk / night unchanged', () => {
  assert.deepEqual(TIMES, { day: 600, dusk: 1065, night: 1260, pitch: 1380 });
  const night = sample(TIMES.night), pitch = sample(TIMES.pitch);
  const luma = c => (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;
  assert.ok(luma(pitch.skyTop) < 0.04 && luma(pitch.horizon) < 0.07, `near-black sky (${luma(pitch.skyTop).toFixed(3)}, ${luma(pitch.horizon).toFixed(3)})`);
  assert.ok(luma(pitch.skyTop) < luma(night.skyTop) / 3 && luma(pitch.horizon) < luma(night.horizon) / 3, 'much darker than the night sky');
  assert.ok(Math.abs(pitch.hemiI / night.hemiI - 0.15) < 0.01, `ambient ×${(pitch.hemiI / night.hemiI).toFixed(3)}`);
  assert.ok(Math.abs(pitch.sunI / night.sunI - 0.15) < 0.01, `moonlight ×${(pitch.sunI / night.sunI).toFixed(3)}`);
  assert.equal(pitch.night, 1, 'stars and the night glow stay on');
  assert.ok(luma(pitch.water) < luma(night.water) / 2, 'dark water');
  // 夜晚到漆黑之間一路變暗（world 的 time 緩動從 1260 走到 1380）
  let prev = night.hemiI;
  for (let m = TIMES.night + 10; m <= TIMES.pitch; m += 10) { const x = sample(m); assert.ok(x.hemiI <= prev + 1e-9, `minute ${m}`); prev = x.hemiI; }
});
// 計畫 17 任務 3：大停電收尾的天色是漆黑（TIMES.pitch）——收尾一開始 worldNow、回合收尾的 world 拍、跳過的 snap 都照這一份算
test('worldEffects: the blackout epilogue is pitch dark (TIMES.pitch), glow still off, people standing; other epilogues keep their clock', () => {
  assert.deepEqual(worldEffects(lv({ bulb: 2 }), { blackout: true, missile: 'hit', epilogue: 'blackout' }), { time: TIMES.pitch, peopleVisible: true, glowScale: 0, storm: 0, rain: 0, mood: 'normal' });
  assert.equal(worldEffects(lv({ bulb: 2 }), { blackout: true, missile: 'hit' }).time, TIMES.night, 'before the epilogue: night');
  assert.equal(worldEffects(lv({ bulb: 4 }), { flooded: true, missile: 'hit', epilogue: 'flood' }).time, TIMES.dusk);
});
