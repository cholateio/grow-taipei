import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as bulb from '../src/actors/bulb.js';
import { anchorWorld, landmarkWorld } from '../src/actors/anchors.js';
import { cellAt, cellTop, NEIGHBORS } from '../src/scene/hex.js';
import { TIMES } from '../src/scene/daynight.js';
import { B } from '../src/show/beats.js';
import { createNav } from '../src/show/nav.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { headlessShow, playItem, entriesThroughSolutions, solo, SCRIPT_MAX, SCRIPT_EXCEPT, KEY_MAX } from './helpers/show.js';
import { lv, worldPoints, entryProblems, focusCell, focusTrail, rosterSpots } from './helpers/actors.js';
import * as sat from '../src/actors/satellites.js';
import * as chip from '../src/actors/chip.js';
import * as tower from '../src/actors/tower.js';
import { diffParts } from '../src/actors/stage.js';
import { C } from '../src/actors/palette.js';
import { MAIN_CELLS, adjacentPairs, SATELLITES, axialToWorld, R } from '../src/scene/hex.js';
import { satelliteAt } from '../src/show/nav.js';
import { trainPose, TRACK } from '../src/actors/token.js';
import { STATION_A, TRAIN_MAX_BOOST } from '../src/show/beats.js';
import { existsSync } from 'node:fs';
const heads = s => s.parts.filter(p => p.kind === 'sphere');

test('bulb lv1 is one street lamp', () => {
  const v = bulb.view(lv({ bulb: 1 }), {}); assert.deepEqual(Object.keys(v), ['bulb.main', 'bulb.electrician']); assert.equal(heads(v['bulb.main']).length, 1);
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
// 2026-10-28 錄影修正（珍奶格太擠）：夜市 Lv2–3 一攤、Lv4 起兩攤（第二攤在東邊），不再有四攤；footprint 只有攤身。
// 攤身離捷運站站體（每一級、淹水）≥ 0.3；兩攤南緣離珍奶攤車／店北緣 ≥ 0.4；Lv4 的霓虹招牌照舊、Lv9 霓虹條一攤一條
test('lv4 opens a second night-market stall beside the first with a neon sign; lv2–3 one stall; clear of the station and the boba shop', async () => {
  const token = await import('../src/actors/token.js'), boba = await import('../src/actors/boba.js');
  const market = n => bulb.view(lv({ bulb: n }), {})['bulb.market'], stalls = n => market(n).parts.filter(p => p.kind === 'hip').length;
  assert.equal(stalls(2), 1); assert.equal(stalls(3), 1); for (let n = 4; n <= 9; n++) assert.equal(stalls(n), 2, `lv${n}`);
  assert.ok(market(4).parts.some(p => p.glow === 0xff3fa0 && p.kind === 'box'), 'neon sign board at Lv4');
  assert.deepEqual(market(4).footprint, [{ x: 0, z: 0, w: 0.5, d: 0.4 }, { x: 0.5, z: 0.15, w: 0.5, d: 0.4 }], 'stall bodies only');
  assert.equal(bulb.view(lv({ bulb: 9, token: 9 }), {})['bulb.neon.market'].parts.length, 2, 'one neon strip per stall');
  const M = market(4).at, box = (f, at) => ({ x0: at.x + (f.x ?? 0) - (f.r ?? f.w / 2), x1: at.x + (f.x ?? 0) + (f.r ?? f.w / 2), z0: at.z + (f.z ?? 0) - (f.r ?? f.d / 2), z1: at.z + (f.z ?? 0) + (f.r ?? f.d / 2) });
  const gap = (a, b) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.z0 - b.z1, b.z0 - a.z1));
  const bodies = market(4).footprint.map(f => box(f, M));
  for (let t = 1; t <= 10; t++) for (const flags of [{}, { flooded: true }]) {
    const st = token.view(lv({ token: t }), flags)['token.main'], s = box(st.footprint, st.at);
    for (const b of bodies) assert.ok(gap(b, s) >= 0.3 - 1e-9, `token ${t} ${JSON.stringify(flags)}: stall ${gap(b, s).toFixed(3)} from the station`);
  }
  for (let n = 1; n <= 7; n++) {
    const main = boba.view(lv({ boba: n }), {})['boba.main'], north = main.at.z - main.footprint.d / 2;
    for (const b of bodies) assert.ok(north - b.z1 >= 0.4, `boba ${n}: shop ${(north - b.z1).toFixed(2)} south of the market`);
  }
});

const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);   // 唯一正解（賽博），從求解器取
const near = (a, b, d = 1e-9) => Math.hypot(a.x - b.x, a.z - b.z) < d;

