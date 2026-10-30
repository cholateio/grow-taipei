import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import * as milk from '../src/actors/milk.js';
import * as landmarks from '../src/actors/landmarks.js';
import { anchorWorld } from '../src/actors/anchors.js';
import { RING_R, cellAt, axialToWorld } from '../src/scene/hex.js';
import { existsSync } from 'node:fs';
import { ROOFS, roofColor, C } from '../src/actors/palette.js';
import { diffParts } from '../src/actors/stage.js';
import { lv, worldPoints, distToCell, entryProblems, focusTrail } from './helpers/actors.js';
import { B } from '../src/show/beats.js';
import { headlessShow, playItem, entriesThroughSolutions, solo, SCRIPT_MAX, KEY_MAX } from './helpers/show.js';
import { createNav } from '../src/show/nav.js';
const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);   // 兩條正解（賽博、外星）

// 鏡頭（§13.1、計畫 3.8 Task 5）：照 order 瞬間演到 pred 那個事件，單獨 live 演；回傳這個事件的鏡頭軌跡（格子…、'home'）
async function trailAt(h, order, pred) {
  let s = engine.createState(spec);
  const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  for (const step of steps) {
    const r = step(s); s = r.state;
    for (const e of r.events) {
      if (pred(e)) { const n0 = h.rig.log.length; await h.run([solo(e)]); return focusTrail(h.rig.log, n0); }
      await h.run([e], { instant: true });
    }
    await h.run([{ kind: 'settle' }], { instant: true });
  }
  throw new Error('event not found');
}
const isMilk = to => e => e.kind === 'grow' && e.item === 'milk' && e.to === to;
const fakeCtx = { B, roster: { members: () => [], nearest: () => null } };

test('roofColor cycles coral → navy → yellow after the typhoon rebuild', () => {
  assert.deepEqual(ROOFS, [0xdb6a41, 0x3f5a8a, 0xfcea8b]);
  assert.equal(roofColor(0xdb6a41, false), 0xdb6a41); assert.equal(roofColor(0xdb6a41, true), 0x3f5a8a); assert.equal(roofColor(0xfcea8b, true), 0xdb6a41);
});
const views = Array.from({ length: 11 }, (_, n) => milk.view(lv({ milk: n }), {}));
const nonRoster = v => Object.fromEntries(Object.entries(v).filter(([, p]) => p.kind !== 'roster'));
// 一個零件的 draw call：compound = 黏土一個 + 每種發光色一個；glb = 1（有 glow 再 +1）；campus = 每棟 glb 各算；名冊（共用的小人）不算
function drawCalls(v) {
  const glb = m => 1 + (m.glow ? 1 : 0);
  return Object.values(v).reduce((t, p) => t + (p.kind === 'compound' ? 1 + new Set(p.parts.filter(x => x.glow).map(x => x.glow)).size
    : p.kind === 'campus' ? p.models.reduce((a, m) => a + glb(m), 0) : p.kind === 'glb' ? glb(p) : 0), 0);
}
const PALETTE = new Set(Object.values(C));

