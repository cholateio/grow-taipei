import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as token from '../src/actors/token.js';
test('trainPose: cars trail along the track radius at the right spacing; speed 0 freezes them', () => {
  const { TRACK, trainPose } = token;
  const a = trainPose(5, 0, { cars: 3 }), b = trainPose(5, 1, { cars: 3 });
  for (const p of [a, b]) { assert.ok(Math.abs(Math.hypot(p.x, p.z) - TRACK.radius) < 1e-9); assert.equal(p.y, TRACK.y); }
  assert.ok(Math.abs(Math.hypot(a.x - b.x, a.z - b.z) - 0.6) < 0.01, 'car gap 0.6');
  assert.deepEqual(trainPose(1, 0, { speed: 0 }), trainPose(9, 0, { speed: 0 }));
});
import * as THREE from '../vendor/three/three.module.js';
import { groundAt, axialToWorld, SATELLITES } from '../src/scene/hex.js';
import { createPartFactory } from '../src/actors/parts.js';
import { createGlowRegistry } from '../src/scene/glow.js';
const L = extra => ({ milk: 0, chip: 0, bulb: 0, token: 0, typhoon: 0, rat: 0, boba: 0, baseball: 0, ...extra });
const pylons = s => s.parts.filter(p => p.kind === 'cylinder');

test('token lv1 is a station and its staff', () => assert.deepEqual(Object.keys(token.view(L({ token: 1 }), {})), ['token.main', 'token.staff']));
test('token lv2 track has 12 pylons whose heights come from groundAt', () => {
  const v = token.view(L({ token: 2 }), {}), ps = pylons(v['token.track']);
  assert.equal(ps.length, 12); assert.ok(v['token.track'].parts.some(p => p.kind === 'rail'));
  for (const p of ps) { const base = groundAt(p.pos[0], p.pos[2]); assert.ok(Math.abs(p.pos[1] - p.scale[1] / 2 - base) < 1e-9); assert.ok(Math.abs(p.pos[1] + p.scale[1] / 2 - token.TRACK.y) < 1e-9); }
  assert.equal(v['token.train'].cars, 3);
});
test('lv3 five cars; lv4 two spurs to the lighthouse and playground islands; lv5 a shuttle; lv6 neon cars', () => {
  assert.equal(token.view(L({ token: 3 }), {})['token.train'].cars, 5); assert.ok(!Object.keys(token.view(L({ token: 3 }), {})).some(k => k.startsWith('token.spur')));
  const v = token.view(L({ token: 4 }), {});
  for (const kind of ['lighthouse', 'playground']) {
    const s = SATELLITES.find(x => x.kind === kind), c = axialToWorld(s.q, s.r), last = v[`token.spur.${kind}.${token.SPUR_PARTS - 1}`];
    assert.ok(last.parts.some(p => p.kind === 'box' && Math.hypot(last.at.x + p.pos[0] - c.x, last.at.z + p.pos[2] - c.z) < 2.2), kind);
  }
  assert.equal(v['token.train'].cars, 5); assert.ok(!v['token.train'].neon); assert.equal(v['token.shuttle'], undefined);
  assert.equal(token.view(L({ token: 5 }), {})['token.shuttle'].kind, 'shuttle'); assert.ok(!token.view(L({ token: 5 }), {})['token.train'].neon);
  assert.ok(token.view(L({ token: 6 }), {})['token.train'].neon);
});
test('flooded turns the station into a pool with two swimmers and stops the train', () => {
  const v = token.view(L({ token: 2 }), { flooded: true });
  assert.ok(v['token.main'].parts.some(p => p.color === 0xa4d4da)); assert.equal(v['token.swimmers'].n, 2); assert.equal(v['token.train'].speed, 0);
});
test('train builder: cars follow trainPose and glow when neon', () => {
  const glow = createGlowRegistry(), f = createPartFactory(THREE, { glow, builders: token.builders });
  const p = f.build({ ...token.view(L({ token: 6 }), {})['token.train'] }); p.update(0.1, 3);
  assert.equal(p.object.children.length, 5); const want = token.trainPose(3, 0);
  assert.ok(Math.abs(p.object.children[0].position.x - want.x) < 1e-9); assert.ok(glow.size > 0);
});
test('the ring line runs in the water channel outside the main island, below the old roof-cutting height', async () => {
  const { SPACING, R, SATELLITES, axialToWorld, groundAt, WATER_Y, TOP } = await import('../src/scene/hex.js');
  const mainReach = Math.sqrt(3) * SPACING + R, satInner = Math.min(...SATELLITES.map(s => { const c = axialToWorld(s.q, s.r); return Math.hypot(c.x, c.z); })) - R;
  assert.ok(token.TRACK.radius > mainReach + 0.5 && token.TRACK.radius < satInner - 0.3, `${token.TRACK.radius} between ${mainReach} and ${satInner}`);
  assert.ok(token.TRACK.y <= TOP + 0.6);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + 0.13; assert.equal(groundAt(Math.cos(a) * token.TRACK.radius, Math.sin(a) * token.TRACK.radius), WATER_Y); }
});
test('shuttle runs back and forth on the playground spur', () => {
  const f = createPartFactory(THREE, { glow: createGlowRegistry(), builders: token.builders });
  const p = f.build(token.view(L({ token: 5 }), {})['token.shuttle']); p.update(0.5, 0.5); const a = p.object.children[0].position.clone(); p.update(1.5, 2);
  assert.ok(a.distanceTo(p.object.children[0].position) > 0.3);
});

