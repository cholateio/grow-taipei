import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as spec from '../src/rules/spec.js';
import { installFakeDom } from './helpers/fakedom.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { createPeople, ringPath } from '../src/scene/people.js';
installFakeDom();
const { createStage, diffParts } = await import('../src/actors/stage.js');
const { createBlink } = await import('../src/show/blink.js');

const at = { x: 0, y: 0.65, z: 0 };
// 測試用的假鮮奶模組：lv1 一個箱子、只有 lv2 多 3 個小孩、lv3 箱子換色並多一盞發光燈
// （小孩只在 lv2：placed 之後直接 grow(3) 只換箱子、多一盞燈，分段套用與延後揭露的測試才好算）
const fakeMilk = {
  id: 'milk', labelY: 1,
  view(lv) {
    const v = {};
    if (lv.milk >= 1) v['milk.main'] = { kind: 'compound', at, parts: [{ kind: 'box', pos: [0, 0.2, 0], scale: 0.4, color: lv.milk >= 3 ? 0xdb6a41 : 0xfff8f4 }] };
    if (lv.milk === 2) v['milk.kids'] = { kind: 'people', at, n: 3, path: ringPath({ x: 0, z: 0 }, 0.5, 0.65), speed: 0.5 };
    if (lv.milk >= 3) v['milk.lamp'] = { kind: 'compound', at, parts: [{ kind: 'sphere', pos: [0, 1, 0], scale: 0.2, color: 0xfcea8b, glow: 0xfcea8b }] };
    return v;
  },
};
const setup = (modules = [fakeMilk], roster = null, { blink: withBlink = true } = {}) => {
  const scene = new THREE.Scene(), glow = createGlowRegistry(), people = createPeople(THREE, { max: 16 });
  const assets = { spawn: async () => new THREE.Group() }, blink = withBlink ? createBlink(THREE, { people }) : null;
  const stage = createStage(THREE, { scene, spec, modules, ctx: { people, assets, glow }, roster, blink });
  const parts = () => scene.getObjectByName('stage:parts').children;
  return { scene, glow, people, stage, parts, blink };
};
// 零件現在是不是在亮（亮一下：每個 mesh 換成會發光的複本，沒有純白材質）
const lit = (blink, o) => { let all = true, any = false; o.traverse(m => { if (m.isMesh) { any = true; all &&= m.material.emissiveIntensity > 0 && !(m.material.isMeshBasicMaterial && m.material.color.getHex() === 0xffffff); } }); return any && all && blink.has(o); };
const placed = { kind: 'placed', item: 'milk', to: 1, story: '一箱鮮奶送到了' };
const grow = to => ({ kind: 'grow', item: 'milk', from: to - 1, to });

