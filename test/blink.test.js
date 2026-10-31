// test/blink.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createPeople } from '../src/scene/people.js';
import { createBlink, GROW_DUR, GROW_HOLD, GROW_PEAK, BLINK, GLOW, SHRINK_DUR, SHRINK_TO} from '../src/show/blink.js';

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
// 修正批次 2（使用者：「建築物升級時只會原地閃爍」）：新零件「長出來」——以零件底部為軸（position 不動），x、z 不動。
// 使用者 2026-10-31「閃一下」：先在 0.15 倍停 GROW_HOLD 0.2 s，再 GROW_DUR 0.6 s 以 smoothstep 長到 1，只在最後 25 %（0.65 s 之後）衝過頭到 1.04 再落回 1；共 0.8 s 都算 has()
test('grow: scale.y holds at 0.15 for GROW_HOLD, then eases in and out over GROW_DUR, overshooting to 1.04 only in the last quarter; the base stays put', () => {
  assert.equal(GROW_DUR, 0.6); assert.equal(GROW_HOLD, 0.2); assert.equal(GROW_PEAK, 1.04);
  const blink = createBlink(THREE, { people: createPeople(THREE, { max: 2 }) });
  for (const start of [[1, 1, 1], [1.2, 0.8, 1.2]]) {
    const o = new THREE.Group(); o.scale.set(...start); o.position.set(1, 0.65, 2);
    blink.grow(o); assert.ok(blink.has(o)); assert.equal(blink.count, 1);
    assert.ok(Math.abs(o.scale.y - start[1] * 0.15) < 1e-9, `0.15x at t = 0 (${o.scale.y})`);
    assert.equal(o.scale.x, start[0]); assert.equal(o.scale.z, start[2]);
    const at = new Map(), dt = 1 / 120;
    let peak = 0, peakAt = 0, prev = o.scale.y, rising = true, maxBefore = 0;
    for (let i = 1; i * dt < GROW_HOLD + GROW_DUR - 1e-9; i++) {
      blink.update(dt); const t = i * dt, k = o.scale.y / start[1];
      for (const q of [0.1, 0.2, 0.5]) if (Math.abs(t - q) < 1e-9) at.set(q, k);
      if (k > peak) { peak = k; peakAt = t; }
      if (t <= 0.65 + 1e-9) maxBefore = Math.max(maxBefore, k);
      if (t <= GROW_HOLD + 1e-9) assert.ok(Math.abs(k - 0.15) < 1e-9, `still a stub during the hold (t ${t.toFixed(3)}: ${k.toFixed(3)})`);
      if (rising && o.scale.y < prev - 1e-12) rising = false; prev = o.scale.y;
      assert.deepEqual(o.position.toArray(), [1, 0.65, 2], 'the base stays put'); assert.equal(o.scale.x, start[0]);
      assert.ok(blink.has(o), `still growing at ${t.toFixed(3)}`);
    }
    assert.ok(Math.abs(at.get(0.1) - 0.15) < 1e-9 && Math.abs(at.get(0.2) - 0.15) < 1e-9, 'a stub at 0.1 s and 0.2 s');
    // 0.5 s＝長高那段的正中間：smoothstep 0.5 → 0.15 + 0.85 × 0.5
    assert.ok(Math.abs(at.get(0.5) - 0.575) < 1e-9, `halfway up at 0.5 s (${at.get(0.5).toFixed(4)})`);
    assert.ok(maxBefore < 1, `no overshoot before 0.65 s (${maxBefore.toFixed(4)})`);
    assert.ok(peak <= GROW_PEAK + 1e-6 && peak > 1.035 && peakAt > 0.65, `overshoots to 1.04 after 0.65 s (${peak.toFixed(4)} at ${peakAt.toFixed(3)} s)`);
    assert.ok(!rising, 'and settles back');
    blink.update(dt);
    assert.deepEqual(o.scale.toArray(), start, 'exactly the starting scale at 0.8 s'); assert.ok(!blink.has(o)); assert.equal(blink.count, 0);
  }
});
// 一開始慢：起步那 0.1 s（30 fps 三幀）只長 ≤ 0.1 倍——舊曲線 ease-out-back 在同一段長到 0.72
test('grow starts gently: 0.1 s into the rise it is still under a quarter high', () => {
  const blink = createBlink(THREE, { people: createPeople(THREE, { max: 2 }) }), o = new THREE.Group();
  blink.grow(o); blink.update(GROW_HOLD + 0.1);
  assert.ok(o.scale.y < 0.25, `${o.scale.y.toFixed(3)}`);
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

// 計畫 11 §設計 1：縮下去（要拿掉的零件不亮）——scale.y 從呼叫時的大小以 ease-in 花 SHRINK_DUR 縮到 SHRINK_TO 倍，x、z 不動，材質不換；
// 軸是零件自己的底（包圍盒最低點）：原點就是底的建築 position 不動；畫在高處的（雲：原點在地面、本體在 3 公尺高）在自己的底部壓扁、不掉到地上。
// 縮的期間 has() 為真；時間到先回原大小、原位置再呼叫 onEnd（舞台在 onEnd 拿掉它）
const boxAt = y => { const g = new THREE.Group(), a = new THREE.MeshStandardMaterial({ color: 0xdb6a41 }), m = new THREE.Mesh(new THREE.BoxGeometry(), a); m.position.y = y; g.add(m); return { g, a, m }; };
const bottom = o => new THREE.Box3().setFromObject(o).min.y;
test('shrink: scale.y eases in to 0.15x over SHRINK_DUR with no glow and its own bottom fixed; has() while shrinking; then scale and position come back and onEnd runs', () => {
  assert.equal(SHRINK_DUR, 0.2); assert.equal(SHRINK_TO, 0.15);
  const blink = createBlink(THREE, { people: createPeople(THREE, { max: 2 }) }), parent = new THREE.Group();
  // 建築（底在原點：box 從 0 蓋到 1）、雲（原點在地面、本體在 2.5–3.5）
  for (const [name, y0, keepsPosition] of [['building', 0.5, true], ['cloud', 3, false]]) {
    const x = boxAt(y0), ends = []; parent.add(x.g); x.g.scale.set(1.2, 0.8, 1.2); x.g.position.set(1, 0.65, 2);
    const foot = bottom(x.g);
    blink.shrink(x.g, undefined, () => ends.push([x.g.scale.toArray(), x.g.position.toArray()]));
    assert.ok(blink.has(x.g)); assert.equal(blink.count, 1); assert.equal(x.g.scale.y, 0.8, `${name}: full height at t = 0`);
    let prev = 0.8, t = 0;
    for (; t + 1 / 60 < SHRINK_DUR - 1e-9; ) {
      blink.update(1 / 60); t += 1 / 60;
      const k = x.g.scale.y / 0.8, want = 1 - (1 - SHRINK_TO) * (t / SHRINK_DUR) ** 2;
      assert.ok(Math.abs(k - want) < 1e-9, `${name}: ease-in at ${t.toFixed(3)} s: ${k.toFixed(4)} vs ${want.toFixed(4)}`);
      assert.ok(x.g.scale.y < prev, 'keeps shrinking'); prev = x.g.scale.y;
      assert.ok(Math.abs(bottom(x.g) - foot) < 1e-9, `${name}: its bottom stays put (${bottom(x.g).toFixed(3)} vs ${foot.toFixed(3)})`);
      assert.equal(x.g.position.x, 1); assert.equal(x.g.position.z, 2); assert.equal(x.g.scale.x, 1.2); assert.equal(x.g.scale.z, 1.2);
      if (keepsPosition) assert.ok(Math.abs(x.g.position.y - 0.65) < 1e-9, 'a building shrinks about its origin');
      else assert.ok(bottom(x.g) > 2.5, 'a cloud squashes up in the sky, it does not fall to the ground');
      assert.equal(x.m.material, x.a, 'no glow: its own material'); assert.ok(blink.has(x.g)); assert.deepEqual(ends, []);
    }
    assert.ok(prev / 0.8 < 0.3, `${name}: nearly flat at the end (${(prev / 0.8).toFixed(2)})`);
    blink.update(1 / 60);
    assert.deepEqual(ends, [[[1.2, 0.8, 1.2], [1, 0.65, 2]]], `${name}: onEnd once, after scale and position came back`); assert.ok(!blink.has(x.g)); assert.equal(blink.count, 0);
  }
});
test('stop and clear end a shrink at once: the scale comes back and onEnd runs once; a shrink over a grow starts from the full scale', () => {
  const blink = createBlink(THREE, { people: createPeople(THREE, { max: 2 }) }), x = twoMeshes(), y = twoMeshes(), z = twoMeshes(), ends = [];
  for (const o of [x, y, z]) o.g.position.y = 0.7;   // 縮的軸在自己的底：中途與還原後 position.y 都要回到 0.7
  blink.shrink(x.g, 0.2, () => ends.push('x')); blink.shrink(y.g, 0.2, () => ends.push('y')); blink.update(0.1);
  assert.ok(x.g.scale.y < 1 && y.g.scale.y < 1);
  blink.stop(x.g); assert.deepEqual(x.g.scale.toArray(), [1, 1, 1]); assert.equal(x.g.position.y, 0.7, 'stop: position.y restored'); assert.deepEqual(ends, ['x']); assert.ok(!blink.has(x.g)); assert.ok(blink.has(y.g));
  blink.stop(x.g); assert.deepEqual(ends, ['x'], 'stopping twice is harmless');
  blink.clear(); assert.deepEqual(y.g.scale.toArray(), [1, 1, 1]); assert.equal(y.g.position.y, 0.7, 'clear: position.y restored'); assert.deepEqual(ends, ['x', 'y']); assert.equal(blink.count, 0);
  blink.grow(z.g); blink.update(0.05); assert.ok(z.g.scale.y < 0.5, 'mid-grow');
  blink.shrink(z.g, 0.2, () => ends.push('z')); assert.equal(z.g.scale.y, 1, 'the grow is ended first: shrinks from its own height'); assert.equal(blink.count, 1);
  blink.update(0.25); assert.deepEqual(z.g.scale.toArray(), [1, 1, 1]); assert.equal(z.g.position.y, 0.7, 'finished: position.y restored'); assert.deepEqual(ends, ['x', 'y', 'z']);
});
