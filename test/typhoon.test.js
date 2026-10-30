import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as typhoon from '../src/actors/typhoon.js';
import { anchorWorld, cellOf, landmarkWorld } from '../src/actors/anchors.js';
import { lv, focusCell } from './helpers/actors.js';
import { createPartFactory } from '../src/actors/parts.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { cellAt } from '../src/scene/hex.js';

// 唯一正解 2026-10-31 §4.3：四站——Lv1 101 上空、Lv2 捷運站上空、Lv3 大巨蛋上空（暴風圈＋雨，有珍奶就有外送機車），Lv4 放晴（沒有雲、有彩虹）
// 修正輪 1：Lv1 停在颱風錨點（101 那一格、塔的旁邊）——停在塔正上方會被完工的 101 塔頂穿過
test('view: Lv1–3 the spinning storm ring sits next to 101 (typhoon anchor) / over the station / over the dome with rain; Lv4 no cloud, a rainbow and the riverside park', () => {
  const near = (p, q) => Math.hypot(p.x - q.x, p.z - q.z) < 1e-9;
  const t = anchorWorld('typhoon'), tw = anchorWorld('tower');
  assert.deepEqual(cellOf('typhoon'), cellOf('tower')); assert.ok(Math.hypot(t.x - tw.x, t.z - tw.z) > 1, 'next to the tower, not over its top');
  for (const [n, id] of [[1, 'typhoon'], [2, 'token'], [3, 'baseball']]) {
    const v = typhoon.view(lv({ typhoon: n }), {});
    assert.deepEqual(Object.keys(v), ['typhoon.main', 'typhoon.rain'], `Lv${n}`);
    assert.equal(v['typhoon.main'].kind, 'cloud'); assert.ok(v['typhoon.main'].spin > 0); assert.ok(v['typhoon.main'].parts.length >= 8);
    assert.ok(v['typhoon.main'].parts.every(p => p.pos[1] >= 4), 'high above the island');
    assert.ok(near(v['typhoon.main'].at, anchorWorld(id)), `Lv${n} over ${id}`);
    assert.equal(v['typhoon.rain'].kind, 'rain');
  }
  const v4 = typhoon.view(lv({ typhoon: 4 }), {});
  assert.equal(v4['typhoon.main'], undefined); assert.equal(v4['typhoon.rain'], undefined);
  assert.equal(v4['typhoon.rainbow'].parts.filter(p => p.kind === 'rail').length, 3);
  const park = landmarkWorld('park'); assert.ok(Math.hypot(v4['typhoon.park'].at.x - park.x, v4['typhoon.park'].at.z - park.z) < 1e-9);
});
test('delivery scooter rides in the rain at Lv1–3 with boba placed, gone at Lv4', () => {
  for (const n of [1, 2, 3]) {
    assert.equal(typhoon.view(lv({ typhoon: n }), {})['typhoon.scooter'], undefined);
    assert.equal(typhoon.view(lv({ typhoon: n, boba: 1 }), {})['typhoon.scooter'].kind, 'scooter');
  }
  assert.equal(typhoon.view(lv({ typhoon: 4, boba: 1 }), {})['typhoon.scooter'], undefined);
});
// 堤防（物品 v2 §4.5；唯一正解 Lv4）：主島外圍每條靠海的格邊一道矮牆（棒球格西南邊留給巨蛋捷運站的月台），在格面上、走路格外，
// 不算 footprint、一個零件一種顏色（1 個 draw call）
test('Lv4 levee: a low wall on every sea-facing edge of the main island, on the rim outside the walking grid; no footprint, one draw call', async () => {
  const { createNav } = await import('../src/show/nav.js');
  const { MAIN_CELLS, NEIGHBORS, cellTop } = await import('../src/scene/hex.js');
  for (const n of [1, 2, 3]) assert.equal(typhoon.view(lv({ typhoon: n }), {})['typhoon.levee'], undefined);
  const v = typhoon.view(lv({ typhoon: 4 }), {})['typhoon.levee'], nav = createNav();
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
  const v = typhoon.view(lv({ typhoon: 4 }), {})['typhoon.levee'], nav = createNav(), to = nav.nearestWalkable(RAT_LANDING);
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
// 計畫 3.6：放下之後移站的回合雨變小（app 把 weather.rain 淡到 0.35）
test('rain shows fewer, fainter drops when weather.rain is low', () => {
  const weather = { rain: 1 }, f = createPartFactory(THREE, { glow: createGlowRegistry(), builders: typhoon.builders, weather });
  const p = f.build(typhoon.view(lv({ typhoon: 2 }), {})['typhoon.rain']), mesh = p.object.children[0];
  p.update(0, 0.1); assert.equal(mesh.count, 240); const o = mesh.material.opacity;
  weather.rain = 0.35; p.update(0, 0.2); assert.equal(mesh.count, 84); assert.ok(mesh.material.opacity < o);
  const plain = createPartFactory(THREE, { glow: createGlowRegistry(), builders: typhoon.builders }).build(typhoon.view(lv({ typhoon: 2 }), {})['typhoon.rain']);
  plain.update(0, 0.1); assert.equal(plain.object.children[0].count, 240, 'no weather = full rain');
});

// ── 颱風劇本（§8.5；唯一正解 2026-10-31 §5.1）──
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { offset } from '../src/actors/palette.js';
import * as baseball from '../src/actors/baseball.js';
import * as milk from '../src/actors/milk.js';
import { worldEffects, LINGER } from '../src/actors/world.js';
import { B } from '../src/show/beats.js';
import { headlessShow, playItem, turnSteps, overviewRig, gameInvariants, SCRIPT_MAX, KEY_MAX } from './helpers/show.js';
// 唯一正解（§3）：颱風第 6 回合放下（到 101）、第 7 回合到車站、第 8 回合到巨蛋、最後一輪放晴
const SOLUTION = ['milk', 'baseball', 'token', 'bulb', 'chip', 'typhoon', 'boba', 'rat'];
const flat = bs => bs.flatMap(b => (b.kind === 'together' ? flat(b.beats) : [b]));
const fakeCtx = () => ({ B, roster: { members: () => [], keys: () => [] }, stage: {} });
const placedE = { kind: 'placed', item: 'typhoon', to: 1 }, growE = to => ({ kind: 'grow', item: 'typhoon', from: to - 1, to });
const landing = engine.landsTyphoon;   // 颱風到了 = 放下事件
const isGrow = n => e => e.kind === 'grow' && e.item === 'typhoon' && e.to === n;

test('view: Lv4 splits the rainbow into its own part (no cloud left); the cloud, rain and scooter have no footprint; ◆ placed and Lv4', () => {
  const v4 = typhoon.view(lv({ typhoon: 4, boba: 1 }), {});
  assert.equal(v4['typhoon.main'], undefined, 'no cloud at Lv4');
  assert.equal(v4['typhoon.rainbow'].footprint, false); assert.equal(v4['typhoon.rainbow'].parts.length, 3);
  assert.equal(Object.keys(v4)[0], 'typhoon.rainbow', 'rainbow first: LEVEL UP hangs on it');
  for (const n of [1, 2, 3]) assert.equal(typhoon.view(lv({ typhoon: n }), {})['typhoon.rainbow'], undefined);
  for (const n of [1, 2, 3]) { const v = typhoon.view(lv({ typhoon: n, boba: 1 }), {}); for (const k of ['typhoon.main', 'typhoon.rain', 'typhoon.scooter']) assert.equal(v[k].footprint, false, `${k} Lv${n}`); }
  assert.ok(typhoon.script?.placed && typhoon.script.grow[2] && typhoon.script.grow[3] && typhoon.script.grow[4]);
  assert.equal(typhoon.script.stall, undefined, 'no stall: the typhoon never waits (no delay)');
  assert.equal(typhoon.script.fx, undefined, 'the island checks are plain apply + LEVEL UP (turn.js), no reaction scripts');
  assert.equal(typhoon.script.placed.key, true, '◆ typhoon 1 (placed)'); assert.equal(typhoon.script.grow[4].key, true, '◆ typhoon 4');
  assert.ok(!typhoon.script.grow[2].key && !typhoon.script.grow[3].key, 'moving between stops is not ◆');
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
// 劇本的拍（建拍就看得到）：放下＝飄進來＋大雨＋全島躲門口、沒有 LEVEL UP；移站＝move 1.5 s＋LEVEL UP；放晴＝停雨
test('beats: placed flies in, pours (storm 1, rain 1) and sends the crowd to the doors without a LEVEL UP; Lv2/3 move 1.5 s then LEVEL UP; Lv4 stops the storm', () => {
  const s = n => ({ lv: lv({ typhoon: n }), flags: {} });
  const placed = flat(typhoon.script.placed(placedE, s(1), fakeCtx()));
  assert.ok(placed.some(b => b.kind === 'move' && b.dur === 2.5), 'flies in');
  assert.ok(placed.some(b => b.kind === 'world' && b.effects?.storm === 1 && b.effects?.rain === 1), 'storm 1, rain 1');
  assert.ok(placed.filter(b => b.kind === 'crowd').length >= 2, '！ and the door walks are crowd beats');
  assert.ok(!placed.some(b => b.kind === 'levelUp'), 'a placed event never shows LEVEL UP');
  // 修正輪 1：躲一下（wait）就放大家出來（home 拍），都在放下劇本裡——不是回合狀態
  const k = placed.findIndex(b => b.kind === 'wait');
  assert.ok(k > 0 && placed[k].dur > 0 && placed[k].dur <= 1 && placed.slice(k + 1).some(b => b.kind === 'home'), 'a short huddle, then everyone comes back out');
  assert.equal(placed.at(-1).kind, 'home', 'coming out is the last beat (the walk home is background)');
  for (const n of [2, 3]) {
    const beats = flat(typhoon.script.grow[n](growE(n), s(n), fakeCtx())), mv = beats.find(b => b.kind === 'move');
    assert.ok(mv && mv.dur === typhoon.HOP && typhoon.HOP === 1.5, `Lv${n} move 1.5 s`);
    assert.equal(beats.at(-1).kind, 'levelUp', `Lv${n} ends with LEVEL UP`);
    assert.ok(beats.findIndex(b => b.kind === 'move') < beats.findIndex(b => b.kind === 'levelUp'));
  }
  const clear = flat(typhoon.script.grow[4](growE(4), s(4), fakeCtx()));
  assert.ok(clear.some(b => b.kind === 'world' && b.effects?.storm === 0 && b.effects?.rain === 0)); assert.equal(clear.at(-1).kind, 'levelUp');
});
// 鏡頭（§13.1）：放下對著 101 上空，移站對著新的那一站上空，放晴是全島的事
const firstFocus = beats => { assert.equal(beats[0].kind, 'focus', 'the script starts with its own focus'); return beats[0].target === 'home' ? 'home' : focusCell(beats[0], fakeCtx()); };
test('focus: the cloud frames the 101 cell when placed, the station cell at Lv2, the dome cell at Lv3; clearing is island-wide', () => {
  const s = n => ({ lv: lv({ typhoon: n }), flags: {} });
  assert.deepEqual(firstFocus(typhoon.script.placed(placedE, s(1), fakeCtx())), cellOf('tower'));
  assert.deepEqual(firstFocus(typhoon.script.grow[2](growE(2), s(2), fakeCtx())), cellOf('token'));
  assert.deepEqual(firstFocus(typhoon.script.grow[3](growE(3), s(3), fakeCtx())), cellOf('baseball'));
  assert.equal(firstFocus(typhoon.script.grow[4](growE(4), s(4), fakeCtx())), 'home');
});

const people = show => show.roster.keys().flatMap(k => show.roster.members(k)).filter(m => m.kind === 'people');
// 一級的劇本秒數（不含鏡頭 focus 拍）：◆ 放下與放晴 ≤ KEY_MAX（8 s），移站 ≤ SCRIPT_MAX（4.5 s）
const BOUNDS = { 1: [3, KEY_MAX], 2: [1.5, SCRIPT_MAX], 3: [1.5, SCRIPT_MAX], 4: [3, KEY_MAX] };
function checkTyphoon({ show, bubblesLog }, e, secs, n) {
  const to = e.kind === 'grow' ? e.to : 1, what = `${e.kind} ${to}`, [lo, hi] = BOUNDS[to];
  assert.ok(secs >= lo && secs <= hi, `${what} took ${secs.toFixed(1)}s`);
  if (e.kind === 'grow') {
    const last = bubblesLog.slice(n).at(-1), h = show.stage.headOf('typhoon');
    assert.equal(last?.text, 'LEVEL UP', what); assert.ok(Math.hypot(last.at.x - h.x, last.at.y - h.y, last.at.z - h.z) < 0.3, `${what} LEVEL UP over typhoon`);
  } else assert.ok(!bubblesLog.slice(n).some(b => b.text === 'LEVEL UP'), 'no LEVEL UP for the placed event');
  for (const k of show.roster.keys()) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', `${what} ${k}`);
  // 修正輪 1：躲雨是放下劇本裡的一小段——每一級演完都沒有人藏著
  assert.ok(people(show).every(m => !m.hidden), `${what} nobody hidden`);
}
test('scripts: typhoon placed ◆ / Lv2 / Lv3 / Lv4 ◆ in the solution play within budget, LEVEL UP on the typhoon (not for placed), everyone home', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  let n = 0;
  const tracked = (evs, opts) => { if (!opts?.instant) n = bubblesLog.length; return run(evs, opts); };
  const seen = new Set(), at = {};
  await playItem(show, tracked, SOLUTION, 'typhoon', (e, secs) => {
    const to = e.kind === 'grow' ? e.to : 1; seen.add(to); checkTyphoon(h, e, secs, n);
    const o = show.stage.partObject('typhoon.main'); if (o) at[to] = { x: o.position.x, z: o.position.z };
  });
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4], `typhoon events seen: ${[...seen]}`);
  for (const [n, id] of [[1, 'typhoon'], [2, 'token'], [3, 'baseball']]) { const p = anchorWorld(id); assert.ok(Math.hypot(at[n].x - p.x, at[n].z - p.z) < 1e-6, `Lv${n}: the cloud ends over the ${id} anchor`); }
});

// 照 order 放（再長 CLOSING_TURNS 回合）到 pred 命中的那一回合為止（之前的回合瞬間演），回傳那一回合的事件（含 settle）
async function turnWith(run, order, pred) {
  let s = engine.createState(spec);
  for (const step of turnSteps(order)) {
    const r = step(s); s = r.state;
    if (r.events.some(pred)) return [...r.events, { kind: 'settle' }];
    await run([...r.events, { kind: 'settle' }], { instant: true });
  }
  throw new Error('turn not found');
}
const ACTORS = await Promise.all(spec.ORDER.map(id => import(`../src/actors/${id}.js`)));
const isKey = e => e.kind === 'grow' && !!ACTORS.find(m => m.id === e.item)?.script?.grow?.[e.to]?.key;
// 放下回合整段 live 演（名單、門口都要演到才查）。修正輪 1：躲雨是放下劇本裡的一小段——跑到門口躲一下、又走出來淋雨；
// 同一回合後面的事件照一般事件演。回傳 { reacts, seg, after, hides }：seg = 放下那一段的秒數；after = 之後每個事件 [e, 秒數]；
// hides：每個躲進門的人 { m, walking（藏的那一刻在走嗎）, blinks（那一刻有幾個東西在閃）, at（藏的位置）, out（露出來的位置）}
async function playLanding(h, evs, opts = {}) {
  const { show, run, worldLog, bubblesLog } = h;
  const reacts = evs.filter(e => e.kind === 'fx' && e.cause === 'typhoon').map(e => e.flag?.name ?? e.delta?.target ?? e.story);
  const w0 = worldLog.length, hide = show.roster.hide, unhide = show.roster.show, hides = [];
  show.roster.hide = m => { hides.push({ m, walking: m.walking, blinks: show.blink.count, at: { ...m.pos }, out: null }); return hide(m); };
  show.roster.show = m => { const x = hides.find(x => x.m === m && !x.out); if (x) x.out = { ...m.pos }; return unhide(m); };
  // LEVEL DOWN 冒出來那一刻鮮奶的頭頂（大停電掉回一級之後，同一回合鮮奶又可能長回去，回合末的頭頂換了建築）
  const levelUp = show.bubbles.levelUp, downs = [];
  show.bubbles.levelUp = (head, o = {}) => { if (o.down) downs.push({ at: head(), milk: show.stage.headOf('milk') }); return levelUp(head, o); };
  const n = bubblesLog.length, marks = [];
  let hiddenAfter = null;
  try {
    await run(evs, { ...opts, onMark: e => {
      // 放下那一段演完（下一個事件開始）的那一刻：沒有人還藏著
      if (hiddenAfter === null && marks.some(([x]) => landing(x)) && !landing(e)) hiddenAfter = people(show).filter(m => m.hidden).length;
      marks.push([e, show.elapsed, bubblesLog.length]);
    } });
  } finally { show.roster.hide = hide; show.roster.show = unhide; show.bubbles.levelUp = levelUp; }
  const i0 = marks.findIndex(([e]) => landing(e)), at = k => marks[k]?.[1] ?? show.elapsed;
  const seg = at(i0 + 1) - at(i0), after = marks.slice(i0 + 1).map(([e], k) => [e, at(i0 + 2 + k) - at(i0 + 1 + k)]);
  const live = worldLog.slice(w0).filter(([, instant]) => !instant).map(([w]) => w);
  assert.ok(live.some(w => w.storm === 1 && w.rain === 1), `storm world ${JSON.stringify(live)}`);
  assert.ok(live.every(w => w.peopleVisible !== false), 'the whole people group is never switched off');
  assert.ok(hides.length > 0 && hides.every(h => !h.walking), 'people hidden only once they stop at a door');
  assert.ok(hides.every(x => x.blinks === 0), `nothing blinks while people hide (${hides.map(x => x.blinks)})`);
  assert.ok(hides.filter(x => !x.m.gone).every(x => x.out && Math.hypot(x.out.x - x.at.x, x.out.z - x.at.z) < 1e-9), 'everybody comes back out of the door where they hid');
  assert.equal(hiddenAfter ?? people(show).filter(m => m.hidden).length, 0, 'nobody still hidden when the placed segment ends');
  const bubbles = bubblesLog.slice(n);
  if (reacts.includes('blackout')) assert.ok(live.some(w => w.glowScale === 0));
  if (evs.some(e => e.flag?.name === 'blackout' && e.delta?.to < e.delta?.from)) {   // 鮮奶真的掉級才有 LEVEL DOWN（Lv1 掉不下去）
    assert.ok(bubbles.some(b => b.text === 'LEVEL DOWN'), 'LEVEL DOWN');
    assert.ok(downs.some(d => Math.hypot(d.at.x - d.milk.x, d.at.z - d.milk.z) < 0.3), 'LEVEL DOWN over milk');
  }
  assert.ok(people(show).every(m => !m.hidden), 'nobody hidden at the end of the turn');
  for (const k of show.roster.keys()) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', k);
  assert.equal(show.stage.lv.typhoon, 1);
  return { reacts, seg, after, hides };
}
// 放下的反應（§4.3）：燈泡在場且 ≤2 → 大停電（鎖燈泡、鮮奶 −1）；颱風假。最短的放法（窮舉）：鮮奶 → 燈泡 → 颱風
test('placement turn with reactions (blackout, real engine) live as one turn: the ◆ landing ≤ 8 s, people hide at the doors and come back out, the blackout lands', async () => {
  const h = await headlessShow();
  const { reacts, seg } = await playLanding(h, await turnWith(h.run, ['milk', 'bulb', 'typhoon'], landing));
  assert.ok(reacts.includes('blackout') && reacts.some(k => k.includes('颱風假')), `reactions ${reacts}`);
  assert.ok(seg <= KEY_MAX, `landing ${seg.toFixed(1)} s`);
});
// 正解的放下回合（第 6 回合）：颱風假；躲一下又出來之後，同一回合的升級照一般事件演——◆ 鮮奶 7（大學）的小孩走去拱門、跳起來
test('the solution placement turn live: the ◆ landing ≤ 8 s live; afterwards the turn plays normally (◆ milk 7 gathers the kids, later grows are not cut to apply + LEVEL UP)', async () => {
  const h = await headlessShow(), { show } = h, walking = new Set(), update = show.update;
  let after0 = false;
  show.update = (dt, t) => { update(dt, t); if (after0) for (const m of show.roster.members('milk.kids')) if (m.mode === 'script' && m.walking) walking.add(m); };
  const evs = await turnWith(h.run, SOLUTION, landing);
  const run = h.run; h.run = (e, o) => run(e, { ...o, onMark: x => { if (!landing(x) && evs.indexOf(x) > evs.findIndex(landing)) after0 = true; o?.onMark?.(x); } });
  let res;
  try { res = await playLanding(h, evs); } finally { show.update = update; h.run = run; }
  const { reacts, seg, after } = res;
  assert.ok(reacts.some(k => k.includes('颱風假')), `reactions ${reacts}`);
  assert.ok(seg <= KEY_MAX, `landing ${seg.toFixed(1)} s`);
  const milk7 = after.findLast(([e]) => e.kind === 'grow' && e.item === 'milk' && e.to === 7);   // 最後一個 mark 是劇本（前一個是起因段）
  assert.ok(milk7 && milk7[1] > 4, `◆ milk 7 plays its whole script (${milk7?.[1].toFixed(1)} s)`);
  assert.ok(walking.size >= 2, `the kids walk to the arch (${walking.size})`);
});
// 移站回合（§4.3）：車站上空淹水（代幣 ≤3）＋外送爆單；巨蛋上空大巨蛋淹水（棒球 ≤3）或鼠災
for (const [name, order, n, need] of [
  ['flood and delivery', ['token', 'typhoon', 'boba'], 2, ['flooded', 'boba']],
  ['dome flood', ['milk', 'baseball', 'typhoon', 'chip', 'bulb'], 3, ['domeFlood']],   // 巨蛋（棒球 Lv3）蓋好了、還沒開賽
  ['dome rats', ['milk', 'token', 'rat', 'baseball', 'typhoon', 'chip', 'bulb'], 3, ['domeRats']],
]) {
  test(`Lv${n} turn with reactions (${name}, real engine) live: the cloud flies in from the last stop, ≤ 4.5 s, nobody hides, the reactions play; invariants clean`, async () => {
    const h = await headlessShow(), { show, run, worldLog } = h;
    const evs = await turnWith(run, order, isGrow(n)), reacts = evs.filter(e => e.kind === 'fx' && e.cause === 'typhoon').map(e => e.flag?.name ?? e.delta?.target);
    assert.ok(need.every(k => reacts.includes(k)), `reactions ${reacts}`);
    const inv = gameInvariants(show);
    const prev = anchorWorld(n === 2 ? 'typhoon' : 'token'), stop = anchorWorld(n === 2 ? 'token' : 'baseball'), trail = [], marks = [], w0 = worldLog.length;
    const update = show.update;
    show.update = (dt, t) => { update(dt, t); const o = show.stage.partObject('typhoon.main'); if (o && show.stage.lv.typhoon === n) trail.push({ x: o.position.x, z: o.position.z }); };
    try { await run(evs, { onMark: e => marks.push([e, show.elapsed]) }); } finally { show.update = update; }
    const k = marks.findIndex(([e]) => isGrow(n)(e)), secs = (marks[k + 1]?.[1] ?? show.elapsed) - marks[k][1];
    assert.ok(secs <= SCRIPT_MAX + 0.8 + 0.4, `Lv${n} live ${secs.toFixed(1)} s (script ≤ 4.5 plus its pan / gap)`);
    assert.ok(trail.length && Math.hypot(trail[0].x - prev.x, trail[0].z - prev.z) < 0.3, 'the cloud starts at the previous stop');
    assert.ok(Math.hypot(trail.at(-1).x - stop.x, trail.at(-1).z - stop.z) < 1e-6, 'and ends over the new stop');
    assert.ok(people(show).every(m => !m.hidden), 'nobody hides on a moving turn');
    const live = worldLog.slice(w0).filter(([, instant]) => !instant).map(([w]) => w);
    assert.ok(live.some(w => w.storm === LINGER) && live.every(w => w.storm !== 0), `lighter rain while the storm moves on (${live.map(w => w.storm)})`);
    if (reacts.includes('flooded')) { assert.equal(show.roster.members('token.staff').length, 0); assert.equal(show.roster.members('token.swimmers').length, 2); }
    if (reacts.includes('boba')) assert.ok(show.stage.partObject('typhoon.scooter')?.visible, 'delivery scooter out in the rain');
    if (reacts.includes('domeRats')) assert.equal(show.roster.members('baseball.staff').length, 2);
    if (reacts.includes('domeFlood')) {
      // 修正輪 1（疑慮 4）：兩個球員在巨蛋淹水那一回合裡就爬上屋頂（y ≥ 巨蛋頂 − 0.05），一路上不瞬移、換位置不偷偷跳
      assert.ok(show.stage.partObject('baseball.field'), 'the field is a pool');
      const roof = show.roster.members('baseball.players'), dome = anchorWorld('baseball'), top = dome.y + baseball.DOME_H.a;
      assert.equal(roof.length, 2);
      assert.ok(roof.every(m => m.pos.y >= top - 0.05 && Math.hypot(m.pos.x - dome.x, m.pos.z - dome.z) < 0.4), `players up on the roof by the end of the turn (${roof.map(m => `${m.pos.x.toFixed(2)},${m.pos.y.toFixed(2)},${m.pos.z.toFixed(2)}`)})`);
    }
    assert.deepEqual([...inv.pops].slice(0, 10), [], `${inv.pops.size} silent relocations`);
    assert.deepEqual([...inv.jumps].slice(0, 10), [], `${inv.jumps.size} frame jumps`);
    assert.deepEqual([...inv.walls].slice(0, 10), [], `${inv.walls.size} inside a building`);
    for (const kk of show.roster.keys()) for (const m of show.roster.members(kk)) assert.equal(m.mode, 'home', kk);
  });
}
// 放下的反應（自己堆的狀態）：燈泡 Lv2（≤2）在場、鮮奶在場 → 大停電＋颱風假
test('placement with the blackout (crafted state) live as one turn: the landing 3–8 s; the blackout plays as apply + LEVEL DOWN', async () => {
  const h = await headlessShow(), LV = { bulb: 2, milk: 3, boba: 2, rat: 2, baseball: 3 };
  await h.run([...Object.entries(LV).flatMap(([item, to]) => [{ kind: 'placed', item, to: 1 }, ...Array.from({ length: to - 1 }, (_, i) => ({ kind: 'grow', item, from: i + 1, to: i + 2 }))]), { kind: 'settle' }], { instant: true });
  const st = engine.createState(spec);
  for (const [id, n] of Object.entries(LV)) { st.lv[id] = n; st.age[id] = 0; st.locked[id] = true; }
  const evs = [...engine.place(st, 'typhoon', spec).events, { kind: 'settle' }];
  const { reacts, seg, after } = await playLanding(h, evs);
  assert.deepEqual(reacts.map(k => (k.includes('颱風假') ? 'story' : k)), ['blackout', 'story']);
  assert.ok(seg >= 3 && seg <= KEY_MAX, `landing took ${seg.toFixed(1)} s`);
  for (const [e, t] of after) if (e.kind === 'fx') assert.ok(t <= 2.6, `${e.flag?.name ?? e.story ?? ''} took ${t.toFixed(2)} s`);
});
// 選擇帶動升級（計畫 5b 任務 3）：♪ 只給主島上的人——正解的最後一輪真的有人冒 ♪（不是篩完空了）
test('Lv4: the sky clears, nobody is hidden, the rainbow is standing, and the main-island crowd sings ♪', async () => {
  const h = await headlessShow(), { show, run, worldLog, bubblesLog } = h;
  const evs = await turnWith(run, SOLUTION, isGrow(4));
  const w0 = worldLog.length, notes = [];
  let from = null;
  await run(evs, { onMark: e => { if (from !== null) { notes.push(...bubblesLog.slice(from)); from = null; } if (isGrow(4)(e)) from = bubblesLog.length; } });
  if (from !== null) notes.push(...bubblesLog.slice(from));
  const live = worldLog.slice(w0).filter(([, instant]) => !instant).map(([w]) => w);
  assert.ok(live.some(w => w.storm === 0 && w.rain === 0), JSON.stringify(live));
  assert.ok(live.every(w => !('peopleVisible' in w) || w.peopleVisible), 'no people switch in the script');
  assert.ok(people(show).every(m => !m.hidden));
  assert.equal(show.stage.partObject('typhoon.main'), null);
  assert.equal(show.stage.partObject('typhoon.rainbow').scale.y, 1);
  const sing = notes.filter(b => b.kind === '♪');
  assert.ok(sing.length >= 3, `${sing.length} ♪ in the Lv4 crowd`);
  assert.ok(sing.every(b => cellAt(b.at.x, b.at.z)), '♪ only over the main island');
});
test('skip during the door walks: everyone home and visible, world snapped to the storm, typhoon at Lv1', async () => {
  const h = await headlessShow(), { show, run, worldLog } = h;
  const evs = await turnWith(run, SOLUTION, landing);
  const p = show.turn(evs);
  let t = 0;
  while (!people(show).some(m => m.mode === 'script' && m.walking)) { show.update(1 / 30, t); t += 1 / 30; assert.ok(t < 20, 'door walks start'); }
  show.skip(); await p;
  for (const k of show.roster.keys()) for (const m of show.roster.members(k)) { assert.equal(m.mode, 'home', k); assert.equal(m.hidden, false, k); }
  assert.equal(show.stage.lv.typhoon, 1);
  const [w, instant] = worldLog.at(-1);
  assert.equal(instant, true); assert.deepEqual(w, worldEffects(show.stage.lv, show.stage.flags, show.stage.meta)); assert.equal(w.storm, 1);
});
test('placed live: the camera frames the cloud next to 101 (typhoon anchor) at zoom 0.8, then home', async () => {
  const h = await headlessShow(); let n0 = 0, opts = null;
  await playItem(h.show, (evs, o) => { if (!o?.instant) n0 = h.rig.log.length; return h.run(evs, o); }, SOLUTION, 'typhoon', e => {
    if (e.kind === 'placed') opts = h.rig.log.slice(n0).filter(([k]) => k === 'focus').map(([, t, o]) => ({ t, zoom: o.zoom }));
  });
  const p = anchorWorld('typhoon');
  assert.equal(opts.length, 1, JSON.stringify(opts)); assert.equal(opts[0].zoom, 0.8); assert.ok(opts[0].t.y > 2, 'aimed up at the cloud, not the ground');
  assert.ok(Math.hypot(opts[0].t.x - p.x, opts[0].t.z - p.z) < 1e-9, 'over the typhoon anchor');
});
// 放下回合 live：每個人走到門口才藏起來，藏的時候不閃（blink.count 0）；躲一下就從同一個門口露出來（不閃）、用走路速度走回家；
// 溫泉客躲進小澡堂（池子不能躲），不是在池邊原地不見（審查）
test('placement turn live: people vanish at their doors without a blink, then step out of those doors and walk home at walking speed without a blink', async () => {
  const h = await headlessShow(), { show, run } = h;
  const evs = await turnWith(run, SOLUTION, landing);
  // 只看放下那一段（之後同一回合別的劇本換配件、換位置的閃白不算）
  let inPlaced = false;
  const walker = show.blink.walker, blinked = new Set(); show.blink.walker = w => { if (inPlaced) blinked.add(w); return walker(w); };
  const run0 = h.run; h.run = (e, o) => run0(e, { ...o, onMark: x => { inPlaced = landing(x); o?.onMark?.(x); } });
  const update = show.update, trips = new Map();
  show.update = (dt, t) => {
    update(dt, t);
    for (const m of people(show)) {
      const tr = trips.get(m); if (!tr || tr.done) continue;
      if (!m.hidden && tr.outAt === null) tr.outAt = t;
      if (tr.outAt !== null) { tr.frames++; if (m.walking) tr.walk++; tr.len += Math.min(Math.hypot(m.pos.x - tr.at.x, m.pos.z - tr.at.z), (m.speed ?? 1.6) * dt); tr.at = { ...m.pos }; if (tr.frames >= 15) tr.done = true; }
    }
  };
  const hide = show.roster.hide;
  show.roster.hide = m => { trips.set(m, { outAt: null, frames: 0, walk: 0, len: 0, at: { ...m.pos }, hidAt: { ...m.pos }, done: false }); blinked.clear(); return hide(m); };
  let res;
  try { res = await playLanding(h, evs); } finally { show.update = update; show.blink.walker = walker; show.roster.hide = hide; h.run = run0; }
  const { hides } = res;
  assert.ok(hides.length >= 3, `${hides.length} people took shelter`);
  const { BATHHOUSE } = await import('../src/actors/landmarks.js'), SP = landmarkWorld('spring'), bath = { x: SP.x + BATHHOUSE.x, z: SP.z + BATHHOUSE.z };
  const bathers = hides.filter(x => x.m.key === 'landmarks.bathers');
  assert.equal(bathers.length, 2, 'both bathers take shelter');
  for (const x of bathers) assert.ok(Math.hypot(x.at.x - bath.x, x.at.z - bath.z) < 0.6, `bather ${x.m.i} hides at the bathhouse (${Math.hypot(x.at.x - bath.x, x.at.z - bath.z).toFixed(2)})`);
  // 走出來之後的前 0.5 秒：家比 0.4 遠的人在走、走得比日常散步快（0.5 s 走了 0.4 以上；散步 0.5/s 只走得到 0.25）
  for (const x of hides) {
    const tr = trips.get(x.m); if (x.m.gone) continue;
    assert.ok(tr.outAt !== null, `${x.m.key} comes out`);
    assert.ok(!blinked.has(x.m.walker), `${x.m.key} does not blink coming out`);
    if (tr.walk >= 10) assert.ok(tr.len > 0.4, `${x.m.key} walks home at walking speed (${tr.len.toFixed(2)} in 0.5 s)`);
  }
  assert.ok(hides.filter(x => trips.get(x.m).walk >= 10).length >= 3, 'several people walk home from the doors');
});
// R13：玩家在回合中途拖過鏡頭 → 放下劇本中途的 focus('home') 不把鏡頭拉回全景、不清拖過的記號；只有回合最後的 home 照回並清掉
test('landing turn with the camera dragged mid-turn: no home before the turn-end one, which still flies home and clears the drag', async () => {
  const h = await headlessShow(), { show, rig } = h;
  const evs = await turnWith(h.run, SOLUTION, landing);
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
  assert.ok(show.stage.lv.typhoon === 1, 'landed');
  assert.equal(homes.length, 1, `exactly one home call (${JSON.stringify(homes)})`);
  assert.equal(homes[0].grabbed, true, 'the turn-end home is the one that ends the drag');
  assert.ok(grabbedUntilEnd, 'still dragged until the turn-end home');
  assert.equal(rig.grabbed, false, 'turn-end home clears the drag');
  assert.equal(rig.log.slice(n1).filter(([k]) => k === 'focus').length, 0, 'no focus while dragged');
});


// 正解整局 live（真的鏡頭 rig）：共用不變式乾淨（不穿牆、不瞬移、換位置閃白、回全景、標籤在畫面裡）；颱風四段——◆ 放下與放晴 live ≤ 8 s，
// 移站劇本 ≤ 4.5 s；第 6 回合放下之後的事件 indoors，第 7 回合（Lv2）之後的事件照常（有走路、有泡泡）
test('the solution live with the real rig: invariants clean; ◆ placed / Lv4 ≤ 8 s live, Lv2 / Lv3 scripts ≤ 4.5 s', async () => {
  const cam = overviewRig(), { show, run, scriptElapsed } = await headlessShow({ rig: cam.rig }), inv = gameInvariants(show, { cam });
  let s = engine.createState(spec);
  const seg = {};
  for (const [i, step] of turnSteps(SOLUTION).entries()) {
    const r = step(s); s = r.state;
    const what = `turn ${i + 1}`, marks = [];
    inv.label(what);
    await run([...r.events, { kind: 'settle' }], { onMark: (e, info) => { inv.label(`${what} [${e.kind} ${e.item ?? ''}${e.to ?? ''}]`); marks.push([e, show.elapsed, scriptElapsed(), info]); } });
    inv.turnEnd();
    marks.forEach(([e, t, sc, info], j) => {
      if (e.item !== 'typhoon' || (e.kind !== 'placed' && e.kind !== 'grow')) return;
      const next = marks[j + 1], to = e.kind === 'grow' ? e.to : 1;
      seg[to] = { turn: i + 1, key: !!info?.key, live: (next?.[1] ?? show.elapsed) - t - (info?.gap ?? 0), script: (next?.[2] ?? scriptElapsed()) - sc - (info?.gap ?? 0) };
    });
  }
  assert.deepEqual(Object.keys(seg).map(Number), [1, 2, 3, 4]);
  assert.deepEqual([seg[1].turn, seg[2].turn, seg[3].turn, seg[4].turn], [6, 7, 8, 9]);
  assert.ok(seg[1].key && seg[4].key && !seg[2].key && !seg[3].key, '◆ placed and Lv4');
  for (const n of [1, 4]) assert.ok(seg[n].live <= KEY_MAX, `◆ typhoon ${n} live ${seg[n].live.toFixed(2)} s`);
  for (const n of [2, 3]) assert.ok(seg[n].script <= SCRIPT_MAX, `typhoon ${n} script ${seg[n].script.toFixed(2)} s`);
  assert.deepEqual([...inv.walls].slice(0, 20), [], `${inv.walls.size} inside a building`);
  assert.deepEqual([...inv.jumps].slice(0, 20), [], `${inv.jumps.size} frame jumps`);
  assert.deepEqual([...inv.pops].slice(0, 20), [], `${inv.pops.size} silent relocations`);
  assert.deepEqual(inv.camera, []);
  assert.deepEqual(inv.labels, []);
});

// 拜訪點（計畫 6 設計 §4）：颱風是天氣——沒有人拜訪它，每一級、任何舞台都回 null
test('visitSpot(n, s) is null for every typhoon level (nobody visits the weather)', () => {
  assert.equal(typeof typhoon.visitSpot, 'function');
  for (let n = 0; n <= spec.ITEMS.typhoon.max; n++) for (const flags of [{}, { blackout: true }, { flooded: true }]) assert.equal(typhoon.visitSpot(n, { lv: lv({ typhoon: n }), flags }), null);
});
