import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import * as milk from '../src/actors/milk.js';
import { anchorWorld } from '../src/actors/anchors.js';
import { RING_R, cellAt } from '../src/scene/hex.js';
import { ROOFS, roofColor } from '../src/actors/palette.js';
import { lv, worldPoints, distToCell, entryProblems, focusCell, focusTrail } from './helpers/actors.js';
import { B } from '../src/show/beats.js';
import { headlessShow, playItem, entriesThroughSolutions } from './helpers/show.js';
import { createNav } from '../src/show/nav.js';
const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);   // 兩條正解（賽博、外星）

test('roofColor cycles coral → navy → yellow after the typhoon rebuild', () => {
  assert.deepEqual(ROOFS, [0xdb6a41, 0x3f5a8a, 0xfcea8b]);
  assert.equal(roofColor(0xdb6a41, false), 0xdb6a41); assert.equal(roofColor(0xdb6a41, true), 0x3f5a8a); assert.equal(roofColor(0xfcea8b, true), 0xdb6a41);
});
test('milk climbs one storey a level: 1 crate, 2 one-storey school + 3 kids, 3 two storeys + tall kids, 4 three storeys + flag', () => {
  assert.deepEqual(Object.keys(milk.view(lv({ milk: 1 }), {})), ['milk.crate']);
  const windows = n => milk.view(lv({ milk: n }), {})['milk.main'].parts.filter(p => p.win).length;
  assert.equal(windows(2), 4); assert.equal(windows(3), 8); assert.equal(windows(4), 12);
  assert.equal(milk.view(lv({ milk: 2 }), {})['milk.kids'].n, 3); assert.equal(milk.view(lv({ milk: 3 }), {})['milk.kids'].scale, 1.3);
  assert.ok(milk.view(lv({ milk: 4 }), {})['milk.flag'], 'flag goes up at Lv4'); assert.equal(milk.view(lv({ milk: 3 }), {})['milk.flag'], undefined);
});
test('lv5 clock tower and caps; lv6 university with an arch gate and mortarboards', () => {
  const v5 = milk.view(lv({ milk: 5 }), {}), v6 = milk.view(lv({ milk: 6 }), {});
  assert.ok(v5['milk.main'].parts.some(p => p.glow), 'clock face'); assert.equal(v5['milk.kids'].accessory, 'cap');
  assert.equal(v6['milk.gate'].kind, 'compound', 'arch gate'); assert.equal(v6['milk.kids'].accessory, 'mortar');
  assert.equal(v5['milk.gate'], undefined);
});
test('knocking milk back from 6 removes the university and its graduates (review focus 3)', async () => {
  const { show, people, run } = await headlessShow({ modules: [milk] });
  await run([{ kind: 'placed', item: 'milk', to: 1 }, ...[2, 3, 4, 5, 6].map(n => ({ kind: 'grow', item: 'milk', from: n - 1, to: n, via: [] }))], { instant: true });
  assert.ok(people.walkers.length === 3 && people.walkers.every(w => w.accessory === 'mortar'));
  await run([{ kind: 'fx', item: 'milk', cause: 'rat', delta: { target: 'milk', from: 6, to: 5 } }, { kind: 'settle' }], { instant: true });
  assert.ok(!show.stage.partKeys().includes('milk.gate'));
  assert.equal(people.walkers.length, 0, 'the bite turn: kids shelter in the school');
  await run([{ kind: 'wait', waits: [] }, { kind: 'settle' }], { instant: true });
  assert.ok(people.walkers.length === 3 && people.walkers.every(w => w.accessory === 'cap'), 'next turn: back out in caps');
});
test('the rat-bite turn or the typhoon landing send the kids home and light the windows; the turn after they come back', () => {
  for (const [extra, meta] of [[{}, { bitten: true }], [{ typhoon: 2 }, { landing: true }]]) {
    const v = milk.view(lv({ milk: 3, ...extra }), {}, meta);
    assert.equal(v['milk.kids'], undefined, JSON.stringify(meta)); assert.ok(v['milk.main'].parts.some(p => p.glow === 0xffc777));
  }
  assert.ok(milk.view(lv({ milk: 3, typhoon: 3 }), {})['milk.kids'], 'back out after the storm');
  assert.ok(milk.view(lv({ milk: 3, rat: 4 }), {}, { bitten: false })['milk.kids'], 'a rat nest alone does not keep them in');
});
// 錄影審查：颱風被大巨蛋卡在 Lv2 的後續回合，小孩不能整場消失（只在登陸那回合躲）
test('milk kids stay out after the landing turn while the typhoon lingers', () => {
  assert.ok(milk.view(lv({ milk: 3, typhoon: 2 }), {}, { landing: false })['milk.kids']);
  assert.ok(milk.view(lv({ milk: 3, typhoon: 2 }), {})['milk.kids'], 'no meta = not landing');
});
test('milk 5 with a ballfield relocates the kids next to the dome (little league)', () => {
  const v = milk.view(lv({ milk: 5, baseball: 2 }), {}), b = anchorWorld('baseball');
  const c = v['milk.kids'].home.at;
  assert.ok(Math.hypot(c.x - b.x, c.z - b.z) < 2.5); assert.ok(Math.hypot(c.x - b.x, c.z - (b.z + 1.05)) > 0.9, 'off the gate where players and fans stand');
});
test('typhoon Lv3 swaps the school roof colour', () => {
  const roof = v => v['milk.main'].parts.find(p => p.kind === 'hip').color;
  assert.notEqual(roof(milk.view(lv({ milk: 2 }), {})), roof(milk.view(lv({ milk: 2, typhoon: 3 }), {})));
});
test('milk 2→1 removes the kids and frees walkers (review focus 3)', async () => {
  const { people, run } = await headlessShow({ modules: [milk] });
  await run([{ kind: 'placed', item: 'milk', to: 1 }, { kind: 'grow', item: 'milk', from: 1, to: 2 }], { instant: true });
  assert.equal(people.walkers.length, 3);
  await run([{ kind: 'fx', item: 'milk', cause: 'rat', delta: { target: 'milk', from: 2, to: 1 } }], { instant: true });
  assert.equal(people.walkers.length, 0);
});
test('every milk part stays inside the milk cell', () => {
  for (const n of [1, 2, 3, 4, 5, 6]) for (const s of Object.values(milk.view(lv({ milk: n }), {}))) for (const p of worldPoints(s)) assert.ok(distToCell(p, [-1, 0]) < RING_R, `lv${n}`);
});

