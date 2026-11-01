import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as THREE from '../vendor/three/three.module.js';
import * as baseball from '../src/actors/baseball.js';
import { RING_R, cellAt, axialToWorld } from '../src/scene/hex.js';
import { lv, worldPoints, distToCell, entryProblems, focusCell, focusTrail } from './helpers/actors.js';
import { createPartFactory } from '../src/actors/parts.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import { anchorWorld, frontOf, cellOf } from '../src/actors/anchors.js';
import { C, offset } from '../src/actors/palette.js';
import { diffParts } from '../src/actors/stage.js';
import { TRACK, CAR_H, POOL } from '../src/actors/token.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { headlessShow, playItem, entriesThroughSolutions, solo, SCRIPT_MAX, SCRIPT_EXCEPT, KEY_MAX } from './helpers/show.js';
import { createNav } from '../src/show/nav.js';
import { B } from '../src/show/beats.js';
const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);   // 唯一正解（賽博），從求解器取
const AT = anchorWorld('baseball'), CELL = cellOf('baseball'), GATE = offset(AT, 0, 1.1);
const near = (a, b, d) => Math.hypot(a.x - b.x, a.z - b.z) < d;
const PALETTE = new Set(Object.values(C));
const views = Array.from({ length: 9 }, (_, n) => baseball.view(lv({ baseball: n }), {}));
const nonRoster = v => Object.fromEntries(Object.entries(v).filter(([, p]) => p.kind !== 'roster'));
const BASES = [[0, 0.5], [0.5, 0], [0, -0.5], [-0.5, 0]].map(([x, z]) => offset(AT, x, z));

