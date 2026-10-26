import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as tower from '../src/actors/tower.js';
import { anchorWorld } from '../src/actors/anchors.js';
import { createPartFactory } from '../src/actors/parts.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { B } from '../src/show/beats.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { headlessShow } from './helpers/show.js';
const zero = { milk: 0, chip: 0, bulb: 0, token: 0, typhoon: 0, rat: 0, boba: 0, baseball: 0 };
const lvOf = (total, extra = {}) => { const caps = { milk: 6, baseball: 6, token: 6, rat: 5, boba: 4, chip: 6, bulb: 5 }, out = { ...zero }; let left = total; for (const id in caps) { out[id] = Math.min(caps[id], left); left -= out[id]; } return { ...out, ...extra }; };
const tiers = v => v['tower.main'].parts.filter(p => p.kind === 'frustum4').length;

test('stageOf thresholds (§5.2)', () => {
  // 41 級後門檻跟著放大：0–8 工地、9–18 半成品、19–29 完工、30+ 點燈
  assert.equal(tower.stageOf(0), 'site'); assert.equal(tower.stageOf(8), 'site'); assert.equal(tower.stageOf(9), 'half');
  assert.equal(tower.stageOf(18), 'half'); assert.equal(tower.stageOf(19), 'full'); assert.equal(tower.stageOf(29), 'full'); assert.equal(tower.stageOf(30), 'lit');
});
test('view: site has a crane and cones, half 4 tiers + crane, full 8 tiers + cap and no crane, lit glows', () => {
  const site = tower.view(zero, {}), half = tower.view(lvOf(10), {}), full = tower.view(lvOf(20), {}), lit = tower.view(lvOf(31), {});
  assert.equal(tiers(site), 1); assert.ok(site['tower.crane']); assert.ok(site['tower.main'].parts.some(p => p.kind === 'cone'));
  assert.equal(tiers(half), 5); assert.ok(half['tower.crane']);
  assert.equal(tiers(full), 10); assert.equal(full['tower.crane'], undefined);
  assert.ok(!full['tower.main'].parts.some(p => p.glow)); assert.ok(lit['tower.main'].parts.some(p => p.glow));
});
test('antenna appears at chip 5 and pulses at chip 6; light show needs bulb 5', () => {
  assert.equal(tower.view({ ...zero, chip: 4 }, {})['tower.antenna'], undefined);
  assert.equal(tower.view({ ...zero, chip: 5 }, {})['tower.antenna'].kind, 'compound');
  assert.equal(tower.view({ ...zero, chip: 6 }, {})['tower.antenna'].kind, 'pulse');
  assert.equal(tower.view({ ...zero, bulb: 4 }, {})['tower.show'], undefined);
  assert.equal(tower.view({ ...zero, bulb: 5 }, {})['tower.show'].kind, 'lightshow');
});
test('the antenna sits on the spire top of whatever stage the tower is in', () => {
  const v = tower.view({ ...zero, chip: 5 }, {}), top = Math.max(...v['tower.main'].parts.map(p => p.pos[1] + (Array.isArray(p.scale) ? p.scale[1] : p.scale) / 2));
  assert.ok(Math.abs(v['tower.antenna'].parts[0].pos[1] - top) < 0.6);
});
test('all tower parts stand on the tower anchor', () => {
  const a = anchorWorld('tower');
  for (const v of [tower.view(zero, {}), tower.view(lvOf(31, { chip: 6, bulb: 5 }), {})]) for (const k in v) assert.deepEqual(v[k].at, a, k);
});
test('crane, pulse and lightshow builders animate', () => {
  const glow = createGlowRegistry(); glow.setNight(1);
  const f = createPartFactory(THREE, { glow, people: null, assets: null, builders: tower.builders });
  const crane = f.build(tower.view(zero, {})['tower.crane']); const jib = crane.object.getObjectByName('jib');
  crane.update(0.1, 1); const r1 = jib.rotation.y; crane.update(0.1, 3); assert.notEqual(jib.rotation.y, r1);
  const pulse = f.build(tower.view({ ...zero, chip: 6 }, {})['tower.antenna']); const m = pulse.materials[0];
  pulse.update(0.1, 0.75); const a = m.emissiveIntensity; pulse.update(0.1, 2.25); assert.notEqual(m.emissiveIntensity, a);
  const show = f.build(tower.view({ ...zero, bulb: 5 }, {})['tower.show']); const c0 = show.materials[0].emissive.getHex();
  show.update(0.1, 1); assert.notEqual(show.materials[0].emissive.getHex(), c0);
  for (const p of [crane, pulse, show]) p.dispose?.(); assert.equal(glow.size, 0);
});

// 101 跳階只在回合最後的 settle 發生（計畫 3.6）：view 用 meta.total，沒給才自己加總
test('view uses meta.total when given; stage names for the float', () => {
  assert.equal(tiers(tower.view(lvOf(20), {}, { total: 0 })), 1, 'meta.total wins');
  assert.equal(tiers(tower.view(lvOf(20), {})), 10);
  assert.deepEqual(tower.STAGE_NAMES, { site: '101 工地', half: '101 蓋一半', full: '101 完工', lit: '101 點燈' });
  assert.ok(tower.view(zero, {}, { total: 0 })['tower.main'].labelY > 1);
});

