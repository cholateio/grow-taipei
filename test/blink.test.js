// test/blink.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createPeople } from '../src/scene/people.js';
import { createBlink, GROW_DUR, GROW_HOLD, BLINK, GLOW } from '../src/show/blink.js';

const twoMeshes = () => {
  const g = new THREE.Group(), a = new THREE.MeshStandardMaterial({ color: 0xdb6a41 }), b = new THREE.MeshBasicMaterial({ color: 0x5a88b2 });
  const inner = new THREE.Group(); inner.add(new THREE.Mesh(new THREE.BoxGeometry(), b));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(), a), inner);
  return { g, a, b, meshes: () => { const out = []; g.traverse(o => { if (o.isMesh) out.push(o); }); return out; } };
};
const colourOf = (people, name, i) => { const c = new THREE.Color(); people.group.getObjectByName(`people:${name}`).getColorAt(i, c); return c.getHex(); };

// 亮一下（計畫 9 §4）：每個 mesh 換成原材質的複本，複本 emissive 白、強度從 GLOW 以 ease-out 降到 0；
// 沒有 emissive 的（MeshBasicMaterial）改把 color 往白 lerp；時間到換回原材質、複本 dispose。沒有任何純白材質
const watchDispose = mats => { const seen = new Set(); for (const m of mats) m.addEventListener('dispose', () => seen.add(m)); return seen; };
test('part glows: each mesh gets a clone, emissive intensity eases from GLOW to 0, then the originals come back and the clones are disposed', () => {
  assert.equal(BLINK, 0.15); assert.equal(GLOW, 0.35);
  const blink = createBlink(THREE, { people: createPeople(THREE, { max: 2 }) }), { g, a, b, meshes } = twoMeshes();
  blink.part(g); assert.equal(blink.count, 1); assert.ok(blink.has(g));
  const [m1, m2] = meshes(), c1 = m1.material, c2 = m2.material;
  assert.notEqual(c1, a); assert.notEqual(c2, b); assert.notEqual(c1.uuid, a.uuid, 'a clone, not the original');
  assert.ok(c1.isMeshStandardMaterial && c2.isMeshBasicMaterial, 'same kind of material as the original');
  assert.equal(c1.color.getHex(), 0xdb6a41, 'the standard clone keeps its colour; only emissive lights it');
  assert.equal(c1.emissive.getHex(), 0xffffff); assert.ok(Math.abs(c1.emissiveIntensity - GLOW) < 1e-6, 't = 0 at full GLOW');
  assert.equal(a.emissive.getHex(), 0, 'the original is never touched'); assert.equal(a.emissiveIntensity, 1);
  const disposed = watchDispose([c1, c2]);
  blink.update(0.1); assert.equal(m1.material, c1, 'same clone the whole time');
  assert.ok(c1.emissiveIntensity > 0 && c1.emissiveIntensity < GLOW, `fading at 0.1 s (${c1.emissiveIntensity})`);
  blink.update(0.06); assert.deepEqual([m1.material, m2.material], [a, b]); assert.equal(blink.count, 0); assert.ok(!blink.has(g));
  assert.ok(disposed.has(c1) && disposed.has(c2), 'both clones disposed'); assert.ok(!a.emissive.getHex() && a.emissiveIntensity === 1);
});
test('a material without emissive (MeshBasicMaterial) lerps its colour toward white instead, never reaching white', () => {
  const blink = createBlink(THREE, { people: createPeople(THREE, { max: 2 }) }), { g, b, meshes } = twoMeshes();
  blink.part(g); const c = meshes()[1].material, start = c.color.clone(), lum = col => col.r + col.g + col.b;
  assert.ok(lum(start) > lum(b.color), 'brighter than the original at t = 0'); assert.notEqual(start.getHex(), 0xffffff, 'not pure white');
  assert.ok(Math.abs(start.r - (b.color.r + (1 - b.color.r) * GLOW)) < 1e-6, 'GLOW of the way to white');
  blink.update(0.1); assert.ok(lum(c.color) > lum(b.color) && lum(c.color) < lum(start), 'fading back');
  blink.update(0.06); assert.equal(meshes()[1].material, b); assert.equal(b.color.getHex(), 0x5a88b2, 'original colour object untouched');
});
test('shared material: two meshes share one material, only the blinked object glows', () => {
  const blink = createBlink(THREE, { people: createPeople(THREE, { max: 2 }) }), shared = new THREE.MeshStandardMaterial({ color: 0xdb6a41 });
  const lit = new THREE.Mesh(new THREE.BoxGeometry(), shared), other = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  blink.part(lit); assert.notEqual(lit.material, shared); assert.equal(other.material, shared, 'the other mesh keeps the shared original');
  assert.equal(shared.emissive.getHex(), 0); blink.update(0.16); assert.equal(lit.material, shared);
});
test('a glowing (lit) material keeps its own glow and adds the white on top; onBeforeCompile carries over to the clone', () => {
  const blink = createBlink(THREE, { people: createPeople(THREE, { max: 2 }) }), hook = () => {};
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfcea8b, emissive: 0xfcea8b, emissiveIntensity: 2 }); lamp.onBeforeCompile = hook; lamp.customProgramCacheKey = () => 'k';
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), lamp); blink.part(mesh); const c = mesh.material;
  assert.equal(c.onBeforeCompile, hook); assert.equal(c.customProgramCacheKey(), 'k');
  const own = new THREE.Color(0xfcea8b).multiplyScalar(2);
  assert.ok(c.emissive.r * c.emissiveIntensity >= own.r - 1e-6 && c.emissive.b * c.emissiveIntensity > own.b + 0.3, 'own glow plus the white');
  lamp.emissiveIntensity = 0; blink.update(0.05);   // 大停電／白天：原材質的強度被調掉，複本跟著（只剩白光那份）
  assert.ok(c.emissive.r * c.emissiveIntensity < GLOW + 1e-6);
  blink.update(0.2); assert.equal(mesh.material, lamp); assert.equal(lamp.emissive.getHex(), 0xfcea8b);
});
test('a part blinked again while glowing keeps its original materials and restarts the timer without cloning again', () => {
  const blink = createBlink(THREE, { people: createPeople(THREE, { max: 2 }) }), { g, a, b, meshes } = twoMeshes();
  blink.part(g); const clone = meshes()[0].material; blink.update(0.1); blink.part(g); assert.equal(blink.count, 1);
  assert.equal(meshes()[0].material, clone, 'no second clone'); assert.ok(Math.abs(clone.emissiveIntensity - GLOW) < 1e-6, 'back to full');
  blink.update(0.1); assert.notEqual(meshes()[0].material, a, 'timer restarted');
  blink.update(0.06); assert.deepEqual(meshes().map(m => m.material), [a, b]);
});
// 計畫 9 任務 4（任務 2 延後的小項）：巢狀——子零件先亮、父零件再亮（或反過來），後來的跳過正在亮的 mesh，不複製複本；
// 不管誰先結束，最後每個 mesh 都回到自己的原材質，沒有留著已 dispose 的複本
test('nested parts: the later blink skips meshes already glowing; whichever ends first, every mesh gets its original back', () => {
  for (const childFirst of [true, false]) {
    const blink = createBlink(THREE, { people: createPeople(THREE, { max: 2 }) }), { g, a, b, meshes } = twoMeshes(), inner = g.children[1];
    blink.part(childFirst ? inner : g, BLINK);
    const first = meshes().map(m => m.material);
    blink.update(0.05);
    blink.part(childFirst ? g : inner, BLINK);
    meshes().forEach((m, i) => { if (first[i] !== a && first[i] !== b) assert.equal(m.material, first[i], 'a mesh already glowing keeps the same clone (no clone of a clone)'); });
    for (let k = 0; k < 10; k++) blink.update(0.05);
    const [m1, m2] = meshes();
    assert.equal(m1.material, a, `${childFirst ? 'child first' : 'parent first'}: outer mesh back to its original`);
    assert.equal(m2.material, b, `${childFirst ? 'child first' : 'parent first'}: inner mesh back to its original`);
    assert.equal(blink.count, 0);
  }
});
// 修正批次 2（使用者：「建築物升級時只會原地閃爍」）：新零件「長出來」——以零件底部為軸（position 不動），x、z 不動；
// 協調者裁決：先在 0.15 倍停 GROW_HOLD（＝亮一下的 BLINK，發亮的矮樁），再 GROW_DUR（0.5 s）以 ease-out-back 長到 1.06、回 1；共 0.65 s 都算 has()
test('grow: scale.y holds at 0.15 for GROW_HOLD (the glow), then rises over GROW_DUR to an overshoot of 1.06 and settles at 1; the base stays put', () => {
  assert.equal(GROW_DUR, 0.5); assert.equal(GROW_HOLD, 0.15); assert.equal(GROW_HOLD, BLINK);
  const blink = createBlink(THREE, { people: createPeople(THREE, { max: 2 }) });
  for (const start of [[1, 1, 1], [1.2, 0.8, 1.2]]) {
    const o = new THREE.Group(); o.scale.set(...start); o.position.set(1, 0.65, 2);
    blink.grow(o); assert.ok(blink.has(o)); assert.equal(blink.count, 1);
    assert.ok(Math.abs(o.scale.y - start[1] * 0.15) < 1e-9, `0.15x at t = 0 (${o.scale.y})`);
    assert.equal(o.scale.x, start[0]); assert.equal(o.scale.z, start[2]);
    let peak = 0, prev = o.scale.y, rising = true, t = 0;
    for (; t < GROW_HOLD + GROW_DUR - 0.03; t += 1 / 60) {
      blink.update(1 / 60); const k = o.scale.y / start[1]; peak = Math.max(peak, k);
      if (t + 1 / 60 <= GROW_HOLD - 1e-9) assert.ok(Math.abs(k - 0.15) < 1e-9, `still a stub during the glow (t ${(t + 1 / 60).toFixed(3)}: ${k.toFixed(3)})`);
      if (rising && o.scale.y < prev - 1e-12) rising = false; prev = o.scale.y;
      assert.deepEqual(o.position.toArray(), [1, 0.65, 2], 'the base stays put'); assert.equal(o.scale.x, start[0]);
      assert.ok(blink.has(o), 'still growing');
    }
    assert.ok(Math.abs(peak - 1.06) < 0.005, `overshoots to 1.06 (${peak.toFixed(4)})`); assert.ok(!rising, 'and settles back');
    for (let i = 0; i < 3; i++) blink.update(1 / 60);
    assert.deepEqual(o.scale.toArray(), start, 'exactly the starting scale after GROW_HOLD + GROW_DUR'); assert.ok(!blink.has(o)); assert.equal(blink.count, 0);
  }
});
test('a part that glows and grows counts once; the glow still fades in BLINK; stop and clear end the grow at its starting scale', () => {
  const blink = createBlink(THREE, { people: createPeople(THREE, { max: 2 }) }), x = twoMeshes(), y = twoMeshes();
  x.g.scale.set(1, 0.8, 1); blink.part(x.g); blink.grow(x.g); assert.equal(blink.count, 1);
  blink.update(BLINK + 0.01); assert.deepEqual(x.meshes().map(m => m.material), [x.a, x.b], 'the glow is over after BLINK'); assert.ok(blink.has(x.g), 'still growing');
  blink.grow(y.g, 5); assert.equal(blink.count, 2);
  blink.stop(x.g); assert.deepEqual(x.g.scale.toArray(), [1, 0.8, 1]); assert.ok(!blink.has(x.g));
  blink.update(0.1); blink.clear(); assert.deepEqual(y.g.scale.toArray(), [1, 1, 1]); assert.equal(blink.count, 0);
});
test('part calls onEnd when the blink ends, by update or clear', () => {
  const blink = createBlink(THREE, { people: createPeople(THREE, { max: 2 }) }), ends = [];
  blink.part(twoMeshes().g, BLINK, () => ends.push('a')); blink.part(twoMeshes().g, 0.3, () => ends.push('b'));
  blink.update(0.16); assert.deepEqual(ends, ['a']); blink.clear(); assert.deepEqual(ends, ['a', 'b']);
});
test('walker blinks via people.flashInstance and repaints after', () => {
  const people = createPeople(THREE, { max: 4 }), blink = createBlink(THREE, { people });
  const w = people.spawn({ controlled: true, shirt: 0xdb6a41 }), other = people.spawn({ controlled: true, shirt: 0x5a88b2 });
  blink.walker(w); assert.equal(blink.count, 1);
  assert.equal(colourOf(people, 'body', 0), 0xffffff); assert.equal(colourOf(people, 'head', 0), 0xffffff); assert.equal(colourOf(people, 'body', 1), 0x5a88b2, 'others untouched');
  w.setAccessory('cap'); assert.equal(colourOf(people, 'body', 0), 0xffffff, 'repaint keeps the blink');
  blink.update(0.16); assert.equal(colourOf(people, 'body', 0), 0xdb6a41); assert.equal(blink.count, 0);
  assert.equal(other.shirt, 0x5a88b2);
});
test('a blinking walker removed mid-blink is harmless; others keep their colours', () => {
  const people = createPeople(THREE, { max: 4 }), blink = createBlink(THREE, { people });
  const w = people.spawn({ controlled: true, shirt: 0xdb6a41 }), other = people.spawn({ controlled: true, shirt: 0x5a88b2 });
  blink.walker(other); blink.walker(w); w.remove();
  assert.equal(colourOf(people, 'body', 0), 0xffffff, 'the survivor (now index 0) stays white after the repaint');
  blink.update(0.2); assert.equal(colourOf(people, 'body', 0), 0x5a88b2); assert.equal(blink.count, 0);
});
test('stop ends one blink at once and calls its onEnd; the others keep going', () => {
  const people = createPeople(THREE, { max: 2 }), blink = createBlink(THREE, { people }), x = twoMeshes(), y = twoMeshes(), ends = [];
  const w = people.spawn({ controlled: true, shirt: 0xdb6a41 });
  blink.part(x.g, BLINK, () => ends.push('x')); blink.part(y.g); blink.walker(w);
  blink.stop(x.g); assert.deepEqual(x.meshes().map(m => m.material), [x.a, x.b]); assert.deepEqual(ends, ['x']); assert.equal(blink.count, 2);
  blink.stop(w); assert.equal(colourOf(people, 'body', 0), 0xdb6a41); assert.equal(blink.count, 1);
  blink.stop(x.g); assert.deepEqual(ends, ['x'], 'stopping twice is harmless');
});
test('clear restores at once', () => {
  const people = createPeople(THREE, { max: 2 }), blink = createBlink(THREE, { people }), { g, a, b, meshes } = twoMeshes();
  const w = people.spawn({ controlled: true, shirt: 0xdb6a41 });
  blink.part(g, 5); blink.walker(w, 5); assert.equal(blink.count, 2);
  blink.clear(); assert.equal(blink.count, 0); assert.deepEqual(meshes().map(m => m.material), [a, b]); assert.equal(colourOf(people, 'body', 0), 0xdb6a41);
});
