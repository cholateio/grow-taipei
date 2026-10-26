import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as baseball from '../src/actors/baseball.js';
import { RING_R } from '../src/scene/hex.js';
import { lv, worldPoints, distToCell } from './helpers/actors.js';
import { createPartFactory } from '../src/actors/parts.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { anchorWorld } from '../src/actors/anchors.js';
import { offset } from '../src/actors/palette.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { headlessShow, playItem } from './helpers/show.js';

test('baseball lv1 sand lot; lv2 wooden stands + two players and a ball; lv3 the dome', () => {
  const v1 = baseball.view(lv({ baseball: 1 }), {}); assert.deepEqual(Object.keys(v1), ['baseball.main', 'baseball.lines.0', 'baseball.lines.1', 'baseball.lines.2', 'baseball.lines.3']);
  const v2 = baseball.view(lv({ baseball: 2 }), {});
  assert.ok(!v2['baseball.main'].parts.some(p => p.kind === 'dome')); assert.ok(v2['baseball.main'].parts.filter(p => p.stand).length >= 3, 'stands');
  assert.equal(v2['baseball.players'].home.spots.length, 2); assert.equal(v2['baseball.ball'].kind, 'ball');
  assert.ok(baseball.view(lv({ baseball: 3 }), {})['baseball.main'].parts.some(p => p.kind === 'dome'));
});
test('lv4 crowd of 4 + roof slit; lv5 six fans + blue sticks; lv6 fireworks over the dome', () => {
  const v4 = baseball.view(lv({ baseball: 4 }), {}), v5 = baseball.view(lv({ baseball: 5 }), {}), v6 = baseball.view(lv({ baseball: 6 }), {});
  assert.equal(v4['baseball.crowd'].n, 4); assert.ok(v4['baseball.main'].parts.some(p => p.glow === 0xfcea8b));
  assert.equal(v5['baseball.crowd'].n, 6); assert.ok(v5['baseball.main'].parts.filter(p => p.glow === 0x3fe0ff).length >= 8);
  assert.equal(v6['baseball.fireworks'].kind, 'fireworks'); assert.equal(v5['baseball.fireworks'], undefined);
});
test('domeRats flag adds two helmeted staff running around the gate', () => {
  const v = baseball.view(lv({ baseball: 2 }), { domeRats: true });
  assert.equal(v['baseball.staff'].n, 2); assert.equal(v['baseball.staff'].accessory, 'helmet');
});
test('the ball flies back and forth between the players', () => {
  const f = createPartFactory(THREE, { glow: createGlowRegistry(), builders: baseball.builders });
  const spec = baseball.view(lv({ baseball: 2 }), {})['baseball.ball'], p = f.build(spec), ball = p.object.children[0];
  p.update(0, 0); const x0 = ball.position.x; p.update(0, 0.3); assert.ok(ball.position.y > 0.2); p.update(0, 0.6); assert.ok(Math.sign(ball.position.x) !== Math.sign(x0) || Math.abs(ball.position.x - x0) > 0.5);
});
test('every baseball part stays inside its cell', () => {
  for (const n of [1, 2, 3, 4, 5, 6]) for (const s of Object.values(baseball.view(lv({ baseball: n }), { domeRats: true }))) if (s.kind !== 'fireworks') for (const p of [...worldPoints(s), ...(s.home?.spots ?? [])]) assert.ok(distToCell(p, [-1, 1]) < RING_R, `lv${n} ${JSON.stringify(p)}`);
});
test('crowd leaves an aisle for the players: no fan within 0.35 of a player', () => {
  const v = baseball.view(lv({ baseball: 5 }), {});
  for (const f of v['baseball.crowd'].home.spots) for (const p of v['baseball.players'].home.spots) assert.ok(Math.hypot(f.x - p.x, f.z - p.z) > 0.35);
});

// ── Task 18：名冊與劇本（§8.8）──
const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);   // 兩條正解（賽博、外星），從求解器取
const AT = anchorWorld('baseball'), PLATFORM = offset(anchorWorld('token'), 0.9, 0.9);
const near = (a, b, d) => Math.hypot(a.x - b.x, a.z - b.z) < d;
const BASES = [[0, 0.5], [0.5, 0], [0, -0.5], [-0.5, 0]].map(([x, z]) => offset(AT, x, z));

