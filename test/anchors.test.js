import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANCHORS, anchorWorld, LANDMARKS, landmarkWorld, routeBetween, cellOf, cellCentre, frontOf } from '../src/actors/anchors.js';
import { OVERVIEW_DIR } from '../src/scene/camera.js';
import { createNav } from '../src/show/nav.js';
import { WATER_Y } from '../src/scene/hex.js';
import { MAIN_CELLS, axialToWorld, RING_R, cellTop, PLATEAU_TOP, TOP, edgeMidpoint } from '../src/scene/hex.js';
import { ORDER } from '../src/rules/spec.js';
test('every item and the tower have an anchor inside the walking ring of a main-island cell', () => {
  for (const id of [...ORDER, 'tower']) {
    const a = ANCHORS[id]; assert.ok(a, id); assert.ok(MAIN_CELLS.some(c => c[0] === a.cell[0] && c[1] === a.cell[1]), id);
    assert.ok(Math.hypot(a.dx, a.dz) < RING_R - 0.3, id);
    const w = anchorWorld(id), c = axialToWorld(...a.cell); assert.equal(w.y, cellTop(a.cell)); assert.ok(Math.abs(w.x - c.x - a.dx) < 1e-9);
  }
});
test('no two anchors closer than 0.8', () => {
  const ids = Object.keys(ANCHORS);
  for (const a of ids) for (const b of ids) if (a < b) { const p = anchorWorld(a), q = anchorWorld(b); assert.ok(Math.hypot(p.x - q.x, p.z - q.z) >= 0.8, `${a}-${b}`); }
});
test('landmarks sit on their cells: volcano and spring on the plateau, park in the centre, market with the token cell', () => {
  assert.deepEqual(LANDMARKS.volcano.cell, [0, -1]); assert.deepEqual(LANDMARKS.spring.cell, [1, -1]);
  assert.deepEqual(LANDMARKS.park.cell, [0, 0]); assert.deepEqual(LANDMARKS.market.cell, [0, 1]);
  for (const k of Object.keys(LANDMARKS)) assert.ok(Math.hypot(LANDMARKS[k].dx, LANDMARKS[k].dz) < RING_R - 0.3, k);
  assert.equal(landmarkWorld('volcano').y, PLATEAU_TOP);
});
test('routeBetween goes door → bridge head A → bridge head B → destination with per-cell heights', () => {
  const r = routeBetween([1, 0], { x: 4, z: 0.5 }, [0, 0], { x: 0.6, z: -0.3 });
  assert.equal(r.length, 4); assert.equal(r[0].y, TOP); assert.equal(r[3].y, TOP);
  const { a, b } = edgeMidpoint([1, 0], [0, 0], RING_R * Math.sqrt(3) / 2); assert.ok(Math.abs(r[1].x - a.x) < 1e-9); assert.ok(Math.abs(r[2].x - b.x) < 1e-9);
  assert.throws(() => routeBetween([1, 0], { x: 0, z: 0 }, [-1, 0], { x: 0, z: 0 }), /adjacent/);
});
// 鏡頭跟主線（§13.1）：物品與 101 所在的格子、格子的中心（地面高度）
test('cellOf gives the hex cell of an item or the tower; cellCentre is that cell on the ground', () => {
  assert.deepEqual(cellOf('milk'), [-1, 0]); assert.deepEqual(cellOf('tower'), [0, 0]); assert.deepEqual(cellOf('baseball'), [-1, 1]);
  assert.equal(cellOf('turn'), null); assert.equal(cellOf(undefined), null);
  const c = cellOf('milk'); c[0] = 9; assert.deepEqual(cellOf('milk'), [-1, 0], 'a copy, not the table');
  const w = axialToWorld(1, -1); assert.deepEqual(cellCentre([1, -1]), { x: w.x, y: PLATEAU_TOP, z: w.z });
});
// 蓋東西站鏡頭側（§14）：建築 at 往鏡頭方向（OVERVIEW_DIR 的水平分量）r；給 nav 就落到最近的可走點
test('frontOf(at, r) is r from at along the camera direction; with nav it is walkable and within r ± 0.5 of at (dome front lands on the bridge head side, not in water)', () => {
  const d = Math.hypot(OVERVIEW_DIR.x, OVERVIEW_DIR.z), at = anchorWorld('tower'), p = frontOf(at, 1.2);
  assert.ok(Math.abs(Math.hypot(p.x - at.x, p.z - at.z) - 1.2) < 1e-9); assert.equal(p.y, at.y);
  assert.ok(Math.abs((p.x - at.x) / 1.2 - OVERVIEW_DIR.x / d) < 1e-9 && Math.abs((p.z - at.z) / 1.2 - OVERVIEW_DIR.z / d) < 1e-9, 'toward the camera');
  // 巨蛋（橢圓）、101 底座（1.6 方框）、晶片工地（含三角錐約 2.1 × 2.0）的 footprint；另放一個圓剛好蓋住 101 前那一點，nav 要把人挪出去
  const dome = anchorWorld('baseball'), chip = anchorWorld('chip'), raw = frontOf(at, 1.1);
  const nav = createNav(); nav.setFootprints([{ x: dome.x, z: dome.z, rx: 1.15, rz: 0.95 }, { x: at.x, z: at.z, w: 1.6, d: 1.6 }, { x: chip.x, z: chip.z + 0.1, w: 2.1, d: 2.0 }, { x: raw.x, z: raw.z, r: 0.15 }]);
  for (const [id, r] of [['tower', 1.1], ['chip', 1.3], ['baseball', 1.6]]) {
    const a = anchorWorld(id), q = frontOf(a, r, nav), dist = Math.hypot(q.x - a.x, q.z - a.z);
    assert.ok(nav.walkable(q.x, q.z), `${id} front walkable`); assert.ok(Math.abs(dist - r) <= 0.5, `${id} front ${dist.toFixed(2)} from at (r ${r})`);
    assert.ok(q.y > WATER_Y + 0.1, `${id} front not in water`);
  }
  assert.ok(Math.hypot(frontOf(at, 1.1, nav).x - raw.x, frontOf(at, 1.1, nav).z - raw.z) > 0.2, 'moved out of the footprint');
});
