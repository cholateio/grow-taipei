import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as boba from '../src/actors/boba.js';
import * as THREE from '../vendor/three/three.module.js';
import * as sat from '../src/actors/satellites.js';
import * as bulb from '../src/actors/bulb.js';
import * as token from '../src/actors/token.js';
import * as baseball from '../src/actors/baseball.js';
import { RING_R, SATELLITES, axialToWorld, worldToAxial, cellAt, MAIN_CELLS, R as HEX_R } from '../src/scene/hex.js';
import { anchorWorld, cellOf } from '../src/actors/anchors.js';
import { OVERVIEW_DIR } from '../src/scene/camera.js';
import { C } from '../src/actors/palette.js';
import { diffParts } from '../src/actors/stage.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { headlessShow, playItem, entriesThroughSolutions, solo, SCRIPT_MAX, KEY_MAX, blinkLog } from './helpers/show.js';
import { lv, worldPoints, distToCell, focusTrail, entryProblems } from './helpers/actors.js';
import { createNav, satelliteAt, radiusOf } from '../src/show/nav.js';
import { B } from '../src/show/beats.js';
const RESULTS = enumerate(spec);
const SOLUTIONS = stats(RESULTS, spec).full.map(r => r.order);   // 唯一正解（賽博），從求解器取
const ALIEN = RESULTS.find(r => r.ending.id === 'alien' && r.state.lv.rat === 4).order;   // 外星壞局（列舉裡第一條以「變異鼠稱王」為標題的；修正批次 2：攤車被吹走排在外星前面）
// 糖分超標：列舉裡第一條立了 bobaSugar 的放法（修正批次 2 之後外星局不一定經過珍奶 4）
const SUGAR = RESULTS.find(r => r.state.flags.bobaSugar).order;
const AT = anchorWorld('boba'), CELL = cellOf('boba');
const near = (a, b, d) => Math.hypot(a.x - b.x, a.z - b.z) < d;
const PALETTE = new Set(Object.values(C));
const LIGHT_I = SATELLITES.findIndex(s => s.kind === 'lighthouse'), LIGHT = axialToWorld(SATELLITES[LIGHT_I].q, SATELLITES[LIGHT_I].r);
const onLighthouse = p => !cellAt(p.x, p.z) && satelliteAt(p) === LIGHT_I;
const views = Array.from({ length: 7 }, (_, n) => boba.view(lv({ boba: n }), {}));
const nonRoster = v => Object.fromEntries(Object.entries(v).filter(([, p]) => p.kind !== 'roster'));
const pick = (v, keys) => Object.fromEntries(Object.entries(v).filter(([k]) => keys.includes(k)));
// 珍奶看得見的東西：自己的零件＋小森林島分店、觀光船（衛星島）
const whole = n => ({ ...views[n], ...pick(sat.view(lv({ boba: n }), {}), ['sat.forest.shop', 'sat.forest.sign', 'sat.forest.stage1', 'sat.forest', 'sat.boats']) });
// 鏡頭方向（水平）：OVERVIEW_DIR 指向鏡頭
const CAM = (() => { const n = Math.hypot(OVERVIEW_DIR.x, OVERVIEW_DIR.z); return { x: OVERVIEW_DIR.x / n, z: OVERVIEW_DIR.z / n }; })();

test('boba has its single-path ladder (max 6)', () => { assert.equal(spec.ITEMS.boba.max, 6); });

