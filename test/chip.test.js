import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as chip from '../src/actors/chip.js';
import { anchorWorld } from '../src/actors/anchors.js';
import { cellAt, RING_R } from '../src/scene/hex.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { lv, worldPoints, distToCell, entryProblems, focusCell, focusTrail } from './helpers/actors.js';
import { B } from '../src/show/beats.js';
import { headlessShow, playItem, entriesThroughSolutions } from './helpers/show.js';
import { createNav } from '../src/show/nav.js';
const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);   // 兩條正解（賽博、外星）

test('chip lv1 site: fence, cones, crane, one helmeted worker', () => {
  const v = chip.view(lv({ chip: 1 }), {});
  assert.ok(v['chip.main'].parts.filter(p => p.kind === 'cone').length >= 3); assert.equal(v['chip.crane'].kind, 'crane');
  assert.equal(v['chip.worker'].accessory, 'helmet'); assert.equal(v['chip.engineers'], undefined);
});
test('chip lv2 factory smokes and sends 2 engineers in coats to 101', () => {
  const v = chip.view(lv({ chip: 2 }), {});
  assert.equal(v['chip.smoke'].kind, 'smoke'); assert.equal(v['chip.crane'], undefined);
  assert.equal(v['chip.engineers'].n, 2); assert.equal(v['chip.engineers'].accessory, 'coat'); assert.equal(v['chip.engineers'].home.path, chip.ENGINEER_ROUTE); assert.equal(v['chip.engineers'].home.loop, false);
});
test('chip lv3: four engineers on bikes; rats ≥2 turns one into a detective with a magnifier', () => {
  const v3 = chip.view(lv({ chip: 3 }), {}); assert.equal(v3['chip.engineers'].n, 4); assert.equal(v3['chip.engineers'].accessory, 'bike');
  const vr = chip.view(lv({ chip: 3, rat: 2 }), {}); assert.equal(vr['chip.engineers'].n, 3); assert.equal(vr['chip.detective'].accessory, 'glass');
  assert.equal(chip.view(lv({ chip: 2, rat: 2 }), {})['chip.detective'], undefined, 'needs chip ≥3');
});
test('lv4 headquarters is a glass dome', () => {
  assert.ok(chip.view(lv({ chip: 4 }), {})['chip.main'].parts.some(p => p.kind === 'dome' && p.color === 0x9cc3bf));
});
test('ENGINEER_ROUTE starts in the chip cell and ends at the tower foot', () => {
  const r = chip.ENGINEER_ROUTE, t = anchorWorld('tower');
  assert.deepEqual(cellAt(r[0].x, r[0].z), [1, 0]); assert.deepEqual(cellAt(r.at(-1).x, r.at(-1).z), [0, 0]);
  assert.ok(Math.hypot(r.at(-1).x - t.x, r.at(-1).z - t.z) < 1.3);
});
test('chip buildings stay inside the chip cell', () => {
  for (const n of [1, 2, 3, 4, 5]) for (const [k, s] of Object.entries(chip.view(lv({ chip: n }), {}))) if (s.kind === 'compound') for (const p of worldPoints(s)) assert.ok(distToCell(p, [1, 0]) < RING_R, `lv${n} ${k}`);
});

test('view: worker, engineers and detective are roster declarations with their own homes', () => {
  const w = chip.view(lv({ chip: 1 }), {})['chip.worker'], at = anchorWorld('chip');
  assert.deepEqual([w.kind, w.n, w.accessory, w.home.kind, w.home.r], ['roster', 1, 'helmet', 'wander', 0.9]); assert.deepEqual(w.home.at, at);
  const e2 = chip.view(lv({ chip: 2 }), {})['chip.engineers'];
  assert.deepEqual([e2.kind, e2.n, e2.accessory], ['roster', 2, 'coat']); assert.deepEqual(e2.home, { kind: 'path', path: chip.ENGINEER_ROUTE, loop: false, speed: 0.45, entry: chip.ENGINEER_ENTRY });
  const v = chip.view(lv({ chip: 3, rat: 2 }), {}), e3 = v['chip.engineers'], d = v['chip.detective'];
  assert.deepEqual([e3.n, e3.accessory, e3.home.speed], [3, 'bike', 0.8]);
  assert.deepEqual([d.kind, d.n, d.accessory, d.from], ['roster', 1, 'glass', 'chip.engineers']); assert.deepEqual(d.home, { kind: 'follow', key: 'rat.pack', dist: 0.6, entry: chip.ENGINEER_ENTRY[0] });
  assert.equal(chip.view(lv({ chip: 4 }), {})['chip.main'].footprint, undefined, 'main footprint is automatic');
  assert.ok(chip.view(lv({ chip: 1 }), {})['chip.crane'].footprint);
  assert.ok(chip.script?.placed && [2, 3, 4, 5, 6].every(n => chip.script.grow[n]));
});

