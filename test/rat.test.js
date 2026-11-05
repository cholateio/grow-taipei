import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as rat from '../src/actors/rat.js';
import * as milk from '../src/actors/milk.js';
import * as sat from '../src/actors/satellites.js';
import * as landmarks from '../src/actors/landmarks.js';
import { TRACK, RIDE_Y } from '../src/actors/token.js';
import { anchorWorld, landmarkWorld } from '../src/actors/anchors.js';
import { offset } from '../src/actors/palette.js';
import { cellAt } from '../src/scene/hex.js';
import { lv } from './helpers/actors.js';
import { createPartFactory } from '../src/actors/parts.js';
import { createGlowRegistry } from '../src/scene/glow.js';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { headlessShow, solo, turnSteps, SCRIPT_MAX, KEY_MAX, ALL } from './helpers/show.js';
import * as boba from '../src/actors/boba.js';
import { overviewRig, gameInvariants } from './helpers/show.js';
// 唯一正解（賽博）從求解器取；外星分岔在單一正解下是壞結局「變異鼠稱王」：取列舉裡第一條老鼠 Lv4 分岔成外星的放法
const RESULTS = enumerate(spec);
const SOLUTIONS = stats(RESULTS, spec).full.map(r => r.order);
const CYBER = stats(RESULTS, spec).full.find(r => r.ending.id === 'cyber').order;   // 正解（老鼠在 Lv4 分岔成機器鼠）
const ALIEN = RESULTS.find(r => r.ending.id === 'alien' && r.state.lv.rat === 4).order;   // 外星壞局（列舉裡第一條以「變異鼠稱王」為標題的；修正批次 2：攤車被吹走排在外星前面）
const BRANCHES = [CYBER, ALIEN];   // 兩種分岔的劇本都量
const MAXED = Object.fromEntries(spec.ORDER.map(id => [id, spec.ITEMS[id].max]));   // 全 MAX（尾聲）
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
  [{ rat: 1 }, {}, 1], [{ rat: 2 }, {}, 2], [{ rat: 3 }, {}, 2], [{ rat: 3, token: 4 }, {}, 2],
  [{ rat: 4 }, { ratBranch: 'cyber' }, 5], [{ rat: 4 }, { ratBranch: 'alien' }, 1], [{ rat: 2 }, { domeRats: true }, 2],
];
test('view: every mode is one rat.pack roster of Quaternius rats (n 1 → 2 at the nest → 2 → 5 at Lv4 cyber), walking anim, h 0.2 except the mutant', () => {
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
  assert.deepEqual(nest['rat.pack'].home, { kind: 'wander', at: AT, r: 0.7 }); assert.equal(nest['rat.pack'].n, 2, 'a nest of two (user 2026-11-04)');
  assert.equal(nest['rat.main'].kind, 'compound'); assert.deepEqual(nest['rat.main'].footprint, { r: 0.2 }, 'nest footprint is a circle (clear of the road on the bridge)');
  assert.equal(rat.view(lv({ rat: 1 }), {})['rat.main'], undefined);
  const spring = rat.view(lv({ rat: 3 }), {})['rat.pack'].home;
  assert.equal(spring.kind, 'stand'); assert.equal(spring.spots.length, 2);
  for (const s of spring.spots) { assert.ok(near(s, SPRING, 0.8)); assert.ok(Math.abs(s.y - (SPRING.y + 0.1)) < 1e-9); }
  assert.deepEqual(rat.view(lv({ rat: 3, token: 4 }), {})['rat.pack'].home, { kind: 'ride', cars: 3, speed: 0.35 });
  assert.deepEqual(rat.view(lv({ rat: 3, token: 5 }), { flooded: true })['rat.pack'].home, { kind: 'ride', cars: 5, speed: 0 });
  assert.deepEqual(rat.view(lv({ rat: 2 }), { domeRats: true })['rat.pack'].home, { kind: 'wander', at: GATE, r: 0.9 });
});
// 唯一正解 §5.2 老鼠當指標：Lv1／Lv2 的家跟著舞台結算的 meta.trouble（troubleOf／troubleSpot，見 stage.js）
const { troubleOf, troubleSpot } = await import('../src/actors/stage.js');
const { frontOf } = await import('../src/actors/anchors.js');
const metaOf = (l, f, waits = []) => { const trouble = troubleOf(l, f, waits, spec); return { trouble, troubleAt: troubleSpot(trouble, l, f, ALL) }; };
const modOf = id => ALL.find(m => m.id === id);
test('view: Lv1 / Lv2 homes follow meta.trouble — flooded → in front of the station, chip waiting → in front of HQ, none → the nest', () => {
  const flood = lv({ token: 3, typhoon: 2, rat: 1, milk: 2 }), fm = metaOf(flood, { flooded: true }, [{ item: 'milk', for: ['baseball'] }]);
  const st = modOf('token').visitSpot(3, { lv: flood, flags: { flooded: true } });
  assert.equal(fm.trouble, 'token', 'the lock beats the waiting milk');
  assert.deepEqual(rat.view(flood, { flooded: true }, fm)['rat.pack'].home, { kind: 'wander', at: frontOf(st, st.r), r: rat.TROUBLE_R });
  assert.equal(rat.TROUBLE_R, 0.4);
  assert.ok(cellAt(fm.troubleAt.x, fm.troubleAt.z), 'the station front is on the main island');
  const wait = lv({ chip: 2, rat: 2, milk: 2 }), wm = metaOf(wait, {}, [{ item: 'rat', for: ['token'] }, { item: 'chip', for: ['bulb'] }]);
  const hq = modOf('chip').visitSpot(2, { lv: wait, flags: {} });
  assert.equal(wm.trouble, 'chip', 'the rat waiting for itself is not trouble');
  const nest = rat.view(wait, {}, wm);
  assert.deepEqual(nest['rat.pack'].home, { kind: 'wander', at: frontOf(hq, hq.r), r: 0.4 }); assert.equal(nest['rat.pack'].n, 2);
  assert.deepEqual(nest['rat.main'].at, AT, 'the nest itself stays put');
  assert.deepEqual(rat.view(wait, {}, metaOf(wait, {}))['rat.pack'].home, { kind: 'wander', at: AT, r: 0.7 }, 'no trouble → the nest');
  assert.deepEqual(rat.view(wait, {})['rat.pack'].home, { kind: 'wander', at: AT, r: 0.7 }, 'no meta → the nest');
  // Lv3 起照舊：搭車、泡溫泉、鼠災不看 trouble
  assert.deepEqual(rat.view(lv({ rat: 3, token: 4 }), {}, wm)['rat.pack'].home, { kind: 'ride', cars: 3, speed: 0.35 });
  assert.equal(rat.view(lv({ rat: 3 }), {}, wm)['rat.pack'].home.kind, 'stand');
  assert.deepEqual(rat.view(lv({ rat: 2 }), { domeRats: true }, wm)['rat.pack'].home, { kind: 'wander', at: GATE, r: 0.9 });
});
test('rat is a 4-level item (single path §4.4) and the transition clamp is gone', async () => {
  assert.equal(spec.ITEMS.rat.max, 4); assert.equal(spec.ITEMS.typhoon.max, 3);   // 修正批次 2：颱風三級
  await assert.rejects(import('../src/actors/clamp.js'), 'clamp.js deleted');
});
// 唯一正解 §4.4：Lv4 分岔就是最終型態——賽博＝原本 Lv5 的軍團＋王冠鼠，外星＝原本 Lv5 的加冕＋UFO
test('view: Lv4 cyber is five grey antenna rats wandering round 101 (the extra three come out of the park gate); Lv4 alien is a big green three-eyed crowned waver with a UFO', () => {
  const c = rat.view(lv({ rat: 4 }), { ratBranch: 'cyber' })['rat.pack'];
  assert.deepEqual({ ...c.home, entry: undefined }, { kind: 'wander', at: TOWER, r: 1.3, entry: undefined });
  // 計畫 11 最終修正 #4：每一隻各有自己的入口（園區門口一列，彼此 ≥ 兩隻的半徑相加），不再同一幀從同一點冒出來；
  // 補進來的 rat#2–4 依序從最西邊（最靠 101）的入口出來
  const park = offset(anchorWorld('chip'), -0.5, 1.2), ent = c.home.entry, rr = 2 * 0.13;
  assert.equal(ent.length, 5); assert.ok(ent.every(p => Math.hypot(p.x - park.x, p.z - park.z) <= 0.7), 'at the park gate');
  for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) assert.ok(Math.hypot(ent[a].x - ent[b].x, ent[a].z - ent[b].z) >= rr, `entries ${a}|${b} ≥ ${rr}`);
  assert.ok(ent[2].x < ent[3].x && ent[3].x < ent[4].x && ent[2].x === Math.min(...ent.map(p => p.x)), 'the newcomers come out west to east');
  assert.equal(c.model.tint.Grey, 0xc0c8d0); assert.ok(c.model.antenna); assert.equal(c.n, 5);
  const a = rat.view(lv({ rat: 4 }), { ratBranch: 'alien' }), m = a['rat.pack'];
  assert.equal(m.model.glow.Grey, 0x5fcf7a); assert.equal(m.model.tint.Grey, 0x5fcf7a); assert.ok(m.model.eye && m.model.wave && m.model.crown);
  assert.equal(m.home.kind, 'stand'); assert.ok(near(m.home.spots[0], SPRING, 1.2));
  const u = a['rat.ufo'];
  assert.equal(u.kind, 'ufo'); assert.equal(u.footprint, false); assert.ok(near(u.at, m.home.spots[0], 1e-6));
  for (const n of [1, 2, 3]) assert.equal(rat.view(lv({ rat: n }), { ratBranch: 'alien' })['rat.ufo'], undefined, `no UFO at Lv${n}`);
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
test('script: placed, grow 2–4 and fx exist; ◆ Lv4 (branch = final form) is the only key node', () => {
  assert.ok(rat.script?.placed && [2, 3, 4].every(n => rat.script.grow[n]) && !rat.script.grow[5] && rat.script.fx);
  assert.deepEqual(Object.entries(rat.script.grow).filter(([, f]) => f.key).map(([n]) => +n), [4]);
});

// ── 物品 v2 §4.6（唯一正解 §4.4：分岔＝Lv4 最終型態）：兩條分岔、人數預算、footprint ──
const { modelExtras } = await import('../src/show/roster.js');
const GOLDISH = c => ((c >> 16) & 255) > 200 && ((c >> 8) & 255) > 180 && (c & 255) < 160;
test('cyber Lv4: five robot rats round 101 and a crowned robot rat at the station (on the hovering deck at token ≥ 9, the dome station cornice before)', async () => {
  const { DECK_AT, PLATFORM } = await import('../src/actors/token.js');
  for (const token of [7, 8, 9, 10]) {
    const v = rat.view(lv({ rat: 4, chip: 8, token }), { ratBranch: 'cyber' }), k = v['rat.king'], st = anchorWorld('token');
    assert.equal(v['rat.pack'].n, 5);
    assert.equal(k.kind, 'king'); assert.equal(k.footprint, false); assert.equal(k.model.path, RAT); assert.ok(k.model.antenna && k.model.crown);
    assert.ok(modelExtras(k.model, k.model.h).some(x => x.parts.some(p => GOLDISH(p.color))), 'a gold crown');
    assert.deepEqual(k.at, rat.kingSpot(lv({ rat: 4, chip: 8, token })), 'at kingSpot(lv)');
    if (token >= 9) {
      assert.ok(Math.abs(k.at.y - (DECK_AT.y + PLATFORM.top)) < 1e-6, `sits on the hovering deck (token ${token}) y ${k.at.y}`);
      assert.ok(Math.abs(k.at.x - DECK_AT.x) <= PLATFORM.w / 2 - 0.1 && Math.abs(k.at.z - DECK_AT.z) <= PLATFORM.d / 2 && Math.abs(k.at.x - DECK_AT.x) >= PLATFORM.signW / 2 + 0.1, 'on the deck, beside the sign');
      assert.ok(k.at.z - DECK_AT.z < PLATFORM.railZ - 0.1, 'behind the front rail');
    } else {
      assert.ok(near(k.at, st, 0.6), `on the station (token ${token})`);
      assert.ok(Math.abs(k.at.y - (st.y + 0.605)) < 1e-6, `sits on the dome station cornice (token ${token}) y ${k.at.y}`);
    }
  }
  for (const [l, f] of [[{ rat: 4 }, { ratBranch: 'alien' }], [{ rat: 3, token: 8 }, {}], [{ rat: 4, token: 8 }, {}]]) assert.equal(rat.view(lv(l), f)['rat.king'], undefined);
});
// 最終章 §7 賽博：尾聲時同一批 5 隻機器鼠的家搬到黑塔的平屋頂，一排面向鏡頭（+z；2026-11-04 以前 10 隻兩排）；王冠鼠照舊坐站頂。
// 站位彼此 ≥ 0.25（名冊 separateStanding 不推開）、在屋頂面內、離後緣的天線桅杆與前緣停好的紅色飛天車 ≥ 0.2
test('epilogue cyber: the 5 robot rats stand in one row on the 101 roof (y = tower top), the king stays crowned; skeletons 5 + king (+ shiba)', async () => {
  const tower = await import('../src/actors/tower.js'), finale = await import('../src/actors/finale.js'), { orbitPose } = await import('../src/actors/parts.js');
  const L = lv({ rat: 4, chip: 9, token: 10, bulb: 9 }), plain = rat.view(L, { ratBranch: 'cyber' }), v = rat.view(L, { ratBranch: 'cyber', missile: 'shield', epilogue: 'cyber' });
  const b = tower.body('lit', { dark: true }), deck = b.parts.find(p => p.name === 'deck'), pack = v['rat.pack'];
  assert.equal(pack.n, 5); assert.deepEqual(pack.model, plain['rat.pack'].model, 'the same robot rats');
  assert.equal(pack.home.kind, 'stand'); assert.equal(pack.home.spots.length, 5); assert.deepEqual(pack.home.spots, rat.ROOF_SPOTS);
  assert.deepEqual(v['rat.king'], plain['rat.king'], 'the king stays on the station roof');
  const car = finale.view(L, { missile: 'shield', epilogue: 'cyber' })['finale.car'], { yaw } = orbitPose(car, Infinity), half = car.model.parts[0].scale[2] / 2;   // 同代幣的 Roadster（計畫 8 任務 5）
  const ux = Math.sin(yaw) * half, uz = Math.cos(yaw) * half;
  const segDist = (p, a, c) => { const dx = c.x - a.x, dz = c.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz))); return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t); };
  const rows = new Set();
  for (const [i, s] of pack.home.spots.entries()) {
    assert.ok(Math.abs(s.y - (TOWER.y + b.roof)) < 1e-9, `rat ${i} on the roof (y ${s.y})`);
    assert.ok(Math.abs(s.x - TOWER.x) <= deck.scale[0] / 2 - 0.1 && Math.abs(s.z - TOWER.z) <= deck.scale[2] / 2 - 0.1, `rat ${i} inside the roof`);
    assert.equal(s.yaw, 0, 'facing +z (the camera)');
    assert.ok(Math.hypot(s.x - TOWER.x - b.mast.x, s.z - TOWER.z - b.mast.z) >= 0.2, `rat ${i} clear of the mast`);
    assert.ok(segDist(s, { x: car.park.x - ux, z: car.park.z - uz }, { x: car.park.x + ux, z: car.park.z + uz }) >= 0.2, `rat ${i} clear of the parked car`);
    for (const o of pack.home.spots.slice(i + 1)) assert.ok(Math.hypot(o.x - s.x, o.z - s.z) >= 0.25, 'spots ≥ 0.25 apart');
    rows.add(s.z.toFixed(3));
  }
  assert.equal(rows.size, 1, 'one row of five');
  assert.ok(pack.home.spots.every(s => Math.abs(s.z - (TOWER.z + 0.1)) < 1e-9), 'the z +0.1 row');
  // 骨架動畫（R18 ≤ 12）：尾聲的畫面（老鼠、衛星島、終局、101 的 view 合起來）裡帶 anim 的模型——名冊的 model.anim、
  // 直接放的 anim（石堆老鼠）——每隻一副骨架；再加開場就在走的柴犬（app.js）一隻
  for (const epilogue of ['cyber', 'alien']) {
    const F = { ratBranch: epilogue, missile: 'shield', epilogue };
    const views = Object.assign({}, ...ALL.filter(m => ['rat', 'satellites', 'finale', 'tower'].includes(m.id)).map(m => m.view(MAXED, F, { total: 61 })));
    const animated = Object.values(views).reduce((n, sp) => n + (sp.model?.anim || sp.anim ? sp.n ?? 1 : 0), 0);
    assert.equal(animated, 6, `${epilogue}: the rats are counted (${animated}; cyber: 5 robots + the crown rat; alien: 5 mutants + the king)`);
    assert.ok(animated + 1 <= 12, `${epilogue}: skeletons ${animated} + shiba ≤ 12`);
  }
  assert.equal(sat.view(L, { ratBranch: 'cyber', epilogue: 'cyber' })['sat.rocks'], undefined, 'no rocks-islet rats');
  // 外星尾聲、沒有尾聲：照舊（繞 101）
  assert.deepEqual(rat.view(L, { ratBranch: 'cyber', epilogue: 'alien' })['rat.pack'], plain['rat.pack']);
});
// 計畫 8 任務 5 裁決 (a)：代幣 Lv10 的站頂停滿三台 Roadster、三條坡道——王冠鼠在懸浮月台上，離每一台車身、每一條坡道、天線 ≥ 0.2，
// 也不在屋頂上；代幣 8（偏離正解的放法）沒有月台、沒有坡道，坐大車站的簷角
test('the crown rat: token 8 → the dome station cornice; token 10 → the hovering deck, clear of every parked roadster, lane and the antenna', async () => {
  const token = await import('../src/actors/token.js'), { orbitPose } = await import('../src/actors/parts.js'), st = anchorWorld('token');
  assert.deepEqual(rat.kingSpot(lv({ token: 8 })), { ...offset(st, -0.42, 0.32, 0.605), yaw: 0.6 }, 'token 8: the old cornice spot');
  const v = token.view(lv({ token: 10 }), {}), k = rat.kingSpot(lv({ token: 10 }));
  assert.ok(Math.abs(k.y - (token.DECK_AT.y + token.PLATFORM.top)) < 1e-9, 'token 10: on the deck');
  // 水平投影：點到矩形（中心 c、朝 yaw、半長 hl、半寬 hw）的距離
  const toRect = (p, c, yaw, hl, hw) => { const dx = Math.sin(yaw), dz = Math.cos(yaw), rx = p.x - c.x, rz = p.z - c.z, a = rx * dx + rz * dz, s = rx * dz - rz * dx; return Math.hypot(Math.max(0, Math.abs(a) - hl), Math.max(0, Math.abs(s) - hw)); };
  for (const i of Object.keys(v).filter(x => x.startsWith('token.cars.')).map(x => +x.split('.')[2])) {   // trim §B：一台
    const car = v[`token.cars.${i}`], { yaw } = orbitPose(car, Infinity), d = toRect(k, car.park, yaw, token.CAR_L / 2, token.CAR_W / 2 + token.WHEEL_OUT);
    assert.ok(d >= 0.2, `${d.toFixed(2)} from roadster ${i}`);
  }
  for (const [i, lane] of token.LANES.entries()) {
    const run = lane.len * Math.cos(lane.angle), c = { x: lane.foot.x + Math.sin(lane.yaw) * run / 2, z: lane.foot.z + Math.cos(lane.yaw) * run / 2 }, d = toRect(k, c, lane.yaw, run / 2, lane.width / 2);
    assert.ok(d >= 0.2, `${d.toFixed(2)} from lane ${i}`);
  }
  assert.ok(Math.hypot(k.x - (st.x + token.ANTENNA.x), k.z - (st.z + token.ANTENNA.z)) >= 0.2, 'clear of the roof antenna');
  assert.ok(Math.abs(k.x - st.x) > token.ROOF.w / 2 || Math.abs(k.z - st.z) > token.ROOF.d / 2, 'not on the roof');
});
// 最終章 §7 外星尾聲：變異鼠王（戴王冠、揮手）的站位搬到 101 母艦的碟頂中心（tower.shipTop），頭上的小 UFO 不畫（三台大 UFO 取代它）。
// 單一正解下外星是壞結局、不演尾聲（finale.js），view 留著給圖鑑
test('epilogue alien: the mutant rat sits crowned on the 101 top (y ≥ tower top), rat.ufo not drawn', async () => {
  const tower = await import('../src/actors/tower.js');
  const L = lv({ rat: 4 }), plain = rat.view(L, { ratBranch: 'alien' }), v = rat.view(L, { ratBranch: 'alien', missile: 'shield', epilogue: 'alien' });
  const pack = v['rat.pack'];
  assert.equal(pack.n, 1); assert.deepEqual(pack.model, plain['rat.pack'].model, 'the same crowned waving mutant');
  assert.ok(pack.model.crown && pack.model.wave);
  assert.equal(pack.home.kind, 'stand'); assert.equal(pack.home.spots.length, 1);
  const spot = pack.home.spots[0];
  assert.deepEqual(spot, { x: TOWER.x, y: tower.shipTop(), z: TOWER.z, yaw: 0 });
  assert.deepEqual(rat.SHIP_SPOT, spot);
  assert.ok(spot.y >= TOWER.y + tower.body('lit', { ship: true }).deck - 1e-9, 'on the saucer top');
  assert.equal(v['rat.ufo'], undefined, 'no small UFO');
  assert.ok(plain['rat.ufo'], 'the small UFO stays before the epilogue');
  // 賽博尾聲旗標不影響外星鼠
  assert.deepEqual(rat.view(L, { ratBranch: 'alien', epilogue: 'cyber' }), plain);
});
// 計畫 17 任務 4（變異鼠稱王災難版）：外星收尾時另外有一群 5 隻變異鼠（名冊 rat.swarm；鼠王照舊是 rat.pack 唯一一隻；2026-11-04 以前 10 隻）——
// 綠色發光、三眼、沒有天線、沒有王冠、一般大小（h 0.2）；家是 stand 在母艦碟緣上（SAUCER_SPOTS：碟頂高度 shipTop、圍著碟頂中心的鼠王一圈、
// 面朝外，後側留給天線），入口是園區門口（PARK_ENTRIES，一隻一個）。沒有收尾、賽博收尾都沒有這一群。骨架：5 + 鼠王 + 柴犬 = 7
test('epilogue alien: rat.swarm is 5 mutants (C.alien tint + glow, the eye, no antenna, no crown, h 0.2) standing on SAUCER_SPOTS round the king on the saucer rim, entering from SWARM_ENTRIES (the five park-gate entries); none otherwise', async () => {
  const tower = await import('../src/actors/tower.js'), { C } = await import('../src/actors/palette.js');
  const L = lv({ rat: 4 });
  for (const missile of ['deflect', 'hit']) {
    const v = rat.view(L, { ratBranch: 'alien', missile, epilogue: 'alien' }), sw = v['rat.swarm'];
    assert.ok(sw, `${missile}: the swarm`);
    assert.equal(sw.kind, 'roster'); assert.equal(sw.n, 5);
    assert.equal(sw.model.path, RAT); assert.equal(sw.model.h, 0.2);
    assert.deepEqual(sw.model.tint, { Grey: C.alien }); assert.deepEqual(sw.model.glow, { Grey: C.alien });
    assert.equal(sw.model.eye, true); assert.ok(!sw.model.antenna && !sw.model.crown, 'no antenna, no crown');
    assert.equal(sw.home.kind, 'stand'); assert.deepEqual(sw.home.spots, rat.SAUCER_SPOTS); assert.deepEqual(sw.home.entry, rat.SWARM_ENTRIES);
    assert.deepEqual(rat.SWARM_ENTRIES, rat.PARK_ENTRIES, 'the park gate: one rat per entry'); assert.equal(rat.SWARM_ENTRIES.length, 5);
    rat.SWARM_ENTRIES.forEach((p, i) => rat.SWARM_ENTRIES.slice(i + 1).forEach(q => assert.ok(Math.hypot(p.x - q.x, p.z - q.z) >= 0.26, 'entries apart')));
    assert.equal(v['rat.pack'].n, 1, 'the king stays the only rat.pack');
  }
  const b = tower.body('lit', { ship: true }), rim = b.parts.find(p => p.name === 'rim'), kingR = 0.65 * 0.5;
  assert.equal(rat.SAUCER_SPOTS.length, 5);
  // 平均排在 ±135° 之間（後側 90° 留給天線）：每隻差 67.5°
  const ang = rat.SAUCER_SPOTS.map(s => Math.atan2(s.x - TOWER.x, s.z - TOWER.z) * 180 / Math.PI);
  ang.forEach((a, i) => assert.ok(Math.abs(a - (-135 + i * 67.5)) < 1e-6, `rat ${i} at ${a.toFixed(1)}°`));
  for (const [i, s] of rat.SAUCER_SPOTS.entries()) {
    const r = Math.hypot(s.x - TOWER.x, s.z - TOWER.z);
    assert.ok(Math.abs(s.y - tower.shipTop()) < 1e-9, `rat ${i} on the saucer top (y ${s.y})`);
    assert.ok(r <= rim.scale[0] / 2 - 0.13, `rat ${i} on the rim (${r.toFixed(2)})`);
    assert.ok(r >= kingR + 0.13 + 0.1, `rat ${i} clear of the king (${r.toFixed(2)})`);
    assert.ok(Math.hypot(s.x - TOWER.x - b.mast.x, s.z - TOWER.z - b.mast.z) >= 0.3, `rat ${i} clear of the antenna mast`);
    assert.ok(Math.abs(Math.atan2(Math.sin(s.yaw - Math.atan2(s.x - TOWER.x, s.z - TOWER.z)), Math.cos(s.yaw - Math.atan2(s.x - TOWER.x, s.z - TOWER.z)))) < 1e-9, `rat ${i} faces out`);
    for (const o of rat.SAUCER_SPOTS.slice(i + 1)) assert.ok(Math.hypot(o.x - s.x, o.z - s.z) >= 0.26, 'spots ≥ 0.26 apart');
  }
  for (const flags of [{ ratBranch: 'alien' }, { ratBranch: 'alien', missile: 'hit' }, { ratBranch: 'alien', epilogue: 'cyber' }, { ratBranch: 'cyber', epilogue: 'cyber' }]) assert.equal(rat.view(L, flags)['rat.swarm'], undefined, JSON.stringify(flags));
});
// 外星是壞結局「變異鼠稱王」（唯一正解 §4.5）：畫面就是老鼠 Lv4 外星型態＋石堆島綠光圈＋小 UFO
test('alien Lv4 (the bad ending 變異鼠稱王): the mutant wears a crown, a small UFO hovers over it, a green glow ring circles the rocks islet', () => {
  const v = rat.view(lv({ rat: 4 }), { ratBranch: 'alien' });
  assert.ok(v['rat.pack'].model.crown && v['rat.pack'].model.eye, 'crowned mutant');
  assert.equal(v['rat.ufo'].kind, 'ufo');
  const ring = sat.view(lv({ rat: 4 }), { ratBranch: 'alien' })['sat.rocksRing'], rocks = sat.island('rocks');
  assert.ok(ring && near(ring.at, rocks, 1e-9), 'ring on the rocks islet');
  assert.ok(ring.parts.every(p => p.glow === 0x5fcf7a), 'green glow');
  for (const [l, f] of [[{ rat: 3 }, { ratBranch: 'alien' }], [{ rat: 4 }, { ratBranch: 'cyber' }]]) assert.equal(sat.view(lv(l), f)['sat.rocksRing'], undefined);
  assert.ok(sat.view(lv({ rat: 4 }), { ratBranch: 'alien' })['sat.rocks'], 'the two rats on the stones stay (skeletons: 1 + 2 + shiba)');
});
// 人數預算（使用者 2026-11-04：「老鼠數量整體還是太多，前期兩隻就好，後期也減少」）：老鼠 1 → 2（一窩）→ 2（泡溫泉／搭車／鼠災）→ 5＋王冠鼠／1；
// 外星收尾鼠群 5（以前 1 → 3 → 5 → 10／10）。骨架動畫（名冊老鼠＋王冠鼠＋石堆兩隻）≤ 11（再加柴犬 ≤ 12）
test('rat counts per stage (user 2026-11-04): 1 / 2 / 2 / 5 (+ the crown rat), alien 1 + a swarm of 5 at the epilogue; animated rats ≤ 11 at every level', () => {
  assert.deepEqual([rat.NEST_N, rat.GROW_TO, rat.ARMY_N, rat.SWARM_N], [2, 2, 5, 5]);
  const cases = [[{ rat: 1 }, {}, 1], [{ rat: 2 }, {}, 2], [{ rat: 3, token: 4 }, {}, 2], [{ rat: 3 }, {}, 2], [{ rat: 3, baseball: 4 }, { domeRats: true }, 2],
    [{ rat: 4, chip: 8, token: 10 }, { ratBranch: 'cyber' }, 6], [{ rat: 4, chip: 8, token: 7 }, { ratBranch: 'cyber' }, 6], [{ rat: 4 }, { ratBranch: 'alien' }, 1]];
  for (const [l, f, want] of cases) {
    const v = rat.view(lv(l), f), s = sat.view(lv(l), f), what = JSON.stringify([l, f]);
    const n = v['rat.pack'].n + (v['rat.king'] ? 1 : 0);
    assert.equal(n, want, what);
    assert.ok(n + (s['sat.rocks']?.n ?? 0) <= 11, `${what} animated rats ${n + (s['sat.rocks']?.n ?? 0)}`);
  }
  assert.equal(rat.view(lv({ rat: 4 }), { ratBranch: 'alien', missile: 'hit', epilogue: 'alien' })['rat.swarm'].n, 5, 'the alien swarm');
});
test('every rat footprint corner stays inside the rat cell; the king, the UFO and the ring declare no footprint', () => {
  const CELL = cellOf('rat');
  for (const [l, f] of [[{ rat: 1 }, {}], [{ rat: 2 }, {}], [{ rat: 3 }, {}], [{ rat: 4, chip: 8 }, { ratBranch: 'cyber' }], [{ rat: 4, chip: 8, token: 9 }, { ratBranch: 'cyber' }], [{ rat: 4 }, { ratBranch: 'alien' }], [{ rat: 2 }, { domeRats: true }]]) {
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
// 照 order 把整局瞬間演到 pred 命中的那個事件，那個事件單獨 live 演；回傳 { e, secs, n }（n = 演之前的泡泡數）。
// 命中的是合併跳級的第二級（唯一正解第 9 回合老鼠 2 → 3 → 4）：跟它的第一級一起 live 演（turn.js 合成一段，跟正式演出一樣），
// via 拿掉（起因段不算進劇本秒數）——單獨演第二級的話第一級會先瞬間套用（窩 → 搭車），演的是正式演出到不了的「從車頂下來」
const noVia = ({ via, ...e }) => e;
const pairOf = (evs, j) => { const e = evs[j], x = evs[j + 1]; return e.kind === 'grow' && x?.kind === 'grow' && x.item === e.item && x.jump && x.from === e.to ? x : null; };
async function liveAt({ run, bubblesLog }, order, pred, { whole = false } = {}) {
  let s = engine.createState(spec);
  const steps = [...order.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  for (const step of steps) {
    const r = step(s); s = r.state;
    if (whole && r.events.some(pred)) { const n = bubblesLog.length; return { events: r.events, secs: await run([...r.events, { kind: 'settle' }]), n }; }
    for (const [j, e] of r.events.entries()) {
      if (!whole && pred(e)) { const n = bubblesLog.length; return { e, secs: await run([solo(e)]), n }; }
      const x = !whole && pairOf(r.events, j);
      if (x && pred(x)) { const n = bubblesLog.length; return { e: x, secs: await run([noVia(e), noVia(x)]), n }; }
      await run([e], { instant: true });
    }
    await run([{ kind: 'settle' }], { instant: true });
  }
  throw new Error('event not found');
}
// 秒數範圍（§8.6 的目標秒數上下放寬）：放置是第 1 回合，一隻老鼠演滿 8–13 s（§4.4）；Lv3 搭捷運 10–18；Lv4／Lv5 依分岔
// 下限因 §13.2 降低：閃白 0.15 s（原白光 0.5）、spawn 不佔時間；入口走進場（計畫 3.8 後面的工作）會再拉長
// 物品 v2 §6：一級 3–4.5 s；◆ Lv4 6–8 s（含鏡頭平移與回全景的整段，show.elapsed；唯一正解 §5.3）
const KEY_LV = [4];
function checkRat({ show, bubblesLog, eventHead }, e, secs, n) {
  const lvl = e.kind === 'grow' ? e.to : 1, branch = show.stage.flags.ratBranch, what = `${e.kind} ${lvl} ${branch ?? ''}`;
  assert.ok(secs >= 2.5 && secs <= (KEY_LV.includes(lvl) ? KEY_MAX : SCRIPT_MAX), `${what} took ${secs.toFixed(2)}s`);
  if (KEY_LV.includes(lvl)) assert.ok(show.elapsed >= 4.5 && show.elapsed <= KEY_MAX, `◆ ${what} whole event ${show.elapsed.toFixed(2)} s`);
  if (e.kind === 'grow') {
    const last = bubblesLog.slice(n).at(-1), h = eventHead('rat');   // 這一級變了的零件頭上（計畫 15 D：◆ Lv4 是站頂的王冠鼠）
    assert.equal(last?.text, 'LEVEL UP', what); assert.ok(Math.hypot(last.at.x - h.x, last.at.y - h.y, last.at.z - h.z) < 0.3, `${what} LEVEL UP over rat`);
  }
  for (const k of KEYS) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home', `${what} ${k}`);
  const rats = show.roster.members('rat.pack');
  assert.equal(rats.length, rat.view(show.stage.lv, show.stage.flags)['rat.pack'].n, `${what} rat count`);
  if (lvl === 3) {
    assert.equal(rat.view(show.stage.lv, show.stage.flags)['rat.pack'].home.kind, 'ride');
    for (const m of rats) assert.ok(Math.abs(m.pos.y - (TRACK.y + RIDE_Y)) < 1e-6 && Math.abs(Math.hypot(m.pos.x, m.pos.z) - TRACK.radius) < 0.2, `${what} rat ${m.i} on the roof`);
    for (let i = 0; i < rats.length; i++) for (let j = i + 1; j < rats.length; j++) assert.ok(Math.hypot(rats[i].pos.x - rats[j].pos.x, rats[i].pos.z - rats[j].pos.z) >= 0.2, `${what} rats ${i}/${j} apart`);
    assert.ok(bubblesLog.slice(n).some(b => b.kind === '！'), `${what} ！ and run for the train`);
  }
  if (lvl === 4 && branch === 'cyber') {
    assert.ok(rats.every(m => m.dress.antenna && m.dress.tint.Grey === 0xc0c8d0), `${what} robot rats`);
    assert.equal(rats.length, 5, `${what} the army of five`); assert.ok(show.stage.partObject('rat.king'), `${what} crown rat on the station`);
    assert.ok(!show.stage.partKeys().includes('sat.rocks'), `${what} the rocks-islet rats are gone`);
  }
  if (lvl === 4 && branch === 'alien') {
    assert.ok(rats[0].dress.h === 0.5 && rats[0].dress.eye && rats[0].dress.crown, `${what} crowned mutant`);
    const u = show.stage.partObject('rat.ufo'); assert.ok(u && Math.abs(u.userData.showOffset.dy) < 1e-9, `${what} UFO landed`);
    assert.ok(show.stage.partObject('sat.rocksRing'), `${what} ring`);
  }
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

test('scripts: every rat level in the solution and the alien order plays in range (2.5–3.5 s; ◆ Lv4 4.5–6 s both branches), ends with LEVEL UP on the rats, everyone home; rats never walk through buildings', async () => {
  for (const order of BRANCHES) {
    const h = await headlessShow(), { show, run, bubblesLog } = h, walls = watchWalls(h);
    let n = 0;
    const tracked = (evs, opts) => { if (!opts?.instant) n = bubblesLog.length; return run(evs, opts); };
    const seen = new Set();
    // 合併跳級（2 → 3 → 4）照正式演出一起演（liveAt 的註解）：Lv3 單獨的劇本在下面的搭捷運／泡溫泉測試
    let st = engine.createState(spec);
    for (const step of turnSteps(order)) {
      const r = step(st); st = r.state;
      for (let j = 0; j < r.events.length; j++) {
        const e = r.events[j], x = pairOf(r.events, j);
        if (e.item !== 'rat' || !['placed', 'grow'].includes(e.kind)) { await tracked([e], { instant: true }); continue; }
        const [what, secs] = x ? [x, await tracked([noVia(e), noVia(x)])] : [e, await tracked([solo(e)])];
        if (x) j++;
        seen.add(what.kind === 'grow' ? what.to : 1); checkRat(h, what, secs, n);
      }
      await tracked([{ kind: 'settle' }], { instant: true });
    }
    assert.deepEqual([...seen].sort(), [1, 2, 4], `rat events seen: ${[...seen]}`);
    assert.ok(walls.frames > 50, `walk frames ${walls.frames}`);   // 合併跳級一起演之後 Lv3 不單獨演（外星那局只有一隻走到溫泉）：100 → 50
    assert.deepEqual(walls.bad, [], order.join(' '));
    show.reset(); assert.equal(show.roster.members('rat.pack').length, 0);
  }
});
test('reset releases every rat model', async () => {
  const h = await headlessShow();
  await liveAt(h, CYBER, isRat(4));   // 賽博 Lv4：五隻機器鼠軍團
  assert.equal(h.show.roster.members('rat.pack').length, 5);
  const holders = h.show.roster.members('rat.pack').map(m => m.holder);
  h.show.reset();
  assert.ok(holders.every(g => h.assets.released.includes(g)), 'every rat holder released'); assert.equal(h.show.roster.group.children.length, 0);
});
test('Lv3 train: both rats run to the nest-side shore and hop on together while the train is held there', async () => {
  const h = await headlessShow(), { show } = h, update = show.update, boards = [];
  let prev = null;
  show.update = (dt, t) => {
    const before = h.rail.offset; update(dt, t);
    const held = Math.abs(h.rail.offset - before + dt) < 1e-9, roof = show.roster.members('rat.pack').map(m => Math.abs(m.pos.y - (TRACK.y + RIDE_Y)) < 1e-6);
    if (prev) roof.forEach((r, i) => { if (r && !prev[i]) boards.push({ i, held, a: Math.atan2(show.roster.members('rat.pack')[i].pos.z, show.roster.members('rat.pack')[i].pos.x) }); });
    prev = roof;
  };
  // 計畫 14：正解的老鼠 Lv3 是第 9 回合 2 → 4 合併跳級的第一級（正式演出只有 mark），而且第 8 回合晶片、珍奶在等颱風放晴，
  // 老鼠 Lv2 守在晶片總部門口（離窩最遠的那棟）——單獨演第 3 級要從那裡跑回窩邊，量的不是這一題要的「從窩邊上車」。
  // 改用老鼠自己 2 → 3 的一局（第 5 回合，上一回合沒人出問題、老鼠在窩邊）
  const { e, secs, n } = await liveAt(h, ['milk', 'baseball', 'token', 'rat', 'bulb'], isRat(3));
  checkRat(h, e, secs, n);
  assert.deepEqual(boards.map(b => b.i).sort(), [0, 1], 'both board');
  assert.equal(show.roster.members('rat.pack').length, 2, 'the nest of two, nobody extra (user 2026-11-04)');
  assert.ok(boards.every(b => b.held), 'each rat lands while the train is held');
  const nest = Math.atan2(AT.z, AT.x);
  assert.ok(boards.every(b => Math.abs(b.a - nest) < 0.35), 'they board by the nest');
});
// 計畫 9 任務 4（任務 3 延後的小項）：同一回合 2 → 3 → 4 合併跳級（整份列舉找的放法）的回歸——一窩 2 隻（2026-11-04 起，跟 Lv3 一樣多）：
// 外星：2 → 1 直接變，中間不多冒出老鼠；
// 賽博：窩裡不用再鑽出來，兩隻一起走；Lv4 就是最終型態（唯一正解 §4.4）：變身之後軍團再補三隻，從園區門口走出來（名冊入口，離園區門口 ≤ 1）。
// 唯一正解：第 9 回合老鼠就是 2 → 3 → 4 合併跳級（賽博）；外星用列舉裡第一條外星壞局（也是第 9 回合 2 → 4）
test('nest of 2, merged rat 2 → 4 in one turn: alien goes 2 → 1 with no extra rat; cyber needs no fill at the nest door, then 3 more from the park gate', async () => {
  const cases = [['alien', ALIEN], ['cyber', CYBER]];
  for (const [branch, order] of cases) {
    const h = await headlessShow(), { show, run } = h;
    let s = engine.createState(spec), played = false;
    for (const step of turnSteps(order)) {
      const before = s.lv.rat, r = step(s); s = r.state;
      const grows = r.events.filter(e => e.kind === 'grow' && e.item === 'rat').map(e => e.to);
      if (before !== 2 || !grows.includes(4)) { await run([...r.events, { kind: 'settle' }], { instant: true }); continue; }
      assert.deepEqual(grows, [3, 4], `${branch}: 2 → 3 → 4 in one turn`); assert.equal(s.flags.ratBranch, branch);
      const pre = new Set(show.roster.members(KEYS[0])), first = new Map(), update = show.update;
      assert.equal(pre.size, 2, 'a nest of two');
      let most = 0;
      show.update = (dt, t) => { update(dt, t); const ms = show.roster.members(KEYS[0]); most = Math.max(most, ms.length); for (const m of ms) if (!first.has(m) && !m.hidden) first.set(m, { ...m.pos }); };
      await run([...r.events, { kind: 'settle' }]);
      show.update = update; played = true;
      const fresh = [...first].filter(([m]) => !pre.has(m)).map(([, p]) => p);
      if (branch === 'alien') {
        assert.equal(most, 2, 'never more than the nest of two on stage');
        assert.equal(show.roster.members(KEYS[0]).length, 1, 'alien: one rat');
      } else {
        assert.equal(show.roster.members(KEYS[0]).length, 5, 'cyber: the army of five');
        assert.equal(fresh.length, 3, 'three more join the army');
        const byNest = fresh.filter(p => Math.hypot(p.x - AT.x, p.z - AT.z) <= 1), byPark = fresh.filter(p => Math.hypot(p.x - PARK.x, p.z - PARK.z) <= 1);
        assert.equal(byNest.length, 0, `none first seen by the nest (${fresh.map(p => `${p.x.toFixed(1)},${p.z.toFixed(1)}`)})`);
        assert.equal(byPark.length, 3, `three first seen at the park gate (${fresh.map(p => `${p.x.toFixed(1)},${p.z.toFixed(1)}`)})`);
      }
      break;
    }
    assert.ok(played, `${branch}: the merged turn was found`);
  }
});
test('Lv3 spring (no train yet, token < 4): both rats walk up to the hot spring and ♥', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  await run([{ kind: 'placed', item: 'rat', to: 1 }, { kind: 'grow', item: 'rat', from: 1, to: 2 }, { kind: 'settle' }], { instant: true });
  const n = bubblesLog.length, e = { kind: 'grow', item: 'rat', from: 2, to: 3 }, secs = await run([e]);
  assert.ok(secs >= 2.5 && secs <= SCRIPT_MAX, `${secs.toFixed(1)} s`);
  assert.ok(bubblesLog.slice(n).filter(b => b.kind === '♥').length >= 2); assert.equal(bubblesLog.at(-1).text, 'LEVEL UP');
  for (let i = 0; i < 300; i++) show.update(1 / 30, 100 + i / 30);
  assert.equal(show.roster.members('rat.pack').length, 2, 'the nest of two (user 2026-11-04)');
  for (const m of show.roster.members('rat.pack')) { assert.equal(m.mode, 'home'); assert.ok(near(m.pos, SPRING, 0.8), 'in the pool'); }
});
// 放下老鼠的回合整段 live：咬鮮奶（唯一正解 §5.2：撞翻珍奶攤車拿掉了，放置反應只剩咬）。
// 放法：命中那局的前六手（鮮奶、晶片、燈泡、代幣、颱風、老鼠）——放老鼠時鮮奶 2（沒有棒球），被咬掉一級（箱子翻倒、LEVEL DOWN）
test('the placement turn plays live: a rat goes to the crate and bites (no cart knock any more)', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h, walls = watchWalls(h);
  const { events, secs, n } = await liveAt(h, ['milk', 'chip', 'bulb', 'token', 'typhoon', 'rat'], e => e.kind === 'placed' && e.item === 'rat', { whole: true });
  assert.ok(events.some(e => e.delta?.target === 'milk' && e.cause === 'rat'), 'the bite');
  // 撞攤車拿掉了：沒有 delta、沒有旗標的老鼠 fx（以前的撞攤車事件）劇本回 null，有珍奶也一樣（這局沒有珍奶，直接問劇本）
  const knock = rat.script.fx({ kind: 'fx', item: 'rat', cause: 'rat' }, { lv: lv({ rat: 1, boba: 3 }), flags: {} }, { B, roster: { members: () => [], nearest: () => null } });
  assert.equal(knock, null, 'no cart knock');
  assert.ok(secs >= 8 && secs <= 40, `${secs.toFixed(1)} s`);
  assert.ok(milk.view(show.stage.lv, show.stage.flags, show.stage.meta)['milk.crate'].parts.some(p => p.spill), 'the bite tips the crate over (spilled milk)');
  assert.ok(bubblesLog.slice(n).some(b => b.down), 'LEVEL DOWN');
  assert.ok(bubblesLog.slice(n).filter(b => b.kind === '！').length >= 1);
  for (const k of KEYS) for (const m of show.roster.members(k)) assert.equal(m.mode, 'home');
  assert.deepEqual(walls.bad, []); assert.ok(walls.frames > 20);
});
// 老鼠當指標（§5.2）：上一回合結算出有出問題的那棟，放下老鼠時爬上岸直接跑過去聞一聞（不先在巨蛋旁 …… ！）、在那棟門口晃。
// 放法：鮮奶、棒球、晶片、代幣——第 4 回合晶片 2 在等燈泡（鮮奶 5，咬不到）：放老鼠那回合 trouble 是晶片（廠房門口）。
// 修正批次 2：原本的放法鮮奶 2（等棒球）放老鼠會接著咬鮮奶——那種回合老鼠直接跑去牛奶箱（下一題）
test('placed with trouble: the first rat runs from the landing to the front of the trouble building and sniffs there', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h, walls = watchWalls(h);
  let st = engine.createState(spec);
  for (const id of ['milk', 'baseball', 'chip', 'token']) { const r = engine.place(st, id, spec); st = r.state; await run([...r.events, { kind: 'settle' }], { instant: true }); }
  assert.equal(show.stage.meta.trouble, 'chip'); assert.ok(show.stage.lv.milk >= 3, 'nothing to bite'); const at = show.stage.meta.troubleAt;
  const shop = modOf('chip').visitSpot(show.stage.lv.chip, { lv: show.stage.lv, flags: show.stage.flags });
  assert.deepEqual(at, frontOf(shop, shop.r), 'the chip works front');
  const sniffs = [], placed = rat.script.placed;
  rat.script.placed = (...a) => placed(...a).map(b => (b.kind !== 'gesture' ? b : { ...b, start(c) { sniffs.push({ ...c.roster.members('rat.pack')[0].pos }); return b.start(c); } }));
  try {
    const r = engine.place(st, 'rat', spec), n = bubblesLog.length;
    await run([r.events.find(e => e.kind === 'placed')]);
    assert.equal(sniffs.length, 1, 'one sniff, no look-at-the-dome');
    const goal = show.nav.nearestWalkable(at);
    assert.ok(near(sniffs[0], goal, 0.3), `sniffs at the chip works front (${sniffs[0].x.toFixed(2)}, ${sniffs[0].z.toFixed(2)}) vs (${goal.x.toFixed(2)}, ${goal.z.toFixed(2)})`);
    assert.ok(!bubblesLog.slice(n).some(b => b.kind === '……'), 'no catching-breath bubble on the trouble run');
    const [m] = show.roster.members('rat.pack'); assert.equal(m.mode, 'home');
    assert.deepEqual(show.roster.members('rat.pack').length, 1);
  } finally { rat.script.placed = placed; }
  assert.deepEqual(walls.bad, []);
});
// 修正批次 2：有 trouble、這回合又要咬鮮奶（鮮奶 ≤2）——上岸直接跑去牛奶箱旁（不先跑去出問題的那棟，再走一趟去咬），咬的那段 ≤ 4.5 s。
// 放法：鮮奶、晶片、燈泡、代幣、颱風（第 5 回合捷運淹水，trouble 是車站）→ 放老鼠：鮮奶 2 被咬
test('placed with trouble on a biting turn: the rat runs straight to the milk crate, and the bite plays ≤ 3.5 s plus its pan / gap', async () => {
  const h = await headlessShow(), { show, run } = h, walls = watchWalls(h);
  let st = engine.createState(spec);
  for (const id of ['milk', 'chip', 'bulb', 'token', 'typhoon']) { const r = engine.place(st, id, spec); st = r.state; await run([...r.events, { kind: 'settle' }], { instant: true }); }
  assert.equal(show.stage.meta.trouble, 'token', 'the flooded station'); assert.ok(show.stage.lv.milk <= 2, 'milk to bite');
  const r = engine.place(st, 'rat', spec), bite = r.events.find(e => e.kind === 'fx' && e.cause === 'rat' && e.delta?.target === 'milk');
  assert.ok(bite, 'the rat bites the milk this turn');
  const marks = [];
  await run([r.events.find(e => e.kind === 'placed'), bite], { onMark: e => marks.push([e, show.elapsed]) });
  const [m] = show.roster.members('rat.pack'), crate = show.nav.nearestWalkable(offset(milk.CRATE, 0.45, 0.2));
  const k = marks.findIndex(([e]) => e === bite), secs = show.elapsed - marks[k][1];
  assert.ok(secs <= SCRIPT_MAX + 0.8 + 0.4, `the bite ${secs.toFixed(2)} s (≤ SCRIPT_MAX plus its pan / gap)`);
  assert.ok(near(m.pos, crate, 0.6), `the rat ends by the crate (${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)})`);
  assert.deepEqual(walls.bad, []);
});
// 沒有 trouble（ctx 沒舞台、或 meta.troubleAt null）：照舊——爬上岸、……、聞一聞、看巨蛋 ！、回窩旁
test('placed without trouble keeps the old landing beats (…… sniff look ！ home)', () => {
  const beats = rat.script.placed({ kind: 'placed', item: 'rat', to: 1 }, { lv: lv({ rat: 1 }), flags: {} }, { B, stage: { meta: { trouble: null, troubleAt: null } } });
  assert.deepEqual(beats.map(b => b.kind), ['apply', 'spawn', 'walk', 'bubble', 'gesture', 'gesture', 'bubble', 'home']);
});
// 鮮奶真的被咬掉級（引擎現在不會出：老鼠生窩要鮮奶 ≤1；堆出狀態直接演事件）：箱子翻倒、小學生跑回校舍、LEVEL DOWN
test('a bite that costs milk a level: crate tips, kids ！ run to the school gate and vanish quietly, LEVEL DOWN', async () => {
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  let st = engine.createState(spec);
  // 物品 v2：小學生 Lv3 才有（§4.2），所以堆到鮮奶 ≥3 再咬掉一級（選擇帶動升級：鮮奶 up[3] 要有棒球）。
  // 計畫 14：鮮奶在老鼠之後放會被咬住長不上去（R30），改成老鼠第 3 個放（鮮奶 3 → 4 照長，沒咬）
  for (const id of ['milk', 'baseball', 'rat']) { const r = engine.place(st, id, spec); st = r.state; await run([...r.events, { kind: 'settle' }], { instant: true }); }
  assert.equal(show.stage.lv.milk, 4); assert.equal(show.roster.members('milk.kids').length, 2);   // 裁決 R23：兩個小學生
  const hidden = [], hide = show.roster.hide; show.roster.hide = m => { hidden.push(m.key); return hide(m); };
  const n = bubblesLog.length, crate = show.stage.partObject('milk.crate');
  const secs = await run([{ kind: 'fx', item: 'milk', cause: 'rat', delta: { target: 'milk', from: 4, to: 3 }, story: '老鼠咬破鮮奶箱' }]);
  assert.ok(secs >= 4 && secs <= 14, `${secs.toFixed(1)} s`);
  assert.notEqual(show.stage.partObject('milk.crate'), crate, 'crate rebuilt tipped');
  assert.ok(bubblesLog.slice(n).filter(b => b.kind === '！').length >= 3, 'rat ！ and both kids ！');
  assert.deepEqual(hidden, ['milk.kids', 'milk.kids'], 'kids hide at the gate');
  assert.equal(show.roster.members('milk.kids').length, 0);
  const last = bubblesLog.at(-1), m = h.eventHead('milk');   // 被咬掉級變了的零件（箱子、校舍）頭上（計畫 15 D）
  assert.equal(last.text, 'LEVEL DOWN'); assert.ok(Math.hypot(last.at.x - m.x, last.at.z - m.z) < 0.3);
  for (const r of show.roster.members('rat.pack')) assert.equal(r.mode, 'home');
});
// 鼠災（颱風登陸的反應）：登陸之後同一回合只演 apply（使用者規則，turn.js）——老鼠的家搬到巨蛋門口、兩個工作人員出來，
// 之後日常自己走過去：老鼠在門口晃、工作人員跟著牠們
test('typhoon dome rats: after the landing turn the real rats settle by the dome gate and the staff stay with them', async () => {
  const h = await headlessShow(), { show } = h, walls = watchWalls(h);
  // 修正批次 2 重找（鼠災在颱風放下那回合：老鼠 ≥3、棒球 ≥4）：同 typhoon.test 的鼠災那局
  const { events } = await liveAt(h, ['milk', 'token', 'baseball', 'rat', 'chip', 'typhoon'], e => e.flag?.name === 'domeRats', { whole: true });
  assert.ok(events.some(e => e.flag?.name === 'domeRats'));
  const rats = show.roster.members('rat.pack'), staff = show.roster.members('baseball.staff');
  assert.equal(rats.length, 2); assert.equal(staff.length, 2);
  // 這局老鼠在車頂上（搭捷運）碰上鼠災，回合結束時有的還在半路、在閒晃的停頓裡：多等幾秒（240 → 480 幀）
  for (let i = 0; i < 480; i++) show.update(1 / 30, 200 + i / 30);
  for (const m of rats) { assert.equal(m.mode, 'home'); assert.ok(near(m.pos, GATE, 1.5), `rat ${m.i} by the gate`); }
  for (const m of staff) assert.ok(rats.some(r => near(r.pos, m.pos, 1.2)), 'staff stay with the rats');
  assert.deepEqual(walls.bad, []);
});
// 審查 Important 1：軍團回合（Lv4 最終型態）石堆小島的兩隻老鼠跟著同一次套用收掉（骨架動畫 ≤ 12），LEVEL UP 之後不再閃白
test('cyber Lv4: the rocks-islet rats go with the army apply, before LEVEL UP; no blink after LEVEL UP', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h, { part, walker } = show.blink, levelUp = show.bubbles.levelUp, blinks = [];
  let rocksAtLevelUp = null;
  show.blink.part = (...a) => { blinks.push(bubblesLog.length); return part(...a); };
  show.blink.walker = (...a) => { blinks.push(bubblesLog.length); return walker(...a); };
  show.bubbles.levelUp = (head, o) => { rocksAtLevelUp = show.stage.partKeys().includes('sat.rocks') || show.stage.pendingKeys().includes('sat.rocks'); return levelUp(head, o); };
  const { e, secs, n } = await liveAt(h, CYBER, isRat(4));
  assert.equal(show.stage.flags.ratBranch, 'cyber'); checkRat(h, e, secs, n);
  assert.equal(rocksAtLevelUp, false, 'sat.rocks gone before LEVEL UP');
  const lu = bubblesLog.findIndex((b, i) => i >= n && b.text === 'LEVEL UP');
  assert.ok(blinks.length > 0 && blinks.every(k => k <= lu), `no blink after LEVEL UP (${blinks} vs ${lu})`);
});
// 審查 Important 2：老鼠排成一列跟著偵防師走（唯一正解：走到 101 腳下）：每隻晚 FOLLOW 秒出發；變身後從園區門口補進來的三隻不算
test('cyber Lv4: the rats set off behind the detective one after another, ≥ 0.12 s apart (FOLLOW 0.15, R17)', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h, update = show.update, setPose = show.roster.setPose, starts = new Map();
  let now = 0, icon = false;
  show.update = (dt, t) => { now += dt; icon ||= bubblesLog.some(b => b.kind?.icon === 'chip'); update(dt, t); };
  show.roster.setPose = (m, p) => { if (icon && m.key === 'rat.pack' && m.i < 2 && p.walking && !starts.has(m)) starts.set(m, now); return setPose(m, p); };
  const { e, secs, n } = await liveAt(h, CYBER, isRat(4));
  checkRat(h, e, secs, n);
  const t = [...starts.values()].sort((a, b) => a - b);
  assert.equal(t.length, 2);
  for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] >= 0.12, `starts ${t.map(x => x.toFixed(2))}`);
});

