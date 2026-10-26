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
const RAT = 'quat/enemies/Rat.glb', AT = anchorWorld('rat'), TOWER = anchorWorld('tower'), SPRING = landmarkWorld('spring');
const GATE = offset(anchorWorld('baseball'), 0, 1.1);
const near = (a, b, d) => Math.hypot(a.x - b.x, a.z - b.z) < d;

test('ratMode precedence: dome > alien > cyber > train > spring > nest > one', () => {
  assert.equal(rat.ratMode(lv({ rat: 1 }), {}), 'one');
  assert.equal(rat.ratMode(lv({ rat: 2 }), {}), 'nest');
  assert.equal(rat.ratMode(lv({ rat: 3 }), {}), 'spring');
  assert.equal(rat.ratMode(lv({ rat: 3, token: 2 }), {}), 'train');
  assert.equal(rat.ratMode(lv({ rat: 4, token: 2 }), { ratBranch: 'cyber' }), 'cyber');
  assert.equal(rat.ratMode(lv({ rat: 4 }), { ratBranch: 'alien' }), 'alien');
  assert.equal(rat.ratMode(lv({ rat: 4 }), { ratBranch: 'alien', domeRats: true }), 'dome');
  assert.equal(rat.ratMode(lv({ rat: 0 }), {}), null);
});
test('rat lv4 without ratBranch falls back to plain rats (review focus 4)', () => {
  assert.doesNotThrow(() => rat.view(lv({ rat: 4 }), {})); assert.equal(rat.ratMode(lv({ rat: 4 }), {}), 'spring');
  assert.equal(rat.ratMode(lv({ rat: 4, token: 3 }), {}), 'train');
});