// ── Task 14：旅程劇本（§8.4）──
import { anchorWorld } from '../src/actors/anchors.js';
import { offset } from '../src/actors/palette.js';
import { cellAt } from '../src/scene/hex.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { B, STATION_A } from '../src/show/beats.js';
import { headlessShow, playItem } from './helpers/show.js';
import { lv as LV, entryProblems, focusCell, focusTrail } from './helpers/actors.js';
import { entriesThroughSolutions } from './helpers/show.js';
import { createNav } from '../src/show/nav.js';
import { cellOf } from '../src/actors/anchors.js';
import { worldToAxial } from '../src/scene/hex.js';
const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);
const AT = anchorWorld('token'), TWO_PI = 2 * Math.PI;
const satCell = kind => { const c = satC(kind); return worldToAxial(c.x, c.z); };
const satC = kind => { const s = SATELLITES.find(x => x.kind === kind); return axialToWorld(s.q, s.r); };

test('view: the station staff is a roster at the door; flooded turns them into swimmers; gone at Lv6', () => {
  const st = token.view(L({ token: 1 }), {})['token.staff'];
  assert.deepEqual([st.kind, st.n, st.accessory, st.home.kind], ['roster', 1, 'uniform', 'stand']);
  const post = offset(AT, 0.6, 0.55); assert.ok(Math.hypot(st.home.spots[0].x - post.x, st.home.spots[0].z - post.z) < 1e-9);
  assert.equal(token.view(L({ token: 5 }), {})['token.staff'].n, 1); assert.equal(token.view(L({ token: 6 }), {})['token.staff'], undefined);
  const f = token.view(L({ token: 2 }), { flooded: true });
  assert.equal(f['token.staff'], undefined);
  assert.deepEqual([f['token.swimmers'].kind, f['token.swimmers'].n, f['token.swimmers'].accessory, f['token.swimmers'].from, f['token.swimmers'].home.kind], ['roster', 2, 'none', 'token.staff', 'stand']);
  assert.equal(f['token.swimmers'].home.spots.length, 2);
});
test('view: each spur is split into SPUR_PARTS keyed parts (8 segments in all) with no footprint; track, train, shuttle have no footprint', () => {
  const v = token.view(L({ token: 5 }), {});
  for (const kind of ['lighthouse', 'playground']) {
    const c = satC(kind);
    const d = Array.from({ length: token.SPUR_PARTS }, (_, i) => { const s = v[`token.spur.${kind}.${i}`]; assert.equal(s.footprint, false); assert.equal(s.kind, 'compound'); return Math.hypot(s.at.x, s.at.z); });
    assert.equal(Array.from({ length: token.SPUR_PARTS }, (_, i) => v[`token.spur.${kind}.${i}`].parts.filter(p => p.kind === 'box').length).reduce((a, b) => a + b), 8);
    assert.equal(v[`token.spur.${kind}.${token.SPUR_PARTS}`], undefined);
    assert.ok(d.every((x, i) => !i || x > d[i - 1]), `${kind} segments run outward in order`);
    const last = v[`token.spur.${kind}.${token.SPUR_PARTS - 1}`].at; assert.ok(Math.hypot(last.x - c.x, last.z - c.z) < 2.5, `${kind} ends at the island`);
  }
  assert.equal(v['token.spurs'], undefined);
  for (const k of ['token.track', 'token.train', 'token.shuttle']) assert.equal(v[k].footprint, false, k);
  // 接駁車改走遊樂場島的支線：第二點在遊樂場島方向、在島上
  const p = v['token.shuttle'].path, c = satC('playground'), a = Math.atan2(p[1].z, p[1].x), want = Math.atan2(c.z, c.x);
  assert.ok(Math.abs(a - want) < 1e-6); assert.ok(Math.hypot(p[1].x - c.x, p[1].z - c.z) < 2.5);
  assert.ok(token.script?.placed && [2, 3, 4, 5, 6].every(n => token.script.grow[n]));
});
test('grow 4 applies the spur parts in order from the ring outward, two at a time (lighthouse i with playground i)', () => {
  const ctx = { B, roster: { members: () => [] } };
  const flat = bs => bs.flatMap(b => (b.kind === 'together' ? flat(b.beats) : [b]));
  const only = flat(token.script.grow[4]({ kind: 'grow', item: 'token', to: 4 }, { lv: L({ token: 4 }), flags: {} }, ctx)).filter(b => b.kind === 'apply' && b.only).map(b => b.only);
  assert.deepEqual(only, Array.from({ length: token.SPUR_PARTS }, (_, i) => [`token.spur.lighthouse.${i}`, `token.spur.playground.${i}`]));
});

