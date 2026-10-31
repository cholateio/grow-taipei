import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as chip from '../src/actors/chip.js';
import * as tower from '../src/actors/tower.js';
import { anchorWorld, frontOf, cellOf } from '../src/actors/anchors.js';
import { cellAt, RING_R, SATELLITES, axialToWorld, WATER_Y, R, worldToAxial } from '../src/scene/hex.js';
import { C } from '../src/actors/palette.js';
import { diffParts } from '../src/actors/stage.js';
import { SHIELD_TEST_DUR } from '../src/actors/parts.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { lv, worldPoints, distToCell, entryProblems, focusTrail } from './helpers/actors.js';
import { B, STATION_A, TRAIN_ARRIVE, SPUR_BRAKE, TRAIN_MAX_BOOST } from '../src/show/beats.js';
import { headlessShow, playItem, entriesThroughSolutions, solo, SCRIPT_MAX, KEY_MAX } from './helpers/show.js';
import { createNav } from '../src/show/nav.js';
const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);   // 唯一正解（賽博），從求解器取
const AT = anchorWorld('chip'), CELL = cellOf('chip'), TOWER = anchorWorld('tower');
const PALETTE = new Set(Object.values(C));
const fakeCtx = { B, roster: { members: () => [], nearest: () => null, keys: () => [] } };
const flat = bs => bs.flatMap(b => (b.kind === 'together' ? flat(b.beats) : b.kind === 'trainStop' ? [b, ...flat(b.during)] : [b]));

// 晶片 Lv7–9 的零件在 101 上（tower.antenna、tower.shield）：一起看
const both = L => ({ ...chip.view(L, {}), ...Object.fromEntries(Object.entries(tower.view(L, {}, { total: 31 })).filter(([k]) => k === 'tower.antenna' || k === 'tower.shield')) });
// 照正解走到晶片 n 級時的其他物品（燈泡 ≥8 才有晶片 6、颱風 ≥2 才有 9）
const at = n => lv({ chip: n, bulb: n >= 6 ? 8 : 3, token: n >= 7 ? 7 : 3, milk: 4, typhoon: n >= 9 ? 2 : 0 });
const views = Array.from({ length: 10 }, (_, n) => both(at(n)));
const nonRoster = v => Object.fromEntries(Object.entries(v).filter(([, p]) => p.kind !== 'roster'));

test('chip has its v2 ladder (max 9)', () => { assert.equal(spec.ITEMS.chip.max, 9); });

