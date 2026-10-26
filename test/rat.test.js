import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as rat from '../src/actors/rat.js';
import * as milk from '../src/actors/milk.js';
import * as sat from '../src/actors/satellites.js';
import * as landmarks from '../src/actors/landmarks.js';
import { ENGINEER_ROUTE } from '../src/actors/chip.js';
import { TRACK } from '../src/actors/token.js';
import { anchorWorld, landmarkWorld } from '../src/actors/anchors.js';
import { offset } from '../src/actors/palette.js';
import { cellAt } from '../src/scene/hex.js';
import { lv } from './helpers/actors.js';
import { createPartFactory } from '../src/actors/parts.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { headlessShow, playItem } from './helpers/show.js';
const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);   // 兩條正解（賽博、外星），從求解器取
const CYBER = stats(enumerate(spec), spec).full.find(r => r.ending.id === 'cyber').order;   // 賽博那條（老鼠在 Lv4 分岔成機器鼠）
const ALIEN = stats(enumerate(spec), spec).full.find(r => r.ending.id === 'alien').order;   // 外星那條（變異鼠，Lv5 要颱風 ≥2）
const RAT = 'quat/enemies/Rat.glb', AT = anchorWorld('rat'), TOWER = anchorWorld('tower'), SPRING = landmarkWorld('spring');
const GATE = offset(anchorWorld('baseball'), 0, 1.1);
const near = (a, b, d) => Math.hypot(a.x - b.x, a.z - b.z) < d;

test('ratMode precedence: dome > alien > cyber > train > spring > nest > one', () => {
  assert.equal(rat.ratMode(lv({ rat: 1 }), {}), 'one');
  assert.equal(rat.ratMode(lv({ rat: 2 }), {}), 'nest');
  assert.equal(rat.ratMode(lv({ rat: 3 }), {}), 'spring');
  assert.equal(rat.ratMode(lv({ rat: 3, token: 4 }), {}), 'train');
  assert.equal(rat.ratMode(lv({ rat: 4, token: 4 }), { ratBranch: 'cyber' }), 'cyber');
  assert.equal(rat.ratMode(lv({ rat: 4 }), { ratBranch: 'alien' }), 'alien');
  assert.equal(rat.ratMode(lv({ rat: 4 }), { ratBranch: 'alien', domeRats: true }), 'dome');
  assert.equal(rat.ratMode(lv({ rat: 0 }), {}), null);
});
test('rat lv4 without ratBranch falls back to plain rats (review focus 4)', () => {
  assert.doesNotThrow(() => rat.view(lv({ rat: 4 }), {})); assert.equal(rat.ratMode(lv({ rat: 4 }), {}), 'spring');
  assert.equal(rat.ratMode(lv({ rat: 4, token: 5 }), {}), 'train');
});