test('milk view has a distinct main part at every level 1–10 (part spec differs between consecutive levels)', () => {
  assert.deepEqual(Object.keys(views[1]), ['milk.crate']);
  for (let n = 2; n <= 10; n++) {
    const { add } = diffParts(nonRoster(views[n - 1]), nonRoster(views[n]));
    assert.ok(add.length, `lv${n}: something new in view`);
    assert.ok(views[n]['milk.main'], `lv${n} main`);
    if (n <= 8) assert.notEqual(JSON.stringify(views[n]['milk.main']), JSON.stringify(views[n - 1]['milk.main']), `lv${n} main changes`);
  }
  // 2026-10-28 錄影修正：不再有旗子（政治敏感）——Lv5 操場多一座籃球架（院子裡的籃框 torus），沒有 milk.flag 零件
  const hoop = n => views[n]['milk.yard'].parts.some(p => p.kind === 'torus');
  assert.ok(hoop(5) && !hoop(4), 'basketball hoop on the playground at Lv5');
  for (let n = 1; n <= 10; n++) assert.ok(!views[n]['milk.flag'] && Object.values(views[n]).every(p => !(p.parts ?? []).some(x => x.flag)), `lv${n}: no flag parts`);
  assert.ok(views[6]['milk.tower'] && !views[5]['milk.tower'], 'clock tower at Lv6');
  assert.ok(views[7]['milk.gate'] && !views[6]['milk.gate'], 'arch gate at Lv7');
  assert.ok(views[8]['milk.gate'].parts.length > views[7]['milk.gate'].parts.length, 'YouBike stand at Lv8');
  assert.ok(views[9]['milk.hats'] && !views[8]['milk.hats'], 'mortarboards on the playground at Lv9');
  assert.ok(views[10]['milk.truck'] && views[10]['milk.boat'] && !views[9]['milk.truck'], 'milk truck and boat at Lv10');
});
test('milk Lv3/7/8 use the school / university / research glb models with the palette tint', () => {
  const models = n => views[n]['milk.main'].models, paths = n => models(n).map(m => m.path);
  for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    assert.equal(views[n]['milk.main'].kind, 'campus');
    for (const m of models(n)) {
      assert.ok(m.path.endsWith('.glb') && m.tint, `lv${n} ${m.path}`);
      for (const c of Object.values(m.tint)) assert.ok(PALETTE.has(c), `lv${n} ${m.path} tint ${c.toString(16)} is in the palette`);
    }
  }
  assert.deepEqual(paths(2), [milk.MODELS.shop.path]);
  assert.deepEqual(paths(3), [milk.MODELS.wing.path], 'school: one Kenney commercial building');
  assert.deepEqual(paths(7), [milk.MODELS.wing.path, milk.MODELS.wing.path], 'university: two wings');
  assert.ok(paths(8).includes(milk.MODELS.lab.path), 'research building');
  for (const p of [...paths(3), ...paths(7), ...paths(8)]) assert.ok(existsSync(new URL(`../assets/${p}`, import.meta.url)), p);
  // 三代輪廓明顯不同：小學窄矮、大學拉長（寬 ≥ 1.8 倍）、研究大樓最高
  const width = n => { const f = views[n]['milk.main'].footprint; return Math.max(...f.map(r => r.x + r.w / 2)) - Math.min(...f.map(r => r.x - r.w / 2)); };
  const tallest = n => Math.max(...models(n).map(m => m.h));
  assert.ok(width(7) >= 1.8 * width(3), `university ${width(7).toFixed(2)} vs school ${width(3).toFixed(2)}`);
  assert.ok(tallest(8) >= 1.8 * tallest(7) && tallest(7) <= 1.1 * tallest(3), 'the research building towers over the low wings');
});
test('milk kids count: 3 from Lv3; Lv10 adds three festival kids on the milk, chip and spring cells (milk.extraKids, R16)', async () => {
  assert.equal(views[2]['milk.kids'], undefined, 'Lv2 breakfast shop: no kids yet');
  for (let n = 3; n <= 10; n++) { assert.equal(views[n]['milk.kids'].n, 3, `lv${n}`); assert.equal(views[n]['milk.kids'].scale, undefined, `lv${n} kids are person-sized`); }
    assert.deepEqual([3, 4, 5, 6, 7, 8, 9, 10].map(n => views[n]['milk.kids'].accessory), ['none', 'none', 'none', 'cap', 'mortar', 'coat', 'none', 'none']);
  for (let n = 3; n <= 9; n++) assert.equal(views[n]['milk.extraKids'], undefined);
  const x = views[10]['milk.extraKids'], cells = x.home.at.map(p => cellAt(p.x, p.z).join(','));
  assert.equal(x.kind, 'roster'); assert.equal(x.home.kind, 'wander'); assert.equal(x.n, x.home.at.length);
  assert.equal(x.n, 3); assert.deepEqual(x.home.at, milk.FESTIVAL_HOMES);
  // 鮮奶格、晶片格照島民的散步半徑；溫泉格的圈小一點、避開變異鼠（Task 6a）
  assert.deepEqual(x.home.r, [...Array(2).fill(landmarks.view()['landmarks.islanders'].home.r), 1.0], 'the islanders\' wander radius (spring cell 1.0)');
  assert.deepEqual(cells, ['-1,0', '1,0', '1,-1'], 'one kid each on the milk, chip and spring cells');
  // 鮮奶格、晶片格在格心；溫泉格往西北移 (−0.4, −1.0)，散步圈的邊離變異鼠的站位 ≥ 1.0（Task 6a）
  const { MUTANT } = await import('../src/actors/rat.js');
  x.home.at.forEach((p, k) => {
    const c = cellAt(p.x, p.z), w = axialToWorld(...c), [dx, dz] = k === 2 ? [-0.4, -1.0] : [0, 0];
    assert.ok(Math.hypot(p.x - w.x - dx, p.z - w.z - dz) < 1e-9, `home ${k} at the cell centre + (${dx}, ${dz})`);
  });
  assert.ok(Math.hypot(x.home.at[2].x - MUTANT.x, x.home.at[2].z - MUTANT.z) - x.home.r[2] >= 1.0, 'the spring kid keeps clear of the mutant rat');
  assert.equal(milk.view(lv({ milk: 10 }), {}, { bitten: true })['milk.extraKids'], undefined, 'the festival kids hide on the bite turn too');
});
test('milk draw calls stay ≤ 12 for the whole cell at every level (glb parts merged; lit windows included)', () => {
  for (let n = 1; n <= 10; n++) for (const meta of [{}, { bitten: true }]) {
    const v = milk.view(lv({ milk: n, baseball: 2 }), {}, meta);
    assert.ok(drawCalls(v) <= 12, `lv${n} ${JSON.stringify(meta)}: ${drawCalls(v)}`);
  }
});
test('the rat-bite turn sends the kids home and lights the windows; the turn after they come back', () => {
  const v = milk.view(lv({ milk: 3 }), {}, { bitten: true });
  assert.equal(v['milk.kids'], undefined); assert.ok(v['milk.main'].models.every(m => Object.values(m.glow ?? {}).includes(C.warm)));
  assert.ok(views[3]['milk.main'].models.every(m => !m.glow), 'windows dark while the kids are out');
  assert.ok(milk.view(lv({ milk: 3, typhoon: 3 }), {})['milk.kids'], 'back out after the storm');
  assert.ok(milk.view(lv({ milk: 3, rat: 4 }), {}, { bitten: false })['milk.kids'], 'a rat nest alone does not keep them in');
});
// 唯一正解修正輪 1：颱風不讓小孩整回合躲在家（躲雨是颱風放下劇本裡的一小段，小孩跟大家一樣躲一下又出來）
test('milk kids stay out at every typhoon level (the shelter is a gag inside the typhoon placed script, not a turn state)', () => {
  for (const typhoon of [1, 2, 3, 4]) assert.ok(milk.view(lv({ milk: 3, typhoon }), {}, {})['milk.kids'], `typhoon ${typhoon}`);
});
test('milk 6 with a ballfield relocates the kids next to the dome (little league); the university brings them back', () => {
  const v = milk.view(lv({ milk: 6, baseball: 2 }), {}), b = anchorWorld('baseball');
  const c = v['milk.kids'].home.at;
  assert.ok(Math.hypot(c.x - b.x, c.z - b.z) < 2.5); assert.ok(Math.hypot(c.x - b.x, c.z - (b.z + 1.05)) > 0.9, 'off the gate where players and fans stand');
  for (const n of [5, 7]) assert.deepEqual(cellAt(milk.view(lv({ milk: n, baseball: 2 }), {})['milk.kids'].home.at.x, milk.view(lv({ milk: n, baseball: 2 }), {})['milk.kids'].home.at.z), [-1, 0], `lv${n} on campus`);
});
test('typhoon Lv4 (clear sky, 唯一正解 §4.3) swaps the school trim (roof) colour; the storm stops (Lv1–3) do not', () => {
  const trim = v => v['milk.main'].models[0].tint['^#[5-8][0-9a-f][5-8]'];
  assert.equal(trim(views[3]), C.coral);
  assert.equal(trim(views[3]), trim(milk.view(lv({ milk: 3, typhoon: 3 }), {})));
  assert.notEqual(trim(views[3]), trim(milk.view(lv({ milk: 3, typhoon: 4 }), {})));
});
test('milk 3→2 removes the kids and frees walkers (review focus 3)', async () => {
  const { people, run } = await headlessShow({ modules: [milk] });
  await run([{ kind: 'placed', item: 'milk', to: 1 }, { kind: 'grow', item: 'milk', from: 1, to: 2 }, { kind: 'grow', item: 'milk', from: 2, to: 3 }], { instant: true });
  assert.equal(people.walkers.length, 3);
  await run([{ kind: 'fx', item: 'milk', cause: 'typhoon', delta: { target: 'milk', from: 3, to: 2 } }], { instant: true });
  assert.equal(people.walkers.length, 0);
});
test('knocking milk back from 7 removes the arch gate; the graduates go back to caps', async () => {
  const { show, people, run } = await headlessShow({ modules: [milk] });
  await run([{ kind: 'placed', item: 'milk', to: 1 }, ...[2, 3, 4, 5, 6, 7].map(n => ({ kind: 'grow', item: 'milk', from: n - 1, to: n, via: [] }))], { instant: true });
  assert.ok(people.walkers.length === 3 && people.walkers.every(w => w.accessory === 'mortar'));
  await run([{ kind: 'fx', item: 'milk', cause: 'typhoon', delta: { target: 'milk', from: 7, to: 6 } }, { kind: 'settle' }], { instant: true });
  assert.ok(!show.stage.partKeys().includes('milk.gate'));
  assert.ok(people.walkers.length === 3 && people.walkers.every(w => w.accessory === 'cap'));
});
test('every milk part and footprint corner stays inside the milk cell (the festival boat is moored on the water just west of it)', () => {
  const c = axialToWorld(-1, 0);
  for (let n = 1; n <= 10; n++) for (const [key, s] of Object.entries(views[n])) {
    if (key === 'milk.extraKids') continue;
    // footprint：框的四個角、圓的四個極點都在鮮奶格裡
    for (const f of [].concat(s.footprint || [])) {
      const cx = s.at.x + (f.x ?? 0), cz = s.at.z + (f.z ?? 0), [hx, hz] = f.r != null ? [f.r, f.r] : [f.w / 2, f.d / 2];
      const corners = f.r != null ? [[hx, 0], [-hx, 0], [0, hz], [0, -hz]] : [[hx, hz], [hx, -hz], [-hx, hz], [-hx, -hz]];
      for (const [dx, dz] of corners) assert.deepEqual(cellAt(cx + dx, cz + dz), [-1, 0], `lv${n} ${key} footprint corner (${(cx + dx).toFixed(2)}, ${(cz + dz).toFixed(2)})`);
    }
    const pts = s.kind === 'campus' ? s.models.map(m => ({ x: s.at.x + m.pos[0], z: s.at.z + m.pos[2] })) : s.kind === 'glb' ? [s.at] : worldPoints(s);
    for (const p of pts) {
      if (key === 'milk.boat' || (key === 'milk.yard' && p.x < c.x - RING_R)) { assert.equal(cellAt(p.x, p.z), null, `lv${n} ${key} on the water`); assert.ok(p.x < c.x - RING_R && distToCell(p, [-1, 0]) < RING_R + 1.2); continue; }
      assert.ok(distToCell(p, [-1, 0]) < RING_R, `lv${n} ${key}`);
    }
  }
});