// ── 計畫 3.8 Task 7：入口點、鏡頭焦點 ──
import { entryProblems, focusCell, focusTrail } from './helpers/actors.js';
import { entriesThroughSolutions } from './helpers/show.js';
import { createNav } from '../src/show/nav.js';
import { cellOf } from '../src/actors/anchors.js';
import { B } from '../src/show/beats.js';
const PARK = offset(anchorWorld('chip'), -0.5, 1.2);
// 老鼠的入口：每一種模式、每一級走得到、離站位 ≥ 1.5（正解與外星壞局每一刻的真 footprint）；第一隻從巨蛋格東南岸外的海裡（LANDING）爬上來
// （劇本的 spawn，不是名冊入口：上岸點離窩只有 0.4，但牠是從海裡爬上來、再沿岸繞一圈才回窩，不是在窩邊冒出來）；
// 賽博 Lv4 補的三隻機器鼠從園區門口走去 101
test('rat entries: walkable and ≥ 1.5 from every spot in every mode; the first rat spawns at the landing in the sea off the dome cell; the cyber legion comes out of the park gate', async () => {
  const nav = createNav(), bad = [];
  const modes = [[{ rat: 1 }, {}], [{ rat: 2 }, {}], [{ rat: 3 }, {}], [{ rat: 3, token: 4 }, {}], [{ rat: 4, chip: 3 }, { ratBranch: 'cyber' }], [{ rat: 4, chip: 8, token: 10 }, { ratBranch: 'cyber' }],
    [{ rat: 4 }, { ratBranch: 'alien' }], [{ rat: 4, baseball: 3 }, { domeRats: true }]];
  for (const [l, f] of modes) bad.push(...entryProblems(rat.view(lv(l), f), nav, `${JSON.stringify(l)} ${JSON.stringify(f)}`));
  bad.push(...await entriesThroughSolutions(rat, BRANCHES));
  assert.deepEqual(bad, []);
  const landing = offset(anchorWorld('baseball'), 2.0, 2.05);
  assert.equal(cellAt(landing.x, landing.z), null, 'the first rat climbs out of the sea');
  const beats = rat.script.placed({ kind: 'placed', item: 'rat', to: 1 }, { lv: lv({ rat: 1 }), flags: {} }, fakeCtx()), at = [];
  beats.find(b => b.kind === 'spawn').start({ roster: { spawnHeld: (k, p) => { at.push(p); return null; } } });
  assert.ok(near(at[0], landing, 1e-9), 'placed spawns it at the landing');
  const legion = rat.view(lv({ rat: 4, chip: 3 }), { ratBranch: 'cyber' })['rat.pack'];
  assert.ok(legion.home.entry.length === 5 && legion.home.entry.every(p => near(p, PARK, 0.7)), 'legion entries at the park gate');
});
const fakeCtx = () => ({ B, roster: { members: () => [] } });
const flat = bs => bs.flatMap(b => (b.kind === 'together' ? flat(b.beats) : [b]));
const focusCells = beats => flat(beats).filter(b => b.kind === 'focus').map(b => focusCell(b, fakeCtx()));
const grow = (to, l, flags = {}, prev = { lv: lv({ ...l, rat: to - 1 }), flags: {} }) => rat.script.grow[to]({ kind: 'grow', item: 'rat', from: to - 1, to }, { lv: lv({ ...l, rat: to }), flags, prev }, fakeCtx());
// 鏡頭（§13.1）：搭捷運對著老鼠窩格（一窩在窩那側島緣上車）；賽博 Lv4 對著 101（排隊、變身、軍團）；泡溫泉、外星（溫泉邊）
// 對著溫泉格；◆ Lv4 最後回全景定格。每段劇本第一拍就是自己的 focus（回合不再先補一拍老鼠格）
test('focus: train Lv3 at the nest; cyber Lv4 101 then the overview; spring / alien at the hot spring (alien Lv4 then the overview)', () => {
  const SPRING_CELL = [1, -1];
  const cases = [
    ['train 3', grow(3, { token: 4 }), [cellOf('rat')]],
    ['spring 3', grow(3, {}), [SPRING_CELL]],
    ['cyber 4', grow(4, { chip: 8, token: 4 }, {}, { lv: lv({ rat: 3, chip: 8, token: 4 }), flags: {} }), [cellOf('tower'), null]],   // 物品 v2：晶片 ≥8 才分岔成機器鼠；null：回全景定格
    ['cyber 4 from the nest', grow(4, { chip: 8, token: 10 }, {}, { lv: lv({ rat: 2, chip: 8, token: 10 }), flags: {} }), [cellOf('tower'), null]],
    ['alien 4', grow(4, { token: 4 }, {}, { lv: lv({ rat: 3, token: 4 }), flags: {} }), [SPRING_CELL, null]],
  ];
  for (const [what, beats, want] of cases) {
    // 第一拍自己就是 focus，或 together 裡有 focus（turn.js 的 opensOnFocus：◆ Lv4 鏡頭平移跟走路／列車進站同時）
    assert.ok(beats[0].kind === 'focus' || (beats[0].kind === 'together' && beats[0].beats.some(b => b.kind === 'focus')), `${what} starts with its own focus`);
    assert.deepEqual(focusCells(beats), want, `${what} focus cells`);
  }
});
// 偵防師（晶片 ≥3 時老鼠 Lv2 才成立）是晶片格的工程師原地換的：鏡頭在老鼠窩格看不到他——先回全景再冒 ！，LEVEL UP 也在全景
test('Lv2 with the detective: the camera goes to the overview before his ！ (he turns up on the chip cell)', () => {
  const beats = grow(2, { chip: 3 }), i = beats.findIndex(b => b.kind === 'bubble' && b !== beats[0]);
  assert.ok(i > 0, `the detective ！ (${beats.map(b => b.kind)})`);
  assert.equal(beats[i - 1].kind, 'focus'); assert.equal(beats[i - 1].target, 'home');
  assert.ok(!grow(2, { chip: 2 }).some(b => b.kind === 'focus'), 'no detective, no camera move');
});
test('Lv3 train live: the camera goes to the nest, then home', async () => {
  const h = await headlessShow(); let r0 = 0;
  const run = h.run; h.run = (evs, o) => { if (!o?.instant) r0 = h.rig.log.length; return run(evs, o); };
  await liveAt(h, SOLUTIONS[0], isRat(3));
  assert.deepEqual(focusTrail(h.rig.log, r0).map(String), [String(cellOf('rat')), 'home']);
});
// 外星壞局（變異鼠稱王）：老鼠 2 → 4 合併跳級在最後一輪（照一般回合演）；整回合 live 演，◆ 關鍵級演完——UFO 從天上降下、變異鼠戴王冠、石堆島綠光圈。
// 修正批次 2：ALIEN 的老鼠 Lv4 落在第 8 回合，這題自己找列舉裡第一條老鼠最後放、以「變異鼠稱王」為標題的放法（老鼠 Lv4 一定在最後一輪）
const ALIEN_LAST = RESULTS.find(r => r.ending.id === 'alien' && r.state.lv.rat === 4 && r.order.at(-1) === 'rat').order;
test('alien bad ending: the merged rat 2 → 4 in the last round still plays the UFO coming down, the crown and the ring', async () => {
  const h = await headlessShow(), { show, run } = h;
  let s = engine.createState(spec), evs = null;
  const steps = [...ALIEN_LAST.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  for (const [i, step] of steps.entries()) {
    const r = step(s); s = r.state;
    if (r.events.some(isRat(4))) { evs = [...r.events, { kind: 'settle' }]; assert.ok(i >= ALIEN_LAST.length, 'the last round'); assert.ok(r.events.find(isRat(4)).jump, 'merged 2 → 4'); break; }
    await run([...r.events, { kind: 'settle' }], { instant: true });
  }
  assert.ok(evs && s.flags.ratBranch === 'alien');
  const update = show.update; let high = 0;
  show.update = (dt, t) => { update(dt, t); const u = show.stage.partObject('rat.ufo'); if (u) high = Math.max(high, u.userData.showOffset?.dy ?? 0); };
  try { await run(evs); } finally { show.update = update; }
  assert.ok(high > 2, `the UFO came down from the sky (max dy ${high.toFixed(2)})`);
  assert.ok(show.roster.members('rat.pack')[0].dress.crown, 'crowned'); assert.ok(show.stage.partObject('sat.rocksRing'), 'ring on the rocks');
});
// 計畫 13 §設計 3：溫泉客泡在池裡（池心半徑 0.3），變異鼠來了也不換位置——整段劇本＋之後 5 秒溫泉客都在自己的站位上（池裡、y 壓低）不動，
// 兩邊身體不相碰（≥ 半徑和 × 0.64；以前泡湯客站池邊、要搬到北側讓位，2026-10-31 直直穿過牠 0.10 m）
test('alien bad ending: the bathers stay still in the pool while the mutant arrives — never closer than 0.64 × (ra + rb)', async () => {
  const h = await headlessShow(), { show, run } = h;
  let s = engine.createState(spec), evs = null;
  const steps = [...ALIEN.map(id => st => engine.place(st, id, spec)), ...Array.from({ length: spec.CLOSING_TURNS }, () => st => engine.advance(st, spec))];
  for (const step of steps) {
    const r = step(s); s = r.state;
    if (r.events.some(isRat(4))) { evs = [...r.events, { kind: 'settle' }]; break; }
    await run([...r.events, { kind: 'settle' }], { instant: true });
  }
  const update = show.update, spots = () => landmarks.view(show.stage.lv, show.stage.flags)['landmarks.bathers'].home.spots;
  let near = Infinity, frames = 0, drift = 0, on = false;   // on：老鼠 4 開演之後（同一回合先放下的颱風，溫泉客照常跑去小澡堂躲雨、回來再走進池裡）
  show.update = (dt, t) => {
    update(dt, t);
    if (on) show.roster.members('landmarks.bathers').forEach((o, i) => { const s = spots()[i]; if (!o.hidden) drift = Math.max(drift, Math.hypot(o.pos.x - s.x, o.pos.z - s.z), Math.abs(o.pos.y - s.y)); });
    const [m] = show.roster.members('rat.pack'); if (!m || m.radius < 0.3 || m.hidden) return;
    for (const o of show.roster.members('landmarks.bathers')) { if (o.hidden) continue; frames++; near = Math.min(near, Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z) / (m.radius + o.radius)); }
  };
  try { await run(evs, { onMark: e => { on ||= isRat(4)(e); } }); for (let f = 0; f < 150; f++) show.update(1 / 30, 2000 + f / 30); } finally { show.update = update; }
  assert.ok(on, 'rat 4 played');
  assert.ok(frames > 100, `${frames} mutant–bather frames`);
  assert.ok(near >= 0.64, `closest bather at ${near.toFixed(2)} × (ra + rb)`);
  assert.ok(drift < 0.05, `the bathers stay on their spots in the pool (drift ${drift.toFixed(3)})`);
});
// 審稿（裁決 R15）：Lv3 在整局 live 演出裡（不是單獨演）劇本也 ≤ 4.5 s——唯一正解與外星壞局都是第 9 回合 2 → 4 合併跳級的第一級（只有 mark）
test('live play, the solution and the alien order: rat Lv3 script ≤ 3.5 s in the real turn', async () => {
  const { playLive, SCRIPT_MAX } = await import('./helpers/show.js');
  for (const order of BRANCHES) {
    const ev = (await playLive(order)).find(x => x.e.kind === 'grow' && x.e.item === 'rat' && x.e.to === 3);
    assert.ok(ev && ev.script <= SCRIPT_MAX, `${order.join('>')} turn ${ev?.turn}${ev?.closing ? ' (last round)' : ''}: ${ev?.script.toFixed(2)} s`);
  }
});