test('view: kids are a roster declaration; crate and flag are separate parts; school footprint excludes the playground', () => {
  const v = milk.view(lv({ milk: 4 }), {});
  assert.equal(v['milk.kids'].kind, 'roster'); assert.equal(v['milk.kids'].n, 3); assert.equal(v['milk.kids'].home.kind, 'wander');
  assert.ok(v['milk.crate'] && v['milk.flag']); assert.deepEqual(v['milk.crate'].footprint, { r: 0.3 }); assert.equal(v['milk.flag'].footprint, false);
  assert.deepEqual(milk.CRATE, v['milk.crate'].at);
  assert.ok(v['milk.main'].footprint.d <= 0.9); assert.equal(v['milk.gate'], undefined);
  assert.equal(milk.view(lv({ milk: 6 }), {})['milk.gate'].footprint, false);
});
test('scripts: every milk event in both solutions plays 2.5–18 s, ends with LEVEL UP on milk, and leaves the kids at home', async () => {
  const { show, run, bubblesLog } = await headlessShow();
  for (const order of SOLUTIONS) {
    show.reset();
    const seen = [];
    await playItem(show, run, order, 'milk', (e, secs) => {
      seen.push(e.kind === 'grow' ? e.to : 1);
      assert.ok(secs >= 2.5 && secs <= 18, `${e.kind} ${e.to ?? ''} took ${secs}s`);   // 下限因 §13.2 閃白變短而降低（原 3）；上限 15 → 18：計畫 3.8 Task 5 入口點、鏡頭焦點（+3 s）
      if (e.kind === 'grow') assert.equal(bubblesLog.at(-1).text, 'LEVEL UP');
      for (const m of show.roster.members('milk.kids')) assert.equal(m.mode, 'home');
    });
    assert.ok(seen.length >= 3, `milk events seen: ${seen}`);
  }
});

// Lv6 只在倒數蒙太奇回合長出來（playItem 演不到）：用引擎把正解瞬間演到鮮奶 grow 6 之前（鮮奶 5、晶片 ≥3），再單獨 live 演這一級
test('milk 6 live: the university plays 3–18 s, LEVEL UP over milk is the last new bubble, kids end at home in mortarboards', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  const isSix = e => e.kind === 'grow' && e.item === 'milk' && e.to === 6;
  for (const order of SOLUTIONS) {
    show.reset();
    let s = engine.createState(spec), e6 = null;
    const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
    for (const step of steps) {
      const r = step(s); s = r.state;
      for (const e of r.events) { if (isSix(e)) { e6 = e; break; } await run([e], { instant: true }); }
      if (e6) break;
      await run([{ kind: 'settle' }], { instant: true });
    }
    assert.ok(e6, 'milk grows to 6');
    assert.equal(show.stage.lv.milk, 5); assert.ok(show.stage.lv.chip >= 3, `chip ${show.stage.lv.chip}`);
    const n = bubblesLog.length, secs = await run([e6]);
    assert.ok(secs >= 3 && secs <= 18, `grow 6 took ${secs.toFixed(1)}s`);   // 上限 15 → 18：計畫 3.8 Task 5（工程師從園區橋頭出發，+3 s）
    const last = bubblesLog.slice(n).at(-1), head = show.stage.headOf('milk');
    assert.equal(last?.text, 'LEVEL UP');
    assert.ok(Math.hypot(last.at.x - head.x, last.at.y - head.y, last.at.z - head.z) < 0.3, 'LEVEL UP over milk');
    const kids = show.roster.members('milk.kids');
    assert.equal(kids.length, 3);
    for (const m of kids) { assert.equal(m.mode, 'home'); assert.equal(m.walker.accessory, 'mortar'); }
  }
});