// ── 每一級看得見什麼（§4.3）──
test('chip view has something new at every level 1–9 (chip cell, the cable, the antenna and shield on 101)', () => {
  assert.deepEqual(Object.keys(views[0]), []);
  for (let n = 1; n <= 9; n++) assert.ok(diffParts(nonRoster(views[n - 1]), nonRoster(views[n])).add.length, `lv${n}: something new`);
  const v = views;
  assert.ok(v[1]['chip.main'].parts.filter(p => p.kind === 'cone').length >= 3 && v[1]['chip.crane'] && v[1]['chip.worker'], 'Lv1 site: fence, cones, crane, worker');
  assert.equal(v[2]['chip.main'].kind, 'campus'); assert.ok(v[2]['chip.smoke'] && !v[2]['chip.crane'] && !v[2]['chip.worker'], 'Lv2 factory with a smoking chimney');
  assert.ok(v[3]['chip.campus'].parts.filter(p => p.kind === 'box' && p.color === C.glass).length === 3, 'Lv3 three glass boxes');
  assert.ok(v[4]['chip.campus'].parts.some(p => p.kind === 'dome' && p.color === C.glass), 'Lv4 the arched-glass HQ');
  assert.ok(v[5]['chip.solar'] && v[5]['chip.substation'] && !v[5]['chip.smoke'] && !v[4]['chip.solar'], 'Lv5 solar roof and substation; the chimney stops smoking');
  assert.ok(v[6]['chip.cable'].lit && !v[5]['chip.cable'], 'Lv6 the cable is live');
  assert.ok(v[6]['chip.main'].models.some(m => Object.values(m.glow ?? {}).includes(C.warm)) && !v[5]['chip.main'].models.some(m => m.glow), 'Lv6 factory lights all on');
  assert.ok(v[7]['tower.antenna'] && !v[6]['tower.antenna'], 'Lv7 antenna on 101');
  assert.equal(v[8]['tower.shield'].state, 'test'); assert.equal(v[7]['tower.shield'], undefined);
  assert.equal(v[9]['tower.shield'].state, 'standby'); assert.equal(v[9]['tower.antenna'].pulse, true);
});
test('chip glb parts (factory, chimney, solar panels) exist and take the palette tint', () => {
  for (let n = 2; n <= 9; n++) for (const key of ['chip.main', 'chip.solar']) for (const m of views[n][key]?.models ?? []) {
    assert.ok(m.path.startsWith('kenney/industrial/') && existsSync(new URL(`../assets/${m.path}`, import.meta.url)), m.path);
    for (const c of [...Object.values(m.tint), ...Object.values(m.glow ?? {})]) assert.ok(PALETTE.has(c), `lv${n} ${m.path} tint ${c.toString(16)}`);
  }
  assert.deepEqual(views[2]['chip.main'].models.map(m => m.path), [chip.MODELS.factory.path, chip.MODELS.chimney.path]);
  assert.equal(views[5]['chip.solar'].models.length, 3);
  const roof = chip.MODELS.factory.roof * views[5]['chip.main'].models[0].h;
  for (const m of views[5]['chip.solar'].models) assert.ok(Math.abs(m.pos[1] - roof) < 0.02, 'panels sit on the factory roof');
});
// 計畫 9 §5（2026-10-30）：騎 YouBike 的四個拿掉了（在 101 腳下的死路擠成一坨；草地上的環躲不開通勤路線與拜訪站位）——Lv3 起三個穿外套的照樣通勤
// 修正批次 roles（裁決 R23，使用者「晶片廠工人直接變成光頭」）：Lv2 的工程師就是 Lv1 的工人（from 'chip.worker'），Lv3 起多一個
test('engineers: the worker becomes the one engineer at Lv2 (from chip.worker), 2 in coats from Lv3; rats ≥2 turn one into a detective (people budget: engineers ≤ 2, detective 1, worker 1)', () => {
  const e2 = chip.view(lv({ chip: 2 }), {})['chip.engineers'];
  assert.deepEqual([e2.kind, e2.n, e2.accessory, e2.from], ['roster', 1, 'coat', 'chip.worker']); assert.deepEqual(e2.home, { kind: 'path', path: chip.ENGINEER_ROUTE, loop: false, speed: 0.45, entry: chip.ENGINEER_ENTRY });
  for (let n = 3; n <= 9; n++) {
    const v = chip.view(lv({ chip: n }), {}), vr = chip.view(lv({ chip: n, rat: 3 }), {});   // 老鼠 Lv3 泡溫泉（沒有列車）：跟著老鼠（鼠窩那級站在隔壁格盯著，見下一個測試）
    assert.deepEqual([v['chip.engineers'].n, v['chip.engineers'].accessory, v['chip.engineers'].from], [2, 'coat', 'chip.worker'], `lv${n}`);
    assert.deepEqual(v['chip.engineers'].home, e2.home, `lv${n} same commute as Lv2`);
    assert.equal(vr['chip.engineers'].n, 1); const d = vr['chip.detective'];
    assert.deepEqual([d.kind, d.n, d.accessory, d.from], ['roster', 1, 'glass', 'chip.engineers']); assert.deepEqual(d.home, { kind: 'follow', key: 'rat.pack', dist: 0.6, entry: chip.ENGINEER_ENTRY[0] });
    assert.equal(v['chip.worker'], undefined);
  }
  assert.equal(chip.view(lv({ chip: 2, rat: 2 }), {})['chip.detective'], undefined, 'needs chip ≥3');
  assert.deepEqual(chip.view(lv({ chip: 1 }), {})['chip.worker'].home, { kind: 'wander', at: AT, r: 0.9, entry: chip.WORKER_ENTRY });
});
// 審稿第 2 輪：老鼠坐在環狀線的車上時偵防師追不到（一直對著列車重新規劃只會在別人路上原地踏步）——在捷運站北側等，老鼠下車再跟
test('detective: follows the rats, but watches the nest from the next cell and waits by the station while they ride the train', () => {
  const ride = chip.view(lv({ chip: 5, rat: 3, token: 4 }), {})['chip.detective'];
  assert.equal(ride.home.kind, 'stand'); assert.equal(ride.home.spots.length, 1); assert.equal(ride.home.entry, chip.ENGINEER_ENTRY[0]);
  const w = ride.home.spots[0], st = anchorWorld('token'); assert.deepEqual(cellAt(w.x, w.z), cellOf('token'), 'in the station cell'); assert.ok(Math.hypot(w.x - st.x, w.z - st.z) < 1.5, 'by the station');
  assert.ok(Math.hypot(w.x - chip.ENGINEER_ENTRY[0].x, w.z - chip.ENGINEER_ENTRY[0].z) >= 1.5, 'entry ≥ 1.5 from the spot');
  for (const [r, t, flags] of [[3, 3, {}], [4, 7, { ratBranch: 'alien' }], [4, 7, { ratBranch: 'cyber' }]]) assert.equal(chip.view(lv({ chip: 5, rat: r, token: t }), flags)['chip.detective'].home.kind, 'follow', `rat ${r} token ${t}`);
  // 鼠窩（老鼠 Lv2）在球場格裡：他站在隔壁格的邊上盯著窩（球場格的人數預算），面向窩
  const nest = chip.view(lv({ chip: 5, rat: 2, token: 4 }), {})['chip.detective'].home, p = nest.spots[0], at = anchorWorld('rat');
  assert.equal(nest.kind, 'stand'); assert.notDeepEqual(cellAt(p.x, p.z), cellAt(at.x, at.z), 'outside the nest cell');
  assert.ok(Math.hypot(p.x - at.x, p.z - at.z) < 2, 'close to the nest'); assert.ok(Math.abs(Math.atan2(at.x - p.x, at.z - p.z) - p.yaw) < 1e-9, 'faces the nest');
});
// 計畫 9（2026-10-30 錄影「卡成一坨」）：正解整局 live，每回合演完再過 15 秒——劇本放回來的人走回自己錯開的那一點（roster.js），
// 不再接在同一段走成一串：最近的那一對 < 0.3 每次最多 1 秒（只有交會、沒有並排走）；101 腳下（FOOT 0.5 內）同時兩個不超過 1 秒；
// 最近的那一對 ≥ 0.3 的幀數：兩個人 ≥ 90%，三個人 ≥ 70%——通勤路線只有 3.64 公尺、走到底折返，三個人兩兩每 total ÷ 0.45 ≈ 8 秒交會一次、
// 每次 < 0.3 約 0.67 秒（相對速度 0.9），三對加起來約四分之一的時間（實測 73–77%），錯開起步也改不了交會的次數。
// 2026-10-31（唯一正解收尾）：正解第 8 回合兩個工程師同方向貼著走了整整 15 秒（晶片 7 放回來的人剛好走過另一個人的錯開點）——
//   舊的 ≥ 6 回合前提擋在前面一直沒量到；roster.js pathDir 修掉（接上折線時同方向太近就往回走或先等一下）
test('live, the solution: the commuting engineers do not walk as a convoy (only brief crossings, never two at the 101 foot for > 1 s)', async () => {
  const { turnSteps } = await import('./helpers/show.js'), DT = 1 / 30, rows = [];
  for (const order of SOLUTIONS) {
    const { show, run } = await headlessShow(); let s = engine.createState(spec), t = 1000;
    for (const [i, step] of turnSteps(order).entries()) {
      const r = step(s); s = r.state;
      await run([...r.events, { kind: 'settle' }]);
      let frames = 0, apart = 0, both = 0, longest = 0, close = 0, stretch = 0;
      for (let f = 0; f < 15 / DT; f++) {
        show.update(DT, t); t += DT; await Promise.resolve();
        const es = show.roster.members('chip.engineers').filter(m => !m.hidden); if (es.length < 2) continue;
        let d = Infinity; for (let a = 0; a < es.length; a++) for (let b = a + 1; b < es.length; b++) d = Math.min(d, Math.hypot(es[a].pos.x - es[b].pos.x, es[a].pos.z - es[b].pos.z));
        frames++; if (d >= 0.3) apart++;
        close = d < 0.3 ? close + DT : 0; stretch = Math.max(stretch, close);
        const atFoot = es.filter(m => Math.hypot(m.pos.x - chip.FOOT.x, m.pos.z - chip.FOOT.z) < 0.5).length;
        both = atFoot >= 2 ? both + DT : 0; longest = Math.max(longest, both);
      }
      if (frames) rows.push({ order: order.join('>'), turn: i + 1, chip: s.lv.chip, n: show.roster.members('chip.engineers').length, apart: apart / frames, foot: longest, stretch });
    }
  }
  if (process.env.CONVOY) console.log(JSON.stringify(rows));
  // 唯一正解（2026-10-31）：有 ≥ 2 個工程師的回合是第 5–9 回合（晶片第 5 回合放下、2 級起兩個人）；舊的 ≥ 6 是兩條正解加起來的數。
  // 裁決 R23：Lv2 一個、Lv3 起兩個（老鼠 ≥2 時一個變偵防師）——只剩第 6、7 回合有兩個
  assert.ok(rows.length >= 2, `${rows.length} turns with ≥ 2 engineers`);
  for (const r of rows) {
    assert.ok(r.stretch <= 1, `${r.order} turn ${r.turn}: closest pair < 0.3 for ${r.stretch.toFixed(2)} s in a row`);
    assert.ok(r.apart >= (r.n >= 3 ? 0.7 : 0.9), `${r.order} turn ${r.turn} (${r.n} engineers): closest pair ≥ 0.3 in only ${(r.apart * 100).toFixed(0)}% of frames`);
    assert.ok(r.foot <= 1, `${r.order} turn ${r.turn}: two engineers at the 101 foot for ${r.foot.toFixed(2)} s`);
  }
});
test('ENGINEER_ROUTE starts in the chip cell and ends at the tower foot', () => {
  const r = chip.ENGINEER_ROUTE;
  assert.deepEqual(cellAt(r[0].x, r[0].z), [1, 0]); assert.deepEqual(cellAt(r.at(-1).x, r.at(-1).z), [0, 0]);
  assert.ok(Math.hypot(r.at(-1).x - TOWER.x, r.at(-1).z - TOWER.z) < 1.3);
});