// 拜訪點（計畫 6 設計 §4、§5）：正解與外星壞局每一個 rat 的 placed／grow，演之前與演完之後問 visitSpot——在格子裡、站位走得到；問到的級寫死
test('visitSpot(n, s) for every level 1..max: on the main island cell of the item (or null for off-island levels), frontOf(spot, r, nav) walkable within 0.6', async () => {
  const { visitSpotsThroughSolutions } = await import('./helpers/show.js');
  assert.equal(typeof rat.visitSpot, 'function');
  const { bad, seen } = await visitSpotsThroughSolutions(rat, BRANCHES, { cells: (n, s) => (['spring', 'alien'].includes(rat.ratMode(s.lv, s.flags)) ? [[1, -1]] : rat.ratMode(s.lv, s.flags) === 'cyber' ? [[1, 0]] : [[-1, 1]]) });
  assert.deepEqual(bad, []);
  assert.deepEqual(seen, [1, 2, 3, 4]);
});

// 使用者 2026-11-01 截圖：老鼠「卡在」橋上——trouble 是路燈（燈泡 Lv1–3）時門口點在橋頭，老鼠繞著它晃就走上窄橋、互相讓不開。
// troubleSpot 把中心拉回格內（stage.js TROUBLE_IN）之後：鼠窩那回合演完再放 30 s 日常，走到路燈之後（10 s 起）老鼠一幀都不在橋上（cellAt null），也沒有誰停超過 6 s
// （拉回之前：30 s 裡在橋上 4.5／1.9／3.5 s）
test('live: rats loitering at the lamp door (trouble = bulb) never step onto a bridge and never freeze', async () => {
  const { headlessShow } = await import('./helpers/show.js'), spec = await import('../src/rules/spec.js'), engine = await import('../src/rules/engine.js');
  const { cellAt } = await import('../src/scene/hex.js');
  const { show, run } = await headlessShow({ seed: 21 });
  let s = engine.createState(spec);
  // R38（使用者 2026-11-05）：老鼠在鮮奶 2 時放下會咬住鮮奶、鮮奶成了出問題的那棟——改先蓋棒球（鮮奶 3 不被咬），老鼠 Lv2 守在路燈門口
  for (const id of ['milk', 'bulb', 'baseball', 'rat']) { const r = engine.place(s, id, spec); s = r.state; await run([...r.events, { kind: 'settle' }]); }
  assert.equal(show.stage.meta.trouble, 'bulb');
  const rats = show.roster.members('rat.pack'); assert.equal(rats.length, 2);
  let t = show.elapsed; const dt = 1 / 30, bridge = new Map(), still = new Map();
  for (let f = 0; f < 30 * 30; f++) {
    show.update(dt, t += dt);
    for (const m of rats) {
      if (f >= 30 * 10 && !cellAt(m.pos.x, m.pos.z)) bridge.set(m, (bridge.get(m) ?? 0) + dt);   // 前 10 s 是從窩走去路燈（過橋是正常的）
      const r = still.get(m) ?? { pos: { ...m.pos }, since: t, max: 0 }; still.set(m, r);
      if (Math.hypot(m.pos.x - r.pos.x, m.pos.z - r.pos.z) > 0.03) { r.pos = { ...m.pos }; r.since = t; } else r.max = Math.max(r.max, t - r.since);
    }
  }
  for (const m of rats) {
    assert.equal(bridge.get(m) ?? 0, 0, `rat#${m.i} spent ${(bridge.get(m) ?? 0).toFixed(1)} s on a bridge`);
    assert.ok(still.get(m).max < 6, `rat#${m.i} froze for ${still.get(m).max.toFixed(1)} s`);
  }
});

