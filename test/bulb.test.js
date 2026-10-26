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
import { headlessShow, playItem } from './helpers/show.js';
import { lv, worldPoints } from './helpers/actors.js';
const heads = s => s.parts.filter(p => p.kind === 'sphere');

test('bulb lv1 is one street lamp', () => {
  const v = bulb.view(lv({ bulb: 1 }), {}); assert.deepEqual(Object.keys(v), ['bulb.main', 'bulb.electrician']); assert.equal(heads(v['bulb.main']).length, 1);
});
const N_STOPS = 9, LAMPS = v => Array.from({ length: N_STOPS }, (_, k) => v[`bulb.lamps.${k}`]);
const posts = s => s.parts.filter(p => p.kind === 'cylinder');
test('lv2: fifteen lamps on the five low cells plus two market stalls', () => {
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
test('lv4 widens the night market to four stalls with a neon sign; lv3 still two', () => {
  const stalls = n => bulb.view(lv({ bulb: n }), {})['bulb.market'].parts.filter(p => p.kind === 'hip').length;
  assert.equal(stalls(3), 2); assert.equal(stalls(4), 4);
  assert.ok(bulb.view(lv({ bulb: 4 }), {})['bulb.market'].parts.some(p => p.glow === 0xff3fa0 && p.kind === 'box'));
});

const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);   // 兩條正解（賽博、外星）
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
  assert.deepEqual(v['bulb.main'].footprint, { r: 0.15 }); assert.equal(v['bulb.market'].footprint, undefined, 'market footprint is automatic');
  for (const n of [1, 2, 5]) {
    const el = bulb.view(lv({ bulb: n }), {})['bulb.electrician'];
    assert.deepEqual([el.kind, el.n, el.accessory], ['roster', 1, 'vest']); assert.deepEqual(el.home, { kind: 'path', path: bulb.ROAD, loop: true, speed: 0.5 });
  }
  assert.ok(bulb.script?.placed && [2, 3, 4, 5].every(n => bulb.script.grow[n]) && bulb.script.fx() === null);
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
const stopOrder = from => Array.from({ length: N_STOPS }, (_, i) => [...(i ? [] : ['bulb.posts']), `bulb.lamps.${(i + from) % N_STOPS}`, ...(i === N_STOPS - 2 ? ['bulb.market', 'sat.lighthouse'] : [])]);
test('grow 2 lights the stops one by one along the road (posts with the first; market and lighthouse while he walks the last leg)', () => {
  const s = { lv: lv({ bulb: 2 }), flags: {} };
  const c0 = fakeCtx(); assert.deepEqual(applies(bulb.script.grow[2](E(2), s, c0), c0), stopOrder(0));
  // 電工在半路上：從他最近的那站開始，沿路繞一圈（順序照樣沿路）；第 9 盞是第 5 站
  const p = bulb.lampApproach(9), c9 = fakeCtx({ pos: p, head: () => p }), got = applies(bulb.script.grow[2](E(2), s, c9), c9);
  assert.ok(bulb.LAMP_STOPS[5].includes(9)); assert.deepEqual(got, stopOrder(5));
  // 直接找 walk 的速度：快走 2.8（節奏驗收的裁定），不衝刺
  assert.ok(flat(bulb.script.grow[2](E(2), s, fakeCtx())).filter(b => b.kind === 'walk').length === N_STOPS);
  assert.equal(bulb.LIGHTING_SPEED, 2.8);
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
      if (pred(e)) { const n = bubblesLog.length; return { e, secs: await run([e]), n }; }
      await run([e], { instant: true });
    }
    await run([{ kind: 'settle' }], { instant: true });
  }
  throw new Error('event not found');
}
const isBulb = to => e => e.kind === 'grow' && e.item === 'bulb' && e.to === to;
const MAX_SECS = { 1: 8, 2: 19, 3: 10, 4: 10, 5: 10 };   // Lv2 電工快走（2.8）繞全島一圈（實測 15–17.5 s；回合 8–45 s 由 pace 管）
function checkBulb({ show, bubblesLog }, e, secs, n) {
  const what = `${e.kind} ${e.to ?? ''}`, to = e.kind === 'grow' ? e.to : 1;
  assert.ok(secs >= 3 && secs <= MAX_SECS[to], `${what} took ${secs.toFixed(1)}s`);
  if (e.kind === 'grow') {
    const last = bubblesLog.slice(n).at(-1), h = show.stage.headOf('bulb');
    assert.equal(last?.text, 'LEVEL UP', what); assert.ok(Math.hypot(last.at.x - h.x, last.at.y - h.y, last.at.z - h.z) < 0.3, `${what} LEVEL UP over bulb`);
  }
  const els = show.roster.members('bulb.electrician'); assert.equal(els.length, 1, what);
  assert.equal(els[0].mode, 'home', `${what} electrician home`);
  for (const m of show.roster.members('landmarks.islanders')) assert.equal(m.mode, 'home', `${what} islanders`);
}
test('scripts: every bulb level in both solutions plays within its budget, ends with LEVEL UP on bulb, and leaves everyone at home', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  let n = 0;
  const tracked = (evs, opts) => { if (!opts?.instant) n = bubblesLog.length; return run(evs, opts); };
  for (const order of SOLUTIONS) {
    show.reset();
    const seen = new Set();
    await playItem(show, tracked, order, 'bulb', (e, secs) => { seen.add(e.kind === 'grow' ? e.to : 1); checkBulb(h, e, secs, n); });
    assert.ok(seen.has(1) && seen.has(2), `bulb events seen: ${[...seen]}`);
    // playItem 碰不到的等級（落在倒數蒙太奇回合）：自己堆出前置狀態，單獨 live 演
    for (const to of [2, 3, 4, 5].filter(t => !seen.has(t))) {
      show.reset();
      const { e, secs, n: before } = await liveAt(h, order, isBulb(to));
      checkBulb(h, e, secs, before);
    }
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
test('Lv4: the two nearest islanders queue at the market', async () => {
  const h = await headlessShow(), m = landmarkWorld('market');
  const { e, n } = await liveAt(h, SOLUTIONS[0], isBulb(4));
  assert.equal(e.to, 4);
  const hearts = h.bubblesLog.slice(n).filter(b => b.kind === '♥');
  assert.equal(hearts.length, 2);
  assert.ok(hearts.every(b => Math.hypot(b.at.x - m.x, b.at.z - m.z) < 1.6), `islanders by the market: ${hearts.map(b => Math.hypot(b.at.x - m.x, b.at.z - m.z).toFixed(2))}`);
});
// 自動 footprint 是包圍盒 ×0.9（斜放的零件會鼓出去），所以每個 footprint 先內縮 0.25（一個小人的寬）再比
test('ROAD clears the core of every footprint at the end of both solutions', async () => {
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

// 審查：起點那一站要用「第一段走路開始那一刻」電工的位置挑，不是建拍時（同回合前面的劇本演的時候他還在巡路）
// stub：關掉名冊焦點（電工照常巡路，驗「建拍之後他走開了」）；不關時只驗第一站是開走那一刻離他最近的
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
  let atBuild = null, atWalk = null;
  const scripted = bulb.script.grow[2];
  bulb.script.grow[2] = (e, s2, ctx) => {
    atBuild = { ...ctx.roster.members('bulb.electrician')[0].pos };
    const beats = scripted(e, s2, ctx), w = beats[0], start = w.start;
    w.start = c => { atWalk = { ...c.roster.members('bulb.electrician')[0].pos }; return start(c); };
    return beats;
  };
  try {
    const update = show.update, first = [];
    show.update = (dt, t) => { update(dt, t); for (let i = 0; i < N_STOPS; i++) if (!first.includes(i) && show.stage.partObject(`bulb.lamps.${i}`)?.visible) first.push(i); };
    assert.ok(evs.indexOf(evs.find(isBulb(2))) > 0, 'bulb grows after other events in the turn');
    await run([...evs, { kind: 'settle' }]);
    const nearest = p => bulb.LAMP_STOPS.reduce((b, gg, k) => (Math.hypot(bulb.lampApproach(gg[0]).x - p.x, bulb.lampApproach(gg[0]).z - p.z) < Math.hypot(bulb.lampApproach(bulb.LAMP_STOPS[b][0]).x - p.x, bulb.lampApproach(bulb.LAMP_STOPS[b][0]).z - p.z) ? k : b), 0);
    if (stub) assert.ok(Math.hypot(atWalk.x - atBuild.x, atWalk.z - atBuild.z) > 1, 'electrician patrolled during the wait');
    assert.equal(first[0], nearest(atWalk), `first stop ${first[0]} vs nearest at walk ${nearest(atWalk)} / at build ${nearest(atBuild)}`);
  } finally { bulb.script.grow[2] = scripted; }
}
test('grow 2 picks its first stop from where the electrician is when the walk starts, not when the turn is built', () => firstStopRun({ stub: true }));
test('grow 2 with the roster focus on: the first stop is the nearest to the electrician when the walk starts', () => firstStopRun({ stub: false }));
test('Lv4 never picks hidden islanders', () => {
  const vis = { pos: { x: 9, z: 9 }, head: () => ({ x: 9, y: 0, z: 9 }) }, m = landmarkWorld('market');
  const hid = { pos: { ...m }, hidden: true, head: () => m }, vis2 = { pos: { x: 8, z: 8 }, head: () => ({ x: 8, y: 0, z: 8 }) };
  const ctx = { B, roster: { members: k => (k === 'landmarks.islanders' ? [hid, vis, vis2] : []) }, nav: { slots: () => [m, m] } };
  const beats = flat(bulb.script.grow[4](E(4), { lv: lv({ bulb: 4 }), flags: {} }, ctx)).filter(b => b.kind === 'walk');
  const who = [];
  const fakeCtx2 = { ...ctx, roster: { ...ctx.roster, claim: x => who.push(x) }, nav: { route: (a, b) => [a, b], routeLength: () => 0, slots: () => [m, m] } };
  for (const b of beats) b.start(fakeCtx2);
  assert.ok(!who.includes(hid), 'hidden islander picked'); assert.equal(who.length, 2);
});