// ── Task 16：老鼠全部改成名冊 rat.pack（§5.1：同一批老鼠上岸、生窩、上車、變身）──
const MODES = [
  [{ rat: 1 }, {}, 1], [{ rat: 2 }, {}, 5], [{ rat: 3 }, {}, 5], [{ rat: 3, token: 4 }, {}, 5], [{ rat: 4 }, { ratBranch: 'cyber' }, 5],
  [{ rat: 5 }, { ratBranch: 'cyber' }, 10], [{ rat: 4 }, { ratBranch: 'alien' }, 1], [{ rat: 5 }, { ratBranch: 'alien' }, 1], [{ rat: 2 }, { domeRats: true }, 5],
];
test('view: every mode is one rat.pack roster of Quaternius rats (n 1 → 5 → 10), walking anim, h 0.2 except the mutant', () => {
  for (const [l, f, n] of MODES) {
    const v = rat.view(lv(l), f), p = v['rat.pack'], what = JSON.stringify([l, f]);
    assert.equal(p.kind, 'roster', what); assert.equal(p.n, n, what);
    assert.deepEqual([p.model.path, p.model.anim], [RAT, 'Walk'], what);
    assert.equal(p.model.h, f.ratBranch === 'alien' ? 0.5 : 0.2, what);
    assert.ok(!Object.values(v).some(s => s.kind === 'rats'), `${what} no rats builder parts left`);
  }
});
test('view: home shapes — one/nest wander by the nest, spring stands in the pool, train rides, dome wanders at the gate', () => {
  const one = rat.view(lv({ rat: 1 }), {})['rat.pack'];
  assert.deepEqual(one.home, { kind: 'wander', at: AT, r: 0.7 });
  const nest = rat.view(lv({ rat: 2 }), {});
  assert.deepEqual(nest['rat.pack'].home, { kind: 'wander', at: AT, r: 0.7 });
  assert.equal(nest['rat.main'].kind, 'compound'); assert.deepEqual(nest['rat.main'].footprint, { r: 0.2 }, 'nest footprint is a circle (clear of the road on the bridge)');
  assert.equal(rat.view(lv({ rat: 1 }), {})['rat.main'], undefined);
  const spring = rat.view(lv({ rat: 3 }), {})['rat.pack'].home;
  assert.equal(spring.kind, 'stand'); assert.equal(spring.spots.length, 5);
  for (const s of spring.spots) { assert.ok(near(s, SPRING, 0.8)); assert.ok(Math.abs(s.y - (SPRING.y + 0.1)) < 1e-9); }
  assert.deepEqual(rat.view(lv({ rat: 3, token: 4 }), {})['rat.pack'].home, { kind: 'ride', cars: 3, speed: 0.35 });
  assert.deepEqual(rat.view(lv({ rat: 3, token: 5 }), { flooded: true })['rat.pack'].home, { kind: 'ride', cars: 5, speed: 0 });
  assert.deepEqual(rat.view(lv({ rat: 2 }), { domeRats: true })['rat.pack'].home, { kind: 'wander', at: GATE, r: 0.9 });
});
test('rat is a 5-level item (§4.6) and the transition clamp is gone', async () => {
  assert.equal(spec.ITEMS.rat.max, 5); assert.equal(spec.ITEMS.typhoon.max, 3);
  await assert.rejects(import('../src/actors/clamp.js'), 'clamp.js deleted');
});
test('view: cyber rats are grey with antennas on the engineer route, then ten wander round 101; the alien is a big green three-eyed waver with a UFO at Lv5', () => {
  const c = rat.view(lv({ rat: 4 }), { ratBranch: 'cyber' })['rat.pack'];
  assert.deepEqual(c.home, { kind: 'path', path: ENGINEER_ROUTE, loop: false, speed: 0.6 });
  assert.equal(c.model.tint.Grey, 0xc0c8d0); assert.ok(c.model.antenna);
  const c5 = rat.view(lv({ rat: 5 }), { ratBranch: 'cyber' })['rat.pack'];
  assert.deepEqual(c5.home, { kind: 'wander', at: TOWER, r: 1.3, entry: offset(anchorWorld('chip'), -0.5, 1.2) }); assert.ok(c5.model.antenna);
  const a = rat.view(lv({ rat: 4 }), { ratBranch: 'alien' }), m = a['rat.pack'];
  assert.equal(m.model.glow.Grey, 0x5fcf7a); assert.equal(m.model.tint.Grey, 0x5fcf7a); assert.ok(m.model.eye && m.model.wave);
  assert.equal(m.home.kind, 'stand'); assert.ok(near(m.home.spots[0], SPRING, 1.2));
  assert.equal(a['rat.ufo'], undefined);
  const u = rat.view(lv({ rat: 5 }), { ratBranch: 'alien' })['rat.ufo'];
  assert.equal(u.kind, 'ufo'); assert.equal(u.footprint, false); assert.ok(near(u.at, m.home.spots[0], 1e-6));
});
test('rats bathing turn the hot spring green-ish; rats on the train do not', () => {
  const water = v => v['landmarks.spring'].parts[1].color;
  assert.notEqual(water(landmarks.view(lv({ rat: 3 }), {})), water(landmarks.view(lv({}), {})));
  assert.equal(water(landmarks.view(lv({ rat: 3, token: 4 }), {})), water(landmarks.view(lv({}), {})));
});
test('rats builder (kept for the two rats on the rocks islet) spawns a model on each spot', async () => {
  const assets = { spawn: async () => new THREE.Group() };
  const f = createPartFactory(THREE, { glow: createGlowRegistry(), assets, builders: rat.builders });
  const s = sat.view(lv({ rat: 3 }), {})['sat.rocks'], p = f.build(s); await new Promise(r => setTimeout(r, 0));
  assert.equal(p.object.children.length, 2);
  const w = new THREE.Vector3(); p.object.updateMatrixWorld(true); p.object.children[0].children[0].getWorldPosition(w);
  assert.ok(near(w, s.spots[0], 1e-6)); p.dispose();
});
test('milk crate tips over (lying on its side, milk spilled) on the bite turn', () => {
  const up = milk.view(lv({ milk: 2 }), {})['milk.crate'], down = milk.view(lv({ milk: 2 }), {}, { bitten: true })['milk.crate'];
  assert.notDeepEqual(down, up); assert.ok(down.parts.some(p => p.spill), 'spilled milk');
  assert.deepEqual(down.footprint, up.footprint);
});
test('script: placed, grow 2–5, fx and rep exist; ◆ Lv4 and Lv5 are the key nodes', () => {
  assert.ok(rat.script?.placed && [2, 3, 4, 5].every(n => rat.script.grow[n]) && rat.script.fx && rat.script.rep);
  assert.deepEqual(Object.entries(rat.script.grow).filter(([, f]) => f.key).map(([n]) => +n), [4, 5]);
});