// ── 海底電纜（§5、控制者裁決）：燈泡 Lv8 鋪好（暗）、晶片 Lv6 通電（亮）；從風車島沿主島南側的海面接到變電站 ──
test('chip.cable presence / lit matrix: present when bulb ≥ 8 or chip ≥ 6, lit only when chip ≥ 6', () => {
  for (let c = 0; c <= 9; c++) for (let b = 0; b <= 9; b++) {
    const cab = chip.view(lv({ chip: c, bulb: b }), {})['chip.cable'];
    assert.equal(!!cab, b >= 8 || c >= 6, `chip ${c} bulb ${b} present`);
    if (cab) { assert.equal(cab.kind, 'cable'); assert.equal(cab.lit, c >= 6, `chip ${c} bulb ${b} lit`); }
  }
});
test('the cable runs from the windmill island over the sea (south of the main island, never across it) into the chip cell at the substation', () => {
  const s = SATELLITES.find(x => x.kind === 'windmill'), w = axialToWorld(s.q, s.r);
  const inHex = (p, c) => { const dx = Math.abs(p.x - c.x), dz = Math.abs(p.z - c.z); return dx <= R * Math.sqrt(3) / 2 && dz + dx / Math.sqrt(3) <= R; };
  for (const c of [5, 6, 9]) {
    const cab = chip.view(lv({ chip: c, bulb: 8 }), {})['chip.cable'], P = cab.path;
    assert.ok(inHex(P[0], w), 'starts on the windmill island');
    assert.deepEqual(cellAt(P.at(-1).x, P.at(-1).z), CELL, 'ends in the chip cell');
    const sub = chip.view(lv({ chip: c, bulb: 8 }), {})['chip.substation'];
    const end = P.at(-1), house = { x: sub.at.x + sub.footprint[0].x, z: sub.at.z + sub.footprint[0].z };
    assert.ok(Math.hypot(end.x - house.x, end.z - house.z) < 0.35, 'lands at the substation');
    let sea = 0;
    for (const p of P) {
      const cell = cellAt(p.x, p.z);
      if (cell) { assert.deepEqual(cell, CELL, `(${p.x.toFixed(2)}, ${p.z.toFixed(2)}) only touches the chip cell`); continue; }
      if (inHex(p, w)) continue;
      sea++; assert.ok(Math.abs(p.y - WATER_Y) < 0.1, 'on the water'); assert.ok(p.z > -0.5, 'south side (toward the camera)');
      for (const o of SATELLITES.filter(x => x.kind !== 'windmill')) assert.ok(!inHex(p, axialToWorld(o.q, o.r)), `clear of ${o.kind}`);
    }
    assert.ok(sea >= 10, `${sea} points on the sea`);
    // 段與段之間沒有大跳（管子是平滑曲線，點太疏會切過島角）
    for (let i = 1; i < P.length; i++) assert.ok(Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z) < 2.6, `segment ${i}`);
  }
});