test('view: kids are a roster declaration; crate and yard are separate parts; school footprints declared, playground walkable', () => {
  const v = views[5];
  assert.equal(v['milk.kids'].kind, 'roster'); assert.equal(v['milk.kids'].n, 3); assert.equal(v['milk.kids'].home.kind, 'wander');
  assert.ok(v['milk.crate'] && v['milk.yard']); assert.deepEqual(v['milk.crate'].footprint, { r: 0.3 }); assert.equal(v['milk.yard'].footprint, false, 'the hoop does not block the way to the bridge');
  assert.deepEqual(milk.CRATE, v['milk.crate'].at);
  for (let n = 2; n <= 10; n++) {
    const f = views[n]['milk.main'].footprint; assert.equal(f.length, views[n]['milk.main'].models.length);
    for (const r of f) assert.ok(r.z + r.d / 2 < 0.35, `lv${n} school stays behind the playground`);
  }
  assert.ok(views[10]['milk.truck'].footprint, 'the truck blocks walkers');
});
test('scripts: every milk event in both solutions plays 3–5 s (◆ Lv7 / Lv10 ≤ 10 s), ends with LEVEL UP on milk, and leaves the kids at home', async () => {
  const { show, run, bubblesLog } = await headlessShow();
  const timing = {};
  for (const order of SOLUTIONS) {
    show.reset();
    const seen = [];
    await playItem(show, run, order, 'milk', (e, secs) => {
      const to = e.kind === 'grow' ? e.to : 1; seen.push(to); (timing[to] ??= []).push(+secs.toFixed(1));
      const [lo, hi] = to === 7 || to === 10 ? [3, KEY_MAX] : [3, SCRIPT_MAX];
      assert.ok(secs >= lo && secs <= hi, `${e.kind} ${e.to ?? ''} took ${secs.toFixed(2)}s`);
      // ◆（§6「8–10 秒」= 上限 10、軟下限 6，控制者裁決）：含鏡頭平移與回全景定格的整段 6–10 s
      if (to === 7 || to === 10) assert.ok(show.elapsed >= 6 && show.elapsed <= KEY_MAX, `◆ lv${to} whole event ${show.elapsed.toFixed(2)}s`);
      if (e.kind === 'grow') {
        const last = bubblesLog.at(-1), head = show.stage.headOf('milk');
        assert.equal(last.text, 'LEVEL UP'); assert.ok(Math.hypot(last.at.x - head.x, last.at.z - head.z) < 0.3, 'LEVEL UP over milk');
      }
      for (const k of ['milk.kids', 'milk.extraKids']) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home');
    });
    assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], `milk events seen: ${seen}`);
  }
});
test('scripts: the ◆ levels end on the overview (focus home with a hold) before the LEVEL UP', () => {
  for (const n of [7, 10]) {
    const beats = milk.script.grow[n]({ kind: 'grow', item: 'milk', to: n }, { lv: lv({ milk: n }), flags: {} }, fakeCtx);
    const i = beats.findIndex(b => b.kind === 'focus' && b.target === 'home');
    assert.ok(i > 0 && beats[i].dur >= 1, `lv${n} holds on the overview`); assert.equal(beats.slice(i).find(b => b.kind === 'levelUp') && beats.findIndex(b => b.kind === 'levelUp') > i, true);
  }
});
// 審稿（計畫 4 最後一輪）：「恭喜畢業」打在 101 頭頂上——鏡頭先回全景停一下（全景照天際線裝得下 101 頭頂，§14.4；拉近 101 格會把頭頂切掉），
// 字才打出來；跟 focus 擺在同一個 together 裡，字出現時鏡頭還在鮮奶格
test('Lv9: the camera reaches the overview first, then 恭喜畢業 over 101 (the label never shares a beat with a focus)', () => {
  const beats = milk.script.grow[9]({ kind: 'grow', item: 'milk', to: 9 }, { lv: lv({ milk: 9 }), flags: {} }, fakeCtx);
  const i = beats.findIndex(b => b.kind === 'focus' && b.target === 'home');
  assert.ok(i >= 0 && beats[i].dur > 0 && beats[i + 1].kind === 'levelUp', `overview with a hold, then the label (${beats.map(b => b.kind)})`);
  assert.ok(!beats.some(b => b.kind === 'together' && b.beats.some(x => x.kind === 'focus') && b.beats.some(x => x.kind === 'levelUp')), 'no focus + label together');
});
test('lv10 live: the three festival kids walk in, the truck and boat appear, the camera ends on the overview', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), trail = await trailAt(h, order, isMilk(10));
    assert.ok(trail.indexOf('home') >= 1 && trail.at(-1) === 'home', `${order.join('>')} ${JSON.stringify(trail)}`);
    assert.equal(h.show.roster.members('milk.extraKids').length, 3);
    assert.ok(h.show.stage.partKeys().includes('milk.truck') && h.show.stage.partKeys().includes('milk.boat'));
  }
});

