import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as typhoon from '../src/actors/typhoon.js';
import { anchorWorld, cellOf, landmarkWorld } from '../src/actors/anchors.js';
import { lv, focusCell } from './helpers/actors.js';
import { createPartFactory } from '../src/actors/parts.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { cellAt } from '../src/scene/hex.js';

test('typhoon lv1: one grey cloud high above the island, no rain', () => {
  const v = typhoon.view(lv({ typhoon: 1 }), {}); assert.deepEqual(Object.keys(v), ['typhoon.main']);
  assert.equal(v['typhoon.main'].kind, 'cloud'); assert.ok(v['typhoon.main'].parts.every(p => p.pos[1] >= 4));
});
test('lv2: spinning storm ring + rain; lv3: rainbow + riverside park, no rain', () => {
  const v2 = typhoon.view(lv({ typhoon: 2 }), {});
  assert.ok(v2['typhoon.main'].spin > 0); assert.ok(v2['typhoon.main'].parts.length >= 8); assert.equal(v2['typhoon.rain'].kind, 'rain');
  const v3 = typhoon.view(lv({ typhoon: 3 }), {});
  assert.equal(v3['typhoon.rain'], undefined); assert.equal(v3['typhoon.rainbow'].parts.filter(p => p.kind === 'rail').length, 3);
  const park = landmarkWorld('park'); assert.ok(Math.hypot(v3['typhoon.park'].at.x - park.x, v3['typhoon.park'].at.z - park.z) < 1e-9);
});
test('delivery scooter exists only at lv2 with boba placed', () => {
  assert.equal(typhoon.view(lv({ typhoon: 2 }), {})['typhoon.scooter'], undefined);
  assert.equal(typhoon.view(lv({ typhoon: 2, boba: 1 }), {})['typhoon.scooter'].kind, 'scooter');
  assert.equal(typhoon.view(lv({ typhoon: 3, boba: 1 }), {})['typhoon.scooter'], undefined);
});
// 堤防（物品 v2 §4.5 Lv3）：主島外圍每條靠海的格邊一道矮牆（棒球格西南邊留給巨蛋捷運站的月台），在格面上、走路格外，
// 不算 footprint、一個零件一種顏色（1 個 draw call）
test('Lv3 levee: a low wall on every sea-facing edge of the main island, on the rim outside the walking grid; no footprint, one draw call', async () => {
  const { createNav } = await import('../src/show/nav.js');
  const { MAIN_CELLS, NEIGHBORS, cellTop } = await import('../src/scene/hex.js');
  for (const n of [1, 2]) assert.equal(typhoon.view(lv({ typhoon: n }), {})['typhoon.levee'], undefined);
  const v = typhoon.view(lv({ typhoon: 3 }), {})['typhoon.levee'], nav = createNav();
  assert.equal(v.kind, 'compound'); assert.equal(v.footprint, false);
  assert.ok(v.parts.every(p => !p.glow) && new Set(v.parts.map(p => p.color)).size === 1, 'one colour, no glow: 1 draw call');
  const seaEdges = MAIN_CELLS.flatMap(c => NEIGHBORS.filter(([dq, dr]) => !MAIN_CELLS.some(m => m[0] === c[0] + dq && m[1] === c[1] + dr))).length;
  assert.equal(v.parts.length, seaEdges, 'every sea-facing edge but the dome-station one; the rat-landing edge in two pieces');
  for (const p of v.parts) {
    assert.ok(p.scale[1] <= 0.1, 'low');
    for (const k of [-0.5, -0.25, 0, 0.25, 0.5]) {
      const x = v.at.x + p.pos[0] + Math.cos(p.rot[1]) * p.scale[0] * k, z = v.at.z + p.pos[2] - Math.sin(p.rot[1]) * p.scale[0] * k, cell = cellAt(x, z);
      assert.ok(cell, `on the island at (${x.toFixed(2)}, ${z.toFixed(2)})`);
      assert.ok(!nav.walkable(x, z), `off the walking grid at (${x.toFixed(2)}, ${z.toFixed(2)})`);
      assert.ok(Math.abs(p.pos[1] - p.scale[1] / 2 - cellTop(cell)) < 1e-9, 'sits on the cell top');
    }
  }
});
// 審稿：第一隻老鼠從巨蛋格東南岸的海裡爬上岸，那一段堤防留個缺口，爬上來的直線不穿過堤防
test('the levee leaves a gap where the first rat climbs out of the sea', async () => {
  const { createNav } = await import('../src/show/nav.js');
  const { RAT_LANDING } = await import('../src/actors/rat.js');
  const v = typhoon.view(lv({ typhoon: 3 }), {})['typhoon.levee'], nav = createNav(), to = nav.nearestWalkable(RAT_LANDING);
  // 每一道牆當成一條線段（中心 ± 半長），爬上來的線段離每一道牆 ≥ 0.15
  const segDist = (p, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz))); return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t); };
  for (const p of v.parts) {
    const h = p.scale[0] / 2, a = { x: p.pos[0] - Math.cos(p.rot[1]) * h, z: p.pos[2] + Math.sin(p.rot[1]) * h }, b = { x: p.pos[0] + Math.cos(p.rot[1]) * h, z: p.pos[2] - Math.sin(p.rot[1]) * h };
    for (let k = 0; k <= 20; k++) { const q = { x: RAT_LANDING.x + (to.x - RAT_LANDING.x) * k / 20, z: RAT_LANDING.z + (to.z - RAT_LANDING.z) * k / 20 }; assert.ok(segDist(q, a, b) >= 0.15, `climb crosses the levee at (${q.x.toFixed(2)}, ${q.z.toFixed(2)})`); }
  }
});
test('rain part: 240 instances, none cast shadows, drops fall', () => {
  const f = createPartFactory(THREE, { glow: createGlowRegistry(), builders: typhoon.builders });
  const p = f.build(typhoon.view(lv({ typhoon: 2 }), {})['typhoon.rain']), mesh = p.object.children[0];
  assert.equal(mesh.count, 240); assert.equal(mesh.castShadow, false);
  const m = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3();
  p.update(0, 0.1); mesh.getMatrixAt(0, m); a.setFromMatrixPosition(m); p.update(0, 0.2); mesh.getMatrixAt(0, m); b.setFromMatrixPosition(m);
  assert.ok(b.y < a.y || b.y > 5, 'falls (or wrapped to the top)');
});
test('cloud spins and scooter circles the centre cell', () => {
  const f = createPartFactory(THREE, { glow: createGlowRegistry(), builders: typhoon.builders });
  const c = f.build(typhoon.view(lv({ typhoon: 2 }), {})['typhoon.main']); c.update(0.5, 1); assert.notEqual(c.object.children[0].rotation.y, 0);
  const s = f.build(typhoon.view(lv({ typhoon: 2, boba: 1 }), {})['typhoon.scooter']); s.update(0, 0); const p0 = s.object.children[0].position.clone(); s.update(0, 1);
  assert.ok(p0.distanceTo(s.object.children[0].position) > 0.5); assert.ok(Math.abs(Math.hypot(p0.x, p0.z) - 1.95) < 1e-6);
});
// 計畫 3.6：颱風賴著不走時雨變小（app 把 weather.rain 淡到 0.35）
test('rain shows fewer, fainter drops when weather.rain is low', () => {
  const weather = { rain: 1 }, f = createPartFactory(THREE, { glow: createGlowRegistry(), builders: typhoon.builders, weather });
  const p = f.build(typhoon.view(lv({ typhoon: 2 }), {})['typhoon.rain']), mesh = p.object.children[0];
  p.update(0, 0.1); assert.equal(mesh.count, 240); const o = mesh.material.opacity;
  weather.rain = 0.35; p.update(0, 0.2); assert.equal(mesh.count, 84); assert.ok(mesh.material.opacity < o);
  const plain = createPartFactory(THREE, { glow: createGlowRegistry(), builders: typhoon.builders }).build(typhoon.view(lv({ typhoon: 2 }), {})['typhoon.rain']);
  plain.update(0, 0.1); assert.equal(plain.object.children[0].count, 240, 'no weather = full rain');
});

