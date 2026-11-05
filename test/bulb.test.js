import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as bulb from '../src/actors/bulb.js';
import { anchorWorld, landmarkWorld, cellOf } from '../src/actors/anchors.js';
import { cellAt, cellTop, NEIGHBORS } from '../src/scene/hex.js';
import { TIMES } from '../src/scene/daynight.js';
import { B } from '../src/show/beats.js';
import { createNav, PAD } from '../src/show/nav.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { headlessShow, playItem, entriesThroughSolutions, solo, SCRIPT_MAX, SCRIPT_EXCEPT, KEY_MAX, turnSteps, ALL } from './helpers/show.js';
import { lv, worldPoints, entryProblems, focusCell, focusTrail, rosterSpots } from './helpers/actors.js';
import * as sat from '../src/actors/satellites.js';
import * as chip from '../src/actors/chip.js';
import * as tower from '../src/actors/tower.js';
import { diffParts, troubleSpot, TROUBLE_IN } from '../src/actors/stage.js';
import { C, offset } from '../src/actors/palette.js';
import { MAIN_CELLS, adjacentPairs, SATELLITES, axialToWorld, R, RING_R, edgeMidpoint } from '../src/scene/hex.js';
import { satelliteAt } from '../src/show/nav.js';
import { trainPose, TRACK, DOOR } from '../src/actors/token.js';
import { STATION_A, TRAIN_MAX_BOOST } from '../src/show/beats.js';
import { existsSync } from 'node:fs';
const heads = s => s.parts.filter(p => p.kind === 'sphere');

// 計畫 16（使用者 2026-11-03：「拿掉前期的燈泡工人，他亂跑」）：Lv1 只有一盞路燈，沒有電工
test('bulb lv1 is one street lamp and nobody else', () => {
  const v = bulb.view(lv({ bulb: 1 }), {}); assert.deepEqual(Object.keys(v), ['bulb.main']); assert.equal(heads(v['bulb.main']).length, 1);
});
const N_STOPS = 9, LAMPS = v => Array.from({ length: N_STOPS }, (_, k) => v[`bulb.lamps.${k}`]);
const posts = s => s.parts.filter(p => p.kind === 'cylinder');
test('lv2: fifteen lamps on the five low cells plus one market stall', () => {
  const v = bulb.view(lv({ bulb: 2 }), {}); assert.equal(LAMPS(v).filter(Boolean).flatMap(heads).length, 15);
  assert.equal(posts(v['bulb.posts']).length, 15);
  const cells = new Set(LAMPS(v).flatMap(s => worldPoints(s)).map(p => String(cellAt(p.x, p.z))));
  assert.deepEqual([...cells].sort(), ['-1,0', '-1,1', '0,0', '0,1', '1,0']);
  const m = landmarkWorld('market'); assert.ok(Math.hypot(v['bulb.market'].at.x - m.x, v['bulb.market'].at.z - m.z) < 1e-9);
});
test('lv3 neon alternates pink and blue', () => {
  const g = LAMPS(bulb.view(lv({ bulb: 3 }), {})).flatMap(heads).map(p => p.glow);
  assert.ok(g.includes(0xff3fa0) && g.includes(0x3fe0ff));
});
test('blackout strips every glow from the bulb views', () => {
  const v = bulb.view(lv({ bulb: 2 }), { blackout: true });
  for (const s of Object.values(v)) if (s.parts) assert.ok(!s.parts.some(p => p.glow));
});
// 夜市 Lv2–3 一攤、Lv4 起兩攤（第二攤在東邊、往南錯開 0.15）；footprint 只有攤身（招牌 2026-11-04 拿掉，見下一個測試）。
// 計畫 16（使用者 2026-11-03：「車站旁的這兩棟是什麼，看不出來」）：夜市搬到中央格第一盞路燈旁（跟燈走），攤身跟路燈、101、變電所之間都留得出走道
test('lv4 opens a second night-market stall beside the first; lv2–3 one stall; clear of the first lamp, the 101 and the substation', () => {
  const market = n => bulb.view(lv({ bulb: n }), {})['bulb.market'], stalls = n => market(n).parts.filter(p => p.kind === 'hip').length;
  assert.equal(stalls(2), 1); assert.equal(stalls(3), 1); for (let n = 4; n <= 9; n++) assert.equal(stalls(n), 2, `lv${n}`);
  assert.deepEqual(market(4).footprint, [{ x: 0, z: 0, w: 0.5, d: 0.4 }, { x: 0.5, z: 0.15, w: 0.5, d: 0.4 }], 'stall bodies only');
  const M = market(4).at, box = (f, at) => ({ x0: at.x + (f.x ?? 0) - (f.r ?? f.w / 2), x1: at.x + (f.x ?? 0) + (f.r ?? f.w / 2), z0: at.z + (f.z ?? 0) - (f.r ?? f.d / 2), z1: at.z + (f.z ?? 0) + (f.r ?? f.d / 2) });
  const gap = (a, b) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.z0 - b.z1, b.z0 - a.z1));
  const bodies = market(4).footprint.map(f => box(f, M)), v6 = bulb.view(lv({ bulb: 6 }), {}), t = { at: anchorWorld('tower'), footprint: { w: 1.6, d: 1.6 } };   // 101 底座 1.6 見方（自動 footprint 也是這個大小）
  // 路燈：攤身不碰燈桿（外擴後連在一起沒關係，走道在東邊）；101：最東那一攤和 101 底座之間要留一條外擴 PAD 後還有 0.2 寬的走道；變電所在北邊
  for (const b of bodies) assert.ok(gap(b, box(v6['bulb.main'].footprint, v6['bulb.main'].at)) >= 0.2, `stall ${gap(b, box(v6['bulb.main'].footprint, v6['bulb.main'].at)).toFixed(3)} from the first lamp`);
  for (const b of bodies) assert.ok(gap(b, box(t.footprint, t.at)) - 2 * PAD >= 0.2, `stall ${gap(b, box(t.footprint, t.at)).toFixed(3)} from the 101 foot`);
  for (const b of bodies) assert.ok(gap(b, box(v6['bulb.substation'].footprint, v6['bulb.substation'].at)) >= 0.5, 'clear of the substation');
});
// 攤子重畫（計畫 16 §設計 2）：封閉方塊換成開放式攤位——四根木柱撐一片斜棚、前面（+z，鏡頭側）一張奶油色櫃台（底在地面）；
// 第一攤櫃台上兩層木蒸籠＋白色薄蓋、第二攤（Lv4）一座深色烤架＋三根斜插的竹籤。顏色只用現有色票
const STALL_W = 0.5, marketOf = (n, flags = {}) => bulb.view(lv({ bulb: n }), flags)['bulb.market'];
test('the night market is open stalls: four wood posts under a hip canopy, a cream counter in front; steamers on the first, a grill with skewers on the second', () => {
  for (const n of [2, 3, 4, 9]) {
    const m = marketOf(n), k = n >= 4 ? 2 : 1, roofs = m.parts.filter(p => p.kind === 'hip');
    assert.equal(roofs.length, k, `lv${n} canopies`); assert.deepEqual(roofs.map(p => p.color), [C.coral, C.yellow].slice(0, k));
    for (const r of roofs) assert.deepEqual(r.scale, [0.62, 0.22, 0.52]);
    assert.ok(!m.parts.some(p => p.color === C.wall), 'no closed box any more');
    const posts = m.parts.filter(p => p.kind === 'cylinder' && p.color === C.wood && p.scale[1] === 0.55);
    assert.equal(posts.length, 4 * k, `lv${n} posts`);
    for (const p of posts) { assert.equal(p.scale[0], 0.03); assert.ok(Math.abs(p.pos[1] - 0.275) < 1e-9, 'post stands on the ground'); }
    roofs.forEach((r, i) => {
      const mine = posts.filter(p => Math.abs(p.pos[0] - r.pos[0]) <= STALL_W / 2 && Math.abs(p.pos[2] - r.pos[2]) <= 0.2);
      assert.equal(mine.length, 4, `stall ${i}: four posts under its canopy`);
      assert.ok(Math.abs(r.pos[1] - r.scale[1] / 2 - 0.55) < 1e-9, `stall ${i}: the canopy sits on the posts`);
    });
    const counters = m.parts.filter(p => p.kind === 'box' && p.color === C.cream);
    assert.equal(counters.length, k, `lv${n} counters`);
    counters.forEach((c, i) => {
      assert.deepEqual(c.scale, [0.5, 0.22, 0.18]); assert.ok(Math.abs(c.pos[1] - 0.11) < 1e-9, 'counter bottom on the ground');
      assert.ok(Math.abs(c.pos[0] - roofs[i].pos[0]) < 1e-9 && c.pos[2] > roofs[i].pos[2] && c.pos[2] + 0.09 <= roofs[i].pos[2] + 0.2 + 1e-9, `counter ${i} at the front (+z) of its stall`);
    });
    // 第一攤：兩層蒸籠疊在櫃台上、頂上一個白色薄圓蓋
    const steam = m.parts.filter(p => p.kind === 'cylinder' && p.color === C.wood && p.scale[0] === 0.16).sort((a, b) => a.pos[1] - b.pos[1]);
    assert.equal(steam.length, 2, 'two steamer layers'); for (const p of steam) assert.equal(p.scale[1], 0.06);
    assert.ok(Math.abs(steam[0].pos[1] - 0.03 - 0.22) < 1e-9 && Math.abs(steam[1].pos[1] - steam[0].pos[1] - 0.06) < 1e-9, 'stacked on the counter');
    const lid = m.parts.filter(p => p.color === C.white);
    assert.equal(lid.length, 1); assert.ok(lid[0].pos[1] > steam[1].pos[1] && Math.abs(lid[0].pos[0] - steam[1].pos[0]) < 1e-9, 'white lid on top');
    assert.ok(steam.every(p => Math.abs(p.pos[0] - roofs[0].pos[0]) < 0.25 && Math.abs(p.pos[2] - counters[0].pos[2]) < 1e-9), 'on the first counter');
    // 第二攤：烤架＋三根斜插的竹籤
    const grill = m.parts.filter(p => p.kind === 'box' && p.color === C.ink), skewers = m.parts.filter(p => p.kind === 'cylinder' && p.color === C.cream);
    if (k === 1) { assert.equal(grill.length + skewers.length, 0, `lv${n}: no grill yet`); continue; }
    assert.equal(grill.length, 1); assert.deepEqual(grill[0].scale, [0.26, 0.04, 0.12]);
    assert.ok(Math.abs(grill[0].pos[0] - roofs[1].pos[0]) < 0.25 && Math.abs(grill[0].pos[2] - counters[1].pos[2]) < 1e-9 && Math.abs(grill[0].pos[1] - 0.02 - 0.22) < 1e-9, 'grill on the second counter');
    assert.equal(skewers.length, 3);
    for (const p of skewers) { assert.deepEqual([p.scale[0], p.scale[1]], [0.012, 0.2]); assert.ok(Math.abs(p.rot[0] + 0.5) <= 0.1, `skewer tilted (rot x ${p.rot[0]})`); assert.ok(Math.abs(p.pos[0] - grill[0].pos[0]) <= 0.13, 'stuck in the grill'); }
  }
});
// 紅燈籠串：從第一盞路燈的桿頂拉到每一攤的棚頂，等距四顆（Lv2 一串、Lv4 起兩串）；Lv3 起發光（珊瑚紅）、大停電不亮。
// 端點從零件算（路燈桿頂、棚頂尖），攤子搬位置時燈籠跟著兩端走、不會懸空
test('a red lantern string runs from the first lamp\'s post top to each stall canopy: four evenly spaced, lit from Lv3, dark in a blackout', () => {
  for (const n of [2, 3, 4, 9]) {
    const v = bulb.view(lv({ bulb: n }), {}), lamp = v['bulb.main'], post = lamp.parts.find(p => p.kind === 'cylinder'), m = v['bulb.market'];
    const top = { x: lamp.at.x, y: lamp.at.y + post.pos[1] + post.scale[1] / 2, z: lamp.at.z }, roofs = m.parts.filter(p => p.kind === 'hip');
    const L = m.parts.filter(p => p.kind === 'sphere');
    assert.equal(L.length, 4 * roofs.length, `lv${n}: four lanterns per stall`);
    for (const p of L) { assert.equal(p.scale, 0.07); if (n >= 3) assert.equal(p.glow, C.coral, `lv${n} lit`); else assert.ok(!p.glow && p.color === C.coral, 'Lv2 unlit red'); }
    roofs.forEach((r, i) => {
      const apex = { x: m.at.x + r.pos[0], y: m.at.y + r.pos[1] + r.scale[1] / 2, z: m.at.z + r.pos[2] };
      for (let j = 0; j < 4; j++) {
        const t = (j + 1) / 5, q = L[4 * i + j], w = { x: m.at.x + q.pos[0], y: m.at.y + q.pos[1], z: m.at.z + q.pos[2] };
        for (const a of ['x', 'y', 'z']) assert.ok(Math.abs(w[a] - (top[a] + (apex[a] - top[a]) * t)) < 1e-9, `lv${n} string ${i} lantern ${j} ${a}`);
      }
    });
    if (n >= 3) assert.ok(!marketOf(n, { blackout: true }).parts.some(p => p.glow), `lv${n} blackout: lanterns dark`);
  }
  assert.ok(!marketOf(2).parts.some(p => p.glow), 'Lv2: nothing in the market glows yet');
});
// 使用者 2026-11-04（夜市截圖）：「夜市上面這塊方方的是什麼，不好看」——Lv4–8 的粉紅招牌板、Lv9 的霓虹招牌（bulb.neon.market）都拿掉；
// 夜市發光的只有燈籠串（Lv3 起，珊瑚紅），燈泡 2–9 都沒有招牌、沒有粉紅的東西
test('no night-market sign: bulb 2–9 has no bulb.neon.market and nothing pink in bulb.market (only the coral lanterns glow)', () => {
  for (let n = 2; n <= 9; n++) for (const L of [lv({ bulb: n }), atLv(n)]) {
    const v = bulb.view(L, {});
    assert.equal(v['bulb.neon.market'], undefined, `lv${n}: no neon market sign`);
    assert.ok(!v['bulb.market'].parts.some(p => p.glow === C.neonPink || p.color === C.neonPink), `lv${n}: no pink board`);
    assert.ok(v['bulb.market'].parts.filter(p => p.glow).every(p => p.glow === C.coral), `lv${n}: only lanterns glow`);
  }
});
const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);   // 唯一正解（賽博），從求解器取
const near = (a, b, d = 1e-9) => Math.hypot(a.x - b.x, a.z - b.z) < d;