// 入口點（§13.2、計畫 3.8 Task 5）：小學生從校門外靠中心格那側的邊上走進來；入口走得到、離每個站位 ≥ 1.5（每一級、有沒有少棒隊；兩條正解每一刻的真 footprint）；
// 鮮奶節的小孩各自從自己那格的邊上進來
test('milk rosters enter walkable and ≥ 1.5 from every spot at every level (kids from the gate edge toward the centre cell)', async () => {
  const nav = createNav(), bad = [];
  for (let n = 1; n <= 10; n++) for (const baseball of [0, 2]) {
    const v = milk.view(lv({ milk: n, baseball }), {});
    // 三個小孩各一個入口（KID_ENTRIES，Task 6a：疊在同一點生出來會互推進柱子角落）
    if (v['milk.kids']) {
      assert.ok(v['milk.kids'].home.entry, `lv${n} entry declared`);
      for (const q of [].concat(v['milk.kids'].home.entry)) { assert.deepEqual(cellAt(q.x, q.z), [-1, 0]); assert.ok(q.x > anchorWorld('milk').x + 1.5, 'east side (toward the centre cell)'); }
    }
    nav.setFootprints(Object.values(v).flatMap(p => [].concat(p.footprint || []).map(f => ({ ...f, x: p.at.x + (f.x ?? 0), z: p.at.z + (f.z ?? 0) }))));
    bad.push(...entryProblems(v, nav, `lv${n} baseball ${baseball}`));
  }
  bad.push(...await entriesThroughSolutions(milk, SOLUTIONS));
  assert.deepEqual(bad, []);
});