// ── Task 15：颱風劇本（§8.5）──
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { offset } from '../src/actors/palette.js';
import * as baseball from '../src/actors/baseball.js';
import * as milk from '../src/actors/milk.js';
import { worldEffects } from '../src/actors/world.js';
import { B } from '../src/show/beats.js';
import { headlessShow, playItem } from './helpers/show.js';
const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);
const flat = bs => bs.flatMap(b => (b.kind === 'together' ? flat(b.beats) : [b]));
const fakeCtx = () => ({ B, roster: { members: () => [], keys: () => [] }, stage: {} });

test('view: Lv3 splits the rainbow into its own part (no cloud left); the cloud, rain and scooter have no footprint', () => {
  const v3 = typhoon.view(lv({ typhoon: 3, boba: 1 }), {});
  assert.equal(v3['typhoon.main'], undefined, 'no cloud at Lv3');
  assert.equal(v3['typhoon.rainbow'].footprint, false); assert.equal(v3['typhoon.rainbow'].parts.length, 3);
  assert.equal(Object.keys(v3)[0], 'typhoon.rainbow', 'rainbow first: LEVEL UP hangs on it');
  for (const n of [1, 2]) assert.equal(typhoon.view(lv({ typhoon: n }), {})['typhoon.rainbow'], undefined);
  const v2 = typhoon.view(lv({ typhoon: 2, boba: 1 }), {});
  for (const k of ['typhoon.main', 'typhoon.rain', 'typhoon.scooter']) assert.equal(v2[k].footprint, false, k);
  assert.ok(typhoon.script?.placed && typhoon.script.grow[2] && typhoon.script.grow[3] && typhoon.script.stall);
  assert.equal(typhoon.script.fx, undefined, 'the island check after the landing is plain apply + LEVEL UP (turn.js), no reaction scripts');
  assert.equal(typhoon.script.rep(), null);
});
test('view: dome-rat staff are a helmeted roster of 2 following the rats; the milk crate goes grey in a blackout', () => {
  const st = baseball.view(lv({ baseball: 3 }), { domeRats: true })['baseball.staff'];
  assert.deepEqual([st.kind, st.n, st.accessory], ['roster', 2, 'helmet']);
  assert.deepEqual(st.home, { kind: 'follow', key: 'rat.pack', dist: 0.6 });
  const gate = offset(anchorWorld('baseball'), 0, 1.1); assert.ok(Math.hypot(st.at.x - gate.x, st.at.z - gate.z) < 1e-9, 'stands at the gate');
  assert.equal(baseball.view(lv({ baseball: 3 }), {})['baseball.staff'], undefined);
  const lit = milk.view(lv({ milk: 1 }), {})['milk.crate'], dark = milk.view(lv({ milk: 1 }), { blackout: true })['milk.crate'];
  assert.notDeepEqual(lit.parts.map(p => p.color), dark.parts.map(p => p.color));
  assert.ok(dark.parts.every(p => { const r = p.color >> 16, g = (p.color >> 8) & 255, b = p.color & 255; return Math.max(r, g, b) - Math.min(r, g, b) < 24; }), 'grey');
});
const people = show => show.roster.keys().flatMap(k => show.roster.members(k)).filter(m => m.kind === 'people');
// 物品 v2 §6：一級 3–5 s；Lv2 登陸是全島的事（躲進門的那段走路），≤ 10 s
const BOUNDS = { 1: [3, 5], 2: [3, 10], 3: [3, 5] };
function checkTyphoon({ show, bubblesLog }, e, secs, n) {
  const to = e.kind === 'grow' ? e.to : 1, what = `${e.kind} ${to}`, [lo, hi] = BOUNDS[to];
  assert.ok(secs >= lo && secs <= hi, `${what} took ${secs.toFixed(1)}s`);
  if (e.kind === 'grow') {
    const last = bubblesLog.slice(n).at(-1), h = show.stage.headOf('typhoon');
    assert.equal(last?.text, 'LEVEL UP', what); assert.ok(Math.hypot(last.at.x - h.x, last.at.y - h.y, last.at.z - h.z) < 0.3, `${what} LEVEL UP over typhoon`);
  }
  for (const k of show.roster.keys()) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', `${what} ${k}`);
  // 登陸那回合島上的人躲在門裡到回合結束；其他時候沒有人藏著
  if (to === 2) assert.ok(people(show).filter(m => cellAt(m.pos.x, m.pos.z)).length === 0 || people(show).some(m => m.hidden), `${what} people indoors`);
  else assert.ok(people(show).every(m => !m.hidden), `${what} nobody hidden`);
}
test('scripts: typhoon placed / Lv2 / Lv3 in both solutions play within budget, LEVEL UP on the typhoon, everyone home', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  let n = 0;
  const tracked = (evs, opts) => { if (!opts?.instant) n = bubblesLog.length; return run(evs, opts); };
  for (const order of SOLUTIONS) {
    show.reset();
    const seen = new Set();
    await playItem(show, tracked, order, 'typhoon', (e, secs) => { seen.add(e.kind === 'grow' ? e.to : 1); checkTyphoon(h, e, secs, n); });
    assert.deepEqual([...seen].sort(), [1, 2, 3], `typhoon events seen: ${[...seen]}`);
  }
});