// 走路格（計畫 16 §設計 1）：照正解每一回合演完，夜市外擴 PAD 後 (a) 中央格西橋頭 ↔ 120° 橋頭 ↔ 101 北側互相走得到、不繞出中央格；
// (b) Lv4 排隊點 MARKET_FRONT 落在可走點附近（< 0.15）；(c) 老鼠 Lv4／9 的 trouble 點（夜市門口）在 TROUBLE_IN 內、走得到
const CENTRE_HEADS = { west: edgeMidpoint([0, 0], [-1, 0], RING_R * Math.sqrt(3) / 2).a, nw: edgeMidpoint([0, 0], [-1, 1], RING_R * Math.sqrt(3) / 2).a };
async function centreTurns(check) {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(); let s = engine.createState(spec);
    for (const step of turnSteps(order)) { const r = step(s); s = r.state; await h.run([...r.events, { kind: 'settle' }], { instant: true }); check(h.show, `${order.join('>')} ${JSON.stringify(h.show.stage.lv)}`); }
  }
}
test('walkable (a): with the market padded, the west bridge head, the 120° bridge head and the 101\'s north side still reach each other inside the centre cell', async () => {
  const north = offset(anchorWorld('tower'), 0, -1.0), spots = [CENTRE_HEADS.west, CENTRE_HEADS.nw, north];
  await centreTurns((show, label) => {
    for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) {
      const from = spots[a], to = spots[b], path = show.nav.route(from, to), last = path.at(-1), end = show.nav.nearestWalkable(to);
      assert.ok(path.length >= 2 && Math.hypot(last.x - end.x, last.z - end.z) < 1e-6, `${label}: ${a}→${b} reaches`);
      assert.ok(path.every(p => Math.hypot(p.x, p.z) <= RING_R + 0.05), `${label}: ${a}→${b} stays in the centre cell (${show.nav.routeLength(path).toFixed(2)} long)`);
    }
  });
});
test('walkable (b): the Lv4 queue spot MARKET_FRONT (in front of the second stall) is within 0.15 of a walkable point, and both queue slots can be walked to from the 120° bridge head', async () => {
  const m = landmarkWorld('market'), f = bulb.MARKET_FRONT;
  assert.ok(Math.abs(f.x - m.x - 0.5) < 1e-9 && Math.abs(f.z - m.z - 0.55) < 1e-9, 'south of the second stall');
  let seen = 0;
  await centreTurns((show, label) => {
    if (!(show.stage.lv.bulb >= 4)) return;
    seen++; const p = show.nav.nearestWalkable(f);
    assert.ok(Math.hypot(p.x - f.x, p.z - f.z) < 0.15, `${label}: queue spot ${Math.hypot(p.x - f.x, p.z - f.z).toFixed(3)} from walkable`);
    for (const q of show.nav.slots(f, 2, 0.15)) {
      const last = show.nav.route(CENTRE_HEADS.nw, q).at(-1);
      assert.ok(Math.hypot(last.x - q.x, last.z - q.z) < 0.05, `${label}: slot (${q.x.toFixed(2)}, ${q.z.toFixed(2)}) reachable (route ends at ${last.x.toFixed(2)}, ${last.z.toFixed(2)})`);
    }
  });
  assert.ok(seen > 0);
});
test('walkable (c): the rat\'s trouble spot at the market (bulb Lv4, Lv9) stays within TROUBLE_IN of the centre and on walkable ground', async () => {
  const mods = ALL;
  await centreTurns((show, label) => {
    for (const n of [4, 9]) {
      const L = { ...show.stage.lv, bulb: n }, p = troubleSpot('bulb', L, {}, mods);
      assert.deepEqual(cellAt(p.x, p.z), [0, 0]); assert.ok(Math.hypot(p.x, p.z) <= TROUBLE_IN + 1e-9, `${label} lv${n}`);
      const q = show.nav.nearestWalkable(p); assert.ok(Math.hypot(q.x - p.x, q.z - p.z) < 0.3, `${label} lv${n}: trouble spot ${Math.hypot(q.x - p.x, q.z - p.z).toFixed(2)} from walkable`);
    }
  });
});

// 計畫 16：電工 Lv1–6 不存在（view 不宣告），Lv7 起才宣告——住在風車島上（衛星島的 wander）
test('view: posts are one part, heads are one part per lighting stop in ring order; no electrician before Lv7, a vest roster on the windmill island from Lv7', () => {
  const v = bulb.view(lv({ bulb: 2 }), {});
  assert.equal(bulb.LAMP_POINTS.length, 15); assert.equal(v['bulb.lamps'], undefined); assert.equal(v['bulb.lamps.9'], undefined);
  assert.equal(bulb.LAMP_STOPS.length, N_STOPS);
  // 燈桿：一個零件、15 根、不發光；位置對得上每盞燈
  const P = v['bulb.posts']; assert.equal(P.kind, 'compound'); assert.equal(P.footprint, false);
  assert.ok(P.parts.every(p => p.kind === 'cylinder' && !p.glow));
  worldPoints(P).forEach((q, i) => assert.ok(near(q, bulb.LAMP_POINTS[i], 1e-9), `post ${i}`));
  // 燈頭：每站一個零件，裝的是那一站要點的燈（照 LAMP_STOPS）
  LAMPS(v).forEach((s, k) => {
    assert.equal(s?.kind, 'compound', `stop ${k}`); assert.equal(s.footprint, false); assert.ok(s.parts.every(p => p.kind === 'sphere'));
    assert.equal(heads(s).length, bulb.LAMP_STOPS[k].length);
    worldPoints(s).forEach((q, j) => { const p = bulb.LAMP_POINTS[bulb.LAMP_STOPS[k][j]]; assert.ok(near(q, p, 1e-9)); assert.equal(p.y, cellTop(cellAt(p.x, p.z))); });
  });
  assert.deepEqual(v['bulb.main'].footprint, { r: 0.15 }); assert.deepEqual(v['bulb.market'].footprint, [{ x: 0, z: 0, w: 0.5, d: 0.4 }], 'market footprint: the stall body');
  assert.equal(bulb.ISLAND_LV, 7);
  for (let n = 1; n < bulb.ISLAND_LV; n++) for (const flags of [{}, { blackout: true }]) assert.equal(bulb.view(lv({ bulb: n, token: 9 }), flags)['bulb.electrician'], undefined, `lv${n}: no electrician`);
  for (let n = bulb.ISLAND_LV; n <= 9; n++) {
    const el = bulb.view(lv({ bulb: n, token: 9 }), {})['bulb.electrician'];
    assert.deepEqual([el.kind, el.n, el.accessory], ['roster', 1, 'vest'], `lv${n}`); assert.deepEqual(el.home, { kind: 'wander', at: bulb.ISLAND_HOME, r: bulb.ISLAND_R });
  }
  assert.ok(bulb.script?.placed && [2, 3, 4, 5, 6, 7, 8, 9].every(n => bulb.script.grow[n]) && bulb.script.fx() === null);
  // 電工的主路與點燈的站位（Lv1–6 巡路、走過去點燈）一起拿掉了
  for (const k of ['ROAD', 'ELECTRICIAN_ENTRY', 'LIGHTING_SPEED', 'WALKED', 'lampApproach']) assert.equal(bulb[k], undefined, `${k} is gone`);
});
// Lv2 的燈光沿環掃一圈（計畫 16 §設計 4）：stopCell(k) 是第 k 站第一盞燈那一格；站序沿環——下一站在同一格或隔壁格、最後一站接回第 0 站（第一盞路燈那格）
test('stopCell(k) is the cell of stop k\'s first lamp; the stops run round the ring (each next stop in the same or a neighbouring cell, wrapping to stop 0)', () => {
  const adj = (a, b) => NEIGHBORS.some(([dq, dr]) => a[0] + dq === b[0] && a[1] + dr === b[1]);
  bulb.LAMP_STOPS.forEach((g, k) => { const p = bulb.LAMP_POINTS[g[0]]; assert.deepEqual(bulb.stopCell(k), [...cellAt(p.x, p.z)], `stop ${k}`); });
  assert.deepEqual(bulb.stopCell(0), [0, 0], 'the sweep starts at the first lamp');
  assert.deepEqual(bulb.LAMP_STOPS.flat(), Array.from({ length: 15 }, (_, i) => i));
  for (const g of bulb.LAMP_STOPS) for (const i of g) assert.ok(near(bulb.LAMP_POINTS[i], bulb.LAMP_POINTS[g[0]], 1.2), `lamp ${i} at its junction`);
  for (let k = 0; k < N_STOPS; k++) { const a = bulb.stopCell(k), b = bulb.stopCell((k + 1) % N_STOPS); assert.ok(String(a) === String(b) || adj(a, b), `stop ${k} → ${(k + 1) % N_STOPS}: ${a} → ${b}`); }
  assert.deepEqual([...new Set(bulb.LAMP_STOPS.map((_, k) => String(bulb.stopCell(k))))].sort(), ['-1,0', '-1,1', '0,0', '0,1', '1,0']);
});