test('view: posts are one part, heads are one part per lighting stop in road order, the electrician is a vest roster patrolling ROAD', () => {
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
  for (const n of [1, 2, 5]) {
    const el = bulb.view(lv({ bulb: n }), {})['bulb.electrician'];
    assert.deepEqual([el.kind, el.n, el.accessory], ['roster', 1, 'vest']); assert.deepEqual(el.home, { kind: 'path', path: bulb.ROAD, loop: true, speed: 0.5, entry: bulb.ELECTRICIAN_ENTRY });
  }
  assert.ok(bulb.script?.placed && [2, 3, 4, 5, 6, 7, 8, 9].every(n => bulb.script.grow[n]) && bulb.script.fx() === null);
});
test('lampApproach is walkable, 0.45 in from each lamp toward its cell centre', () => {
  const nav = createNav();
  bulb.LAMP_POINTS.forEach((p, i) => {
    const a = bulb.lampApproach(i); assert.ok(nav.walkable(a.x, a.z), `lamp ${i}`);
    assert.ok(Math.abs(Math.hypot(a.x - p.x, a.z - p.z) - 0.45) < 1e-9); assert.deepEqual(cellAt(a.x, a.z), cellAt(p.x, p.z));
  });
});
test('ROAD is a closed ring road over the five low cells: segments stay in a cell or cross a bridge, and it passes the junctions in key order', () => {
  const R = bulb.ROAD, adj = (a, b) => NEIGHBORS.some(([dq, dr]) => a[0] + dq === b[0] && a[1] + dr === b[1]);
  R.forEach((p, i) => {
    const q = R[(i + 1) % R.length], a = cellAt(p.x, p.z), b = cellAt(q.x, q.z);
    assert.ok(a && b, `ROAD ${i} on land`); assert.equal(p.y, cellTop(a));
    if (String(a) !== String(b)) { assert.ok(adj(a, b), `ROAD ${i} → next`); assert.ok(Math.hypot(q.x - p.x, q.z - p.z) < 1, 'bridge'); }
  });
  assert.deepEqual([...new Set(R.map(p => String(cellAt(p.x, p.z))))].sort(), ['-1,0', '-1,1', '0,0', '0,1', '1,0']);
  // 每個路口：燈都在電工站的那盞 1.2 內；電工站的燈最近的路點（1 單位內）沿路的順序就是路口的順序
  const nearest = l => { let k = -1, d = Infinity; R.forEach((p, i) => { const e = Math.hypot(p.x - l.x, p.z - l.z); if (e < d) { d = e; k = i; } }); assert.ok(d < 1); return k; };
  assert.deepEqual(bulb.LAMP_STOPS.flat(), Array.from({ length: 15 }, (_, i) => i));
  for (const g of bulb.LAMP_STOPS) for (const i of g) assert.ok(near(bulb.LAMP_POINTS[i], bulb.LAMP_POINTS[g[0]], 1.2), `lamp ${i} at its junction`);
  const idx = bulb.LAMP_STOPS.map(g => nearest(bulb.LAMP_POINTS[g[0]]));
  assert.ok(idx.every((k, i) => !i || k > idx[i - 1]), `road order ${idx}`);
});

// 假 ctx：只拿劇本回的拍來看（不演）
const fakeCtx = (el = null) => ({ B, roster: { members: k => (k === 'bulb.electrician' && el ? [el] : []), nearest: () => null }, stage: {} });
const flat = beats => beats.flatMap(b => (b.kind === 'together' ? flat(b.beats) : [b]));
const onlys = beats => flat(beats).filter(b => b.kind === 'apply' && b.only).flatMap(b => b.only);
const E = to => ({ kind: 'grow', item: 'bulb', to });
// only 可能是 ctx => 鍵（演到才算）：用假 ctx 解開
const applies = (beats, ctx) => flat(beats).filter(b => b.kind === 'apply' && b.only).map(b => (typeof b.only === 'function' ? b.only(ctx) : b.only));
// 物品 v2：燈塔改到燈泡 Lv7（離岸風電啟動）才亮；Lv2 走過去點最近的三站，其餘六站回全景後一站站亮，夜市跟最後一站一起開
const stopOrder = from => Array.from({ length: N_STOPS }, (_, i) => [...(i ? [] : ['bulb.posts']), `bulb.lamps.${(i + from) % N_STOPS}`, ...(i === N_STOPS - 1 ? ['bulb.market'] : [])]);
test('grow 2 lights the stops one by one along the road (posts with the first; the market with the last)', () => {
  const s = { lv: lv({ bulb: 2 }), flags: {} };
  const c0 = fakeCtx(); assert.deepEqual(applies(bulb.script.grow[2](E(2), s, c0), c0), stopOrder(0));
  // 電工在半路上：從他最近的那站開始，沿路繞一圈（順序照樣沿路）；第 9 盞是第 5 站
  const p = bulb.lampApproach(9), c9 = fakeCtx({ pos: p, head: () => p }), got = applies(bulb.script.grow[2](E(2), s, c9), c9);
  assert.ok(bulb.LAMP_STOPS[5].includes(9)); assert.deepEqual(got, stopOrder(5));
  // 直接找 walk 的速度：快走 2.8（節奏驗收的裁定），不衝刺
  assert.equal(bulb.WALKED, 3); assert.equal(flat(bulb.script.grow[2](E(2), s, fakeCtx())).filter(b => b.kind === 'walk').length, bulb.WALKED);
  assert.equal(bulb.LIGHTING_SPEED, 2.8);
});
// 計畫 9 任務 4（任務 3 延後的小項）：Lv4 去夜市排隊的兩個人照走路的路長挑；走不到的人（route 只回起點，路長 0）不算，不會排第一
test('nearestPair: the two shortest walks to the market; somebody who cannot get there (route stops at the start) is skipped, not ranked first', () => {
  const end = { x: 0, y: 0, z: 0 }, m = (x, stuck = false) => ({ pos: { x, y: 0, z: 0 }, hidden: false, mode: 'home', stuck });
  const people = [m(0.5, true), m(3), m(1), m(2)];
  const nav = { nearestWalkable: () => end, route: (from) => (people.find(p => p.pos === from).stuck ? [from] : [from, end]), routeLength: path => (path.length < 2 ? 0 : Math.abs(path[0].x)) };
  const pair = bulb.nearestPair()({ nav, roster: { members: k => (k === 'landmarks.islanders' ? people : []) } });
  assert.deepEqual(pair.map(p => p.pos.x), [1, 2]);
});
test('world beats: Lv3 fades to dusk, Lv5 to night', () => {
  const worlds = n => bulb.script.grow[n](E(n), { lv: lv({ bulb: n }), flags: {} }, fakeCtx()).filter(b => b.kind === 'world').map(b => b.effects);
  assert.deepEqual(worlds(3), [{ time: TIMES.dusk }]); assert.deepEqual(worlds(5), [{ time: TIMES.night }]);
});