// 照 order 放（再長 CLOSING_TURNS 回合）到 pred 命中的那一回合為止（之前的回合瞬間演），回傳那一回合的事件（含 settle）。
// 物品 v2：正解颱風最後放，登陸、放晴都在倒數回合
async function turnWith(run, order, pred) {
  let s = engine.createState(spec);
  const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  for (const step of steps) {
    const r = step(s); s = r.state;
    if (r.events.some(pred)) return [...r.events, { kind: 'settle' }];
    await run([...r.events, { kind: 'settle' }], { instant: true });
  }
  throw new Error('turn not found');
}
const landing = e => e.kind === 'grow' && e.item === 'typhoon' && e.to === 2;
const ACTORS = await Promise.all(spec.ORDER.map(id => import(`../src/actors/${id}.js`)));
const isKey = e => e.kind === 'grow' && !!ACTORS.find(m => m.id === e.item)?.script?.grow?.[e.to]?.key;
// 登陸回合整段 live 演（多個事件一回合：名單、門口都要演到才查）。回傳 { reacts, secs, seg, after }：
//   seg = 登陸那一個事件的秒數；after = 登陸之後每個事件的秒數（使用者規則：只演 apply + LEVEL UP）
async function playLanding(h, evs, opts = {}) {
  const { show, run, worldLog, bubblesLog } = h;
  const reacts = evs.filter(e => e.kind === 'fx' && e.cause === 'typhoon').map(e => e.flag?.name ?? e.delta?.target ?? e.story);
  // 每個人是走到門口停下那一刻才藏起來（不是整群一起關掉）；記下藏的時候在不在走
  const w0 = worldLog.length, hide = show.roster.hide, hides = [];
  show.roster.hide = m => { hides.push({ m, walking: m.walking }); return hide(m); };
  const n = bubblesLog.length, marks = [];
  let secs;
  try { secs = await run(evs, { ...opts, onMark: e => marks.push([e, show.elapsed, bubblesLog.length]) }); } finally { show.roster.hide = hide; }
  const i0 = marks.findIndex(([e]) => landing(e)), at = k => marks[k]?.[1] ?? show.elapsed;
  // 登陸之後的事件：◆ 關鍵級照演劇本（裁決 R14），不算進「只演 apply + LEVEL UP」
  const seg = at(i0 + 1) - at(i0), after = marks.slice(i0 + 1).map(([e], k) => [e, at(i0 + 2 + k) - at(i0 + 1 + k), k]).filter(([e]) => !isKey(e));
  const live = worldLog.slice(w0).filter(([, instant]) => !instant).map(([w]) => w);
  assert.ok(live.some(w => w.storm === 1 && w.rain === 1), `storm world ${JSON.stringify(live)}`);
  assert.ok(live.every(w => w.peopleVisible !== false), 'the whole people group is never switched off');
  assert.ok(hides.length > 0 && hides.every(h => !h.walking), 'people hidden only once they stop at a door');
  // 登陸之後（關鍵級之外）只冒 LEVEL UP／DOWN，沒有別的泡泡（等待圖框除外）
  const later = after.flatMap(([, , k]) => bubblesLog.slice(marks[i0 + 1 + k][2], marks[i0 + 2 + k]?.[2] ?? bubblesLog.length));
  assert.ok(later.every(b => b.text || b.kind?.icon), `after the landing only LEVEL UP / DOWN (${JSON.stringify(later.map(b => b.kind ?? b.text))})`);
  const bubbles = bubblesLog.slice(n);
  if (reacts.includes('blackout')) assert.ok(live.some(w => w.glowScale === 0));
  if (evs.some(e => e.flag?.name === 'blackout' && e.delta?.to < e.delta?.from)) {   // 鮮奶真的掉級才有 LEVEL DOWN（Lv1 掉不下去）
    const down = bubbles.find(b => b.text === 'LEVEL DOWN'), m = show.stage.headOf('milk');
    assert.ok(down && Math.hypot(down.at.x - m.x, down.at.z - m.z) < 0.3, 'LEVEL DOWN over milk');
  }
  if (reacts.includes('flooded')) { assert.equal(show.roster.members('token.staff').length, 0); assert.equal(show.roster.members('token.swimmers').length, 2); }
  if (reacts.includes('domeRats')) assert.equal(show.roster.members('baseball.staff').length, 2);
  // 島上的人整回合躲著（換身分的泳客、新來的巨蛋工作人員除外）
  const out = new Set(['token.swimmers', 'baseball.staff']);
  assert.ok(hides.filter(h => !out.has(h.m.key) && !h.m.gone).every(h => h.m.hidden), 'people stay indoors for the rest of the turn');
  if (reacts.includes('boba')) assert.ok(show.stage.partObject('typhoon.scooter')?.visible, 'delivery scooter out in the rain');
  for (const k of show.roster.keys()) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', k);
  assert.equal(show.stage.lv.typhoon, 2);
  return { reacts, secs, seg, after };
}
// 引擎裡能讓登陸回合觸發最多反應的兩種放法（大停電與淹水不會同一回合：燈泡、代幣都 ≤2 時只有剛放的那個）
const BLACKOUT = ['rat', 'milk', 'baseball', 'boba', 'typhoon', 'bulb'], FLOOD = ['rat', 'milk', 'baseball', 'boba', 'typhoon', 'token'];
for (const [name, order, react] of [['blackout', BLACKOUT, 'blackout'], ['flood', FLOOD, 'flooded']]) {
  test(`landing turn with reactions (${name}, real engine) live as one turn: people hide only at the doors, the reactions land as apply + LEVEL UP`, async () => {
    const h = await headlessShow();
    const { reacts, seg, after } = await playLanding(h, await turnWith(h.run, order, landing));
    assert.ok(reacts.includes(react) && reacts.includes('domeRats') && reacts.includes('boba') && reacts.some(k => k.includes('颱風假')), `reactions ${reacts}`);
    assert.ok(seg <= 10, `landing ${seg.toFixed(1)} s`);
    for (const [e, t] of after) if (e.kind !== 'settle') assert.ok(t <= 2.6, `${e.kind} ${e.item ?? ''} after the landing took ${t.toFixed(2)} s`);
  });
}
// §8.5 的全套五個反應：引擎裡大停電只會碰到剛放下的燈泡（Lv1，還沒有路燈），也不會和淹水同回合——
// 自己堆出燈泡 Lv2、代幣 Lv2、鮮奶、珍奶、老鼠 Lv4、棒球 Lv3、颱風 Lv1（除了颱風都鎖住不長），下一回合登陸
test('landing with all five reactions (crafted state) live as one turn: the landing ≤ 10 s, each reaction after it ≤ 2.6 s (apply + LEVEL UP / DOWN)', async () => {
  const h = await headlessShow(), LV = { bulb: 2, token: 2, milk: 1, boba: 1, rat: 4, baseball: 3, typhoon: 1 };   // 物品 v2：鼠災要老鼠 ≥4
  await h.run([...Object.entries(LV).flatMap(([item, to]) => [{ kind: 'placed', item, to: 1 }, ...Array.from({ length: to - 1 }, (_, i) => ({ kind: 'grow', item, from: i + 1, to: i + 2 }))]), { kind: 'settle' }], { instant: true });
  const st = engine.createState(spec);
  for (const [id, n] of Object.entries(LV)) { st.lv[id] = n; st.age[id] = 0; if (id !== 'typhoon') st.locked[id] = true; }
  const evs = [...engine.advance(st, spec).events, { kind: 'settle' }];
  const { reacts, seg, after } = await playLanding(h, evs);
  assert.deepEqual(reacts.map(k => (k.includes('颱風假') ? 'story' : k)), ['blackout', 'flooded', 'domeRats', 'story', 'boba']);
  assert.ok(seg >= 3 && seg <= 10, `landing took ${seg.toFixed(1)} s`);
  for (const [e, t] of after) if (e.kind !== 'settle') assert.ok(t <= 2.6, `${e.kind} ${e.flag?.name ?? e.delta?.target ?? e.story ?? ''} took ${t.toFixed(2)} s`);
  // 鼠災：老鼠的家搬到巨蛋門口，兩個工作人員跟著牠們（日常自己走過去，不是劇本）
  for (let i = 0; i < 240; i++) h.show.update(1 / 30, 300 + i / 30);
  const gate = offset(anchorWorld('baseball'), 0, 1.1);
  assert.ok(h.show.roster.members('rat.pack').every(m => Math.hypot(m.pos.x - gate.x, m.pos.z - gate.z) < 1.5), 'rats by the dome gate');
});
test('Lv3: the sky clears, nobody is hidden, and the rainbow is standing', async () => {
  const h = await headlessShow(), { show, run, worldLog } = h, order = SOLUTIONS[0];
  const evs = await turnWith(run, order, e => e.kind === 'grow' && e.item === 'typhoon' && e.to === 3);
  const w0 = worldLog.length; await run(evs);
  const live = worldLog.slice(w0).filter(([, instant]) => !instant).map(([w]) => w);
  assert.ok(live.some(w => w.storm === 0 && w.rain === 0), JSON.stringify(live));
  assert.ok(live.every(w => !('peopleVisible' in w) || w.peopleVisible), 'no people switch in the script');
  assert.ok(people(show).every(m => !m.hidden));
  assert.equal(show.stage.partObject('typhoon.main'), null);
  assert.equal(show.stage.partObject('typhoon.rainbow').scale.y, 1);
});
// 颱風賴在巨蛋（spec.js 颱風 delay[3]）：引擎在多等的那一回合記一個 stall 事件；整回合 live（一般回合與倒數蒙太奇）：
// 雲停在巨蛋上空，「……」冒在雲上
const STALL_ORDER = ['milk', 'chip', 'bulb', 'token', 'baseball', 'typhoon', 'rat', 'boba'];
for (const montage of [false, true]) {
  test(`stall${montage ? ' (montage)' : ''}: on the delayed turn the cloud sits over the dome and says ……`, async () => {
    const h = await headlessShow(), { show, run, bubblesLog } = h;
    const evs = await turnWith(run, STALL_ORDER, e => e.kind === 'stall' && e.item === 'typhoon');
    const n = bubblesLog.length, marks = [];
    await run(evs, { montage, onMark: e => marks.push([e, show.elapsed]) });
    const k = marks.findIndex(([e]) => e.kind === 'stall'), secs = (marks[k + 1]?.[1] ?? show.elapsed) - marks[k][1];
    assert.ok(secs >= 1 && secs <= 5, `stall took ${secs.toFixed(1)}s`);
    assert.equal(show.stage.lv.typhoon, 2);
    const o = show.stage.partObject('typhoon.main').position, dome = anchorWorld('baseball');
    assert.ok(Math.hypot(o.x - dome.x, o.z - dome.z) < 1e-6, 'cloud over the dome');
    const dots = bubblesLog.slice(n).find(b => b.kind === '……');
    assert.ok(dots && Math.hypot(dots.at.x - dome.x, dots.at.z - dome.z) < 0.5 && dots.at.y > 3, '…… on the cloud over the dome');
  });
}
test('skip during the door walks: everyone home and visible, world snapped to the landing, typhoon at Lv2', async () => {
  const h = await headlessShow(), { show, run, worldLog } = h;
  const evs = await turnWith(run, SOLUTIONS[0], landing);
  const p = show.turn(evs);
  let t = 0;
  while (!people(show).some(m => m.mode === 'script' && m.walking)) { show.update(1 / 30, t); t += 1 / 30; assert.ok(t < 20, 'door walks start'); }
  show.skip(); await p;
  for (const k of show.roster.keys()) for (const m of show.roster.members(k)) { assert.equal(m.mode, 'home', k); assert.equal(m.hidden, false, k); }
  assert.equal(show.stage.lv.typhoon, 2);
  const [w, instant] = worldLog.at(-1);
  assert.equal(instant, true); assert.deepEqual(w, worldEffects(show.stage.lv, show.stage.flags, show.stage.meta)); assert.equal(w.storm, 1);
});