// 假 ctx：只拿劇本回的拍來看（不演）
const fakeCtx = () => ({ B, roster: { members: () => [], nearest: () => null }, stage: {} });
const flat = beats => beats.flatMap(b => (b.kind === 'together' ? flat(b.beats) : [b]));
const E = to => ({ kind: 'grow', item: 'bulb', to });
// only 可能是 ctx => 鍵（演到才算）：用假 ctx 解開
const applies = (beats, ctx) => flat(beats).filter(b => b.kind === 'apply' && b.only).map(b => (typeof b.only === 'function' ? b.only(ctx) : b.only));
const sweepCells = () => { const cells = bulb.LAMP_STOPS.map((_, k) => bulb.stopCell(k)); return cells.filter((c, k) => !k || String(c) !== String(cells[k - 1])); };
// 計畫 16 §設計 4：Lv2 燈光從第一盞路燈開始照 LAMP_STOPS 一站一站亮（燈桿跟第 0 站一起）；鏡頭跟著站換格（同一格連續的站不重複平移）；
// 九站掃完回全景 → 夜市第一攤開張 → LEVEL UP。沒有人被叫出來、沒有人走路
test('grow 2 sweeps the light round the ring: focus the stop\'s cell (no re-pan within a cell) → light it → wait; then home, the first stall, LEVEL UP — nobody walks', () => {
  const ctx = fakeCtx(), beats = bulb.script.grow[2](E(2), { lv: lv({ bulb: 2 }), flags: {} }, ctx);
  assert.deepEqual(applies(beats, ctx), [...Array.from({ length: N_STOPS }, (_, k) => [...(k ? [] : ['bulb.posts']), `bulb.lamps.${k}`]), ['bulb.market']]);
  assert.ok(!flat(beats).some(b => ['walk', 'spawn', 'gesture', 'home', 'bubble'].includes(b.kind)), 'nobody is called');
  const home = beats.findIndex(b => b.kind === 'focus' && b.target === 'home'), cells = bulb.LAMP_STOPS.map((_, k) => bulb.stopCell(k));
  // 每站：（換格才有的 focus）→ apply → wait
  assert.deepEqual(beats.slice(0, home).map(b => b.kind), cells.flatMap((c, k) => [...(!k || String(c) !== String(cells[k - 1]) ? ['focus'] : []), 'apply', 'wait']));
  assert.deepEqual(beats.slice(0, home).filter(b => b.kind === 'focus').map(b => focusCell(b, ctx)), sweepCells());
  assert.deepEqual(beats.slice(home).map(b => b.kind), ['focus', 'apply', 'wait', 'levelUp']);
  const waits = beats.filter(b => b.kind === 'wait').map(b => b.dur);
  assert.ok(waits.slice(0, N_STOPS).every(w => w === waits[0] && w <= 0.3), `one beat per stop (${waits[0]} s)`); assert.equal(waits.at(-1), 0.4);
});
// 計畫 9 任務 4（任務 3 延後的小項）：Lv4 去夜市排隊的兩個人照走路的路長挑；走不到的人（route 只回起點，路長 0）不算，不會排第一
// 計畫 16 修正輪 1（協調者裁決）：排隊的是鮮奶的兩個小學生（milk.kids，「夜市開第二攤，小學生來排隊」）——不叫站務員
//   （他從捷運格走過來，同回合下一個代幣劇本要他時還在半路上）、也不叫島民；不夠兩位就一位或沒有
test('nearestPair: the two pupils (milk.kids) by their walk to the market, never the station staff or islanders; somebody who cannot get there (route stops at the start) is skipped, not ranked first', () => {
  const end = { x: 0, y: 0, z: 0 }, m = (x, stuck = false) => ({ pos: { x, y: 0, z: 0 }, hidden: false, mode: 'home', stuck });
  const kids = [m(0.5, true), m(3), m(1), m(2)], others = [m(0.2)], everyone = [...kids, ...others];
  const nav = { nearestWalkable: () => end, route: (from) => (everyone.find(p => p.pos === from).stuck ? [from] : [from, end]), routeLength: path => (path.length < 2 ? 0 : Math.abs(path[0].x)) };
  const roster = k => ({ members: key => (key === 'milk.kids' ? k : key === 'token.staff' || key === 'landmarks.islanders' ? others : []) });
  assert.equal(bulb.QUEUE_KEY, 'milk.kids');
  assert.deepEqual(bulb.nearestPair()({ nav, roster: roster(kids) }).map(p => p.pos.x), [1, 2]);
  assert.deepEqual(bulb.nearestPair()({ nav, roster: roster(kids.slice(2, 3)) }).map(p => p.pos.x), [1], 'one pupil: one queues');
  assert.deepEqual(bulb.nearestPair()({ nav, roster: roster([]) }), [], 'no pupils: nobody queues, not the station staff or an islander');
  assert.deepEqual(bulb.nearestPair()({ nav, roster: roster([{ ...m(1), mode: 'script' }]) }), [], 'a pupil held by another script is left alone');
});
test('world beats: Lv3 fades to dusk, Lv5 to night', () => {
  const worlds = n => bulb.script.grow[n](E(n), { lv: lv({ bulb: n }), flags: {} }, fakeCtx()).filter(b => b.kind === 'world').map(b => b.effects);
  assert.deepEqual(worlds(3), [{ time: TIMES.dusk }]); assert.deepEqual(worlds(5), [{ time: TIMES.night }]);
});