const STAFF = ['token.staff', 'token.swimmers', 'sat.playground'];
async function liveAt({ run, bubblesLog, rig }, order, pred) {
  let s = engine.createState(spec);
  const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  for (const step of steps) {
    const r = step(s); s = r.state;
    for (const e of r.events) {
      if (pred(e)) { const n = bubblesLog.length, r = rig.log.length; return { e, secs: await run([e]), n, r }; }
      await run([e], { instant: true });
    }
    await run([{ kind: 'settle' }], { instant: true });
  }
  throw new Error('event not found');
}
const isToken = to => e => e.kind === 'grow' && e.item === 'token' && e.to === to;
function checkToken({ show, bubblesLog, rig }, e, secs, n, r) {
  const what = `${e.kind} ${e.to ?? ''}`;
  assert.ok(secs >= 1.5 && secs <= 15, `${what} took ${secs.toFixed(1)}s`);   // 下限因 §13.2 閃白變短而降低（原 2.5）
  if (e.kind === 'grow') {
    const last = bubblesLog.slice(n).at(-1), h = show.stage.headOf('token');
    assert.equal(last?.text, 'LEVEL UP', what); assert.ok(Math.hypot(last.at.x - h.x, last.at.y - h.y, last.at.z - h.z) < 0.3, `${what} LEVEL UP over token`);
  }
  for (const k of STAFF) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', `${what} ${k}`);
  // 鏡頭（§13.1）：不再用舊的 panTo；Lv4 去燈塔島、Lv5 去遊樂場島（zoom 0.8），LEVEL UP 時回代幣格，最後回全景；其他級只對著代幣格
  const cam = rig.log.slice(r), trail = focusTrail(rig.log, r).map(String), TOKEN = String(cellOf('token'));
  assert.equal(cam.filter(c => c[0] === 'panTo').length, 0, `${what} no panTo`);
  const want = e.to === 4 ? [TOKEN, String(satCell('lighthouse')), TOKEN, 'home'] : e.to === 5 ? [String(satCell('playground')), TOKEN, 'home'] : [TOKEN, 'home'];
  assert.deepEqual(trail, want, `${what} camera trail`);
  if ([4, 5].includes(e.to)) assert.ok(cam.some(c => c[0] === 'focus' && c[2].zoom === 0.8 && cellAt(c[1].x, c[1].z) === null), `${what} island at zoom 0.8`);
  const lvl = e.kind === 'grow' ? e.to : 1;
  assert.equal(show.roster.members('token.staff').length, lvl < 6 && !show.stage.flags.flooded ? 1 : 0, `${what} staff count`);
}
test('scripts: every token level in both solutions plays 1.5–15 s, ends with LEVEL UP on token, and leaves everyone at home', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  let n = 0, r = 0;
  const tracked = (evs, opts) => { if (!opts?.instant) { n = bubblesLog.length; r = h.rig.log.length; } return run(evs, opts); };
  for (const order of SOLUTIONS) {
    show.reset();
    const seen = new Set();
    await playItem(show, tracked, order, 'token', (e, secs) => { seen.add(e.kind === 'grow' ? e.to : 1); checkToken(h, e, secs, n, r); });
    assert.ok(seen.has(1), `token events seen: ${[...seen]}`);
    for (const to of [2, 3, 4, 5, 6].filter(t => !seen.has(t))) {
      show.reset();
      const { e, secs, n: before, r: r0 } = await liveAt(h, order, isToken(to));
      checkToken(h, e, secs, before, r0);
    }
  }
});
test('Lv3: the train pulls in within 4 s and is held 3 s while the staff waves', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show } = h, update = show.update, frames = [];
    let t = 0;
    show.update = (dt, tt) => { const before = h.rail.offset; update(dt, tt); frames.push({ t, held: Math.abs(h.rail.offset - before + dt) < 1e-9, wave: show.roster.members('token.staff').some(m => m.walker?.gesture?.kind === 'wave') }); t += dt; };
    const { e } = await liveAt(h, order, isToken(3));
    assert.equal(e.to, 3);
    const held = frames.filter(f => f.held);
    assert.ok(held.length, 'train held at the station');
    assert.ok(held[0].t <= 4 + 0.1, `arrived after ${held[0].t.toFixed(2)} s`);
    assert.ok(Math.abs(held.length / 30 - 3) < 0.1, `held ${(held.length / 30).toFixed(2)} s`);
    assert.ok(frames.some(f => f.wave && f.held), 'staff waves while the train is held');
  }
});
test('Lv5: the playground kids get off the shuttle at the island end, then go home on the island', async () => {
  const h = await headlessShow(), { show } = h, update = show.update, end = token.spurPath('playground').at(-1);
  let first = null;
  show.update = (dt, t) => { update(dt, t); const ks = show.roster.members('sat.playground'); if (!first && ks.length) first = ks.map(k => ({ ...k.pos })); };
  const { e, secs, n, r: r0 } = await liveAt(h, SOLUTIONS[0], isToken(5));
  checkToken(h, e, secs, n, r0); assert.ok(show.stage.lv.milk >= 2);
  // §13.2：spawn 不佔時間，兩個小孩同一幀在接駁車那頭下車
  assert.ok(first?.length >= 1, 'kids get off the shuttle');
  assert.ok(first.every(p => Math.hypot(p.x - end.x, p.z - end.z) < 0.6), 'kids spawn by the shuttle end');
  const ks = show.roster.members('sat.playground'), c = satC('playground');
  assert.equal(ks.length, 2);
  for (let i = 0; i < 120; i++) show.update(1 / 30, 100 + i / 30);
  for (const k of ks) { assert.equal(k.mode, 'home'); assert.equal(cellAt(k.pos.x, k.pos.z), null); assert.ok(Math.hypot(k.pos.x - c.x, k.pos.z - c.z) < 1.5, 'stays on the playground island'); }
  assert.deepEqual(focusTrail(h.rig.log, r0).map(String), [String(satCell('playground')), String(cellOf('token')), 'home'], 'camera: playground island, token for LEVEL UP, home');
});
test('Lv6: the staff runs into the station and is gone; the train turns neon', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h;
  const { e, secs, n, r } = await liveAt(h, SOLUTIONS[0], isToken(6));
  checkToken(h, e, secs, n, r);
  assert.ok(bubblesLog.slice(n).some(b => b.kind === '！'), 'staff ！'); assert.ok(bubblesLog.slice(n).some(b => b.kind === '♪'), 'roof ♪');
  assert.equal(show.roster.members('token.staff').length, 0);
});
// 兩個事件以上的回合整段 live 演：站務員、島緣都是演到才找；列車從站後面 0.6 rad 駛出
test('grow 2 in a full live turn: the train departs from behind the station', async () => {
  const h = await headlessShow(), { show, run } = h, order = SOLUTIONS[0];
  let st = engine.createState(spec), evs = null;
  for (const id of order) {
    const r = engine.place(st, id, spec); st = r.state;
    if (r.events.some(isToken(2))) { evs = r.events; break; }
    await run([...r.events, { kind: 'settle' }], { instant: true });
  }
  assert.ok(evs, 'grow 2 happens in a placement turn');
  const scripted = token.script.grow[2]; let angle = null, staffAt = null;
  token.script.grow[2] = (e, s2, ctx) => {
    const beats = scripted(e, s2, ctx), flat = bs => bs.flatMap(b => (b.kind === 'together' ? flat(b.beats) : [b]));
    const dep = flat(beats).find(b => b.kind === 'trainDepart'), start = dep.start;
    dep.start = c => { const r = start(c); angle = (c.now + c.rail.offset) * 0.35; staffAt = { ...c.roster.members('token.staff')[0].pos }; return r; };
    return beats;
  };
  try { await run([...evs, { kind: 'settle' }]); } finally { token.script.grow[2] = scripted; }
  const d = ((((angle - (STATION_A - 0.6)) % TWO_PI) + TWO_PI + Math.PI) % TWO_PI) - Math.PI;
  assert.ok(Math.abs(d) < 0.05, `head car at ${angle} vs ${STATION_A - 0.6}`);
  assert.ok(Math.hypot(staffAt.x, staffAt.z) > Math.hypot(AT.x, AT.z) + 0.5, 'staff walked out to the shore first');
  assert.ok(show.stage.partObject('token.train'));
});

