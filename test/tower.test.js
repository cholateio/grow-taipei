import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as tower from '../src/actors/tower.js';
import { anchorWorld, frontOf, cellCentre } from '../src/actors/anchors.js';
import { createPartFactory } from '../src/actors/parts.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { B } from '../src/show/beats.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { headlessShow } from './helpers/show.js';
import { createCameraRig } from '../src/scene/camera.js';
import { existsSync } from 'node:fs';
import { C } from '../src/actors/palette.js';
import { MAIN_CELLS, axialToWorld, hexCorners, R } from '../src/scene/hex.js';
const PALETTE = new Set(Object.values(C));
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
// 物品 v2 §4.3：晶片 Lv7 天線（Cyberpunk Kit glb，零件搭列車來）、Lv8 矽盾測試、Lv9 待命（天線每 3 秒閃一圈、罩子淡淡常駐）
test('antenna (Cyberpunk Kit glb + ring) appears at chip 7 and pulses from chip 9; shield: test at chip 8, standby from 9; light show needs bulb 5', () => {
  assert.equal(tower.view({ ...zero, chip: 6 }, {})['tower.antenna'], undefined);
  const a7 = tower.view({ ...zero, chip: 7 }, {})['tower.antenna'], a9 = tower.view({ ...zero, chip: 9 }, {})['tower.antenna'];
  assert.equal(a7.kind, 'antenna'); assert.equal(a7.pulse, false); assert.equal(a9.pulse, true);
  assert.deepEqual(a7.models.map(m => m.path).sort(), ['quat/cyberpunk/Antenna_1.glb', 'quat/cyberpunk/Antenna_2.glb']);
  for (const m of a7.models) { assert.ok(existsSync(new URL(`../assets/${m.path}`, import.meta.url)), m.path); for (const c of Object.values(m.tint)) assert.ok(PALETTE.has(c), `${m.path} tint ${c.toString(16)}`); }
  assert.ok(!a7.parts.some(p => p.glow) && a9.parts.every(p => p.glow === 0x3fe0ff), 'the ring glows (one colour) once on standby');
  assert.equal(tower.view({ ...zero, chip: 7 }, {})['tower.shield'], undefined);
  assert.equal(tower.view({ ...zero, chip: 8 }, {})['tower.shield'].state, 'test');
  assert.equal(tower.view({ ...zero, chip: 9 }, {})['tower.shield'].state, 'standby');
  assert.deepEqual(tower.shieldSpec('full'), { ...tower.view({ ...zero, chip: 9 }, {})['tower.shield'], state: 'full' }, 'the ending (plan 5) uses the same dome, fully lit');
  assert.equal(tower.view({ ...zero, bulb: 4 }, {})['tower.show'], undefined);
  assert.equal(tower.view({ ...zero, bulb: 5 }, {})['tower.show'].kind, 'lightshow');
});
test('the antenna sits on the spire top of whatever stage the tower is in', () => {
  for (const total of [0, 10, 20, 31]) {
    const v = tower.view(lvOf(total, { chip: 7 }), {}, { total }), top = Math.max(...v['tower.main'].parts.map(p => p.pos[1] + (Array.isArray(p.scale) ? p.scale[1] : p.scale) / 2));
    const a = v['tower.antenna'];
    assert.ok(Math.abs(a.parts[0].pos[1] - top) < 0.6, `ring at the top (${total})`);
    for (const m of a.models) assert.ok(m.pos[1] > top - 0.7 && m.pos[1] <= top + 0.01, `${m.path} on the spire (${total})`);
  }
});
test('the shield is a hemisphere centred on the 101 base that covers every corner of the six main cells around it', () => {
  const s = tower.view({ ...zero, chip: 9 }, {})['tower.shield'], a = anchorWorld('tower');
  assert.equal(s.kind, 'shield'); assert.deepEqual(s.at, a); assert.equal(s.footprint, false);
  assert.ok(s.r >= 7 && s.r <= 8, `r ${s.r}`);
  for (const cell of MAIN_CELLS) { const c = axialToWorld(...cell); for (const p of hexCorners(c.x, c.z, R)) assert.ok(Math.hypot(p.x - a.x, p.z - a.z) < s.r, `corner of ${cell} (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`); }
});
test('all tower parts stand on the tower anchor', () => {
  const a = anchorWorld('tower');
  for (const v of [tower.view(zero, {}), tower.view(lvOf(31, { chip: 9, bulb: 5 }), {})]) for (const k in v) assert.deepEqual(v[k].at, a, k);
});
test('crane, antenna pulse and lightshow builders animate', () => {
  const glow = createGlowRegistry(); glow.setNight(1);
  const f = createPartFactory(THREE, { glow, people: null, assets: { spawn: async () => new THREE.Group() }, builders: tower.builders });
  const crane = f.build(tower.view(zero, {})['tower.crane']); const jib = crane.object.getObjectByName('jib');
  crane.update(0.1, 1); const r1 = jib.rotation.y; crane.update(0.1, 3); assert.notEqual(jib.rotation.y, r1);
  const pulse = f.build(tower.view({ ...zero, chip: 9 }, {})['tower.antenna']); const m = pulse.materials[0];
  pulse.update(0.1, 0.75); const a = m.emissiveIntensity; pulse.update(0.1, 2.25); assert.notEqual(m.emissiveIntensity, a);
  pulse.update(0.1, 3.75); assert.ok(Math.abs(m.emissiveIntensity - a) < 1e-9, 'every 3 s');
  const still = f.build(tower.view({ ...zero, chip: 7 }, {})['tower.antenna']); assert.equal(still.update, undefined, 'Lv7 antenna does not pulse');
  const show = f.build(tower.view({ ...zero, bulb: 5 }, {})['tower.show']); const c0 = show.materials[0].emissive.getHex();
  show.update(0.1, 1); assert.notEqual(show.materials[0].emissive.getHex(), c0);
  for (const p of [crane, pulse, still, show]) p.dispose?.(); assert.equal(glow.size, 0);
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

test('settle crossing 8→9 yields focus(tower) + walk + build + focus(home) + apply + levelUp「101 蓋一半」+ home; 8→8 and 9→18 yield nothing', () => {
  const ctx = { B, roster: fakeRoster({}) }, e = { kind: 'settle' };
  const beats = tower.script.settle(e, { total: 9, prevTotal: 8 }, ctx);
  assert.deepEqual(beats.map(b => b.kind), ['focus', 'walk', 'gesture', 'focus', 'apply', 'levelUp', 'home']);
  // 先對著 101 那一格；換零件前回全景（不是回合最後那拍：照樣尊重拖過），停 0.8 s 讓鏡頭飛到
  assert.equal(beats[0].target, 'tower'); assert.equal(beats[3].target, 'home'); assert.equal(beats[3].final, false); assert.equal(beats[3].dur, 0.8);
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

// 照正解放完 order（再 advance closing 回合）：只有最後一回合 live，之前的 instant；回傳 settle 那段的秒數與這回合新增的泡泡。
// montage：最後一回合要不要當蒙太奇演（預設：倒數回合才是）
async function liveTurn(h, order, { closing = 0, montage: lastMontage } = {}) {
  let s = engine.createState(spec);
  const turns = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: closing }, () => st => engine.advance(st, spec))];
  for (let i = 0; i < turns.length; i++) {
    const r = turns[i](s); s = r.state; const events = [...r.events, { kind: 'settle' }], montage = i + 1 === turns.length && lastMontage !== undefined ? lastMontage : i >= order.length;
    if (i + 1 < turns.length) { await h.run(events, { instant: true, montage }); continue; }
    const n0 = h.bubblesLog.length; let mark = null;
    // 劇本秒數（不含鏡頭 focus 拍）：settle 那一段 = 回合結束 − settle 開始
    const secs = await h.run(events, { montage, onMark: e => { if (e.kind === 'settle') mark = h.scriptElapsed(); } });
    return { settleSecs: secs - mark, bubbles: h.bubblesLog.slice(n0) };
  }
}
const allHome = show => { for (const k of show.roster.keys()) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', k); };
const nearHead = (show, at) => { const h = show.stage.headOf('tower'); assert.ok(Math.hypot(at.x - h.x, at.z - h.z) < 0.5, 'label over the tower'); };

// 物品 v2 的正解：第 3 回合總等級 3 → 6（不跨）、第 4 回合 6 → 11 跨進「蓋一半」
test('headless: the turn crossing 6→11 ends with the「101 蓋一半」label over the tower, everyone home, settle 4–8 s; a non-crossing settle takes 0 s', async () => {
  const h = await headlessShow(), order = SOLUTIONS[0];
  const before = await liveTurn(h, order.slice(0, 3));
  assert.ok(before.settleSecs < 0.05, `no crossing → no time (${before.settleSecs})`);
  h.show.reset();
  const t = await liveTurn(h, order.slice(0, 4));
  assert.equal(t.bubbles.at(-1).text, '101 蓋一半'); nearHead(h.show, t.bubbles.at(-1).at);
  assert.ok(t.settleSecs >= 4 && t.settleSecs <= 8, `settle ${t.settleSecs.toFixed(2)} s`);
  allHome(h.show); assert.equal(h.show.stage.meta.total, 11);
});

// 物品 v2 的正解第 7 回合（21 → 30）就點燈，倒數回合不再跨門檻：把那一回合當蒙太奇演
test('headless: a montage turn crossing into 點燈 still shows the label', async () => {
  const h = await headlessShow(), t = await liveTurn(h, SOLUTIONS[0].slice(0, 7), { montage: true });
  assert.equal(t.bubbles.at(-1).text, '101 點燈'); nearHead(h.show, t.bubbles.at(-1).at); allHome(h.show);
});

// 蓋東西站鏡頭側（§14）：跨門檻的那個人走到 frontOf(101)，揮鋤頭 1.6 s（臉朝 101），揮完才閃白跳階
test('the 101 stage upgrade hero stands at frontOf(tower) and plays build (1.6 s) before the parts change', async () => {
  const h = await headlessShow(), { show } = h, update = show.update, at = anchorWorld('tower'), frames = [];
  show.update = (dt, t) => {
    update(dt, t);
    const front = frontOf(at, tower.FRONT_R, show.nav);
    for (const k of ['chip.worker', 'landmarks.islanders']) for (const m of show.roster.members(k)) {
      const g = m.walker?.gesture; if (g?.kind === 'build' && Math.hypot(m.pos.x - front.x, m.pos.z - front.z) < 0.6) frames.push({ t, g, pos: { ...m.pos }, front, total: show.stage.meta.total });
    }
  };
  await liveTurn(h, SOLUTIONS[0].slice(0, 4));   // 物品 v2：第 4 回合 6 → 11
  assert.ok(frames.length > 10, `build frames ${frames.length}`);
  assert.ok(frames.at(-1).t - frames[0].t >= 1.4, `build lasted ${(frames.at(-1).t - frames[0].t).toFixed(2)} s`);
  assert.equal(frames[0].g.dur, 1.6);
  for (const f of frames) {
    assert.ok(Math.hypot(f.pos.x - f.front.x, f.pos.z - f.front.z) < 0.05, `stands at the front ${f.pos.x.toFixed(2)},${f.pos.z.toFixed(2)}`);
    const d = f.g.yaw - Math.atan2(at.x - f.pos.x, at.z - f.pos.z); assert.ok(Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) < 1e-6, 'faces the tower');
    assert.notEqual(f.total, 11, 'builds before the tower changes');
  }
  assert.equal(show.stage.meta.total, 11);
});

// §14.4 大升級回全景：101 那一格 → 鏡頭側揮鋤頭 → 回全景（換零件之前）→ 閃白跳階、LEVEL UP 在全景裡演，頭頂不出框
test('a stage crossing: hero walks to frontOf(tower), builds, then focus(home) runs before apply and LEVEL UP; the rig is at the overview when the LEVEL UP appears', async () => {
  // 真的 rig；controls.update 像 OrbitControls 一樣讓鏡頭看著注視點（飛行中也是）
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.3, 320), controls = { target: new THREE.Vector3(), update() { camera.lookAt(controls.target); } };
  const rig = createCameraRig({ THREE, camera, controls }); rig.fit(16 / 9);
  const h = await headlessShow({ rig }), { show } = h, log = [];
  let now = 0, settling = false;
  const update = show.update; show.update = (dt, t) => {
    now = t; update(dt, t);
    if (settling && [...show.roster.members('chip.worker'), ...show.roster.members('landmarks.islanders')].some(m => m.walker?.gesture?.kind === 'build')) log.push(['build', now]);
  };
  const { focus, home } = rig;
  rig.focus = (p, o) => { if (settling) log.push(['focus', now, p]); return focus(p, o); };
  rig.home = ms => { if (settling) log.push(['home', now, show.stage.meta.total]); return home(ms); };
  const levelUp = show.bubbles.levelUp;
  show.bubbles.levelUp = (head, opts) => {
    if (!settling) return levelUp(head, opts);
    camera.updateMatrixWorld();
    const p = head(); log.push(['levelUp', now, { flying: rig.flying, target: controls.target.clone(), top: new THREE.Vector3(p.x, p.y, p.z).project(camera).y }]);
    return levelUp(head, opts);
  };
  // 第 6 回合（物品 v2 的正解 16 → 21）跨進「101 完工」（頭頂 7.75，舊的全景會出框）
  const order = SOLUTIONS[0].slice(0, 6), events = [];
  let s = engine.createState(spec);
  for (const [i, id] of order.entries()) {
    const r = engine.place(s, id, spec); s = r.state;
    if (i + 1 < order.length) { await h.run([...r.events, { kind: 'settle' }], { instant: true }); continue; }
    events.push(...r.events, { kind: 'settle' });
  }
  const before = show.stage.meta.total;
  await h.run(events, { onMark: e => { if (e.kind === 'settle') settling = true; } });
  assert.equal(tower.stageOf(show.stage.meta.total), 'full'); assert.notEqual(tower.stageOf(before), 'full');
  const at = kind => log.findIndex(l => l[0] === kind), last = kind => log.findLastIndex(l => l[0] === kind);
  const f = log[at('focus')], hm = log[at('home')], lu = log[at('levelUp')];
  assert.ok(f && Math.hypot(f[2].x - cellCentre([0, 0]).x, f[2].z - cellCentre([0, 0]).z) < 1e-6, 'settle first focuses the tower cell');
  assert.ok(at('focus') < at('build') && last('build') < at('home') && at('home') < at('levelUp'), log.map(l => l[0]).join(' '));
  assert.equal(hm[2], before, 'back to the overview before the parts change');
  // LEVEL UP 出現時鏡頭已經停在（抬高的）全景，頭頂在畫面上緣 10% 以內
  const probe = { target: new THREE.Vector3(), update() {} }, pc = new THREE.PerspectiveCamera(32, 16 / 9, 0.3, 320);
  const pr = createCameraRig({ THREE, camera: pc, controls: probe }); pr.fit(16 / 9); pr.setSkyline(show.stage.headOf('tower').y);
  assert.equal(lu[2].flying, false, 'the rig has landed');
  assert.ok(lu[2].target.distanceTo(probe.target) < 1e-6, `at the raised overview (target y ${lu[2].target.y.toFixed(2)} vs ${probe.target.y.toFixed(2)})`);
  assert.ok(lu[2].top <= 0.8, `tower top at NDC ${lu[2].top.toFixed(3)}`);
});