// 颱風賴在巨蛋（spec.js delay[3]：棒球 ≥3 且晶片 ≤7）：登陸回合過後，暴風雲停在巨蛋上空；晶片 ≥8（矽盾測過）巨蛋就擋不住它，雲不去巨蛋
test('view: the lingering Lv2 storm sits over the dome only while the delay holds (baseball ≥ 3, chip ≤ 7; not on the landing turn)', () => {
  const dome = anchorWorld('baseball'), at = anchorWorld('typhoon'), near = (p, q) => Math.hypot(p.x - q.x, p.z - q.z) < 1e-9;
  assert.ok(near(typhoon.view(lv({ typhoon: 2, baseball: 3 }), {}, { landing: false })['typhoon.main'].at, dome));
  assert.ok(near(typhoon.view(lv({ typhoon: 2, baseball: 3 }), {}, { landing: true })['typhoon.main'].at, at));
  assert.ok(near(typhoon.view(lv({ typhoon: 2, baseball: 2 }), {}, { landing: false })['typhoon.main'].at, at));
  assert.ok(near(typhoon.view(lv({ typhoon: 1, baseball: 3 }), {}, {})['typhoon.main'].at, at));
  assert.ok(near(typhoon.view(lv({ typhoon: 2, baseball: 3, chip: 7 }), {}, { landing: false })['typhoon.main'].at, dome), 'chip 7: still delayed');
  assert.ok(near(typhoon.view(lv({ typhoon: 2, baseball: 3, chip: 8 }), {}, { landing: false })['typhoon.main'].at, at), 'chip 8: the delay no longer holds, the cloud stays put');
});
test('after a landing turn with baseball ≥ 3, the next turn ends with the storm cloud over the dome', async () => {
  const h = await headlessShow(), { show, run } = h, dome = anchorWorld('baseball');
  const evs = await turnWith(run, BLACKOUT, landing);
  await run(evs);
  assert.ok(show.stage.lv.baseball >= 3);
  const o0 = show.stage.partObject('typhoon.main').position; assert.ok(Math.hypot(o0.x - dome.x, o0.z - dome.z) > 1, 'landing turn: over the typhoon anchor');
  const s = engine.createState(spec); let st = s;
  for (const id of BLACKOUT) st = engine.place(st, id, spec).state;
  const r = engine.place(st, 'chip', spec);
  await run([...r.events, { kind: 'settle' }]);
  assert.equal(show.stage.lv.typhoon, 2);
  const o = show.stage.partObject('typhoon.main').position;
  assert.ok(Math.hypot(o.x - dome.x, o.z - dome.z) < 1e-6, 'cloud over the dome');
});