// 入口點（§13.2、計畫 3.8 Task 5）：小學生從校門外靠中心格那側的邊上走進來；入口走得到、離每個站位 ≥ 1.5（每一級、有沒有少棒隊；兩條正解每一刻的真 footprint）
test('milk.kids enter from the gate edge toward the centre cell, walkable and ≥ 1.5 from every spot at every level', async () => {
  const nav = createNav(), bad = [];
  for (const n of [1, 2, 3, 4, 5, 6]) for (const baseball of [0, 2]) {
    const v = milk.view(lv({ milk: n, baseball }), {});
    if (v['milk.kids']) { assert.ok(v['milk.kids'].home.entry, `lv${n} entry declared`); assert.deepEqual(cellAt(v['milk.kids'].home.entry.x, v['milk.kids'].home.entry.z), [-1, 0]); assert.ok(v['milk.kids'].home.entry.x > anchorWorld('milk').x + 1.5, 'east side (toward the centre cell)'); }
    bad.push(...entryProblems(v, nav, `lv${n} baseball ${baseball}`));
  }
  bad.push(...await entriesThroughSolutions(milk, SOLUTIONS));
  assert.deepEqual(bad, []);
});

// 鏡頭（§13.1、計畫 3.8 Task 5）：照 order 瞬間演到 pred 那個事件，單獨 live 演；回傳這個事件的鏡頭軌跡（格子…、'home'）
async function trailAt(h, order, pred) {
  let s = engine.createState(spec);
  const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  for (const step of steps) {
    const r = step(s); s = r.state;
    for (const e of r.events) {
      if (pred(e)) { const n0 = h.rig.log.length; await h.run([e]); return focusTrail(h.rig.log, n0); }
      await h.run([e], { instant: true });
    }
    await h.run([{ kind: 'settle' }], { instant: true });
  }
  throw new Error('event not found');
}
const isMilk = to => e => e.kind === 'grow' && e.item === 'milk' && e.to === to;
const fakeCtx = { B, roster: { members: () => [], nearest: () => null } };
test('milk 5 with a little league: the camera follows the kids to the dome cell, then comes back to the school for the clock tower', async () => {
  const s5 = { lv: lv({ milk: 5, baseball: 2 }), flags: {} }, flat = bs => bs.flatMap(b => (b.kind === 'together' ? flat(b.beats) : [b]));
  const beats = milk.script.grow[5]({ kind: 'grow', item: 'milk', to: 5 }, s5, fakeCtx);
  assert.notEqual(beats[0].kind, 'focus', 'starts on the milk cell (the turn pans there)');
  assert.deepEqual(flat(beats).filter(b => b.kind === 'focus').map(b => focusCell(b, fakeCtx)), [[-1, 1], [-1, 0]]);
  assert.ok(beats.some(b => b.kind === 'together' && b.beats.some(x => x.kind === 'focus') && b.beats.some(x => x.kind === 'walk')), 'pans while they walk');
  const noLeague = milk.script.grow[5]({ kind: 'grow', item: 'milk', to: 5 }, { lv: lv({ milk: 5 }), flags: {} }, fakeCtx);
  assert.equal(flat(noLeague).filter(b => b.kind === 'focus').length, 0, 'no little league: they stay on the playground');
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), trail = await trailAt(h, order, isMilk(5));
    assert.deepEqual(trail, [[-1, 0], [-1, 1], [-1, 0], 'home'], order.join('>'));
  }
});
test('milk 6: the first beat focuses the chip cell (the engineer sets off), then the milk cell while he walks in', async () => {
  const beats = milk.script.grow[6]({ kind: 'grow', item: 'milk', to: 6 }, { lv: lv({ milk: 6, chip: 3 }), flags: {} }, fakeCtx);
  assert.equal(beats[0].kind, 'focus'); assert.deepEqual(focusCell(beats[0], fakeCtx), [1, 0]);
  const t = beats.find(b => b.kind === 'together' && b.beats.some(x => x.kind === 'focus'));
  assert.deepEqual(focusCell(t.beats.find(x => x.kind === 'focus'), fakeCtx), [-1, 0]); assert.ok(t.beats.some(x => x.kind === 'walk'));
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), trail = await trailAt(h, order, isMilk(6));
    assert.deepEqual(trail, [[1, 0], [-1, 0], 'home'], order.join('>'));
  }
});