test('view: players and crowd are rosters standing (crowd fidgets with jumps); four base lines at Lv1–2; footprints leave the field and the apron', () => {
  const v1 = baseball.view(lv({ baseball: 1 }), {}), v2 = baseball.view(lv({ baseball: 2 }), {});
  for (const v of [v1, v2]) for (let i = 0; i < 4; i++) {
    const l = v[`baseball.lines.${i}`]; assert.equal(l.kind, 'compound'); assert.equal(l.footprint, false); assert.equal(l.parts.length, 1);
  }
  assert.ok(!v1['baseball.main'].footprint || !('r' in v1['baseball.main'].footprint), 'the sand lot is walkable');
  const p = v2['baseball.players'];
  assert.deepEqual([p.kind, p.n, p.accessory, p.home.kind, p.home.rescue], ['roster', 2, 'cap', 'stand', true]);
  assert.deepEqual(p.shirt, [0xffffff, 0x3f5a8a]);
  for (const n of [3, 4, 5, 6]) {
    const v = baseball.view(lv({ baseball: n }), {});
    assert.equal(v['baseball.lines.0'], undefined); assert.deepEqual(v['baseball.main'].footprint, { w: 2.3, d: 1.9 });
    assert.equal(v['baseball.players'].kind, 'roster');
  }
  for (const [n, k] of [[4, 4], [5, 6], [6, 6]]) {
    const c = baseball.view(lv({ baseball: n }), {})['baseball.crowd'];
    assert.deepEqual([c.kind, c.n, c.home.kind, c.home.spots.length, c.home.fidget, c.home.rescue], ['roster', k, 'stand', k, 'jump', true]);
    assert.ok(Array.isArray(c.shirt));
  }
  assert.equal(baseball.view(lv({ baseball: 3 }), {})['baseball.crowd'], undefined);
  assert.ok(baseball.script?.placed && [2, 3, 4, 5, 6].every(n => baseball.script.grow[n]) && baseball.script.fx && baseball.script.rep);
});