// 照 order 把整局（放置 + 倒數三回合）瞬間演到 pred 命中的那個事件，那個事件單獨 live 演；回傳 { e, secs, n }（n = 演之前的泡泡數）
// tail：跟這個事件同一回合接著演的事件（例如 settle），驗 LEVEL UP 找的是演到的那個事件、不是建拍時最後一個
async function liveAt({ run, bubblesLog }, order, pred, tail = []) {
  let s = engine.createState(spec);
  const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  for (const step of steps) {
    const r = step(s); s = r.state;
    for (const e of r.events) {
      if (pred(e)) { const n = bubblesLog.length; return { e, secs: await run([solo(e), ...tail]), n }; }
      await run([e], { instant: true });
    }
    await run([{ kind: 'settle' }], { instant: true });
  }
  throw new Error('event not found');
}
const isBulb = to => e => e.kind === 'grow' && e.item === 'bulb' && e.to === to;
// 物品 v2 §6：一級 3–4.5 s；Lv2 燈光沿環掃一圈 ≤ SCRIPT_EXCEPT（計畫 16：一站一拍，九站）；
// ◆ Lv7（離岸風電）、Lv9（全島霓虹）6–10 s——含鏡頭平移與回全景的整段（show.elapsed，裁決 R8）
const KEY = [7, 9], BUDGET = to => (to === 2 ? [3, SCRIPT_EXCEPT['bulb 2']] : KEY.includes(to) ? [3, KEY_MAX] : [3, SCRIPT_MAX]);
const WINDMILL_I = SATELLITES.findIndex(x => x.kind === 'windmill');
const onWindmill = p => !cellAt(p.x, p.z) && satelliteAt(p) === WINDMILL_I;
function checkBulb({ show, bubblesLog, eventHead }, e, secs, n, timing) {
  const what = `${e.kind} ${e.to ?? ''}`, to = e.kind === 'grow' ? e.to : 1, [lo, hi] = BUDGET(to);
  (timing[to] ??= []).push(+secs.toFixed(1));
  assert.ok(secs >= lo && secs <= hi, `${what} took ${secs.toFixed(1)}s`);
  if (KEY.includes(to)) assert.ok(show.elapsed >= 6 && show.elapsed <= KEY_MAX, `◆ ${what} whole event ${show.elapsed.toFixed(2)}s`);
  if (e.kind === 'grow') {
    const last = bubblesLog.slice(n).at(-1), h = eventHead('bulb');   // 這一級變了的零件頭上（計畫 15 D）
    assert.equal(last?.text, 'LEVEL UP', what); assert.ok(Math.hypot(last.at.x - h.x, last.at.y - h.y, last.at.z - h.z) < 0.3, `${what} LEVEL UP over bulb`);
  }
  // 計畫 16：電工 Lv7 才登場（從捷運站走出來搭列車過去，不瞬移），之後住在風車島上；Lv1–6 沒有他
  const els = show.roster.members('bulb.electrician'); assert.equal(els.length, to >= 7 ? 1 : 0, `${what}: electrician only from Lv7`);
  if (els.length) { assert.equal(els[0].mode, 'home', `${what} electrician home`); assert.ok(onWindmill(els[0].pos), `${what} electrician on the windmill island: ${JSON.stringify(els[0].pos)}`); }
  // 演完沒有人留在劇本手上
  const held = show.roster.keys().flatMap(k => show.roster.members(k)).filter(m => m.mode === 'script').map(m => m.key);
  assert.deepEqual(held, [], `${what}: nobody left in a script`);
}
test('scripts: every bulb level in the solution plays within its budget (3–4.5 s; Lv2 the ring sweep; ◆ Lv7/Lv9 6–8 s whole), ends with LEVEL UP on bulb, and leaves everyone at home', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h, timing = {};
  let n = 0;
  const tracked = (evs, opts) => { if (!opts?.instant) n = bubblesLog.length; return run(evs, opts); };
  for (const order of SOLUTIONS) {
    show.reset();
    const seen = [];
    await playItem(show, tracked, order, 'bulb', (e, secs) => { seen.push(e.kind === 'grow' ? e.to : 1); checkBulb(h, e, secs, n, timing); });
    assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 8, 9], `bulb events seen: ${seen}`);
    assert.equal(h.rail.trip ?? null, null, 'no trip left on the rail');
  }
});
// 計畫 15 D（使用者 2026-11-02 錄影：Lv6 變電所的 LEVEL UP 冒在第一盞路燈——隔壁學校前——頭上，以為學校升了兩次）：
// Lv6 的 LEVEL UP 冒在變電所上方、不在第一盞路燈（headOf）；同一回合後面還有事件（settle）也一樣（ctx.event 是演到的那個事件）
test('Lv6 live: LEVEL UP pops over the substation, not over the first lamp — also with another event after it in the turn', async () => {
  for (const tail of [[], [{ kind: 'settle' }]]) {
    const h = await headlessShow(), { n } = await liveAt(h, SOLUTIONS[0], isBulb(6), tail);
    const label = h.bubblesLog.slice(n).find(b => b.text === 'LEVEL UP'), lamp = h.show.stage.headOf('bulb'), what = tail.length ? 'with settle' : 'alone';
    assert.ok(label, what);
    assert.ok(Math.hypot(label.at.x - bulb.SUBSTATION.x, label.at.z - bulb.SUBSTATION.z) < 0.5, `${what}: over the substation (${label.at.x.toFixed(2)}, ${label.at.z.toFixed(2)})`);
    assert.ok(label.at.y > bulb.SUBSTATION.y + 0.3, `${what}: above its roof (${label.at.y.toFixed(2)})`);
    assert.ok(Math.hypot(label.at.x - lamp.x, label.at.z - lamp.z) > 1.5, `${what}: not over the first lamp`);
  }
});
// 跨島的：Lv9 霓虹（橋面燈條橫跨整島）變了的零件合起來比 WIDE 寬 → 退回 headOf（第一盞路燈頭上）
test('Lv9 live: the island-wide neon spans more than WIDE, so the LEVEL UP falls back to headOf(bulb)', async () => {
  const h = await headlessShow(), { n } = await liveAt(h, SOLUTIONS[0], isBulb(9));
  assert.ok(h.show.stage.partKeys().includes('bulb.neon.bridges'), 'the bridge neon is up');
  const label = h.bubblesLog.slice(n).filter(b => b.text === 'LEVEL UP').at(-1), hd = h.show.stage.headOf('bulb');
  assert.ok(label && Math.hypot(label.at.x - hd.x, label.at.y - hd.y, label.at.z - hd.z) < 1e-6, `headOf (${JSON.stringify(label?.at)})`);
});
// 計畫 16：從第 0 站（第一盞路燈）開始一站一站亮、燈桿跟第 0 站同一幀；每一站亮的時候鏡頭已經叫到那一站的格子
test('grow 2 live: the stops light up one at a time from stop 0 in ring order, the posts with stop 0, each after the camera was sent to its cell', async () => {
  for (const order of SOLUTIONS) {
    const first = [], camAt = [];
    let posts = null;
    const h = await liveFrames(order, isBulb(2), (hh, _dt, r0) => {
      const trail = focusTrail(hh.rig.log, r0).filter(c => c !== 'home');
      for (let i = 0; i < N_STOPS; i++) if (!first.includes(i) && hh.show.stage.partObject(`bulb.lamps.${i}`)?.visible) { first.push(i); camAt.push(trail.at(-1)); if (i === 0) posts = !!hh.show.stage.partObject('bulb.posts')?.visible; }
    });
    assert.deepEqual(first, Array.from({ length: N_STOPS }, (_, i) => i), `stop order ${first}`);
    assert.equal(posts, true, 'posts with stop 0');
    camAt.forEach((c, k) => assert.deepEqual(c, bulb.stopCell(k), `stop ${k} lights with the camera sent to its cell`));
    const trail = focusTrail(h.rig.log, h.r0);
    assert.deepEqual(trail, [...sweepCells(), 'home', 'home'], JSON.stringify(trail));
  }
});
// 計畫 16 §設計 4：放下、Lv2、Lv3、Lv5、Lv6 的劇本沒有人——演的每一幀名冊裡都沒有 mode === 'script' 的成員（沒有人被叫去走路）
test('placed, Lv2, Lv3, Lv5, Lv6 live: no roster member is ever in a script while they play', async () => {
  const isPlaced = e => e.kind === 'placed' && e.item === 'bulb';
  for (const order of SOLUTIONS) for (const [name, pred] of [['placed', isPlaced], ...[2, 3, 5, 6].map(n => [`lv${n}`, isBulb(n)])]) {
    const busy = new Set();
    const { secs } = await liveFrames(order, pred, hh => { for (const k of hh.show.roster.keys()) for (const m of hh.show.roster.members(k)) if (m.mode === 'script') busy.add(k); });
    assert.deepEqual([...busy], [], `${name}: ${[...busy]} in a script`);
    assert.ok(secs >= 3 && secs <= (name === 'lv2' ? SCRIPT_EXCEPT['bulb 2'] : SCRIPT_MAX), `${name} ${secs.toFixed(2)} s`);
  }
});
// 計畫 16 修正輪 1：「夜市開第二攤，小學生來排隊」——燈泡 Lv4 要鮮奶 ≥3（小學和兩個小學生一定在）。第二攤開張（♥ 冒出來）那一刻
// 兩個小學生站在夜市前的兩個排隊位上；站務員（token.*）整段都不離開自己的格子；一級 3–4.5 s。
// 唯一正解的燈泡 4 是 3 → 5 跳級的第一級（只演 Lv5 的劇本），這裡照正解走到那個事件、單獨 live 演 Lv4 的劇本；
// 真的回合裡演到 Lv4 的是壞結局（吹偏、命中第 7／8 回合：鮮奶 3、燈泡 4、代幣 3 同一回合），整回合 live 再驗一次
function lv4Watch() {
  const w = { kids: null, moved: [], start: null, n: 0 };
  w.frame = hh => {
    const log = hh.bubblesLog, show = hh.show;
    w.start ??= Object.fromEntries(show.roster.keys().filter(k => k.startsWith('token.')).flatMap(k => show.roster.members(k).map(m => [`${k}#${m.i}`, String(cellAt(m.pos.x, m.pos.z))])));
    for (const k of show.roster.keys().filter(k => k.startsWith('token.'))) for (const m of show.roster.members(k)) {
      const id = `${k}#${m.i}`, c = String(cellAt(m.pos.x, m.pos.z));
      if (id in w.start && c !== w.start[id] && cellAt(m.pos.x, m.pos.z)) w.moved.push(`${id} ${w.start[id]} → ${c}`);
    }
    if (!w.kids && log.slice(w.n).some(b => b.kind === '♥')) w.kids = show.roster.members('milk.kids').map(m => ({ ...m.pos, mode: m.mode }));
  };
  return w;
}
const atSlots = (show, kids) => { const slots = show.nav.slots(bulb.MARKET_FRONT, 2, 0.15); return kids.length === 2 && slots.every(q => kids.some(k => Math.hypot(k.x - q.x, k.z - q.z) < 0.1)); };
test('Lv4: the two pupils (milk.kids) stand at the queue slots when the second stall opens; no token.* member leaves its cell; 3–4.5 s', async () => {
  const w = lv4Watch();
  const h = await liveFrames(SOLUTIONS[0], isBulb(4), (hh, _dt) => { if (w.n === 0) w.n = hh.bubblesLog.length; w.frame(hh); });
  assert.equal(h.e.to, 4); assert.ok(h.show.stage.lv.milk >= 3, 'the school is up');
  assert.ok(w.kids && atSlots(h.show, w.kids), `pupils at the queue slots when the stall opens: ${JSON.stringify(w.kids)}`);
  assert.deepEqual(w.moved.slice(0, 5), [], 'token people stay in their cells');
  assert.equal(h.bubblesLog.slice(h.n).filter(b => b.kind === '♥').length, 2);
  assert.ok(h.bubblesLog.slice(h.n).some(b => b.text === 'LEVEL UP'), 'LEVEL UP');
  assert.ok(h.show.roster.members('milk.kids').every(m => m.mode === 'home'), 'the pupils go back to their day');
  assert.ok(h.secs >= 3 && h.secs <= SCRIPT_MAX, `${h.secs.toFixed(2)} s`);
});
test('Lv4 in the real turn (bad endings: milk 3, bulb 4, token 3 in one turn): the pupils queue and are back at school by the end of the turn, no token.* member leaves its cell', async () => {
  // R38（使用者 2026-11-05）：老鼠早放會咬住鮮奶，EXAMPLE 兩局的鮮奶到不了 3——改用老鼠最後放的壞結局局（flood／hit、flood／deflect）
  for (const order of [['milk', 'chip', 'bulb', 'token', 'boba', 'baseball', 'typhoon', 'rat'], ['milk', 'chip', 'bulb', 'token', 'boba', 'baseball', 'rat', 'typhoon']]) {
    const h = await headlessShow(), w = lv4Watch(), update = h.show.update;
    let s = engine.createState(spec), found = false;
    for (const step of turnSteps(order)) {
      const r = step(s); s = r.state;
      if (!r.events.some(isBulb(4))) { await h.run([...r.events, { kind: 'settle' }], { instant: true }); continue; }
      found = true;
      let on = false;
      h.show.update = (dt, t) => { update(dt, t); if (on) w.frame(h); };
      await h.run([...r.events, { kind: 'settle' }], { onMark: e => { if (isBulb(4)(e)) { on = true; w.n = h.bubblesLog.length; } } });
      h.show.update = update;
      break;
    }
    assert.ok(found, order.join('>'));
    assert.ok(w.kids && atSlots(h.show, w.kids), `${order.join('>')}: pupils at the queue slots: ${JSON.stringify(w.kids)}`);
    assert.deepEqual(w.moved.slice(0, 5), [], `${order.join('>')}: token people stay in their cells`);
    const held = h.show.roster.keys().flatMap(k => h.show.roster.members(k)).filter(m => m.mode === 'script').map(m => m.key);
    assert.deepEqual(held, [], `${order.join('>')}: nobody left in a script`);
    // 演完用 hurry 放回日常：回合結束時已經走回小學那一格（不站在夜市前等焦點，下一回合鮮奶 4 才不用等他們走回去）
    const kidCells = h.show.roster.members('milk.kids').map(m => String(cellAt(m.pos.x, m.pos.z)));
    assert.ok(kidCells.every(c => c === String(cellOf('milk'))), `${order.join('>')}: pupils back at school by the end of the turn (${kidCells})`);
  }
});
test('Lv4 never picks hidden pupils', () => {
  const vis = { pos: { x: 9, z: 9 }, mode: 'home', head: () => ({ x: 9, y: 0, z: 9 }) }, m = landmarkWorld('market');
  const hid = { pos: { ...m }, hidden: true, mode: 'home', head: () => m }, vis2 = { pos: { x: 8, z: 8 }, mode: 'home', head: () => ({ x: 8, y: 0, z: 8 }) };
  const ctx = { B, roster: { members: k => (k === 'milk.kids' ? [hid, vis, vis2] : []) }, nav: { slots: () => [m, m] } };
  const beats = flat(bulb.script.grow[4](E(4), { lv: lv({ bulb: 4 }), flags: {} }, ctx)).filter(b => b.kind === 'walk');
  const who = [];
  const fakeCtx2 = { ...ctx, roster: { ...ctx.roster, claim: x => who.push(x) }, nav: { route: (a, b) => [a, b], routeLength: () => 0, nearestWalkable: p => p, slots: () => [m, m] } };
  for (const b of beats) b.start(fakeCtx2);
  assert.ok(!who.includes(hid), 'hidden pupil picked'); assert.equal(who.length, 2);
});

// 入口點（§13.2）：計畫 16 起電工 Lv1–6 不在（以前從 101 工地走出來巡路）；Lv7 起住在風車島上（衛星島的家沒有入口，同 sat.keeper）。
// 燈泡每一級的名冊入口都沒有問題（唯一正解每一刻的真 footprint）
test('bulb rosters: no electrician through Lv6; from Lv7 he lives off the main island with no entry; every entry is fine through the solution', async () => {
  const nav = createNav(), bad = [];
  for (let n = 1; n <= 9; n++) {
    const v = bulb.view(lv({ bulb: n, token: n >= 7 ? 9 : 3 }), {}), el = v['bulb.electrician'];
    if (n < 7) assert.equal(el, undefined, `lv${n}`);
    else assert.ok(el.home.entry === undefined && rosterSpots(el).every(p => !cellAt(p.x, p.z)), `lv${n} lives off the main island, no entry`);
    bad.push(...entryProblems(v, nav, `lv${n}`));
  }
  bad.push(...await entriesThroughSolutions(bulb, SOLUTIONS));
  assert.deepEqual(bad, []);
});

// 鏡頭（§13.1）：Lv3、Lv5 全島的事——第一拍就回全景；Lv4 夜市格（計畫 16 起就是中心格）、Lv6 中心格（變電所）；LEVEL UP 不再轉一次
test('grow 3 and 5 start on the overview, grow 4 and 6 focus the centre cell (market, substation); the live camera never pans twice', async () => {
  const market = landmarkWorld('market'), mc = [...cellAt(market.x, market.z)];
  assert.deepEqual(mc, [0, 0]);
  for (const n of [3, 4, 5, 6]) {
    const ctx = fakeCtx(), beats = bulb.script.grow[n](E(n), { lv: lv({ bulb: n }), flags: {} }, ctx);
    assert.equal(beats[0].kind, 'focus', `lv${n}`);
    if (n === 3 || n === 5) assert.equal(beats[0].target, 'home', `lv${n}`); else assert.deepEqual(focusCell(beats[0], ctx), [0, 0], `lv${n}`);
    for (const order of SOLUTIONS) {
      const h = await liveFrames(order, isBulb(n), () => {}), trail = focusTrail(h.rig.log, h.r0);
      assert.deepEqual(trail, n === 3 || n === 5 ? ['home', 'home'] : [mc, 'home'], `lv${n} ${order.join('>')} ${JSON.stringify(trail)}`);
    }
  }
});
// 拍序（計畫 16 §設計 4，原文的秒數）：放下＝路燈自己長出來 → 0.9 → ♪ 在燈頭上 1.0 → 1.0；Lv3 回全景 → 霓虹 → 0.8 → 傍晚 → 1.2 → LEVEL UP；
// Lv5 回全景 → 0.6 → LED → 入夜 → 1.4 → LEVEL UP；Lv6 中心格 → 變電所 → 0.6 → ♪ 在變電所上 0.8 → 0.6 → LEVEL UP
test('placed, Lv3, Lv5, Lv6 beats: apply, waits, the ♪ over the part, the world change, LEVEL UP — in that order, nobody called', () => {
  const ctx = { ...fakeCtx(), stage: { partObject: () => null, headOf: () => ({ x: 0, y: 0, z: 0 }) } };
  const seq = beats => beats.map(b => (b.kind === 'wait' ? `wait ${b.dur}` : b.kind === 'bubble' ? `${b.kind} ${b.dur}` : b.kind === 'world' ? `world ${Object.values(b.effects)[0]}` : b.kind));
  const s = n => ({ lv: lv({ bulb: n }), flags: {} });
  assert.deepEqual(seq(bulb.script.placed({ kind: 'placed', item: 'bulb' }, s(1), ctx)), ['apply', 'wait 0.9', 'bubble 1', 'wait 1']);
  assert.deepEqual(seq(bulb.script.grow[3](E(3), s(3), ctx)), ['focus', 'apply', 'wait 0.8', `world ${TIMES.dusk}`, 'wait 1.2', 'levelUp']);
  assert.deepEqual(seq(bulb.script.grow[5](E(5), s(5), ctx)), ['focus', 'wait 0.6', 'apply', `world ${TIMES.night}`, 'wait 1.4', 'levelUp']);
  assert.deepEqual(seq(bulb.script.grow[6](E(6), s(6), ctx)), ['focus', 'apply', 'wait 0.6', 'bubble 0.8', 'wait 0.6', 'levelUp']);
  for (const n of [3, 5, 6]) assert.ok(flat(bulb.script.grow[n](E(n), s(n), ctx)).every(b => b.kind !== 'walk' && b.kind !== 'spawn'), `lv${n}: nobody walks`);
});