// 計畫 14 Task 4：老鼠咬剛放下的珍奶／鮮奶（R30 的 fx：cause rat、flag bitten_<id>、item 是被咬的）——
// 一隻老鼠（離它最近的那隻）跑到攤車／牛奶箱旁 → 聞一聞 → ！ → 換成被咬的樣子（攤車缺口＋地上的珍珠／牛奶箱側躺）→ 沒有 LEVEL DOWN；一級 3–4.5 s
const isBite = id => e => e.kind === 'fx' && e.cause === 'rat' && e.flag?.name === `bitten_${id}`;
test('rat bites the fresh boba: the nearest rat runs to the cart, sniffs, ！, the cart turns bitten; no LEVEL DOWN; 2.5–3.5 s', async () => {
  const beats = rat.script.fx({ kind: 'fx', item: 'boba', cause: 'rat', flag: { name: 'bitten_boba', value: 'rat' } }, { lv: lv({ rat: 2, boba: 1 }), flags: { bitten_boba: 'rat' } }, { B });
  assert.ok(Array.isArray(beats) && beats.length, 'a bite script');
  // R41（使用者 2026-11-05：後期動畫偏長）：！ 跟換成被咬的樣子同一拍（together：apply、！）
  //   跑過去那拍有最短秒數（together：walk、wait）
  assert.deepEqual(beats.map(b => b.kind).slice(0, 3), ['together', 'gesture', 'together']);
  assert.deepEqual(beats[0].beats.map(b => b.kind), ['walk', 'wait']); assert.deepEqual(beats[2].beats.map(b => b.kind), ['apply', 'bubble']);
  assert.ok(!beats.some(b => b.kind === 'levelUp'), 'no LEVEL DOWN');
  assert.deepEqual(rat.CART_BITE, boba.BITE_SPOT, 'the rat stands where boba.js put the bite');
  const h = await headlessShow(), { show, bubblesLog } = h, walls = watchWalls(h);
  const { e, secs, n } = await liveAt(h, ['milk', 'baseball', 'rat', 'boba'], isBite('boba'));
  assert.ok(secs >= 2.5 && secs <= SCRIPT_MAX, `the bite ${secs.toFixed(2)} s`);
  assert.equal(e.item, 'boba');
  const P = boba.view(show.stage.lv, show.stage.flags)['boba.main'].parts;
  assert.equal(P.length, boba.view(lv({ boba: 1 }), {})['boba.main'].parts.length + 3, 'the bitten cart (gap + pearls)');
  const [m] = show.roster.members('rat.pack').sort((a, b) => Math.hypot(a.pos.x - boba.SHOP.x, a.pos.z - boba.SHOP.z) - Math.hypot(b.pos.x - boba.SHOP.x, b.pos.z - boba.SHOP.z));
  assert.ok(near(m.pos, boba.SHOP, 1.0), `a rat by the cart (${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)})`);
  assert.ok(bubblesLog.slice(n).some(b => b.kind === '！'), 'the rat ！');
  assert.ok(!bubblesLog.slice(n).some(b => b.text), 'no LEVEL UP / LEVEL DOWN');
  for (const k of KEYS) for (const r of show.roster.members(k)) assert.equal(r.mode, 'home');
  assert.deepEqual(walls.bad, []);
});
test('rat bites the fresh milk (placed after the rat): the rat runs to the crate, sniffs, ！, the crate lies tipped; no LEVEL DOWN; 2.5–3.5 s', async () => {
  const h = await headlessShow(), { show, bubblesLog } = h, walls = watchWalls(h);
  const { e, secs, n } = await liveAt(h, ['rat', 'milk'], isBite('milk'));
  assert.ok(secs >= 2.5 && secs <= SCRIPT_MAX, `the bite ${secs.toFixed(2)} s`);
  assert.equal(e.item, 'milk');
  assert.ok(milk.view(show.stage.lv, show.stage.flags, show.stage.meta)['milk.crate'].parts.some(p => p.spill), 'the crate lies tipped');
  assert.ok(bubblesLog.slice(n).some(b => b.kind === '！'));
  assert.ok(!bubblesLog.slice(n).some(b => b.text), 'no LEVEL DOWN');
  const [m] = show.roster.members('rat.pack');
  assert.ok(near(m.pos, milk.CRATE, 1.0), `the rat by the crate (${m.pos.x.toFixed(2)}, ${m.pos.z.toFixed(2)})`);
  assert.deepEqual(walls.bad, []);
});
// 整局 live：老鼠先放、珍奶後放（被咬住，老鼠搭上捷運那回合才長）——每回合演完不丟錯、共用不變式乾淨；老鼠走了攤車恢復原樣
test('live, a whole game with the boba bitten (rat before boba): no script error, invariants clean, the cart heals when the rat boards the metro', async () => {
  const order = ['milk', 'baseball', 'rat', 'boba', 'token', 'bulb', 'chip', 'typhoon'];
  const cam = overviewRig(), { show, run } = await headlessShow({ rig: cam.rig }), inv = gameInvariants(show, { cam });
  // 修正輪 1：看舞台上真的那個零件——被咬時 boba.main 是有缺口＋珍珠的那一份（頂點數），老鼠搭上捷運那回合換掉、回到沒缺口的那一份
  const f = createPartFactory(THREE, { glow: createGlowRegistry(), builders: {} });
  const verts = o => o?.children[0]?.geometry?.attributes.position.count ?? -1;
  const plainN = verts(f.build(boba.view(lv({ boba: 1, rat: 3 }), {})['boba.main']).object), bittenN = verts(f.build(boba.view(lv({ boba: 1, rat: 2 }), { bitten_boba: 'rat' })['boba.main']).object);
  assert.ok(bittenN > plainN, 'the bitten cart has more geometry (gap + pearls)');
  let s = engine.createState(spec), bitten = 0, healed = false, bittenObj = null;
  for (const [i, step] of turnSteps(order).entries()) {
    const r = step(s); s = r.state; inv.label(`turn ${i + 1}`);
    await run([...r.events, { kind: 'settle' }]);
    inv.turnEnd();
    assert.equal(JSON.stringify(show.stage.lv), JSON.stringify(s.lv), `turn ${i + 1}: stage matches the engine`);
    const obj = show.stage.partObject('boba.main');
    if (s.flags.bitten_boba && s.lv.rat <= 2) { bitten++; bittenObj = obj; assert.equal(verts(obj), bittenN, `turn ${i + 1}: the bitten cart is on stage`); }
    else if (bittenObj && !healed) { healed = true; assert.notEqual(obj, bittenObj, `turn ${i + 1}: the cart part was swapped`); assert.equal(verts(obj), plainN, `turn ${i + 1}: no gap, no pearls`); }
  }
  assert.ok(bitten >= 1, 'the boba sat bitten at least one turn');
  assert.ok(s.flags.bitten_boba && s.lv.rat >= 3, 'the rat boarded the metro');
  assert.ok(healed, 'the cart healed the turn the rat left (boba still a cart then)');
  assert.deepEqual([...inv.walls].slice(0, 10), [], `${inv.walls.size} inside a building`);
  assert.deepEqual([...inv.jumps].slice(0, 10), [], `${inv.jumps.size} jumps`);
  assert.deepEqual([...inv.pops].slice(0, 10), [], `${inv.pops.size} pops`);
});
// 遠的那種：吹歪局（EXAMPLE.deflect）第 6 回合放珍奶，老鼠 Lv2 守在遠處出問題的那棟門口，跑來咬也 ≤ 4.5 s（pace 原本量到 4.9 s）
test('rat bites the fresh boba from a far trouble door (EXAMPLE.deflect turn 6) within 3.5 s', async () => {
  const { EXAMPLE } = await import('./helpers/endings.js');
  const { run, scriptElapsed } = await headlessShow();
  let s = engine.createState(spec), secs = null;
  for (const step of turnSteps(EXAMPLE.deflect)) {
    const r = step(s); s = r.state;
    if (!r.events.some(isBite('boba'))) { await run([...r.events, { kind: 'settle' }]); continue; }   // 前面的回合也照常演（老鼠站在哪跟前面怎麼演有關）
    // 整回合照正式演出演（同 pace：劇本秒數不含鏡頭 focus 拍，再扣掉前面補的空拍）
    const marks = [];
    await run([...r.events, { kind: 'settle' }], { onMark: (e, info) => marks.push([e, scriptElapsed(), info?.gap ?? 0]) });
    const k = marks.findIndex(([e]) => isBite('boba')(e));
    secs = marks[k + 1][1] - marks[k][1] - marks[k][2];
    break;
  }
  assert.ok(secs !== null, 'the deflect game bites the boba');
  assert.ok(secs >= 2.5 && secs <= SCRIPT_MAX, `the bite ${secs.toFixed(2)} s`);
});

// R41 最終審稿：◆ 下限也在真的回合裡守——老鼠跑遠那局（tools/pace.mjs 的 FAR_TROUBLE）最後一輪外星 Lv4：變異鼠就在溫泉旁，走路很短，
//   pace 量到整段 4.1 s（◆ 軟下限 4.5）。整局 live，◆ Lv4 live（扣掉空拍）≥ 4.5 s、≤ KEY_MAX
test('◆ Lv4 alien in the real turn (the mutant starts by the spring, FAR_TROUBLE order): live ≥ 4.5 s', async () => {
  const { playLive } = await import('./helpers/show.js');
  const ev = (await playLive(['typhoon', 'milk', 'chip', 'bulb', 'token', 'boba', 'baseball', 'rat'])).find(x => x.e.kind === 'grow' && x.e.item === 'rat' && x.e.to === 4);
  assert.ok(ev && ev.key && ev.live >= 4.5 && ev.live <= KEY_MAX, `turn ${ev?.turn}: ◆ Lv4 ${ev?.live.toFixed(2)} s`);
});