// ── view：每一級看得見的東西都不一樣（§4.7；唯一正解 §4.4：分店與旗艦店同一級）──
test('boba has something new at every level 1–6: cart, queue, shop, fountain, islets (branch + flagship), festival', () => {
  assert.deepEqual(Object.keys(views[1]), ['boba.main', 'boba.owner']);
  for (let n = 2; n <= 6; n++) assert.ok(diffParts(nonRoster(whole(n - 1)), nonRoster(whole(n))).add.length, `lv${n}: something new`);
  assert.equal(views[2]['boba.queue'].n, 3);
  assert.equal(views[3]['boba.main'].kind, 'glb'); assert.equal(views[2]['boba.main'].kind, 'compound');
  assert.ok(views[4]['boba.fountain'] && !views[3]['boba.fountain'], 'Lv4 fountain');
  assert.ok(whole(5)['sat.forest.shop'] && whole(5)['sat.forest.stage1'] && !whole(4)['sat.forest.shop'] && !whole(4)['sat.forest.stage1'], 'Lv5 forest branch');
  assert.equal(whole(5)['sat.boats'].n, whole(4)['sat.boats'].n + 2, 'Lv5 two more tour boats');
  // 同一級：森林島分店、燈塔島旗艦店、小船、觀光客、無人機、棧橋
  assert.ok(views[5]['boba.flagship'] && !views[4]['boba.flagship'], 'Lv5 flagship');
  assert.ok(views[5]['boba.ferry'] && views[5]['boba.tourists'] && boba.DRONE_KEYS.every(k => views[5][k]), 'Lv5 ferry, tourists, drones');
  assert.ok(sat.view(lv({ boba: 5 }), {})['sat.lighthouse.stage2'] && !sat.view(lv({ boba: 4 }), {})['sat.lighthouse.stage2'], 'Lv5 lighthouse pier');
  assert.ok(views[6]['boba.fleet'] && !views[5]['boba.fleet'] && views[6]['boba.yard'].parts.some(p => p.coast), 'Lv6 balloons and fleet');
  assert.ok(!views[5]['boba.yard'].parts.some(p => p.coast), 'no balloons before Lv6');
  assert.ok(boba.script.placed && [2, 3, 4, 5, 6].every(n => boba.script.grow[n]) && !boba.script.grow[7] && boba.script.fx);
});
// 人數預算（使用者 2026-10-26）：人龍 ≤ 4，不再有閒晃的觀光客
test('people budget: queue of 3 at every level, no strollers anywhere', () => {
  for (let n = 1; n <= 6; n++) for (const milk of [0, 2, 4, 10]) {
    const v = boba.view(lv({ boba: n, milk }), {});
    assert.equal(v['boba.strollers'], undefined, `lv${n} milk${milk}`);
    assert.ok(Object.keys(v).every(k => !k.includes('stroll')));
    if (n >= 2) assert.equal(v['boba.queue'].n, 3); else assert.equal(v['boba.queue'], undefined);
  }
  assert.equal(boba.QUEUE_MAX, 3, '2026-10-28 錄影修正：人龍 4 → 3');
});
// 2026-10-28 錄影修正（珍奶格太擠、店貼著格子前緣）：店在錨點北邊 0.05；人龍跟著店走，店門口那排離格子南緣 ≥ 0.7（店前有空地）；
// 噴泉東緣離電工主路 ≥ 0.1（也 ≥ PAD：手畫的主路不切進外擴後的噴泉）、離夜市每一攤的攤身 ≥ 0.1、跟店身不重疊
test('the shop sits 0.05 north of the anchor with open ground in front; the fountain clears the road and the night market', async () => {
  const { PAD } = await import('../src/show/nav.js'), hexIn = HEX_R * Math.sqrt(3) / 2, c = axialToWorld(...CELL);
  const edgeDist = p => hexIn - Math.max(...[0, 1, 2, 3, 4, 5].map(k => (p.x - c.x) * Math.cos(k * Math.PI / 3) + (p.z - c.z) * Math.sin(k * Math.PI / 3)));
  assert.ok(Math.abs(boba.SHOP.x - (AT.x - 0.1)) < 1e-9 && Math.abs(boba.SHOP.z - (AT.z - 0.05)) < 1e-9, 'SHOP = AT + (−0.1, −0.05)');
  for (const [n, dz] of [[2, 0.6], [3, 0.7]]) for (const q of views[n]['boba.queue'].home.spots) {
    assert.ok(Math.abs(q.z - boba.SHOP.z - dz) < 1e-9, `lv${n} queue ${dz} in front of the shop`);
    if (n >= 3) assert.ok(edgeDist(q) >= 0.7, `lv${n} open ground in front of the queue (${edgeDist(q).toFixed(2)} to the cell edge)`);
  }
  const F = boba.FOUNTAIN, r = boba.FOUNTAIN_R, R = bulb.ROAD;
  const segD = (p, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz))); return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t); };
  const road = Math.min(...R.map((a, i) => segD(F, a, R[(i + 1) % R.length]))) - r;
  assert.ok(road >= Math.max(0.1, PAD), `fountain ${road.toFixed(3)} from the electrician's road`);
  const boxGap = (p, f, at) => Math.hypot(Math.max(0, Math.abs(p.x - at.x - f.x) - f.w / 2), Math.max(0, Math.abs(p.z - at.z - f.z) - f.d / 2));
  for (let b = 2; b <= 9; b++) { const m = bulb.view(lv({ bulb: b }), {})['bulb.market']; for (const f of m.footprint) assert.ok(boxGap(F, f, m.at) - r >= 0.1, `bulb ${b}: fountain ${(boxGap(F, f, m.at) - r).toFixed(3)} from a stall`); }
  const shop = views[4]['boba.main'].footprint; assert.ok(boxGap(F, { x: 0, z: 0, ...shop }, boba.SHOP) >= r, 'fountain clear of the shop body');
});
// 人龍（§13.3、計畫 3.8 Task 7）：一排、同一個 z、沿 x 間距 0.25、都面向攤車／店；店門口那排離捷運站、月台的入口 ≥ 0.25
test('the queue is one horizontal row facing the cart (Lv2) or the shop door (Lv3+); clear of the station and platform entries', () => {
  for (const [n, shop] of [[2, false], [3, true], [6, true]]) {
    const q = views[n]['boba.queue'].home.spots;
    assert.deepEqual(q, boba.queue(AT, 3, shop));
    for (const p of q) {
      assert.ok(Math.abs(p.z - q[0].z) < 1e-9, `lv${n} one row`);
      assert.ok(Math.abs(p.yaw - Math.atan2(boba.SHOP.x - p.x, boba.SHOP.z - p.z)) < 1e-9, `lv${n} faces the shop`);
      assert.deepEqual(cellAt(p.x, p.z), CELL);
      for (const o of [token.POST, token.DOOR, token.STAFF_ENTRY, ...baseball.CROWD_ENTRY]) assert.ok(Math.hypot(p.x - o.x, p.z - o.z) >= 0.25, `lv${n} (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) clear of (${o.x.toFixed(2)}, ${o.z.toFixed(2)})`);
    }
    for (let i = 1; i < q.length; i++) assert.ok(Math.abs(q[i - 1].x - q[i].x - 0.25) < 1e-9, `lv${n} spacing`);
    assert.ok(q[0].z > boba.SHOP.z + 0.5, `lv${n} in front of the shop`);
  }
  // 珍奶店開張：人龍挪到店門口（換一排）
  assert.notDeepEqual(views[2]['boba.queue'].home.spots, views[3]['boba.queue'].home.spots);
  assert.ok(views[3]['boba.queue'].home.spots[0].z > views[2]['boba.queue'].home.spots[0].z, 'the shop queue is at the door, further south');
});
// 珍奶店：Quaternius 店面＋Kenney 茶杯招牌（glb）、遮雨棚；店面重上色票
test('Lv3 shop: Quaternius Sign_Mat building with the palette tint, a Kenney cup-tea sign on the roof, an awning', () => {
  const v = views[3], m = v['boba.main'];
  assert.ok(m.path.startsWith('quat/buildings/') && m.path.includes('_Sign_Mat'), m.path);
  for (const c of Object.values(m.tint)) assert.ok(PALETTE.has(c), `tint ${c.toString(16)}`);
  assert.equal(v['boba.sign'].path, 'kenney/food/cup-tea.glb'); assert.ok(v['boba.sign'].at.y >= m.at.y + m.h - 1e-9, 'cup on the roof');
  for (const p of [m.path, v['boba.sign'].path, boba.MODELS.drone.path, boba.MODELS.boat.path]) assert.ok(existsSync(new URL(`../assets/${p}`, import.meta.url)), p);
  assert.ok(v['boba.yard'].parts.filter(p => p.rot?.[0] > 0.3).length >= 3, 'awning strips over the door');
  assert.ok(m.footprint.w > 0.7 && m.footprint.d > 0.7, 'the shop blocks walkers');
});
// 噴泉在店側邊（§4.7「不擋店」）：噴泉中心不在店與鏡頭之間（往鏡頭方向的分量 ≤ 0）、往側邊至少 0.6；兩個 footprint 不重疊
test('Lv4 fountain sits beside the shop on the side away from the camera, so the shop is never hidden', () => {
  const v = views[4], F = v['boba.fountain'].at, S = v['boba.main'].at, d = { x: F.x - S.x, z: F.z - S.z };
  const toward = d.x * CAM.x + d.z * CAM.z, side = Math.abs(d.x * CAM.z - d.z * CAM.x);
  assert.ok(toward <= 0, `fountain ${toward.toFixed(2)} toward the camera`); assert.ok(side >= 0.6, `fountain ${side.toFixed(2)} to the side`);
  const fr = v['boba.fountain'].footprint.r, fw = v['boba.main'].footprint.w / 2;
  assert.ok(Math.abs(d.x) - fr >= fw || Math.abs(d.z) - fr >= fw, 'footprints do not overlap');
  // frontOf 的反向：店的鏡頭側那一點（店前 1.0）到店中心的連線不穿過噴泉
  for (let u = 0; u <= 1; u += 0.05) { const p = { x: S.x + CAM.x * u, z: S.z + CAM.z * u }; assert.ok(Math.hypot(p.x - F.x, p.z - F.z) > fr, 'line of sight clear'); }
});
// 老闆的站位每一級、每一種夜市（燈泡 0–9）、車站（代幣 0–10）都走得到（原本攤車後面被夜市第四攤擋住）
test('the owner\'s spot is walkable at every boba level, every bulb level and every station', () => {
  const nav = createNav();
  for (let n = 1; n <= 6; n++) for (let b = 0; b <= 9; b++) for (const t of [0, 3, 9]) {
    const L = lv({ boba: n, bulb: b, token: t, baseball: 8 }), all = [boba, bulb, token, baseball].flatMap(m => Object.values(m.view(L, {})));
    nav.setFootprints(all.flatMap(p => [].concat(p.footprint || []).map(f => ({ ...f, x: p.at.x + (f.x ?? 0), z: p.at.z + (f.z ?? 0) }))));
    const o = boba.view(L, {})['boba.owner'].home.spots[0];
    assert.ok(nav.walkable(o.x, o.z), `boba ${n} bulb ${b} token ${t}: owner (${o.x.toFixed(2)}, ${o.z.toFixed(2)})`);
    for (const q of boba.view(L, {})['boba.queue']?.home.spots ?? []) assert.ok(nav.walkable(q.x, q.z), `boba ${n} bulb ${b} token ${t}: queue (${q.x.toFixed(2)}, ${q.z.toFixed(2)})`);
  }
});
// ◆ Lv5 旗艦店（衛星島 view）：燈塔島上的店、靠岸的小船、住在島上的兩個觀光客；兩台外送無人機（kind 'orbit'）繞店飛一小圈
test('Lv5: flagship on the lighthouse island, the ferry moored off it, two tourists living there; two delivery drones orbit the shop', () => {
  const v = views[5];
  assert.ok(onLighthouse(v['boba.flagship'].at), 'flagship on the lighthouse island');
  assert.ok(Math.hypot(v['boba.flagship'].at.x - LIGHT.x, v['boba.flagship'].at.z - LIGHT.z) > 1.0, 'clear of the lighthouse and the keeper ring');
  // 計畫 11 任務 3 審稿：店體（主島那款，size 乘 h / 高）對觀光客站位與守塔人環（繞燈塔 r 0.6）的間距——店不壓到人
  { const S = boba.MODELS.shop.size, k = boba.ISLET_SHOP_H / S[1], hw = S[0] * k / 2, hd = S[2] * k / 2, F = boba.FLAGSHIP;
    const box = p => Math.hypot(Math.max(0, Math.abs(p.x - F.x) - hw), Math.max(0, Math.abs(p.z - F.z) - hd));
    for (const t of boba.TOURIST_SPOTS) assert.ok(box(t) >= 0.3, `tourist spot ${box(t).toFixed(2)} from the shop body`);
    assert.ok(box(LIGHT) - 0.6 >= 0.3, `keeper ring (r 0.6) ${(box(LIGHT) - 0.6).toFixed(2)} from the shop body`); }
  const f = v['boba.ferry']; assert.equal(f.path, boba.MODELS.boat.path); assert.equal(cellAt(f.at.x, f.at.z), null);
  assert.ok(Math.hypot(f.at.x - LIGHT.x, f.at.z - LIGHT.z) < HEX_R + 0.3, 'moored at the lighthouse island');
  const t = v['boba.tourists']; assert.deepEqual([t.kind, t.n, t.home.kind], ['roster', 2, 'stand']); assert.ok(t.home.spots.every(onLighthouse));
  for (const k of boba.DRONE_KEYS) {
    const d = v[k]; assert.equal(d.kind, 'orbit'); assert.equal(d.path, 'kenney/space/craft_miner.glb');
    assert.ok(near(d.at, boba.SHOP, 1e-9) && d.r <= 1.2, `${k} circles the shop (r ${d.r})`);
    assert.ok(near(d.park, boba.SHOP, 0.4) && d.park.y > boba.SHOP.y + 0.9, `${k} parks on the roof`);
    for (const c of Object.values(d.tint)) assert.ok(PALETTE.has(c));
  }
  // 小船的航線：碼頭（珍奶格東岸外的海上）→ 燈塔島；全程在海上（不切過主島、衛星島）、穿過環狀線時離橋墩 ≥ 0.8
  const P = boba.FERRY_PATH; assert.equal(cellAt(P[0].x, P[0].z), null); assert.ok(distToCell(P[0], CELL) < RING_R + 0.6, 'pier off the boba cell');
  for (let i = 1; i < P.length; i++) for (let u = 0; u <= 1; u += 0.02) {
    const x = P[i - 1].x + (P[i].x - P[i - 1].x) * u, z = P[i - 1].z + (P[i].z - P[i - 1].z) * u;
    assert.equal(cellAt(x, z), null, `leg ${i} on the water`);
    if (Math.abs(Math.hypot(x, z) - token.TRACK.radius) < 0.2) for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2 + 0.13; assert.ok(Math.hypot(x - Math.cos(a) * token.TRACK.radius, z - Math.sin(a) * token.TRACK.radius) > 0.8, 'clear of the pylons'); }
  }
  assert.ok(boba.SAIL <= 5, 'boat ride ≤ 5 s (R10)');
});
// ◆ Lv6 世界珍奶節：靠海的每一條主島格邊一束氣球（全部一個零件 ≤ 3 個 draw call；2026-10-28 錄影修正：不用旗子）；
// 船隊繞島，桅杆上掛圓燈籠（沒有任何矩形旗面）
test('Lv6: one balloon bunch on each sea-facing main-cell edge (one part, no flags), a lantern fleet circling the island', () => {
  const outer = MAIN_CELLS.flatMap(c => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]].filter(([dq, dr]) => !MAIN_CELLS.some(m => m[0] === c[0] + dq && m[1] === c[1] + dr)));
  assert.equal(boba.BALLOON_SPOTS.length, outer.length - 1, 'every sea edge but the dome-station edge');
  for (const p of boba.BALLOON_SPOTS) { const cell = cellAt(p.x, p.z); assert.ok(cell, 'on land'); assert.ok(distToCell(p, cell) > 1.9, 'by the coast'); }
  const coast = views[6]['boba.yard'].parts.filter(p => p.coast);
  assert.equal(coast.filter(p => p.kind === 'cylinder').length, boba.BALLOON_SPOTS.length, 'one string per spot');
  assert.equal(coast.filter(p => p.kind === 'sphere').length, 3 * boba.BALLOON_SPOTS.length, 'three balloons per string');
  assert.ok(coast.every(p => p.kind !== 'box' && !p.glow && !p.flag), 'no flag faces; one clay draw call');
  const fl = views[6]['boba.fleet']; assert.equal(fl.kind, 'fleet');
  assert.equal(fl.parts.filter(p => p.kind === 'sphere' && p.color === C.coral).length, boba.FLEET_N, 'a round lantern on every mast');
  assert.ok(fl.parts.every(p => p.kind !== 'box' || p.scale[0] > 0.1), 'no flag on the masts');
  for (const p of worldPoints(fl)) { const r = Math.hypot(p.x, p.z); assert.ok(r > 13.8 && r < 15.4, 'between the satellites and the sea boats'); }
  assert.equal(boba.view(lv({ boba: 6, typhoon: 2 }), {})['boba.fleet'], undefined, 'the fleet stays in port during the storm');
});