// ── 物品 v2 §4.6：Lv5 兩條分岔、人數預算、footprint ──
const { modelExtras } = await import('../src/show/roster.js');
const GOLDISH = c => ((c >> 16) & 255) > 200 && ((c >> 8) & 255) > 180 && (c & 255) < 160;
test('cyber Lv5: ten robot rats round 101 and a crowned robot rat sitting on the station roof (cyber station at token ≥ 9, the dome station cornice before)', async () => {
  const { ROOF_Y } = await import('../src/actors/token.js');
  for (const token of [7, 8, 9, 10]) {
    const v = rat.view(lv({ rat: 5, chip: 8, token }), { ratBranch: 'cyber' }), k = v['rat.king'], st = anchorWorld('token');
    assert.equal(v['rat.pack'].n, 10);
    assert.equal(k.kind, 'king'); assert.equal(k.footprint, false); assert.equal(k.model.path, RAT); assert.ok(k.model.antenna && k.model.crown);
    assert.ok(modelExtras(k.model, k.model.h).some(x => x.parts.some(p => GOLDISH(p.color))), 'a gold crown');
    assert.ok(near(k.at, st, 0.6), `on the station (token ${token})`);
    assert.ok(Math.abs(k.at.y - (st.y + (token >= 9 ? ROOF_Y : 0.605))) < 1e-6, `sits on the roof (token ${token}) y ${k.at.y}`);
  }
  for (const [l, f] of [[{ rat: 4, chip: 8 }, { ratBranch: 'cyber' }], [{ rat: 5 }, { ratBranch: 'alien' }], [{ rat: 3 }, {}]]) assert.equal(rat.view(lv(l), f)['rat.king'], undefined);
});
// 審稿：王冠鼠不能坐在停好的飛天車上——代幣 Lv10 三台停在屋頂左中右（車身長 0.3，沿停好的方向）；
// 王冠鼠離每一台車身（停車點 ± 0.15 沿車頭方向的線段）≥ 0.2，還在屋頂上、離天線 ≥ 0.2
test('the crown rat sits clear of the three parked speeders on the cyber roof (≥ 0.2 from every car body) and on the roof', async () => {
  const token = await import('../src/actors/token.js'), { orbitPose } = await import('../src/actors/parts.js'), st = anchorWorld('token');
  const v = token.view(lv({ token: 10 }), {}), k = rat.kingSpot(10);
  const segDist = (p, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz))); return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t); };
  for (let i = 0; i < 3; i++) {
    const car = v[`token.cars.${i}`], { yaw } = orbitPose(car, 1e6), ux = Math.sin(yaw) * 0.15, uz = Math.cos(yaw) * 0.15;
    const d = segDist(k, { x: car.park.x - ux, z: car.park.z - uz }, { x: car.park.x + ux, z: car.park.z + uz });
    assert.ok(d >= 0.2, `${d.toFixed(2)} from speeder ${i} parked at x ${(car.park.x - st.x).toFixed(2)}`);
  }
  assert.ok(Math.abs(k.x - st.x) <= 0.5 && Math.abs(k.z - st.z) <= 0.36, 'on the roof (1.1 × 0.82)');
  assert.ok(Math.hypot(k.x - (st.x + 0.42), k.z - (st.z - 0.3)) >= 0.2, 'clear of the roof antenna');
});
test('alien Lv5: the mutant wears a crown, a small UFO hovers over it, a green glow ring circles the rocks islet', () => {
  const v = rat.view(lv({ rat: 5 }), { ratBranch: 'alien' });
  assert.ok(v['rat.pack'].model.crown && v['rat.pack'].model.eye, 'crowned mutant');
  assert.ok(!rat.view(lv({ rat: 4 }), { ratBranch: 'alien' })['rat.pack'].model.crown, 'no crown at Lv4');
  assert.equal(v['rat.ufo'].kind, 'ufo');
  const ring = sat.view(lv({ rat: 5 }), { ratBranch: 'alien' })['sat.rocksRing'], rocks = sat.island('rocks');
  assert.ok(ring && near(ring.at, rocks, 1e-9), 'ring on the rocks islet');
  assert.ok(ring.parts.every(p => p.glow === 0x5fcf7a), 'green glow');
  for (const [l, f] of [[{ rat: 4 }, { ratBranch: 'alien' }], [{ rat: 5 }, { ratBranch: 'cyber' }]]) assert.equal(sat.view(lv(l), f)['sat.rocksRing'], undefined);
  assert.ok(sat.view(lv({ rat: 5 }), { ratBranch: 'alien' })['sat.rocks'], 'the two rats on the stones stay (skeletons: 1 + 2 + shiba)');
});
// 人數預算：老鼠 1 → 5 → 5 → 5／1 → 10＋王冠鼠／1；骨架動畫（名冊老鼠＋王冠鼠＋石堆兩隻）≤ 11（再加柴犬 ≤ 12）
test('rat budget per level: 1, 5, 5, 5 / 1, 10 + the crown rat / 1; animated rats ≤ 11 at every level', () => {
  const cases = [[{ rat: 1 }, {}, 1], [{ rat: 2 }, {}, 5], [{ rat: 3, token: 4 }, {}, 5], [{ rat: 3 }, {}, 5], [{ rat: 4, chip: 8 }, { ratBranch: 'cyber' }, 5], [{ rat: 4 }, { ratBranch: 'alien' }, 1],
    [{ rat: 5, chip: 8, token: 10 }, { ratBranch: 'cyber' }, 11], [{ rat: 5 }, { ratBranch: 'alien' }, 1]];
  for (const [l, f, want] of cases) {
    const v = rat.view(lv(l), f), s = sat.view(lv(l), f), what = JSON.stringify([l, f]);
    const n = v['rat.pack'].n + (v['rat.king'] ? 1 : 0);
    assert.equal(n, want, what);
    assert.ok(n + (s['sat.rocks']?.n ?? 0) <= 11, `${what} animated rats ${n + (s['sat.rocks']?.n ?? 0)}`);
  }
});
test('every rat footprint corner stays inside the rat cell; the king, the UFO and the ring declare no footprint', () => {
  const CELL = cellOf('rat');
  for (const [l, f] of [[{ rat: 1 }, {}], [{ rat: 2 }, {}], [{ rat: 3 }, {}], [{ rat: 4, chip: 8 }, { ratBranch: 'cyber' }], [{ rat: 5, chip: 8, token: 9 }, { ratBranch: 'cyber' }], [{ rat: 5 }, { ratBranch: 'alien' }], [{ rat: 2 }, { domeRats: true }]]) {
    for (const [key, s] of Object.entries(rat.view(lv(l), f))) {
      if (s.kind === 'roster') continue;
      if (key !== 'rat.main') { assert.equal(s.footprint, false, key); continue; }
      for (const fp of [].concat(s.footprint)) {
        const cx = s.at.x + (fp.x ?? 0), cz = s.at.z + (fp.z ?? 0), r = fp.r;
        for (const [dx, dz] of [[r, r], [r, -r], [-r, r], [-r, -r]]) assert.deepEqual(cellAt(cx + dx, cz + dz), CELL, `${key} corner`);
      }
    }
  }
});
// 分岔看引擎的 ratBranch 旗標：Lv4 劇本先套用一個同值的分岔事件，跟引擎同一個條件（spec.js 老鼠 onLevel 4，門檻照資料讀）
test('the Lv4 branch the script plays is the ratBranch flag the engine decides (cyber with chip ≥ 8, alien below)', () => {
  const branch = chip => rat.branchOf({ lv: lv({ rat: 4, chip }), flags: {} });
  const [id, n] = spec.ITEMS.rat.onLevel[4].find(a => a.branch).branch.when.minLevel;
  assert.equal(id, 'chip'); assert.equal(branch(n), 'cyber'); assert.equal(branch(n - 1), 'alien');
  for (const [order, want] of [[CYBER, 'cyber'], [ALIEN, 'alien']]) {
    let s = engine.createState(spec);
    for (const id2 of order) s = engine.place(s, id2, spec).state;
    for (let i = 0; i < spec.CLOSING_TURNS; i++) s = engine.advance(s, spec).state;
    assert.equal(s.flags.ratBranch, want, order.join('>'));
  }
});