// ── draw call（§10）：晶片格＋101 上的天線與罩子＋電纜 ≤ 20 ──
// compound：有黏土零件一個 + 每種發光色一個；glb = 1（有 glow 再 +1）；campus 每棟 glb；crane 兩個 compound；smoke 每團一個；
// cable 暗管一個（通電 +1）；shield 一個；antenna 環（同 compound）+ 每個 glb；名冊不算
function drawCalls(v) {
  const glb = m => 1 + (m.glow ? 1 : 0), compound = parts => (parts.some(x => !x.glow) ? 1 : 0) + new Set(parts.filter(x => x.glow).map(x => x.glow)).size;
  return Object.values(v).reduce((t, p) => t + (
    p.kind === 'compound' ? compound(p.parts) : p.kind === 'campus' ? p.models.reduce((a, m) => a + glb(m), 0) : p.kind === 'glb' ? glb(p)
      : p.kind === 'crane' ? 2 : p.kind === 'smoke' ? p.n : p.kind === 'cable' ? 1 + (p.lit ? 1 : 0) : p.kind === 'shield' ? 1
        : p.kind === 'antenna' ? compound(p.parts) + p.models.length : 0), 0);
}
test('chip draw calls: ≤ 20 for the chip cell, cable, antenna and shield at every level (Lv9 with rats and a rebuilt roof included)', () => {
  for (let n = 1; n <= 9; n++) for (const extra of [{}, { rat: 2, typhoon: 3 }]) {
    const d = drawCalls(both({ ...at(n), ...extra }));
    assert.ok(d <= 20, `lv${n} ${JSON.stringify(extra)}: ${d}`);
  }
});