// ── MAX（修正批次 max-skip §B，使用者 2026-11-01「棒球和珍奶店的 level max 不夠明顯」）：Lv6 主島的店要變——
// 屋頂的杯子招牌變成超大充氣珍奶杯（同一個 glb、高 0.6–0.7、比店身矮）、店門口一座氣球拱門、店到噴泉一串三角旗（拱門與旗串在院子 compound 裡）──
test('MAX Lv6: the roof cup becomes a giant inflatable cup (same glb, h 0.6–0.7, under the shop height, still on the roof front); Lv3–5 keep the 0.32 cup', () => {
  for (let n = 3; n <= 5; n++) assert.equal(views[n]['boba.sign'].h, 0.32, `lv${n}`);
  const s = views[6]['boba.sign'], m = views[6]['boba.main'];
  assert.equal(s.path, boba.MODELS.cup.path); assert.equal(s.footprint, false);
  assert.ok(s.h >= 0.6 && s.h <= 0.7 && s.h < m.h, `cup h ${s.h}`);
  const w = m.footprint.w;
  assert.ok(Math.abs(s.at.y - (m.at.y + m.h)) < 1e-9 && Math.abs(s.at.x - m.at.x) < 1e-9, 'on the roof');
  const depth = s.h * boba.MODELS.cup.size[2] / boba.MODELS.cup.size[1];
  assert.ok(s.at.z > m.at.z && s.at.z + depth / 2 > m.at.z + w / 2 && s.at.z + depth / 2 < m.at.z + w / 2 + 0.15, 'its front at the roof front edge (overhangs ≤ 0.15)');
});
test('MAX Lv6: a balloon arch over the shop door (12–16 coral / yellow / white balloons on a half circle, a foot each side of the door, under the awning, no footprint, clear of the queue and the owner); none before Lv6', async () => {
  for (let n = 2; n <= 5; n++) assert.ok(!views[n]['boba.yard'].parts.some(p => p.arch || p.pennant), `lv${n} no arch / pennants`);
  const y = views[6]['boba.yard'], arch = y.parts.filter(p => p.arch), m = views[6]['boba.main'];
  assert.ok(arch.length >= 12 && arch.length <= 16 && arch.every(p => p.kind === 'sphere'), `${arch.length} balloons`);
  assert.ok(arch.every(p => [C.coral, C.yellow, C.white].includes(p.color)) && new Set(arch.map(p => p.color)).size === 3);
  assert.equal([].concat(y.footprint).length, 1, 'the yard footprint is still the sign only');
  const W = pt => ({ x: y.at.x + pt.pos[0], y: pt.pos[1], z: y.at.z + pt.pos[2] }), pts = arch.map(W);
  const door = m.at.x, front = m.at.z + m.footprint.w / 2;
  assert.ok(pts.some(p => p.x < door - 0.2 && p.y < 0.1) && pts.some(p => p.x > door + 0.2 && p.y < 0.1), 'a foot on each side of the door');
  assert.ok(pts.every(p => p.z > front && p.z < front + 0.12), 'right in front of the shop wall');
  assert.ok(Math.max(...pts.map(p => p.y)) > 0.4, 'rises over the door');
  const awning = y.parts.filter(p => p.rot?.[0] > 0.3), under = Math.min(...awning.map(p => p.pos[1] - 0.12 * Math.sin(0.45) - 0.03));
  assert.ok(pts.every(p => p.y + 0.05 < under + 0.08), 'under the awning');
  const people = [...views[6]['boba.queue'].home.spots, boba.ownerSpot(6)];
  for (const p of pts) for (const q of people) assert.ok(Math.hypot(p.x - q.x, p.z - q.z) >= 0.12 || p.y > 0.42, `balloon (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) clear of the person at (${q.x.toFixed(2)}, ${q.z.toFixed(2)})`);
});
test('MAX Lv6: a string of pennants from the shop to the fountain (five or more colours, clay, inside the cell)', () => {
  const y = views[6]['boba.yard'], flags = y.parts.filter(p => p.pennant), m = views[6]['boba.main'];
  assert.ok(flags.length >= 5 && new Set(flags.map(p => p.color)).size >= 5, `${flags.length} pennants`);
  assert.ok(y.parts.every(p => !p.glow), 'all clay: no extra draw call');
  const W = p => ({ x: y.at.x + p.pos[0], z: y.at.z + p.pos[2] }), F = boba.FOUNTAIN, pts = flags.map(W);
  const near = (p, q, d) => Math.hypot(p.x - q.x, p.z - q.z) < d;
  assert.ok(pts.some(p => near(p, F, 0.35)), 'reaches the fountain');
  assert.ok(pts.some(p => Math.abs(p.x - (m.at.x + m.footprint.w / 2)) < 0.2 && Math.abs(p.z - m.at.z) < 0.45), 'starts at the shop');
});
test('◆ Lv6: the giant cup comes in the same beat as the balloons and the arch', () => {
  const beats = boba.script.grow[6]({ kind: 'grow', item: 'boba', to: 6 }, { lv: lv({ boba: 6 }), flags: {} }, { B, roster: { members: () => [] } });
  const flat = bs => bs.flatMap(b => (b.kind === 'together' ? flat(b.beats) : [b])), first = flat(beats).find(b => b.kind === 'apply' && Array.isArray(b.only));
  assert.ok(['boba.yard', 'boba.sign'].every(k => first.only.includes(k)), String(first.only));
});
// ── draw call：整格（含旗艦店、小船、無人機、船隊）≤ 14 ──
function drawCalls(v) {
  const compound = parts => (parts.some(x => !x.glow) ? 1 : 0) + new Set(parts.filter(x => x.glow).map(x => x.glow)).size;
  return Object.values(v).reduce((t, p) => t + (p.kind === 'compound' || p.kind === 'fleet' ? compound(p.parts) : p.kind === 'glb' || p.kind === 'orbit' ? 1 + (p.glow ? 1 : 0) : 0), 0);
}
test('boba draw calls ≤ 14 at every level (fresh milk, storm included)', () => {
  for (let n = 1; n <= 6; n++) for (const extra of [{}, { milk: 4 }, { typhoon: 2 }]) {
    const d = drawCalls(boba.view(lv({ boba: n, ...extra }), {})); assert.ok(d <= 14, `lv${n} ${JSON.stringify(extra)}: ${d}`);
  }
});
// ── 不出格（§14.1）：footprint 的角都在珍奶格裡；主島上的零件、站位都在珍奶格裡（海岸的氣球、旗艦店、小船、船隊、無人機的圈例外）──
test('every boba footprint corner and every main-island part stays inside the boba cell', () => {
  for (let n = 1; n <= 6; n++) for (const [key, s] of Object.entries(boba.view(lv({ boba: n, milk: 4 }), {}))) {
    for (const f of [].concat(s.footprint || [])) {
      const cx = s.at.x + (f.x ?? 0), cz = s.at.z + (f.z ?? 0), [hx, hz] = f.r != null ? [f.r, f.r] : [f.w / 2, f.d / 2];
      for (const [dx, dz] of [[hx, hz], [hx, -hz], [-hx, hz], [-hx, -hz]]) assert.deepEqual(cellAt(cx + dx, cz + dz), CELL, `lv${n} ${key} corner`);
    }
    if (['boba.flagship', 'boba.flagship.sign', 'boba.ferry', 'boba.tourists', 'boba.fleet'].includes(key)) continue;
    const pts = s.kind === 'compound' ? worldPoints(s).filter((p, i) => !s.parts[i]?.coast) : [s.at, ...(s.home?.spots ?? [])];
    for (const p of pts) assert.ok(distToCell(p, CELL) < RING_R, `lv${n} ${key} (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
  }
});
test('view: the owner is an apron roster that fidgets, standing by the cart / shop door facing the head of the queue', () => {
  for (let n = 1; n <= 6; n++) {
    const o = views[n]['boba.owner'];
    assert.deepEqual([o.kind, o.n, o.accessory, o.home.kind, o.home.fidget, o.home.rescue], ['roster', 1, 'apron', 'stand', 'wave', true]);
    assert.deepEqual(o.home.spots[0], boba.ownerSpot(n));
  }
  for (const n of [2, 3]) { const o = boba.ownerSpot(n), q = boba.queue(AT, 1, n >= 3)[0]; assert.ok(Math.abs(o.yaw - Math.atan2(q.x - o.x, q.z - o.z)) < 1e-9, 'faces the head of the queue'); }
});

// ── 劇本 ──
const KEYS = ['boba.owner', 'boba.queue', 'boba.tourists', 'sat.forest', 'landmarks.islanders'];
const isBoba = to => e => e.kind === 'grow' && e.item === 'boba' && e.to === to;
// 照 order（放完再長 CLOSING_TURNS 回合）瞬間演到 pred 命中的那個事件，單獨 live 演（whole：整回合 live）
async function liveAt({ run, bubblesLog, rig }, order, pred, { whole = false } = {}) {
  let s = engine.createState(spec);
  const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  for (const step of steps) {
    const r = step(s); s = r.state;
    if (whole && r.events.some(pred)) { const n = bubblesLog.length, c = rig.log.length; return { events: r.events, secs: await run([...r.events, { kind: 'settle' }]), n, r: c }; }
    for (const e of r.events) {
      if (!whole && pred(e)) { const n = bubblesLog.length, c = rig.log.length; return { e, secs: await run([solo(e)]), n, r: c }; }
      await run([e], { instant: true });
    }
    await run([{ kind: 'settle' }], { instant: true });
  }
  throw new Error('event not found');
}
// 物品 v2 §6：一級 3–4.5 s；◆ Lv5、Lv6 6–8 s（含鏡頭平移與回全景的整段，show.elapsed；唯一正解 §5.3）
const KEY = [5, 6];
test('scripts: every boba level in the solution plays 3–4.5 s (◆ Lv5, Lv6 6–8 s whole), ends with LEVEL UP on boba, everyone home', async () => {
  const timing = {};
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show, run, bubblesLog } = h;
    let n = 0;
    const tracked = (evs, opts) => { if (!opts?.instant) n = bubblesLog.length; return run(evs, opts); };
    const seen = [];
    await playItem(show, tracked, order, 'boba', (e, secs) => {
      const to = e.kind === 'grow' ? e.to : 1, what = `${order.join('>')} ${e.kind} ${to}`; seen.push(to); (timing[to] ??= []).push(+secs.toFixed(1));
      assert.ok(secs >= 3 && secs <= (KEY.includes(to) ? KEY_MAX : SCRIPT_MAX), `${what} took ${secs.toFixed(2)} s`);
      if (KEY.includes(to)) assert.ok(show.elapsed >= 6 && show.elapsed <= KEY_MAX, `◆ ${what} whole event ${show.elapsed.toFixed(2)} s`);
      if (e.kind === 'grow') {
        const last = bubblesLog.slice(n).at(-1), hd = show.stage.headOf('boba');
        assert.equal(last?.text, 'LEVEL UP', what); assert.ok(Math.hypot(last.at.x - hd.x, last.at.y - hd.y, last.at.z - hd.z) < 0.3, `${what} LEVEL UP over boba`);
      }
      for (const k of KEYS) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', `${what} ${k}`);
      const v = boba.view(show.stage.lv, show.stage.flags);
      assert.equal(show.roster.members('boba.owner').length, 1, `${what} owner`);
      assert.equal(show.roster.members('boba.queue').length, v['boba.queue']?.n ?? 0, `${what} queue`);
    });
    // 修正批次 2：颱風外送只給噴泉廣場以上（≥4），正解的珍奶 Lv2 是自己長的 grow 事件（第 7 回合、鮮奶 ≥3）
    assert.deepEqual([...new Set(seen)].sort(), [1, 2, 3, 4, 5, 6], `boba events seen: ${seen}`);
  }
});
// Lv2 單獨演一次（照 order 演到上一級，改成 grow 事件單獨演）。修正批次 2 之前正解的 Lv2 是颱風外送（fx 的 delta）帶上去的；
// 現在外送只給 ≥4，正解的 Lv2 是 grow，這題照舊留著量單獨演的秒數與人龍
test('scripts: the level the typhoon delivery skips (Lv2) also plays 3–4.5 s: three tourists queue up', async () => {
  for (const [order, to] of SOLUTIONS.map(o => [o, 2])) {
    const h = await headlessShow();
    let s = engine.createState(spec), done = false;
    const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
    for (const step of steps) {
      const r = step(s);
      const i = r.events.findIndex(e => (e.kind === 'grow' && e.item === 'boba' && e.to === to) || (e.delta?.target === 'boba' && e.delta.to === to));
      if (i >= 0) {
        await h.run(r.events.slice(0, i), { instant: true });
        // 計畫 11 最終修正 #2：三個觀光客從碼頭一個接一個出發（間隔 ≥ 一人身寬 / 走路速度），不疊成一串走——
        //   整段劇本裡任兩個觀光客身體不相碰（≥ 0.64 × 兩人半徑相加；以前間隔 0.1 s，0.09 m 疊著走了 2.2 s）
        const update = h.show.update; let close = Infinity, who = '';
        h.show.update = (dt, t) => {
          update(dt, t); const q = h.show.roster.members('boba.queue').filter(m => !m.hidden);
          for (let a = 0; a < q.length; a++) for (let b = a + 1; b < q.length; b++) {
            const d = Math.hypot(q[a].pos.x - q[b].pos.x, q[a].pos.z - q[b].pos.z) / (radiusOf(q[a]) + radiusOf(q[b]));
            if (d < close) { close = d; who = `#${a}|#${b}`; }
          }
        };
        const secs = await h.run([{ kind: 'grow', item: 'boba', from: to - 1, to }]);
        h.show.update = update;
        assert.ok(secs >= 3 && secs <= SCRIPT_MAX, `${order.join('>')} lv${to} took ${secs.toFixed(2)} s`);
        assert.ok(close >= 0.64, `queue ${who} came within ${close.toFixed(2)} × (ra + rb)`);
        assert.equal(h.show.roster.members('boba.queue').length, 3);
        done = true; break;
      }
      s = r.state; await h.run([...r.events, { kind: 'settle' }], { instant: true });
    }
    assert.ok(done, `${order.join('>')} lv${to} reached`);
  }
});
test('◆ Lv5 and Lv6 are the key nodes; Lv6 puts 世界珍奶節 over 101 and ends on the overview before the LEVEL UP', () => {
  assert.deepEqual(Object.entries(boba.script.grow).filter(([, f]) => f.key).map(([n]) => +n), [5, 6]);
  const ctx = { B, roster: { members: () => [] } }, flat = bs => bs.flatMap(b => (b.kind === 'together' ? flat(b.beats) : [b]));
  const beats = flat(boba.script.grow[6]({ kind: 'grow', item: 'boba', to: 6 }, { lv: lv({ boba: 6 }), flags: {} }, ctx));
  const label = beats.find(b => b.kind === 'levelUp' && b !== beats.at(-1)); assert.ok(label, '101 label');
  const homes = beats.map((b, i) => (b.kind === 'focus' && b.target === 'home' ? i : -1)).filter(i => i >= 0);
  assert.ok(homes.length && beats[homes.at(-1)].dur >= 1 && beats.at(-1).kind === 'levelUp', 'holds the overview, then LEVEL UP');
});
// 計畫 11 §設計 3：鏡頭對著小森林島時那一拍就長出分店與杯子招牌（不是留到回珍奶格的最後一拍才出現在畫面外）
test('◆ Lv5: the forest shop and its cup sign appear in the beat right after the camera reaches the forest island', () => {
  const ctx = { B, roster: { members: () => [] } }, beats = boba.script.grow[5]({ kind: 'grow', item: 'boba', to: 5 }, { lv: lv({ boba: 5 }), flags: {} }, ctx);
  const i = beats.findIndex(b => b.kind === 'apply' && Array.isArray(b.only) && b.only.includes('sat.forest.stage1'));
  assert.equal(beats[i - 1].kind, 'focus'); assert.ok(['sat.forest.shop', 'sat.forest.sign', 'sat.forest'].every(k => beats[i].only.includes(k)), String(beats[i].only));
});
// 審稿（計畫 4 最後一輪）：「世界珍奶節」打在 101 頭頂上——鏡頭停在全景（裝得下 101 頭頂，§14.4）時打字；
// 原本跟 focus('tower') 一起演，拉近 101 格把頭頂切掉、字在畫面外
test('Lv6: 世界珍奶節 goes up over 101 while the camera holds the overview (the label never shares a beat with a focus)', () => {
  const beats = boba.script.grow[6]({ kind: 'grow', item: 'boba', to: 6 }, { lv: lv({ boba: 6 }), flags: {} }, { B, roster: { members: () => [] } });
  const i = beats.findIndex(b => b.kind === 'levelUp'), flat = bs => bs.flatMap(b => (b.kind === 'together' ? flat(b.beats) : [b]));
  const before = flat(beats.slice(0, i)).filter(b => b.kind === 'focus');
  assert.ok(i > 0 && before.length && before.at(-1).target === 'home' && before.at(-1).dur >= 1, `on the overview before the label (${beats.map(b => b.kind)})`);
  assert.ok(!beats.some(b => b.kind === 'together' && b.beats.some(x => x.kind === 'focus') && b.beats.some(x => x.kind === 'levelUp')), 'no focus + label together');
});
test('Lv6 live: the balloons and the fleet appear, 101 reads 世界珍奶節, the camera ends on the overview', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show, bubblesLog } = h;
    const { n, r } = await liveAt(h, order, isBoba(6));
    assert.ok(bubblesLog.slice(n).some(b => b.text === '世界珍奶節'), '101 label');
    assert.ok(show.stage.partObject('boba.fleet') && boba.view(show.stage.lv, show.stage.flags)['boba.yard'].parts.some(p => p.coast));
    assert.equal(focusTrail(h.rig.log, r).at(-1), 'home');
  }
});
// ◆ Lv5 live（分店＋旗艦店一段）：鏡頭先到小森林島（分店、茶屋、兩個觀光客閃白），再到燈塔島——小船從碼頭開到燈塔島（≤ 5 s），
// 兩個觀光客坐在船上（每幀跟著船），跳上岸、住在島上；LEVEL UP 回珍奶格；無人機起飛
test('Lv5 live: the forest branch appears, then the ferry carries two tourists from the pier to the lighthouse island; they hop ashore and stay; the drones take off', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show } = h, update = show.update, frames = [];
    let live = false;
    const run = h.run; h.run = (evs, o) => { live = !o?.instant; return run(evs, o); };
    show.update = (dt, t) => {
      update(dt, t); if (!live) return;
      const b = show.stage.partObject('boba.ferry'), ts = show.roster.members('boba.tourists');
      frames.push({ boat: b && { x: b.position.x, z: b.position.z }, ts: ts.map(m => ({ ...m.pos })), drone: show.stage.partObject('boba.drones.0')?.children[0]?.position.y });
    };
    const log = blinkLog(show), mark = () => log.calls.length;
    let from = 0; const run2 = h.run; h.run = (evs, o) => { if (!o?.instant) from = mark(); return run2(evs, o); };
    const { r } = await liveAt(h, order, isBoba(5));
    const what = order.join('>'), moving = frames.filter((f, i) => i && f.boat && frames[i - 1].boat && Math.hypot(f.boat.x - frames[i - 1].boat.x, f.boat.z - frames[i - 1].boat.z) > 1e-4);
    assert.ok(moving.length / 30 >= 1.5 && moving.length / 30 <= 5, `${what}: sailed ${(moving.length / 30).toFixed(2)} s`);
    assert.ok(near(moving[0].boat, boba.FERRY_PATH[0], 0.3), `${what}: leaves from the pier`);
    for (const f of moving) for (const p of f.ts) assert.ok(near(p, f.boat, 0.4), `${what}: tourists ride in the boat`);
    for (let i = 1; i < frames.length; i++) for (let k = 0; k < frames[i].ts.length; k++) {
      const a = frames[i - 1].ts[k], b = frames[i].ts[k]; if (a && b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.3, `${what}: no teleport`);
    }
    const ts = show.roster.members('boba.tourists'); assert.equal(ts.length, 2);
    for (const m of ts) { assert.ok(onLighthouse(m.pos), `${what}: lives on the lighthouse island`); assert.equal(m.mode, 'home'); }
    const b = show.stage.partObject('boba.ferry'); assert.ok(near(b.position, boba.DOCK, 1e-6), 'moored');
    const trail = focusTrail(h.rig.log, r).map(String), F = SATELLITES.find(x => x.kind === 'forest'), FC = axialToWorld(F.q, F.r);
    assert.deepEqual(trail.slice(-4), [String(worldToAxial(FC.x, FC.z)), String(worldToAxial(LIGHT.x, LIGHT.z)), String(CELL), 'home'], `${what}: ${trail}`);
    assert.equal(show.roster.members('sat.forest').length, 2); assert.ok(show.stage.partObject('sat.forest.stage1'), `${what}: forest branch`);
    assert.ok(show.stage.partObject('sat.lighthouse.stage2') && show.stage.partObject('boba.flagship'), `${what}: pier and flagship`);
    // 計畫 11 §設計 3：兩座離島店是建築——長出來（使用者 2026-10-31「閃一下」之後不亮）；屋頂的杯子招牌直接出現（不長、不亮）
    assert.ok(show.stage.partObject('sat.forest.shop') && show.stage.partObject('sat.forest.sign') && show.stage.partObject('boba.flagship.sign'), `${what}: both shops have a cup sign`);
    const grew = new Set(log.calls.slice(from).filter(c => c.fn === 'grow').map(c => c.key));
    for (const k of ['sat.forest.shop', 'boba.flagship']) assert.ok(grew.has(k), `${what}: ${k} grows (${[...grew]})`);
    for (const k of ['sat.forest.sign', 'boba.flagship.sign']) assert.ok(!log.calls.slice(from).some(c => c.key === k), `${what}: ${k} just appears`);
    const ys = frames.map(f => f.drone).filter(y => y != null); assert.ok(Math.max(...ys) - Math.min(...ys) > 0.3, `${what}: a drone takes off`);
  }
});
// 審查 I1／I3／M1：老闆照常速（1.6）從遠處推著攤車走來；每一幀攤車都在他面前 0.3–0.6；攤車在出發點出現（計畫 11 §設計 1：不亮，直接出現）、停在 SHOP
test('placed: the owner pushes the cart in at walking speed — every frame the cart is just in front of him — and it parks; ♪', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h, update = show.update, frames = [], blinks = [];
  const part = show.blink.part; show.blink.part = (o, ...rest) => { if (o === show.stage.partObject('boba.main')) blinks.push({ x: o.position.x, z: o.position.z }); return part(o, ...rest); };
  let cart0 = null, parked = false;
  show.update = (dt, t) => {
    update(dt, t);
    const o = show.roster.members('boba.owner')[0], cart = show.stage.partObject('boba.main');
    if (cart && cart.visible && !cart0) cart0 = { x: cart.position.x, z: cart.position.z };
    parked ||= !!cart && near(cart.position, boba.SHOP, 1e-9);   // 停好之後他繞到攤車東南角，那段不是推車
    if (o?.walking && cart && !parked) frames.push({ o: { ...o.pos }, yaw: o.yaw, speed: o.speed, c: { x: cart.position.x, z: cart.position.z } });
  };
  const { n } = await liveAt(h, SOLUTIONS[0], e => e.kind === 'placed' && e.item === 'boba');
  assert.ok(frames.every(f => f.speed === 1.6), 'walking speed');
  for (const [i, f] of frames.entries()) {
    const dx = f.c.x - f.o.x, dz = f.c.z - f.o.z, d = Math.hypot(dx, dz), dot = Math.sin(f.yaw) * dx + Math.cos(f.yaw) * dz;
    assert.ok(d >= 0.3 && d <= 0.6, `frame ${i}: cart ${d.toFixed(2)} from the owner`); assert.ok(dot > 0, `frame ${i}: cart in front`);
  }
  assert.ok(Math.hypot(frames[0].o.x - AT.x, frames[0].o.z - AT.z) > 3, 'starts far away');
  assert.ok(cart0 && near(cart0, frames[0].c, 0.1), 'the cart appears where it starts'); assert.deepEqual(blinks, [], 'without a glow');
  const cart = show.stage.partObject('boba.main');
  assert.ok(near(cart.position, boba.SHOP, 1e-9) && cart.rotation.z === 0, 'cart parked');
  assert.ok(bubblesLog.slice(n).some(b => b.kind === '♪'));
  for (let i = 0; i < 300; i++) show.update(1 / 30, 100 + i / 30);
  assert.ok(near(show.roster.members('boba.owner')[0].pos, boba.ownerSpot(1), 0.1), 'owner by the cart');
});
// 正解的 Lv2 是颱風外送帶上去的（fx）：用珍奶照常 1 → 2 的放法（命中那局，第 8 回合鮮奶 3 帶珍奶 2）
test('Lv2: three tourists come from the pier and stand in the queue', async () => {
  const h = await headlessShow(), { show } = h, update = show.update, firsts = new Map();
  show.update = (dt, t) => { update(dt, t); for (const m of show.roster.members('boba.queue')) if (!firsts.has(m)) firsts.set(m, { ...m.pos }); };
  await liveAt(h, SOLUTIONS[0], isBoba(2));   // 計畫 14：舊的順序珍奶在老鼠 Lv2 之後放、被咬住長不到 2，改用正解（第 6 回合放下當回合 2）
  assert.equal(firsts.size, 3);
  for (const p of firsts.values()) assert.ok(boba.PIER.some(q => near(p, show.nav.nearestWalkable(q), 0.3)), 'spawned at the pier');
  for (let i = 0; i < 300; i++) show.update(1 / 30, 100 + i / 30);
  const spots = boba.view(show.stage.lv, show.stage.flags)['boba.queue'].home.spots;
  show.roster.members('boba.queue').forEach((m, i) => assert.ok(near(m.pos, spots[i], 0.1), `tourist ${i} in line`));
});
// 珍奶店：老闆在攤車旁揮鐵鎚 → 店面閃白；人龍走到店門口、老闆走到店門旁，站定後每個人都在自己的站位上（不卡）
test('Lv3: the owner builds, the shop appears, the queue and the owner move to the shop door and settle there', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show } = h;
    await liveAt(h, order, isBoba(3));
    assert.equal(show.stage.partObject('boba.main') && boba.view(show.stage.lv, show.stage.flags)['boba.main'].kind, 'glb');
    for (let i = 0; i < 450; i++) show.update(1 / 30, 100 + i / 30);
    const v = boba.view(show.stage.lv, show.stage.flags);
    show.roster.members('boba.queue').forEach((m, i) => assert.ok(near(m.pos, v['boba.queue'].home.spots[i], 0.1), `${order.join('>')} tourist ${i} at the door`));
    assert.ok(near(show.roster.members('boba.owner')[0].pos, boba.ownerSpot(3), 0.1), 'owner by the door');
  }
});
// 物品 v2：糖分超標在珍奶 Lv4（唯一正解 Task 1 裁決：鮮奶 ≤4），旗標事件緊接在 grow 4 後面，島民的 ♥ 演在旗標事件（boba 的 fx 劇本）。
// 放法：求解器列舉裡第一條立了糖分超標的（SUGAR）
test('Lv4 with low milk is the sugar rush: the people on the main island ♥', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  let s = engine.createState(spec), e4 = null, rest = [];
  for (const step of [...SUGAR.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))]) {
    const r = step(s); s = r.state;
    const i = r.events.findIndex(isBoba(4));
    if (i >= 0) { await run(r.events.slice(0, i), { instant: true }); e4 = r.events[i]; rest = r.events.slice(i + 1); break; }
    await run([...r.events, { kind: 'settle' }], { instant: true });
  }
  assert.ok(e4, 'boba reaches Lv4'); assert.equal(rest[0]?.flag?.name, 'bobaSugar', 'the sugar flag follows');
  const n = bubblesLog.length, secs = await run([e4, ...rest, { kind: 'settle' }]);
  // 修正批次 max-skip §E：島民只剩一位（代幣 Lv2 起沒有），一起 ♥ 的是主島上在日常裡的人（最多 10 位；珍奶 Lv4 本身的 ♥ 是 2 個）
  const all = bubblesLog.slice(n).filter(b => b.kind === '♥'), hearts = all.length;
  assert.ok(hearts >= 2 + 5, `${hearts} ♥: the sugar rush has a crowd`);
  assert.ok(hearts <= 2 + 10, `${hearts} ♥: the sugar rush caps at 10 people (+ the 2 of boba Lv4)`);
  for (const b of all) assert.ok(MAIN_CELLS.some(c => String(c) === String(cellAt(b.at.x, b.at.z))), `♥ at (${b.at.x.toFixed(2)}, ${b.at.z.toFixed(2)}) on a main-island cell`);
  assert.ok(secs <= 20, `${secs.toFixed(1)} s`);
  assert.equal(show.stage.flags.bobaSugar, true);
});
// ── 碼頭入口（§13.2）：珍奶格靠海那側、走得到、離每個站位 ≥ 1.5（每一級；正解每一刻的真 footprint）──
test('the pier entry is in the boba cell by the sea, walkable and ≥ 1.5 from every queue spot at every level', async () => {
  const c = axialToWorld(...CELL);
  assert.ok(!MAIN_CELLS.some(([q, r]) => q === CELL[0] + 1 && r === CELL[1]), 'east of the boba cell is sea');
  for (const p of boba.PIER) { assert.deepEqual(cellAt(p.x, p.z), CELL); assert.ok(p.x > c.x + 0.5, 'east half'); }
  const nav = createNav(), bad = [];
  for (let n = 1; n <= 6; n++) for (const b of [0, 2, 4, 9]) {
    const L = lv({ boba: n, bulb: b, milk: 4 }), v = boba.view(L, {});
    nav.setFootprints([...Object.values(v), ...Object.values(bulb.view(L, {}))].flatMap(p => [].concat(p.footprint || []).map(f => ({ ...f, x: p.at.x + (f.x ?? 0), z: p.at.z + (f.z ?? 0) }))));
    if (v['boba.queue']) assert.deepEqual(v['boba.queue'].home.entry, boba.PIER, `lv${n} queue entry`);
    bad.push(...entryProblems(v, nav, `lv${n} bulb${b}`));
  }
  bad.push(...await entriesThroughSolutions(boba, SOLUTIONS));
  assert.deepEqual(bad, []);
});