// ── 計畫 3.8 Task 6：鏡頭焦點、登陸躲進門裡不閃、下一回合從門口走出來 ──
const firstFocus = beats => { assert.equal(beats[0].kind, 'focus', 'the script starts with its own focus'); return beats[0].target === 'home' ? 'home' : focusCell(beats[0], fakeCtx()); };
test('focus: the cloud frames the typhoon cell when placed and the dome cell when it lingers (stall); landing and clearing are island-wide', () => {
  const s = (extra, flags = {}) => ({ lv: lv({ typhoon: 2, ...extra }), flags });
  assert.deepEqual(firstFocus(typhoon.script.placed({ kind: 'placed', item: 'typhoon', to: 1 }, s({ typhoon: 1 }), fakeCtx())), [0, 0]);
  assert.deepEqual(firstFocus(typhoon.script.stall({ kind: 'stall', item: 'typhoon' }, s({ baseball: 3 }), fakeCtx())), cellOf('baseball'));
  for (const to of [2, 3]) assert.equal(firstFocus(typhoon.script.grow[to]({ kind: 'grow', item: 'typhoon', from: to - 1, to }, s({ typhoon: to }), fakeCtx())), 'home', `grow ${to}`);
});
test('placed live: the camera frames the cloud over the typhoon cell at zoom 0.8, then home', async () => {
  const h = await headlessShow(); let n0 = 0, opts = null;
  await playItem(h.show, (evs, o) => { if (!o?.instant) n0 = h.rig.log.length; return h.run(evs, o); }, SOLUTIONS[0], 'typhoon', e => {
    if (e.kind === 'placed') opts = h.rig.log.slice(n0).filter(([k]) => k === 'focus').map(([, t, o]) => ({ y: t.y, zoom: o.zoom }));
  });
  assert.equal(opts.length, 1, JSON.stringify(opts)); assert.equal(opts[0].zoom, 0.8); assert.ok(opts[0].y > 2, 'aimed up at the cloud, not the ground');
});
// 登陸回合 live：每個人走到門口才藏起來，藏的時候不閃（blink.count 0）；下一回合開頭從門口（藏起來的地方）走出來回家、不閃
test('landing turn live: people vanish at their doors without a blink; the next turn they walk out of those doors', async () => {
  const h = await headlessShow(), { show, run } = h, order = SOLUTIONS[0];
  const evs = await turnWith(run, order, landing);
  const hide = show.roster.hide, hides = [];
  show.roster.hide = m => { hides.push({ m, blinks: show.blink.count, at: { ...m.pos } }); return hide(m); };
  try { await run(evs); } finally { show.roster.hide = hide; }
  assert.ok(hides.length >= 3, `${hides.length} people took shelter`);
  assert.ok(hides.every(x => x.blinks === 0), `nothing blinks while people hide (${hides.map(x => x.blinks)})`);
  const indoors = hides.filter(x => x.m.hidden && !x.m.gone);
  assert.ok(indoors.length >= 3, 'still indoors at the end of the landing turn');
  // 溫泉客躲進小澡堂（池子不能躲），不是在池邊原地不見（審查）
  const { BATHHOUSE } = await import('../src/actors/landmarks.js'), SP = landmarkWorld('spring'), bath = { x: SP.x + BATHHOUSE.x, z: SP.z + BATHHOUSE.z };
  const bathers = hides.filter(x => x.m.key === 'landmarks.bathers');
  assert.equal(bathers.length, 2, 'both bathers take shelter');
  for (const x of bathers) assert.ok(Math.hypot(x.at.x - bath.x, x.at.z - bath.z) < 0.6, `bather ${x.m.i} hides at the bathhouse (${Math.hypot(x.at.x - bath.x, x.at.z - bath.z).toFixed(2)})`);
  // 回合之間也照樣更新幾秒：躲著的人不在門裡亂走
  for (let i = 0; i < 60; i++) show.update(1 / 30, 200 + i / 30);
  for (const x of indoors) assert.ok(Math.hypot(x.m.pos.x - x.at.x, x.m.pos.z - x.at.z) < 1e-9, `${x.m.key} stays at the door`);
  // 下一回合（瞬間跑完前面的回合：只換到這一步的事件）live 演；物品 v2：颱風最後放，登陸在倒數第 1 回合，下一回合是倒數第 2 回合
  const steps = [...order.map(id => s => engine.place(s, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => s => engine.advance(s, spec))];
  let st = engine.createState(spec), k = 0;
  for (; k < steps.length; k++) { const r = steps[k](st); st = r.state; if (r.events.some(landing)) break; }
  const next = [...steps[k + 1](st).events, { kind: 'settle' }];
  const walker = show.blink.walker, blinked = new Set(); show.blink.walker = w => { blinked.add(w); return walker(w); };
  // 回合一開始就出發（第一個 0.5 秒內在走）、用走路速度（0.5 秒走了 0.4 以上；日常散步 0.5/s 只走得到 0.25）。
  // 家比 0.4 近的（物品 v2 正解的島民躲在家旁邊的門口）：0.5 秒內走到、走回家那段平均每秒 1.0 以上也算
  // （只算 arriving 那段的走路幀：走到家之後日常散步接著走開的不算進去，物品 v2 任務 4）
  // 走了多遠用沿路累加的距離（不是離起點的直線距離）：門口到家要繞過建築轉彎時，0.5 秒的直線位移會比走的路短（任務 8）
  const update = show.update, walked = new Set(), first = new Map(), early = new Map(), trip = new Map(); let frames = 0;
  show.update = (dt, t) => {
    update(dt, t); frames++;
    for (const x of indoors) {
      if (!first.has(x.m)) first.set(x.m, { ...x.m.pos, hidden: x.m.hidden });
      const f = first.get(x.m), d = Math.hypot(x.m.pos.x - f.x, x.m.pos.z - f.z), r = early.get(x.m) ?? { walk: 0, d: 0, home: false };
      if (frames <= 15 && !r.home) { if (x.m.walking) r.walk++; r.d = Math.max(r.d, d); r.home = r.walk > 0 && !x.m.arriving; early.set(x.m, r); }
      // 每幀最多算走路速度 × dt（一幀瞬移不算走路）
      const tr = trip.get(x.m) ?? { len: 0, at: { ...x.m.pos } }; tr.len += Math.min(Math.hypot(x.m.pos.x - tr.at.x, x.m.pos.z - tr.at.z), (x.m.speed ?? 1.6) * dt); tr.at = { ...x.m.pos }; trip.set(x.m, tr);
      if (frames <= 15 && x.m.walking && tr.len > 0.4) walked.add(x.m);
    }
  };
  const p = run(next);
  try { await p; } finally { show.update = update; show.blink.walker = walker; }
  for (const x of indoors) {
    const f = first.get(x.m);
    assert.equal(f.hidden, false, `${x.m.key} out on the first frame`);
    assert.ok(Math.hypot(f.x - x.at.x, f.z - x.at.z) < 0.15, `${x.m.key} comes out where it hid`);
    // 家就在門邊的不用走（物品 v2 正解登陸時巨蛋已經蓋好，球員的站位就在巨蛋門口）
    const r = early.get(x.m), arrived = r.home && r.d / (r.walk / 30) >= 1.0;
    if (Math.hypot(x.m.pos.x - x.at.x, x.m.pos.z - x.at.z) > 0.5) assert.ok(walked.has(x.m) || arrived, `${x.m.key} walks home at walking speed from the start of the turn`);
    assert.ok(!blinked.has(x.m.walker), `${x.m.key} does not blink`);
  }
});
// R13：玩家在回合中途拖過鏡頭 → 登陸的 focus('home') 不把鏡頭拉回全景、不清拖過的記號；只有回合最後的 home 照回並清掉
test('landing turn with the camera dragged mid-turn: no home before the turn-end one, which still flies home and clears the drag', async () => {
  const h = await headlessShow(), { show, rig } = h;
  const evs = await turnWith(h.run, SOLUTIONS[0], landing);
  const home = rig.home, homes = [];
  rig.home = ms => { homes.push({ grabbed: rig.grabbed }); return home(ms); };
  const p = show.turn(evs); let t = 0, done = false, grabbedUntilEnd = true;
  p.then(() => { done = true; });
  show.update(1 / 30, t); t += 1 / 30; rig.cancel(); const n1 = rig.log.length;   // 第一幀之後拖了一下
  while (!done) {
    if (!homes.length && !rig.grabbed) grabbedUntilEnd = false;
    show.update(1 / 30, t); t += 1 / 30; await Promise.resolve(); assert.ok(t < 120);
  }
  rig.home = home;
  assert.ok(show.stage.lv.typhoon === 2, 'landed');
  assert.equal(homes.length, 1, `exactly one home call (${JSON.stringify(homes)})`);
  assert.equal(homes[0].grabbed, true, 'the turn-end home is the one that ends the drag');
  assert.ok(grabbedUntilEnd, 'still dragged until the turn-end home');
  assert.equal(rig.grabbed, false, 'turn-end home clears the drag');
  assert.equal(rig.log.slice(n1).filter(([k]) => k === 'focus').length, 0, 'no focus while dragged');
});
