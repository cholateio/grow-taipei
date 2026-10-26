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
import { LAMP_STOPS } from '../src/actors/bulb.js';
import * as baseball from '../src/actors/baseball.js';
import * as milk from '../src/actors/milk.js';
import { worldEffects } from '../src/actors/world.js';
import { B } from '../src/show/beats.js';
import { headlessShow, playItem } from './helpers/show.js';
const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);
const N_STOPS = LAMP_STOPS.length;
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
  assert.ok(typhoon.script?.placed && typhoon.script.grow[2] && typhoon.script.grow[3] && typhoon.script.fx && typhoon.script.stall);
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
test('blackout: the lamp stops go out one per apply in reverse road order, then 101 ！, glow 0, the crate and LEVEL DOWN last', () => {
  const e = { kind: 'fx', item: 'milk', cause: 'typhoon', flag: { name: 'blackout', value: true }, lock: 'bulb', delta: { target: 'milk', from: 2, to: 1 } };
  const beats = flat(typhoon.script.fx(e, { lv: lv({ typhoon: 2, bulb: 2, milk: 1 }), flags: { blackout: true } }, fakeCtx()));
  const lamps = beats.filter(b => b.kind === 'apply' && Array.isArray(b.only) && b.only.some(k => k.startsWith('bulb.lamps.')));
  assert.deepEqual(lamps.map(b => b.only), Array.from({ length: N_STOPS }, (_, i) => [`bulb.lamps.${N_STOPS - 1 - i}`]));
  const kinds = beats.map(b => b.kind), w = beats.findIndex(b => b.kind === 'world');
  assert.deepEqual(beats[w].effects, { glowScale: 0 });
  assert.ok(kinds.indexOf('bubble') < w && w < kinds.lastIndexOf('apply'), 'lamps → ！ → glow 0 → crate');
  assert.ok(beats.at(-2).kind === 'apply' && beats.at(-2).only === undefined, 'crate and everything left in one apply: nothing blinks after LEVEL DOWN');
  assert.equal(beats.at(-1).kind, 'levelUp'); assert.equal(beats.at(-1).down, true);
  assert.equal(typhoon.script.fx({ kind: 'fx', cause: 'typhoon', story: '別的事' }, { lv: lv({}), flags: {} }, fakeCtx()), null);
});

const people = show => show.roster.keys().flatMap(k => show.roster.members(k)).filter(m => m.kind === 'people');
// 下限因 §13.2 降低：閃白 0.15 s（原白光 0.5）、spawn 不佔時間；入口走進場（計畫 3.8 後面的工作）會再拉長
const BOUNDS = { 1: [3, 6], 2: [3, 15], 3: [4, 15] };
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