// 鮮奶節的小孩（審稿第 1 輪）：每格的散步圈在兩條正解收尾時的真 footprint 下 ≥ 30% 走得到；10 秒內每個人都走動過（不會卡在建築裡不動）
test('festival kids: every home\'s wander disk is ≥ 30% walkable at the end of both solutions, and every festival kid moves within 10 s', async () => {
  for (const order of SOLUTIONS) {
    const { show, run } = await headlessShow();
    let s = engine.createState(spec);
    const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
    for (const step of steps) { const r = step(s); s = r.state; await run([...r.events, { kind: 'settle' }], { instant: true }); }
    assert.equal(show.stage.lv.milk, 10);
    const home = milk.view(show.stage.lv, show.stage.flags, show.stage.meta)['milk.extraKids'].home;
    for (const [k, c] of home.at.entries()) {
      let ok = 0, all = 0;
      const r = [].concat(home.r)[k % [].concat(home.r).length];
      for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) {
        const dx = i / 10 * r, dz = j / 10 * r; if (Math.hypot(dx, dz) > r) continue;
        all++; if (show.nav.walkable(c.x + dx, c.z + dz)) ok++;
      }
      assert.ok(ok / all >= 0.3, `${order.join('>')} home ${cellAt(c.x, c.z)}: ${(100 * ok / all).toFixed(0)}% walkable`);
    }
    const kids = show.roster.members('milk.extraKids'), start = kids.map(m => ({ ...m.pos })), moved = new Set();
    assert.equal(kids.length, 3);
    for (let f = 0; f < 300; f++) { show.update(1 / 30, 500 + f / 30); kids.forEach((m, i) => { if (Math.hypot(m.pos.x - start[i].x, m.pos.z - start[i].z) > 0.05) moved.add(i); }); }
    assert.equal(moved.size, 3, `${order.join('>')}: kids that moved ${[...moved]}`);
  }
});
test('the arch gate pillars block walkers (r 0.06 each); the passage between them and the kids\' entry stay walkable', () => {
  const nav = createNav();
  for (let n = 7; n <= 10; n++) {
    const v = milk.view(lv({ milk: n }), {}), g = v['milk.gate'];
    assert.equal(g.footprint.length, 2); assert.ok(g.footprint.every(f => f.r === 0.06));
    nav.setFootprints(Object.values(v).flatMap(p => [].concat(p.footprint || []).map(f => ({ ...f, x: p.at.x + (f.x ?? 0), z: p.at.z + (f.z ?? 0) }))));
    const [a, b] = g.footprint.map(f => ({ x: g.at.x + f.x, z: g.at.z + f.z }));
    assert.ok(!nav.walkable(a.x, a.z) && !nav.walkable(b.x, b.z), `lv${n} pillars`);
    assert.ok(nav.walkable((a.x + b.x) / 2, (a.z + b.z) / 2), `lv${n} passage`);
    for (const [i, q] of milk.KID_ENTRIES.entries()) assert.ok(nav.walkable(q.x, q.z), `lv${n} entry ${i}`);
  }
});