// ════ 物品 v2：燈泡 9 級（§4.4）、離島鏈（§5）════
// 照正解走到燈泡 n 級時的其他物品（Lv5 棒球 ≥4、Lv7 代幣 ≥7、Lv8 晶片 5、Lv9 代幣 9）
const atLv = n => lv({ bulb: n, token: n >= 9 ? 9 : n >= 7 ? 7 : 3, chip: n >= 8 ? 5 : 2, baseball: n >= 5 ? 4 : 1 });
const pick = (v, keys) => Object.fromEntries(Object.entries(v).filter(([k]) => keys.includes(k)));
// 燈泡看得見的東西：自己的零件＋風車與燈塔（衛星島）、海底電纜（晶片的零件）、101 燈光秀
const whole = L => ({ ...bulb.view(L, {}), ...pick(sat.view(L, {}), ['sat.windmill', 'sat.lighthouse', 'sat.beam']), ...pick(chip.view(L, {}), ['chip.cable']), ...pick(tower.view(L, {}, { total: 20 }), ['tower.show']) });
const nonRoster = v => Object.fromEntries(Object.entries(v).filter(([, p]) => p.kind !== 'roster'));
const V = Array.from({ length: 10 }, (_, n) => whole(atLv(n)));
const NEON = ['bulb.neon.station', 'bulb.neon.bridges'];

test('bulb has its v2 ladder (max 9)', () => { assert.equal(spec.ITEMS.bulb.max, 9); });
test('bulb has something new at every level 1–9: substation (6), turbine and lighthouse (7), the cable (8), island-wide neon (9)', () => {
  for (let n = 1; n <= 9; n++) assert.ok(diffParts(nonRoster(V[n - 1]), nonRoster(V[n])).add.length, `lv${n}: something new`);
  assert.ok(V[5]['tower.show'] && !V[4]['tower.show'], 'Lv5 light show on 101');
  assert.ok(V[6]['bulb.substation'] && !V[5]['bulb.substation'], 'Lv6 substation');
  assert.equal(V[6]['sat.windmill'].speed, 0, 'turbine still before Lv7'); assert.ok(V[7]['sat.windmill'].speed > 0, 'Lv7 the turbine turns');
  assert.ok(!V[6]['sat.lighthouse'] && !V[6]['sat.beam'] && V[7]['sat.lighthouse'] && V[7]['sat.beam'], 'Lv7 the lighthouse lights');
  assert.ok(!V[7]['chip.cable'] && V[8]['chip.cable'] && !V[8]['chip.cable'].lit, 'Lv8 the cable is laid, dark until chip 6');
  for (const k of NEON) assert.ok(V[9][k] && !V[8][k], `Lv9 ${k}`);
});
// 晶片 Task 6 的電纜矩陣（燈泡這邊再驗一次）：燈泡 ≥8 鋪好，晶片 ≥6 才亮——不另外加第二條纜線
test('bulb 8 lays chip.cable (dark while chip < 6, lit from chip 6); bulb adds no cable of its own', () => {
  for (let b = 0; b <= 9; b++) for (let c = 0; c <= 9; c++) {
    const cab = chip.view(lv({ bulb: b, chip: c }), {})['chip.cable'];
    assert.equal(!!cab, b >= 8 || c >= 6, `bulb ${b} chip ${c}`); if (cab) assert.equal(cab.lit, c >= 6, `bulb ${b} chip ${c} lit`);
    assert.ok(!Object.values(bulb.view(lv({ bulb: b, chip: c, token: 9 }), {})).some(p => p.kind === 'cable'), 'no second cable');
  }
});
test('Lv6 substation: battery cabinets and a transformer whose insulators hum (glow); declared footprint in the centre cell', () => {
  const s = bulb.view(atLv(6), {})['bulb.substation'];
  assert.equal(s.kind, 'compound'); assert.ok(s.parts.filter(p => p.glow === C.neonBlue).length >= 4, 'cabinet lights and insulators glow');
  assert.ok(s.parts.filter(p => p.kind === 'cylinder' && p.glow).length >= 3, 'three insulators on the transformer');
  assert.deepEqual(cellAt(s.at.x, s.at.z), [0, 0]); assert.ok(!bulb.view(atLv(6), { blackout: true })['bulb.substation'].parts.some(p => p.glow), 'dark in a blackout');
});
// Lv9 全島霓虹：橋面（主島每一座橋＋上台地的階梯）、懸浮月台與車站的招牌；每個零件都發光（夜市招牌 2026-11-04 拿掉）
test('Lv9 neon: every main-island bridge gets glowing deck strips; the floating platform gets strips and a cyberpunk sign', () => {
  const v = bulb.view(atLv(9), {}), br = v['bulb.neon.bridges'], pairs = adjacentPairs(MAIN_CELLS);
  assert.equal(pairs.length, 12);
  assert.ok(br.parts.length >= pairs.length * 2 && br.parts.every(p => p.glow), `${br.parts.length} bridge strips, all glowing`);
  for (const [A, Bc] of pairs) {   // 每座橋中點附近都有燈條
    const a = axialToWorld(...A), b = axialToWorld(...Bc), m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    assert.ok(worldPoints(br).some(p => Math.hypot(p.x - m.x, p.z - m.z) < 0.3), `bridge ${A}–${Bc}`);
  }
  for (const k of ['bulb.neon.station']) {
    const p = v[k]; assert.equal(p.kind, 'neon'); assert.ok(p.parts.length && p.parts.every(q => q.glow), `${k} strips glow`);
    assert.ok(p.models.length === 1 && p.models[0].path.startsWith('quat/cyberpunk/') && existsSync(new URL(`../assets/${p.models[0].path}`, import.meta.url)), `${k} sign glb`);
    assert.ok(Object.values(p.models[0].glow).length, `${k} sign glows`);
  }
  assert.deepEqual(cellAt(v['bulb.neon.station'].at.x, v['bulb.neon.station'].at.z), [0, 1], 'on the floating platform by the station');
  assert.equal(bulb.view(lv({ bulb: 9, token: 8 }), {})['bulb.neon.station'], undefined, 'no floating platform, no platform neon');
  assert.ok(Object.values(bulb.view(atLv(9), { blackout: true })).every(p => !p.parts?.some(q => q.glow)), 'dark in a blackout');
});
// 霓虹：一站一個發光色（沿路粉藍交錯），燈頭一站一個 draw call
test('Lv3+ lamp heads: one neon colour per stop, neighbours (wrap-around included) always differ', () => {
  const v = bulb.view(atLv(3), {}), cols = LAMPS(v).map(s => new Set(s.parts.map(p => p.glow)));
  assert.ok(cols.every(c => c.size === 1), 'one colour per stop');
  cols.forEach((c, k) => { const prev = cols[(k + N_STOPS - 1) % N_STOPS]; assert.notDeepEqual([...c], [...prev], `stop ${k} differs from the stop before it`); });
});