// ── 劇本（§8.6）──
const KEYS = ['rat.pack', 'chip.detective'];
const isRat = to => e => e.kind === 'grow' && e.item === 'rat' && e.to === to;
// 照 order 把整局瞬間演到 pred 命中的那個事件，那個事件單獨 live 演；回傳 { e, secs, n }（n = 演之前的泡泡數）
async function liveAt({ run, bubblesLog }, order, pred, { whole = false } = {}) {
  let s = engine.createState(spec);
  const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  for (const step of steps) {
    const r = step(s); s = r.state;
    if (whole && r.events.some(pred)) { const n = bubblesLog.length; return { events: r.events, secs: await run([...r.events, { kind: 'settle' }]), n }; }
    for (const e of r.events) {
      if (!whole && pred(e)) { const n = bubblesLog.length; return { e, secs: await run([e]), n }; }
      await run([e], { instant: true });
    }
    await run([{ kind: 'settle' }], { instant: true });
  }
  throw new Error('event not found');
}
// 秒數範圍（§8.6 的目標秒數上下放寬）：放置是第 1 回合，一隻老鼠演滿 8–13 s（§4.4）；Lv3 搭捷運 10–18；Lv4／Lv5 依分岔
// 下限因 §13.2 降低：閃白 0.15 s（原白光 0.5）、spawn 不佔時間；入口走進場（計畫 3.8 後面的工作）會再拉長
// 物品 v2 §6：一級 3–5 s；◆ Lv4、Lv5 6–10 s（含鏡頭平移與回全景的整段，show.elapsed）
const KEY_LV = [4, 5];
function checkRat({ show, bubblesLog }, e, secs, n) {
  const lvl = e.kind === 'grow' ? e.to : 1, branch = show.stage.flags.ratBranch, what = `${e.kind} ${lvl} ${branch ?? ''}`;
  assert.ok(secs >= 3 && secs <= (KEY_LV.includes(lvl) ? 10 : 5), `${what} took ${secs.toFixed(2)}s`);
  if (KEY_LV.includes(lvl)) assert.ok(show.elapsed >= 6 && show.elapsed <= 10, `◆ ${what} whole event ${show.elapsed.toFixed(2)} s`);
  if (e.kind === 'grow') {
    const last = bubblesLog.slice(n).at(-1), h = show.stage.headOf('rat');
    assert.equal(last?.text, 'LEVEL UP', what); assert.ok(Math.hypot(last.at.x - h.x, last.at.y - h.y, last.at.z - h.z) < 0.3, `${what} LEVEL UP over rat`);
  }
  for (const k of KEYS) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', `${what} ${k}`);
  const rats = show.roster.members('rat.pack');
  assert.equal(rats.length, rat.view(show.stage.lv, show.stage.flags)['rat.pack'].n, `${what} rat count`);
  if (lvl === 3) {
    assert.equal(rat.view(show.stage.lv, show.stage.flags)['rat.pack'].home.kind, 'ride');
    for (const m of rats) assert.ok(Math.abs(m.pos.y - (TRACK.y + 0.18)) < 1e-6 && Math.abs(Math.hypot(m.pos.x, m.pos.z) - TRACK.radius) < 0.2, `${what} rat ${m.i} on the roof`);
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) assert.ok(Math.hypot(rats[i].pos.x - rats[j].pos.x, rats[i].pos.z - rats[j].pos.z) >= 0.2, `${what} rats ${i}/${j} apart`);
    assert.ok(bubblesLog.slice(n).some(b => b.kind === '！'), `${what} ！ and run for the train`);
  }
  if (lvl === 4 && branch === 'cyber') assert.ok(rats.every(m => m.dress.antenna && m.dress.tint.Grey === 0xc0c8d0), `${what} robot rats`);
  if (lvl === 4 && branch === 'alien') assert.ok(rats[0].dress.h === 0.5 && rats[0].dress.eye, `${what} mutant`);
  if (lvl === 5 && branch === 'alien') { const u = show.stage.partObject('rat.ufo'); assert.ok(u && Math.abs(u.userData.showOffset.dy) < 1e-9, `${what} UFO landed`); assert.ok(rats[0].dress.crown, `${what} crowned`); assert.ok(show.stage.partObject('sat.rocksRing'), `${what} ring`); }
  if (lvl === 5 && branch === 'cyber') assert.ok(show.stage.partObject('rat.king'), `${what} crown rat on the station`);
  if (lvl === 4) { const want = (spec.ITEMS.rat.onLevel[4].find(a => a.branch).branch.when.minLevel[1] <= show.stage.lv.chip) ? 'cyber' : 'alien'; assert.equal(branch, want, `${what} branch from the flag`); }
}