// 拜訪點（計畫 6 設計 §4、§5）：兩條正解每一個 milk 的 placed／grow，演之前與演完之後問 visitSpot——在格子裡、站位走得到；問到的級寫死
test('visitSpot(n, s) for every level 1..max: on the main island cell of the item (or null for off-island levels), frontOf(spot, r, nav) walkable within 0.6', async () => {
  const { visitSpotsThroughSolutions } = await import('./helpers/show.js');
  assert.equal(typeof milk.visitSpot, 'function');
  const { bad, seen } = await visitSpotsThroughSolutions(milk, SOLUTIONS, { cells: () => [[-1, 0]] });
  assert.deepEqual(bad, []);
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

// 回到 GROW 裁決（設計 §4.3）：鮮奶 Lv2 等棒球的撲空一定要演——Lv2 還沒有小孩、也不加早餐店的人（人數預算），
// 代表借離鮮奶格最近的島民（roster.nearest('landmarks.islanders', 鮮奶錨點)）；Lv3 起照舊是第一個露出來的小孩；Lv1 不排撲空
test('milk rep: Lv2 borrows the nearest islander (hasRep(2) true, hasRep(1) false); Lv3 is the first visible kid', () => {
  const ms = milk.script;
  assert.equal(ms.hasRep(1), false); assert.equal(ms.hasRep(2), true); assert.equal(ms.hasRep(3), true);
  const islander = { key: 'landmarks.islanders', i: 0 }, kids = [{ key: 'milk.kids', i: 0, hidden: true }, { key: 'milk.kids', i: 1, hidden: false }], asked = [];
  islander.mode = 'home'; islander.pos = { ...anchorWorld('milk') };
  const roster = { members: key => { asked.push(key); return key === 'milk.kids' ? kids : key === 'landmarks.islanders' ? [islander] : []; } };
  assert.equal(ms.rep({ lv: { milk: 2 }, flags: {} }, { roster }), islander);
  assert.deepEqual(asked, ['landmarks.islanders'], 'asks for the islanders');
  assert.equal(ms.rep({ lv: { milk: 3 }, flags: {} }, { roster }), kids[1], 'Lv3: the first visible kid');
});
// 鮮奶 Lv2 的撲空是整個謎題最關鍵的線索，不能因為最近的島民正在忙（劇本中、走出去、藏起來）就 0 秒演不出來——挑最近的「空著的」
test('milk rep Lv2: skips busy islanders (script mode / hidden / gone) and picks the nearest one in daily mode; null when none', () => {
  const A = anchorWorld('milk'), at = d => ({ x: A.x + d, y: A.y, z: A.z });
  const busy = { i: 0, mode: 'script', pos: at(0.1) }, hid = { i: 1, mode: 'home', hidden: true, pos: at(0.2) }, gone = { i: 2, mode: 'home', gone: true, pos: at(0.3) };
  const far = { i: 3, mode: 'home', pos: at(3) }, farther = { i: 4, mode: 'home', pos: at(5) };
  const mk = list => ({ members: key => (key === 'landmarks.islanders' ? list : []) });
  const st = { lv: { milk: 2 }, flags: {} };
  assert.equal(milk.script.rep(st, { roster: mk([busy, hid, gone, farther, far]) }), far);
  assert.equal(milk.script.rep(st, { roster: mk([busy, hid, gone]) }), null);
});
// 最終修正（整支分支審稿 1）：鮮奶 Lv2 等棒球的撲空要看得出「在等球場」——代表挑離缺的幫手（rep 的第三個參數）錨點最近的空著的島民；
// 沒給幫手照舊挑離鮮奶錨點最近的
test('milk rep Lv2 with a helper id: the free islander nearest to that helper anchor; without one, nearest to the milk anchor', () => {
  const M = anchorWorld('milk'), H = anchorWorld('baseball');
  const byMilk = { i: 0, mode: 'home', pos: { ...M } }, byLot = { i: 1, mode: 'home', pos: { ...H } }, busy = { i: 2, mode: 'script', pos: { ...H } };
  const roster = { members: key => (key === 'landmarks.islanders' ? [byMilk, busy, byLot] : []) }, st = { lv: { milk: 2 }, flags: {} };
  assert.equal(milk.script.rep(st, { roster }, 'baseball'), byLot);
  assert.equal(milk.script.rep(st, { roster }), byMilk);
});