// ── draw call（§10）：燈泡自己的零件（路燈、夜市、變電所、霓虹）≤ 24 ──
// compound：有黏土零件一個 + 每種發光色一個；neon：compound 那份 + 每個 glb（有 glow 再 +1）；名冊不算
function drawCalls(v) {
  const compound = parts => (parts.some(x => !x.glow) ? 1 : 0) + new Set(parts.filter(x => x.glow).map(x => x.glow)).size, glb = m => 1 + (m.glow ? 1 : 0);
  return Object.values(v).reduce((t, p) => t + (p.kind === 'compound' ? compound(p.parts) : p.kind === 'flicker' ? compound(p.parts) + compound(p.lit) : p.kind === 'neon' ? compound(p.parts) + (p.models ?? []).reduce((a, m) => a + glb(m), 0) : 0), 0);
}
// ── 假升級（2026-11-05 使用者：「電燈早放也能自己多長一兩級（虛構的級數），主要目的是讓畫面有在動，不一定要動到求解器」）──
// 電燈 Lv2 起原地等的回合（舞台 meta.idle.bulb：stage.js）多畫一段：等 1 回合補滿中心格另外三個角的路燈、六條邊拉燈串；等 2 回合外圈四格也補滿；
// 最多兩段（IDLE_MAX）。等級徽章不動、不冒 LEVEL UP。鎖住（停電）之後不再延伸，燈頭改成壞掉的樣子：偶爾閃一下（flicker 零件）
const idleKeys = v => Object.keys(v).filter(k => k.startsWith('bulb.idle.')).sort();
const IDLE_CELLS = [[0, 0], [1, 0], [0, 1], [-1, 1], [-1, 0]];
test('idle stages: 0 → nothing; 1 → the centre cell’s three empty corners get lamps and six light strings run along its edges; 2 → the four ring cells too; capped at IDLE_MAX; nothing below Lv2', () => {
  const view = (n, idle) => bulb.view(lv({ bulb: n }), {}, { idle: { bulb: idle } });
  assert.equal(bulb.IDLE_MAX, 2);
  assert.deepEqual(idleKeys(bulb.view(lv({ bulb: 2 }), {})), []); assert.deepEqual(idleKeys(view(2, 0)), []);
  assert.deepEqual(idleKeys(view(1, 2)), [], 'a single lamp (Lv1) gets no fictional stage');
  assert.deepEqual(idleKeys(view(2, 1)), ['bulb.idle.0,0']);
  assert.deepEqual(idleKeys(view(2, 2)), IDLE_CELLS.map(c => `bulb.idle.${c}`).sort());
  assert.deepEqual(idleKeys(view(2, 7)), idleKeys(view(2, 2)), 'capped');
  assert.deepEqual(idleKeys(view(5, 1)), ['bulb.idle.0,0'], 'any real level ≥ 2 while it waits');
  const c = view(2, 1)['bulb.idle.0,0'];
  assert.equal(c.kind, 'compound'); assert.equal(c.footprint, false);
  // 三根燈桿在 30°／150°／270°（原本的三盞在 90°／210°／330°），燈頭同高同色（暖黃、發光）
  const posts = c.parts.filter(p => p.kind === 'cylinder' && p.scale[1] === 0.5), heads = c.parts.filter(p => p.kind === 'sphere' && p.scale === 0.12);
  assert.equal(posts.length, 3); assert.equal(heads.length, 3);
  const centre = axialToWorld(0, 0), R = RING_R + 0.12;
  for (const deg of [30, 150, 270]) {
    const a = deg * Math.PI / 180, q = { x: centre.x + Math.cos(a) * R, z: centre.z + Math.sin(a) * R };
    assert.ok(worldPoints({ at: c.at, parts: posts }).some(p => near(p, q, 1e-6)), `post at ${deg}°`);
    assert.ok(worldPoints({ at: c.at, parts: heads }).some(p => near(p, q, 1e-6)), `head at ${deg}°`);
  }
  assert.ok(heads.every(h => h.glow === h.color && h.glow === C.yellow));
  // 六條彩燈串：接相鄰兩角的桿頂、中間下垂 STRING_SAG（三段細線折出來，不是一條直線——直線看起來像圍籬）＋ STRING_BULBS 顆小燈，
  // 沿線等距、三色輪流發光（暖黃／粉／藍），掛在線上（桿頂以下、垂到最低 STRING_SAG）
  const lines = c.parts.filter(p => p.kind === 'cylinder' && p.scale[0] < 0.01), bulbs = c.parts.filter(p => p.kind === 'sphere' && p.scale < 0.12);
  assert.equal(lines.length, 6 * 3); assert.equal(bulbs.length, 6 * bulb.STRING_BULBS);
  assert.ok(lines.every(l => l.scale[1] > R / 3 - 1e-6 && l.scale[1] < R / 3 + 0.1), 'three segments per edge, each about a third of the chord');
  assert.ok(lines.some(l => l.pos[1] < 0.5 - bulb.STRING_SAG / 2), 'the middle segment hangs low');
  const colours = new Set(bulbs.map(b => b.glow));
  assert.deepEqual([...colours].sort(), [C.yellow, C.neonPink, C.neonBlue].sort(), 'three colours');
  assert.ok(bulbs.every(b => b.glow === b.color && b.pos[1] <= 0.5 + 1e-9 && b.pos[1] >= 0.5 - bulb.STRING_SAG - 1e-9), 'hanging on the wire');
  // 外圈四格：各自一份，桿子站在那一格的格面上
  for (const cell of IDLE_CELLS.slice(1)) {
    const s2 = view(2, 2)[`bulb.idle.${cell}`]; assert.equal(s2.kind, 'compound');
    assert.ok(worldPoints(s2).every(p => cellAt(p.x, p.z).join() === cell.join()), `${cell}: all on its own cell`);
    assert.equal(s2.at.y, cellTop(cell));
  }
  assert.deepEqual(view(2, 2)['bulb.idle.0,0'], c, 'stage 2 keeps stage 1’s part unchanged (no rebuild)');
});
test('idle draw calls: ≤ 4 per cell (ink + three glow colours), lamps neon-coloured from Lv3', () => {
  const v = bulb.view(lv({ bulb: 2 }), {}, { idle: { bulb: 2 } });
  for (const k of idleKeys(v)) assert.ok(drawCalls({ [k]: v[k] }) <= 4, `${k}: ${drawCalls({ [k]: v[k] })}`);
  assert.ok(drawCalls(v) <= 24 + 20, `whole view ${drawCalls(v)}`);
  const heads = bulb.view(lv({ bulb: 3, token: 3 }), {}, { idle: { bulb: 1 } })['bulb.idle.0,0'].parts.filter(p => p.kind === 'sphere' && p.scale === 0.12);
  assert.ok(heads.every(h => h.glow && h.glow !== C.yellow), 'neon heads from Lv3');
});
// 停電：真的燈頭和假升級的燈頭都換成 flicker 零件——parts 是暗的（沒有 glow）、lit 是亮的那一份，零件自己照 flickerOn 偶爾把 lit 露出來
test('blackout: every lamp-head part (real stops and idle stages) becomes a flicker part with a dark parts list and a lit list; strings stop growing (view is per idle count, the count stays)', () => {
  const v = bulb.view(lv({ bulb: 2 }), { blackout: true }, { idle: { bulb: 2 } });
  for (const k of [...LAMPS(v).map((_, i) => `bulb.lamps.${i}`), ...idleKeys(v)]) {
    const s = v[k]; assert.equal(s.kind, 'flicker', k); assert.equal(s.footprint, false);
    assert.ok(!s.parts.some(p => p.glow), `${k}: dark`); assert.ok(s.lit.length && s.lit.every(p => p.glow), `${k}: a lit copy`);
    assert.equal(typeof s.seed, 'number');
  }
  assert.ok(new Set([v['bulb.main'].seed, ...LAMPS(v).map(s => s.seed)]).size === N_STOPS + 1, 'stops (and the first lamp) blink out of step');
  assert.equal(bulb.view(lv({ bulb: 2 }), {}, { idle: { bulb: 2 } })['bulb.lamps.0'].kind, 'compound', 'lit → plain compound');
  // 第一盞燈（bulb.main）也壞：雨中放下、鎖在 Lv1 的只有這一盞，也要看得出壞了（審稿 2026-11-05）；footprint 照舊
  for (const n of [1, 2]) {
    const m = bulb.view(lv({ bulb: n }), { blackout: true })['bulb.main'];
    assert.equal(m.kind, 'flicker', `lv${n} main`); assert.deepEqual(m.footprint, { r: 0.15 }); assert.ok(!m.parts.some(p => p.glow)); assert.equal(m.lit.length, 1);
    assert.equal(m.parts.filter(p => p.kind === 'cylinder').length, 1, 'the post stays in the dark copy');
  }
  assert.equal(bulb.view(lv({ bulb: 1 }), {})['bulb.main'].kind, 'compound');
});
test('flickerOn: two short blinks every FLICKER_PERIOD seconds, phase-shifted by seed; mostly off', () => {
  const { flickerOn, FLICKER_PERIOD } = bulb;
  const on = seed => { let k = 0; for (let t = 0; t < FLICKER_PERIOD; t += 0.01) if (flickerOn(t, seed)) k++; return k / (FLICKER_PERIOD / 0.01); };
  assert.ok(on(0) > 0.02 && on(0) < 0.1, `on fraction ${on(0).toFixed(3)}`);
  const edges = seed => { let n = 0, prev = false; for (let t = 0; t < FLICKER_PERIOD; t += 0.005) { const o = flickerOn(t, seed); if (o && !prev) n++; prev = o; } return n; };
  assert.equal(edges(0), 2); assert.equal(edges(3), 2);
  assert.ok(flickerOn(0.05, 0)); assert.ok(!flickerOn(0.05, 3), 'another seed blinks at another time');
  assert.equal(flickerOn(FLICKER_PERIOD + 0.05, 0), flickerOn(0.05, 0), 'periodic');
});
test('flicker part: dark copy always shown, lit copy hidden and shown only while flickerOn', async () => {
  const THREE = await import('../vendor/three/three.module.js'), { createPartFactory } = await import('../src/actors/parts.js'), { createGlowRegistry } = await import('../src/scene/glow.js');
  const glow = createGlowRegistry(), f = createPartFactory(THREE, { glow, builders: bulb.builders });
  glow.setNight(1); glow.setScale(0);   // 大停電：world.js glowScale 0 → 登記表裡的發光全歸零（審稿：閃的那份不能跟著歸零）
  const s = bulb.view(lv({ bulb: 2 }), { blackout: true })['bulb.lamps.1'], before = glow.size, p = f.build(s);
  assert.equal(glow.size, before, 'the lit copy’s materials are not in the registry');
  const litMats = []; p.object.children[1].traverse(o => { if (o.isMesh) litMats.push(o.material); });
  assert.ok(litMats.length && litMats.every(m => m.emissiveIntensity >= bulb.FLICKER_GLOW), 'the lit copy glows on its own, blackout or not');
  assert.deepEqual(p.object.position.toArray(), [s.at.x, s.at.y, s.at.z]);
  const [dark, lit] = p.object.children; assert.equal(dark.visible, true); assert.equal(lit.visible, false);
  let t = 0; const step = dt => { t += dt; p.update(dt, t); };
  let seen = false; for (let i = 0; i < 200; i++) { step(0.05); if (lit.visible) seen = true; assert.equal(lit.visible, bulb.flickerOn(t, s.seed)); assert.equal(dark.visible, true); }
  assert.ok(seen, 'it blinked at least once in 10 s');
  p.dispose();
});
// 劇本：wait 事件列到電燈 → script.idle 演這一回合的那一段（idleOf = 舞台的數字 + 1）：第 1 段平移到中心格、閃白那一份；
// 第 2 段回全景、四格一格一格閃白；超過 IDLE_MAX 回 []（turn.js 就照舊不演）；每段 ≤ SCRIPT_MAX
test('script.idle: stage 1 pans to the centre cell and applies its part; stage 2 goes home and applies the four ring cells in turn; past IDLE_MAX → []; each ≤ SCRIPT_MAX', async () => {
  const { estimateTurn } = await import('../src/show/turn.js');
  const e = { kind: 'wait', item: 'bulb', waits: [{ item: 'bulb', for: ['token'] }] }, ctx = { B, speed: 1 };
  const s = idle => ({ lv: lv({ bulb: 2 }), flags: {}, meta: { idle: idle === undefined ? {} : { idle: { bulb: idle } }.idle } });
  assert.equal(bulb.idleOf(s(undefined)), 1); assert.equal(bulb.idleOf(s(1)), 2);
  const b1 = bulb.script.idle(e, s(undefined), ctx, e.waits[0]);
  assert.equal(b1[0].kind, 'focus'); assert.deepEqual(b1[0].target, [0, 0]);
  assert.deepEqual(b1.filter(b => b.kind === 'apply').map(b => b.only), [['bulb.idle.0,0']]);
  const b2 = bulb.script.idle(e, s(1), ctx, e.waits[0]);
  assert.equal(b2[0].kind, 'focus'); assert.equal(b2[0].target, 'home'); assert.ok(b2[0].dur >= 0.8, 'the pull-back finishes before the first cell lights up');
  assert.deepEqual(b2.filter(b => b.kind === 'apply').map(b => b.only), IDLE_CELLS.slice(1).map(c => [`bulb.idle.${c}`]));
  assert.deepEqual(bulb.script.idle(e, s(2), ctx, e.waits[0]), []);
  assert.deepEqual(bulb.script.idle(e, { ...s(undefined), flags: { blackout: true } }, ctx, e.waits[0]), [], 'locked: nothing');
  for (const b of [b1, b2]) assert.ok(estimateTurn(b, ctx) <= SCRIPT_MAX, `${estimateTurn(b, ctx)} s`);
});
test('bulb draw calls ≤ 24 at every level (blackout ≤ 34 counting the hidden lit copies of the flicker parts)', () => {
  for (let n = 1; n <= 9; n++) for (const flags of [{}, { blackout: true }]) {
    const d = drawCalls(bulb.view(atLv(n), flags)); assert.ok(d <= (flags.blackout ? 34 : 24), `lv${n} ${JSON.stringify(flags)}: ${d}`);
  }
});
// ── 不出格（§14.1）：每個 footprint 的角都在它那一格裡 ──
test('every bulb footprint corner stays inside its cell', () => {
  for (let n = 1; n <= 9; n++) for (const [key, s] of Object.entries(bulb.view(atLv(n), {}))) for (const f of [].concat(s.footprint || [])) {
    const cell = cellAt(s.at.x, s.at.z), cx = s.at.x + (f.x ?? 0), cz = s.at.z + (f.z ?? 0), [hx, hz] = f.r != null ? [f.r, f.r] : [f.w / 2, f.d / 2];
    for (const [dx, dz] of [[hx, hz], [hx, -hz], [-hx, hz], [-hx, -hz]]) assert.deepEqual(cellAt(cx + dx, cz + dz), cell, `lv${n} ${key} corner (${(cx + dx).toFixed(2)}, ${(cz + dz).toFixed(2)})`);
  }
});
// 變電所的正面（老鼠 trouble 點用的 visitSpot 半徑）走得到，背後也繞得過去
test('the substation leaves its front walkable and a way round behind it', () => {
  const v = bulb.view(atLv(6), {}), nav = createNav();
  nav.setFootprints([...Object.values(v), ...Object.values(tower.view(atLv(6), {}, { total: 20 }))].flatMap(p => [].concat(p.footprint || []).map(f => ({ ...f, x: p.at.x + (f.x ?? 0), z: p.at.z + (f.z ?? 0) }))));
  const s = v['bulb.substation'], front = bulb.SUBSTATION_FRONT;
  assert.ok(nav.walkable(front.x, front.z), 'walkable in front');
  assert.ok(nav.route(front, { x: s.at.x, y: s.at.y, z: s.at.z - 0.8 }).length > 1, 'a way round behind it');
});

// ── 電工的家：Lv1–6 沒有他（計畫 16）；Lv7 起住在風車島（風機腳下的小圈，衛星島的 wander）──
test('no electrician through Lv6; from Lv7 he lives on the windmill island, ringing clear of the tower, the switch box and the house', () => {
  for (let n = 1; n <= 6; n++) assert.equal(bulb.view(atLv(n), {})['bulb.electrician'], undefined, `lv${n}`);
  const s = SATELLITES.find(x => x.kind === 'windmill'), c = axialToWorld(s.q, s.r);
  for (let n = 7; n <= 9; n++) {
    const el = bulb.view(atLv(n), {})['bulb.electrician'], h = el.home;
    assert.deepEqual([el.kind, el.n, el.accessory, h.kind], ['roster', 1, 'vest', 'wander']);
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * 2 * Math.PI, p = { x: h.at.x + Math.cos(a) * h.r, z: h.at.z + Math.sin(a) * h.r }, rel = { x: p.x - c.x, z: p.z - c.z };
      assert.ok(onWindmill(p) && Math.hypot(rel.x, rel.z) < R * 0.8, `ring point ${i} on the island`);
      assert.ok(Math.hypot(rel.x, rel.z) > 0.25, 'clear of the turbine mast'); assert.ok(Math.hypot(rel.x - 0.3, rel.z - 0.25) > 0.15, 'clear of the switch box');
      assert.ok(Math.abs(rel.x + 0.7) > 0.45 || Math.abs(rel.z - 0.4) > 0.4, 'clear of the house');
      assert.ok(rel.x < 0.95 || Math.abs(rel.z) > 0.25, 'clear of the spur deck');
    }
  }
});