// 照 order 把整局（放置 + 倒數三回合）瞬間演到 pred 命中的那個事件，那個事件單獨 live 演；回傳 { e, secs, n }（n = 演之前的泡泡數）
async function liveAt({ run, bubblesLog }, order, pred) {
  let s = engine.createState(spec);
  const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  for (const step of steps) {
    const r = step(s); s = r.state;
    for (const e of r.events) {
      if (pred(e)) { const n = bubblesLog.length; return { e, secs: await run([solo(e)]), n }; }
      await run([e], { instant: true });
    }
    await run([{ kind: 'settle' }], { instant: true });
  }
  throw new Error('event not found');
}
const isBulb = to => e => e.kind === 'grow' && e.item === 'bulb' && e.to === to;
// 物品 v2 §6：一級 3–5 s；Lv2 點最近三站＋其餘一站站亮 ≤ 8 s（裁決）；
// ◆ Lv7（離岸風電）、Lv9（全島霓虹）6–10 s——含鏡頭平移與回全景的整段（show.elapsed，裁決 R8）
const KEY = [7, 9], BUDGET = to => (to === 2 ? [3, SCRIPT_EXCEPT['bulb 2']] : KEY.includes(to) ? [3, KEY_MAX] : [3, SCRIPT_MAX]);
const WINDMILL_I = SATELLITES.findIndex(x => x.kind === 'windmill');
const onWindmill = p => !cellAt(p.x, p.z) && satelliteAt(p) === WINDMILL_I;
function checkBulb({ show, bubblesLog }, e, secs, n, timing) {
  const what = `${e.kind} ${e.to ?? ''}`, to = e.kind === 'grow' ? e.to : 1, [lo, hi] = BUDGET(to);
  (timing[to] ??= []).push(+secs.toFixed(1));
  assert.ok(secs >= lo && secs <= hi, `${what} took ${secs.toFixed(1)}s`);
  if (KEY.includes(to)) assert.ok(show.elapsed >= 6 && show.elapsed <= KEY_MAX, `◆ ${what} whole event ${show.elapsed.toFixed(2)}s`);
  if (e.kind === 'grow') {
    const last = bubblesLog.slice(n).at(-1), h = show.stage.headOf('bulb');
    assert.equal(last?.text, 'LEVEL UP', what); assert.ok(Math.hypot(last.at.x - h.x, last.at.y - h.y, last.at.z - h.z) < 0.3, `${what} LEVEL UP over bulb`);
  }
  const els = show.roster.members('bulb.electrician'); assert.equal(els.length, 1, what);
  assert.equal(els[0].mode, 'home', `${what} electrician home`);
  // Lv7 起電工住在風車島上（搭列車過去的，不瞬移）；之前在主島巡路
  assert.equal(onWindmill(els[0].pos), to >= 7, `${what} electrician on the windmill island: ${JSON.stringify(els[0].pos)}`);
  for (const m of show.roster.members('landmarks.islanders')) assert.equal(m.mode, 'home', `${what} islanders`);
}
test('scripts: every bulb level in the solution plays within its budget (3–5 s; Lv2 ≤ 8; ◆ Lv7/Lv9 6–10 s whole), ends with LEVEL UP on bulb, and leaves everyone at home', async () => {
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
test('grow 2 live: the stops light up one at a time in road order (cyclic from where the electrician starts)', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show } = h, update = show.update, first = [];
    show.update = (dt, t) => {
      update(dt, t);
      for (let i = 0; i < N_STOPS; i++) if (!first.includes(i) && show.stage.partObject(`bulb.lamps.${i}`)?.visible) first.push(i);
    };
    await liveAt(h, order, isBulb(2));
    assert.equal(first.length, N_STOPS);
    assert.ok(first.every((k, i) => !i || k === (first[i - 1] + 1) % N_STOPS), `stop order ${first}`);
  }
});
// 排隊的那一刻（兩個 ♥ 冒出來時）兩人都在夜市旁；演完回日常後會走開（回合最後回全景那 1 秒也在走）
test('Lv4: the two nearest people (islanders or the station staff) queue at the market', async () => {
  const h = await headlessShow(), m = landmarkWorld('market');
  const { e, n } = await liveAt(h, SOLUTIONS[0], isBulb(4));
  assert.equal(e.to, 4);
  const hearts = h.bubblesLog.slice(n).filter(b => b.kind === '♥');
  assert.equal(hearts.length, 2);
  assert.ok(hearts.every(b => Math.hypot(b.at.x - m.x, b.at.z - m.z) < 1.6), `islanders by the market: ${hearts.map(b => Math.hypot(b.at.x - m.x, b.at.z - m.z).toFixed(2))}`);
});
// 自動 footprint 是包圍盒 ×0.9（斜放的零件會鼓出去），所以每個 footprint 先內縮 0.25（一個小人的寬）再比
test('ROAD clears the core of every footprint at the end of the solution', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(); let s = engine.createState(spec);
    for (const id of order) { const r = engine.place(s, id, spec); s = r.state; await h.run([...r.events, { kind: 'settle' }], { instant: true }); }
    const fps = h.show.stage.footprints(), R = bulb.ROAD;
    const S = 0.25, inside = (f, x, z) => (f.r != null ? Math.hypot(x - f.x, z - f.z) <= f.r - S : Math.abs(x - f.x) <= f.w / 2 - S && Math.abs(z - f.z) <= f.d / 2 - S);
    R.forEach((p, i) => {
      const q = R[(i + 1) % R.length], L = Math.hypot(q.x - p.x, q.z - p.z);
      for (let t = 0; t <= L; t += 0.05) {
        const x = p.x + (q.x - p.x) * t / L, z = p.z + (q.z - p.z) * t / L;
        for (const f of fps) assert.ok(!inside(f, x, z), `ROAD ${i} hits footprint at (${f.x.toFixed(2)}, ${f.z.toFixed(2)})`);
      }
    });
  }
});