// ── Task 16：老鼠全部改成名冊 rat.pack（§5.1：同一批老鼠上岸、生窩、上車、變身）──
const MODES = [
  [{ rat: 1 }, {}, 1], [{ rat: 2 }, {}, 5], [{ rat: 3 }, {}, 5], [{ rat: 3, token: 2 }, {}, 5], [{ rat: 4 }, { ratBranch: 'cyber' }, 5],
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
  assert.equal(nest['rat.main'].kind, 'compound'); assert.equal(nest['rat.main'].footprint, undefined, 'nest footprint is automatic');
  assert.equal(rat.view(lv({ rat: 1 }), {})['rat.main'], undefined);
  const spring = rat.view(lv({ rat: 3 }), {})['rat.pack'].home;
  assert.equal(spring.kind, 'stand'); assert.equal(spring.spots.length, 5);
  for (const s of spring.spots) { assert.ok(near(s, SPRING, 0.8)); assert.ok(Math.abs(s.y - (SPRING.y + 0.1)) < 1e-9); }
  assert.deepEqual(rat.view(lv({ rat: 3, token: 2 }), {})['rat.pack'].home, { kind: 'ride', cars: 3, speed: 0.35 });
  assert.deepEqual(rat.view(lv({ rat: 3, token: 3 }), { flooded: true })['rat.pack'].home, { kind: 'ride', cars: 5, speed: 0 });
  assert.deepEqual(rat.view(lv({ rat: 2 }), { domeRats: true })['rat.pack'].home, { kind: 'wander', at: GATE, r: 0.9 });
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
  assert.equal(water(landmarks.view(lv({ rat: 3, token: 2 }), {})), water(landmarks.view(lv({}), {})));
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
test('script: placed, grow 2–5, fx and rep exist', () => {
  assert.ok(rat.script?.placed && [2, 3, 4, 5].every(n => rat.script.grow[n]) && rat.script.fx && rat.script.rep);
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
const RANGE = { 1: [8, 13], 2: [2, 10], 3: [10, 18], cyber4: [6, 16], alien4: [5, 14], cyber5: [2.5, 10], alien5: [3, 8] };
function checkRat({ show, bubblesLog }, e, secs, n) {
  const lvl = e.kind === 'grow' ? e.to : 1, branch = show.stage.flags.ratBranch, what = `${e.kind} ${lvl} ${branch ?? ''}`;
  const [lo, hi] = RANGE[lvl >= 4 ? `${branch}${lvl}` : lvl];
  assert.ok(secs >= lo && secs <= hi, `${what} took ${secs.toFixed(1)}s (want ${lo}–${hi})`);
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
    assert.ok(bubblesLog.slice(n).some(b => b.kind === '……'), `${what} waits at the shore`);
  }
  if (lvl === 4 && branch === 'cyber') assert.ok(rats.every(m => m.dress.antenna && m.dress.tint.Grey === 0xc0c8d0), `${what} robot rats`);
  if (lvl === 4 && branch === 'alien') assert.ok(rats[0].dress.h === 0.5 && rats[0].dress.eye, `${what} mutant`);
  if (lvl === 5 && branch === 'alien') { const u = show.stage.partObject('rat.ufo'); assert.ok(u && Math.abs(u.userData.showOffset.dy) < 1e-9, `${what} UFO landed`); }
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
test('Lv3 train: one rat boards at the station, the other four at the nest-side shore while the train is held', async () => {
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
  assert.deepEqual(boards.map(b => b.i), [0, 1, 2, 3, 4], 'rat 0 first, then the rest in order');
  assert.ok(boards.every(b => b.held), 'each rat lands while the train is held');
  const station = Math.atan2(anchorWorld('token').z, anchorWorld('token').x), nest = Math.atan2(AT.z, AT.x);
  assert.ok(Math.abs(boards[0].a - station) < 0.25, 'rat 0 boards by the station');
  assert.ok(boards.slice(1).every(b => Math.abs(b.a - nest) < 0.3), 'the rest board by the nest');
});
test('Lv3 spring (token < 2): five rats walk up to the hot spring and ♥', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  await run([{ kind: 'placed', item: 'rat', to: 1 }, { kind: 'grow', item: 'rat', from: 1, to: 2 }, { kind: 'settle' }], { instant: true });
  const n = bubblesLog.length, e = { kind: 'grow', item: 'rat', from: 2, to: 3 }, secs = await run([e]);
  assert.ok(secs >= 4 && secs <= 14, `${secs.toFixed(1)} s`);
  assert.ok(bubblesLog.slice(n).filter(b => b.kind === '♥').length >= 5); assert.equal(bubblesLog.at(-1).text, 'LEVEL UP');
  for (let i = 0; i < 300; i++) show.update(1 / 30, 100 + i / 30);
  for (const m of show.roster.members('rat.pack')) { assert.equal(m.mode, 'home'); assert.ok(near(m.pos, SPRING, 0.8), 'in the pool'); }
});
// 兩個事件以上的回合整段 live：咬鮮奶、撞珍奶同一回合（引擎：鮮奶 Lv1 被咬不掉級），名冊都是演到才找
test('the nest turn with both reactions plays live: a rat goes to the crate, another tips the boba cart', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h, walls = watchWalls(h);
  const { events, secs, n } = await liveAt(h, ['boba', 'rat', 'milk', 'chip', 'token'], isRat(2), { whole: true });
  assert.ok(events.some(e => e.delta?.target === 'milk' && e.cause === 'rat') && events.some(e => e.cause === 'rat' && e.story?.includes('珍奶')), 'both reactions');
  assert.ok(secs >= 8 && secs <= 30, `${secs.toFixed(1)} s`);
  assert.ok(Math.abs(show.stage.partObject('boba.main').rotation.z - 0.25) < 1e-9, 'cart knocked askew');
  assert.ok(Math.abs(show.stage.partObject('milk.crate').rotation.z - 0.35) < 1e-9, 'the bite that costs nothing still tips the crate');
  assert.ok(bubblesLog.slice(n).filter(b => b.kind === '！').length >= 1);
  for (const k of KEYS) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home');
  assert.deepEqual(walls.bad, []); assert.ok(walls.frames > 20);
});
// 鮮奶真的被咬掉級（引擎現在不會出：老鼠生窩要鮮奶 ≤1；堆出狀態直接演事件）：箱子翻倒、小學生跑回校舍、LEVEL DOWN
test('a bite that costs milk a level: crate tips, kids ！ run to the school gate and vanish quietly, LEVEL DOWN', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  let st = engine.createState(spec);
  for (const id of ['rat', 'typhoon', 'milk', 'chip']) { const r = engine.place(st, id, spec); st = r.state; await run([...r.events, { kind: 'settle' }], { instant: true }); }
  assert.equal(show.stage.lv.milk, 2); assert.equal(show.roster.members('milk.kids').length, 3);
  const hidden = [], hide = show.roster.hide; show.roster.hide = m => { hidden.push(m.key); return hide(m); };
  const n = bubblesLog.length, crate = show.stage.partObject('milk.crate');
  const secs = await run([{ kind: 'fx', item: 'milk', cause: 'rat', delta: { target: 'milk', from: 2, to: 1 }, story: '老鼠咬破鮮奶箱' }]);
  assert.ok(secs >= 4 && secs <= 14, `${secs.toFixed(1)} s`);
  assert.notEqual(show.stage.partObject('milk.crate'), crate, 'crate rebuilt tipped');
  assert.ok(bubblesLog.slice(n).filter(b => b.kind === '！').length >= 4, 'rat ！ and three kids ！');
  assert.deepEqual(hidden, ['milk.kids', 'milk.kids', 'milk.kids'], 'kids hide at the gate');
  assert.equal(show.roster.members('milk.kids').length, 0);
  const last = bubblesLog.at(-1), m = show.stage.headOf('milk');
  assert.equal(last.text, 'LEVEL DOWN'); assert.ok(Math.hypot(last.at.x - m.x, last.at.z - m.z) < 0.3);
  for (const r of show.roster.members('rat.pack')) assert.equal(r.mode, 'home');
});
// 鼠災（颱風劇本）：真的老鼠被沖到巨蛋門口，兩個工作人員出來追
test('typhoon dome rats: the real rats are flushed to the dome gate and the staff follow them', async () => {
  const h = await headlessShow(), { show } = h, walls = watchWalls(h);
  const { events } = await liveAt(h, ['rat', 'baseball', 'chip', 'milk', 'typhoon', 'bulb'], e => e.flag?.name === 'domeRats', { whole: true });
  assert.ok(events.some(e => e.flag?.name === 'domeRats'));
  const rats = show.roster.members('rat.pack'), staff = show.roster.members('baseball.staff');
  assert.equal(rats.length, 5); assert.equal(staff.length, 2);
  for (const m of rats) { assert.equal(m.mode, 'home'); assert.ok(near(m.pos, GATE, 1.5), `rat ${m.i} by the gate`); }
  for (const m of staff) assert.ok(near(m.pos, GATE, 2), 'staff at the gate');
  for (let i = 0; i < 90; i++) show.update(1 / 30, 200 + i / 30);
  for (const m of staff) assert.ok(rats.some(r => near(r.pos, m.pos, 1.2)), 'staff stay with the rats');
  assert.deepEqual(walls.bad, []); assert.ok(walls.frames > 10);
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
  const { e, secs, n } = await liveAt(h, SOLUTIONS.find(o => o.indexOf('chip') < o.indexOf('milk')), isRat(5));
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
  const { e, secs, n } = await liveAt(h, SOLUTIONS.find(o => o.indexOf('chip') < o.indexOf('milk')), isRat(4));
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
  const modes = [[{ rat: 1 }, {}], [{ rat: 2 }, {}], [{ rat: 3 }, {}], [{ rat: 3, token: 2 }, {}], [{ rat: 4, chip: 3 }, { ratBranch: 'cyber' }], [{ rat: 5, chip: 3 }, { ratBranch: 'cyber' }],
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
// 鏡頭（§13.1）：搭捷運先對著站（代幣格）看第一隻上車，其餘四隻跑回窩那側島緣時轉回老鼠窩格；賽博 Lv4 對著晶片格（園區）、
// Lv5 對著 101；泡溫泉、外星（溫泉邊）對著溫泉格。每段劇本第一拍就是自己的 focus（回合不再先補一拍老鼠格）
test('focus: train Lv3 token then nest; cyber Lv4 chip, Lv5 101; spring / alien at the hot spring', () => {
  const SPRING_CELL = [1, -1];
  const cases = [
    ['train 3', grow(3, { token: 2 }), [cellOf('token'), cellOf('rat')]],
    ['spring 3', grow(3, {}), [SPRING_CELL]],
    ['cyber 4', grow(4, { chip: 3, token: 2 }, {}, { lv: lv({ rat: 3, chip: 3, token: 2 }), flags: {} }), [cellOf('chip')]],
    ['cyber 5', grow(5, { chip: 3 }, { ratBranch: 'cyber' }), [cellOf('tower')]],
    ['alien 4', grow(4, { token: 2 }, {}, { lv: lv({ rat: 3, token: 2 }), flags: {} }), [SPRING_CELL]],
    ['alien 5', grow(5, {}, { ratBranch: 'alien' }), [SPRING_CELL]],
  ];
  for (const [what, beats, want] of cases) {
    assert.equal(beats[0].kind, 'focus', `${what} starts with its own focus`);
    assert.deepEqual(focusCells(beats), want, `${what} focus cells`);
  }
});
test('Lv3 train live: the camera goes to the station, then back to the nest, then home', async () => {
  const h = await headlessShow(); let r0 = 0;
  const run = h.run; h.run = (evs, o) => { if (!o?.instant) r0 = h.rig.log.length; return run(evs, o); };
  await liveAt(h, SOLUTIONS[0], isRat(3));
  assert.deepEqual(focusTrail(h.rig.log, r0).map(String), [String(cellOf('token')), String(cellOf('rat')), 'home']);
});