// ── 不出格（§14.1）：每個零件與 footprint 的角都在晶片格裡（電纜走海面、天線與罩子在 101 上）──
test('every chip part and footprint corner stays inside the chip cell (the cable runs on the sea; the landing pole is on the shore)', () => {
  for (let n = 1; n <= 9; n++) for (const rat of [0, 2]) for (const [key, s] of Object.entries(chip.view({ ...at(n), rat }, {}))) {
    for (const f of [].concat(s.footprint || [])) {
      const cx = s.at.x + (f.x ?? 0), cz = s.at.z + (f.z ?? 0), [hx, hz] = f.r != null ? [f.r, f.r] : f.rx != null ? [f.rx, f.rz] : [f.w / 2, f.d / 2];
      const corners = f.r != null || f.rx != null ? [[hx, 0], [-hx, 0], [0, hz], [0, -hz]] : [[hx, hz], [hx, -hz], [-hx, hz], [-hx, -hz]];
      for (const [dx, dz] of corners) assert.deepEqual(cellAt(cx + dx, cz + dz), CELL, `lv${n} ${key} footprint corner (${(cx + dx).toFixed(2)}, ${(cz + dz).toFixed(2)})`);
    }
    if (s.kind === 'roster' || key === 'chip.cable' || key === 'chip.smoke') continue;
    const pts = s.kind === 'campus' ? s.models.map(m => ({ x: s.at.x + m.pos[0], z: s.at.z + m.pos[2] })) : s.kind === 'crane' ? [{ x: s.at.x + s.offset[0], z: s.at.z + s.offset[2] }] : worldPoints(s);
    for (const p of pts) assert.ok(distToCell(p, CELL) < RING_R, `lv${n} ${key} (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
  }
});
// Lv1 工地（2026-10-31 錄影：有人從圍籬中間穿出來）：黃色圍籬 ±0.8、牆厚 0.03 → 一個 1.66 見方的框，圍籬裡不能走
test('chip buildings declare footprints (the Lv1 fenced site, factory, glass boxes and dome, substation; the poles stand inside the back box\'s padded outline); the factory door path stays walkable', () => {
  const nav = createNav();
  const site = [].concat(chip.view(at(1), {})['chip.main'].footprint ?? []);
  assert.equal(site.length, 1, 'lv1 one box for the fenced site');
  assert.deepEqual(site[0], { w: 1.66, d: 1.66 }, 'lv1 the fence (±0.8 plus the 0.03 wall)');
  for (let n = 1; n <= 9; n++) {
    const v = chip.view(at(n), {});
    assert.deepEqual([].concat(v['chip.main'].footprint).length, 1, n === 1 ? 'lv1 the fenced site' : `lv${n} the factory (the chimney stands on its roof)`);
    if (n >= 3) assert.ok(v['chip.campus'].footprint.length >= 3, `lv${n} campus`);
    if (n >= 5) {
      assert.equal(v['chip.substation'].footprint.length, 1, 'the house; the poles stand inside the back glass box\'s padded outline'); assert.equal(v['chip.solar'].footprint, false, 'panels are on the roof');
      const b = v['chip.campus'].footprint[0], PAD = 0.12;
      for (const p of v['chip.substation'].parts.filter(q => q.kind === 'cylinder' && q.color === C.wood)) assert.ok(Math.abs(p.pos[0] - b.x) <= b.w / 2 + PAD && Math.abs(p.pos[2] - b.z) <= b.d / 2 + PAD, `pole (${p.pos[0]}, ${p.pos[2]}) inside the padded box`);
    }
    nav.setFootprints(Object.values(v).flatMap(p => [].concat(p.footprint || []).map(f => ({ ...f, x: p.at.x + (f.x ?? 0), z: p.at.z + (f.z ?? 0) }))));
    for (const p of chip.ENGINEER_ROUTE.slice(0, 2)) assert.ok(nav.walkable(p.x, p.z), `lv${n} door path (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
    assert.ok(nav.walkable(frontOf(AT, chip.FRONT_R).x, frontOf(AT, chip.FRONT_R).z), `lv${n} the front stays open`);
  }
});

// ── 劇本（§6：一級 3–5 秒；◆ Lv9 6–10 秒、回全景定格）──
const KEYS = ['chip.worker', 'chip.engineers', 'chip.detective'];
// 照 order 把整局（放置 + 倒數三回合）瞬間演到 pred 命中的那個事件，那個事件單獨 live 演；回傳 { e, secs, n, r }（n = 演之前的泡泡數、r = 鏡頭紀錄數）
async function liveAt(h, order, pred) {
  let s = engine.createState(spec);
  const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  for (const step of steps) {
    const r = step(s); s = r.state;
    for (const e of r.events) {
      if (pred(e)) { const n = h.bubblesLog.length, r0 = h.rig.log.length; return { e, secs: await h.run([solo(e)]), n, r: r0 }; }
      await h.run([e], { instant: true });
    }
    await h.run([{ kind: 'settle' }], { instant: true });
  }
  throw new Error('event not found');
}
const isChip = to => e => e.kind === 'grow' && e.item === 'chip' && e.to === to;
// 鏡頭軌跡（含回合最後的 focus('home')）
const WANT = { 6: ['home', String(CELL), 'home'], 7: ['0,1', '0,0', String(CELL), 'home'], 8: ['home', 'home'], 9: ['home', 'home', 'home'] };
test('scripts: every chip event in the solution plays 3–5 s (◆ Lv9 6–10 s whole), ends with LEVEL UP on chip, the camera trail, everyone home', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h, timing = {};
  let n = 0, r = 0;
  const tracked = (evs, opts) => { if (!opts?.instant) { n = bubblesLog.length; r = h.rig.log.length; } return run(evs, opts); };
  for (const order of SOLUTIONS) {
    show.reset();
    const seen = [];
    await playItem(show, tracked, order, 'chip', (e, secs) => {
      const to = e.kind === 'grow' ? e.to : 1, what = `${order.join('>')} ${e.kind} ${to}`; seen.push(to); (timing[to] ??= []).push(+secs.toFixed(1));
      // Lv7：列車從現在的位置趕來（≤ 4.5 倍、減速進站，不瞬移）最多 4.3 s，加上停站、抱箱子、LEVEL UP，上限放到 7.3 s（審稿第 2 輪）
      assert.ok(secs >= 3 && secs <= (to === 9 ? KEY_MAX : to === 7 ? TRAIN_ARRIVE + SPUR_BRAKE / 2 + 3 : SCRIPT_MAX), `${what} took ${secs.toFixed(2)}s`);
      if (to === 9) assert.ok(show.elapsed >= 6 && show.elapsed <= KEY_MAX, `◆ ${what} whole event ${show.elapsed.toFixed(2)}s`);
      if (e.kind === 'grow') {
        const last = bubblesLog.slice(n).at(-1), hd = show.stage.headOf('chip');
        assert.equal(last?.text, 'LEVEL UP', what); assert.ok(Math.hypot(last.at.x - hd.x, last.at.y - hd.y, last.at.z - hd.z) < 0.3, `${what} LEVEL UP over chip`);
        if (WANT[to]) assert.deepEqual(focusTrail(h.rig.log, r).map(String), WANT[to], `${what} camera trail`);
      }
      for (const k of KEYS) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', `${what} ${k}`);
      assert.equal(h.rail.trip ?? null, null, `${what} no trip left on the rail`);
    });
    assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 8, 9], `chip events seen: ${seen}`);
  }
});
// 選擇帶動升級裁決 R6：Lv7 天線、Lv8 矽盾測試也標 ◆（跳級的第二級照演完整劇本）；其他級不是
test('the ◆ key nodes are Lv7, Lv8 (R6) and Lv9 (R11); the Lv9 standby holds on the overview before the LEVEL UP', () => {
  assert.deepEqual(Object.entries(chip.script.grow).filter(([, f]) => f.key).map(([n]) => +n), [7, 8, 9]);
  const beats = flat(chip.script.grow[9]({ kind: 'grow', item: 'chip', to: 9 }, { lv: at(9), flags: {} }, fakeCtx));
  const i = beats.findIndex(b => b.kind === 'focus' && b.target === 'home' && b.dur >= 2), j = beats.findIndex(b => b.kind === 'levelUp');
  assert.ok(i > 0 && j > i, 'holds on the overview before LEVEL UP');
  assert.equal(beats[0].kind, 'focus'); assert.equal(beats[0].target, 'home', 'opens on the overview (the whole dome)');
});
// 裁決 R23：Lv2 劇本不生人——工人揮完鐵鎚，名冊在 apply 時把他原地換成外套工程師（同一個小人、閃一下）
test('Lv2: no spawn beats; the worker hammers, then the swap', () => {
  const beats = flat(chip.script.grow[2]({ kind: 'grow', item: 'chip', to: 2 }, { lv: at(2), flags: {} }, fakeCtx));
  assert.ok(!beats.some(b => b.kind === 'spawn'), `no spawn (${beats.map(b => b.kind)})`);
  const g = beats.findIndex(b => b.kind === 'gesture'), a = beats.findIndex(b => b.kind === 'apply');
  assert.ok(g >= 0 && a > g, 'hammer, then apply');
});
test('live, the solution: after chip 2 the one engineer is the former worker (same member) and the worker roster is empty; Lv3 adds one', async () => {
  const h = await headlessShow(), { show } = h, { turnSteps } = await import('./helpers/show.js'), update = show.update;
  let s = engine.createState(spec), seen2 = false, seen3 = false, worker = null;
  show.update = (dt, t) => { update(dt, t); worker ??= show.roster.members('chip.worker')[0] ?? null; };   // 工人放下、長到 2 常在同一回合
  for (const step of turnSteps(SOLUTIONS[0])) {
    const r = step(s); s = r.state;
    const was = { ...show.stage.lv };
    await h.run([...r.events, { kind: 'settle' }]);
    const es = show.roster.members('chip.engineers');
    if (show.stage.lv.chip >= 2 && !(was.chip >= 2)) {
      assert.ok(worker && es.includes(worker), 'the worker is now an engineer'); assert.equal(worker.walker.accessory, 'coat');
      assert.equal(show.roster.members('chip.worker').length, 0);
      seen2 = true;
    }
    if (show.stage.lv.chip >= 3) { assert.equal(es.length + show.roster.members('chip.detective').length, 2, `chip ${show.stage.lv.chip}`); assert.ok(es.includes(worker) || show.roster.members('chip.detective').includes(worker)); seen3 = true; }
    if (seen3) break;
  }
  assert.ok(seen2 && seen3);
});
// 唯一正解晶片 Lv3 時老鼠還沒放：另找一局老鼠先生窩、晶片才長到 3
test('grow 3 with rats ≥2: one engineer turns detective (glass) and says ！', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h;
  // 唯一正解（2026-10-31）：晶片 3 要燈泡 ≥3（燈泡 3 要代幣在場）——鮮奶、晶片、老鼠、燈泡、代幣：第 3 回合老鼠生窩（鮮奶 ≥2），
  // 第 5 回合代幣放下、燈泡 3、晶片 3（一級一級長，不是跳級）時老鼠還在窩裡（老鼠 3 要代幣 ≥4）
  const { n } = await liveAt(h, ['milk', 'chip', 'rat', 'bulb', 'token'], isChip(3));
  assert.ok(show.stage.lv.rat >= 2);
  const [d] = show.roster.members('chip.detective'); assert.equal(d?.walker.accessory, 'glass');
  assert.equal(show.roster.members('chip.engineers').length, 1);   // 2 個穿外套的，一個變偵防師（裁決 R23）
  assert.ok(bubblesLog.slice(n).some(b => b.kind === '！' && Math.hypot(b.at.x - d.head().x, b.at.z - d.head().z) < 2), 'detective ！');
});