test('diffParts classifies added / removed / kept by spec equality', () => {
  const d = diffParts({ a: { kind: 'x', v: 1 }, b: { kind: 'y' } }, { a: { kind: 'x', v: 2 }, c: { kind: 'z' } });
  assert.deepEqual(d, { add: ['a', 'c'], remove: ['a', 'b'], keep: [] });
  assert.deepEqual(diffParts({ a: { k: 1 } }, { a: { k: 1 } }), { add: [], remove: [], keep: ['a'] });
});
test('apply is instant and reports changed keys; the same event applied again reports nothing', () => {
  const { stage, parts } = setup();
  const r = stage.apply(placed); assert.deepEqual(r.changed.map(c => c.key), ['milk.main']); assert.equal(r.changed[0].kind, 'add'); assert.equal(parts().length, 1); assert.equal(parts()[0].scale.x, 1);
  assert.deepEqual(stage.apply(placed), { changed: [], rest: [] });
  const g = stage.apply(grow(3)); assert.deepEqual(g.changed.map(c => c.key).sort(), ['milk.lamp', 'milk.main']); assert.equal(g.changed.find(c => c.key === 'milk.main').kind, 'replace');
});
test('only applies a subset now and the rest on the next apply of the same event', () => {
  const { stage } = setup(); stage.apply(placed);
  const r = stage.apply(grow(3), { only: ['milk.lamp'] }); assert.deepEqual(r.changed.map(c => c.key), ['milk.lamp']); assert.deepEqual(r.rest, ['milk.main']);
  assert.equal(stage.lv.milk, 3, 'levels fold fully even when parts are held back');
  const s = stage.apply(grow(3)); assert.deepEqual(s.changed.map(c => c.key), ['milk.main']); assert.deepEqual(s.rest, []);
});
test('deferred keeps the old part and hides the new until commit; commitAll reveals everything', () => {
  const { stage, parts } = setup(); stage.apply(placed); const old = parts()[0];
  const r = stage.apply(grow(3), { deferred: true });
  assert.ok(parts().includes(old)); const fresh = parts().filter(o => o !== old); assert.ok(fresh.every(o => o.visible === false)); assert.deepEqual(stage.pendingKeys().sort(), ['milk.lamp', 'milk.main']);
  stage.commit('milk.main'); assert.ok(!parts().includes(old)); assert.equal(stage.pendingKeys().length, 1);
  stage.commitAll(); assert.ok(parts().every(o => o.visible)); assert.equal(stage.pendingKeys().length, 0);
});
// §13.2：換零件＝舊的立刻拿掉、新的亮一下；新增＝新的亮一下；移除＝舊的亮一下，亮完才拿掉
test('commit reveals the fresh part and blinks it; the old part is dropped', () => {
  const { stage, parts, blink } = setup(); stage.apply(placed); const old = parts()[0];
  stage.apply(grow(3), { deferred: true }); const fresh = stage.partObject('milk.main');
  stage.commit('milk.main');
  assert.ok(!parts().includes(old), 'replaced: old dropped at once'); assert.equal(fresh.visible, true); assert.ok(lit(blink, fresh)); assert.equal(blink.count, 1);
  assert.ok(Math.abs(fresh.scale.y - 0.94) < 1e-9, 'the fresh part pops from 0.94x');
  stage.commit('milk.lamp'); assert.ok(lit(blink, stage.partObject('milk.lamp'))); assert.equal(blink.count, 2);
  blink.update(0.16); assert.equal(blink.count, 0); assert.ok(!lit(blink, fresh), 'back to its own colours'); assert.deepEqual(fresh.scale.toArray(), [1, 1, 1]);
});
const drop = { kind: 'fx', item: 'milk', cause: 'typhoon', delta: { target: 'milk', from: 3, to: 1 } };   // 3 → 1：燈拿掉、箱子換回白的
test('a removed part blinks first and is dropped when the blink ends', () => {
  const { stage, parts, blink } = setup(); stage.apply(placed); stage.apply(grow(3)); const lamp = stage.partObject('milk.lamp');
  stage.apply(drop, { deferred: true }); assert.ok(parts().includes(lamp), 'old kept while pending');
  stage.commit('milk.lamp'); assert.ok(parts().includes(lamp), 'still there, blinking'); assert.ok(lit(blink, lamp)); assert.ok(!stage.pendingKeys().includes('milk.lamp'));
  assert.deepEqual(lamp.scale.toArray(), [1, 1, 1], 'a part going away glows but does not pop');
  blink.update(0.1); assert.ok(parts().includes(lamp));
  blink.update(0.06); assert.ok(!parts().includes(lamp), 'dropped after the blink'); assert.equal(blink.count, 0);
});
// 計畫 9 任務 4（任務 2 延後的小項）：彈到一半就被拿掉（下一個套用換掉它）——拿掉之前先收掉 pop，物件回到原本的大小（放回模型池的才不會小一號）
test('a part dropped mid-pop is restored to its own scale before it goes', () => {
  const { stage, parts, blink } = setup(); stage.apply(placed);
  stage.apply(grow(3), { deferred: true }); stage.commit('milk.main'); const fresh = stage.partObject('milk.main');
  blink.update(0.05); assert.ok(fresh.scale.y < 1 && blink.has(fresh), 'mid-pop');
  stage.apply(drop); assert.ok(!parts().includes(fresh), 'swapped out at once');
  assert.deepEqual(fresh.scale.toArray(), [1, 1, 1], 'back to its own scale'); assert.equal(blink.has(fresh), false);
});
test('commitAll commits without blinking and drops a blinking removal at once, restored first', () => {
  const { stage, parts, blink } = setup(); stage.apply(placed); stage.apply(grow(3)); const lamp = stage.partObject('milk.lamp');
  stage.apply(drop, { deferred: true }); stage.commit('milk.lamp'); assert.equal(blink.count, 1);
  stage.commitAll(); assert.ok(!parts().includes(lamp), 'removal dropped at once'); assert.ok(parts().every(o => o.visible));
  assert.equal(blink.count, 0, 'commitAll blinks nothing and restores the removal before dropping it'); assert.ok(!lit(blink, lamp));
});
test('reset drops a part that is blinking out', () => {
  const { stage, parts, blink } = setup(); stage.apply(placed); stage.apply(grow(3)); const lamp = stage.partObject('milk.lamp');
  stage.apply(drop, { deferred: true }); stage.commit('milk.lamp'); stage.reset();
  assert.ok(!parts().includes(lamp)); assert.ok(!lit(blink, lamp), 'restored before it was dropped'); assert.deepEqual(stage.partKeys(), []);
});
test('a stage without blink commits as before', () => {
  const { stage, parts } = setup([fakeMilk], null, { blink: false }); stage.apply(placed); stage.apply(grow(3)); const lamp = stage.partObject('milk.lamp');
  stage.apply(drop, { deferred: true }); stage.commit('milk.lamp'); stage.commit('milk.main');
  assert.ok(!parts().includes(lamp)); assert.ok(stage.partObject('milk.main').visible);
});
test('roster parts go to the roster, not the factory; hold is passed through; removal retires', () => {
  const calls = []; const roster = { declare: (k, s, o) => calls.push(['declare', k, s.n, !!o?.hold]), retire: k => calls.push(['retire', k]), syncAll() {}, reset() {} };
  const mod = { id: 'milk', view: lv => lv.milk >= 2 ? { 'milk.kids': { kind: 'roster', at, n: lv.milk, home: { kind: 'wander', at, r: 1 } } } : {} };
  const { stage } = setup([mod], roster); stage.apply(placed); stage.apply(grow(2), { hold: ['milk.kids'] }); stage.apply(grow(3));
  assert.deepEqual(calls, [['declare', 'milk.kids', 2, true], ['declare', 'milk.kids', 3, false]]);
  stage.apply({ kind: 'fx', item: 'milk', delta: { target: 'milk', from: 3, to: 1 } }); assert.deepEqual(calls.at(-1), ['retire', 'milk.kids']);
});
test('footprints: declared circle, declared ellipse, declared rect, a list of shapes, auto bbox (not shrunk, §14.1) for compact compounds, none for wide ones or false', () => {
  const mod = { id: 'milk', view: lv => lv.milk ? {
    'milk.a': { kind: 'compound', at, footprint: { r: 0.4 }, parts: [{ kind: 'box', pos: [0, 0.2, 0], scale: 0.4, color: 1 }] },
    'milk.b': { kind: 'compound', at: { ...at, x: 3 }, footprint: { w: 1, d: 0.5, z: -0.3 }, parts: [{ kind: 'box', pos: [0, 0.2, 0], scale: 0.4, color: 1 }] },
    'milk.c': { kind: 'compound', at: { ...at, x: 6 }, parts: [{ kind: 'box', pos: [0, 0.5, 0], scale: [1, 1, 2], color: 1 }] },
    'milk.d': { kind: 'compound', at, parts: [{ kind: 'box', pos: [0, 0.1, 0], scale: [6, 0.1, 6], color: 1 }] },
    'milk.e': { kind: 'compound', at, footprint: false, parts: [{ kind: 'box', pos: [0, 0.1, 0], scale: 1, color: 1 }] },
    'milk.f': { kind: 'compound', at: { ...at, x: -3 }, footprint: { rx: 1.15, rz: 0.95 }, parts: [{ kind: 'box', pos: [0, 0.2, 0], scale: 0.4, color: 1 }] },
    'milk.g': { kind: 'compound', at: { ...at, x: -6 }, footprint: [{ x: 0.5, z: 0.1, r: 0.2 }, { w: 0.3, d: 0.2 }], parts: [{ kind: 'box', pos: [0, 0.2, 0], scale: 0.4, color: 1 }] },
  } : {} };
  const { stage } = setup([mod]); stage.apply(placed); const f = stage.footprints();
  assert.deepEqual(f.find(x => x.r === 0.4), { x: at.x, z: at.z, r: 0.4 });
  assert.deepEqual(f.find(x => x.w === 1), { x: at.x + 3, z: at.z - 0.3, w: 1, d: 0.5 });
  assert.deepEqual(f.find(x => x.rx === 1.15), { x: at.x - 3, z: at.z, rx: 1.15, rz: 0.95 });
  const auto = f.find(x => Math.abs(x.x - (at.x + 6)) < 1e-6); assert.ok(Math.abs(auto.w - 1) < 1e-6 && Math.abs(auto.d - 2) < 1e-6);
  assert.deepEqual(f.filter(x => Math.abs(x.x - (at.x - 6)) < 1.0), [{ x: at.x - 5.5, z: at.z + 0.1, r: 0.2 }, { x: at.x - 6, z: at.z, w: 0.3, d: 0.2 }]);
  assert.equal(f.length, 6);
});
test('grow adds the extra part and keeps the unchanged part object', () => {
  const { stage, parts } = setup();
  stage.apply(placed); const box = parts()[0];
  assert.deepEqual(stage.apply(grow(2)).changed.map(c => c.key), ['milk.kids']);
  assert.ok(parts().includes(box)); assert.deepEqual(stage.partKeys().sort(), ['milk.kids', 'milk.main']);
});
test('a changed spec swaps the part at once', () => {
  const { stage, parts } = setup();
  stage.apply(placed); stage.apply(grow(2)); const oldBox = parts()[0];
  stage.apply(grow(3));
  assert.ok(!parts().includes(oldBox)); assert.deepEqual(stage.partKeys().sort(), ['milk.lamp', 'milk.main']); assert.equal(stage.partObject('milk.main').visible, true);
});
// 舞台不再生任何 CSS2D 標籤（飄字改由演出層的泡泡出）
const labels = scene => { const out = []; scene.traverse(o => { if (o.isCSS2DObject) out.push(o); }); return out; };
test('reset disposes everything, pending parts included', () => {
  const { stage, parts, people, scene } = setup();
  stage.apply(placed); stage.apply(grow(2)); stage.apply(grow(3), { deferred: true });
  stage.reset();
  assert.equal(parts().length, 0); assert.equal(people.walkers.length, 0); assert.deepEqual(stage.partKeys(), []); assert.deepEqual(stage.pendingKeys(), []);
  assert.equal(labels(scene).length, 0); assert.equal(stage.levelOf('milk'), 0);
});
test('reset also resets the roster', () => {
  let resets = 0; const roster = { declare() {}, retire() {}, reset() { resets++; } };
  const { stage } = setup([fakeMilk], roster); stage.reset(); assert.equal(resets, 1);
});
test('glow registry returns to baseline after reset', () => {
  const { stage, glow } = setup(); const base = glow.size;
  stage.apply(placed); stage.apply(grow(2)); stage.apply(grow(3));
  assert.equal(glow.size, base + 1); stage.reset(); assert.equal(glow.size, base);
});
test('delta event updates the target item mirror and view; flags are mirrored', () => {
  const { stage, people } = setup();
  stage.apply(placed); stage.apply(grow(2)); assert.equal(people.walkers.length, 3);
  const r = stage.apply({ kind: 'fx', item: 'milk', cause: 'rat', delta: { target: 'milk', from: 2, to: 1 } });
  assert.equal(stage.levelOf('milk'), 1); assert.equal(people.walkers.length, 0); assert.deepEqual(r.changed.map(c => [c.key, c.kind]), [['milk.kids', 'remove']]);
  stage.apply({ kind: 'fx', item: 'typhoon', cause: 'typhoon', flag: { name: 'blackout', value: true }, lock: 'bulb' });
  assert.equal(stage.flags.blackout, true);
});
const helper = { id: 'baseball', labelY: 1, view: lv => lv.baseball ? { 'baseball.main': { kind: 'compound', at: { x: -3, y: 0.65, z: 4 }, parts: [{ kind: 'box', pos: [0, 0.2, 0], scale: 0.4, color: 0xdb6a41 }] } } : {} };
test('a wait event and a no-op knock (1→1) change nothing', () => {
  const { stage, parts } = setup([fakeMilk, helper]);
  stage.apply({ kind: 'placed', item: 'baseball', to: 1 }); stage.apply(placed);
  const before = parts().slice();
  assert.deepEqual(stage.apply({ kind: 'wait', item: 'milk', waits: [{ item: 'milk', for: ['baseball'] }] }), { changed: [], rest: [] });
  assert.deepEqual(stage.apply({ kind: 'fx', item: 'milk', cause: 'rat', delta: { target: 'milk', from: 1, to: 1 } }), { changed: [], rest: [] });
  assert.deepEqual(parts(), before);
});