// ── 劇本：◆ Lv7、Lv9 是關鍵節點（裁決 R11）──
const fullFlat = bs => bs.flatMap(b => (b.kind === 'together' ? fullFlat(b.beats) : b.kind === 'trainStop' ? [b, ...fullFlat(b.during)] : [b]));
test('◆ Lv7 and Lv9 are key nodes (R11); the other levels are short scripts', () => {
  assert.equal(bulb.script.grow[7].key, true); assert.equal(bulb.script.grow[9].key, true);
  for (const n of [2, 3, 4, 5, 6, 8]) assert.ok(!bulb.script.grow[n].key, `lv${n}`);
});
// 照 order 把整局瞬間演到 pred 命中的事件，那個事件單獨 live 演；每幀呼叫 onFrame(h, dt, r0)（r0：live 開演時假 rig 的記錄筆數）
async function liveFrames(order, pred, onFrame) {
  const h = await headlessShow(), update = h.show.update;
  let on = false, r0 = 0;
  h.show.update = (dt, t) => { update(dt, t); if (on) onFrame(h, dt, r0); };
  const r = await liveAt({ ...h, run: (evs, opts) => { on = !opts?.instant; if (on) r0 = h.rig.log.length; return h.run(evs, opts); } }, order, pred);
  return { ...h, ...r, r0 };
}
// ★◆ Lv7 離岸風電啟動（計畫 16：電工這一級才登場，從捷運站門口走出來）：電工走到站前 → 坐上列車（車頂）→ 列車開進風車島的支線 → 跳下來按開關（build）→ 風車才開始轉 → 燈塔才亮 → 回全景、LEVEL UP。
// 全程不瞬移（每幀位移 ≤ 0.6：環上趕路最快 4.5 倍約 0.45／幀）；最後住在風車島上
test('Lv7 live: the electrician steps out of the station door, rides the train out to the windmill island, flips the switch; only then the blades turn and the lighthouse lights', async () => {
  for (const order of SOLUTIONS) {
    let prev = null, maxWalk = 0, maxRide = 0, at = 0, rode = 0, station = false, firstBuild = null, firstSpin = null, firstLight = null, rot = null, blades = null, born = null;
    const what = order.join('>');
    const { show, secs } = await liveFrames(order, isBulb(7), (h, dt) => {
      at += dt;
      const [m] = h.show.roster.members('bulb.electrician'); if (!m) return;
      born ??= { ...m.pos, door: h.show.nav.nearestWalkable(DOOR), at };
      // 坐在車頂（主島外、比軌道與島面都高：環上、支線高架上）的那幾幀跟著列車（環上最快 4.5 倍約 0.45／幀）；
      // 其他時候是走路（≤ 0.15／幀）
      const riding = !cellAt(m.pos.x, m.pos.z) && m.pos.y > TRACK.y + 0.1;
      if (prev) { const d = Math.hypot(m.pos.x - prev.x, m.pos.z - prev.z); if (riding && prev.riding) maxRide = Math.max(maxRide, d); else maxWalk = Math.max(maxWalk, d); }
      prev = { ...m.pos, riding };
      if (riding) rode++;
      if (String(cellAt(m.pos.x, m.pos.z)) === '0,1') station = true;
      if (firstBuild === null && m.walker?.gesture?.kind === 'build') firstBuild = at;
      const o = h.show.stage.partObject('sat.windmill'), z = o?.visible ? o.children[0].rotation.z : null;
      if (o !== blades) { blades = o; rot = null; }   // 換速度時零件重建（轉角從 0 起算），換過的那一幀不比
      // 唯一正解：燈泡 7 在第 8 回合，颱風 Lv1–2 的風本來就吹著風車轉（沒電 3、通電 6，±0.4 的搖晃）——看轉速變成通電的轉速
      const stormy = h.show.stage.lv.typhoon >= 1 && h.show.stage.lv.typhoon <= 2, fast = stormy ? 4.5 : 0;
      if (z !== null && rot !== null && Math.abs(z - rot) / dt > fast + 1e-6 && firstSpin === null) firstSpin = at;
      rot = z;
      if (firstLight === null && h.show.stage.partObject('sat.lighthouse')?.visible) firstLight = at;
    });
    assert.ok(born && born.at < 0.1 && Math.hypot(born.x - born.door.x, born.z - born.door.z) < 0.15, `${what}: appears at the station door at once (${born && `${born.x.toFixed(2)}, ${born.z.toFixed(2)} at ${born.at.toFixed(2)} s`})`);
    assert.ok(station, `${what}: walked into the station cell`);
    assert.ok(rode > 20, `${what}: rode on the train (${rode} frames)`);
    assert.ok(maxWalk <= 0.15, `${what}: no teleport off the train (max step ${maxWalk.toFixed(3)})`);
    assert.ok(maxRide <= 0.5, `${what}: no teleport on the train (max step ${maxRide.toFixed(3)})`);
    assert.ok(firstBuild !== null && firstSpin !== null && firstSpin > firstBuild, `${what}: blades turn after the switch (${firstBuild}, ${firstSpin})`);
    // 裁決 R17（◆ ≤ 8 s）：不等鏡頭停好，風車閃白之後燈塔就亮（原 ≥ 0.9 s）
    assert.ok(firstLight !== null && firstLight >= firstSpin + 0.1, `${what}: lighthouse lights on the way to the overview after the turbine (${firstSpin}, ${firstLight})`);
    const [m] = show.roster.members('bulb.electrician'); assert.ok(onWindmill(m.pos) && m.mode === 'home', `${what}: lives on the windmill island`);
    assert.ok(show.roster.members('sat.keeper').length === 1, 'the keeper comes with the light');
    assert.ok(secs <= KEY_MAX, `${what}: ${secs.toFixed(2)} s`);
  }
});
// 最壞的列車位置（審稿第 1 輪）：車頭剛開過站 0.05 rad（倒車回來接他），和剛過倒車上限（要往前繞四分之三圈）——整段 ≤ 10 s
test('Lv7 with the train badly placed (just left the station / just past the back-up limit): the whole event still ≤ 10 s, no overspeed', async () => {
  for (const order of SOLUTIONS) for (const behind of [0.05, Math.PI / 2 + 0.05]) {
    const h = await headlessShow(), update = h.show.update, rates = [];
    let on = false;
    h.show.update = (dt, t) => { const o = h.rail.offset; update(dt, t); if (on) rates.push(1 + (h.rail.offset - o) / dt); };
    await liveAt({ ...h, run: (evs, opts) => { on = !opts?.instant; if (on) h.rail.offset = (STATION_A + behind) / 0.35; return h.run(evs, opts); } }, order, isBulb(7));
    const what = `${order.join('>')} behind ${behind.toFixed(2)}`;
    assert.ok(h.show.elapsed <= 10, `${what}: whole event ${h.show.elapsed.toFixed(2)} s`);
    assert.ok(Math.max(...rates.map(Math.abs)) <= TRAIN_MAX_BOOST + 1e-6, `${what}: max ${Math.max(...rates.map(Math.abs)).toFixed(2)}×`);
    if (behind < 0.1) assert.ok(rates.some(r => r < -0.5), `${what}: backs up into the station`);
  }
});
// 沒有列車在跑就不演（照規則不會發生）：直接報錯，不讓他從海上瞬移過去
// Task 6a 修正輪裁決：以前沒列車就丟錯（不讓他從海上瞬移過去）；現在建串時看得到車、演到時車卻停了（萬一），上車那拍自己跳過——
// 不丟錯，也不瞬移（他沒被拿到劇本手上、位置不動）。建串時就沒車的退路另一個測試量（「no train running」）
test('Lv7 whose train is gone at beat time skips the boarding: no throw, the electrician is not moved', () => {
  const m = { pos: { x: 0, y: 0.65, z: 2 }, head: () => m.pos };
  let claimed = 0;
  const ctx = { B, roster: { members: k => (k === 'bulb.electrician' ? [m] : []), claim() { claimed++; } }, stage: { partObject: () => null, flags: {} }, nav: { route: (a, b) => [a, b], routeLength: () => 1, nearestWalkable: p => p }, now: 0, rail: { offset: 0 } };
  const beats = bulb.script.grow[7](E(7), { lv: atLv(7), flags: {} }, ctx), board = fullFlat(beats).find(b => b.kind === 'board');
  assert.equal(board.start(ctx), false, 'skipped');
  assert.equal(claimed, 0); assert.deepEqual(m.pos, { x: 0, y: 0.65, z: 2 });
});
// 坐車那段列車不超速、不瞬移：環上每幀轉的角度 ≤ 原速 4.5 倍；從站上出發（launch）是慢慢加速的
test('Lv7: every frame the train moves at most 4.5× normal speed, and it eases out of the station', async () => {
  for (const order of SOLUTIONS) {
    const rates = [];
    await liveFrames(order, isBulb(7), (h, dt) => { const o = h.rail.offset; rates.push([o, dt]); });
    const r = rates.slice(1).map(([o, dt], i) => 1 + (o - rates[i][0]) / dt);
    assert.ok(Math.max(...r.map(Math.abs)) <= TRAIN_MAX_BOOST + 1e-6, `${order.join('>')} max ${Math.max(...r).toFixed(2)}×`);
    // 停站（≈ 0）之後的下一段不是一幀就跳到 4 倍以上
    for (let i = 1; i < r.length; i++) if (Math.abs(r[i - 1]) < 1e-6 && r[i] > 1e-6) assert.ok(r[i] < 1.5, `${order.join('>')} launch jumps to ${r[i].toFixed(2)}×`);
  }
});
// ★ Lv8 海底電纜：鏡頭在風車島、電工在開關箱前一敲（build）→ 電纜閃白鋪好（晶片 < 6：暗的）
test('Lv8 live: the electrician works at the switch box on the windmill island and the cable appears (dark while chip < 6)', async () => {
  for (const order of SOLUTIONS) {
    let build = 0, cableAt = null, t = 0;
    const { show } = await liveFrames(order, isBulb(8), (h, dt) => {
      t += dt; const [m] = h.show.roster.members('bulb.electrician');
      if (m?.walker?.gesture?.kind === 'build') { build++; assert.ok(onWindmill(m.pos), 'working on the windmill island'); }
      if (cableAt === null && h.show.stage.partObject('chip.cable')?.visible) cableAt = t;
    });
    assert.ok(build > 10 && cableAt !== null, `${order.join('>')}: build ${build}, cable ${cableAt}`);
    const cab = chip.view(show.stage.lv, show.stage.flags)['chip.cable']; assert.ok(cab);
    assert.equal(cab.lit, show.stage.lv.chip >= 6);
  }
});
// ◆ Lv9 全島霓虹：鏡頭先到車站格、再回全景；霓虹零件一個個閃白亮起，從第一個到最後一個 ≤ 1.5 s
test('Lv9 live: the neon parts light up one after another within 1.5 s, with one camera pass (station cell → overview)', async () => {
  for (const order of SOLUTIONS) {
    const first = {}; let t = 0;
    const h = await liveFrames(order, isBulb(9), (hh, dt) => { t += dt; for (const k of NEON) if (first[k] === undefined && hh.show.stage.partObject(k)?.visible) first[k] = t; });
    // 回到 GROW（2026-10-29）：燈泡 9 是 auto（以前要代幣 ≥9），懸浮月台要代幣 9，月台的霓虹等代幣 9 才跟著出現；
    //   唯一正解燈泡 9 在最後一輪、代幣第 8 回合就到 9——月台已經蓋好、月台霓虹一起亮。查的是這一刻 view 裡有的霓虹
    const { lv: L, flags } = h.show.stage, want = NEON.filter(k => bulb.view(L, flags)[k]);
    assert.equal(want.includes('bulb.neon.station'), L.token >= 9 && !flags.flooded, `${order.join('>')}: platform neon only with the floating platform (token ${L.token})`);
    const ts = want.map(k => first[k]); assert.ok(want.length >= 2 && ts.every(x => x !== undefined), JSON.stringify(first));
    assert.ok(Math.max(...ts) - Math.min(...ts) <= 1.5, `${order.join('>')} ${JSON.stringify(first)}`);
    const trail = focusTrail(h.rig.log, h.r0);
    assert.deepEqual(trail.slice(0, 2).map(String), ['0,1', 'home'], JSON.stringify(trail));
  }
});
// 裁決 R18：?quality=low 不畫霓虹燈條（橋面、月台），招牌 glb 留著
test('quality low: neon parts drop their strips and keep only the sign models', async () => {
  const THREE = await import('../vendor/three/three.module.js'), { createPartFactory } = await import('../src/actors/parts.js'), { createGlowRegistry } = await import('../src/scene/glow.js');
  const spawned = [], f = q => createPartFactory(THREE, { glow: createGlowRegistry(), builders: bulb.builders, quality: q, assets: { spawn: async (p, o) => { spawned.push(p); const g = new THREE.Group(); o?.parent?.add(g); return g; } } });
  const v = bulb.view(lv({ bulb: 9, token: 9 }), {});
  for (const key of ['bulb.neon.bridges', 'bulb.neon.station']) {
    const meshes = q => { let n = 0; f(q).build(v[key]).object.traverse(o => { if (o.isMesh) n++; }); return n; };
    assert.ok(meshes('high') > 0, `${key} has strips at high`); assert.equal(meshes('low'), 0, `${key} no strips at low`);
  }
  assert.ok(spawned.length >= 1, 'the station sign still loads at low');
});
// 審稿（裁決 R17）：◆ Lv7 在唯一正解整局 live 演出裡（不是單獨演）也 ≤ 8 s（扣掉物品之間的空拍）。
// 計畫 5b 任務 4（節奏）：Lv5 全島 LED 在真的回合裡也 ≤ 4.5 s——放下當回合就長，電工常在主島另一頭，以前走去 101 腳下要 9 秒（外星第 6 回合 59 s）
test('live play, the solution: ◆ bulb Lv7 takes ≤ 8 s and Lv5 ≤ 4.5 s (script) in the real turn', async () => {
  const { playLive, KEY_MAX, SCRIPT_MAX } = await import('./helpers/show.js');
  for (const order of SOLUTIONS) {
    const evs = await playLive(order), at = to => evs.find(x => x.e.kind === 'grow' && x.e.item === 'bulb' && x.e.to === to);
    // 正解的燈泡是 6 → 8 跳級（第 8 回合）：合成一段演 n−1 的 ◆ Lv7 劇本（協調者裁決：風車島不能消失），量的是那個合成的燈泡 8 事件。
    // 起因閃一下那段（平移到幫手、閃白、平移回目標）不算在內：playLive 單獨量，掛在事件的 cause 上（Task 3 裁決 B）
    const ev = at(8)?.e.jump ? at(8) : at(7), five = at(5);
    assert.ok(ev && ev.key && ev.live <= KEY_MAX, `${order.join('>')} turn ${ev?.turn} bulb ${ev?.e.to}${ev?.e.jump ? ' (merged jump)' : ''}: ${ev?.live.toFixed(2)} s`);
    // 跳級合成一段（回到 GROW 設計 §4.2）之後，跳級的第二級也演自己的劇本（正解的燈泡 5 是第 6 回合 4 → 5 跳級的第二級）
    assert.ok(five && five.script <= SCRIPT_MAX, `${order.join('>')} turn ${five?.turn}: Lv5 ${five?.script.toFixed(2)} s`);
  }
});
// 拜訪點（計畫 6 設計 §4、§5）：唯一正解每一個 bulb 的 placed／grow，演之前與演完之後問 visitSpot——在格子裡、站位走得到；問到的級寫死
test('visitSpot(n, s) for every level 1..max: on the main island cell of the item (or null for off-island levels), frontOf(spot, r, nav) walkable within 0.6', async () => {
  const { visitSpotsThroughSolutions } = await import('./helpers/show.js');
  assert.equal(typeof bulb.visitSpot, 'function');
  const { bad, seen } = await visitSpotsThroughSolutions(bulb, SOLUTIONS, { cells: () => [[0, 0]] });   // 計畫 16 起夜市（Lv4／Lv9 的拜訪點）也在中心格
  assert.deepEqual(bad, []);
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 9]);
});