// Lv6 ★ 廠房通電：全景看電纜，光從風車島一路跑進變電站（progress 0 → 1），再轉回晶片格看廠房燈全亮
test('Lv6 live: the camera opens on the overview, the light runs along the cable from the windmill island to the substation, the factory windows light up', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show } = h, update = show.update, prog = [];
    let o = null;
    show.update = (dt, t) => {
      update(dt, t); const c = show.stage.partObject('chip.cable');
      if (c && c !== o && c.userData.progress) { o = c; const p = c.userData.progress; c.userData.progress = k => { prog.push(k); p(k); }; }
    };
    await liveAt(h, order, isChip(6));
    assert.ok(prog.length > 20 && prog[0] < 0.1 && prog.at(-1) === 1, `${order[5]}: progress ${prog[0]} → ${prog.at(-1)} (${prog.length})`);
    for (let i = 1; i < prog.length; i++) assert.ok(prog[i] >= prog[i - 1], 'runs forward');
    assert.ok(chip.view(show.stage.lv, show.stage.flags)['chip.cable'].lit);
  }
});
// Lv7 ★ 天線：零件搭列車來——列車停在站前時站務員一敲（卸下箱子），離 101 最近的工程師抱著箱子走到 101 腳下，天線在塔頂閃白（≤ 5 s：列車最多趕 2 秒）
test('Lv7: the staff takes the box off the train while it is held at the station, then an engineer carries it to the 101 foot', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show, bubblesLog } = h, update = show.update, knocks = [], foot = new Set();
    show.update = (dt, t) => {
      const before = h.rail.offset; update(dt, t);
      if (show.roster.members('token.staff').some(m => m.walker?.gesture?.kind === 'knock')) knocks.push(h.rail.offset - before + dt);   // 停住時時鐘偏移跟時間等速倒退 → 0
      for (const m of show.roster.members('chip.engineers')) if (m.mode === 'script' && Math.hypot(m.pos.x - chip.FOOT.x, m.pos.z - chip.FOOT.z) < 0.3) foot.add(m);
    };
    // 圖框「晶片」掛在誰頭上：記下 bubbles.show 拿到的 head（演完再問一次，跟抱箱子的工程師的頭同一個位置才算掛在他身上）
    const heads = [], showBubble = show.bubbles.show;
    show.bubbles.show = (head, kind, dur) => { if (kind?.icon === 'chip') heads.push(head); return showBubble(head, kind, dur); };
    const { n } = await liveAt(h, order, isChip(7));
    assert.ok(knocks.length > 5, `knock frames ${knocks.length}`);
    assert.ok(knocks.slice(1).every(d => Math.abs(d) < 1e-9), `train held during the knock (${order.join('>')})`);
    assert.equal(foot.size, 1, 'one engineer brings the box to the 101 foot');
    const box = bubblesLog.slice(n).find(b => b.kind?.icon === 'chip'), [m] = foot;
    assert.ok(box && Math.hypot(box.at.x - chip.FOOT.x, box.at.z - chip.FOOT.z) < 2.5, 'carrying the parts (chip icon) near the foot');
    assert.ok(m && heads.length === 1, 'one chip icon');
    const hd = heads[0](), mh = m.head(); assert.ok(Math.hypot(hd.x - mh.x, hd.y - mh.y, hd.z - mh.z) < 1e-9, 'the chip icon rides on the carrier');
    assert.ok(show.stage.partKeys().includes('tower.antenna') && m);
  }
});
// Lv8 ★ 矽盾測試：罩子閃三下又收起（劇本 ≤ 10 s），全島（看得到的人）轉頭看 101
test('Lv8 live: the shield flashes three times and retracts within the event; visible islanders look at 101', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show } = h, update = show.update, ops = [], lookers = new Set();
    show.update = (dt, t) => {
      update(dt, t);
      const o = show.stage.partObject('tower.shield'), m = o?.children[0];
      if (m) ops.push(m.visible ? m.material.opacity : 0);
      for (const k of show.roster.keys()) for (const p of show.roster.members(k)) if (p.walker?.gesture?.kind === 'look') lookers.add(p);
    };
    const { secs } = await liveAt(h, order, isChip(8));
    assert.ok(secs <= 10, `${secs} s`);
    let peaks = 0; for (let i = 1; i + 1 < ops.length; i++) if (ops[i] > 0.4 && ops[i] >= ops[i - 1] && ops[i] > ops[i + 1]) peaks++;
    assert.equal(peaks, 3, `${order[5]}: flashes`);
    assert.equal(ops.at(-1), 0, 'retracted (hidden) by the end of the event');
    assert.ok(lookers.size >= 5, `${lookers.size} people look up`);
  }
});
// 審稿第 1 輪：測試罩建好就是收好的樣子，閃三下只在劇本演的時候——瞬間演完（跳過、reduced-motion）之後不會再閃
test('Lv8 instant: the test shield is retracted from the first frame and never replays its flashes', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show } = h;
    let s = engine.createState(spec), done = false;
    const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
    for (const step of steps) {
      const r = step(s); s = r.state;
      for (const e of r.events) { await h.run([e], { instant: true }); if (isChip(8)(e)) { done = true; break; } }
      if (done) break;
      await h.run([{ kind: 'settle' }], { instant: true });
    }
    const [m] = show.stage.partObject('tower.shield').children;
    for (let i = 0; i < 150; i++) { show.update(1 / 30, 500 + i / 30); assert.equal(m.visible, false, `${order.join('>')} frame ${i}`); }
  }
});
// 審稿第 1 輪：全島抬頭只叫日常裡、不是正在走進場的人；看完馬上放回日常（不凍到回合結束）
test('Lv8 live: the lookers are released right after the look (nobody in script mode at LEVEL UP) and no walk-in is pulled off its arrival', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show } = h, claim = show.roster.claim, levelUp = show.bubbles.levelUp, pulled = [], frozen = [];
    let on = false;
    show.roster.claim = m => { if (on && m.arriving) pulled.push(`${m.key}#${m.i}`); return claim(m); };
    show.bubbles.levelUp = (head, o) => { if (on) for (const k of show.roster.keys()) for (const m of show.roster.members(k)) if (m.mode === 'script') frozen.push(`${k}#${m.i}`); return levelUp(head, o); };
    const run = h.run;
    await liveAt({ ...h, run: (evs, opts) => { on = !opts?.instant; return run(evs, opts); } }, order, isChip(8));
    assert.deepEqual(pulled, [], `${order.join('>')} walk-ins claimed`); assert.deepEqual(frozen, [], `${order.join('>')} still in script mode at LEVEL UP`);
  }
});
// 審稿第 1 輪（守門用：舊版套用與歸零本來就在同一個時間軸 tick 裡，這條測試在舊版也會過）：電纜換成通電的那一幀就從頭開始跑光，不會先整條亮一幀
test('Lv6 live: the lit cable never shows fully lit before the light starts running', async () => {
  const h = await headlessShow(), { show } = h, update = show.update, seen = [];
  show.update = (dt, t) => {
    update(dt, t); const o = show.stage.partObject('chip.cable'), g = o?.children.find(c => c.material.isMeshBasicMaterial)?.geometry;
    if (g) seen.push(g.drawRange.count / g.index.count);
  };
  await liveAt(h, SOLUTIONS[0], isChip(6));
  assert.ok(seen.length > 20 && seen[0] < 0.1, `first lit frame ${seen[0]}`);
});
// 審稿第 1、2 輪：天線那級列車從它現在的位置趕來——每一幀（包括鏡頭飛去站前那段）車頭在環上轉的角度都不超過原速的 4.5 倍
//（不瞬移、不超速），進站有減速（不會一幀停下）。正解照常演一次、再演一次最壞的情況（車頭剛過站 0.05 rad，要繞一整圈）
test('Lv7: every frame the train head moves at most 4.5× normal speed (no pop, no overspeed) and it brakes into the station', async () => {
  for (const order of SOLUTIONS) for (const worst of [false, true]) {
    const h = await headlessShow(), { show } = h, update = show.update, rates = [];
    let on = false;
    show.update = (dt, t) => { const o = h.rail.offset; update(dt, t); if (on) rates.push(1 + (h.rail.offset - o) / dt); };   // 列車時鐘每幀走 dt + Δoffset（原速 = 1）
    const run = h.run, what = `${order.join('>')}${worst ? ' worst' : ''}`;
    await liveAt({ ...h, run: (evs, opts) => { on = !opts?.instant; if (on && worst) h.rail.offset = (STATION_A + 0.05) / 0.35; return run(evs, opts); } }, order, isChip(7));
    const held = rates.findIndex(r => Math.abs(r) < 1e-6);
    assert.ok(rates.length > 60 && Math.max(...rates.map(Math.abs)) <= TRAIN_MAX_BOOST + 1e-6, `${what} max ${Math.max(...rates.map(Math.abs)).toFixed(2)}×`);
    assert.ok(held > 3 && rates[held - 1] < 1, `${what} eases to a stop (${rates.slice(Math.max(0, held - 4), held + 1).map(r => r.toFixed(2))})`);
  }
});
// Lv9 ★◆ 矽盾待命：罩子從地面長起來、之後淡淡常駐（之後的回合也在）
test('Lv9 live: the standby shield rises and stays as a faint outline; 101 pulses', async () => {
  const h = await headlessShow(), { show } = h;
  await liveAt(h, SOLUTIONS[0], isChip(9));
  const o = show.stage.partObject('tower.shield'), [m] = o.children, ops = [];
  for (let i = 0; i < 300; i++) { show.update(1 / 30, 200 + i / 30); ops.push(m.visible ? m.material.opacity : 0); }
  assert.ok(o.visible && o.scale.y === 1 && m.visible);
  assert.ok(Math.min(...ops) >= 0.06 && Math.max(...ops) <= 0.22, `faint ${Math.min(...ops)}–${Math.max(...ops)}`);
  assert.ok(show.stage.partKeys().includes('tower.antenna'));
});