// 拜訪點（計畫 6 設計 §4、§5）：正解每一個 boba 的 placed／grow，演之前與演完之後問 visitSpot——在格子裡、站位走得到；問到的級寫死
test('visitSpot(n, s) for every level 1..max: on the main island cell of the item (or null for off-island levels), frontOf(spot, r, nav) walkable within 0.6', async () => {
  const { visitSpotsThroughSolutions } = await import('./helpers/show.js');
  assert.equal(typeof boba.visitSpot, 'function');
  const { bad, seen } = await visitSpotsThroughSolutions(boba, SOLUTIONS, { cells: () => [[0, 1]] });
  assert.deepEqual(bad, []);
  assert.deepEqual(seen, [1, 2, 3, 4, 6]);   // Lv5 在離島（null）；修正批次 2：Lv2 是 grow（颱風外送只給 ≥4）
});

// 轉動矩陣用 three.js 自己的 Euler／Matrix4 算（獨立對照，不跟原始碼同一份公式；修正輪 1 審稿 Minor）
const rotXYZ = r => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...r)).elements;
const rotZ = t => new THREE.Matrix4().makeRotationZ(t).elements;
const mul = (A, B) => new THREE.Matrix4().fromArray(A).multiply(new THREE.Matrix4().fromArray(B)).elements;
// 計畫 13 任務 2（使用者 2026-11-01「第一階段的珍奶店太醜請重新設計」）：夜市的珍奶攤車——奶油色車身＋珊瑚裙板＋木色檯面、
// 紅白直條遮雨棚（前緣一排小波浪）、棚上一支細桿頂著珍奶杯（杯蓋、吸管、三顆珍珠）、兩個小輪子、木色推桿（老闆那側）、檯面上兩杯小珍奶。
// 車身尺寸、footprint 不變（0.6 × 0.5，推車、老闆站位、立牌都不搬）；不發光（一個 mesh）
test('the Lv1–2 cart: a night-market boba stall — body, skirt, counter, striped canopy with scallops, sign cup on a pole, two small wheels, push bar, two cups; footprint unchanged, no glow, one mesh', async () => {
  for (const n of [1, 2]) {
    const cart = views[n]['boba.main'], P = cart.parts;
    assert.equal(cart.kind, 'compound'); assert.deepEqual(cart.footprint, { w: 0.6, d: 0.5 }, `lv${n} footprint unchanged`);
    assert.ok(P.length <= 26, `lv${n}: ${P.length} parts`);
    assert.ok(P.every(p => !p.glow), 'nothing glows');
    for (const p of P) assert.ok(PALETTE.has(p.color) || p.color === boba.TEA, `colour ${p.color.toString(16)}`);
    const body = P.find(p => p.kind === 'box' && p.color === C.wall);
    assert.deepEqual(body.scale, [0.6, 0.5, 0.42], 'the body keeps the cart size');
    const skirt = P.find(p => p.kind === 'box' && p.color === C.coral && Math.abs(p.scale[1] - 0.18) < 1e-9);
    assert.ok(skirt && skirt.pos[1] < body.pos[1], 'coral skirt on the lower half');
    const counter = P.find(p => p.kind === 'box' && p.color === C.wood && Math.abs(p.scale[1] - 0.04) < 1e-9);
    assert.ok(counter && Math.abs(counter.pos[1] - (body.pos[1] + 0.25 + 0.02)) < 1e-9 && counter.scale[0] > body.scale[0] && counter.scale[2] > body.scale[2], 'wood counter on top, sticking out a little');
    const stripes = P.filter(p => p.kind === 'box' && Math.abs(p.scale[0] - 0.16) < 1e-9 && p.pos[1] > counter.pos[1] + 0.2);
    assert.equal(stripes.length, 5, 'five canopy stripes');
    stripes.sort((a, b) => a.pos[0] - b.pos[0]).forEach((s, i) => assert.equal(s.color, i % 2 ? C.white : C.coral, `stripe ${i} alternates coral / white`));
    const canopyY = stripes[2].pos[1];
    assert.ok(Math.abs(canopyY - counter.pos[1] - 0.3) < 0.05, `canopy 0.3 over the counter (${(canopyY - counter.pos[1]).toFixed(2)})`);
    assert.equal(P.filter(p => p.kind === 'dome' && p.pos[1] < canopyY && p.pos[2] > 0.2).length, 3, 'three scallops on the front edge');
    const cup = P.find(p => p.kind === 'cylinder' && p.color === boba.TEA && Math.abs(p.scale[0] - 0.14) < 1e-9);
    assert.ok(cup && cup.pos[1] > canopyY + 0.2 && cup.pos[0] < 0, 'sign cup above the canopy, on the left');
    assert.ok(P.some(p => p.kind === 'box' && Math.abs(p.scale[0] - 0.03) < 1e-9 && p.pos[1] > canopyY && p.pos[1] < cup.pos[1]), 'the pole under the cup');
    assert.ok(P.some(p => p.kind === 'dome' && p.color === C.white && p.pos[1] > cup.pos[1]), 'cup lid');
    assert.ok(P.some(p => p.kind === 'box' && p.color === C.coral && p.pos[1] > cup.pos[1] + 0.1), 'straw');
    assert.equal(P.filter(p => p.kind === 'sphere' && p.color === C.ink && Math.abs(p.pos[1] - cup.pos[1]) < 0.1).length, 3, 'three pearls in the cup');
    const wheels = P.filter(p => p.kind === 'torus');
    assert.equal(wheels.length, 2); assert.ok(wheels.every(w => w.scale === 0.18 && Math.abs(w.pos[1] - 0.09) < 1e-9 && w.pos[0] < 0), 'two small wheels (r 0.09) toward the back');
    // 推桿（修正輪 1：原本 0.30 → 0.63 幾乎直立，推車時豎在老闆臉前）：從車身後面 0.2 高接出、接近水平地伸到 x ≈ −0.42、y ≈ 0.22
    const bar = P.find(p => p.kind === 'box' && p.color === C.wood && p.pos[0] < -body.scale[0] / 2 && p.rot);
    assert.ok(bar, 'push bar out of the back (the owner side)');
    const axis = new THREE.Vector3(0, bar.scale[1] / 2, 0).applyEuler(new THREE.Euler(...bar.rot)), ends = [1, -1].map(s => [bar.pos[0] + s * axis.x, bar.pos[1] + s * axis.y]).sort((a, b) => b[0] - a[0]);
    assert.ok(Math.abs(ends[0][0] + body.scale[0] / 2) < 0.01 && Math.abs(ends[0][1] - 0.2) < 0.01, `starts at the back face, 0.2 high (${ends[0].map(v => v.toFixed(3))})`);
    assert.ok(Math.abs(ends[1][0] + 0.42) < 0.01 && Math.abs(ends[1][1] - 0.22) < 0.01, `ends near (−0.42, 0.22) (${ends[1].map(v => v.toFixed(3))})`);
    assert.equal(P.filter(p => p.kind === 'cylinder' && p.color === boba.TEA && Math.abs(p.scale[1] - 0.08) < 1e-9 && p.pos[1] > counter.pos[1]).length, 2, 'two little cups on the counter');
  }
  // 合併成一個黏土 mesh（同現在：沒有發光）
  const { createPartFactory } = await import('../src/actors/parts.js'), { createGlowRegistry } = await import('../src/scene/glow.js');
  const f = createPartFactory(THREE, { glow: createGlowRegistry(), builders: {} });
  for (const v of [views[1]['boba.main'], boba.view(lv({ boba: 1 }), { cartBlown: true })['boba.main']]) assert.equal(f.build(v).object.children.length, 1, 'one mesh');
});
// 攤車被吹走（修正批次 2：颱風放下時珍奶 ≤3，flags.cartBlown）：攤車翻倒在珍奶格東岸外的淺水裡（不在島上、沒有 footprint、放晴的堤防碰不到），
// 老闆站到岸邊走得到的地方、面向海（fidget look）；Lv3 店還在，被吹走的是店前那台攤車（boba.blown）
test('view: a blown cart lies tipped in the sea off the boba cell, the owner stands on the shore looking at it; at Lv3 the shop stays and the cart is boba.blown', async () => {
  const { LEVEE_R } = await import('../src/actors/typhoon.js');
  const c = axialToWorld(...CELL), nav = createNav();
  for (const n of [1, 2, 3]) {
    const v = boba.view(lv({ boba: n, milk: 3 }), { cartBlown: true }), cart = n < 3 ? v['boba.main'] : v['boba.blown'];
    assert.equal(cart.kind, 'compound'); assert.equal(cart.footprint, false, `Lv${n} no footprint`);
    assert.ok(near(cart.at, boba.BLOWN, 1e-9), `Lv${n} at BLOWN`); assert.equal(cellAt(cart.at.x, cart.at.z), null, 'in the sea, off the island');
    assert.ok(Math.hypot(cart.at.x - c.x, cart.at.z - c.z) > LEVEE_R + 0.1, 'outside the Lv3 levee');
    // 計畫 13 任務 2：新攤車的零件自己帶轉角（遮雨棚斜面、波浪倒掛、推桿），翻倒＝每個零件的轉角與位置都是「直立攤車整台繞 z 轉 TIP（< −1，頂朝外海）」
    const upright = views[1]['boba.main'].parts, T = boba.CART_TIP;
    assert.ok(T < -1, 'tipped toward the sea');
    assert.equal(cart.parts.length, upright.length);
    cart.parts.forEach((p, i) => {
      const u = upright[i], want = mul(rotZ(T), rotXYZ(u.rot ?? [0, 0, 0])), got = rotXYZ(p.rot ?? [0, 0, 0]);
      assert.ok(want.every((x, k) => Math.abs(x - got[k]) < 1e-9), `part ${i} (${u.kind}) rotated by TIP`);
      const [x, y] = u.pos; assert.ok(Math.abs(p.pos[0] - (x * Math.cos(T) - y * Math.sin(T))) < 1e-9 && Math.abs(p.pos[1] - (x * Math.sin(T) + y * Math.cos(T))) < 1e-9 && p.pos[2] === u.pos[2], `part ${i} position`);
    });
    assert.ok(cart.parts.some(p => p.pos[1] > 0.2), 'part of it still above the water');
    const o = v['boba.owner'].home;
    assert.equal(o.fidget, 'look'); assert.deepEqual(o.spots, [boba.blownSpot()]);
    assert.ok(nav.walkable(o.spots[0].x, o.spots[0].z), 'the owner spot is walkable');
    assert.ok(Math.abs(o.spots[0].yaw - Math.atan2(boba.BLOWN.x - o.spots[0].x, boba.BLOWN.z - o.spots[0].z)) < 1e-9, 'facing the cart in the sea');
  }
  const shop = boba.view(lv({ boba: 3, milk: 3 }), { cartBlown: true });
  assert.equal(shop['boba.main'].kind, 'glb', 'the Lv3 shop still stands');
  assert.equal(boba.view(lv({ boba: 2, milk: 3 }), {})['boba.blown'], undefined);
  assert.ok(near(boba.view(lv({ boba: 2, milk: 3 }), {})['boba.main'].at, boba.SHOP, 1e-9), 'not blown: the cart at its stall');
});