// 穿牆測試：劇本 walk 拍每一幀（setPose walking:true）老鼠都在走路格上，從水裡／車頂救上岸的第一段之外不能離開走路格，
// 任何時候都不能在建築 footprint 裡
function watchWalls(h) {
  const { show } = h, setPose = show.roster.setPose, bad = [], onGrid = new Map();
  let frames = 0;
  // 走路格 0.3 一格：footprint 邊上半格對角（≈0.22）以內算格子的解析度，再進去才算穿進建築
  const TOL = 0.22, inside = (x, z) => show.stage.footprints().some(f => (f.r != null ? Math.hypot(x - f.x, z - f.z) < f.r - TOL : Math.abs(x - f.x) < f.w / 2 - TOL && Math.abs(z - f.z) < f.d / 2 - TOL));
  show.roster.setPose = (m, p) => {
    if (m.key === 'rat.pack') {
      if (!p.walking) onGrid.delete(m);
      else if (cellAt(p.x, p.z)) {
        frames++;
        const ok = show.nav.walkable(p.x, p.z);
        if (ok) onGrid.set(m, true);
        else if (onGrid.get(m)) bad.push(`left the grid at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
        if (inside(p.x, p.z)) bad.push(`inside a footprint at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
      }
    }
    return setPose(m, p);
  };
  return { bad, get frames() { return frames; } };
}

test('scripts: every rat level in both solutions plays in range, ends with LEVEL UP on the rats, everyone home; rats never walk through buildings', async () => {
  for (const order of SOLUTIONS) {
    const h = await headlessShow(), { show, run, bubblesLog } = h, walls = watchWalls(h);
    let n = 0;
    const tracked = (evs, opts) => { if (!opts?.instant) n = bubblesLog.length; return run(evs, opts); };
    const seen = new Set();
    await playItem(show, tracked, order, 'rat', (e, secs) => { seen.add(e.kind === 'grow' ? e.to : 1); checkRat(h, e, secs, n); });
    assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5], `rat events seen: ${[...seen]}`);
    assert.ok(walls.frames > 100, `walk frames ${walls.frames}`); assert.deepEqual(walls.bad, [], order.join(' '));
    show.reset(); assert.equal(show.roster.members('rat.pack').length, 0);
  }
});
test('reset releases every rat model', async () => {
  const h = await headlessShow();
  await liveAt(h, SOLUTIONS[1], isRat(5));
  assert.equal(h.show.roster.members('rat.pack').length, 10);
  const holders = h.show.roster.members('rat.pack').map(m => m.holder);
  h.show.reset();
  assert.ok(holders.every(g => h.assets.released.includes(g)), 'every rat holder released'); assert.equal(h.show.roster.group.children.length, 0);
});
test('Lv3 train: all five run to the nest-side shore and hop on together while the train is held there', async () => {
  const h = await headlessShow(), { show } = h, update = show.update, boards = [];
  let prev = null;
  show.update = (dt, t) => {
    const before = h.rail.offset; update(dt, t);
    const held = Math.abs(h.rail.offset - before + dt) < 1e-9, roof = show.roster.members('rat.pack').map(m => Math.abs(m.pos.y - (TRACK.y + 0.18)) < 1e-6);
    if (prev) roof.forEach((r, i) => { if (r && !prev[i]) boards.push({ i, held, a: Math.atan2(show.roster.members('rat.pack')[i].pos.z, show.roster.members('rat.pack')[i].pos.x) }); });
    prev = roof;
  };
  const { e, secs, n } = await liveAt(h, SOLUTIONS[0], isRat(3));
  checkRat(h, e, secs, n);
  assert.deepEqual(boards.map(b => b.i).sort(), [0, 1, 2, 3, 4], 'all five board');
  assert.ok(boards.every(b => b.held), 'each rat lands while the train is held');
  const nest = Math.atan2(AT.z, AT.x);
  assert.ok(boards.every(b => Math.abs(b.a - nest) < 0.35), 'they board by the nest');
});
test('Lv3 spring (no train yet, token < 4): five rats walk up to the hot spring and ♥', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  await run([{ kind: 'placed', item: 'rat', to: 1 }, { kind: 'grow', item: 'rat', from: 1, to: 2 }, { kind: 'settle' }], { instant: true });
  const n = bubblesLog.length, e = { kind: 'grow', item: 'rat', from: 2, to: 3 }, secs = await run([e]);
  assert.ok(secs >= 3 && secs <= 5, `${secs.toFixed(1)} s`);
  assert.ok(bubblesLog.slice(n).filter(b => b.kind === '♥').length >= 5); assert.equal(bubblesLog.at(-1).text, 'LEVEL UP');
  for (let i = 0; i < 300; i++) show.update(1 / 30, 100 + i / 30);
  for (const m of show.roster.members('rat.pack')) { assert.equal(m.mode, 'home'); assert.ok(near(m.pos, SPRING, 0.8), 'in the pool'); }
});
// 審稿：蒙太奇走路兩倍速，泡溫泉的快跑不再加倍（每幀位移 ≤ 4.5 × dt）
test('Lv3 spring in a montage: the dash is capped (never faster than 4.5 per second)', async () => {
  const h = await headlessShow(), { show, run } = h;
  await run([{ kind: 'placed', item: 'rat', to: 1 }, { kind: 'grow', item: 'rat', from: 1, to: 2 }, { kind: 'settle' }], { instant: true });
  const setPose = show.roster.setPose, last = new Map(); let fastest = 0;
  show.roster.setPose = (m, p) => { if (m.key === 'rat.pack' && p.walking) { const q = last.get(m); if (q) fastest = Math.max(fastest, Math.hypot(p.x - q.x, p.z - q.z) * 30); last.set(m, { x: p.x, z: p.z }); } return setPose(m, p); };
  try { await run([{ kind: 'grow', item: 'rat', from: 2, to: 3 }], { montage: true }); } finally { show.roster.setPose = setPose; }
  assert.ok(fastest > 2 && fastest <= 4.5 + 0.05, `fastest ${fastest.toFixed(2)} / s`);
});
// 兩個事件以上的回合整段 live：咬鮮奶、撞珍奶同一回合，名冊都是演到才找。
// 物品 v2：兩個都是老鼠的放置反應；鮮奶 Lv2（早餐店）時放老鼠，被咬掉一級（箱子翻倒、LEVEL DOWN），珍奶 Lv1 → 2 攤車不重建、照樣歪著
test('the placement turn with both reactions plays live: a rat goes to the crate, another tips the boba cart', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h, walls = watchWalls(h);
  const { events, secs, n } = await liveAt(h, ['milk', 'boba', 'rat', 'chip', 'token'], e => e.kind === 'placed' && e.item === 'rat', { whole: true });
  assert.ok(events.some(e => e.delta?.target === 'milk' && e.cause === 'rat') && events.some(e => e.cause === 'rat' && e.story?.includes('珍奶')), 'both reactions');
  assert.ok(secs >= 8 && secs <= 40, `${secs.toFixed(1)} s`);   // 上限 30 → 40：這回合還有珍奶 Lv2 排隊、被咬的小學生跑回校舍（實測 32.5 s；回合門檻 50 由 pace 管）
  assert.ok(Math.abs(show.stage.partObject('boba.main').rotation.z - 0.25) < 1e-9, 'cart knocked askew');
  assert.ok(milk.view(show.stage.lv, show.stage.flags, show.stage.meta)['milk.crate'].parts.some(p => p.spill), 'the bite tips the crate over (spilled milk)');
  assert.ok(bubblesLog.slice(n).some(b => b.down), 'LEVEL DOWN');
  assert.ok(bubblesLog.slice(n).filter(b => b.kind === '！').length >= 1);
  for (const k of KEYS) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home');
  assert.deepEqual(walls.bad, []); assert.ok(walls.frames > 20);
});
// 鮮奶真的被咬掉級（引擎現在不會出：老鼠生窩要鮮奶 ≤1；堆出狀態直接演事件）：箱子翻倒、小學生跑回校舍、LEVEL DOWN
test('a bite that costs milk a level: crate tips, kids ！ run to the school gate and vanish quietly, LEVEL DOWN', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  let st = engine.createState(spec);
  // 物品 v2：小學生 Lv3 才有（§4.2），所以堆到鮮奶 3 再咬掉一級
  for (const id of ['rat', 'typhoon', 'milk', 'chip', 'bulb']) { const r = engine.place(st, id, spec); st = r.state; await run([...r.events, { kind: 'settle' }], { instant: true }); }
  assert.equal(show.stage.lv.milk, 3); assert.equal(show.roster.members('milk.kids').length, 3);
  const hidden = [], hide = show.roster.hide; show.roster.hide = m => { hidden.push(m.key); return hide(m); };
  const n = bubblesLog.length, crate = show.stage.partObject('milk.crate');
  const secs = await run([{ kind: 'fx', item: 'milk', cause: 'rat', delta: { target: 'milk', from: 3, to: 2 }, story: '老鼠咬破鮮奶箱' }]);
  assert.ok(secs >= 4 && secs <= 14, `${secs.toFixed(1)} s`);
  assert.notEqual(show.stage.partObject('milk.crate'), crate, 'crate rebuilt tipped');
  assert.ok(bubblesLog.slice(n).filter(b => b.kind === '！').length >= 4, 'rat ！ and three kids ！');
  assert.deepEqual(hidden, ['milk.kids', 'milk.kids', 'milk.kids'], 'kids hide at the gate');
  assert.equal(show.roster.members('milk.kids').length, 0);
  const last = bubblesLog.at(-1), m = show.stage.headOf('milk');
  assert.equal(last.text, 'LEVEL DOWN'); assert.ok(Math.hypot(last.at.x - m.x, last.at.z - m.z) < 0.3);
  for (const r of show.roster.members('rat.pack')) assert.equal(r.mode, 'home');
});
// 鼠災（颱風登陸的反應）：登陸之後同一回合只演 apply（使用者規則，turn.js）——老鼠的家搬到巨蛋門口、兩個工作人員出來，
// 之後日常自己走過去：老鼠在門口晃、工作人員跟著牠們
test('typhoon dome rats: after the landing turn the real rats settle by the dome gate and the staff stay with them', async () => {
  const h = await headlessShow(), { show } = h, walls = watchWalls(h);
  const { events } = await liveAt(h, ['rat', 'baseball', 'chip', 'milk', 'typhoon', 'bulb'], e => e.flag?.name === 'domeRats', { whole: true });
  assert.ok(events.some(e => e.flag?.name === 'domeRats'));
  const rats = show.roster.members('rat.pack'), staff = show.roster.members('baseball.staff');
  assert.equal(rats.length, 5); assert.equal(staff.length, 2);
  for (let i = 0; i < 240; i++) show.update(1 / 30, 200 + i / 30);
  for (const m of rats) { assert.equal(m.mode, 'home'); assert.ok(near(m.pos, GATE, 1.5), `rat ${m.i} by the gate`); }
  for (const m of staff) assert.ok(rats.some(r => near(r.pos, m.pos, 1.2)), 'staff stay with the rats');
  assert.deepEqual(walls.bad, []);
});
test('rep is the first rat', async () => {
  const h = await headlessShow();
  await h.run([{ kind: 'placed', item: 'rat', to: 1 }, { kind: 'settle' }], { instant: true });
  assert.equal(rat.script.rep({}, h.show), h.show.roster.members('rat.pack')[0]);
});
// 審查 Important 1：軍團回合石堆小島的兩隻老鼠跟著同一次套用收掉（骨架動畫 ≤ 12），LEVEL UP 之後不再閃白
test('cyber Lv5: the rocks-islet rats go with the army apply, before LEVEL UP; no blink after LEVEL UP', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h, { part, walker } = show.blink, levelUp = show.bubbles.levelUp, blinks = [];
  let rocksAtLevelUp = null;
  show.blink.part = (...a) => { blinks.push(bubblesLog.length); return part(...a); };
  show.blink.walker = (...a) => { blinks.push(bubblesLog.length); return walker(...a); };
  show.bubbles.levelUp = (head, o) => { rocksAtLevelUp = show.stage.partKeys().includes('sat.rocks') || show.stage.pendingKeys().includes('sat.rocks'); return levelUp(head, o); };
  const { e, secs, n } = await liveAt(h, CYBER, isRat(5));
  assert.equal(show.stage.flags.ratBranch, 'cyber'); checkRat(h, e, secs, n);
  assert.equal(rocksAtLevelUp, false, 'sat.rocks gone before LEVEL UP');
  const lu = bubblesLog.findIndex((b, i) => i >= n && b.text === 'LEVEL UP');
  assert.ok(blinks.length > 0 && blinks.every(k => k <= lu), `no blink after LEVEL UP (${blinks} vs ${lu})`);
});
// 審查 Important 2：老鼠排成一列跟著偵防師走：每隻晚 0.3 s 出發
test('cyber Lv4: the rats set off for the park one after another, ≥ 0.25 s apart', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h, update = show.update, setPose = show.roster.setPose, starts = new Map();
  let now = 0, icon = false;
  show.update = (dt, t) => { now += dt; icon ||= bubblesLog.some(b => b.kind?.icon === 'chip'); update(dt, t); };
  show.roster.setPose = (m, p) => { if (icon && m.key === 'rat.pack' && p.walking && !starts.has(m)) starts.set(m, now); return setPose(m, p); };
  const { e, secs, n } = await liveAt(h, CYBER, isRat(4));
  checkRat(h, e, secs, n);
  const t = [...starts.values()].sort((a, b) => a - b);
  assert.equal(t.length, 5);
  for (let i = 1; i < 5; i++) assert.ok(t[i] - t[i - 1] >= 0.25, `starts ${t.map(x => x.toFixed(2))}`);
});