test('baseball has its v2 ladder (max 8)', () => { assert.equal(spec.ITEMS.baseball.max, 8); });
test('baseball has something new at every level 1–8: sand lot, stands, dome, roof slit, concert, fireworks, bigger dome, dome station', () => {
  assert.deepEqual(Object.keys(views[1]), ['baseball.main', 'baseball.lines.0', 'baseball.lines.1', 'baseball.lines.2', 'baseball.lines.3', 'baseball.players']);
  assert.equal(views[1]['baseball.players'].n, 1, 'Lv1: the player who runs the bases');
  for (let n = 2; n <= 8; n++) assert.ok(diffParts(nonRoster(views[n - 1]), nonRoster(views[n])).add.length, `lv${n}: something new`);
  assert.ok(views[2]['baseball.stands'] && views[2]['baseball.players'].home.spots.length === 2 && views[2]['baseball.ball'].kind === 'ball');
  assert.ok(views[4]['baseball.deco'].parts.some(p => p.glow === C.yellow), 'Lv4 roof slit');
  assert.ok(views[5]['baseball.deco'].parts.filter(p => p.glow === C.neonBlue).length >= 8, 'Lv5 blue sticks');
  assert.equal(views[6]['baseball.fireworks'].kind, 'fireworks'); assert.equal(views[5]['baseball.fireworks'], undefined);
  assert.ok(views[7]['baseball.deco'].parts.some(p => p.led) && !views[6]['baseball.deco'].parts.some(p => p.led), 'Lv7 LED band');
  assert.ok(views[8]['baseball.platform'] && !views[7]['baseball.platform'], 'Lv8 platform');
  assert.ok(baseball.script.placed && [2, 3, 4, 5, 6, 7, 8].every(n => baseball.script.grow[n]) && baseball.script.fx);
});
// 木看台、巨蛋兩種大小（§7.2：Racing Kit grandStand、Space Kit hangar_roundA／B），經 tint 重上色票
test('Lv2 stands are Racing Kit grandstands; the dome is hangar_roundA at Lv3–6 and the taller hangar_roundB at Lv7–8, same footprint', () => {
  const s = views[2]['baseball.stands'];
  assert.equal(s.models.length, 2); assert.ok(s.models.every(m => m.path === baseball.MODELS.stand.path));
  for (let n = 3; n <= 8; n++) {
    const m = views[n]['baseball.main'], want = n >= 7 ? baseball.MODELS.domeB : baseball.MODELS.domeA;
    assert.equal(m.kind, 'glb'); assert.equal(m.path, want.path); assert.deepEqual(m.footprint, { rx: 1.15, rz: 0.95 }, `lv${n} dome footprint (§14.1)`);
    for (const c of Object.values(m.tint)) assert.ok(PALETTE.has(c), `lv${n} tint`);
  }
  assert.ok(views[7]['baseball.main'].h >= 1.15 * views[6]['baseball.main'].h, 'the expanded dome is bigger');
  for (const m of Object.values(baseball.MODELS)) assert.ok(existsSync(new URL(`../assets/${m.path}`, import.meta.url)), m.path);
  for (const c of Object.values(s.models[0].tint)) assert.ok(PALETTE.has(c));
});
// 人數預算（使用者 2026-10-26）：觀眾 Lv4 3、Lv5 4、Lv7 6（Lv8 一半坐新線來，合計照樣 6）、草皮 1；球員 2
// 裁決 R13：一格 ≤ 8 人（球員 2＋草皮 1＋觀眾 ≤ 5；老鼠、鼠災工作人員不算）
test('people budget: fans 3 / 4 / 5 (Lv8: 3 stay, 2 came by the new line), lawn 1, players 2 — the cell never needs more than 8', () => {
  const fans = v => (v['baseball.crowd']?.n ?? 0) + (v['baseball.riders']?.n ?? 0);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(n => fans(views[n])), [0, 0, 0, 3, 4, 4, 5, 5]);
  assert.deepEqual([views[8]['baseball.crowd'].n, views[8]['baseball.riders'].n], [3, 2]);
  for (let n = 1; n <= 8; n++) assert.ok(fans(views[n]) + (views[n]['baseball.lawn']?.n ?? 0) + (views[n]['baseball.players']?.n ?? 0) <= 8, `lv${n}`);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(n => views[n]['baseball.lawn']?.n ?? 0), [0, 0, 0, 0, 1, 1, 1, 1]);
  for (let n = 2; n <= 8; n++) assert.equal(views[n]['baseball.players'].n, 2);
  assert.equal(views[1]['baseball.players'].n, 1);
  // 加人不換位置：同一批人的站位一樣；Lv8 門口 + 新線的站位剛好是 Lv7 那五個位置
  assert.deepEqual(views[4]['baseball.crowd'].home.spots, views[5]['baseball.crowd'].home.spots.slice(0, 3));
  assert.deepEqual(views[5]['baseball.crowd'].home.spots, views[7]['baseball.crowd'].home.spots.slice(0, 4));
  assert.deepEqual([...views[8]['baseball.crowd'].home.spots, ...views[8]['baseball.riders'].home.spots].map(p => `${p.x},${p.z}`).sort(), views[7]['baseball.crowd'].home.spots.map(p => `${p.x},${p.z}`).sort());
});
test('fans stand on the gate arc and leave an aisle for the players (no fan within 0.35 of a player)', () => {
  const v = views[8], spots = [...views[7]['baseball.crowd'].home.spots, ...v['baseball.riders'].home.spots];
  for (const f of spots) {
    assert.ok(Math.abs(Math.hypot(f.x - AT.x, f.z - AT.z) - 1.75) < 1e-9, 'on the gate arc');
    for (const p of v['baseball.players'].home.spots) assert.ok(Math.hypot(f.x - p.x, f.z - p.z) > 0.35);
  }
});
test('domeRats flag adds two helmeted staff running around the gate', () => {
  const v = baseball.view(lv({ baseball: 3 }), { domeRats: true });
  assert.equal(v['baseball.staff'].n, 2); assert.equal(v['baseball.staff'].accessory, 'helmet');
});
test('the ball flies back and forth between the players', () => {
  const f = createPartFactory(THREE, { glow: createGlowRegistry(), builders: baseball.builders });
  const sp = views[2]['baseball.ball'], p = f.build(sp), ball = p.object.children[0];
  p.update(0, 0); const x0 = ball.position.x; p.update(0, 0.3); assert.ok(ball.position.y > 0.2); p.update(0, 0.6); assert.ok(Math.sign(ball.position.x) !== Math.sign(x0) || Math.abs(ball.position.x - x0) > 0.5);
});
// ◆ Lv8 巨蛋捷運站：月台從環狀線（停車的方位 DOME_STOP）接到球場格的格邊，磚道接到門口；下車點在月台靠軌道那頭
test('Lv8 platform: from the ring line at the dome stop to the cell edge, a paved walk to the gate; riders step off by the track', () => {
  const p = views[8]['baseball.platform'], pts = worldPoints(p);
  assert.equal(p.footprint, false);
  const r = q => Math.hypot(q.x, q.z), a = q => Math.atan2(q.z, q.x);
  assert.ok(Math.max(...pts.map(r)) > TRACK.radius - 0.5, 'reaches the track');
  assert.ok(pts.some(q => cellAt(q.x, q.z) && String(cellAt(q.x, q.z)) === String(CELL)), 'lands on the baseball cell');
  assert.ok(pts.filter(q => !cellAt(q.x, q.z)).every(q => Math.abs(a(q) - baseball.DOME_STOP) < 0.12), 'the deck runs out along the stop bearing');
  assert.ok(Math.abs(baseball.DOME_STOP - Math.atan2(GATE.z, GATE.x)) < 1e-9, 'the stop faces the gate');
  for (let k = 0; k < 12; k++) { const pa = k / 12 * Math.PI * 2 + 0.13; assert.ok(Math.hypot(Math.cos(pa) - Math.cos(baseball.DOME_STOP), Math.sin(pa) - Math.sin(baseball.DOME_STOP)) * TRACK.radius > 0.8, 'clear of the track pylons'); }
  for (const q of baseball.RIDE_OFF) { assert.equal(cellAt(q.x, q.z), null); assert.ok(r(q) > TRACK.radius - 0.6 && r(q) < TRACK.radius - 0.2, 'beside the track'); }
});
// ── MAX（修正批次 max-skip §A，使用者 2026-11-01「棒球和珍奶店的 level max 不夠明顯」）：Lv8 巨蛋本身要變——
// 圓頂最高點坐一顆巨大的棒球（白球、兩條紅縫線）、四周四座球場燈塔（細高的柱＋頂上一排暖白燈板）、外牆一圈彩色三角旗；全部在巨蛋那個 deco compound 裡 ──
test('MAX Lv8: a giant baseball on the roof, four stadium light towers with warm lamp panels, a ring of pennants — all in baseball.deco; none at Lv7', () => {
  const d8 = views[8]['baseball.deco'], d7 = views[7]['baseball.deco'], P = d8.parts;
  for (const tag of ['bigBall', 'seam', 'tower', 'lamp', 'pennant']) assert.ok(!d7.parts.some(p => p[tag]), `Lv7 has no ${tag}`);
  const ball = P.filter(p => p.bigBall);
  assert.equal(ball.length, 1); assert.equal(ball[0].kind, 'sphere'); assert.equal(ball[0].color, C.white);
  const D = [].concat(ball[0].scale)[0];
  assert.ok(D >= 0.4 && D <= 0.5, `diameter ${D}`);
  assert.ok(Math.hypot(ball[0].pos[0], ball[0].pos[2]) < 1e-9 && ball[0].pos[1] - D / 2 >= baseball.DOME_H.b - 0.06 && ball[0].pos[1] - D / 2 <= baseball.DOME_H.b + 0.02, 'sits on the top of the dome');
  const seams = P.filter(p => p.seam);
  assert.equal(seams.length, 2); assert.ok(seams.every(p => p.kind === 'torus' && p.color === C.red), 'two red seams');
  for (const s of seams) assert.ok(Math.abs(Math.hypot(s.pos[0], s.pos[1] - ball[0].pos[1], s.pos[2]) - D / 4) < D / 4, 'on the ball');
  const poles = P.filter(p => p.tower), lamps = P.filter(p => p.lamp);
  assert.equal(poles.length, 4); assert.ok(poles.every(p => p.kind === 'cylinder' && p.scale[1] >= 1.0 && p.scale[1] <= 1.3 && p.scale[0] <= 0.07), 'thin tall poles');
  assert.ok(lamps.length >= 4 && lamps.every(p => p.glow === C.warm && p.pos[1] >= 1.0), 'warm lamp panels up top');
  for (const q of poles) assert.ok(lamps.some(l => Math.hypot(l.pos[0] - q.pos[0], l.pos[2] - q.pos[2]) < 0.15), 'a lamp on every pole');
  const flags = P.filter(p => p.pennant);
  assert.ok(flags.length >= 20 && new Set(flags.map(p => p.color)).size >= 5, `${flags.length} pennants`);
  for (const f of flags) assert.ok((f.pos[0] / 1.09) ** 2 + (f.pos[2] / 0.945) ** 2 > 1 && (f.pos[0] / 1.25) ** 2 + (f.pos[2] / 1.1) ** 2 < 1, 'hung around the dome wall');
  assert.ok(flags.every(f => f.pos[1] > 0.25 && f.pos[1] < 0.6), 'along the lower edge of the dome');
  // 標籤（LEVEL UP、泡泡掛在 main 的 labelY）在大棒球頂上，不從球裡冒出來（修正輪 1 審稿 Minor：h + 0.35 = 1.55 落在球裡 1.17–1.62）
  const top = ball[0].pos[1] + D / 2;
  assert.ok(views[8]['baseball.main'].labelY > top, `Lv8 labelY ${views[8]['baseball.main'].labelY} above the ball top ${top.toFixed(2)}`);
  assert.deepEqual(views[7]['baseball.main'], views[8]['baseball.main'], 'the dome itself is the same spec at Lv7 and Lv8 (not replaced and regrown at Lv8)');
});
test('MAX Lv8 towers: outside the padded dome, each pole its own small footprint, clear of every roster spot, the lawn walk, entries and the concert sticks', async () => {
  const { PAD } = await import('../src/show/nav.js'), { growsOn } = await import('../src/actors/stage.js'), d8 = views[8]['baseball.deco'];
  const fp = [].concat(d8.footprint);
  assert.equal(fp.length, 4); assert.ok(fp.every(f => f.r > 0 && f.r <= 0.08), 'small round footprints');
  assert.equal(growsOn(d8), false, 'the deco still just appears');
  const poles = d8.parts.filter(p => p.tower);
  for (const q of poles) assert.ok(fp.some(f => Math.hypot(f.x - q.pos[0], f.z - q.pos[2]) < 1e-9), 'footprint on the pole');
  const v = views[8], R0 = 0.08 + PAD + 0.125;   // 外擴後的燈柱＋一個人的半徑
  const spots = [...views[7]['baseball.crowd'].home.spots, ...v['baseball.crowd'].home.spots, ...v['baseball.riders'].home.spots, ...v['baseball.players'].home.spots, ...baseball.RIDER_WAIT, GATE];
  for (const f of fp) {
    const x = AT.x + f.x, z = AT.z + f.z;
    assert.ok((f.x / (1.15 + PAD)) ** 2 + (f.z / (0.95 + PAD)) ** 2 > 1, 'outside the padded dome');
    // 燈柱外擴後（r + PAD）跟巨蛋外擴後的橢圓相連——等於巨蛋多一個凸塊，柱子和巨蛋之間沒有夾縫讓人卡進去（修正輪 1 審稿 Minor）
    const toDome = Math.min(...Array.from({ length: 360 }, (_, k) => { const a = k / 180 * Math.PI; return Math.hypot(f.x - Math.cos(a) * (1.15 + PAD), f.z - Math.sin(a) * (0.95 + PAD)); }));
    assert.ok(toDome < f.r + PAD, `the padded pole touches the padded dome (${toDome.toFixed(3)} < ${(f.r + PAD).toFixed(2)}): a bump on the dome, no crevice`);
    assert.deepEqual(cellAt(x, z), CELL);
    for (const s of spots) assert.ok(Math.hypot(s.x - x, s.z - z) >= R0, `spot (${s.x.toFixed(2)}, ${s.z.toFixed(2)}) clear of the tower`);
    assert.ok(Math.hypot(baseball.LAWN.x - x, baseball.LAWN.z - z) >= baseball.LAWN_R + 0.18, 'outside the lawn walk');
    for (const e of [...baseball.PLAYER_ENTRY, ...baseball.BRIDGE_IN]) assert.ok(Math.hypot(e.x - x, e.z - z) >= 0.3, 'off the entries');
    for (const [sx, sz] of baseball.STICKS) assert.ok(Math.hypot(sx - f.x, sz - f.z) >= 0.2, 'between the concert sticks');
  }
});
test('MAX Lv8 draw calls: the deco adds one warm glow mesh at most (wide-end ≤ 250); the cup / ball / pennants are clay', () => {
  const colours = s => new Set(s.parts.map(p => p.glow ?? 'clay')).size;
  assert.ok(colours(views[8]['baseball.deco']) <= colours(views[7]['baseball.deco']) + 1);
  assert.ok(views[8]['baseball.deco'].parts.filter(p => p.glow).every(p => p.lamp || p.glow === C.neonBlue), 'only the lamps add a glow colour');
});
test('◆ Lv8: the giant ball, towers and pennants come in the same beat as the platform', () => {
  const beats = baseball.script.grow[8]({ kind: 'grow', item: 'baseball', to: 8 }, { lv: lv({ baseball: 8 }), flags: {} }, { B, roster: { members: () => [] } });
  const first = beats.find(b => b.kind === 'apply' && Array.isArray(b.only));
  assert.ok(first.only.includes('baseball.platform') && first.only.includes('baseball.deco'), String(first.only));
});
// ── draw call：整格 ≤ 16 ──
function drawCalls(v) {
  const compound = parts => (parts.some(x => !x.glow) ? 1 : 0) + new Set(parts.filter(x => x.glow).map(x => x.glow)).size;
  return Object.values(v).reduce((t, p) => t + (p.kind === 'compound' ? compound(p.parts) : p.kind === 'glb' ? 1 + (p.glow ? 1 : 0)
    : p.kind === 'stands' ? p.models.length : p.kind === 'ball' || p.kind === 'fireworks' ? 1 : 0), 0);
}
test('baseball draw calls ≤ 16 at every level', () => {
  for (let n = 1; n <= 8; n++) { const d = drawCalls(baseball.view(lv({ baseball: n, rat: 4 }), { domeRats: true })); assert.ok(d <= 16, `lv${n}: ${d}`); }
});
// ── 不出格：footprint 的角都在球場格裡；零件與站位都在球場格裡（煙火在天上、月台伸到海上的那段例外）──
test('every baseball footprint corner and part stays inside its cell', () => {
  for (let n = 1; n <= 8; n++) for (const [key, s] of Object.entries(baseball.view(lv({ baseball: n }), { domeRats: true }))) {
    for (const f of [].concat(s.footprint || [])) {
      const cx = s.at.x + (f.x ?? 0), cz = s.at.z + (f.z ?? 0), [hx, hz] = f.r != null ? [f.r, f.r] : f.rx != null ? [f.rx, f.rz] : [f.w / 2, f.d / 2];
      for (const [dx, dz] of [[hx, hz], [hx, -hz], [-hx, hz], [-hx, -hz]]) assert.deepEqual(cellAt(cx + dx, cz + dz), CELL, `lv${n} ${key} corner`);
    }
    if (key === 'baseball.fireworks' || key === 'baseball.platform') continue;
    for (const p of [...(s.parts ? worldPoints(s) : [s.at]), ...(s.home?.spots ?? [])]) assert.ok(distToCell(p, CELL) < RING_R, `lv${n} ${key}`);
  }
});