// ── 修正批次 fix3 §A（使用者 2026-11-01「珍奶店升級時顧客會穿越招牌」）：院子的立牌擋人 ──
// boba.yard 的 footprint 只有立牌（磚地、遮雨棚走得過去），蓋住立牌的板子；院子不因為有了 footprint 就變成會長的建築（照舊直接出現）。
// 人龍三個站位（攤車前、店門口）、老闆站位、攤車被吹走時岸邊的站位、碼頭入口都在立牌外擴 PAD 之外；噴泉本身不碰外擴後的立牌
const signPad = async n => {
  const { PAD } = await import('../src/show/nav.js'), y = boba.view(lv({ boba: n }), {})['boba.yard'], f = [].concat(y.footprint);
  assert.equal(f.length, 1, `lv${n} one footprint: the sign only`);
  return { x: y.at.x + f[0].x, z: y.at.z + f[0].z, hx: f[0].w / 2 + PAD, hz: f[0].d / 2 + PAD, body: f[0], yard: y };
};
const inBox = (b, p, grow = 0) => Math.abs(p.x - b.x) <= b.hx + grow && Math.abs(p.z - b.z) <= b.hz + grow;
test('fix3 A: the yard sign blocks walkers (footprint over the board only); every queue / owner / shore / pier spot is outside the padded sign', async () => {
  const { growsOn } = await import('../src/actors/stage.js');
  for (const n of [2, 3, 4, 6]) {
    const b = await signPad(n), board = b.yard.parts.find(p => p.sign), [px, , pz] = board.pos;
    assert.ok(Math.abs(b.body.x - px) < 1e-9 && Math.abs(b.body.z - pz) < 1e-9, `lv${n} footprint centred on the board`);
    assert.ok(b.body.w >= board.scale[0] - 1e-9 && b.body.d >= board.scale[2] * 2 - 1e-9, `lv${n} footprint covers the board (${b.body.w} × ${b.body.d})`);
    assert.equal(growsOn(b.yard), false, `lv${n} the yard still just appears (no grow)`);
    // 修正輪 1：板子不插進店的東牆（Lv3 起店身 SHOP_W 見方）
    if (n >= 3) { const shop = boba.view(lv({ boba: n }), {})['boba.main'], wall = shop.at.x + shop.footprint.w / 2, west = b.yard.at.x + px - board.scale[0] / 2;
      assert.ok(west >= wall + 0.005, `lv${n} board west end ${(west - wall).toFixed(3)} outside the shop wall`); }
    const v = boba.view(lv({ boba: n }), {});
    for (const q of [...v['boba.queue'].home.spots, boba.ownerSpot(n), boba.blownSpot(), ...boba.PIER]) assert.ok(!inBox(b, q), `lv${n} spot (${q.x.toFixed(2)}, ${q.z.toFixed(2)}) clear of the padded sign`);
    if (n >= 4) {
      const F = boba.FOUNTAIN, gap = Math.hypot(Math.max(0, Math.abs(F.x - b.x) - b.hx), Math.max(0, Math.abs(F.z - b.z) - b.hz));
      assert.ok(gap > boba.FOUNTAIN_R, `fountain ${(gap - boba.FOUNTAIN_R).toFixed(3)} clear of the padded sign`);
    }
  }
});
// 整局 live：珍奶 1 → 2（立牌出現、人龍從碼頭走來排隊）與 2 → 3（店開張、人龍挪到店門口）那兩回合整段 live 演，各再過 10 s 日常——
// 每一幀人龍、老闆都不在外擴後的立牌裡（唯一正解，和一條珍奶早放的順序：第 4 回合 1 → 2、第 6 回合 2 → 3——
// 修好之前這條順序的 1 → 2 有兩個觀光客從碼頭走來時直直穿過立牌）
test('fix3 A live: in the boba 1 → 2 and 2 → 3 turns (and 10 s after each) no queue member ever stands inside the padded sign (solution + boba-early order)', async () => {
  // 立牌的板子（view 的零件，不看 footprint：修好之前也量得到）外擴成板寬 × 0.08 + PAD 的框
  const { PAD } = await import('../src/show/nav.js'), y = boba.view(lv({ boba: 3 }), {})['boba.yard'], sign = y.parts.find(p => p.sign), [px, , pz] = sign.pos;
  const b = { x: y.at.x + px, z: y.at.z + pz, hx: sign.scale[0] / 2 + PAD, hz: 0.04 + PAD };
  const { turnSteps } = await import('./helpers/show.js');
  for (const order of [...SOLUTIONS, ['milk', 'baseball', 'token', 'boba', 'bulb', 'chip', 'typhoon', 'rat']]) {
    const h = await headlessShow(), { show, run } = h, update = show.update, hits = [];
    let frames = 0, on = false, live = 0, s = engine.createState(spec);
    show.update = (dt, t) => {
      update(dt, t); if (!on) return; frames++;
      for (const k of ['boba.queue', 'boba.owner']) for (const m of show.roster.members(k)) if (!m.hidden && inBox(b, m.pos)) hits.push(`${k}#${m.i} ${m.mode} (${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)})`);
    };
    for (const step of turnSteps(order)) {
      const r = step(s); s = r.state;
      on = r.events.some(e => e.kind === 'grow' && e.item === 'boba' && (e.to === 2 || e.to === 3));
      await run([...r.events, { kind: 'settle' }], { instant: !on });
      if (on) { live++; for (let i = 0; i < 300; i++) show.update(1 / 30, 200 * live + i / 30); }
    }
    assert.equal(live, 2, `${order.join('>')}: both turns played live`); assert.ok(frames > 300, 'frames');
    assert.deepEqual([...new Set(hits)].slice(0, 5), [], `${order.join('>')}: ${hits.length} frames inside the sign`);
  }
});
// 立牌不關住任何走路格（fix3 §A 實作時量到）：店東牆和格邊之間只有一排格點，立牌的框蓋住那一排的話，Lv3（店、還沒有噴泉）夜市第二攤在北邊時
// 店東側北半截被整個關起來。每一種珍奶 × 燈泡 × 車站：格子裡每一個可走格點往外淹（nav.edgePoint）都淹得出去（離起點 ≥ 1.5）——沒有立牌時淹得出去的，有了立牌也要
test('fix3 A: the sign never seals off a pocket of the walking grid (every boba × bulb × station level)', () => {
  const nav = createNav(), bad = [], toW = i => -9.5 + 0.3 * i;
  for (let n = 2; n <= 6; n++) for (const b of [0, 2, 4, 9]) for (const t of [0, 9]) {
    const L = lv({ boba: n, bulb: b, token: t, baseball: 8 }), y = boba.view(L, {})['boba.yard'];
    const yardFp = [].concat(y.footprint).map(f => ({ ...f, x: y.at.x + f.x, z: y.at.z + f.z }));
    const others = [boba, bulb, token, baseball].flatMap(m => Object.entries(m.view(L, {}))).filter(([k]) => k !== 'boba.yard')
      .flatMap(([, p]) => [].concat(p.footprint || []).map(f => ({ ...f, x: p.at.x + (f.x ?? 0), z: p.at.z + (f.z ?? 0) })));
    const out = list => {
      nav.setFootprints(list);
      const stuck = new Set();
      for (let i = 0; i < 64; i++) for (let j = 0; j < 64; j++) {
        const p = { x: toW(i), z: toW(j) }, c = cellAt(p.x, p.z);
        if (!c || c[0] !== CELL[0] || c[1] !== CELL[1] || !nav.walkable(p.x, p.z) || nav.inFootprint(p.x, p.z)) continue;
        const e = nav.edgePoint(CELL, p); if (!e || Math.hypot(e.x - p.x, e.z - p.z) < 1.5) stuck.add(`(${(p.x - AT.x).toFixed(2)}, ${(p.z - AT.z).toFixed(2)})`);
      }
      return stuck;
    };
    const before = out(others), after = out([...others, ...yardFp]);
    for (const p of after) if (!before.has(p)) bad.push(`boba ${n} bulb ${b} token ${t}: ${p} sealed off`);
  }
  assert.deepEqual(bad, []);
});