// 計畫 3.6：101 不搭別人的事件跳階，回合最後的 settle 才跳（階段名稱改由 tower 劇本用泡泡出）
const tower = await import('../src/actors/tower.js');
test('grow events leave 101 alone until settle, which swaps it and floats nothing', () => {
  const { stage, scene } = setup([fakeMilk, tower]);
  stage.apply(placed);
  for (let to = 2; to <= 6; to++) stage.apply({ kind: 'grow', item: 'milk', from: to - 1, to });
  stage.apply({ kind: 'placed', item: 'chip', to: 1 });
  stage.apply({ kind: 'grow', item: 'chip', from: 1, to: 3 });   // 總和 9
  assert.equal(stage.meta.total, 0); assert.ok(stage.partKeys().includes('tower.crane'));
  const r = stage.apply({ kind: 'settle' });
  assert.equal(stage.meta.total, 9); assert.ok(r.changed.some(c => c.key === 'tower.main')); assert.equal(labels(scene).length, 0);
});
test('settle with nothing to change reports nothing', () => {
  const { stage } = setup([fakeMilk, tower]);
  stage.apply(placed);
  assert.deepEqual(stage.apply({ kind: 'settle' }), { changed: [], rest: [] });
});
// 審查：登陸回合的「結束畫面」也要看得到人躲雨（跳過、reduced-motion 的人只看得到結束畫面），下一回合第一個事件才收
test('the typhoon landing lasts through its turn end and clears on the next turn', () => {
  const { stage } = setup([fakeMilk]);
  stage.apply({ kind: 'placed', item: 'typhoon', to: 1 });
  stage.apply({ kind: 'grow', item: 'typhoon', from: 1, to: 2 });
  assert.equal(stage.meta.landing, true);
  stage.apply({ kind: 'settle' }); assert.equal(stage.meta.landing, true, 'still landing at rest');
  stage.apply(placed); assert.equal(stage.meta.landing, false, 'next turn');
  stage.apply({ kind: 'settle' }); assert.equal(stage.meta.landing, false);
});
// 老鼠咬鮮奶（fx、cause rat、鮮奶掉級）：小孩躲一回合，跟颱風登陸一樣撐過回合結束畫面，下一回合第一個事件才收
test('a rat bite on milk sets meta.bitten through the turn settle; the next turn clears it', () => {
  const { stage } = setup([fakeMilk]);
  stage.apply(placed); stage.apply({ kind: 'grow', item: 'milk', from: 1, to: 2 });
  stage.apply({ kind: 'fx', item: 'rat', cause: 'rat', delta: { target: 'milk', from: 2, to: 1 } });
  assert.equal(stage.meta.bitten, true);
  stage.apply({ kind: 'settle' }); assert.equal(stage.meta.bitten, true, 'still sheltering at rest');
  stage.apply({ kind: 'grow', item: 'milk', from: 1, to: 2 }); assert.equal(stage.meta.bitten, false, 'next turn');
  stage.apply({ kind: 'fx', item: 'rat', cause: 'rat', delta: { target: 'milk', from: 2, to: 2 } }); assert.equal(stage.meta.bitten, false, 'no level lost, no bite');
});
test('a turn with nothing but settle also ends the landing', () => {
  const { stage } = setup([fakeMilk]);
  stage.apply({ kind: 'placed', item: 'typhoon', to: 1 });
  stage.apply({ kind: 'grow', item: 'typhoon', from: 1, to: 2 });
  stage.apply({ kind: 'settle' }); stage.apply({ kind: 'settle' });
  assert.equal(stage.meta.landing, false);
});