// 照 order 放到 pred 命中的那一回合為止（之前的回合瞬間演），回傳那一回合的事件（含 settle）
async function turnWith(run, order, pred) {
  let s = engine.createState(spec);
  for (const id of order) {
    const r = engine.place(s, id, spec); s = r.state;
    if (r.events.some(pred)) return [...r.events, { kind: 'settle' }];
    await run([...r.events, { kind: 'settle' }], { instant: true });
  }
  throw new Error('turn not found');
}
const landing = e => e.kind === 'grow' && e.item === 'typhoon' && e.to === 2;
// 登陸回合整段 live 演（多個事件一回合：名單、門口都要演到才查）。回傳 { secs, seg, lamps }：
//   seg = 颱風那一段（登陸開始到最後一個颱風反應演完）；lamps = 路燈各站真的換掉（熄燈）的先後
async function playLanding(h, evs) {
  const { show, run, worldLog, bubblesLog } = h;
  const reacts = evs.filter(e => e.kind === 'fx' && e.cause === 'typhoon').map(e => e.flag?.name ?? e.delta?.target ?? e.story);
  const before = Array.from({ length: N_STOPS }, (_, k) => show.stage.partObject(`bulb.lamps.${k}`)), lamps = [], update = show.update;
  show.update = (dt, t) => { update(dt, t); before.forEach((o, k) => { const now = show.stage.partObject(`bulb.lamps.${k}`); if (o && !lamps.includes(k) && now !== o && now?.visible) lamps.push(k); }); };
  // 每個人是走到門口停下那一刻才藏起來（不是整群一起關掉）；記下藏的時候在不在走、離門口多遠
  const w0 = worldLog.length, hide = show.roster.hide, hides = [];
  show.roster.hide = m => { hides.push({ m, walking: m.walking }); return hide(m); };
  const n = bubblesLog.length, marks = [];
  let secs;
  try { secs = await run(evs, { onMark: e => marks.push([e, show.elapsed]) }); } finally { show.update = update; show.roster.hide = hide; }
  const i0 = marks.findIndex(([e]) => landing(e)), i1 = marks.findLastIndex(([e]) => e.kind === 'fx' && e.cause === 'typhoon');
  const seg = (marks[i1 + 1]?.[1] ?? secs) - marks[i0][1];
  const live = worldLog.slice(w0).filter(([, instant]) => !instant).map(([w]) => w);
  assert.ok(live.some(w => w.storm === 1 && w.rain === 1), `storm world ${JSON.stringify(live)}`);
  assert.ok(live.every(w => w.peopleVisible !== false), 'the whole people group is never switched off');
  assert.ok(hides.length > 0 && hides.every(h => !h.walking), 'people hidden only once they stop at a door');
  const bubbles = bubblesLog.slice(n);
  if (reacts.includes('blackout')) {
    assert.ok(live.some(w => w.glowScale === 0));
    const down = bubbles.find(b => b.text === 'LEVEL DOWN'), m = show.stage.headOf('milk');
    assert.ok(down && Math.hypot(down.at.x - m.x, down.at.z - m.z) < 0.3, 'LEVEL DOWN over milk');
  }
  if (reacts.includes('flooded')) {
    assert.equal(show.roster.members('token.staff').length, 0); assert.equal(show.roster.members('token.swimmers').length, 2);
    assert.ok(show.roster.members('token.swimmers').every(m => !m.hidden), 'swimmers shown');
    assert.ok(bubbles.some(b => b.kind === '！' && Math.hypot(b.at.x - anchorWorld('token').x, b.at.z - anchorWorld('token').z) < 2.5), 'staff ！ by the station');
  }
  if (reacts.includes('domeRats')) { const st = show.roster.members('baseball.staff'); assert.equal(st.length, 2); assert.ok(st.every(m => !m.hidden), 'dome staff visible'); }
  // 其他島上的人整回合躲著（淹水的站務員／泳客、巨蛋工作人員除外）
  const out = new Set(['token.swimmers', 'baseball.staff']);
  assert.ok(hides.filter(h => !out.has(h.m.key) && !h.m.gone).every(h => h.m.hidden), 'people stay indoors for the rest of the turn');
  if (reacts.includes('boba')) assert.ok(show.stage.partObject('typhoon.scooter')?.visible, 'delivery scooter revealed');
  if (reacts.some(k => k.includes('颱風假'))) assert.ok(bubbles.some(b => b.kind === '♪'), 'typhoon-day ♪');
  for (const k of show.roster.keys()) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', k);
  assert.equal(show.stage.lv.typhoon, 2);
  return { reacts, secs, seg, lamps };
}
// 引擎裡能讓登陸回合觸發最多反應的兩種放法（大停電與淹水不會同一回合：燈泡、代幣都 ≤2 時只有剛放的那個）
const BLACKOUT = ['rat', 'milk', 'baseball', 'boba', 'typhoon', 'bulb'], FLOOD = ['rat', 'milk', 'baseball', 'boba', 'typhoon', 'token'];
for (const [name, order, react] of [['blackout', BLACKOUT, 'blackout'], ['flood', FLOOD, 'flooded']]) {
  test(`landing turn with reactions (${name}, real engine) live as one turn: world order, people hide only at the doors, reactions land`, async () => {
    const h = await headlessShow();
    const { reacts } = await playLanding(h, await turnWith(h.run, order, landing));
    assert.ok(reacts.includes(react) && reacts.includes('domeRats') && reacts.includes('boba') && reacts.some(k => k.includes('颱風假')), `reactions ${reacts}`);
  });
}
// §8.5 的全套五個反應：引擎裡大停電只會碰到剛放下的燈泡（Lv1，還沒有路燈），也不會和淹水同回合——
// 自己堆出燈泡 Lv2、代幣 Lv2、鮮奶、珍奶、老鼠 Lv2、棒球 Lv3、颱風 Lv1（除了颱風都鎖住不長），下一回合登陸
test('landing with all five reactions (crafted state) live as one turn: 12–25 s, lamps out one stop at a time in reverse road order', async () => {
  const h = await headlessShow(), LV = { bulb: 2, token: 2, milk: 1, boba: 1, rat: 2, baseball: 3, typhoon: 1 };
  await h.run([...Object.entries(LV).flatMap(([item, to]) => [{ kind: 'placed', item, to: 1 }, ...Array.from({ length: to - 1 }, (_, i) => ({ kind: 'grow', item, from: i + 1, to: i + 2 }))]), { kind: 'settle' }], { instant: true });
  const st = engine.createState(spec);
  for (const [id, n] of Object.entries(LV)) { st.lv[id] = n; st.age[id] = 0; if (id !== 'typhoon') st.locked[id] = true; }
  const evs = [...engine.advance(st, spec).events, { kind: 'settle' }];
  const { reacts, secs, seg, lamps } = await playLanding(h, evs);
  assert.deepEqual(reacts.map(k => (k.includes('颱風假') ? 'story' : k)), ['blackout', 'flooded', 'domeRats', 'story', 'boba']);
  assert.ok(seg >= 12 && seg <= 25, `landing + reactions took ${seg.toFixed(1)}s (turn ${secs.toFixed(1)}s)`);
  assert.deepEqual(lamps, Array.from({ length: N_STOPS }, (_, i) => N_STOPS - 1 - i), 'one stop per apply, reverse road order');
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
// 引擎目前沒有颱風的 stall 規則：直接演一個 stall 事件
test('stall: the cloud drifts over the dome and stays there, then ……', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  await turnWith(run, BLACKOUT, landing).then(evs => run(evs, { instant: true }));
  const n = bubblesLog.length, secs = await run([{ kind: 'stall', item: 'typhoon' }]);
  assert.ok(secs >= 2 && secs <= 5, `stall took ${secs.toFixed(1)}s`);
  const o = show.stage.partObject('typhoon.main').position, dome = anchorWorld('baseball');
  assert.ok(Math.hypot(o.x - dome.x, o.z - dome.z) < 1e-6, 'cloud over the dome');
  assert.equal(bubblesLog.slice(n).at(-1)?.kind, '……');
});
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

// 颱風賴在巨蛋（棒球 ≥3 時 Lv3 長不出來，引擎沒有 stall 事件）：登陸回合過後，暴風雲停在巨蛋上空
test('view: the lingering Lv2 storm sits over the dome once baseball ≥ 3 (not on the landing turn)', () => {
  const dome = anchorWorld('baseball'), at = anchorWorld('typhoon'), near = (p, q) => Math.hypot(p.x - q.x, p.z - q.z) < 1e-9;
  assert.ok(near(typhoon.view(lv({ typhoon: 2, baseball: 3 }), {}, { landing: false })['typhoon.main'].at, dome));
  assert.ok(near(typhoon.view(lv({ typhoon: 2, baseball: 3 }), {}, { landing: true })['typhoon.main'].at, at));
  assert.ok(near(typhoon.view(lv({ typhoon: 2, baseball: 2 }), {}, { landing: false })['typhoon.main'].at, at));
  assert.ok(near(typhoon.view(lv({ typhoon: 1, baseball: 3 }), {}, {})['typhoon.main'].at, at));
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
test('focus: the cloud (placed, stall) frames the typhoon cell; landing, clearing and the blackout are island-wide; reactions focus where they happen', () => {
  const s = (extra, flags = {}) => ({ lv: lv({ typhoon: 2, ...extra }), flags });
  assert.deepEqual(firstFocus(typhoon.script.placed({ kind: 'placed', item: 'typhoon', to: 1 }, s({ typhoon: 1 }), fakeCtx())), [0, 0]);
  assert.deepEqual(firstFocus(typhoon.script.stall({ kind: 'stall', item: 'typhoon' }, s({}), fakeCtx())), [0, 0]);
  for (const to of [2, 3]) assert.equal(firstFocus(typhoon.script.grow[to]({ kind: 'grow', item: 'typhoon', from: to - 1, to }, s({ typhoon: to }), fakeCtx())), 'home', `grow ${to}`);
  const fx = (e, extra, flags) => firstFocus(typhoon.script.fx({ kind: 'fx', item: 'typhoon', cause: 'typhoon', ...e }, s(extra, flags), fakeCtx()));
  assert.equal(fx({ item: 'milk', flag: { name: 'blackout', value: true }, delta: { target: 'milk', from: 2, to: 1 } }, { bulb: 2, milk: 1 }, { blackout: true }), 'home');
  assert.deepEqual(fx({ flag: { name: 'flooded', value: true } }, { token: 2 }, { flooded: true }), cellOf('token'));
  assert.deepEqual(fx({ flag: { name: 'domeRats', value: true } }, { rat: 2, baseball: 3 }, { domeRats: true }), cellOf('baseball'));
  assert.deepEqual(fx({ story: '颱風假！小朋友在家看電視' }, { milk: 1 }), cellOf('milk'));
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
  // 下一回合（瞬間跑完前面的放置：只換到這一步的事件）live 演
  let st = engine.createState(spec);
  for (const id of order) { const r = engine.place(st, id, spec); st = r.state; if (r.events.some(landing)) break; }
  const next = [...engine.place(st, order[order.indexOf('typhoon') + 2], spec).events, { kind: 'settle' }];
  const walker = show.blink.walker, blinked = new Set(); show.blink.walker = w => { blinked.add(w); return walker(w); };
  // 回合一開始就出發（第一個 0.5 秒內在走）、用走路速度（0.5 秒走了 0.5 以上；日常散步 0.5/s 只走得到 0.25）
  const update = show.update, walked = new Set(), first = new Map(); let frames = 0;
  show.update = (dt, t) => {
    update(dt, t); frames++;
    for (const x of indoors) {
      if (!first.has(x.m)) first.set(x.m, { ...x.m.pos, hidden: x.m.hidden });
      const f = first.get(x.m);
      if (frames <= 15 && x.m.walking && Math.hypot(x.m.pos.x - f.x, x.m.pos.z - f.z) > 0.4) walked.add(x.m);
    }
  };
  const p = run(next);
  try { await p; } finally { show.update = update; show.blink.walker = walker; }
  for (const x of indoors) {
    const f = first.get(x.m);
    assert.equal(f.hidden, false, `${x.m.key} out on the first frame`);
    assert.ok(Math.hypot(f.x - x.at.x, f.z - x.at.z) < 0.15, `${x.m.key} comes out where it hid`);
    assert.ok(walked.has(x.m), `${x.m.key} walks home at walking speed from the start of the turn`);
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
