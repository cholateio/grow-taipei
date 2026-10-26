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
  nav.setFootprints([{ x: o.x, z: o.z, w: 1.0, d: 0.6 }]); assert.ok(!nav.walkable(o.x + 0.4, o.z)); assert.ok(nav.walkable(o.x + 0.4, o.z + 0.6));   // 外擴 PAD 後 z 邊在 0.42
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

// ── §14.1：橋面高度跟橋的幾何、footprint 留人身寬度、閒晃與站著推開只落在可走點 ──
const bridgesOf = async level => {
  const { MAIN_CELLS, adjacentPairs } = await import('../src/scene/hex.js');
  return adjacentPairs(MAIN_CELLS).filter(([A, B]) => (cellTop(A) === cellTop(B)) === level).map(([A, B]) => ({ A, B, ...edgeMidpoint(A, B, RING_R * Math.sqrt(3) / 2) }));
};
test('groundY on a level bridge follows the deck arch (base + sin·0.08 + 0.025) within 0.01 at 20 points on every level bridge', async () => {
  const { bridgeDecks } = await import('../src/scene/bridge.js');
  const nav = createNav(), level = await bridgesOf(true);
  assert.ok(level.length >= 6, `${level.length} level bridges`);
  for (const { A, a, b } of level) {
    const base = cellTop(A), decks = bridgeDecks(a, b, { base, arch: 0.08 }), len = Math.hypot(b.x - a.x, b.z - a.z), nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
    for (let k = 1; k <= 20; k++) for (const side of [-0.15, 0, 0.15]) {
      const t = k / 21, x = a.x + (b.x - a.x) * t + nx * side, z = a.z + (b.z - a.z) * t + nz * side;
      const want = base + Math.sin(Math.PI * t) * 0.08 + 0.025, y = nav.groundY(x, z);
      assert.ok(Math.abs(y - want) <= 0.01, `${A} t=${t.toFixed(2)} side ${side}: ${y.toFixed(3)} vs ${want.toFixed(3)}`);
    }
    // 甲板（island.js 的 addBridge）的頂面：每片中心的高度 + 0.025
    for (const d of decks.slice(1, -1)) assert.ok(Math.abs(nav.groundY(d.x, d.z) - (d.y + 0.025)) <= 0.01, `${A} deck at ${d.x.toFixed(2)},${d.z.toFixed(2)}`);
  }
});
test('groundY on a stair between cells of different height stays the linear interpolation', async () => {
  const nav = createNav(), stairs = await bridgesOf(false);
  assert.ok(stairs.length >= 1);
  for (const { A, B, a, b } of stairs) for (let k = 1; k <= 20; k++) {
    const t = k / 21, y = nav.groundY(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t), want = cellTop(A) + (cellTop(B) - cellTop(A)) * t;
    assert.ok(Math.abs(y - want) < 1e-9, `${A}→${B} t=${t.toFixed(2)}: ${y} vs ${want}`);
  }
});
test('footprints block PAD 0.12 beyond their declared edge: a point 0.1 outside a {w,d} footprint is not walkable, 0.2 outside is', async () => {
  const { PAD, HALF } = await import('../src/show/nav.js');
  assert.equal(PAD, 0.12);
  // 可走 = 最近的格點可走、點本身也在外擴後的 footprint 外。0.1 在外擴的框裡，不論格點怎麼對齊都不可走；
  // 0.2 要看格點：框的邊離最近的格點 0.03 時（不外擴的話那一格可走），外 0.2 的點落在邊外 0.33 的格點上
  const node = v => -HALF + STEP * Math.round((v + HALF) / STEP), o = c([0, 0]), x = node(o.x), z = node(o.z), nav = createNav();
  for (const shift of [0, 0.05, 0.11, 0.17, 0.23]) {
    nav.setFootprints([{ x: x + shift, z: z - shift, w: 1.14, d: 0.54 }]);
    for (const s of [-1, 1]) assert.ok(!nav.walkable(x + shift + s * 0.67, z - shift) && !nav.walkable(x + shift, z - shift + s * 0.37), `shift ${shift}: 0.1 outside (${s})`);
  }
  nav.setFootprints([{ x, z, w: 1.14, d: 0.54 }]);
  for (const s of [-1, 1]) {
    assert.ok(!nav.walkable(x + s * 0.67, z), `0.1 outside along x (${s})`); assert.ok(nav.walkable(x + s * 0.77, z), `0.2 outside along x (${s})`);
    assert.ok(!nav.walkable(x, z + s * 0.37), `0.1 outside along z (${s})`); assert.ok(nav.walkable(x, z + s * 0.47), `0.2 outside along z (${s})`);
  }
  nav.setFootprints([{ x, z, r: 0.57 }]);
  assert.ok(!nav.walkable(x + 0.67, z), 'circle: 0.1 outside'); assert.ok(nav.walkable(x + 0.77, z), 'circle: 0.2 outside');
  nav.setFootprints([]); assert.ok(nav.walkable(x + 0.67, z) && nav.walkable(x, z), 'cleared');
  // 路線繞過外擴後的框：每一段離框都至少 PAD
  nav.setFootprints([{ x: o.x, z: o.z, w: 1.0, d: 0.4 }]);
  const path = nav.route({ x: o.x - 1.2, y: o.y, z: o.z + 0.05 }, { x: o.x + 1.2, y: o.y, z: o.z - 0.05 });
  for (let i = 1; i < path.length; i++) for (let k = 0; k <= 1; k += 0.02) {
    const x = path[i - 1].x + (path[i].x - path[i - 1].x) * k, z = path[i - 1].z + (path[i].z - path[i - 1].z) * k;
    assert.ok(Math.max(Math.abs(x - o.x) - 0.5, Math.abs(z - o.z) - 0.2) >= PAD - 1e-9, `route at ${x.toFixed(2)},${z.toFixed(2)}`);
  }
});
test('wander never returns a point inside a footprint; separateStanding never pushes a member into one (members along a wall stay put)', async () => {
  const { mulberry32 } = await import('../src/scene/random.js');
  const o = c([1, 0]), nav = createNav({ rnd: mulberry32(3) }), wall = { x: o.x + 0.6, z: o.z, w: 1.0, d: 1.6 };
  const outside = p => Math.max(Math.abs(p.x - wall.x) - wall.w / 2, Math.abs(p.z - wall.z) - wall.d / 2), clearOf = p => outside(p) >= 0.12 - 1e-9;   // 離牆至少 PAD
  nav.setFootprints([wall]);
  for (let k = 0; k < 300; k++) { const p = nav.wander(o, 1.4); assert.ok(nav.walkable(p.x, p.z) && clearOf(p), `wander ${k} at ${p.x.toFixed(2)},${p.z.toFixed(2)}`); }
  // 兩人貼著牆（+x 那側就是牆）站：往牆推的那一個不動，另一個往外讓
  const left = wall.x - wall.w / 2 - 0.12, at = (x, z) => ({ pos: { x, y: o.y, z } });
  let probe = left - 0.01; while (!nav.walkable(probe, o.z)) probe -= 0.01;   // 牆邊最靠牆、還可走的 x
  const a = at(probe - 0.1, o.z), b = at(probe, o.z), moved = nav.separateStanding([a, b]);
  assert.equal(b.pos.x, probe, 'the member at the wall stays put'); assert.ok(nav.walkable(a.pos.x, a.pos.z) && clearOf(a.pos));
  assert.ok(Math.abs(a.pos.x - b.pos.x) >= SEPARATION - 1e-6, `the other one makes room (${Math.abs(a.pos.x - b.pos.x).toFixed(3)})`);
  assert.deepEqual(moved, [a]);
  // 一串人擠在牆邊、或夾在兩道牆之間只剩一格寬的走道：推不開的就不推，誰都不會被推進牆裡
  const crowd = Array.from({ length: 5 }, (_, k) => at(probe - k * 0.04, o.z + k * 0.02));
  nav.separateStanding(crowd); for (const m of crowd) assert.ok(nav.walkable(m.pos.x, m.pos.z) && clearOf(m.pos), `crowd at ${m.pos.x.toFixed(3)}`);
  const lane = createNav(); lane.setFootprints([wall, { x: left - 0.3 - 0.12 - 0.5, z: o.z, w: 1.0, d: 1.6 }]);
  let col = left; while (!lane.walkable(col, o.z)) col -= 0.01;
  const pair = [at(col - 0.02, o.z), at(col - 0.06, o.z + 0.05), at(col - 0.1, o.z - 0.05)];
  assert.ok(pair.every(m => lane.walkable(m.pos.x, m.pos.z)), 'all start on walkable ground');
  for (let f = 0; f < 60; f++) lane.separateStanding(pair, 1.6 / 30);
  for (const m of pair) assert.ok(lane.walkable(m.pos.x, m.pos.z), `lane: never pushed into a footprint (${m.pos.x.toFixed(3)})`);
  // 走路格外的人（衛星島、屋頂上）照舊錯開
  const s1 = at(40, 40), s2 = at(40.05, 40); nav.separateStanding([s1, s2]);
  assert.ok(Math.abs(s1.pos.x - s2.pos.x) >= SEPARATION - 1e-6, 'off the grid: still pushed apart');
});
