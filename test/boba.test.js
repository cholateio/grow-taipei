import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as boba from '../src/actors/boba.js';
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
import { headlessShow, playItem, entriesThroughSolutions, solo, SCRIPT_MAX, KEY_MAX } from './helpers/show.js';
import { lv, worldPoints, distToCell, focusTrail, entryProblems } from './helpers/actors.js';
import { createNav, satelliteAt } from '../src/show/nav.js';
import { B } from '../src/show/beats.js';
const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);   // 兩條正解（賽博、外星），從求解器取
const AT = anchorWorld('boba'), CELL = cellOf('boba');
const near = (a, b, d) => Math.hypot(a.x - b.x, a.z - b.z) < d;
const PALETTE = new Set(Object.values(C));
const LIGHT_I = SATELLITES.findIndex(s => s.kind === 'lighthouse'), LIGHT = axialToWorld(SATELLITES[LIGHT_I].q, SATELLITES[LIGHT_I].r);
const onLighthouse = p => !cellAt(p.x, p.z) && satelliteAt(p) === LIGHT_I;
const views = Array.from({ length: 8 }, (_, n) => boba.view(lv({ boba: n }), {}));
const nonRoster = v => Object.fromEntries(Object.entries(v).filter(([, p]) => p.kind !== 'roster'));
const pick = (v, keys) => Object.fromEntries(Object.entries(v).filter(([k]) => keys.includes(k)));
// 珍奶看得見的東西：自己的零件＋小森林島分店、觀光船（衛星島）
const whole = n => ({ ...views[n], ...pick(sat.view(lv({ boba: n }), {}), ['sat.forestShop', 'sat.forest', 'sat.boats']) });
// 鏡頭方向（水平）：OVERVIEW_DIR 指向鏡頭
const CAM = (() => { const n = Math.hypot(OVERVIEW_DIR.x, OVERVIEW_DIR.z); return { x: OVERVIEW_DIR.x / n, z: OVERVIEW_DIR.z / n }; })();

test('boba has its v2 ladder (max 7)', () => { assert.equal(spec.ITEMS.boba.max, 7); });