// 入口點（§13.2）：工人從 101 工地來；工程師（與偵防師）從廠門外靠橋那側來；入口走得到、離每個站位 ≥ 1.5（每一級、有沒有老鼠；唯一正解每一刻的真 footprint）
test('chip rosters enter from the 101 site and from outside the factory on the bridge side, walkable and ≥ 1.5 from every spot', async () => {
  const nav = createNav(), bad = [];
  for (let n = 1; n <= 9; n++) for (const rat of [0, 2]) {
    const v = chip.view({ ...at(n), rat }, {});
    for (const [k, d] of Object.entries(v)) if (d.kind === 'roster') assert.ok(d.home.entry, `lv${n} ${k} entry declared`);
    if (v['chip.worker']) { const w = v['chip.worker'].home.entry; assert.ok(w === chip.WORKER_ENTRY && Math.hypot(w.x - TOWER.x, w.z - TOWER.z) < 1.5 && String(cellAt(w.x, w.z)) === '0,0', 'worker from the 101 site'); }
    for (const e of [].concat(v['chip.engineers']?.home.entry ?? [])) { assert.deepEqual(cellAt(e.x, e.z), [1, 0]); assert.ok(e.x < AT.x - 0.5, 'west of the factory (bridge side)'); }
    nav.setFootprints(Object.values(v).flatMap(p => [].concat(p.footprint || []).map(f => ({ ...f, x: p.at.x + (f.x ?? 0), z: p.at.z + (f.z ?? 0) }))));
    bad.push(...entryProblems(v, nav, `lv${n} rat ${rat}`));
  }
  bad.push(...await entriesThroughSolutions(chip, SOLUTIONS));
  assert.deepEqual(bad, []);
});