const KEYS = ['baseball.players', 'baseball.crowd', 'chip.worker', 'bulb.electrician', 'boba.queue', 'landmarks.islanders'];
const isBall = to => e => e.kind === 'grow' && e.item === 'baseball' && e.to === to;
// 照 order（放完再長 CLOSING_TURNS 回合）瞬間演到 pred 命中的那個事件，單獨 live 演（whole：整回合 live）
async function liveAt({ run, bubblesLog }, order, pred, { whole = false } = {}) {
  let s = engine.createState(spec);
  const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  for (const step of steps) {
    const r = step(s); s = r.state;
    if (whole && r.events.some(pred)) { const n = bubblesLog.length; return { events: r.events, secs: await run([...r.events, { kind: 'settle' }]), n }; }
    for (const e of r.events) {
      if (!whole && pred(e)) { const n = bubblesLog.length; return { e, secs: await run([e]), n }; }
      await run([e], { instant: true });
    }
    await run([{ kind: 'settle' }], { instant: true });
  }
  throw new Error('event not found');
}
// 下限因 §13.2 降低：閃白 0.15 s（原白光 0.5）、spawn 不佔時間；入口走進場（計畫 3.8 後面的工作）會再拉長
const RANGE = { 1: [4, 9], 2: [2, 8], 3: [5, 12], 4: [6, 15], 5: [4, 10], 6: [4, 10] };
function checkBall({ show, bubblesLog }, e, secs, n) {
  const lvl = e.kind === 'grow' ? e.to : 1, what = `${e.kind} ${lvl}`, [lo, hi] = RANGE[lvl];
  assert.ok(secs >= lo && secs <= hi, `${what} took ${secs.toFixed(1)}s (want ${lo}–${hi})`);
  if (e.kind === 'grow') {
    const last = bubblesLog.slice(n).at(-1), h = show.stage.headOf('baseball');
    assert.equal(last?.text, 'LEVEL UP', what); assert.ok(Math.hypot(last.at.x - h.x, last.at.y - h.y, last.at.z - h.z) < 0.3, `${what} LEVEL UP over baseball`);
  }
  for (const k of KEYS) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', `${what} ${k}`);
  const v = baseball.view(show.stage.lv, show.stage.flags);
  assert.equal(show.roster.members('baseball.players').length, v['baseball.players']?.n ?? 0, `${what} players`);
  assert.equal(show.roster.members('baseball.crowd').length, v['baseball.crowd']?.n ?? 0, `${what} crowd`);
}
test('scripts: every baseball level in both solutions plays in range, ends with LEVEL UP on baseball, everyone home', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show, run, bubblesLog } = h;
    let n = 0;
    const tracked = (evs, opts) => { if (!opts?.instant) n = bubblesLog.length; return run(evs, opts); };
    const seen = new Set();
    await playItem(show, tracked, order, 'baseball', (e, secs) => { seen.add(e.kind === 'grow' ? e.to : 1); checkBall(h, e, secs, n); });
    assert.ok([1, 2, 3, 4].every(l => seen.has(l)), `baseball events seen: ${[...seen]}`);
    // Lv5、Lv6 落在倒數回合（蒙太奇），playItem 演不到，自己演
    for (const to of [5, 6].filter(t => !seen.has(t))) {
      show.reset();
      const { e, secs, n: before } = await liveAt(h, order, isBall(to));
      checkBall(h, e, secs, before);
    }
  }
});
test('placed: an islander walks to home plate and round the four bases; each base line appears as he runs its leg', async () => {
  const h = await headlessShow(), { show } = h, update = show.update, visits = [], shown = [];
  let runner = null;
  show.update = (dt, t) => {
    update(dt, t);
    for (let i = 0; i < 4; i++) { const o = show.stage.partObject(`baseball.lines.${i}`); if (o?.visible && shown[i] === undefined) shown[i] = t; }
    const m = runner ?? show.roster.members('landmarks.islanders').find(x => x.mode !== 'home');
    if (m && m.mode !== 'home') { runner = m; BASES.forEach((b, i) => { if (near(m.pos, b, 0.15) && visits.at(-1) !== i) visits.push(i); }); }
  };
  await liveAt(h, SOLUTIONS[0], e => e.kind === 'placed' && e.item === 'baseball');
  // 走向本壘的路上可能先經過三壘：從第一次到本壘算起
  assert.deepEqual(visits.slice(visits.indexOf(0)), [0, 1, 2, 3, 0], `home → 1st → 2nd → 3rd → home: ${visits}`);
  assert.ok(shown.length === 4 && shown.every((t, i) => i === 0 || t > shown[i - 1] + 0.3), `lines appear one by one: ${shown}`);
  assert.equal(runner.mode, 'home');
});
test('Lv2: two players come down from the stands onto the field', async () => {
  const h = await headlessShow(), { show } = h, update = show.update, firsts = new Map();
  show.update = (dt, t) => { update(dt, t); for (const m of show.roster.members('baseball.players')) if (!firsts.has(m)) firsts.set(m, { ...m.pos }); };
  await liveAt(h, SOLUTIONS[0], isBall(2));
  assert.equal(firsts.size, 2);
  for (const p of firsts.values()) assert.ok(p.z < AT.z - 0.8, 'spawned at the stands');
  const spots = baseball.view(show.stage.lv, show.stage.flags)['baseball.players'].home.spots;
  show.roster.members("baseball.players").forEach((m, i) => assert.ok(near(m.pos, spots[i], 0.15), `player ${i} on the field ${JSON.stringify([m.pos, spots[i], show.nav.walkable(spots[i].x, spots[i].z)])}`));
});
test('Lv3: a player …… and the dome icon; the 101 worker (or an islander) walks over and knocks', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show, bubblesLog } = h, setPose = show.roster.setPose, walked = new Set();
    show.roster.setPose = (m, p) => { if (p.walking && m.mode === 'script') walked.add(m.key); return setPose(m, p); };
    const { n } = await liveAt(h, order, isBall(3));
    const kinds = bubblesLog.slice(n).map(b => b.kind ?? b.text);
    assert.ok(kinds.indexOf('……') >= 0 && kinds.findIndex(k => k?.icon === 'dome') > kinds.indexOf('……'));
    assert.ok(walked.has(show.roster.members('chip.worker').length ? 'chip.worker' : 'landmarks.islanders'), `the worker (or an islander) walks over: ${[...walked]}`);
    assert.ok(show.stage.partObject('baseball.main'));
  }
});
test('Lv3+: the dome footprint leaves the players, the fans and the gate walkable', async () => {
  const h = await headlessShow(), { show } = h;
  await liveAt(h, SOLUTIONS[0], isBall(4));
  const v = baseball.view(show.stage.lv, show.stage.flags);
  for (const p of [...v['baseball.players'].home.spots, ...v['baseball.crowd'].home.spots, offset(AT, 0, 1.1)]) assert.ok(show.nav.walkable(p.x, p.z), `${p.x.toFixed(2)},${p.z.toFixed(2)} walkable`);
  assert.ok(!show.nav.walkable(AT.x, AT.z), 'the dome blocks');
});
test('Lv4: four fans spawn at the station during the train stop and end at their fan spots, then ♪', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h, update = show.update, firsts = new Map();
  let clock = null;   // 列車時鐘（now + rail.offset）：停站時不動
  show.update = (dt, t) => {
    update(dt, t);
    const c = t + h.rail.offset;
    for (const f of firsts.values()) if (f.stopped === undefined) f.stopped = Math.abs(c - clock) < 1e-6;   // 下車後那一幀車沒動
    for (const m of show.roster.members('baseball.crowd')) if (!firsts.has(m)) firsts.set(m, { ...m.pos });
    clock = c;
  };
  const { n } = await liveAt(h, SOLUTIONS[0], isBall(4));
  assert.equal(firsts.size, 4);
  for (const p of firsts.values()) { assert.ok(near(p, PLATFORM, 0.7), 'spawned at the platform'); assert.ok(p.stopped, 'while the train is stopped'); }
  assert.ok(bubblesLog.slice(n).filter(b => b.kind === '♪').length >= 4);
  const spots = baseball.view(show.stage.lv, show.stage.flags)['baseball.crowd'].home.spots;
  show.roster.members('baseball.crowd').forEach((m, i) => assert.ok(near(m.pos, show.nav.walkable(spots[i].x, spots[i].z) ? spots[i] : show.nav.nearestWalkable(spots[i]), 0.15), `fan ${i} at the gate`));
});
test('Lv6: the boba queue walks to the dome gate, fireworks, everyone ♪, and the tourists walk back', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h, update = show.update, closest = new Map();
  const gate = offset(AT, 0, 1.1);
  show.update = (dt, t) => { update(dt, t); for (const m of show.roster.members('boba.queue')) closest.set(m, Math.min(closest.get(m) ?? Infinity, Math.hypot(m.pos.x - gate.x, m.pos.z - gate.z))); };
  const { n } = await liveAt(h, SOLUTIONS[0], isBall(6));
  const q = show.roster.members('boba.queue');
  assert.ok(q.length >= 6);
  for (const m of q) assert.ok(closest.get(m) < 1.6, `tourist came to the gate (${closest.get(m).toFixed(2)})`);
  assert.ok(show.stage.partObject('baseball.fireworks'));
  assert.ok(bubblesLog.slice(n).filter(b => b.kind === '♪').length >= 2 + 6 + q.length);
  for (let i = 0; i < 600; i++) show.update(1 / 30, 100 + i / 30);
  const boba = await import('../src/actors/boba.js'), spots = boba.view(show.stage.lv, show.stage.flags)['boba.queue'].home.spots;
  q.forEach((m, i) => assert.ok(near(m.pos, show.nav.walkable(spots[i].x, spots[i].z) ? spots[i] : show.nav.nearestWalkable(spots[i]), 0.15), `tourist ${i} back in line`));
});
// 兩個事件以上的回合整段 live：島民、球員、工人都是演到才找
test('the Lv2 turn plays whole and live: everyone ends at home', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h;
  const { events, secs, n } = await liveAt(h, SOLUTIONS[0], isBall(2), { whole: true });
  assert.ok(events.length >= 2, 'a multi-event turn');
  assert.ok(secs > 5, `${secs.toFixed(1)} s`);
  assert.ok(bubblesLog.slice(n).some(b => b.text === 'LEVEL UP'));
  assert.equal(show.roster.members('baseball.players').length, 2);
  for (const k of show.roster.keys()) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', k);
});