// 計畫 14 Task 4：老鼠咬珍奶（R30：老鼠 Lv1–2 時放下的珍奶被咬住）——攤車正面一個深色缺口、地上兩顆掉出來的珍珠，併在攤車同一個 compound（一個 mesh）；
// 老鼠搭上捷運（Lv3）就恢復原樣；被吹走的攤車照舊是海裡那台
test('bitten cart (flags.bitten_boba while the rat is Lv1–2): a dark gap on the front face and two pearls on the ground, same compound, one mesh; back to normal once the rat leaves', async () => {
  const plain = boba.view(lv({ boba: 1, rat: 2 }), {})['boba.main'];
  const bitten = boba.view(lv({ boba: 1, rat: 2 }), { bitten_boba: true })['boba.main'];
  assert.equal(bitten.kind, 'compound'); assert.deepEqual(bitten.footprint, plain.footprint); assert.deepEqual(bitten.at, plain.at);
  const extra = bitten.parts.filter(p => !plain.parts.some(q => JSON.stringify(q) === JSON.stringify(p)));
  assert.equal(extra.length, 3, `the gap and two pearls (${extra.length})`);
  const gap = extra.find(p => p.kind === 'box'), pearls = extra.filter(p => p.kind === 'sphere');
  assert.ok(gap && gap.color === C.ink && gap.pos[2] >= 0.2 && gap.pos[1] > 0.1 && gap.pos[1] < 0.56, 'a dark gap on the front (camera) face of the body');
  assert.equal(pearls.length, 2);
  for (const p of pearls) assert.ok(p.color === C.ink && p.pos[1] < 0.05 && p.pos[2] > 0.25, 'pearls lying on the ground in front of the cart');
  assert.equal(bitten.parts.length, plain.parts.length + 3);
  for (const r of [0, 3, 4]) assert.deepEqual(boba.view(lv({ boba: 1, rat: r }), { bitten_boba: true })['boba.main'], plain, `rat ${r}: the cart looks normal`);
  assert.deepEqual(boba.view(lv({ boba: 1, rat: 2 }), { bitten_boba: true, cartBlown: true })['boba.main'], boba.view(lv({ boba: 1, rat: 2 }), { cartBlown: true })['boba.main'], 'a blown cart stays the one in the sea');
  const { createPartFactory } = await import('../src/actors/parts.js'), { createGlowRegistry } = await import('../src/scene/glow.js');
  const f = createPartFactory(THREE, { glow: createGlowRegistry(), builders: {} });
  assert.equal(f.build(bitten).object.children.length, 1, 'one mesh: no extra draw call');
});