// ── settle 劇本（§8.9）：跨門檻才演——工人（沒有就島民）走到 101 腳下敲門、閃白跳階、頭上寫階段名 ──
const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);
// 假名冊：members 照 key 給；home 記下被叫回家的人
const fakeRoster = groups => { const homed = []; return { homed, members: k => groups[k] ?? [], claim() {}, home: m => homed.push(m) }; };
const person = (name, x, z, hidden = false) => ({ name, pos: { x, y: 0, z }, hidden, head: () => ({ x, y: 1, z }) });
const labelOf = beats => {
  let text = null; const ctx = { stage: { headOf: () => ({ x: 0, y: 0, z: 0 }) }, bubbles: { levelUp: (h, o) => { text = o.text; return { cancel() {} }; } } };
  beats.find(b => b.kind === 'levelUp').start(ctx); return text;
};

test('settle crossing 8→9 yields walk + knock + apply + levelUp「101 蓋一半」+ home; 8→8 and 9→18 yield nothing', () => {
  const ctx = { B, roster: fakeRoster({}) }, e = { kind: 'settle' };
  const beats = tower.script.settle(e, { total: 9, prevTotal: 8 }, ctx);
  assert.deepEqual(beats.map(b => b.kind), ['walk', 'gesture', 'apply', 'levelUp', 'home']);
  assert.equal(labelOf(beats), '101 蓋一半');
  assert.deepEqual(tower.script.settle(e, { total: 8, prevTotal: 8 }, ctx), []);
  assert.deepEqual(tower.script.settle(e, { total: 18, prevTotal: 9 }, ctx), []);
  assert.equal(labelOf(tower.script.settle(e, { total: 21, prevTotal: 16 }, ctx)), '101 完工');
  assert.equal(labelOf(tower.script.settle(e, { total: 33, prevTotal: 27 }, ctx)), '101 點燈');
});

test('settle hero: the worker if visible, else the nearest visible islander to the tower foot (looked up when the beat plays)', () => {
  const foot = anchorWorld('tower'), e = { kind: 'settle' }, s = { total: 9, prevTotal: 8 };
  const hero = groups => { const roster = fakeRoster({}), ctx = { B, roster }; const beats = tower.script.settle(e, s, ctx); roster.members = k => groups[k] ?? []; beats.at(-1).start(ctx); return roster.homed[0]?.name; };
  const near = person('near', foot.x + 1, foot.z), far = person('far', foot.x + 6, foot.z), hid = person('hid', foot.x + 0.9, foot.z + 0.3, true);
  assert.equal(hero({ 'chip.worker': [person('worker', 0, 0)], 'landmarks.islanders': [near] }), 'worker');
  assert.equal(hero({ 'chip.worker': [person('worker', 0, 0, true)], 'landmarks.islanders': [far, hid, near] }), 'near');
  assert.equal(hero({}), undefined, 'nobody around → the beats skip');
});

// 照正解放完 order（再 advance closing 回合）：只有最後一回合 live，之前的 instant；回傳 settle 那段的秒數與這回合新增的泡泡
async function liveTurn(h, order, { closing = 0 } = {}) {
  let s = engine.createState(spec);
  const turns = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: closing }, () => st => engine.advance(st, spec))];
  for (let i = 0; i < turns.length; i++) {
    const r = turns[i](s); s = r.state; const events = [...r.events, { kind: 'settle' }], montage = i >= order.length;
    if (i + 1 < turns.length) { await h.run(events, { instant: true, montage }); continue; }
    const n0 = h.bubblesLog.length; let mark = null;
    // 劇本秒數（不含鏡頭 focus 拍）：settle 那一段 = 回合結束 − settle 開始
    const secs = await h.run(events, { montage, onMark: e => { if (e.kind === 'settle') mark = h.scriptElapsed(); } });
    return { settleSecs: secs - mark, bubbles: h.bubblesLog.slice(n0) };
  }
}
const allHome = show => { for (const k of show.roster.keys()) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', k); };
const nearHead = (show, at) => { const h = show.stage.headOf('tower'); assert.ok(Math.hypot(at.x - h.x, at.z - h.z) < 0.5, 'label over the tower'); };

test('headless: the turn crossing 8→11 ends with the「101 蓋一半」label over the tower, everyone home, settle 4–8 s; a non-crossing settle takes 0 s', async () => {
  const h = await headlessShow(), order = SOLUTIONS[0];
  const before = await liveTurn(h, order.slice(0, 4));
  assert.ok(before.settleSecs < 0.05, `no crossing → no time (${before.settleSecs})`);
  h.show.reset();
  const t = await liveTurn(h, order.slice(0, 5));
  assert.equal(t.bubbles.at(-1).text, '101 蓋一半'); nearHead(h.show, t.bubbles.at(-1).at);
  assert.ok(t.settleSecs >= 4 && t.settleSecs <= 8, `settle ${t.settleSecs.toFixed(2)} s`);
  allHome(h.show); assert.equal(h.show.stage.meta.total, 11);
});

test('headless: the first closing montage turn crossing into 點燈 still shows the label', async () => {
  const h = await headlessShow(), t = await liveTurn(h, SOLUTIONS[0], { closing: 1 });
  assert.equal(t.bubbles.at(-1).text, '101 點燈'); nearHead(h.show, t.bubbles.at(-1).at); allHome(h.show);
});