// ── view：每一級看得見的東西都不一樣（§4.7）──
test('boba has something new at every level 1–7: cart, queue, shop, fountain, branch, flagship, festival', () => {
  assert.deepEqual(Object.keys(views[1]), ['boba.main', 'boba.owner']);
  for (let n = 2; n <= 7; n++) assert.ok(diffParts(nonRoster(whole(n - 1)), nonRoster(whole(n))).add.length, `lv${n}: something new`);
  assert.equal(views[2]['boba.queue'].n, 4);
  assert.equal(views[3]['boba.main'].kind, 'glb'); assert.equal(views[2]['boba.main'].kind, 'compound');
  assert.ok(views[4]['boba.fountain'] && !views[3]['boba.fountain'], 'Lv4 fountain');
  assert.ok(whole(5)['sat.forestShop'] && !whole(4)['sat.forestShop'], 'Lv5 forest branch');
  assert.equal(whole(5)['sat.boats'].n, whole(4)['sat.boats'].n + 2, 'Lv5 two more tour boats');
  assert.ok(views[6]['boba.flagship'] && !views[5]['boba.flagship'], 'Lv6 flagship');
  assert.ok(views[7]['boba.fleet'] && !views[6]['boba.fleet'] && views[7]['boba.yard'].parts.some(p => p.flag), 'Lv7 flags and fleet');
  assert.ok(boba.script.placed && [2, 3, 4, 5, 6, 7].every(n => boba.script.grow[n]) && boba.script.fx && boba.script.rep);
});
// 人數預算（使用者 2026-10-26）：人龍 ≤ 4，不再有閒晃的觀光客
test('people budget: queue of 4 at every level, no strollers anywhere', () => {
  for (let n = 1; n <= 7; n++) for (const milk of [0, 2, 4, 10]) {
    const v = boba.view(lv({ boba: n, milk }), {});
    assert.equal(v['boba.strollers'], undefined, `lv${n} milk${milk}`);
    assert.ok(Object.keys(v).every(k => !k.includes('stroll')));
    if (n >= 2) assert.equal(v['boba.queue'].n, 4); else assert.equal(v['boba.queue'], undefined);
  }
  assert.equal(boba.QUEUE_MAX, 4);
});
// 人龍（§13.3、計畫 3.8 Task 7）：一排、同一個 z、沿 x 間距 0.25、都面向攤車／店；店門口那排離捷運站、月台的入口 ≥ 0.25
test('the queue is one horizontal row facing the cart (Lv2) or the shop door (Lv3+); clear of the station and platform entries', () => {
  for (const [n, shop] of [[2, false], [3, true], [7, true]]) {
    const q = views[n]['boba.queue'].home.spots;
    assert.deepEqual(q, boba.queue(AT, 4, shop));
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
  for (const p of [m.path, v['boba.sign'].path, boba.MODELS.flagship.path, boba.MODELS.drone.path, boba.MODELS.boat.path]) assert.ok(existsSync(new URL(`../assets/${p}`, import.meta.url)), p);
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
  for (let n = 1; n <= 7; n++) for (let b = 0; b <= 9; b++) for (const t of [0, 3, 9]) {
    const L = lv({ boba: n, bulb: b, token: t, baseball: 8 }), all = [boba, bulb, token, baseball].flatMap(m => Object.values(m.view(L, {})));
    nav.setFootprints(all.flatMap(p => [].concat(p.footprint || []).map(f => ({ ...f, x: p.at.x + (f.x ?? 0), z: p.at.z + (f.z ?? 0) }))));
    const o = boba.view(L, {})['boba.owner'].home.spots[0];
    assert.ok(nav.walkable(o.x, o.z), `boba ${n} bulb ${b} token ${t}: owner (${o.x.toFixed(2)}, ${o.z.toFixed(2)})`);
    for (const q of boba.view(L, {})['boba.queue']?.home.spots ?? []) assert.ok(nav.walkable(q.x, q.z), `boba ${n} bulb ${b} token ${t}: queue (${q.x.toFixed(2)}, ${q.z.toFixed(2)})`);
  }
});
// ★ Lv6 旗艦店（衛星島 view）：燈塔島上的店、靠岸的小船、住在島上的兩個觀光客；兩台外送無人機（kind 'orbit'）繞店飛一小圈
test('Lv6: flagship on the lighthouse island, the ferry moored off it, two tourists living there; two delivery drones orbit the shop', () => {
  const v = views[6];
  assert.ok(onLighthouse(v['boba.flagship'].at), 'flagship on the lighthouse island');
  assert.ok(Math.hypot(v['boba.flagship'].at.x - LIGHT.x, v['boba.flagship'].at.z - LIGHT.z) > 1.0, 'clear of the lighthouse and the keeper ring');
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
// ◆ Lv7 世界珍奶節：靠海的每一條主島格邊一支旗（全部一個零件 ≤ 3 個 draw call）；船隊繞島
test('Lv7: one flag on each sea-facing main-cell edge (one part), a fleet circling the island', () => {
  const outer = MAIN_CELLS.flatMap(c => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]].filter(([dq, dr]) => !MAIN_CELLS.some(m => m[0] === c[0] + dq && m[1] === c[1] + dr)));
  assert.equal(boba.FLAG_SPOTS.length, outer.length - 1, 'every sea edge but the dome-station edge');
  for (const p of boba.FLAG_SPOTS) { const cell = cellAt(p.x, p.z); assert.ok(cell, 'on land'); assert.ok(distToCell(p, cell) > 1.9, 'by the coast'); }
  const flags = views[7]['boba.yard'].parts.filter(p => p.flag);
  assert.equal(flags.filter(p => p.kind === 'cylinder').length, boba.FLAG_SPOTS.length);
  assert.ok(flags.every(p => !p.glow), 'one clay draw call');
  const fl = views[7]['boba.fleet']; assert.equal(fl.kind, 'fleet');
  for (const p of worldPoints(fl)) { const r = Math.hypot(p.x, p.z); assert.ok(r > 13.8 && r < 15.4, 'between the satellites and the sea boats'); }
  assert.equal(boba.view(lv({ boba: 7, typhoon: 2 }), {})['boba.fleet'], undefined, 'the fleet stays in port during the storm');
});

// ── draw call：整格（含旗艦店、小船、無人機、船隊）≤ 14 ──
function drawCalls(v) {
  const compound = parts => (parts.some(x => !x.glow) ? 1 : 0) + new Set(parts.filter(x => x.glow).map(x => x.glow)).size;
  return Object.values(v).reduce((t, p) => t + (p.kind === 'compound' || p.kind === 'fleet' ? compound(p.parts) : p.kind === 'glb' || p.kind === 'orbit' ? 1 + (p.glow ? 1 : 0) : 0), 0);
}
test('boba draw calls ≤ 14 at every level (fresh milk, storm included)', () => {
  for (let n = 1; n <= 7; n++) for (const extra of [{}, { milk: 4 }, { typhoon: 2 }]) {
    const d = drawCalls(boba.view(lv({ boba: n, ...extra }), {})); assert.ok(d <= 14, `lv${n} ${JSON.stringify(extra)}: ${d}`);
  }
});
// ── 不出格（§14.1）：footprint 的角都在珍奶格裡；主島上的零件、站位都在珍奶格裡（旗子、旗艦店、小船、船隊、無人機的圈例外）──
test('every boba footprint corner and every main-island part stays inside the boba cell', () => {
  for (let n = 1; n <= 7; n++) for (const [key, s] of Object.entries(boba.view(lv({ boba: n, milk: 4 }), {}))) {
    for (const f of [].concat(s.footprint || [])) {
      const cx = s.at.x + (f.x ?? 0), cz = s.at.z + (f.z ?? 0), [hx, hz] = f.r != null ? [f.r, f.r] : [f.w / 2, f.d / 2];
      for (const [dx, dz] of [[hx, hz], [hx, -hz], [-hx, hz], [-hx, -hz]]) assert.deepEqual(cellAt(cx + dx, cz + dz), CELL, `lv${n} ${key} corner`);
    }
    if (['boba.flagship', 'boba.ferry', 'boba.tourists', 'boba.fleet'].includes(key)) continue;
    const pts = s.kind === 'compound' ? worldPoints(s).filter((p, i) => !s.parts[i]?.flag) : [s.at, ...(s.home?.spots ?? [])];
    for (const p of pts) assert.ok(distToCell(p, CELL) < RING_R, `lv${n} ${key} (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
  }
});
test('view: the owner is an apron roster that fidgets, standing by the cart / shop door facing the head of the queue', () => {
  for (let n = 1; n <= 7; n++) {
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
// 物品 v2 §6：一級 3–5 s；◆ Lv7 6–10 s（含鏡頭平移與回全景的整段，show.elapsed）
const KEY = [7];
test('scripts: every boba level in both solutions plays 3–5 s (◆ Lv7 6–10 s whole), ends with LEVEL UP on boba, everyone home', async () => {
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
    // 物品 v2：颱風外送 +1（fx 的 delta）帶上去的那一級不是 grow 事件，不在這裡
    assert.ok([1, 2, 3, 6, 7].every(l => seen.includes(l)), `boba events seen: ${seen}`);
  }
});
// 正解裡被颱風外送帶上去的那一級（賽博 Lv4、外星 Lv5）自己演一次：照 order 演到上一級，改成 grow 事件單獨演
test('scripts: the levels the typhoon delivery skips (Lv4, Lv5) also play 3–5 s with their camera', async () => {
  for (const [order, to] of [[SOLUTIONS.find(o => o.indexOf('boba') < o.indexOf('rat')), 5], [SOLUTIONS.find(o => o.indexOf('boba') > o.indexOf('rat')), 4]]) {
    const h = await headlessShow();
    let s = engine.createState(spec), done = false;
    const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
    for (const step of steps) {
      const r = step(s);
      const i = r.events.findIndex(e => (e.kind === 'grow' && e.item === 'boba' && e.to === to) || (e.delta?.target === 'boba' && e.delta.to === to));
      if (i >= 0) {
        await h.run(r.events.slice(0, i), { instant: true });
        const r0 = h.rig.log.length, secs = await h.run([{ kind: 'grow', item: 'boba', from: to - 1, to }]);
        assert.ok(secs >= 3 && secs <= SCRIPT_MAX, `lv${to} took ${secs.toFixed(2)} s`);
        if (to === 5) {
          const f = SATELLITES.find(x => x.kind === 'forest'), c = axialToWorld(f.q, f.r), trail = focusTrail(h.rig.log, r0).map(String);
          assert.deepEqual(trail.slice(-3), [String(worldToAxial(c.x, c.z)), String(CELL), 'home'], 'forest island, back to boba for LEVEL UP, then home');
          assert.equal(h.show.roster.members('sat.forest').length, 2); assert.ok(h.show.stage.partObject('sat.forestShop'));
        } else assert.ok(h.show.stage.partObject('boba.fountain'));
        done = true; break;
      }
      s = r.state; await h.run([...r.events, { kind: 'settle' }], { instant: true });
    }
    assert.ok(done, `lv${to} reached`);
  }
});
test('◆ Lv7 is the only key node; it puts 世界珍奶節 over 101 and ends on the overview before the LEVEL UP', () => {
  assert.deepEqual(Object.entries(boba.script.grow).filter(([, f]) => f.key).map(([n]) => +n), [7]);
  const ctx = { B, roster: { members: () => [] } }, flat = bs => bs.flatMap(b => (b.kind === 'together' ? flat(b.beats) : [b]));
  const beats = flat(boba.script.grow[7]({ kind: 'grow', item: 'boba', to: 7 }, { lv: lv({ boba: 7 }), flags: {} }, ctx));
  const label = beats.find(b => b.kind === 'levelUp' && b !== beats.at(-1)); assert.ok(label, '101 label');
  const homes = beats.map((b, i) => (b.kind === 'focus' && b.target === 'home' ? i : -1)).filter(i => i >= 0);
  assert.ok(homes.length && beats[homes.at(-1)].dur >= 1 && beats.at(-1).kind === 'levelUp', 'holds the overview, then LEVEL UP');
});
test('Lv7 live: the flags and the fleet appear, 101 reads 世界珍奶節, the camera ends on the overview', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show, bubblesLog } = h;
    const { n, r } = await liveAt(h, order, isBoba(7));
    assert.ok(bubblesLog.slice(n).some(b => b.text === '世界珍奶節'), '101 label');
    assert.ok(show.stage.partObject('boba.fleet') && boba.view(show.stage.lv, show.stage.flags)['boba.yard'].parts.some(p => p.flag));
    assert.equal(focusTrail(h.rig.log, r).at(-1), 'home');
  }
});
// ★ Lv6 live：小船從碼頭開到燈塔島（≤ 5 s），兩個觀光客坐在船上（每幀跟著船），跳上岸、住在島上；鏡頭先到燈塔島、LEVEL UP 回珍奶格；無人機起飛
test('Lv6 live: the ferry carries two tourists from the pier to the lighthouse island; they hop ashore and stay; the drones take off', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show } = h, update = show.update, frames = [];
    let live = false;
    const run = h.run; h.run = (evs, o) => { live = !o?.instant; return run(evs, o); };
    show.update = (dt, t) => {
      update(dt, t); if (!live) return;
      const b = show.stage.partObject('boba.ferry'), ts = show.roster.members('boba.tourists');
      frames.push({ boat: b && { x: b.position.x, z: b.position.z }, ts: ts.map(m => ({ ...m.pos })), drone: show.stage.partObject('boba.drones.0')?.children[0]?.position.y });
    };
    const { r } = await liveAt(h, order, isBoba(6));
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
    const trail = focusTrail(h.rig.log, r).map(String);
    assert.deepEqual(trail.slice(-3), [String(worldToAxial(LIGHT.x, LIGHT.z)), String(CELL), 'home'], `${what}: ${trail}`);
    const ys = frames.map(f => f.drone).filter(y => y != null); assert.ok(Math.max(...ys) - Math.min(...ys) > 0.3, `${what}: a drone takes off`);
  }
});
// 審查 I1／I3／M1：老闆照常速（1.6）從遠處推著攤車走來；每一幀攤車都在他面前 0.3–0.6；攤車在出發點閃白出現、停在 SHOP
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
  assert.ok(cart0 && blinks.some(q => near(q, cart0, 0.1)), 'the cart appears with a blink where it starts');
  const cart = show.stage.partObject('boba.main');
  assert.ok(near(cart.position, boba.SHOP, 1e-9) && cart.rotation.z === 0, 'cart parked');
  assert.ok(bubblesLog.slice(n).some(b => b.kind === '♪'));
  for (let i = 0; i < 300; i++) show.update(1 / 30, 100 + i / 30);
  assert.ok(near(show.roster.members('boba.owner')[0].pos, boba.ownerSpot(1), 0.1), 'owner by the cart');
});
test('Lv2: four tourists come from the pier and stand in the queue', async () => {
  const h = await headlessShow(), { show } = h, update = show.update, firsts = new Map();
  show.update = (dt, t) => { update(dt, t); for (const m of show.roster.members('boba.queue')) if (!firsts.has(m)) firsts.set(m, { ...m.pos }); };
  await liveAt(h, SOLUTIONS[0], isBoba(2));
  assert.equal(firsts.size, 4);
  for (const p of firsts.values()) assert.ok(boba.PIER.some(q => near(p, show.nav.nearestWalkable(q), 0.3)), 'spawned at the pier');
  for (let i = 0; i < 300; i++) show.update(1 / 30, 100 + i / 30);
  const spots = boba.view(show.stage.lv, show.stage.flags)['boba.queue'].home.spots;
  show.roster.members('boba.queue').forEach((m, i) => assert.ok(near(m.pos, spots[i], 0.1), `tourist ${i} in line`));
});
// 珍奶店：老闆在攤車旁揮鋤頭 → 店面閃白；人龍走到店門口、老闆走到店門旁，站定後每個人都在自己的站位上（不卡）
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
// 物品 v2：糖分超標在珍奶 Lv4（鮮奶 ≤2），旗標事件緊接在 grow 4 後面，島民的 ♥ 演在旗標事件（boba 的 fx 劇本）
test('Lv4 with milk ≤ 2 is the sugar rush: every islander ♥', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  let s = engine.createState(spec), e4 = null, rest = [];
  for (const id of ['boba', 'chip', 'rat', 'typhoon', 'token']) {
    const r = engine.place(s, id, spec); s = r.state;
    const i = r.events.findIndex(isBoba(4));
    if (i >= 0) { await run(r.events.slice(0, i), { instant: true }); e4 = r.events[i]; rest = r.events.slice(i + 1); break; }
    await run([...r.events, { kind: 'settle' }], { instant: true });
  }
  assert.ok(e4, 'boba reaches Lv4'); assert.equal(rest[0]?.flag?.name, 'bobaSugar', 'the sugar flag follows');
  const n = bubblesLog.length, secs = await run([e4, ...rest, { kind: 'settle' }]);
  const islanders = show.roster.members('landmarks.islanders').length, hearts = bubblesLog.slice(n).filter(b => b.kind === '♥').length;
  assert.ok(islanders > 0 && hearts >= islanders, `${hearts} ♥ for ${islanders} islanders`);
  assert.ok(secs <= 20, `${secs.toFixed(1)} s`);
  assert.equal(show.stage.flags.bobaSugar, true);
});
// 老鼠撞珍奶（§8.6）：攤車歪了、老闆 ！
test('a rat knocks the cart: it tilts and the owner ！ over his head', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h;
  const { n } = await liveAt(h, ['boba', 'rat', 'milk', 'chip', 'token'], e => e.kind === 'placed' && e.item === 'rat', { whole: true });
  const o = show.roster.members('boba.owner')[0];
  assert.ok(o, 'owner exists');
  assert.ok(Math.abs(show.stage.partObject('boba.main').rotation.z - 0.25) < 1e-9);
  const bang = bubblesLog.slice(n).filter(b => b.kind === '！');
  assert.ok(bang.some(b => Math.abs(b.at.y - (o.pos.y + o.headY)) < 0.05 && near(b.at, o.pos, 1.0)), 'owner ！');
});

// ── 碼頭入口（§13.2）：珍奶格靠海那側、走得到、離每個站位 ≥ 1.5（每一級；兩條正解每一刻的真 footprint）──
test('the pier entry is in the boba cell by the sea, walkable and ≥ 1.5 from every queue spot at every level', async () => {
  const c = axialToWorld(...CELL);
  assert.ok(!MAIN_CELLS.some(([q, r]) => q === CELL[0] + 1 && r === CELL[1]), 'east of the boba cell is sea');
  for (const p of boba.PIER) { assert.deepEqual(cellAt(p.x, p.z), CELL); assert.ok(p.x > c.x + 0.5, 'east half'); }
  const nav = createNav(), bad = [];
  for (let n = 1; n <= 7; n++) for (const b of [0, 2, 4, 9]) {
    const L = lv({ boba: n, bulb: b, milk: 4 }), v = boba.view(L, {});
    nav.setFootprints([...Object.values(v), ...Object.values(bulb.view(L, {}))].flatMap(p => [].concat(p.footprint || []).map(f => ({ ...f, x: p.at.x + (f.x ?? 0), z: p.at.z + (f.z ?? 0) }))));
    if (v['boba.queue']) assert.deepEqual(v['boba.queue'].home.entry, boba.PIER, `lv${n} queue entry`);
    bad.push(...entryProblems(v, nav, `lv${n} bulb${b}`));
  }
  bad.push(...await entriesThroughSolutions(boba, SOLUTIONS));
  assert.deepEqual(bad, []);
});