// 審查：起點那一站要用「劇本第一拍開演那一刻」電工的位置挑（計畫 3.8 Task 5 起第一拍是對準第一站那格的 focus，緊接著就是第一段走路），
// 不是建拍時（同回合前面的劇本演的時候他還在巡路）
// stub：關掉名冊焦點（電工照常巡路），並在建拍之後把他放到離建拍時最遠的那一站旁邊（計畫 6：拜訪完的人用走路速度回家〔roster.home hurry〕，
// 不再在別格站著等，「建拍之後他剛好走開很遠」不能再靠巧合）——驗第一站跟著開走那一刻的位置；不關時只驗第一站是開走那一刻離他最近的
async function firstStopRun({ stub }) {
  const h = await headlessShow(), { show, run } = h, order = SOLUTIONS[0];
  let st = engine.createState(spec), evs = null;
  for (const id of order) {
    const r = engine.place(st, id, spec); st = r.state;
    if (r.events.some(isBulb(2))) { evs = r.events; break; }
    await run([...r.events, { kind: 'settle' }], { instant: true });
  }
  // 整回合 live 演（珍奶放置、鮮奶、晶片的劇本都在燈泡前面），電工在那段時間照常巡路
  // （stub：名冊焦點關掉——§13.4 焦點格外的人會站著，這裡要的是「他在別的劇本演的時候走開了」）
  if (stub) show.roster.setFocus = () => {};
  // 選擇帶動升級：燈泡放下當回合就 Lv2——建拍時電工還沒來（放置劇本才把他叫出來），atBuild 改記「放置劇本演完、下一個事件開演」那一刻
  let atBuild = null, atWalk = null, afterPlaced = false;
  const scripted = bulb.script.grow[2];
  bulb.script.grow[2] = (e, s2, ctx) => {
    const el = ctx.roster.members('bulb.electrician')[0];
    if (el) atBuild = { ...el.pos };
    const beats = scripted(e, s2, ctx), w = beats[0], start = w.start;
    w.start = c => { atWalk = { ...c.roster.members('bulb.electrician')[0].pos }; return start(c); };
    return beats;
  };
  try {
    const update = show.update, first = [];
    show.update = (dt, t) => { update(dt, t); for (let i = 0; i < N_STOPS; i++) if (!first.includes(i) && show.stage.partObject(`bulb.lamps.${i}`)?.visible) first.push(i); };
    assert.ok(evs.indexOf(evs.find(isBulb(2))) > 0, 'bulb grows after other events in the turn');
    const far = p => bulb.LAMP_STOPS.reduce((b, gg, k) => (Math.hypot(bulb.lampApproach(gg[0]).x - p.x, bulb.lampApproach(gg[0]).z - p.z) > Math.hypot(bulb.lampApproach(bulb.LAMP_STOPS[b][0]).x - p.x, bulb.lampApproach(bulb.LAMP_STOPS[b][0]).z - p.z) ? k : b), 0);
    const onMark = e => {
      if (afterPlaced && !atBuild) {
        const el = show.roster.members('bulb.electrician')[0];
        atBuild = { ...el.pos };
        if (stub) { const p = bulb.lampApproach(bulb.LAMP_STOPS[far(atBuild)][0]); show.roster.setPose(el, { ...p, yaw: el.yaw, walking: false }); }   // 他在別的劇本演的時候走開了
      }
      afterPlaced = e.kind === 'placed' && e.item === 'bulb';
    };
    await run([...evs, { kind: 'settle' }], { onMark });
    assert.ok(atBuild && atWalk, 'electrician seen before and at the walk');
    const nearest = p => bulb.LAMP_STOPS.reduce((b, gg, k) => (Math.hypot(bulb.lampApproach(gg[0]).x - p.x, bulb.lampApproach(gg[0]).z - p.z) < Math.hypot(bulb.lampApproach(bulb.LAMP_STOPS[b][0]).x - p.x, bulb.lampApproach(bulb.LAMP_STOPS[b][0]).z - p.z) ? k : b), 0);
    if (stub) assert.ok(Math.hypot(atWalk.x - atBuild.x, atWalk.z - atBuild.z) > 1 && nearest(atWalk) !== nearest(atBuild), `electrician moved during the wait (nearest stop ${nearest(atBuild)} → ${nearest(atWalk)})`);
    assert.equal(first[0], nearest(atWalk), `first stop ${first[0]} vs nearest at walk ${nearest(atWalk)} / at build ${nearest(atBuild)}`);
  } finally { bulb.script.grow[2] = scripted; }
}
test('grow 2 picks its first stop from where the electrician is when the walk starts, not when the turn is built', () => firstStopRun({ stub: true }));
test('grow 2 with the roster focus on: the first stop is the nearest to the electrician when the walk starts', () => firstStopRun({ stub: false }));
test('Lv4 never picks hidden islanders', () => {
  const vis = { pos: { x: 9, z: 9 }, mode: 'home', head: () => ({ x: 9, y: 0, z: 9 }) }, m = landmarkWorld('market');
  const hid = { pos: { ...m }, hidden: true, mode: 'home', head: () => m }, vis2 = { pos: { x: 8, z: 8 }, mode: 'home', head: () => ({ x: 8, y: 0, z: 8 }) };
  const ctx = { B, roster: { members: k => (k === 'landmarks.islanders' ? [hid, vis, vis2] : []) }, nav: { slots: () => [m, m] } };
  const beats = flat(bulb.script.grow[4](E(4), { lv: lv({ bulb: 4 }), flags: {} }, ctx)).filter(b => b.kind === 'walk');
  const who = [];
  const fakeCtx2 = { ...ctx, roster: { ...ctx.roster, claim: x => who.push(x) }, nav: { route: (a, b) => [a, b], routeLength: () => 0, nearestWalkable: p => p, slots: () => [m, m] } };
  for (const b of beats) b.start(fakeCtx2);
  assert.ok(!who.includes(hid), 'hidden islander picked'); assert.equal(who.length, 2);
});