// 蓋東西站鏡頭側（§14）：廠房那一級，工人走到工地的鏡頭側揮鐵鎚，揮完才閃白廠房
test('chip grow 2: the worker builds at the fab front before the factory appears', async () => {
  const h = await headlessShow(), { show } = h, update = show.update, seen = [];
  show.update = (dt, t) => {
    update(dt, t);
    const front = frontOf(AT, chip.FRONT_R, show.nav);
    for (const m of show.roster.members('chip.worker')) { const g = m.walker?.gesture; if (g) seen.push({ kind: g.kind, pos: { ...m.pos }, front, lv: show.stage.lv.chip }); }
  };
  await liveAt(h, SOLUTIONS[0], isChip(2));
  const b = seen.filter(f => f.kind === 'build'); assert.ok(b.length > 10, `build frames ${b.length}`);
  for (const f of b) { assert.ok(Math.hypot(f.pos.x - f.front.x, f.pos.z - f.front.z) < 0.05, 'at the fab front'); assert.equal(f.lv, 1, 'before the factory appears'); }
});
// 2026-10-28 第二輪審稿：偵防師盯窩的站位不在橋口、不在電工主路上（橋上的人讓不開，每次過橋都會在橋頭被推）——離每個橋端、主路 ≥ 0.4，
// 三種盤面都走得到
test('NEST_WATCH stays ≥ 0.4 from every bridge end and from the electrician\'s road, walkable on three boards', async () => {
  const { ALL } = await import('./helpers/show.js'), { MAIN_CELLS, adjacentPairs, edgeMidpoint, RING_R } = await import('../src/scene/hex.js'), { ROAD } = await import('../src/actors/bulb.js'), { createNav } = await import('../src/show/nav.js');
  const w = chip.NEST_WATCH, ends = adjacentPairs(MAIN_CELLS).flatMap(([A, B]) => { const { a, b } = edgeMidpoint(A, B, RING_R * Math.sqrt(3) / 2); return [a, b]; });
  for (const e of ends) assert.ok(Math.hypot(e.x - w.x, e.z - w.z) >= 0.4, `${Math.hypot(e.x - w.x, e.z - w.z).toFixed(2)} from a bridge end`);
  const segD = (p, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz))); return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t); };
  const road = Math.min(...ROAD.map((a, i) => segD(w, a, ROAD[(i + 1) % ROAD.length]))); assert.ok(road >= 0.4, `${road.toFixed(2)} from the road`);
  for (const L of [lv({ chip: 5, rat: 2, token: 4, baseball: 8, boba: 7, bulb: 9, milk: 7 }), lv({ chip: 3, rat: 2, token: 2, baseball: 3, boba: 3, bulb: 4, milk: 4 }), lv({ chip: 3, rat: 2 })]) {
    const nav = createNav(); nav.setFootprints(ALL.flatMap(m => Object.values(m.view(L, {}, {}))).flatMap(p => [].concat(p.footprint || []).map(f => ({ ...f, x: p.at.x + (f.x ?? 0), z: p.at.z + (f.z ?? 0) }))));
    assert.ok(nav.walkable(w.x, w.z), `walkable at ${JSON.stringify(L)}`);
  }
});

// 拜訪點（計畫 6 設計 §4、§5）：唯一正解每一個 chip 的 placed／grow，演之前與演完之後問 visitSpot——在格子裡、站位走得到；問到的級寫死
test('visitSpot(n, s) for every level 1..max: on the main island cell of the item (or null for off-island levels), frontOf(spot, r, nav) walkable within 0.6', async () => {
  const { visitSpotsThroughSolutions } = await import('./helpers/show.js');
  assert.equal(typeof chip.visitSpot, 'function');
  const { bad, seen } = await visitSpotsThroughSolutions(chip, SOLUTIONS, { cells: () => [[1, 0]] });
  assert.deepEqual(bad, []);
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