const KEYS = ['chip.worker', 'chip.engineers', 'chip.detective'];
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
const isChip = to => e => e.kind === 'grow' && e.item === 'chip' && e.to === to;
function checkChip({ show, bubblesLog }, e, secs, n) {
  const what = `${e.kind} ${e.to ?? ''}`;
  // 上限 15 → 18：計畫 3.8 Task 5 入口點、鏡頭焦點（+3 s）。下限 3 → 2.5：§14.1 塔架 footprint 縮成底座後，
  // 工人從 101 工地走到廠門不再繞過塔架（路長 4.2，原 6.1–7.7）
  assert.ok(secs >= 2.5 && secs <= 18, `${what} took ${secs.toFixed(1)}s`);
  if (e.kind === 'grow') {
    const last = bubblesLog.slice(n).at(-1), h = show.stage.headOf('chip');
    assert.equal(last?.text, 'LEVEL UP', what); assert.ok(Math.hypot(last.at.x - h.x, last.at.y - h.y, last.at.z - h.z) < 0.3, `${what} LEVEL UP over chip`);
  }
  for (const k of KEYS) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', `${what} ${k}`);
}
test('scripts: every chip level in both solutions plays 2.5–18 s, ends with LEVEL UP on chip, and leaves everyone at home', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  let n = 0;
  const tracked = (evs, opts) => { if (!opts?.instant) n = bubblesLog.length; return run(evs, opts); };
  for (const order of SOLUTIONS) {
    show.reset();
    const seen = new Set();
    await playItem(show, tracked, order, 'chip', (e, secs) => { seen.add(e.kind === 'grow' ? e.to : 1); checkChip(h, e, secs, n); });
    assert.ok([1, 2, 3].every(t => seen.has(t)), `chip events seen: ${[...seen]}`);
    // playItem 碰不到的等級（落在倒數蒙太奇回合）：自己堆出前置狀態，單獨 live 演
    for (const to of [2, 3, 4, 5, 6].filter(t => !seen.has(t))) {
      show.reset();
      const { e, secs, n: before } = await liveAt(h, order, isChip(to));
      checkChip(h, e, secs, before);
    }
  }
});
test('grow 3 with rats ≥2: one engineer turns detective (glass) and says ！', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h;
  const { e, secs, n } = await liveAt(h, SOLUTIONS[0], isChip(3));
  checkChip(h, e, secs, n); assert.ok(show.stage.lv.rat >= 2);
  const [d] = show.roster.members('chip.detective'); assert.equal(d?.walker.accessory, 'glass');
  assert.equal(show.roster.members('chip.engineers').length, 3);
  assert.ok(bubblesLog.slice(n).some(b => b.kind === '！' && Math.hypot(b.at.x - d.head().x, b.at.z - d.head().z) < 2), 'detective ！');
});
test('Lv5 with a train on the ring takes ≥ 7 s (trainStop)', async () => {
  const h = await headlessShow();
  let off0 = null;
  const { e, secs, n } = await liveAt({ ...h, run: (evs, opts) => { if (!opts?.instant) off0 = h.rail.offset; return h.run(evs, opts); } }, SOLUTIONS[0], isChip(5));
  assert.ok(h.show.stage.lv.token >= 3); checkChip(h, e, secs, n);
  assert.ok(secs >= 7, `${secs.toFixed(1)} s`); assert.notEqual(h.rail.offset, off0, 'train clock moved (stopped at the station)');
});
// 審查併入（§8.2 列車進站停下 → 工程師走到站前接箱子）：敲（接箱子）的時候列車還停在站前
test('Lv5: the engineer knocks while the train is still held at the station', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show } = h, update = show.update, knocks = [];
    let last = null;
    show.update = (dt, t) => {
      const before = h.rail.offset; update(dt, t);
      const knocking = show.roster.members('chip.engineers').some(m => m.walker?.gesture?.kind === 'knock');
      if (knocking) knocks.push(h.rail.offset - before + dt);   // 停住時時鐘偏移跟時間等速倒退 → 0
      last = knocking;
    };
    await liveAt(h, order, isChip(5));
    assert.ok(knocks.length > 5, `knock frames ${knocks.length}`); assert.equal(last, false);
    // 第一幀是到站那一幀（前半還在進站），之後每一幀車都停著
    assert.ok(knocks.slice(1).every(d => Math.abs(d) < 1e-9), `train held during the knock (${order[0]}: ${knocks.map(d => d.toFixed(3)).join(' ')})`);
  }
});

