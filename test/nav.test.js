// test/nav.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNav, STEP, SEPARATION, SEP_PASSES, yieldTarget, YIELD_CLEAR } from '../src/show/nav.js';
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
  // 過拱橋那一段補了貼地的點（xz 在同一直線上）：只數轉彎的點
  const turns = path.filter((p, i) => i === 0 || i === path.length - 1 || Math.abs((p.x - path[i - 1].x) * (path[i + 1].z - p.z) - (p.z - path[i - 1].z) * (path[i + 1].x - p.x)) > 1e-9);
  assert.ok(turns.length <= 6, `string-pulled: ${turns.length} corners`);
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
// 審查修正：游標沿路線直線內插，過拱橋那一段要補點才貼著橋面；橋的兩端沒有台階、橋旁邊的水不可走
test('a walker following a route over every level bridge stays on the deck (cursor y within 0.01 of groundY at every step); no step at the bridge ends; water beside a bridge is not walkable', async () => {
  const { createPathCursor } = await import('../src/scene/path.js'), level = await bridgesOf(true), nav = createNav();
  for (const { A, B, a, b } of level) {
    const path = nav.route(c(A), c(B)), total = createPathCursor(path, { loop: false }).total;
    for (let k = 0; k <= 400; k++) {
      const cur = createPathCursor(path, { loop: false }); cur.advance(total * k / 400); const p = cur.locate();
      assert.ok(Math.abs(p.y - nav.groundY(p.x, p.z)) <= 0.01, `${A}→${B} step ${k}: cursor ${p.y.toFixed(3)} vs ground ${nav.groundY(p.x, p.z).toFixed(3)}`);
    }
    const len = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
    for (const [e, dir] of [[a, -1], [b, 1]]) for (let s = -0.12; s <= 0.12; s += 0.01) {
      const y0 = nav.groundY(e.x + ux * dir * s, e.z + uz * dir * s), y1 = nav.groundY(e.x + ux * dir * (s + 0.01), e.z + uz * dir * (s + 0.01));
      assert.ok(Math.abs(y1 - y0) < 0.01, `${A}→${B} end step ${(y1 - y0).toFixed(3)} at ${s.toFixed(2)}`);
    }
    const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    assert.ok(nav.walkable(m.x, m.z), 'deck centre');
    for (const side of [-1, 1]) assert.ok(!nav.walkable(m.x - uz * side * 0.32, m.z + ux * side * 0.32), `${A}→${B}: water beside the deck`);
  }
});
test('routes never cut into a padded footprint, even on the legs the string-pulling forces (random footprints in every cell)', async () => {
  const { mulberry32 } = await import('../src/scene/random.js'), { MAIN_CELLS } = await import('../src/scene/hex.js'), rnd = mulberry32(7);
  for (let trial = 0; trial < 90; trial++) {
    const nav = createNav(), k = trial % 3;
    nav.setFootprints(MAIN_CELLS.map(cell => {
      const o = axialToWorld(...cell), x = o.x + (rnd() - 0.5) * 0.6, z = o.z + (rnd() - 0.5) * 0.6;
      return k === 0 ? { x, z, r: 0.3 + rnd() * 0.6 } : k === 1 ? { x, z, rx: 0.4 + rnd() * 0.8, rz: 0.4 + rnd() * 0.6 } : { x, z, w: 0.2 + rnd(), d: 0.2 + rnd() };
    }));
    for (let q = 0; q < 6; q++) {
      const pick = () => axialToWorld(...MAIN_CELLS[Math.floor(rnd() * MAIN_CELLS.length)]), from = nav.wander(pick(), 1.5), path = nav.route(from, nav.wander(pick(), 1.5));
      for (let i = 1; i < path.length; i++) for (let s = 0; s <= 100; s++) {
        const x = path[i - 1].x + (path[i].x - path[i - 1].x) * s / 100, z = path[i - 1].z + (path[i].z - path[i - 1].z) * s / 100;
        assert.ok(!nav.inFootprint(x, z), `trial ${trial}: segment ${i} at ${x.toFixed(2)},${z.toFixed(2)}`);
      }
    }
  }
});
// 最終審查修正：手畫的折線（工程師通勤、電工主路）也要貼著橋面——nav.ground 在過拱橋那一段補點、每一點 y 換成 groundY；
// xz 不變（總長一樣、每一點都在原折線上），閉合的折線（loop）最後一段也補；走路格外的點（衛星島）不動
test('nav.ground(path) puts a hand-drawn polyline on the deck: cursor y within 0.01 of groundY at every step (OPEN_ROUTE, ROAD loop); xz unchanged; off-grid points untouched', async () => {
  const { createPathCursor, measurePath } = await import('../src/scene/path.js'), { OPEN_ROUTE } = await import('./helpers/actors.js'), { ROAD } = await import('../src/actors/bulb.js');
  const { WATER_Y, MAIN_CELLS, adjacentPairs } = await import('../src/scene/hex.js'), nav = createNav();
  // 橋頭：兩端超出的半片板子側邊是一個 0.025 的小坎（groundY 本身的不連續），折線沿著橋頭橫走時那一小段容許 0.03
  const heads = adjacentPairs(MAIN_CELLS).flatMap(([A, B]) => { const { a, b } = edgeMidpoint(A, B, RING_R * Math.sqrt(3) / 2); return [a, b]; });
  const tol = p => (heads.some(h => Math.hypot(p.x - h.x, p.z - h.z) <= 0.3) ? 0.03 : 0.01);
  for (const [name, path, loop] of [['OPEN_ROUTE', OPEN_ROUTE, false], ['ROAD', ROAD, true]]) {
    const g = nav.ground(path, { loop }), total = measurePath(path, loop).at(-1);
    assert.ok(Math.abs(measurePath(g, loop).at(-1) - total) < 1e-9, `${name}: same length`);
    assert.ok(g.length > path.length, `${name}: points added over the bridges`);
    let bridged = 0;
    for (let k = 0; k <= 1000; k++) {
      const cur = createPathCursor(g, { loop }); cur.advance(total * k / 1000 * (loop ? 0.9999 : 1)); const p = cur.locate(), gy = nav.groundY(p.x, p.z);
      if (gy <= WATER_Y) continue;
      if (gy - cellTop([0, 0]) > 0.03) bridged++;
      assert.ok(Math.abs(p.y - gy) <= tol(p), `${name} step ${k} at ${p.x.toFixed(2)},${p.z.toFixed(2)}: ${p.y.toFixed(3)} vs ground ${gy.toFixed(3)}`);
    }
    assert.ok(bridged > 10, `${name}: crosses an arch (${bridged} samples above the deck ends)`);
  }
  assert.deepEqual(nav.ground([{ x: 40, y: 0.45, z: 40 }, { x: 41, y: 0.45, z: 40 }]), [{ x: 40, y: 0.45, z: 40 }, { x: 41, y: 0.45, z: 40 }], 'off the grid: as drawn');
});
// 最終審查修正：建築長在身上（起點在外擴的 footprint 裡）時走出來的那一段直線，不穿過旁邊另一棟建築本身——
// 最近的可走點在隔壁攤子另一邊時，改走沒有隔著建築的那一邊（老闆被噴泉長在身上，不從夜市攤子的牆角切過去）
test('a route rescued out of a footprint never cuts through another building on the way out', () => {
  const nav = createNav(), A = { x: 0, z: 0, r: 0.7 }, B = { x: 0.75, z: 0, w: 0.2, d: 2.0 };
  nav.setFootprints([A, B]);
  const from = { x: 0.45, y: TOP, z: 0 }, path = nav.route(from, { x: -1.2, y: TOP, z: 0 }), out = path[1];
  assert.ok(nav.walkable(out.x, out.z), 'walks out to a walkable point');
  for (let k = 0; k <= 100; k++) {
    const x = from.x + (out.x - from.x) * k / 100, z = from.z + (out.z - from.z) * k / 100;
    assert.ok(!(Math.abs(x - B.x) <= B.w / 2 && Math.abs(z - B.z) <= B.d / 2), `escape leg crosses the other building at ${x.toFixed(2)},${z.toFixed(2)} (to ${out.x.toFixed(2)},${out.z.toFixed(2)})`);
  }
});
// 物品 v2 任務 4：從橋面側邊踏下到格子的角（橋面和格面差一階）——路線在階的兩側各有一點，游標走在橋面上時不會停在兩個高度中間陷進橋面
// （名冊的人被推擠卡住幾幀就看得出來）。橋面 = 中心線兩側 BRIDGE_HALF 內、兩個橋頭之間
test('a route stepping off the side of a level bridge onto a cell corner climbs down at once (cursor on the deck never hangs between the two heights)', async () => {
  const { createPathCursor } = await import('../src/scene/path.js'), { BRIDGE_HALF } = await import('../src/show/nav.js'), { cellAt } = await import('../src/scene/hex.js');
  const level = await bridgesOf(true), nav = createNav();
  let stepped = 0;
  for (const { A, B, a, b } of level) {
    const len = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
    const deck = p => { const dx = p.x - a.x, dz = p.z - a.z, s = dx * ux + dz * uz; return s >= 0 && s <= len && Math.abs(dx * uz - dz * ux) <= BRIDGE_HALF; };
    // 橋側邊外、走得到的格子角：沿線 0.1–0.4、離中心線 0.27–0.45 找第一個
    for (const side of [-1, 1]) for (const s of [0.1, 0.2, 0.3, 0.4].flatMap(t => [t, len - t])) {
      const off = [0.27, 0.3, 0.35, 0.4, 0.45].map(o => ({ x: a.x + ux * s - uz * side * o, z: a.z + uz * s + ux * side * o })).find(p => cellAt(p.x, p.z) && nav.walkable(p.x, p.z));
      if (!off) continue;
      const from = { x: a.x + ux * s, z: a.z + uz * s }, path = nav.route({ ...from, y: nav.groundY(from.x, from.z) }, off), total = createPathCursor(path, { loop: false }).total;
      let hang = 0;
      for (let k = 0; k <= 400; k++) { const cur = createPathCursor(path, { loop: false }); cur.advance(total * k / 400); const p = cur.locate(); if (deck(p) && Math.abs(p.y - nav.groundY(p.x, p.z)) > 0.01) hang++; }
      assert.ok(hang <= 1, `${A}→${B} side ${side} at ${s.toFixed(2)}: ${hang} cursor samples on the deck hang off it`);
      stepped++;
    }
  }
  assert.ok(stepped >= 2, `${stepped} side steps checked`);
});
// 正面擦身（任務 12，偵防師不變式）：走路的人前方 YIELD_LOOK 內、橫向不到 YIELD_CLEAR 有人 → 往遠離他的那一側讓開，讓到橫向 YIELD_CLEAR；
// 後面、旁邊夠遠、太遠的人不理；兩個人各讓各的（往自己的右手邊不重要，往遠離對方那側）
test('yieldOffset: sidestep away from someone ahead within 0.5, to a lateral clearance of YIELD_CLEAR; ignore people behind, beside or far', async () => {
  const { yieldOffset, YIELD_LOOK, YIELD_CLEAR, SEPARATION } = await import('../src/show/nav.js');
  assert.equal(YIELD_LOOK, 0.5); assert.ok(YIELD_CLEAR > SEPARATION);
  const p = { x: 0, z: 0 }, yaw = 0;   // 朝 +z 走；右手邊（side > 0）是 −x
  const side = (o, y = yaw) => yieldOffset(p, y, [o]);
  assert.equal(side({ x: 0, z: 0.6 }), 0, 'too far ahead');
  assert.equal(side({ x: 0, z: -0.3 }), 0, 'behind');
  assert.equal(side({ x: 0.4, z: 0.3 }), 0, 'beside, already clear');
  const s = side({ x: 0.05, z: 0.3 }), at = { x: p.x - Math.cos(yaw) * s, z: p.z + Math.sin(yaw) * s };
  assert.ok(Math.abs(Math.abs(0.05 - at.x) - YIELD_CLEAR) < 1e-9, `clears to ${YIELD_CLEAR} laterally (${s.toFixed(3)})`);
  assert.ok(at.x < 0, 'away from him (he is a little to the left, +x)');
  assert.ok(side({ x: -0.05, z: 0.3 }) * s < 0, 'mirror case goes the other way');
  // 朝 +x 走（yaw π/2）：前方的人在 +x
  assert.notEqual(side({ x: 0.3, z: 0 }, Math.PI / 2), 0, 'heading matters');
  assert.equal(yieldOffset(p, yaw, []), 0);
  // 前方兩個人：照最近的那個讓
  assert.equal(yieldOffset(p, yaw, [{ x: 0.05, z: 0.4 }, { x: -0.02, z: 0.2 }]), side({ x: -0.02, z: 0.2 }));
});

