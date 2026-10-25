import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as spec from '../src/rules/spec.js';
import { installFakeDom } from './helpers/fakedom.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { createPeople, ringPath } from '../src/scene/people.js';
installFakeDom();
const { createStage, diffParts } = await import('../src/actors/stage.js');

const at = { x: 0, y: 0.65, z: 0 };
// 測試用的假鮮奶模組：lv1 一個箱子、lv2 多 3 個小孩、lv3 箱子換色並多一盞發光燈
const fakeMilk = {
  id: 'milk', labelY: 1,
  view(lv) {
    const v = {};
    if (lv.milk >= 1) v['milk.main'] = { kind: 'compound', at, parts: [{ kind: 'box', pos: [0, 0.2, 0], scale: 0.4, color: lv.milk >= 3 ? 0xdb6a41 : 0xfff8f4 }] };
    if (lv.milk >= 2) v['milk.kids'] = { kind: 'people', at, n: 3, path: ringPath({ x: 0, z: 0 }, 0.5, 0.65), speed: 0.5 };
    if (lv.milk >= 3) v['milk.lamp'] = { kind: 'compound', at, parts: [{ kind: 'sphere', pos: [0, 1, 0], scale: 0.2, color: 0xfcea8b, glow: 0xfcea8b }] };
    return v;
  },
};
const setup = (modules = [fakeMilk]) => {
  const scene = new THREE.Scene(), glow = createGlowRegistry(), people = createPeople(THREE, { max: 16 });
  const assets = { spawn: async () => new THREE.Group() };
  const stage = createStage(THREE, { scene, spec, modules, ctx: { people, assets, glow } });
  const parts = () => scene.getObjectByName('stage:parts').children;
  const run = s => { for (let t = 0; t < s; t += 0.05) stage.update(0.05, t); };
  return { scene, glow, people, stage, parts, run };
};
const placed = { kind: 'placed', item: 'milk', to: 1, story: '一箱鮮奶送到了' };
const grow = to => ({ kind: 'grow', item: 'milk', from: to - 1, to });