// 入口點（§13.2、計畫 3.8 Task 5）：工人從 101 工地來；工程師（偵防師同一個入口）從廠門外靠橋那側來；
// 入口走得到、離每個站位 ≥ 1.5（每一級、有沒有老鼠；兩條正解每一刻的真 footprint）
test('chip rosters enter from the 101 site and from outside the factory on the bridge side, walkable and ≥ 1.5 from every spot', async () => {
  const nav = createNav(), bad = [], t = anchorWorld('tower');
  for (const n of [1, 2, 3, 4, 5, 6]) for (const rat of [0, 2]) {
    const v = chip.view(lv({ chip: n, rat }), {});
    for (const [k, d] of Object.entries(v)) if (d.kind === 'roster') assert.ok(d.home.entry, `lv${n} ${k} entry declared`);
    if (v['chip.worker']) { const w = v['chip.worker'].home.entry; assert.ok(w === chip.WORKER_ENTRY && Math.hypot(w.x - t.x, w.z - t.z) < 1.5 && String(cellAt(w.x, w.z)) === '0,0', 'worker from the 101 site'); }
    for (const e of [].concat(v['chip.engineers']?.home.entry ?? [])) { assert.deepEqual(cellAt(e.x, e.z), [1, 0]); assert.ok(e.x < anchorWorld('chip').x - 0.5, 'west of the factory (bridge side)'); }
    bad.push(...entryProblems(v, nav, `lv${n} rat ${rat}`));
  }
  bad.push(...await entriesThroughSolutions(chip, SOLUTIONS));
  assert.deepEqual(bad, []);
});

// 鏡頭（§13.1、計畫 3.8 Task 5）
const fake = kids => ({ B, roster: { members: k => (k === 'milk.kids' ? kids : []), nearest: (k, p) => (k === 'milk.kids' ? kids[0] ?? null : null) } });
// 只看 live 演的那個事件（前面瞬間演的回合也會記 focus／home）
const trailOf = async (order, to) => {
  const h = await headlessShow(); let n0 = 0;
  await liveAt({ ...h, run: (evs, opts) => { if (!opts?.instant) n0 = h.rig.log.length; return h.run(evs, opts); } }, order, isChip(to));
  return focusTrail(h.rig.log, n0);
};
test('chip 4: the first beat focuses the cell the kid sets off from, then the chip cell once he reaches the bridge', async () => {
  const s4 = { lv: lv({ chip: 4, milk: 3 }), flags: {} }, e = { kind: 'grow', item: 'chip', to: 4 };
  for (const [pos, cell] of [[{ x: -4.78, z: 1.05 }, [-1, 0]], [{ x: -3.74, z: 4.69 }, [-1, 1]]]) {
    const ctx = fake([{ pos, head: () => pos }]), beats = chip.script.grow[4](e, s4, ctx);
    assert.equal(beats[0].kind, 'focus'); assert.deepEqual(focusCell(beats[0], ctx), cell, 'where the kid is');
  }
  const ctx = fake([]), beats = chip.script.grow[4](e, s4, ctx), t = beats.find(b => b.kind === 'together');
  assert.deepEqual(focusCell(t.beats.find(b => b.kind === 'focus'), ctx), [1, 0]); assert.ok(t.beats.some(b => b.kind === 'walk'), 'pans while he walks the last leg');
  for (const order of SOLUTIONS) {
    const trail = await trailOf(order, 4);
    assert.equal(trail.length, 3, JSON.stringify(trail)); assert.ok(['-1,0', '-1,1'].includes(String(trail[0])), `starts on the kid (${trail[0]})`);
    assert.deepEqual(trail.slice(1), [[1, 0], 'home']);
  }
});
test('chip 5: the first beat focuses the station (token cell), the camera goes to 101 with the box, and back to the chip cell for LEVEL UP', async () => {
  const beats = chip.script.grow[5]({ kind: 'grow', item: 'chip', to: 5 }, { lv: lv({ chip: 5, token: 3 }), flags: {} }, fake([]));
  assert.equal(beats[0].kind, 'focus'); assert.deepEqual(focusCell(beats[0], {}), [0, 1]);
  const last = beats.at(-1); assert.equal(last.kind, 'together'); assert.deepEqual(last.beats.map(b => b.kind).sort(), ['focus', 'levelUp']); assert.deepEqual(focusCell(last.beats.find(b => b.kind === 'focus'), {}), [1, 0]);
  for (const order of SOLUTIONS) assert.deepEqual(await trailOf(order, 5), [[0, 1], [0, 0], [1, 0], 'home'], order.join('>'));
});
