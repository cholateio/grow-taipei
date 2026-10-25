import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import { enumerate, stats } from '../src/solver/run.js';
import * as milk from '../src/actors/milk.js';
import { anchorWorld } from '../src/actors/anchors.js';
import { RING_R } from '../src/scene/hex.js';
import { ROOFS, roofColor } from '../src/actors/palette.js';
import { lv, worldPoints, distToCell } from './helpers/actors.js';
import { headlessShow, playItem } from './helpers/show.js';
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
test('scripts: every milk event in both solutions plays 3–15 s, ends with LEVEL UP on milk, and leaves the kids at home', async () => {
  const { show, run, bubblesLog } = await headlessShow();
  for (const order of SOLUTIONS) {
    show.reset();
    const seen = [];
    await playItem(show, run, order, 'milk', (e, secs) => {
      seen.push(e.kind === 'grow' ? e.to : 1);
      assert.ok(secs >= 3 && secs <= 15, `${e.kind} ${e.to ?? ''} took ${secs}s`);
      if (e.kind === 'grow') assert.equal(bubblesLog.at(-1).text, 'LEVEL UP');
      for (const m of show.roster.members('milk.kids')) assert.equal(m.mode, 'home');
    });
    assert.ok(seen.length >= 3, `milk events seen: ${seen}`);
  }
});
