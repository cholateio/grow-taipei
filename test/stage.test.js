import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as spec from '../src/rules/spec.js';
import { installFakeDom } from './helpers/fakedom.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { createPeople, ringPath } from '../src/scene/people.js';
installFakeDom();
const { createStage, diffParts, troubleOf, troubleSpot, growsOn, TROUBLE_IN } = await import('../src/actors/stage.js');
const { createBlink, GROW_DUR, GROW_HOLD, BLINK, SHRINK_DUR } = await import('../src/show/blink.js');

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
// §13.2：換零件＝舊的立刻拿掉（新的矮樁蓋住它，不縮）、新的出現；新增＝新的出現；移除＝舊的縮下去，縮完才拿掉（計畫 11 §設計 1）。
// 修正批次 2：會長的新零件「長出來」（blink.grow：scale.y 停在 0.15 GROW_HOLD 秒，再 GROW_DUR 秒長到 1，最後衝過頭到 1.04 落回 1）；
// 使用者 2026-10-31「閃一下」：長的時候不亮（commit 只呼叫 blink.grow，不呼叫 blink.part；整棟白光就是那道 glow）
const spyOn = blink => {
  const calls = [];
  for (const fn of ['part', 'grow']) { const orig = blink[fn]; blink[fn] = (o, ...rest) => { calls.push([fn, o]); return orig(o, ...rest); }; }
  return calls;
};
const matsOf = o => { const out = []; o.traverse(m => { if (m.isMesh) out.push(m.material); }); return out; };
test('commit reveals the fresh part and grows it without a glow; the old part is dropped', () => {
  const { stage, parts, blink } = setup(); stage.apply(placed); const old = parts()[0];
  stage.apply(grow(3), { deferred: true }); const fresh = stage.partObject('milk.main'), own = matsOf(fresh), calls = spyOn(blink);
  stage.commit('milk.main');
  assert.deepEqual(calls, [['grow', fresh]], 'grow is called, part is not');
  assert.ok(!parts().includes(old), 'replaced: old dropped at once'); assert.ok(!blink.has(old), 'replaced: the old part does not shrink');
  assert.deepEqual(old.scale.toArray(), [1, 1, 1]); assert.equal(fresh.visible, true); assert.ok(blink.has(fresh)); assert.equal(blink.count, 1);
  assert.deepEqual(matsOf(fresh), own, 'its own materials: no glow');
  const y0 = fresh.position.y;
  assert.ok(Math.abs(fresh.scale.y - 0.15) < 1e-9, 'the fresh part grows from 0.15x high'); assert.equal(fresh.scale.x, 1); assert.equal(fresh.scale.z, 1);
  stage.commit('milk.lamp'); assert.equal(blink.count, 2); assert.deepEqual(calls.map(([fn]) => fn), ['grow', 'grow']);
  blink.update(GROW_HOLD - 0.01); assert.ok(Math.abs(fresh.scale.y - 0.15) < 1e-9, `still a stub during the hold (${fresh.scale.y.toFixed(2)})`);
  blink.update(0.31); assert.ok(fresh.scale.y > 0.5 && fresh.scale.y < 1, `growing (${fresh.scale.y.toFixed(2)})`); assert.equal(fresh.position.y, y0, 'from its base: the position does not move');
  assert.deepEqual(matsOf(fresh), own, 'never glows while it grows');
  blink.update(GROW_DUR); assert.equal(blink.count, 0); assert.deepEqual(fresh.scale.toArray(), [1, 1, 1]);
});
// 只有建築會長（協調者裁決，stage.js growsOn）：footprint false 的、不是 compound／glb／campus 的、tagAlong 點綴不長；grow: true／false 蓋過（tagAlong 不行）。
// 計畫 11 §設計 1／裁決 R15、使用者 2026-10-31「閃一下」：舞台的 commit 從不亮（不呼叫 blink.part）；會長的只 grow，其餘直接出現——不長、blink 不管它
test('only buildings grow and nothing glows on commit: footprint false, other kinds and tagAlong parts just appear; an explicit grow flag overrides', () => {
  const box = extra => ({ kind: 'compound', at, parts: [{ kind: 'box', pos: [0, 0.2, 0], scale: 0.4, color: 0xfff8f4 }], ...extra });
  const cases = { 'milk.a': [box({ footprint: false }), false], 'milk.b': [box({ tagAlong: true }), false], 'milk.c': [box({ footprint: { r: 0.3 }, grow: false }), false],
    'milk.d': [box({ footprint: false, grow: true }), true], 'milk.e': [box({}), true], 'milk.f': [box({ footprint: { r: 0.3 } }), true],
    'milk.g': [box({ tagAlong: true, grow: true }), false] };
  const mod = { id: 'milk', labelY: 1, view: lv => (lv.milk >= 1 ? Object.fromEntries(Object.entries(cases).map(([k, [v]]) => [k, v])) : {}) };
  const { stage, blink } = setup([mod]); stage.apply(placed, { deferred: true }); const calls = spyOn(blink);
  for (const [k, [v, grows]] of Object.entries(cases)) {
    const o = stage.partObject(k), mats = matsOf(o), n = calls.length; stage.commit(k);
    assert.equal(growsOn(v), grows, `${k} growsOn`); assert.equal(o.visible, true, `${k} shown`);
    assert.deepEqual(matsOf(o), mats, `${k} keeps its own materials (no glow)`);
    if (grows) { assert.deepEqual(calls.slice(n), [['grow', o]], `${k} grows, no part`); assert.ok(blink.has(o) && o.scale.y < 1, `${k} grows`); }
    else { assert.deepEqual(calls.slice(n), [], `${k}: neither grow nor part`); assert.ok(!blink.has(o), `${k} just appears`); assert.equal(o.scale.y, 1); }
  }
  assert.ok(!calls.some(([fn]) => fn === 'part'), 'commit never calls blink.part');
  assert.equal(blink.count, Object.values(cases).filter(([, g]) => g).length, 'only the growing parts are in blink');
});
const drop = { kind: 'fx', item: 'milk', cause: 'typhoon', delta: { target: 'milk', from: 3, to: 1 } };   // 3 → 1：燈拿掉、箱子換回白的
// 計畫 11 §設計 1：移除的零件不亮，縮下去（blink.shrink，SHRINK_DUR），縮完才拿掉（回原大小再放掉）
test('a removed part shrinks without a glow and is dropped when the shrink ends', () => {
  const { stage, parts, blink } = setup(); stage.apply(placed); stage.apply(grow(3)); const lamp = stage.partObject('milk.lamp');
  const own = []; lamp.traverse(m => { if (m.isMesh) own.push(m.material); });
  stage.apply(drop, { deferred: true }); assert.ok(parts().includes(lamp), 'old kept while pending');
  stage.commit('milk.lamp'); assert.ok(parts().includes(lamp), 'still there, shrinking'); assert.ok(blink.has(lamp)); assert.ok(!stage.pendingKeys().includes('milk.lamp'));
  assert.ok(!lit(blink, lamp), 'no glow'); const mats = []; lamp.traverse(m => { if (m.isMesh) mats.push(m.material); }); assert.deepEqual(mats, own);
  blink.update(0.1); assert.ok(parts().includes(lamp)); assert.ok(lamp.scale.y < 1 && lamp.scale.y > 0.15, `shrinking (${lamp.scale.y.toFixed(2)})`);
  blink.update(SHRINK_DUR - 0.1 + 0.01); assert.ok(!parts().includes(lamp), 'dropped after the shrink'); assert.equal(blink.count, 0);
  assert.deepEqual(lamp.scale.toArray(), [1, 1, 1], 'back to its own scale before it went');
});
// 計畫 9 任務 4（任務 2 延後的小項）：長到一半就被拿掉（下一個套用換掉它）——拿掉之前先收掉 grow，物件回到原本的大小（放回模型池的才不會小一號）
test('a part dropped mid-grow is restored to its own scale before it goes', () => {
  const { stage, parts, blink } = setup(); stage.apply(placed);
  stage.apply(grow(3), { deferred: true }); stage.commit('milk.main'); const fresh = stage.partObject('milk.main');
  blink.update(0.05); assert.ok(fresh.scale.y < 1 && blink.has(fresh), 'mid-grow');
  stage.apply(drop); assert.ok(!parts().includes(fresh), 'swapped out at once');
  assert.deepEqual(fresh.scale.toArray(), [1, 1, 1], 'back to its own scale'); assert.equal(blink.has(fresh), false);
});
test('commitAll commits without blinking and drops a shrinking removal at once, restored first', () => {
  const { stage, parts, blink } = setup(); stage.apply(placed); stage.apply(grow(3)); const lamp = stage.partObject('milk.lamp');
  stage.apply(drop, { deferred: true }); stage.commit('milk.lamp'); assert.equal(blink.count, 1); blink.update(0.1);
  stage.commitAll(); assert.ok(!parts().includes(lamp), 'removal dropped at once'); assert.ok(parts().every(o => o.visible));
  assert.equal(blink.count, 0, 'commitAll blinks nothing and restores the removal before dropping it'); assert.deepEqual(lamp.scale.toArray(), [1, 1, 1]);
});
// 拍照常演完（beats.apply 的 end、回合照常結束）：commitAll({ shrinking: true }) 讓縮到一半的零件縮完自己走——不在 0.15 s 的拍尾截斷成半截再消失
test('commitAll({ shrinking: true }) commits the rest but lets a shrinking removal finish on its own', () => {
  const { stage, parts, blink } = setup(); stage.apply(placed); stage.apply(grow(3)); const lamp = stage.partObject('milk.lamp');
  stage.apply(drop, { deferred: true }); stage.commit('milk.lamp'); blink.update(0.1);
  stage.commitAll({ shrinking: true }); assert.deepEqual(stage.pendingKeys(), []); assert.ok(parts().includes(lamp), 'still shrinking'); assert.ok(blink.has(lamp));
  blink.update(SHRINK_DUR); assert.ok(!parts().includes(lamp), 'gone once the shrink is over');
});
test('reset drops a part that is shrinking out, restored first', () => {
  const { stage, parts, blink } = setup(); stage.apply(placed); stage.apply(grow(3)); const lamp = stage.partObject('milk.lamp');
  stage.apply(drop, { deferred: true }); stage.commit('milk.lamp'); blink.update(0.1); stage.reset();
  assert.ok(!parts().includes(lamp)); assert.deepEqual(lamp.scale.toArray(), [1, 1, 1], 'restored before it was dropped'); assert.equal(blink.count, 0); assert.deepEqual(stage.partKeys(), []);
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
// 唯一正解修正輪 1：颱風放下不再是回合狀態（舊的 meta.landing 拿掉了；躲雨是放下劇本裡的一小段）
test('the typhoon placed event sets no turn state: meta has only total, bitten and the trouble spot', () => {
  const { stage } = setup([fakeMilk]);
  stage.apply({ kind: 'placed', item: 'typhoon', to: 1 });
  assert.equal(stage.meta.landing, undefined);
  stage.apply({ kind: 'settle' }); assert.deepEqual(Object.keys(stage.meta).sort(), ['bitten', 'total', 'trouble', 'troubleAt']);
});

// 唯一正解 §5.2 老鼠當指標：settle 結算 meta.trouble——照 ORDER 第一個被鎖的（停電→燈泡、淹水→代幣、巨蛋淹水→棒球），
// 沒有就這回合 wait 事件裡第一個等幫手的物品（老鼠自己除外），都沒有就 null
const LV = { milk: 3, chip: 2, bulb: 2, token: 3, typhoon: 3, rat: 1, boba: 0, baseball: 2 };
test('troubleOf: a locked item beats any waiting one, first in ORDER (blackout bulb before flooded token before domeFlood baseball)', () => {
  const waits = [{ item: 'milk', for: ['baseball'] }];
  assert.equal(troubleOf(LV, { flooded: true, domeFlood: true }, waits, spec), 'token');
  assert.equal(troubleOf(LV, { domeFlood: true, flooded: true, blackout: true }, waits, spec), 'bulb');
  assert.equal(troubleOf(LV, { domeFlood: true }, waits, spec), 'baseball');
});
test('troubleOf: no lock → the first waiting item of the wait event', () => {
  assert.equal(troubleOf(LV, { milkExpired: true }, [{ item: 'chip', for: ['bulb'] }, { item: 'token', for: ['milk'] }], spec), 'chip');
});
test('troubleOf: nothing locked, nothing waiting → null', () => {
  assert.equal(troubleOf(LV, {}, [], spec), null);
  assert.equal(troubleOf(LV, {}, null, spec), null);
});
test('troubleOf: the rat waiting for its own helper is not trouble', () => {
  assert.equal(troubleOf(LV, {}, [{ item: 'rat', for: ['token'] }], spec), null);
  assert.equal(troubleOf(LV, {}, [{ item: 'rat', for: ['token'] }, { item: 'boba', for: ['token'] }], spec), 'boba');
});
test('settle folds the wait event of its turn into meta.trouble (+ the spot in front of that building) and forgets it after', async () => {
  const chip = await import('../src/actors/chip.js'), { frontOf, anchorWorld } = await import('../src/actors/anchors.js');
  const { stage } = setup([fakeMilk, chip]);
  stage.apply({ kind: 'placed', item: 'chip', to: 1 }); stage.apply({ kind: 'grow', item: 'chip', from: 1, to: 2 });
  stage.apply({ kind: 'wait', item: 'chip', waits: [{ item: 'rat', for: ['token'] }, { item: 'chip', for: ['bulb'] }] });
  assert.equal(stage.meta.trouble, null, 'the wait event alone does not settle anything');
  stage.apply({ kind: 'settle' });
  const sp = chip.visitSpot(2, { lv: stage.lv, flags: stage.flags });
  assert.equal(stage.meta.trouble, 'chip'); assert.deepEqual(stage.meta.troubleAt, troubleSpot('chip', stage.lv, stage.flags, [chip]));
  stage.apply({ kind: 'settle' });
  assert.equal(stage.meta.trouble, null, 'the next turn had no wait event'); assert.equal(stage.meta.troubleAt, null);
  // 沒有 visitSpot（颱風、離島那一級）→ 錨點（錨點離格心 > TROUBLE_IN 時照樣沿格心方向拉回 1.3）
  const ty = troubleSpot('typhoon', { ...LV }, {}, [fakeMilk]), ta = anchorWorld('typhoon');
  assert.ok(Math.abs(ty.x / ta.x - ty.z / ta.z) < 1e-9 && Math.hypot(ty.x, ty.z) <= 1.3 + 1e-9, `the typhoon anchor pulled toward the centre cell's heart (${ty.x.toFixed(2)}, ${ty.z.toFixed(2)})`);
  stage.apply({ kind: 'wait', item: 'milk', waits: [{ item: 'milk', for: ['baseball'] }] }); stage.reset();
  stage.apply({ kind: 'settle' }); assert.equal(stage.meta.trouble, null, 'reset forgets the wait event too');
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
test('a turn with nothing but settle also ends the bite', () => {
  const { stage } = setup([fakeMilk]);
  stage.apply(placed); stage.apply({ kind: 'grow', item: 'milk', from: 1, to: 2 });
  stage.apply({ kind: 'fx', item: 'rat', cause: 'rat', delta: { target: 'milk', from: 2, to: 1 } });
  stage.apply({ kind: 'settle' }); stage.apply({ kind: 'settle' });
  assert.equal(stage.meta.bitten, false);
});

// 協調者裁決（修正批次 2）：整局列舉——正解、外星壞局、攤車被吹走那局的每一個事件之後，所有演員 view 裡會長的零件都是建築
// （compound／glb／campus、footprint 不是 false、不是 tagAlong）；雨、雲、堤防、彩虹、霓虹、軌道與列車、UFO、光環、被吹走的攤車都不長
test('every actor view through the solution, the alien game and a blown-cart game: only footprint-bearing buildings grow', async () => {
  const { growsOn } = await import('../src/actors/stage.js'), { ALL } = await import('./helpers/show.js');
  const engine = await import('../src/rules/engine.js'), { enumerate, stats } = await import('../src/solver/run.js');
  const all = enumerate(spec), orders = [stats(all, spec).full[0].order, all.find(r => r.ending.id === 'alien').order, ['milk', 'boba', 'baseball', 'typhoon', 'chip', 'bulb', 'token', 'rat']];
  const growing = new Map(), still = new Set(), NEVER = k => k === 'typhoon.main' || k.split('.').slice(1).some(seg => /^(rain|levee|rainbow|neon|track|train|ufo|rocksRing|blown|cable|cables|scooter|fleet|ferry|shield)$/i.test(seg));
  for (const order of orders) {
    let s = engine.createState(spec), view = { lv: s.lv, flags: {} };
    for (const step of [...order.map(id => x => engine.place(x, id, spec)), x => engine.advance(x, spec)]) {
      const r = step(s); s = r.state;
      for (const e of r.events) {
        view = engine.foldEvent(view, e);
        for (const mod of ALL) for (const [k, p] of Object.entries(mod.view(view.lv, view.flags, {}) ?? {})) {
          if (p.kind === 'roster') continue;
          if (growsOn(p)) growing.set(k, p.kind); else still.add(k);
        }
      }
    }
  }
  for (const [k] of growing) {
    assert.ok(!NEVER(k), `${k} is not a building but grows`);
  }
  for (const k of ['typhoon.rain', 'typhoon.main', 'typhoon.levee', 'typhoon.rainbow', 'boba.main']) assert.ok(still.has(k) || growing.has(k), `${k} seen`);
  assert.ok(!growing.has('typhoon.levee') && !growing.has('typhoon.rainbow') && !growing.has('typhoon.rain'), 'weather and the levee only glow');
  assert.ok(growing.has('milk.main') && growing.has('chip.main') && growing.has('baseball.main'), 'the buildings grow');
  console.log(`# grow: ${[...growing].map(([k, kind]) => `${k}(${kind})`).sort().join(' ')}`);
  console.log(`# glow only: ${[...still].filter(k => !growing.has(k)).sort().join(' ')}`);
});

// 老鼠的散步中心不貼格邊（使用者 2026-11-01 截圖：路燈的門口點落在橋頭，老鼠一直走上橋）：每個物品每一級的 troubleSpot 離所在格心 ≤ TROUBLE_IN 1.3
// （走路格內切半徑約 1.95、老鼠繞 0.4，留 0.65 餘裕）；本來就在 1.3 內的不動（晶片 Lv2 的正面點照舊）
test('troubleSpot keeps the rats\' wander centre ≤ TROUBLE_IN from the cell centre at every level of every item; nearer spots are untouched', async () => {
  const { ALL } = await import('./helpers/show.js'), { axialToWorld, cellAt } = await import('../src/scene/hex.js'), { frontOf } = await import('../src/actors/anchors.js');
  const spec = await import('../src/rules/spec.js');
  assert.equal(TROUBLE_IN, 1.3);
  let pulled = 0;
  for (const id of spec.ORDER) for (let n = 1; n <= spec.ITEMS[id].max; n++) {
    const lv = Object.fromEntries(spec.ORDER.map(i => [i, 0])); lv[id] = n;
    const p = troubleSpot(id, lv, {}, ALL), cell = cellAt(p.x, p.z); if (!cell) continue;
    const c = axialToWorld(...cell), d = Math.hypot(p.x - c.x, p.z - c.z);
    assert.ok(d <= TROUBLE_IN + 1e-9, `${id} ${n}: ${d.toFixed(2)} from the cell centre`);
    const mod = ALL.find(m => m.id === id), sp = mod.visitSpot?.(n, { lv, flags: {} });
    if (sp) { const f = frontOf(sp, sp.r ?? 0); if (cellAt(f.x, f.z) && Math.hypot(f.x - c.x, f.z - c.z) > TROUBLE_IN) pulled++; else if (cellAt(f.x, f.z)) assert.deepEqual(p, f, `${id} ${n} untouched`); }
  }
  assert.ok(pulled >= 3, `the lamp, the crate and the nest door are pulled in (${pulled})`);
});