// Task 6a 修正輪（控制者裁決，Critical）：以前 Lv7 劇本在沒列車時直接丟錯，玩家亂放就整局卡死。沒列車演不搭車的版本：
// 不叫電工，鏡頭到風車島、套用（風車轉、燈塔亮）、回全景、LEVEL UP。
// 計畫 9 連鎖（2026-10-30，設計 §8 R3）：燈泡 7 要代幣 ≥5，規則下燈泡到 7 一定有列車（show.test 整份列舉驗）——退路程式留著當防呆，
//   這裡改用合成狀態直接演劇本、不經引擎。
// 唯一正解（2026-10-31）：淹水鎖代幣 ≤3，列舉 4 萬局裡淹水時燈泡最多 4 級（燈泡 5 要棒球 4／代幣 4，淹水局到不了）——
//   引擎走不到「淹水＋燈泡 6」，舊前提（EXAMPLE.hit 前 7 回合到燈泡 6、代幣 4）過時。改成：EXAMPLE.hit 8 回合瞬間演完
//   R38（使用者 2026-11-05）：EXAMPLE.hit 的老鼠早放咬住鮮奶、燈泡只到 3——改老鼠最後放的同型一局（milk,chip,bulb,token,typhoon,boba,baseball,rat：淹水、燈泡 4、代幣 2）
//   （淹水、燈泡 4、代幣 2、沒有環狀線），再瞬間演合成的燈泡 4 → 5 → 6，之後 live 演一個合成的燈泡 6 → 7
async function floodedAtBulb6(h) {
  const { turnSteps } = await import('./helpers/show.js'), { EXAMPLE } = await import('./helpers/endings.js');
  let s = engine.createState(spec);
  for (const step of turnSteps(['milk', 'chip', 'bulb', 'token', 'typhoon', 'boba', 'baseball', 'rat']).slice(0, 8)) { const r = step(s); s = r.state; await h.run([...r.events, { kind: 'settle' }], { instant: true }); }
  assert.ok(s.flags.flooded && s.lv.bulb === 4 && s.lv.token === 2, `precondition: flooded, bulb 4, token 2 (${JSON.stringify(s.lv)})`);
  await h.run([bulbGrow(4, 5), bulbGrow(5, 6), { kind: 'settle' }], { instant: true });
  s = { ...s, lv: { ...s.lv, bulb: 6 } };
  assert.deepEqual(h.show.stage.lv, s.lv);
  return s;
}
const bulbGrow = (from, to) => ({ kind: 'grow', item: 'bulb', from, to, story: spec.STORIES.grow.bulb[to] });
test('bulb Lv7 with no train running (synthetic: flooded, token 2) plays the fallback instead of throwing: the windmill turns, LEVEL UP on bulb', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  await floodedAtBulb6(h);
  const n = bubblesLog.length;
  await run([bulbGrow(6, 7), { kind: 'settle' }]);
  assert.equal(show.stage.lv.bulb, 7);
  assert.ok(bubblesLog.slice(n).some(b => b.text === 'LEVEL UP' && Math.hypot(b.at.x - show.stage.headOf('bulb').x, b.at.z - show.stage.headOf('bulb').z) < 0.3), 'LEVEL UP over bulb');
  assert.ok(show.stage.partKeys().includes('sat.lighthouse'), 'the lighthouse is up');
  // 風車真的在轉（不是只有零件在）：再推 6 幀，葉片轉了
  const blades = () => show.stage.partObject('sat.windmill')?.children[0].rotation.z ?? 0, z0 = blades();
  for (let f = 0; f < 6; f++) show.update(1 / 30, 900 + f / 30);
  assert.ok(Math.abs(blades() - z0) > 1e-6, 'the windmill turns');
  assert.ok(sat.view(show.stage.lv, show.stage.flags)['sat.windmill'].speed > 0, 'turbine speed > 0');
  // 劇本本身：沒列車就不叫他走去搭車——計畫 16 起他這一級才登場，直接生在島上的家（ISLAND_HOME）、回日常；有列車（代幣 5、沒淹水）就從車站門口走出來搭車
  const build = (token, flags) => bulb.script.grow[7](bulbGrow(6, 7), { lv: lv({ bulb: 7, token }), flags }, { B, roster: { members: () => [] } }), kinds = (...a) => build(...a).map(b => b.kind);
  // 第一拍：鏡頭 ‖ hold 住他的宣告 → 生出來（together 依序 start；第一拍有 focus，turn.js 不另外補平移）
  const FALLBACK = ['together', 'apply', 'home', 'focus', 'levelUp'], opening = (...a) => build(...a)[0].beats.map(b => b.kind);
  assert.deepEqual(kinds(4, { flooded: true }), FALLBACK, 'flooded: the trains are stopped');
  assert.deepEqual(kinds(0, {}), FALLBACK, 'no token: no ring line');
  assert.deepEqual(opening(0, {}), ['focus', 'apply', 'spawn']);
  const hold = build(0, {})[0].beats[1]; assert.deepEqual(hold.only, ['bulb.electrician']);
  assert.notDeepEqual(kinds(5, {}), FALLBACK, 'token 5, not flooded: he rides the train');
  assert.deepEqual(opening(5, {}), ['focus', 'apply', 'spawn', 'board'], 'token 5: the camera, held, spawned at the door, boarding — together');
});
// Task 6a 修正輪 2（控制者裁決）：沒車的退路把電工放到風車島上（計畫 16 起他這一級才登場：直接生在島上的家，不從主島換過去），
// 之後沒合成的燈泡 8 照常演：他在島上的開關箱前一敲、電纜出現。合成狀態同上（設計 §8 R3）：淹水局燈泡 6 之後 live 演合成的 6 → 7、
// 再一回合合成的 7 → 8（不合成跳級），同一趟查不瞬移、換位置閃白（gameInvariants）
test('the no-train fallback (synthetic: flooded) puts the electrician straight onto the windmill island; the following unmerged bulb 8 plays the switch beats there', async () => {
  const { gameInvariants } = await import('./helpers/show.js');
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  await floodedAtBulb6(h);
  const inv = gameInvariants(show);
  let build = 0, watching = false;
  const update = show.update;
  show.update = (dt, t) => { update(dt, t); const [m] = show.roster.members('bulb.electrician'); if (watching && m?.walker?.gesture?.kind === 'build') { build++; assert.ok(onWindmill(m.pos), 'working on the windmill island'); } };
  inv.label('synthetic bulb 6 → 7');
  await run([bulbGrow(6, 7), { kind: 'settle' }]);
  const [m] = show.roster.members('bulb.electrician');
  assert.ok(m && onWindmill(m.pos), `after the fallback the electrician is on the windmill island (${m && `${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)}`})`);
  inv.label('synthetic bulb 7 → 8'); watching = true;
  const n = bubblesLog.length;
  await run([bulbGrow(7, 8), { kind: 'settle' }]);
  assert.equal(show.stage.lv.bulb, 8);
  assert.ok(build > 10, `bulb 8: the switch beats play on the island (${build} build frames)`);
  assert.ok(show.stage.partKeys().includes('chip.cable'), 'the cable is laid');
  assert.ok(bubblesLog.slice(n).some(b => b.text === 'LEVEL UP' && Math.hypot(b.at.x - show.stage.headOf('bulb').x, b.at.z - show.stage.headOf('bulb').z) < 0.3), 'LEVEL UP over bulb');
  assert.deepEqual([...inv.pops].slice(0, 10), [], 'every relocation blinks');
  assert.deepEqual([...inv.jumps].slice(0, 10), [], 'no silent jumps in daily life');
  assert.deepEqual([...inv.walls].slice(0, 10), []);
});
