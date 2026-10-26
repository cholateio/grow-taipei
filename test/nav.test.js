// test/nav.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNav, STEP, SEPARATION } from '../src/show/nav.js';
import { axialToWorld, cellTop, R, TOP, PLATEAU_TOP, edgeMidpoint, RING_R } from '../src/scene/hex.js';
const c = cell => ({ ...axialToWorld(...cell), y: cellTop(cell) });
test('cell centres are walkable, water between cells is not, bridges are', () => {
  const nav = createNav();
  assert.ok(nav.walkable(c([0, 0]).x, c([0, 0]).z));
  const { a, b } = edgeMidpoint([0, 0], [1, 0], R);              // 兩格之間的水道中點
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const { a: ba, b: bb } = edgeMidpoint([0, 0], [1, 0], RING_R * Math.sqrt(3) / 2);
  assert.ok(nav.walkable((ba.x + bb.x) / 2, (ba.z + bb.z) / 2), 'bridge deck');
  assert.ok(!nav.walkable(mid.x, mid.z + 1.0), 'water beside the bridge');
  assert.ok(!nav.walkable(0, 40));
});
test('groundY: plateau cell is higher, a stair bridge interpolates between the two heights', () => {
  const nav = createNav(); const p = c([0, -1]);
  assert.equal(nav.groundY(p.x, p.z), PLATEAU_TOP); assert.equal(nav.groundY(0, 0), TOP);
  const { a, b } = edgeMidpoint([0, 0], [0, -1], RING_R * Math.sqrt(3) / 2);
  const y = nav.groundY((a.x + b.x) / 2, (a.z + b.z) / 2); assert.ok(y > TOP && y < PLATEAU_TOP);
});
test('a route between adjacent cells goes over the bridge, never through water, and is string-pulled', () => {
  const nav = createNav(); const from = c([-1, 1]), to = c([-1, 0]);
  const path = nav.route(from, to);
  assert.deepEqual(path[0], from); assert.ok(Math.hypot(path.at(-1).x - to.x, path.at(-1).z - to.z) < 1e-9);
  for (let i = 1; i < path.length; i++) for (let k = 0; k <= 1; k += 0.05) { const x = path[i - 1].x + (path[i].x - path[i - 1].x) * k, z = path[i - 1].z + (path[i].z - path[i - 1].z) * k; assert.ok(nav.walkable(x, z), `off grid at ${x.toFixed(2)},${z.toFixed(2)}`); }
  assert.ok(path.length <= 6, `string-pulled: ${path.length} points`);
});
test('footprints block routes: the path detours around a building and a target inside it lands on its edge', () => {
  const nav = createNav(); const o = c([0, 0]);
  nav.setFootprints([{ x: o.x, z: o.z, r: 0.8 }]);
  assert.ok(!nav.walkable(o.x, o.z));
  const path = nav.route({ x: o.x - 1.6, y: o.y, z: o.z }, { x: o.x + 1.6, y: o.y, z: o.z });
  assert.ok(path.every(p => Math.hypot(p.x - o.x, p.z - o.z) >= 0.8 - 1e-9));
  const end = nav.route({ x: o.x - 1.6, y: o.y, z: o.z }, o).at(-1);
  assert.ok(Math.hypot(end.x - o.x, end.z - o.z) >= 0.8 - 1e-9 && Math.hypot(end.x - o.x, end.z - o.z) < 0.8 + STEP * 1.5);
  nav.setFootprints([{ x: o.x, z: o.z, w: 1.0, d: 0.6 }]); assert.ok(!nav.walkable(o.x + 0.4, o.z)); assert.ok(nav.walkable(o.x + 0.4, o.z + 0.5));
});
test('a start inside water (actor pushed off the island) is rescued to the nearest walkable point', () => {
  const nav = createNav(); const path = nav.route({ x: 0, y: 0, z: 3.2 }, c([0, 0]));
  assert.ok(nav.walkable(path[1].x, path[1].z));
});
test('slots are walkable, distinct and roughly on the circle', () => {
  const nav = createNav(); const o = c([0, 1]); const s = nav.slots(o, 6, 0.9);
  assert.equal(s.length, 6);
  for (const p of s) { assert.ok(nav.walkable(p.x, p.z)); assert.ok(Math.abs(Math.hypot(p.x - o.x, p.z - o.z) - 0.9) < 0.35); assert.equal(p.y, o.y); }
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) assert.ok(Math.hypot(s[i].x - s[j].x, s[i].z - s[j].z) >= SEPARATION - 1e-9);
});
test('wander stays near home and walkable; separate pushes overlapping walkers apart', () => {
  const nav = createNav({ rnd: () => 0.37 }); const o = c([1, 0]);
  const p = nav.wander(o, 1.0); assert.ok(nav.walkable(p.x, p.z) && Math.hypot(p.x - o.x, p.z - o.z) <= 1.0 + 1e-9);
  const a = { pos: { x: 0, y: 0, z: 0 }, walking: true }, b = { pos: { x: 0.1, y: 0, z: 0 }, walking: true }, still = { pos: { x: 0.05, y: 0, z: 0 }, walking: false };
  nav.separate([a, b, still], 0.1);
  assert.ok(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > 0.1); assert.deepEqual(still.pos, { x: 0.05, y: 0, z: 0 });
});
test('a route between two points on the same satellite island is a straight line, not via the main island', async () => {
  const { SATELLITES, axialToWorld } = await import('../src/scene/hex.js');
  const s = SATELLITES.find(x => x.kind === 'playground'), o = axialToWorld(s.q, s.r), nav = createNav();
  const a = { x: o.x - 0.4, y: 0.45, z: o.z }, b = { x: o.x + 0.3, y: 0.45, z: o.z + 1.1 }, r = nav.route(a, b);
  assert.equal(r.length, 2); assert.deepEqual(r[0], a); assert.deepEqual(r[1], b);
  assert.ok(nav.route({ x: 0, y: 0, z: 3.2 }, c([0, 0])).length >= 2, 'water → main island still rescued');
});
// §13.2：名冊成員出場的預設入口——格子邊上離站位最遠、走得到的點
test('edgePoint is the walkable point of the cell farthest from awayFrom, reachable from it, and skips blocked ground', async () => {
  const { cellAt } = await import('../src/scene/hex.js');
  const nav = createNav(), o = c([0, 1]), spot = { x: o.x + 0.8, y: o.y, z: o.z - 0.3 };
  const e = nav.edgePoint([0, 1], spot);
  assert.ok(nav.walkable(e.x, e.z)); assert.deepEqual(cellAt(e.x, e.z), [0, 1]); assert.equal(e.y, nav.groundY(e.x, e.z));
  assert.ok(Math.hypot(e.x - spot.x, e.z - spot.z) >= 1.5, 'at least 1.5 from the spot');
  for (let x = o.x - R; x <= o.x + R; x += STEP) for (let z = o.z - R; z <= o.z + R; z += STEP) {
    if (!nav.walkable(x, z) || String(cellAt(x, z)) !== '0,1') continue;
    assert.ok(Math.hypot(x - spot.x, z - spot.z) <= Math.hypot(e.x - spot.x, e.z - spot.z) + 1e-9, `farther point at ${x.toFixed(2)},${z.toFixed(2)}`);
  }
  // 最遠那一側被建築擋住：挑剩下走得到的點
  nav.setFootprints([{ x: e.x, z: e.z, r: 0.9 }]);
  const e2 = nav.edgePoint([0, 1], spot); assert.ok(nav.walkable(e2.x, e2.z)); assert.ok(Math.hypot(e2.x - e.x, e2.z - e.z) > 0.9);
  assert.equal(nav.edgePoint([5, 5], spot), null, 'not a main-island cell');
});
// §13.3：站著的人之間也套 0.25 分離，只沿 x 錯開（不往鏡頭縱深推）
test('separateStanding pushes standing members apart along x only, writes m.pos and returns who moved', () => {
  const nav = createNav(), at = (x, z) => ({ pos: { x, y: 0.65, z } });
  const ms = [at(1, 2), at(1.05, 2.1), at(1, 2.02), at(3, 2)], z0 = ms.map(m => m.pos.z);
  const moved = nav.separateStanding(ms);
  assert.deepEqual(ms.map(m => m.pos.z), z0, 'z never changes');
  for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) assert.ok(Math.hypot(ms[i].pos.x - ms[j].pos.x, ms[i].pos.z - ms[j].pos.z) >= SEPARATION - 1e-9, `${i}-${j}`);
  assert.ok(ms.slice(0, 3).every(m => Math.abs(m.pos.x - 1) < 0.4), 'stays near the spot');
  assert.deepEqual(ms[3].pos, { x: 3, y: 0.65, z: 2 }); assert.ok(!moved.includes(ms[3])); assert.equal(moved.length, 3);
  assert.deepEqual(nav.separateStanding(ms), [], 'already apart: nobody moves');
});