// 計畫 5b 任務 4：夜市四攤（外擴 PAD 之後）跟格邊之間的夾縫——點走得進去（電工沿手畫的主路），0.3 一格的格點連不出去，
// 以前 route 只回起點（燈泡 Lv7 他走不到站前，0.45 秒跳 4.6 公尺上車）。現在先直線走到附近連得通的點，再照常找路到終點
test('route out of a pocket the grid cannot leave (night-market stalls): reaches the goal instead of staying put', () => {
  const nav = createNav({ rnd: () => 0.5 }), X = 3.39023011444505;
  nav.setFootprints([{ x: X, z: 3.24, w: 0.5, d: 0.4 }, { x: X + 0.5, z: 3.74, w: 0.5, d: 0.4 }, { x: X - 0.5, z: 3.74, w: 0.5, d: 0.4 }, { x: X, z: 4.24, w: 0.5, d: 0.4 }, { x: X, z: 3.74, w: 0.5, d: 0.6 }]);
  const goal = { x: 0.6, z: -1.5 }, end = nav.nearestWalkable(goal);
  for (const from of [{ x: 4.15, z: 3.12 }, { x: 4.15, z: 2.99 }]) {
    const path = nav.route(from, goal), last = path.at(-1);
    assert.ok(Math.hypot(last.x - end.x, last.z - end.z) < 1e-6, `from ${JSON.stringify(from)}: ends at the goal (${last.x.toFixed(2)}, ${last.z.toFixed(2)}), ${path.length} points`);
    assert.ok(path.slice(2).every(p => !nav.inFootprint(p.x, p.z)), 'never through a padded footprint after leaving the wall');
  }
});
// 計畫 5b 任務 4：走路互推時一邊貼著牆（推過去會進外擴 footprint）——另一邊讓開整段，不疊在一起；貼牆的人也不被推進 PAD
test('separate: when one walker is against a wall the other takes the whole push; nobody is pushed into a padded footprint', () => {
  const nav = createNav({ rnd: () => 0.5 });
  nav.setFootprints([{ x: 0, z: 0, w: 1, d: 1 }]);   // 外擴後半寬 0.62
  const a = { pos: { x: 0.63, y: TOP, z: 0 }, walking: true }, b = { pos: { x: 0.78, y: TOP, z: 0 }, walking: true };
  assert.ok(!nav.inFootprint(a.pos.x, a.pos.z) && nav.inFootprint(a.pos.x - 0.05, a.pos.z), 'a is right against the padded wall');
  nav.separate([a, b], 0.1);
  assert.ok(!nav.inFootprint(a.pos.x, a.pos.z), `a stays outside the pad (${a.pos.x.toFixed(3)})`);
  assert.ok(Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) >= SEPARATION - 1e-9, `apart ${Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z).toFixed(3)}`);
});
// 2026-10-28 錄影修正（老鼠、變異鼠和路人疊在一起）：分離距離是兩個人各自的半徑相加（m.radius；沒有就當 SEPARATION / 2）。
// 人對人仍是 0.25；變異鼠（0.325）對人（0.125）要 0.45
test('separate and separateStanding keep each pair ra + rb apart (members without a radius count as SEPARATION / 2)', () => {
  const nav = createNav(), o = c([1, 0]);
  const walker = (x, r) => ({ pos: { x: o.x + x, y: o.y, z: o.z }, walking: true, ...(r ? { radius: r } : {}) });
  const big = walker(0, 0.325), kid = walker(0.3, 0.125);
  nav.separate([big, kid], 1 / 30);
  assert.ok(Math.abs(Math.hypot(big.pos.x - kid.pos.x, big.pos.z - kid.pos.z) - 0.45) < 1e-6, `walkers ${Math.hypot(big.pos.x - kid.pos.x, big.pos.z - kid.pos.z).toFixed(3)} apart`);
  const p1 = walker(0, 0.125), p2 = walker(0.2, null);
  nav.separate([p1, p2], 1 / 30);
  assert.ok(Math.abs(Math.hypot(p1.pos.x - p2.pos.x, p1.pos.z - p2.pos.z) - SEPARATION) < 1e-6, 'people still 0.25');
  const stand = (x, z, r) => ({ pos: { x: o.x + x, y: o.y, z: o.z + z }, radius: r });
  const ms = [stand(0, 0, 0.325), stand(0.2, 0.1, 0.125), stand(0.9, 0.1, 0.125)];
  nav.separateStanding(ms);
  for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
    const d = Math.hypot(ms[i].pos.x - ms[j].pos.x, ms[i].pos.z - ms[j].pos.z);
    assert.ok(d >= ms[i].radius + ms[j].radius - 1e-9, `${i}-${j} ${d.toFixed(3)} apart`);
  }
});
// 2026-10-28 錄影修正第二輪：走路的人碰上站著的人（站定的 stand 成員）——走路的人一個人退開整段（站著的不動），到兩人半徑相加；
// 照樣不推進外擴 footprint
test('separate pushes a walker off a standing member by the whole gap (ra + rb); the stander never moves; never into a padded footprint', () => {
  const nav = createNav(), o = c([1, 0]);
  const stander = { pos: { x: o.x, y: o.y, z: o.z }, walking: false, radius: 0.125 };
  const rat = { pos: { x: o.x + 0.1, y: o.y, z: o.z + 0.05 }, walking: true, radius: 0.13 };
  nav.separate([rat], 1 / 30, [stander]);
  assert.deepEqual(stander.pos, { x: o.x, y: o.y, z: o.z }, 'the stander stays put');
  assert.ok(Math.abs(Math.hypot(rat.pos.x - o.x, rat.pos.z - o.z) - 0.255) < 1e-6, `walker ${Math.hypot(rat.pos.x - o.x, rat.pos.z - o.z).toFixed(3)} away`);
  const far = { pos: { x: o.x + 1, y: o.y, z: o.z }, walking: true };
  nav.separate([far], 1 / 30, [stander]); assert.deepEqual(far.pos, { x: o.x + 1, y: o.y, z: o.z }, 'nobody near: untouched');
  // 牆：站著的人在牆邊，走路的人被推的方向是牆 → 不推進去
  nav.setFootprints([{ x: o.x + 0.5, z: o.z, w: 0.4, d: 2 }]);
  const wall = { pos: { x: o.x + 0.15, y: o.y, z: o.z }, walking: true, radius: 0.125 };
  nav.separate([wall], 1 / 30, [stander]);
  assert.ok(!nav.inFootprint(wall.pos.x, wall.pos.z), 'not pushed into the padded wall');
});
// 第二輪：兩個走路的人裡有一個沿手畫折線走（m.cursor，位置每幀從折線算）——他不被推，另一個人退開整段
test('separate: a walker on a hand-drawn path (cursor) is not pushed; the other walker takes the whole gap', () => {
  const nav = createNav(), o = c([1, 0]);
  const onPath = { pos: { x: o.x, y: o.y, z: o.z }, walking: true, cursor: {} }, free = { pos: { x: o.x + 0.1, y: o.y, z: o.z }, walking: true };
  nav.separate([onPath, free], 1 / 30);
  assert.deepEqual(onPath.pos, { x: o.x, y: o.y, z: o.z }, 'the path walker stays on his line');
  assert.ok(Math.hypot(free.pos.x - o.x, free.pos.z - o.z) >= SEPARATION - 1e-9, 'the other one makes room');
});
// 計畫 11 任務 5（使用者 2026-10-31「走路互相重疊」）：三個走路的人擠成一串（中間那個在兩人之間、離兩邊都不到一個身寬）——
// 只推一輪，推開 A、B 又把 B 推回 C 身上；每幀做 SEP_PASSES 輪，這一幀就全部分開（≥ 兩人半徑相加）
test('separate: three walkers bunched in a row all end ≥ ra + rb apart after one frame with SEP_PASSES passes, but not with one pass', () => {
  const nav = createNav(), o = c([1, 0]);
  const row = () => [[0, 0], [0.15, 0.08], [0.3, 0]].map(([x, z]) => ({ pos: { x: o.x + x, y: o.y, z: o.z + z }, walking: true }));
  const closest = ms => Math.min(...ms.flatMap((a, i) => ms.slice(i + 1).map(b => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z))));
  assert.equal(SEP_PASSES, 3);
  const once = row(); nav.separate(once, 1 / 30, [], undefined, 1);
  assert.ok(closest(once) < SEPARATION - 0.01, `one pass leaves an overlap (${closest(once).toFixed(4)})`);
  const multi = row(); nav.separate(multi, 1 / 30);
  assert.ok(closest(multi) >= SEPARATION - 1e-6, `SEP_PASSES passes resolve the row (${closest(multi).toFixed(4)})`);
  assert.ok(multi.every(m => nav.walkable(m.pos.x, m.pos.z)), 'everyone still on walkable ground');
});
// 計畫 11 任務 5 修正第 1 輪：yieldTarget 另外回從他另一邊過去的橫移（other）——兩個橫移都離他 clear，一左一右
test('yieldTarget also returns the far-side offset: both sides clear the person by the same amount, on opposite sides', () => {
  const t = yieldTarget({ x: 0, z: 0 }, 0, [{ x: 0.05, z: 0.3 }]);   // 朝 +z 走，右手邊是 −x：他在左前方 lat −0.05
  const lat = -0.05;
  assert.ok(Math.abs(Math.abs(t.side - lat) - YIELD_CLEAR) < 1e-9 && Math.abs(Math.abs(t.other - lat) - YIELD_CLEAR) < 1e-9, `side ${t.side} other ${t.other}`);
  assert.ok(Math.sign(t.side - lat) === -Math.sign(t.other - lat), 'opposite sides of him');
  assert.ok(t.side > 0, 'the near side is away from him');
});