test('diffParts classifies added / removed / kept by spec equality', () => {
  const d = diffParts({ a: { kind: 'x', v: 1 }, b: { kind: 'y' } }, { a: { kind: 'x', v: 2 }, c: { kind: 'z' } });
  assert.deepEqual(d, { add: ['a', 'c'], remove: ['a', 'b'], keep: [] });
  assert.deepEqual(diffParts({ a: { k: 1 } }, { a: { k: 1 } }), { add: [], remove: [], keep: ['a'] });
});
test('placed → main part pops in; grow → extra part added, the unchanged part object is kept', async () => {
  const { stage, parts, run } = setup();
  const p = stage.apply(placed, { instant: false }); assert.equal(parts().length, 1); assert.ok(parts()[0].scale.x < 0.05, 'starts small');
  run(0.7); await p; assert.ok(Math.abs(parts()[0].scale.x - 1) < 1e-9);
  const box = parts()[0]; const q = stage.apply(grow(2), { instant: false }); run(0.7); await q;
  assert.ok(parts().includes(box)); assert.deepEqual(stage.partKeys().sort(), ['milk.kids', 'milk.main']);
});
test('a changed spec swaps the part: old shrinks away, new pops in', async () => {
  const { stage, parts, run } = setup();
  await stage.apply(placed, { instant: true }); await stage.apply(grow(2), { instant: true });
  const oldBox = parts()[0]; const p = stage.apply(grow(3), { instant: false });
  assert.ok(parts().includes(oldBox), 'old part lingers while shrinking'); run(0.7); await p;
  assert.ok(!parts().includes(oldBox)); assert.equal(stage.partKeys().length, 3);
});
test('instant apply finishes pending transitions: every part at scale 1 (review focus 2)', async () => {
  const { stage, parts, run } = setup();
  stage.apply(placed, { instant: false }); run(0.1); stage.apply(grow(2), { instant: false }); run(0.1);
  await stage.apply(grow(3), { instant: true });
  assert.equal(parts().length, 3); assert.ok(parts().every(o => Math.abs(o.scale.x - 1) < 1e-9 && o.rotation.z === 0));
});
test('reset mid-transition disposes everything (review focus 1)', async () => {
  const { stage, parts, people, run, scene } = setup();
  stage.apply(placed, { instant: false }); stage.apply(grow(2), { instant: false }); run(0.1);
  stage.reset();
  assert.equal(parts().length, 0); assert.equal(people.walkers.length, 0); assert.deepEqual(stage.partKeys(), []); assert.equal(floats(scene).length, 0, 'floats cleared');
  assert.equal(stage.levelOf('milk'), 0);
  assert.equal(scene.getObjectByName('stage:puffs').children.length, 0, 'transition smoke cleared');
});
test('glow registry returns to baseline after reset (review focus 5)', async () => {
  const { stage, glow } = setup(); const base = glow.size;
  await stage.apply(placed, { instant: true }); await stage.apply(grow(2), { instant: true }); await stage.apply(grow(3), { instant: true });
  assert.equal(glow.size, base + 1); stage.reset(); assert.equal(glow.size, base);
});
test('fx without delta shakes the item parts and resolves after 0.6 s of updates', async () => {
  const { stage, parts, run } = setup(); await stage.apply(placed, { instant: true });
  let done = false; stage.apply({ kind: 'fx', item: 'milk', cause: 'typhoon', story: '颱風假！' }, { instant: false }).then(() => { done = true; });
  stage.update(0.1, 0.1); assert.notEqual(parts()[0].rotation.z, 0);
  run(0.7); await new Promise(r => setTimeout(r, 0)); assert.ok(done); assert.equal(parts()[0].rotation.z, 0);
});
// GROW 式：沒有常駐標籤，等級變化時物件頭上飄一個「Lv.n」就好
const floats = scene => scene.getObjectByName('stage:labels').children;
test('a level change floats "Lv.n" above the item main part; instant shows nothing; it is gone after 1.4 s', async () => {
  const { stage, scene, run } = setup();
  stage.apply(placed, { instant: false });
  assert.equal(floats(scene).length, 1); assert.equal(floats(scene)[0].element.textContent, 'Lv.1'); assert.equal(floats(scene)[0].element.className, 'actor-float');
  // CSS2DRenderer 用 inline transform 定位外層；動畫必須放在內層 span，否則 CSS 動畫會蓋掉定位、字全部跑到左上角（錄影審查 2026-10-25）
  assert.equal(floats(scene)[0].element.children[0].tagName, 'span'); assert.equal(floats(scene)[0].element.children[0].className, 'rise');
  assert.ok(Math.abs(floats(scene)[0].position.y - (at.y + 1)) < 1e-9, 'labelY above milk.main');
  stage.apply(grow(2), { instant: false }); assert.equal(floats(scene).at(-1).element.textContent, 'Lv.2');
  run(1.5); assert.equal(floats(scene).length, 0);
  await stage.apply(grow(3), { instant: true }); assert.equal(floats(scene).length, 0);
});
test('a knocked-back level floats a falling grey label; MAX reads Lv.MAX', async () => {
  const { stage, scene, run } = setup();
  await stage.apply(placed, { instant: true }); await stage.apply(grow(2), { instant: true });
  stage.apply({ kind: 'fx', item: 'milk', cause: 'rat', delta: { target: 'milk', from: 2, to: 1 } }, { instant: false });
  assert.equal(floats(scene)[0].element.className, 'actor-float'); assert.equal(floats(scene)[0].element.children[0].className, 'rise down'); assert.equal(floats(scene)[0].element.textContent, 'Lv.1');
  stage.apply(grow(spec.ITEMS.milk.max), { instant: false }); assert.equal(floats(scene).at(-1).element.textContent, 'Lv.MAX');
});
test('items without a module still float their level at their anchor', async () => {
  const { stage, scene } = setup([]);
  stage.apply({ kind: 'placed', item: 'chip', to: 1 }, { instant: false });
  assert.equal(floats(scene).length, 1); assert.ok(floats(scene)[0].position.x > 3, 'at the chip anchor');
});
test('delta event updates the target item mirror and view; flags are mirrored', async () => {
  const { stage, people } = setup();
  await stage.apply(placed, { instant: true }); await stage.apply(grow(2), { instant: true }); assert.equal(people.walkers.length, 3);
  await stage.apply({ kind: 'fx', item: 'milk', cause: 'rat', delta: { target: 'milk', from: 2, to: 1 } }, { instant: true });
  assert.equal(stage.levelOf('milk'), 1); assert.equal(people.walkers.length, 0);
  await stage.apply({ kind: 'fx', item: 'typhoon', cause: 'typhoon', flag: { name: 'blackout', value: true }, lock: 'bulb' }, { instant: true });
  assert.equal(stage.flags.blackout, true);
});
// 使用者 2026-10-25：光點與轉頭拿掉（畫面太亂）。升級直接彈出；wait 事件畫面上什麼都不做
const helper = { id: 'baseball', labelY: 1, view: lv => lv.baseball ? { 'baseball.main': { kind: 'compound', at: { x: -3, y: 0.65, z: 4 }, parts: [{ kind: 'box', pos: [0, 0.2, 0], scale: 0.4, color: 0xdb6a41 }] } } : {} };
test('a grow with helpers pops at once, no sparks', async () => {
  const { stage, scene, parts } = setup([fakeMilk, helper]);
  await stage.apply({ kind: 'placed', item: 'baseball', to: 1 }, { instant: true }); await stage.apply(placed, { instant: true });
  const before = parts().length;
  stage.apply({ kind: 'grow', item: 'milk', from: 1, to: 2, via: ['baseball'] }, { instant: false });
  assert.ok(parts().length > before, 'popped immediately'); assert.equal(scene.getObjectByName('stage:sparks'), undefined);
});
test('a wait event changes nothing on screen', async () => {
  const { stage, scene, parts, run } = setup([fakeMilk, helper]);
  await stage.apply({ kind: 'placed', item: 'baseball', to: 1 }, { instant: true }); await stage.apply(placed, { instant: true });
  const n = floats(scene).length;
  await stage.apply({ kind: 'wait', item: 'milk', waits: [{ item: 'milk', for: ['baseball'] }] }, { instant: false }); run(0.3);
  assert.equal(floats(scene).length, n); assert.ok(parts().every(o => o.rotation.y === 0));
});
test('a no-op knock (1→1) floats nothing', async () => {
  const { stage, scene } = setup([fakeMilk, helper]);
  await stage.apply(placed, { instant: true }); const n = floats(scene).length;
  await stage.apply({ kind: 'fx', item: 'milk', cause: 'rat', delta: { target: 'milk', from: 1, to: 1 } }, { instant: false });
  assert.equal(floats(scene).length, n);
});