// ── 計畫 3.8 Task 7：入口點、鏡頭焦點 ──
import { entryProblems, focusCell, focusTrail } from './helpers/actors.js';
import { entriesThroughSolutions } from './helpers/show.js';
import { createNav } from '../src/show/nav.js';
import { cellOf } from '../src/actors/anchors.js';
import { B } from '../src/show/beats.js';
const PARK = offset(anchorWorld('chip'), -0.5, 1.2);
// 老鼠的入口：每一種模式、每一級走得到、離站位 ≥ 1.5（兩條正解每一刻的真 footprint）；第一隻從巨蛋格東南岸外的海裡（LANDING）爬上來
// （劇本的 spawn，不是名冊入口：上岸點離窩只有 0.4，但牠是從海裡爬上來、再沿岸繞一圈才回窩，不是在窩邊冒出來）；
// 賽博 Lv5 補的五隻機器鼠從園區門口（原本五隻變身的地方）走去 101
test('rat entries: walkable and ≥ 1.5 from every spot in every mode; the first rat spawns at the landing in the sea off the dome cell; the cyber legion comes out of the park gate', async () => {
  const nav = createNav(), bad = [];
  const modes = [[{ rat: 1 }, {}], [{ rat: 2 }, {}], [{ rat: 3 }, {}], [{ rat: 3, token: 4 }, {}], [{ rat: 4, chip: 3 }, { ratBranch: 'cyber' }], [{ rat: 5, chip: 3 }, { ratBranch: 'cyber' }],
    [{ rat: 4 }, { ratBranch: 'alien' }], [{ rat: 5 }, { ratBranch: 'alien' }], [{ rat: 4, baseball: 3 }, { domeRats: true }]];
  for (const [l, f] of modes) bad.push(...entryProblems(rat.view(lv(l), f), nav, `${JSON.stringify(l)} ${JSON.stringify(f)}`));
  bad.push(...await entriesThroughSolutions(rat, SOLUTIONS));
  assert.deepEqual(bad, []);
  const landing = offset(anchorWorld('baseball'), 2.0, 2.05);
  assert.equal(cellAt(landing.x, landing.z), null, 'the first rat climbs out of the sea');
  const beats = rat.script.placed({ kind: 'placed', item: 'rat', to: 1 }, { lv: lv({ rat: 1 }), flags: {} }, fakeCtx()), at = [];
  beats.find(b => b.kind === 'spawn').start({ roster: { spawnHeld: (k, p) => { at.push(p); return null; } } });
  assert.ok(near(at[0], landing, 1e-9), 'placed spawns it at the landing');
  const legion = rat.view(lv({ rat: 5, chip: 3 }), { ratBranch: 'cyber' })['rat.pack'];
  assert.ok(near(legion.home.entry, PARK, 1e-9), 'legion entry at the park gate');
});
const fakeCtx = () => ({ B, roster: { members: () => [] } });
const flat = bs => bs.flatMap(b => (b.kind === 'together' ? flat(b.beats) : [b]));
const focusCells = beats => flat(beats).filter(b => b.kind === 'focus').map(b => focusCell(b, fakeCtx()));
const grow = (to, l, flags = {}, prev = { lv: lv({ ...l, rat: to - 1 }), flags: {} }) => rat.script.grow[to]({ kind: 'grow', item: 'rat', from: to - 1, to }, { lv: lv({ ...l, rat: to }), flags, prev }, fakeCtx());
// 鏡頭（§13.1）：搭捷運對著老鼠窩格（五隻在窩那側島緣上車）；賽博 Lv4 對著晶片格（園區）、Lv5 對著 101；泡溫泉、外星（溫泉邊）
// 對著溫泉格；◆ Lv5 最後回全景定格。每段劇本第一拍就是自己的 focus（回合不再先補一拍老鼠格）
test('focus: train Lv3 at the nest; cyber Lv4 chip, Lv5 101 then the overview; spring / alien at the hot spring (Lv5 then the overview)', () => {
  const SPRING_CELL = [1, -1];
  const cases = [
    ['train 3', grow(3, { token: 4 }), [cellOf('rat')]],
    ['spring 3', grow(3, {}), [SPRING_CELL]],
    ['cyber 4', grow(4, { chip: 8, token: 4 }, {}, { lv: lv({ rat: 3, chip: 8, token: 4 }), flags: {} }), [cellOf('chip')]],   // 物品 v2：晶片 ≥8 才分岔成機器鼠
    ['cyber 5', grow(5, { chip: 3 }, { ratBranch: 'cyber' }), [cellOf('tower'), null]],   // null：回全景定格
    ['alien 4', grow(4, { token: 4 }, {}, { lv: lv({ rat: 3, token: 4 }), flags: {} }), [SPRING_CELL]],
    ['alien 5', grow(5, {}, { ratBranch: 'alien' }), [SPRING_CELL, null]],
  ];
  for (const [what, beats, want] of cases) {
    assert.equal(beats[0].kind, 'focus', `${what} starts with its own focus`);
    assert.deepEqual(focusCells(beats), want, `${what} focus cells`);
  }
});
test('Lv3 train live: the camera goes to the nest, then home', async () => {
  const h = await headlessShow(); let r0 = 0;
  const run = h.run; h.run = (evs, o) => { if (!o?.instant) r0 = h.rig.log.length; return run(evs, o); };
  await liveAt(h, SOLUTIONS[0], isRat(3));
  assert.deepEqual(focusTrail(h.rig.log, r0).map(String), [String(cellOf('rat')), 'home']);
});
// 外星那條：老鼠 Lv5（颱風 ≥2）在倒數回合；整回合照蒙太奇 live 演，關鍵節點照樣演完——UFO 從天上降下、變異鼠戴王冠、石堆島綠光圈
test('alien solution: rat Lv5 in its countdown turn (montage, typhoon ≥ 2) still plays the UFO coming down, the crown and the ring', async () => {
  const h = await headlessShow(), { show, run } = h;
  let s = engine.createState(spec), evs = null;
  const steps = [...ALIEN.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  for (const [i, step] of steps.entries()) {
    const r = step(s); s = r.state;
    if (r.events.some(isRat(5))) { evs = [...r.events, { kind: 'settle' }]; assert.ok(i >= ALIEN.length, 'a countdown turn'); break; }
    await run([...r.events, { kind: 'settle' }], { instant: true, montage: i >= ALIEN.length });
  }
  assert.ok(evs && s.lv.typhoon >= 2);
  const update = show.update; let high = 0;
  show.update = (dt, t) => { update(dt, t); const u = show.stage.partObject('rat.ufo'); if (u) high = Math.max(high, u.userData.showOffset?.dy ?? 0); };
  try { await run(evs, { montage: true }); } finally { show.update = update; }
  assert.ok(high > 2, `the UFO came down from the sky (max dy ${high.toFixed(2)})`);
  assert.ok(show.roster.members('rat.pack')[0].dress.crown, 'crowned'); assert.ok(show.stage.partObject('sat.rocksRing'), 'ring on the rocks');
});