// 入口點（§13.2、計畫 3.8 Task 5）：電工從 101 工地來；入口走得到、離他巡路的起點 ≥ 1.5（每一級；唯一正解每一刻的真 footprint）
// Lv7 起電工住在風車島上（衛星島的家沒有入口，同 sat.keeper）
test('bulb.electrician enters from the 101 site, walkable and ≥ 1.5 from his spot at every level (Lv7+ he lives on the windmill island: no entry)', async () => {
  const nav = createNav(), bad = [], t = anchorWorld('tower');
  for (let n = 1; n <= 9; n++) {
    const v = bulb.view(lv({ bulb: n, token: n >= 7 ? 9 : 3 }), {}), e = v['bulb.electrician'].home.entry;
    if (n >= 7) assert.ok(e === undefined && rosterSpots(v['bulb.electrician']).every(p => !cellAt(p.x, p.z)), `lv${n} lives off the main island, no entry`);
    else assert.ok(e === bulb.ELECTRICIAN_ENTRY && Math.hypot(e.x - t.x, e.z - t.z) < 1.5 && String(cellAt(e.x, e.z)) === '0,0', `lv${n} entry is the 101 site`);
    bad.push(...entryProblems(v, nav, `lv${n}`));
  }
  bad.push(...await entriesThroughSolutions(bulb, SOLUTIONS));
  assert.deepEqual(bad, []);
});

// 鏡頭（§13.1、計畫 3.8 Task 5）
test('grow 2: the first beat focuses the first stop\'s cell; each walk into another cell pans with it; then the overview for the other stops and LEVEL UP', () => {
  const s2 = { lv: lv({ bulb: 2 }), flags: {} }, p = bulb.lampApproach(9), ctx = fakeCtx({ pos: p, head: () => p });
  const beats = bulb.script.grow[2](E(2), s2, ctx);
  assert.equal(beats[0].kind, 'focus'); assert.deepEqual(focusCell(beats[0], ctx), bulb.stopCell(5), 'first stop is stop 5');
  // 第 i 段走路（走向第 5+i 站）一起的 focus：換格才有目標，同一格回 null（跳過）
  const pans = beats.filter(b => b.kind === 'together' && b.beats.some(x => x.kind === 'walk')).map(b => focusCell(b.beats.find(x => x.kind === 'focus'), ctx));
  const cells = Array.from({ length: bulb.WALKED }, (_, i) => bulb.stopCell((5 + i) % N_STOPS));
  assert.deepEqual(pans, cells.slice(1).map((c, i) => (String(c) === String(cells[i]) ? null : c)));
  const home = beats.findIndex(b => b.kind === 'focus' && b.target === 'home'), rest = beats.slice(home + 1);
  assert.ok(home > 0 && rest.filter(b => b.kind === 'apply').length === N_STOPS - bulb.WALKED, 'the other six stops flash after the overview');
  assert.equal(beats.at(-1).kind, 'levelUp');
});
test('grow 2 live: each pan reaches a cell as the electrician walks into it; the camera then goes home for the rest', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show, rig } = h, update = show.update, frames = [];
    let t = 0;
    show.update = (dt, tt) => { update(dt, tt); t += dt; const m = show.roster.members('bulb.electrician')[0]; frames.push([t, m && cellAt(m.pos.x, m.pos.z), rig.log.length]); };
    let n0 = 0; await liveAt({ ...h, run: (evs, opts) => { if (!opts?.instant) { n0 = rig.log.length; frames.length = 0; t = 0; } return h.run(evs, opts); } }, order, isBulb(2));
    const trail = focusTrail(rig.log, n0), pans = trail.slice(0, -2);
    assert.deepEqual(trail.slice(-2), ['home', 'home']); assert.ok(pans.length >= 1 && pans.length <= bulb.WALKED, JSON.stringify(trail));
    pans.forEach((c, i) => {
      if (i) assert.notDeepEqual(c, pans[i - 1], 'no re-pan to the same cell');
      // 鏡頭飛 1 秒：第一拍那次之後，每次到的時候（呼叫 + 1 s）他前後 0.5 s 內剛走進那一格
      const at = frames.find(f => f[2] > n0 + i)[0], enter = frames.find(([ft, fc]) => ft >= at - 0.05 && String(fc) === String(c))?.[0];
      assert.ok(enter != null && enter <= at + 2, `pan ${i} to ${c} at ${at.toFixed(2)}: electrician not there`);
      if (i) assert.ok(Math.abs(at + 1 - enter) <= 0.5, `pan ${i} to ${c}: camera arrives ${(at + 1).toFixed(2)}, he walks in ${enter.toFixed(2)}`);
    });
  }
});
// 物品 v2 §6：Lv3 電工就近在最近的那一站路燈下點霓虹（鏡頭對那一站的格子）；Lv4 島民去夜市排隊（鏡頭對夜市格）
test('grow 3 focuses the electrician\'s nearest stop cell, grow 4 the night-market cell; LEVEL UP pans back to the centre cell', async () => {
  const market = landmarkWorld('market'), mc = [...cellAt(market.x, market.z)], p = bulb.lampApproach(9);
  for (const n of [3, 4]) {
    const ctx = fakeCtx({ pos: p, head: () => p }), beats = bulb.script.grow[n](E(n), { lv: lv({ bulb: n }), flags: {} }, ctx), want = n === 3 ? bulb.stopCell(5) : mc;
    assert.equal(beats[0].kind, 'focus'); assert.deepEqual(focusCell(beats[0], ctx), want, `lv${n}`);
    assert.deepEqual(focusCell(beats.at(-1).beats.find(b => b.kind === 'focus'), ctx), String(want) === '0,0' ? null : [0, 0]);
    for (const order of SOLUTIONS) {
      const h = await headlessShow(); let n0 = 0;
      await liveAt({ ...h, run: (evs, opts) => { if (!opts?.instant) n0 = h.rig.log.length; return h.run(evs, opts); } }, order, isBulb(n));
      const trail = focusTrail(h.rig.log, n0);
      assert.deepEqual(trail.slice(-2), [[0, 0], 'home'], `lv${n} ${order.join('>')} ${JSON.stringify(trail)}`);
      if (n === 4) assert.deepEqual(trail, [mc, [0, 0], 'home']); else assert.ok(trail.length <= 3, JSON.stringify(trail));
    }
  }
});