// ── 計畫 3.8 Task 6：入口點、鏡頭焦點 ──
// 站務員（淹水時的泳客同一個入口）從月台外側走來：入口走得到、離每個站位 ≥ 1.5（每一級、淹水與否；兩條正解每一刻的真 footprint）
test('token rosters enter from outside the platform, walkable and ≥ 1.5 from every spot; placement spawns the staff there', async () => {
  const nav = createNav(), bad = [];
  for (const n of [1, 2, 3, 4, 5, 6]) for (const flooded of [false, true]) {
    const v = token.view(LV({ token: n }), { flooded });
    for (const [k, d] of Object.entries(v)) if (d.kind === 'roster') assert.equal(d.home.entry, token.STAFF_ENTRY, `lv${n} ${k} entry`);
    bad.push(...entryProblems(v, nav, `lv${n}${flooded ? ' flooded' : ''}`));
  }
  bad.push(...await entriesThroughSolutions(token, SOLUTIONS));
  assert.deepEqual(bad, []);
  assert.deepEqual(cellAt(token.STAFF_ENTRY.x, token.STAFF_ENTRY.z), [0, 1]);
  const beats = token.script.placed({ kind: 'placed', item: 'token', to: 1 }, { lv: LV({ token: 1 }), flags: {} }, { B, roster: { members: () => [] } });
  const sp = beats.find(b => b.kind === 'spawn'), at = [];
  sp.start({ roster: { spawnHeld: (k, p) => { at.push([k, p]); return null; } } });
  assert.deepEqual(at, [['token.staff', token.STAFF_ENTRY]]);
});
test('token 4 / 5: the satellite island is a focus at zoom 0.8 (no camera beats); LEVEL UP pans back to the token cell', () => {
  const ctx = { B, roster: { members: () => [] } }, flat = bs => bs.flatMap(b => (b.kind === 'together' ? flat(b.beats) : [b]));
  for (const [to, kind] of [[4, 'lighthouse'], [5, 'playground']]) {
    const beats = token.script.grow[to]({ kind: 'grow', item: 'token', to }, { lv: LV({ token: to, milk: 2 }), flags: {} }, ctx);
    assert.ok(!flat(beats).some(b => b.kind === 'camera'), `lv${to} no camera beat`);
    const focus = flat(beats).filter(b => b.kind === 'focus');
    assert.deepEqual(focus.map(b => focusCell(b, ctx)), [satCell(kind), cellOf('token')], `lv${to} focus cells`);
    if (to === 5) assert.equal(beats[0].kind, 'focus', 'lv5 starts on the playground island');
    const last = beats.at(-1); assert.equal(last.kind, 'together'); assert.deepEqual(last.beats.map(b => b.kind).sort(), ['focus', 'levelUp']);
  }
});
// 站務員從入口走到崗位不穿過珍奶攤車前的人龍（Lv1–2 的排隊站位，含 Lv3 前補到 8 人的轉角）：
// 兩條正解裡有攤車的每一刻（放置與倒數回合）的真 footprint 下，路線離每個排隊站位 ≥ 0.25，也不經過攤車前方（Task 7 會把隊伍橫排在那裡）
test('the staff entry walk to the post stays clear of the boba queue and the cart front', async () => {
  const BOBA = anchorWorld('boba'), POST = offset(AT, 0.6, 0.55);
  const Q = [...Array.from({ length: 6 }, (_, i) => offset(BOBA, -0.5, 0.15 + 0.22 * i)), offset(BOBA, -0.72, 1.25), offset(BOBA, -0.94, 1.25)];
  const segD = (p, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L)); return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t); };
  // 攤車前方：Task 7 的橫排人龍在攤車前 0.9，前後各留 0.35
  const front = p => Math.abs(p.x - BOBA.x) < 1.3 && p.z > BOBA.z + 0.55 && p.z < BOBA.z + 1.25;
  const check = (route, what) => {
    for (let k = 1; k < route.length; k++) {
      for (const q of Q) assert.ok(segD(q, route[k - 1], route[k]) >= 0.25, `${what}: passes ${segD(q, route[k - 1], route[k]).toFixed(2)} from queue spot (${q.x.toFixed(2)}, ${q.z.toFixed(2)})`);
      for (let u = 0; u <= 1; u += 0.05) { const a = route[k - 1], b = route[k]; assert.ok(!front({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u }), `${what}: crosses the cart front`); }
    }
  };
  check([token.STAFF_ENTRY, POST], 'straight');
  const { show, run } = await headlessShow();
  for (const order of SOLUTIONS) {
    show.reset(); let s = engine.createState(spec), seen = 0;
    const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
    for (const [i, step] of steps.entries()) {
      const r = step(s); s = r.state; await run([...r.events, { kind: 'settle' }], { instant: true });
      if (show.stage.lv.boba >= 1) { seen++; check(show.nav.route(token.STAFF_ENTRY, POST), `${order.join('>')} step ${i + 1}`); }
    }
    assert.ok(seen >= 3, 'checked with the cart on the island');
  }
});