// ── 劇本 ──
const KEYS = ['baseball.players', 'baseball.crowd', 'baseball.riders', 'baseball.lawn', 'boba.queue', 'landmarks.islanders'];
const isBall = to => e => e.kind === 'grow' && e.item === 'baseball' && e.to === to;
async function liveAt({ run, bubblesLog, rig }, order, pred, { whole = false } = {}) {
  let s = engine.createState(spec);
  const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  for (const step of steps) {
    const r = step(s); s = r.state;
    if (whole && r.events.some(pred)) { const n = bubblesLog.length; return { events: r.events, secs: await run([...r.events, { kind: 'settle' }]), n, r: rig.log.length }; }
    for (const e of r.events) {
      if (!whole && pred(e)) { const n = bubblesLog.length, c = rig.log.length; return { e, secs: await run([solo(e)]), n, r: c }; }
      await run([e], { instant: true });
    }
    await run([{ kind: 'settle' }], { instant: true });
  }
  throw new Error('event not found');
}
// 物品 v2 §6：一級 3–5 s；◆ Lv3、Lv8 6–10 s（含鏡頭平移與回全景的整段，show.elapsed）
const KEY = [3, 8];
function checkBall({ show, bubblesLog }, e, secs, n, timing) {
  const to = e.kind === 'grow' ? e.to : 1, what = `${e.kind} ${to}`;
  (timing[to] ??= []).push(+secs.toFixed(1));
  // 唯一正解：棒球 6（跨年煙火）在第 6 回合、珍奶第 7 回合才放——沒有珍奶觀光客來看，只剩煙火與 ♪（≥ 2 s）；有觀光客的那段由下面的 Lv6 測試驗
  const lo = to === 6 && !show.roster.members('boba.queue').length ? 2 : 3;
  assert.ok(secs >= lo && secs <= (KEY.includes(to) ? KEY_MAX : SCRIPT_EXCEPT[`baseball ${to}`] ?? SCRIPT_MAX), `${what} took ${secs.toFixed(2)} s`);
  if (KEY.includes(to)) assert.ok(show.elapsed >= 6 && show.elapsed <= KEY_MAX, `◆ ${what} whole event ${show.elapsed.toFixed(2)} s`);
  if (e.kind === 'grow') {
    const last = bubblesLog.slice(n).at(-1), h = show.stage.headOf('baseball');
    assert.equal(last?.text, 'LEVEL UP', what); assert.ok(Math.hypot(last.at.x - h.x, last.at.y - h.y, last.at.z - h.z) < 0.3, `${what} LEVEL UP over baseball`);
  }
  for (const k of KEYS) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', `${what} ${k}`);
  const v = baseball.view(show.stage.lv, show.stage.flags);
  for (const k of ['baseball.players', 'baseball.crowd', 'baseball.riders', 'baseball.lawn']) assert.equal(show.roster.members(k).length, v[k]?.n ?? 0, `${what} ${k}`);
}
test('scripts: every baseball level in the solution plays 3–5 s (◆ Lv3/Lv8 6–10 s whole), ends with LEVEL UP on baseball, everyone home', async () => {
  const timing = {};
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show, run, bubblesLog } = h;
    let n = 0;
    const tracked = (evs, opts) => { if (!opts?.instant) n = bubblesLog.length; return run(evs, opts); };
    const seen = [];
    await playItem(show, tracked, order, 'baseball', (e, secs) => { seen.push(e.kind === 'grow' ? e.to : 1); checkBall(h, e, secs, n, timing); });
    assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 8], `baseball events seen: ${seen}`);
  }
});
// 大巨蛋淹水（唯一正解 2026-10-31 §4.3、§5.1：颱風到巨蛋上空時棒球 ≤3）：球場變泳池（同捷運站的 POOL 水色、沒有 footprint），
// 兩個球員站上巨蛋屋頂（站位在巨蛋頂上、不帶 rescue，不會被拉回地面）、不傳球；沒有巨蛋（Lv2）站上木看台頂
test('view: flags.domeFlood turns the field into a pool and puts the two players up on the dome roof', () => {
  const dry = baseball.view(lv({ baseball: 3 }), {}), wet = baseball.view(lv({ baseball: 3 }), { domeFlood: true }), at = anchorWorld('baseball');
  assert.equal(dry['baseball.field'], undefined);
  const f = wet['baseball.field'];
  assert.equal(f.footprint, false); assert.ok(f.parts.some(p => p.color === POOL), 'pool water');
  assert.ok(Math.hypot(f.at.x - at.x, f.at.z - at.z) < 1e-9);
  assert.ok(wet['baseball.deco'].parts.some(p => p.color === POOL), 'the dome base stands in the water');
  const h = wet['baseball.players'].home;
  assert.equal(h.kind, 'stand'); assert.equal(h.rescue, undefined, 'no rescue: they stay on the roof');
  assert.equal(h.spots.length, 2); assert.equal(wet['baseball.players'].n, 2);
  for (const p of h.spots) { assert.ok(Math.abs(p.y - (at.y + baseball.DOME_H.a)) < 1e-9, 'on the dome top'); assert.ok(Math.hypot(p.x - at.x, p.z - at.z) < 0.33, 'on the flat top'); }
  assert.ok(Math.hypot(h.spots[0].x - h.spots[1].x, h.spots[0].z - h.spots[1].z) >= 0.25, 'not overlapping');
  assert.equal(wet['baseball.ball'], undefined, 'no catch on the roof');
  const stands = baseball.view(lv({ baseball: 2 }), { domeFlood: true })['baseball.players'].home;
  assert.ok(stands.spots.every(p => p.y > at.y + 0.3), 'no dome yet: up on the stands');
});
test('◆ Lv3 and Lv8 are the key nodes and end on the overview before the LEVEL UP; the others are short scripts', () => {
  assert.deepEqual(Object.entries(baseball.script.grow).filter(([, f]) => f.key).map(([n]) => +n), [3, 8]);
  const ctx = { B, roster: { members: () => [] } }, flat = bs => bs.flatMap(b => (b.kind === 'together' ? flat(b.beats) : [b]));
  for (const n of [3, 8]) {
    const beats = flat(baseball.script.grow[n]({ kind: 'grow', item: 'baseball', to: n }, { lv: lv({ baseball: n }), flags: {} }, ctx));
    const i = beats.findIndex(b => b.kind === 'focus' && b.target === 'home');
    assert.ok(i > 0 && beats[i].dur >= 1 && beats.at(-1).kind === 'levelUp', `lv${n}`);
  }
});
// 人數預算（裁決 R16）：球場格不住島民——跑壘的是 Lv1 的第一個球員，從看台後方的入口進場
test('placed: the first player enters from behind the stands, walks to home plate and round the four bases; each base line appears as he runs its leg', async () => {
  const h = await headlessShow(), { show } = h, update = show.update, visits = [], shownAt = [];
  let runner = null;
  show.update = (dt, t) => {
    update(dt, t);
    for (let i = 0; i < 4; i++) { const o = show.stage.partObject(`baseball.lines.${i}`); if (o?.visible && shownAt[i] === undefined) shownAt[i] = t; }
    const m = runner ?? show.roster.members('baseball.players').find(x => x.mode !== 'home');
    if (m && m.mode !== 'home') { runner = m; BASES.forEach((b, i) => { if (near(m.pos, b, 0.15) && visits.at(-1) !== i) visits.push(i); }); }
  };
  await liveAt(h, SOLUTIONS[0], e => e.kind === 'placed' && e.item === 'baseball');
  assert.deepEqual(visits.slice(visits.indexOf(0)), [0, 1, 2, 3, 0], `home → 1st → 2nd → 3rd → home: ${visits}`);
  assert.ok(shownAt.length === 4 && shownAt.every((t, i) => i === 0 || t > shownAt[i - 1] + 0.3), `lines appear one by one: ${shownAt}`);
  assert.equal(runner.mode, 'home'); assert.equal(show.roster.members('landmarks.islanders').filter(x => x.mode !== 'home').length, 0, 'no islander borrowed');
});
test('Lv2: the second player spawns at its entry behind the stands and walks onto the field (the first is there since Lv1)', async () => {
  const h = await headlessShow(), { show } = h, update = show.update, firsts = new Map();
  show.update = (dt, t) => { update(dt, t); for (const m of show.roster.members('baseball.players')) if (!firsts.has(m)) firsts.set(m, { ...m.pos }); };
  await liveAt(h, SOLUTIONS[0], isBall(2));
  assert.equal(firsts.size, 2);
  const p = firsts.get(show.roster.members('baseball.players')[1]); assert.ok(near(p, baseball.PLAYER_ENTRY[1], 0.2), `spawned at the entry (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
  const spots = baseball.view(show.stage.lv, show.stage.flags)['baseball.players'].home.spots;
  show.roster.members('baseball.players').forEach((m, i) => assert.ok(near(m.pos, spots[i], 0.15), `player ${i} on the field`));
});
// 蓋東西站鏡頭側（§14）：大巨蛋那一級，離巨蛋鏡頭側最近的球員（裁決 R16：球場格不住島民）在那裡揮兩次鐵鎚
const gestureLog = (show, keys, frontAt) => {
  const update = show.update, log = [];
  show.update = (dt, t) => {
    update(dt, t);
    const front = frontAt?.(show.nav);
    for (const k of keys) for (const m of show.roster.members(k)) { const g = m.walker?.gesture; if (g) log.push({ key: k, m, kind: g.kind, k: g.k, pos: { ...m.pos }, front }); }
  };
  return log;
};
const runs = (log, kind) => log.filter(f => f.kind === kind).reduce((n, f, i, a) => n + (i === 0 || a[i - 1].m !== f.m || f.k < a[i - 1].k ? 1 : 0), 0);
test('◆ Lv3: a player …… and the dome icon; the nearest player builds twice at the dome front; the dome blocks, the gate stays walkable', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show, bubblesLog } = h, log = gestureLog(show, KEYS, nav => frontOf(AT, baseball.FRONT_R, nav));
    const { n } = await liveAt(h, order, isBall(3));
    const kinds = bubblesLog.slice(n).map(b => b.kind ?? b.text);
    assert.ok(kinds.indexOf('……') >= 0 && kinds.findIndex(k => k?.icon === 'dome') > kinds.indexOf('……'));
    assert.equal(runs(log, 'build'), 2, 'two builds'); assert.ok(log.filter(x => x.kind === 'build').every(f => f.key === 'baseball.players'), 'a player builds');
    for (const f of log.filter(x => x.kind === 'build')) assert.ok(Math.hypot(f.pos.x - f.front.x, f.pos.z - f.front.z) < 0.05, 'at the dome front');
    for (const p of [...baseball.view(show.stage.lv, show.stage.flags)['baseball.players'].home.spots, GATE]) assert.ok(show.nav.walkable(p.x, p.z));
    assert.ok(!show.nav.walkable(AT.x, AT.z), 'the dome blocks');
  }
});
// Lv4：三個觀眾從往捷運站那座橋的橋頭（剛下車過橋）走到門口；入口離站位 ≥ 1.5；沒有人一幀跳超過走路速度
test('Lv4: three fans walk in from the station-side bridge head to the gate arc and ♪; nobody jumps', async () => {
  for (const p of baseball.BRIDGE_IN) for (const s of baseball.fanSpots(3)) assert.ok(Math.hypot(p.x - s.x, p.z - s.z) >= 1.5);
  const h = await headlessShow(), { show, bubblesLog } = h, update = show.update, firsts = new Map(), last = new Map(), bad = [];
  let live = false;
  const run = h.run; h.run = (evs, o) => { live = !o?.instant; return run(evs, o); };
  show.update = (dt, t) => {
    update(dt, t);
    if (!live) { last.clear(); return; }
    for (const m of show.roster.members('baseball.crowd')) if (!firsts.has(m)) firsts.set(m, { ...m.pos });
    for (const k of show.roster.keys()) for (const m of show.roster.members(k)) {
      if (k === 'rat.pack') continue;
      const p = last.get(m), v = (m.speed ?? 1.6) * dt;
      if (p && !m.hidden && Math.hypot(m.pos.x - p.x, m.pos.z - p.z) > v + 1e-6) bad.push(`${k} ${m.i}`);
      last.set(m, { ...m.pos });
    }
  };
  const { n } = await liveAt(h, SOLUTIONS[0], isBall(4));
  assert.equal(firsts.size, 3);
  for (const p of firsts.values()) assert.ok(baseball.BRIDGE_IN.some(q => near(p, show.nav.nearestWalkable(q), 0.2)), 'from the bridge head');
  assert.ok(bubblesLog.slice(n).filter(b => b.kind === '♪').length >= 3);
  assert.deepEqual(bad, []);
  const spots = baseball.view(show.stage.lv, show.stage.flags)['baseball.crowd'].home.spots;
  show.roster.members('baseball.crowd').forEach((m, i) => assert.ok(near(m.pos, show.nav.walkable(spots[i].x, spots[i].z) ? spots[i] : show.nav.nearestWalkable(spots[i]), 0.15), `fan ${i} at the gate`));
});
// Lv5：門口最近的觀眾走到門口敲門（燈泡 Lv7 起電工住在風車島，不叫他）；多的觀眾與草皮那一個從月台入口走來
test('Lv5: the fan nearest the gate knocks there; the extra fan and the lawn fan walk in from the platform entry', async () => {
  const h = await headlessShow(), { show } = h, log = gestureLog(show, KEYS), update = show.update, firsts = new Map();
  let before = null;
  show.update = (dt, t) => {
    before ??= new Set([...show.roster.members('baseball.crowd'), ...show.roster.members('baseball.lawn')]);
    update(dt, t);
    for (const m of [...show.roster.members('baseball.crowd'), ...show.roster.members('baseball.lawn')]) if (!before.has(m) && !firsts.has(m)) firsts.set(m, { ...m.pos });
  };
  await liveAt(h, SOLUTIONS[0], isBall(5));
  const k = log.filter(f => f.kind === 'knock'); assert.ok(k.length > 5 && k.every(f => f.key === 'baseball.crowd'), 'a fan knocks');
  for (const f of k) assert.ok(near(f.pos, GATE, 0.3), 'at the gate');
  assert.equal(firsts.size, 2);
  for (const p of firsts.values()) assert.ok(baseball.CROWD_ENTRY.some(e => near(p, e, 0.3)), 'came from the platform');
  for (let i = 0; i < 600; i++) show.update(1 / 30, 100 + i / 30);
  const lawn = baseball.view(show.stage.lv, show.stage.flags)['baseball.lawn'].home;
  for (const m of show.roster.members('baseball.lawn')) { assert.ok(near(m.pos, lawn.at, lawn.r + 0.3)); assert.ok(!show.nav.inFootprint(m.pos.x, m.pos.z)); }
});
// Lv6：珍奶的觀光客（≤ 2）走到巨蛋門口 → 煙火 → ♪ → 走回人龍；鏡頭先對珍奶格、再轉巨蛋格
test('Lv6: two boba tourists come to the gate for the fireworks and walk back; the camera starts on the queue', async () => {
  const ctx = { B, roster: { members: () => [] } }, flat = bs => bs.flatMap(b => (b.kind === 'together' ? flat(b.beats) : [b]));
  const beats = baseball.script.grow[6]({ kind: 'grow', item: 'baseball', to: 6 }, { lv: lv({ baseball: 6 }), flags: {} }, ctx);
  assert.deepEqual(flat(beats).filter(b => b.kind === 'focus').map(b => focusCell(b, ctx)), [cellOf('boba'), CELL]);
  const h = await headlessShow(), { show } = h, update = show.update, closest = new Map();
  let live = false;
  const run = h.run; h.run = (evs, o) => { live = !o?.instant; return run(evs, o); };
  show.update = (dt, t) => { update(dt, t); if (live) for (const m of show.roster.members('boba.queue')) closest.set(m, Math.min(closest.get(m) ?? Infinity, Math.hypot(m.pos.x - GATE.x, m.pos.z - GATE.z))); };
  // 唯一正解的棒球 6 在珍奶放下之前（沒有人龍）：用珍奶先放、棒球照樣長到 6 的放法（窮舉找的，非正解）
  await liveAt(h, ['milk', 'baseball', 'token', 'bulb', 'boba', 'chip'], isBall(6));
  assert.equal([...closest.values()].filter(d => d < 1.6).length, 2, 'two tourists at the gate');
  assert.ok(show.stage.partObject('baseball.fireworks'));
  for (let i = 0; i < 600; i++) show.update(1 / 30, 100 + i / 30);
  const boba = await import('../src/actors/boba.js'), spots = boba.view(show.stage.lv, show.stage.flags)['boba.queue'].home.spots;
  show.roster.members('boba.queue').forEach((m, i) => assert.ok(near(m.pos, show.nav.walkable(spots[i].x, spots[i].z) ? spots[i] : show.nav.nearestWalkable(spots[i]), 0.1), `tourist ${i} back in line`));
});
// ◆ Lv8：列車停在巨蛋站（車頭在 DOME_STOP），三個觀眾在列車停著的時候從月台靠軌道那頭下車、沿月台走到門口；沒有人瞬移
test('◆ Lv8 live: the train stops at the dome station, two riders step off while it stands, walk to the gate and cheer; only then two fans leave and the riders take their spots', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show } = h, update = show.update, firsts = new Map(), last = new Map(), bad = [];
    let live = false, clock = null, tt = 0, waited = null, left = null;
    const run = h.run; h.run = (evs, o) => { live = !o?.instant; return run(evs, o); };
    show.update = (dt, t) => {
      update(dt, t); if (!live) return;
      tt += dt;
      const rs = show.roster.members('baseball.riders');
      if (waited === null && rs.length === 2 && rs.every((m, i) => near(m.pos, baseball.RIDER_WAIT[i], 0.05))) waited = tt;
      if (left === null && show.roster.members('baseball.crowd').length === 3) left = tt;
      const c = t + h.rail.offset;
      for (const f of firsts.values()) if (f.stopped === undefined) f.stopped = Math.abs(c - clock) < 1e-6;   // 下車後那一幀車沒動
      clock = c;
      for (const m of show.roster.members('baseball.riders')) {
        if (!firsts.has(m)) firsts.set(m, { ...m.pos, head: (c * 0.35) % (2 * Math.PI) });
        const p = last.get(m); if (p && Math.hypot(m.pos.x - p.x, m.pos.z - p.z) > 1.6 * 1.05 * dt + 1e-6) bad.push(m.i); last.set(m, { ...m.pos });
      }
    };
    const { r } = await liveAt(h, order, isBall(8));
    const what = order.join('>');
    assert.equal(firsts.size, 2, what);
    assert.ok(waited !== null && left !== null && left >= waited + 1.0, `${what}: the two fans leave after the riders are at the gate and the overview hold (${waited}, ${left})`);
    for (const p of firsts.values()) {
      assert.ok(baseball.RIDE_OFF.some(q => near(p, q, 0.05)), `${what}: steps off at the platform`); assert.ok(p.stopped, `${what}: while the train stands`);
      const d = Math.atan2(Math.sin(p.head - baseball.DOME_STOP), Math.cos(p.head - baseball.DOME_STOP)); assert.ok(Math.abs(d) < 0.02, `${what}: train head at the dome stop (${d.toFixed(3)})`);
    }
    assert.deepEqual(bad, [], `${what}: no teleport`);
    for (let i = 0; i < 300; i++) show.update(1 / 30, 100 + i / 30);
    show.roster.members('baseball.riders').forEach((m, i) => assert.ok(near(m.pos, baseball.RIDER_SPOTS[i], 0.15), `${what}: rider ${i} at the gate`));
    assert.ok(show.stage.partObject('baseball.platform'));
    assert.equal(focusTrail(h.rig.log, r).at(-1), 'home');
  }
});
// 兩個事件以上的回合整段 live：島民、球員都是演到才找
test('the Lv2 turn plays whole and live: everyone ends at home', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h;
  const { events, secs, n } = await liveAt(h, SOLUTIONS[0], isBall(2), { whole: true });
  assert.ok(events.length >= 2, 'a multi-event turn'); assert.ok(secs > 5, `${secs.toFixed(1)} s`);
  assert.ok(bubblesLog.slice(n).some(b => b.text === 'LEVEL UP'));
  for (const k of show.roster.keys()) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', k);
});

// ── 入口點（§13.2）：球員從看台後方的格邊、觀眾（含 Lv8 坐新線來的）從捷運站前走來；走得到、離站位 ≥ 1.5（每一級、鼠災與否；唯一正解每一刻）──
test('baseball rosters: players enter from behind the stands, the crowd from the station platform; walkable and ≥ 1.5 from every spot', async () => {
  const c = axialToWorld(...CELL), PLATFORM = offset(anchorWorld('token'), 0.9, 0.9);
  for (const p of baseball.PLAYER_ENTRY) {
    assert.deepEqual(cellAt(p.x, p.z), CELL); assert.ok(p.z < AT.z - 1.33, 'behind the stands');
    assert.ok(Math.abs(p.z - c.z) + Math.abs(p.x - c.x) / Math.sqrt(3) > 1.8, 'at the cell edge');
  }
  for (const p of baseball.CROWD_ENTRY) assert.ok(near(p, PLATFORM, 0.7), 'at the platform');
  const nav = createNav(), bad = [];
  for (let n = 1; n <= 8; n++) for (const domeRats of [false, true]) {
    const v = baseball.view(lv({ baseball: n, rat: 2 }), { domeRats });
    if (v['baseball.players']) assert.deepEqual(v['baseball.players'].home.entry, baseball.PLAYER_ENTRY);
    for (const k of ['baseball.crowd', 'baseball.riders', 'baseball.lawn']) if (v[k]) assert.deepEqual(v[k].home.entry, baseball.CROWD_ENTRY, `lv${n} ${k}`);
    bad.push(...entryProblems(v, nav, `lv${n}${domeRats ? ' domeRats' : ''}`));
  }
  bad.push(...await entriesThroughSolutions(baseball, SOLUTIONS));
  assert.deepEqual(bad, []);
});
// ── §14.3：草皮的散步圈離巨蛋、門口觀眾、應援棒都夠遠 ──
test('the lawn wanders clear of the padded dome, the gate fans and the light sticks', () => {
  for (const n of [5, 6, 7, 8]) {
    const v = baseball.view(lv({ baseball: n }), {}), l = v['baseball.lawn'].home;
    assert.deepEqual([v['baseball.lawn'].n, l.kind, l.r], [1, 'wander', 0.6]);
    for (const [x, z] of baseball.STICKS) assert.ok(Math.hypot(AT.x + x - l.at.x, AT.z + z - l.at.z) - l.r >= 0.12, `lv${n} stick clear of the lawn`);
    assert.ok(Math.hypot((l.at.x - AT.x) / 1.27, (l.at.z - AT.z) / 1.07) > 1.25, 'clear of the padded dome');
    for (const p of [...(v['baseball.crowd']?.home.spots ?? []), ...(v['baseball.riders']?.home.spots ?? [])]) assert.ok(Math.hypot(p.x - l.at.x, p.z - l.at.z) >= 0.9);
  }
});
// 物品 v2 任務 7：燈泡 Lv7 起電工住在風車島上——演唱會不叫他從海上走過來
test('Lv5 concert never sends the electrician (he may live on the windmill island)', () => {
  const ctx = { B, roster: { members: () => [] } }, flat = bs => bs.flatMap(b => (b.kind === 'together' ? flat(b.beats) : [b]));
  const src = baseball.script.grow[5].toString(); assert.ok(!src.includes('bulb.electrician'));
  assert.ok(flat(baseball.script.grow[5]({ kind: 'grow', item: 'baseball', to: 5 }, { lv: lv({ baseball: 5 }), flags: {} }, ctx)).some(b => b.kind === 'gesture'));
});
// Lv8 月台外緣（甲板、雨棚沿徑向最外的那一點）離列車車廂側面 ≥ 0.1：車廂寬度用載入器實際量 glb（高 CAR_H，同 token.js）
test('the Lv8 platform\'s outer edge stays ≥ 0.1 clear of the train cars passing on the ring', async () => {
  const { readFileSync } = await import('node:fs'), { GLTFLoader } = await import('../vendor/three/addons/loaders/GLTFLoader.js'), { createAssets } = await import('../src/scene/assets.js');
  const fakeTexture = () => ({ name: 'fakeTexture', loadTexture: () => { const t = new THREE.Texture({ width: 1, height: 1 }); t.flipY = false; return Promise.resolve(t); } });
  const loader = { load: (url, ok, _, fail) => { const b = readFileSync(url); new GLTFLoader().register(fakeTexture).parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', ok, fail); } };
  const assets = createAssets(THREE, { base: 'assets/', loader, pixels: () => ({ width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) }) });
  let half = 0;
  for (const kind of ['subway', 'bullet']) for (const x of ['a', 'b', 'c']) {
    const g = await assets.spawn(`kenney/train/train-electric-${kind}-${x}.glb`, { h: CAR_H }), size = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    half = Math.max(half, size.x / 2);   // 車頭朝 +z：x 是車寬
  }
  assert.ok(half > 0.05 && half < 0.2, `car half-width ${half.toFixed(3)}`);
  const p = views[8]['baseball.platform'], U = { x: Math.cos(baseball.DOME_STOP), z: Math.sin(baseball.DOME_STOP) };
  // 沿徑向擺的方塊（甲板、雨棚、站名牌）：中心的徑向距離＋本地 z 半長；柱子：中心＋半徑
  const outer = Math.max(...p.parts.filter(q => !cellAt(p.at.x + q.pos[0], p.at.z + q.pos[2])).map(q => {
    const r = (p.at.x + q.pos[0]) * U.x + (p.at.z + q.pos[2]) * U.z, s = Array.isArray(q.scale) ? q.scale : [q.scale, q.scale, q.scale];
    return r + (q.kind === 'box' ? s[2] / 2 : s[0] / 2);
  }));
  assert.ok(TRACK.radius - half - outer >= 0.1, `platform edge ${outer.toFixed(3)}, car side ${(TRACK.radius - half).toFixed(3)}`);
});
// 裁決 R13：Lv7、Lv8 劇本演完之後，球場格裡露出來的名冊成員（老鼠、鼠災工作人員不算；走出去的人已經不算成員）每一幀都 ≤ 8。
// 住在這一格的島民（landmarks.islanders 的家有一個在球場格）、鮮奶節每格一個的小孩（milk.extraKids）是別的物品的人數預算
// （計畫：島民 4、鮮奶節小孩 3，任務 12 驗全島），這裡不算——只管棒球自己的人和走進來的訪客
const RESIDENTS = ['rat.pack', 'baseball.staff', 'landmarks.islanders', 'milk.extraKids'];
test('after the Lv7 and Lv8 scripts the baseball cell never holds more than 8 visible roster members (rats, dome staff and other items\' residents excluded)', async () => {
  for (const order of SOLUTIONS) for (const to of [7, 8]) {
    const h = await headlessShow(), { show } = h;
    await liveAt(h, order, isBall(to));
    let worst = 0, who = '';
    for (let f = 0; f < 450; f++) {
      show.update(1 / 30, 200 + f / 30);
      const inCell = show.roster.keys().filter(k => !RESIDENTS.includes(k))
        .flatMap(k => show.roster.members(k).filter(m => !m.hidden && String(cellAt(m.pos.x, m.pos.z)) === String(CELL)).map(() => k));
      if (inCell.length > worst) { worst = inCell.length; who = inCell.join(' '); }
    }
    assert.ok(worst <= 8, `${order.join('>')} lv${to}: ${worst} in the cell (${who})`);
  }
});

// 拜訪點（計畫 6 設計 §4、§5）：唯一正解每一個 baseball 的 placed／grow，演之前與演完之後問 visitSpot——在格子裡、站位走得到；問到的級寫死
test('visitSpot(n, s) for every level 1..max: on the main island cell of the item (or null for off-island levels), frontOf(spot, r, nav) walkable within 0.6', async () => {
  const { visitSpotsThroughSolutions } = await import('./helpers/show.js');
  assert.equal(typeof baseball.visitSpot, 'function');
  const { bad, seen } = await visitSpotsThroughSolutions(baseball, SOLUTIONS, { cells: () => [[-1, 1]] });
  assert.deepEqual(bad, []);
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 8]);
});