// ════ 物品 v2：燈泡 9 級（§4.4）、離島鏈（§5）════
// 照正解走到燈泡 n 級時的其他物品（Lv5 棒球 ≥4、Lv7 代幣 ≥7、Lv8 晶片 5、Lv9 代幣 9）
const atLv = n => lv({ bulb: n, token: n >= 9 ? 9 : n >= 7 ? 7 : 3, chip: n >= 8 ? 5 : 2, baseball: n >= 5 ? 4 : 1 });
const pick = (v, keys) => Object.fromEntries(Object.entries(v).filter(([k]) => keys.includes(k)));
// 燈泡看得見的東西：自己的零件＋風車與燈塔（衛星島）、海底電纜（晶片的零件）、101 燈光秀
const whole = L => ({ ...bulb.view(L, {}), ...pick(sat.view(L, {}), ['sat.windmill', 'sat.lighthouse', 'sat.beam']), ...pick(chip.view(L, {}), ['chip.cable']), ...pick(tower.view(L, {}, { total: 20 }), ['tower.show']) });
const nonRoster = v => Object.fromEntries(Object.entries(v).filter(([, p]) => p.kind !== 'roster'));
const V = Array.from({ length: 10 }, (_, n) => whole(atLv(n)));
const NEON = ['bulb.neon.station', 'bulb.neon.bridges', 'bulb.neon.market'];

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
// Lv9 全島霓虹：橋面（主島每一座橋＋上台地的階梯）、懸浮月台、夜市與車站的招牌；每個零件都發光
test('Lv9 neon: every main-island bridge gets glowing deck strips; the floating platform and the market get strips and a cyberpunk sign', () => {
  const v = bulb.view(atLv(9), {}), br = v['bulb.neon.bridges'], pairs = adjacentPairs(MAIN_CELLS);
  assert.equal(pairs.length, 12);
  assert.ok(br.parts.length >= pairs.length * 2 && br.parts.every(p => p.glow), `${br.parts.length} bridge strips, all glowing`);
  for (const [A, Bc] of pairs) {   // 每座橋中點附近都有燈條
    const a = axialToWorld(...A), b = axialToWorld(...Bc), m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    assert.ok(worldPoints(br).some(p => Math.hypot(p.x - m.x, p.z - m.z) < 0.3), `bridge ${A}–${Bc}`);
  }
  for (const k of ['bulb.neon.station', 'bulb.neon.market']) {
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
  return Object.values(v).reduce((t, p) => t + (p.kind === 'compound' ? compound(p.parts) : p.kind === 'neon' ? compound(p.parts) + (p.models ?? []).reduce((a, m) => a + glb(m), 0) : 0), 0);
}
test('bulb draw calls ≤ 24 at every level (blackout included)', () => {
  for (let n = 1; n <= 9; n++) for (const flags of [{}, { blackout: true }]) {
    const d = drawCalls(bulb.view(atLv(n), flags)); assert.ok(d <= 24, `lv${n} ${JSON.stringify(flags)}: ${d}`);
  }
});
// ── 不出格（§14.1）：每個 footprint 的角都在它那一格裡 ──
test('every bulb footprint corner stays inside its cell', () => {
  for (let n = 1; n <= 9; n++) for (const [key, s] of Object.entries(bulb.view(atLv(n), {}))) for (const f of [].concat(s.footprint || [])) {
    const cell = cellAt(s.at.x, s.at.z), cx = s.at.x + (f.x ?? 0), cz = s.at.z + (f.z ?? 0), [hx, hz] = f.r != null ? [f.r, f.r] : [f.w / 2, f.d / 2];
    for (const [dx, dz] of [[hx, hz], [hx, -hz], [-hx, hz], [-hx, -hz]]) assert.deepEqual(cellAt(cx + dx, cz + dz), cell, `lv${n} ${key} corner (${(cx + dx).toFixed(2)}, ${(cz + dz).toFixed(2)})`);
  }
});
test('the substation keeps the road and the 101 foot walkable and leaves a lane to the 101', () => {
  const v = bulb.view(atLv(6), {}), nav = createNav();
  nav.setFootprints([...Object.values(v), ...Object.values(tower.view(atLv(6), {}, { total: 20 }))].flatMap(p => [].concat(p.footprint || []).map(f => ({ ...f, x: p.at.x + (f.x ?? 0), z: p.at.z + (f.z ?? 0) }))));
  const s = v['bulb.substation'], front = bulb.SUBSTATION_FRONT;
  assert.ok(nav.walkable(front.x, front.z), 'the electrician can stand in front');
  assert.ok(nav.route(front, { x: s.at.x, y: s.at.y, z: s.at.z - 0.8 }).length > 1, 'a way round behind it');
});

// ── 電工的家：Lv1–6 沿主路巡；Lv7 起住在風車島（風機腳下的小圈，衛星島的 wander）──
test('the electrician patrols ROAD through Lv6 and lives on the windmill island from Lv7, ringing clear of the tower, the switch box and the house', () => {
  for (let n = 1; n <= 6; n++) assert.equal(bulb.view(atLv(n), {})['bulb.electrician'].home.kind, 'path');
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
// 照 order 把整局瞬間演到 pred 命中的事件，那個事件單獨 live 演；每幀呼叫 onFrame(show)
async function liveFrames(order, pred, onFrame) {
  const h = await headlessShow(), update = h.show.update;
  let on = false, r0 = 0;
  h.show.update = (dt, t) => { update(dt, t); if (on) onFrame(h, dt); };
  const r = await liveAt({ ...h, run: (evs, opts) => { on = !opts?.instant; if (on) r0 = h.rig.log.length; return h.run(evs, opts); } }, order, pred);
  return { ...h, ...r, r0 };
}
// ★◆ Lv7 離岸風電啟動：電工走到站前 → 坐上列車（車頂）→ 列車開進風車島的支線 → 跳下來按開關（build）→ 風車才開始轉 → 燈塔才亮 → 回全景、LEVEL UP。
// 全程不瞬移（每幀位移 ≤ 0.6：環上趕路最快 4.5 倍約 0.45／幀）；最後住在風車島上
test('Lv7 live: the electrician walks to the station, rides the train out to the windmill island, flips the switch; only then the blades turn and the lighthouse lights', async () => {
  for (const order of SOLUTIONS) {
    let prev = null, maxWalk = 0, maxRide = 0, at = 0, rode = 0, station = false, firstBuild = null, firstSpin = null, firstLight = null, rot = null, blades = null;
    const what = order.join('>');
    const { show, secs } = await liveFrames(order, isBulb(7), (h, dt) => {
      at += dt;
      const [m] = h.show.roster.members('bulb.electrician'); if (!m) return;
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
      // 唯一正解：燈泡 7 在第 8 回合，颱風 Lv1–3 的風本來就吹著風車轉（沒電 3、通電 6，±0.4 的搖晃）——看轉速變成通電的轉速
      const stormy = h.show.stage.lv.typhoon >= 1 && h.show.stage.lv.typhoon <= 3, fast = stormy ? 4.5 : 0;
      if (z !== null && rot !== null && Math.abs(z - rot) / dt > fast + 1e-6 && firstSpin === null) firstSpin = at;
      rot = z;
      if (firstLight === null && h.show.stage.partObject('sat.lighthouse')?.visible) firstLight = at;
    });
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
  const beats = bulb.script.grow[7](E(7), { lv: atLv(7), flags: {} }, ctx), board = beats[0].beats.find(b => b.kind === 'board');
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
// 裁決 R18：?quality=low 不畫霓虹燈條（橋面、月台、夜市屋簷），招牌 glb 留著
test('quality low: neon parts drop their strips and keep only the sign models', async () => {
  const THREE = await import('../vendor/three/three.module.js'), { createPartFactory } = await import('../src/actors/parts.js'), { createGlowRegistry } = await import('../src/scene/glow.js');
  const spawned = [], f = q => createPartFactory(THREE, { glow: createGlowRegistry(), builders: bulb.builders, quality: q, assets: { spawn: async (p, o) => { spawned.push(p); const g = new THREE.Group(); o?.parent?.add(g); return g; } } });
  const v = bulb.view(lv({ bulb: 9, token: 9 }), {});
  for (const key of ['bulb.neon.bridges', 'bulb.neon.station', 'bulb.neon.market']) {
    const meshes = q => { let n = 0; f(q).build(v[key]).object.traverse(o => { if (o.isMesh) n++; }); return n; };
    assert.ok(meshes('high') > 0, `${key} has strips at high`); assert.equal(meshes('low'), 0, `${key} no strips at low`);
  }
  assert.ok(spawned.length >= 2, 'signs still load at low');
});
// 審稿（裁決 R17）：◆ Lv7 在唯一正解整局 live 演出裡（不是單獨演）也 ≤ 8 s（扣掉物品之間的空拍）。
// 計畫 5b 任務 4（節奏）：Lv5 全島 LED 在真的回合裡也 ≤ 4.5 s——放下當回合就長，電工常在主島另一頭，以前走去 101 腳下要 9 秒（外星第 6 回合 59 s）
test('live play, the solution: ◆ bulb Lv7 takes ≤ 8 s and Lv5 ≤ 4.5 s (script) in the real turn', async () => {
  const { playLive, KEY_MAX, SCRIPT_MAX } = await import('./helpers/show.js');
  for (const order of SOLUTIONS) {
    const evs = await playLive(order), at = to => evs.find(x => x.e.kind === 'grow' && x.e.item === 'bulb' && x.e.to === to);
    // 正解的燈泡是 6 → 8 跳級（第 8 回合）：合成一段演 n−1 的 ◆ Lv7 劇本（協調者裁決：風車島不能消失），量的是那個合成的燈泡 8 事件。
    // 起因閃一下那段（平移到幫手、閃白、平移回目標）不算在內：playLive 像撲空一樣單獨量，掛在事件的 cause 上（Task 3 裁決 B）
    const ev = at(8)?.e.jump ? at(8) : at(7), five = at(5);
    assert.ok(ev && ev.key && ev.live <= KEY_MAX, `${order.join('>')} turn ${ev?.turn} bulb ${ev?.e.to}${ev?.e.jump ? ' (merged jump)' : ''}: ${ev?.live.toFixed(2)} s`);
    // 跳級合成一段（回到 GROW 設計 §4.2）之後，跳級的第二級也演自己的劇本（正解的燈泡 5 是第 6 回合 4 → 5 跳級的第二級）
    assert.ok(five && five.script <= SCRIPT_MAX, `${order.join('>')} turn ${five?.turn}: Lv5 ${five?.script.toFixed(2)} s`);
  }
});
// 2026-10-28 錄影修正：夜市第二攤不能關掉捷運站與夜市之間的通道——北邊碼頭（珍奶觀光客的入口）走到人龍、
// 北邊路口推攤車進來都不繞過捷運站（每一級夜市、每一種車站，路線 ≤ 4.5 公尺、不出捷運格）
test('the night market never closes the walkway between the station and the market: pier → queue and the cart push stay short', async () => {
  const boba = await import('../src/actors/boba.js'), token = await import('../src/actors/token.js'), { offset } = await import('../src/actors/palette.js');
  const AT = anchorWorld('boba'), nav = createNav(), from = offset(AT, -1.0, -3.65), cart = offset(boba.SHOP, -0.45, 0);
  for (let b = 2; b <= 9; b++) for (const t of [0, 2, 3, 9]) for (const flags of [{}, { flooded: true }]) for (const n of [1, 2, 4]) {
    const L = lv({ bulb: b, token: t, boba: n }), all = [bulb, token, boba].flatMap(m => Object.values(m.view(L, flags)));
    nav.setFootprints(all.flatMap(p => [].concat(p.footprint || []).map(f => ({ ...f, x: p.at.x + (f.x ?? 0), z: p.at.z + (f.z ?? 0) }))));
    const what = `bulb ${b} token ${t} ${JSON.stringify(flags)} boba ${n}`;
    if (n === 1) { const len = nav.routeLength(nav.route(nav.nearestWalkable(from), cart)); assert.ok(len <= 4.5, `${what}: cart push ${len.toFixed(2)} m`); continue; }
    boba.queue(AT, boba.QUEUE_MAX, n >= 3).forEach((q, k) => {
      const r = nav.route(nav.nearestWalkable(boba.PIER[k]), q), len = nav.routeLength(r);
      assert.ok(len <= 4.5, `${what}: pier ${k} → queue ${len.toFixed(2)} m`);
      assert.ok(r.every(p => String(cellAt(p.x, p.z) ?? '') === '0,1' || !cellAt(p.x, p.z)), `${what}: pier ${k} stays in the boba cell`);
    });
  }
});

// 拜訪點（計畫 6 設計 §4、§5）：唯一正解每一個 bulb 的 placed／grow，演之前與演完之後問 visitSpot——在格子裡、站位走得到；問到的級寫死
test('visitSpot(n, s) for every level 1..max: on the main island cell of the item (or null for off-island levels), frontOf(spot, r, nav) walkable within 0.6', async () => {
  const { visitSpotsThroughSolutions } = await import('./helpers/show.js');
  assert.equal(typeof bulb.visitSpot, 'function');
  const { bad, seen } = await visitSpotsThroughSolutions(bulb, SOLUTIONS, { cells: n => (n === 4 || n === 9 ? [[0, 1]] : [[0, 0]]) });
  assert.deepEqual(bad, []);
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 9]);
});

// 最終審稿（裁決 R4 之後）：代表在主島的橋上（走路格上、不在格內）也叫得到——同 show/visit.js 的 onIsland；只有風車島上（Lv7 起）不算。
// 原本只看 cellAt，巡路的電工剛好走在橋上那一刻拜訪就略過（賽博第 6 回合 燈泡→晶片 3）
test('bulb rep: the electrician on a main-island bridge counts; on the windmill island he does not', async () => {
  const { show } = await headlessShow(), nav = show.nav;
  const bridge = { x: 2.4659, y: 0.75, z: 0 };
  assert.ok(!cellAt(bridge.x, bridge.z) && nav.walkable(bridge.x, bridge.z), 'precondition: a bridge point');
  const at = p => { const m = { pos: { ...p }, hidden: false }; return [m, bulb.script.rep({ lv: { bulb: 6 }, flags: {} }, { roster: { members: () => [m] }, nav })]; };
  const [m1, r1] = at(bridge); assert.equal(r1, m1, 'on the bridge: called');
  const [, r2] = at(bulb.ISLAND_HOME); assert.equal(r2, null, 'on the windmill island: nobody');
  const [, r3] = at(anchorWorld('bulb')); assert.ok(r3, 'on a main-island cell: called');
});

// Task 6a 修正輪（控制者裁決，Critical）：以前 Lv7 劇本在沒列車時直接丟錯，玩家亂放就整局卡死。沒列車演不搭車的版本：
// 不叫電工，鏡頭到風車島、套用（風車轉、燈塔亮）、回全景、LEVEL UP。
// 計畫 9 連鎖（2026-10-30，設計 §8 R3）：燈泡 7 要代幣 ≥5，規則下燈泡到 7 一定有列車（show.test 整份列舉驗）——退路程式留著當防呆，
//   這裡改用合成狀態直接演劇本、不經引擎。
// 唯一正解（2026-10-31）：淹水鎖代幣 ≤3，列舉 4 萬局裡淹水時燈泡最多 4 級（燈泡 5 要棒球 4／代幣 4，淹水局到不了）——
//   引擎走不到「淹水＋燈泡 6」，舊前提（EXAMPLE.hit 前 7 回合到燈泡 6、代幣 4）過時。改成：EXAMPLE.hit 8 回合瞬間演完
//   （淹水、燈泡 4、代幣 2、沒有環狀線），再瞬間演合成的燈泡 4 → 5 → 6，之後 live 演一個合成的燈泡 6 → 7
async function floodedAtBulb6(h) {
  const { turnSteps } = await import('./helpers/show.js'), { EXAMPLE } = await import('./helpers/endings.js');
  let s = engine.createState(spec);
  for (const step of turnSteps(EXAMPLE.hit).slice(0, 8)) { const r = step(s); s = r.state; await h.run([...r.events, { kind: 'settle' }], { instant: true }); }
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
  // 劇本本身：沒列車就不叫他走去搭車——套用之後他閃白換到島上的家、回日常（修正輪 2）；有列車（代幣 5、沒淹水）就走去搭車
  const kinds = (token, flags) => bulb.script.grow[7](bulbGrow(6, 7), { lv: lv({ bulb: 7, token }), flags }, { B, roster: { members: () => [] } }).map(b => b.kind);
  assert.deepEqual(kinds(4, { flooded: true }), ['focus', 'apply', 'relocate', 'home', 'focus', 'levelUp'], 'flooded: the trains are stopped');
  assert.deepEqual(kinds(0, {}), ['focus', 'apply', 'relocate', 'home', 'focus', 'levelUp'], 'no token: no ring line');
  assert.notDeepEqual(kinds(5, {}), ['focus', 'apply', 'relocate', 'home', 'focus', 'levelUp'], 'token 5, not flooded: he rides the train');
});
// Task 6a 修正輪 2（控制者裁決）：沒車的退路把電工閃白換到風車島上（roster.relocate；換位置一定閃白，裁決 R3），
// 之後沒合成的燈泡 8 照常演：他在島上的開關箱前一敲、電纜出現。合成狀態同上（設計 §8 R3）：淹水局燈泡 6 之後 live 演合成的 6 → 7、
// 再一回合合成的 7 → 8（不合成跳級），同一趟查不瞬移、換位置閃白（gameInvariants）
test('the no-train fallback (synthetic: flooded) blinks the electrician onto the windmill island; the following unmerged bulb 8 plays the switch beats there', async () => {
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