// 計畫 3.6：101 不搭別人的事件跳階，回合最後的 settle 才跳，並在塔頂飄字
const tower = await import('../src/actors/tower.js');
test('grow events leave 101 alone until settle, which pops it and floats the stage name', async () => {
  const { stage, scene, run } = setup([fakeMilk, tower]);
  await stage.apply(placed, { instant: true });
  for (let to = 2; to <= 6; to++) await stage.apply({ kind: 'grow', item: 'milk', from: to - 1, to }, { instant: true });
  await stage.apply({ kind: 'placed', item: 'chip', to: 1 }, { instant: true });
  await stage.apply({ kind: 'grow', item: 'chip', from: 1, to: 3 }, { instant: true });   // 總和 9
  assert.equal(stage.meta.total, 0); assert.ok(stage.partKeys().includes('tower.crane'));
  const before = floats(scene).length, p = stage.apply({ kind: 'settle' }, { instant: false });
  assert.equal(stage.meta.total, 9);
  assert.equal(floats(scene).length, before + 1); assert.equal(floats(scene).at(-1).element.textContent, '101 蓋一半');
  run(1.2); assert.notEqual(await p, false);
});
test('two thresholds in one turn pop once with the final stage name', async () => {
  const { stage, scene } = setup([fakeMilk, tower]);
  await stage.apply(placed, { instant: true });
  await stage.apply({ kind: 'fx', item: 'milk', delta: { target: 'milk', from: 1, to: 20 } }, { instant: true });
  const before = floats(scene).length; stage.apply({ kind: 'settle' }, { instant: false });
  assert.equal(floats(scene).length, before + 1); assert.equal(floats(scene).at(-1).element.textContent, '101 完工');
});
test('settle with nothing to change and wait events resolve false (the director will not wait)', async () => {
  const { stage, scene } = setup([fakeMilk, tower]);
  await stage.apply(placed, { instant: true });
  const n = floats(scene).length;
  assert.equal(await stage.apply({ kind: 'settle' }, { instant: false }), false); assert.equal(floats(scene).length, n);
  assert.equal(await stage.apply({ kind: 'wait', item: 'milk', waits: [] }, { instant: false }), false);
  assert.equal(await stage.apply({ kind: 'fx', item: 'milk', cause: 'rat', delta: { target: 'milk', from: 1, to: 1 } }, { instant: false }), false);
});
test('the typhoon landing sets meta.landing until settle', async () => {
  const { stage } = setup([fakeMilk]);
  await stage.apply({ kind: 'placed', item: 'typhoon', to: 1 }, { instant: true });
  await stage.apply({ kind: 'grow', item: 'typhoon', from: 1, to: 2 }, { instant: true });
  assert.equal(stage.meta.landing, true);
  await stage.apply({ kind: 'settle' }, { instant: true }); assert.equal(stage.meta.landing, false);
  await stage.apply({ kind: 'grow', item: 'typhoon', from: 2, to: 3 }, { instant: true }); assert.equal(stage.meta.landing, false);
});
test('headOf is exposed for the fly-in target', () => {
  const { stage } = setup([fakeMilk]);
  const h = stage.headOf('milk'); assert.ok(Number.isFinite(h.x) && Number.isFinite(h.y) && Number.isFinite(h.z));
});
