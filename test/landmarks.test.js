import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as landmarks from '../src/actors/landmarks.js';
import { PLATEAU_TOP, axialToWorld, cellTop } from '../src/scene/hex.js';
const zero = { milk: 0, chip: 0, bulb: 0, token: 0, typhoon: 0, rat: 0, boba: 0, baseball: 0 };
test('volcano and hot spring are on the plateau from the start, both steaming', () => {
  const v = landmarks.view(zero, {});
  assert.deepEqual(Object.keys(v).sort(), ['landmarks.bathers', 'landmarks.islanders', 'landmarks.spring', 'landmarks.springSteam', 'landmarks.volcano', 'landmarks.volcanoSmoke']);
  for (const k in v) if (v[k].kind !== 'roster') assert.equal(v[k].at.y, PLATEAU_TOP, k);
  assert.equal(v['landmarks.volcanoSmoke'].kind, 'smoke'); assert.equal(v['landmarks.springSteam'].kind, 'smoke');
  assert.ok(v['landmarks.volcano'].parts.some(p => p.glow), 'crater glows');
});
// §14.3 人分散：島民 5 人一個名冊，散步的家是溫泉格以外的六格（第 i 人用 home.at[i % 6]）；
// 另外兩位溫泉客（landmarks.bathers）泡在池子裡（計畫 13 §設計 3：池心半徑 0.3、水淹到胸口、不帶 rescue），偶爾看一下池子
import { MAIN_CELLS, cellAt } from '../src/scene/hex.js';
import { landmarkWorld } from '../src/actors/anchors.js';
import { createNav, PAD } from '../src/show/nav.js';
const SPRING = landmarkWorld('spring');
// 人數預算（裁決 R16）：島民 4 人、一人一格；最擠的球場格（-1,1）與珍奶格（0,1）不住島民，溫泉格（1,-1）是溫泉客的
test('islanders: n 4, one wander home per cell on the four main cells that are not baseball/boba/spring; two bathers soak in the pool (radius 0.3, chest-deep, facing the centre, no rescue) with fidget look', () => {
  const v = landmarks.view(zero, {}), r = v['landmarks.islanders'];
  assert.equal(r.kind, 'roster'); assert.equal(r.n, 4); assert.deepEqual(r.accessory, ['none', 'cap']);
  assert.equal(r.home.kind, 'wander'); assert.equal(r.home.r, 1.8); assert.equal(r.home.at.length, r.n);
  const cells = r.home.at.map(p => String(cellAt(p.x, p.z)));
  assert.deepEqual([...cells].sort(), MAIN_CELLS.filter(c => !['1,-1', '-1,1', '0,1'].includes(String(c))).map(String).sort(), 'not the spring, baseball or boba cell');
  r.home.at.forEach((p, i) => { const c = axialToWorld(...cellAt(p.x, p.z)); assert.deepEqual(p, { x: c.x, y: cellTop(cellAt(p.x, p.z)), z: c.z }, `home ${i} is the cell centre`); });
  const b = v['landmarks.bathers'];
  assert.deepEqual([b.kind, b.n, b.home.kind, b.home.fidget, !!b.home.rescue, b.home.spots.length], ['roster', 2, 'stand', 'look', false, 2]);
  const fp = [].concat(v['landmarks.spring'].footprint), nav = createNav();
  nav.setFootprints(fp.map(f => ({ ...f, x: SPRING.x + (f.x ?? 0), z: SPRING.z + (f.z ?? 0) })));
  for (const [i, p] of b.home.spots.entries()) {
    assert.deepEqual(cellAt(p.x, p.z), [1, -1], `bather ${i} in the spring cell`);
    const d = Math.hypot(p.x - SPRING.x, p.z - SPRING.z);
    assert.ok(Math.abs(d - 0.3) < 1e-9, `bather ${i} in the pool, 0.3 from the centre (${d.toFixed(2)})`);
    // 計畫寫 − 0.22；截圖量到只露出頭（肩膀、手臂都在水下），改 − 0.15：頭、肩、手臂露出水面
    assert.ok(Math.abs(p.y - (SPRING.y + 0.13 - 0.15)) < 1e-9, `bather ${i} chest-deep: y = water surface − 0.15`);
    assert.ok(nav.inFootprint(p.x, p.z), `bather ${i} inside the pool footprint (an authored spot: roster / invariants let it be)`);
    assert.ok(Math.abs(Math.atan2(Math.sin(p.yaw - Math.atan2(SPRING.x - p.x, SPRING.z - p.z)), Math.cos(p.yaw - Math.atan2(SPRING.x - p.x, SPRING.z - p.z)))) < 1e-9, `bather ${i} faces the pool`);
    assert.ok(p.z > SPRING.z, `bather ${i} on the camera side`);
  }
});
// 審查重點 4：老鼠泡溫泉（老鼠 ≥3、沒搭上捷運）時，溫泉客站池邊、老鼠在池裡，10 秒內每一對都 ≥ 0.25。
// 唯一正解（其實所有放置順序）都到不了泡溫泉（老鼠 3 時代幣都已 ≥2），所以用合成的老鼠事件直接演到那一刻
test('spring bathers vs soaking rats (rat ≥ 3, token < 2): every pair stays ≥ 0.25 apart over 10 s (review focus 4)', async () => {
  const { headlessShow } = await import('./helpers/show.js'), { ratMode } = await import('../src/actors/rat.js');
  const { show, run } = await headlessShow();
  for (const e of [{ kind: 'placed', item: 'rat' }, { kind: 'grow', item: 'rat', to: 2 }, { kind: 'grow', item: 'rat', to: 3 }]) await run([e, { kind: 'settle' }], { instant: true });
  assert.equal(ratMode(show.stage.lv, show.stage.flags), 'spring');
  const rats = () => show.roster.members('rat.pack'), bathers = () => show.roster.members('landmarks.bathers');
  assert.equal(rats().length, 5); assert.equal(bathers().length, 2);
  let min = Infinity;
  for (let i = 0; i < 300; i++) {
    show.update(1 / 30, 100 + i / 30);
    for (const b of bathers()) for (const r of rats()) min = Math.min(min, Math.hypot(b.pos.x - r.pos.x, b.pos.z - r.pos.z));
  }
  assert.ok(min >= 0.25, `closest bather–rat ${min.toFixed(2)}`);
  bathers().forEach((b, i) => { const s = landmarks.view(show.stage.lv, show.stage.flags)['landmarks.bathers'].home.spots[i]; assert.ok(Math.hypot(b.pos.x - s.x, b.pos.z - s.z) < 0.1 && Math.abs(b.pos.y - s.y) < 1e-6, `bather ${i} soaking in the pool`); });
});
// 計畫 13 §設計 3：溫泉客（池心半徑 0.3）離泡湯老鼠（rat.js SPRING_SPOTS：池心半徑 0.62、5 隻）的站位每一對都 ≥ 0.25（實測最近 0.37）
test('the soaking bathers\' spots keep ≥ 0.25 from every soaking rat spot', async () => {
  const rat = await import('../src/actors/rat.js');
  const rats = rat.view({ ...zero, rat: 3 }, {}, {})['rat.pack'].home.spots, bathers = landmarks.view({ ...zero, rat: 3 }, {})['landmarks.bathers'].home.spots;
  assert.equal(rats.length, 5);
  const min = Math.min(...bathers.flatMap(b => rats.map(r => Math.hypot(b.x - r.x, b.z - r.z))));
  assert.ok(min >= 0.25, `closest ${min.toFixed(3)}`);
});
// 島民、溫泉客的入口（預設：家那格邊上離家最遠的可走點）唯一正解每一刻都走得到、離站位 ≥ 1.5
test('islander and bather entries are walkable and ≥ 1.5 from their homes through the solution', async () => {
  const spec = await import('../src/rules/spec.js'), { enumerate, stats } = await import('../src/solver/run.js'), { entriesThroughSolutions } = await import('./helpers/show.js');
  assert.deepEqual(await entriesThroughSolutions(landmarks, stats(enumerate(spec), spec).full.map(r => r.order)), []);
});
// 變異鼠（外星 Lv4 起）站在池子正前方（rat.js MUTANT）：計畫 13 起溫泉客泡在池裡（池心半徑 0.3），離牠 ≥ 0.6，不用換位置——
// 計畫寫的「改用 BATHERS_NORTH 的角度」要從池裡走出來繞一圈（nav 從 footprint 裡先逃到最近的可走點，就在池子前緣、變異鼠旁邊），
// 所以溫泉客在池裡不動：每一級、每個分岔的站位都一樣
test('with the mutant rat at the spring (rat ≥ 4, alien) the bathers stay put in the pool, ≥ 0.6 from the mutant', async () => {
  const { MUTANT } = await import('../src/actors/rat.js');
  const spots = (lv, flags) => landmarks.view({ ...zero, ...lv }, flags)['landmarks.bathers'].home.spots;
  for (const rat of [4, 5]) for (const p of spots({ rat }, { ratBranch: 'alien' })) {
    assert.ok(Math.hypot(p.x - MUTANT.x, p.z - MUTANT.z) >= 0.6, `rat ${rat}: ${Math.hypot(p.x - MUTANT.x, p.z - MUTANT.z).toFixed(2)} from the mutant`);
  }
  for (const [lv, flags] of [[{ rat: 4 }, { ratBranch: 'alien' }], [{ rat: 5 }, { ratBranch: 'alien' }], [{ rat: 4 }, { ratBranch: 'cyber' }], [{ rat: 3 }, {}]]) assert.deepEqual(spots(lv, flags), spots({}, {}), `${JSON.stringify(lv)} ${JSON.stringify(flags)}: unchanged`);
  const [a, b] = spots({}, {}); assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 0.25, 'the two bathers apart');
});
// 計畫 13 §設計 1：島民只被站長轉走一個（代幣 ≥2）；鮮奶不再借島民
test('islanderCount: HOMES.length minus one for the station master only (milk never takes an islander, plan 13)', () => {
  const all = landmarks.HOMES.length;
  assert.equal(landmarks.islanderCount({}), all);
  for (const milk of [0, 3, 10]) assert.equal(landmarks.islanderCount({ milk }), all, `milk ${milk}`);
  assert.equal(landmarks.islanderCount({ token: 1 }), all); assert.equal(landmarks.islanderCount({ token: 2 }), all - 1);
  assert.equal(landmarks.islanderCount({ milk: 10, token: 10 }), all - 1);
});
// 計畫 13 §設計 4（使用者 2026-11-01「火山太醜請重新設計」）：火山換成自己的 builder——有稜角的低多邊形錐（12 邊 6 段、每個頂點決定性抖動、
// 平面著色、頂點色三層：沙色、深棕、口緣更深），頂上凹一個碗、碗底一片熔岩、三條熔岩痕從口緣流到高度 0.6；石頭四顆照舊。
// draw call 不比現在多：一個黏土 mesh（錐、碗、石頭）＋一個發光 mesh（熔岩，走 ctx.glow：白天／大停電歸零）；手機一個 mesh
test('volcano builder: one faceted clay mesh with three vertex-colour bands and lava streaks painted on its faces + one glow mesh for the crater pool; deterministic; low quality merges to one', async () => {
  const THREE = await import('../vendor/three/three.module.js'), { createPartFactory } = await import('../src/actors/parts.js'), { createGlowRegistry } = await import('../src/scene/glow.js');
  const spec = landmarks.view(zero, {})['landmarks.volcano'];
  assert.equal(spec.kind, 'volcano'); assert.ok(landmarks.builders?.volcano, 'landmarks.builders.volcano');
  assert.equal(spec.parts.filter(p => p.kind === 'ico').length, 4, 'the four rocks'); assert.ok(!spec.parts.some(p => p.kind === 'frustum'), 'no more frustum cone');
  const make = (quality = 'high') => { const glow = createGlowRegistry(); return { glow, part: createPartFactory(THREE, { glow, quality, builders: landmarks.builders }).build(spec) }; };
  const { glow, part } = make(), meshes = part.object.children.filter(o => o.isMesh);
  assert.equal(meshes.length, 2, 'one clay + one glow mesh'); assert.equal(glow.size, 1, 'lava registered with ctx.glow');
  assert.deepEqual(part.object.position.toArray(), [spec.at.x, spec.at.y, spec.at.z]);
  const lava = meshes.find(m => m.material.emissive?.getHex() === 0xdb6a41), clay = meshes.find(m => m !== lava);
  assert.ok(lava && clay, 'lava glows orange');
  // 修正輪 0：熔岩痕不是獨立零件（凸出山體的直棒），畫在錐身上——發光的只剩碗底那池熔岩（口緣 1.5 下 0.18 左右）
  lava.geometry.computeBoundingBox(); const lb = lava.geometry.boundingBox;
  assert.ok(lb.min.y >= 1.25 && lb.max.y <= 1.4, `only the crater pool glows (${lb.min.y.toFixed(2)}..${lb.max.y.toFixed(2)})`);
  assert.ok(!spec.parts.some(p => p.kind === 'box'), 'no separate streak parts');
  // 錐：頂點色三層（沙色在下、口緣最深），平面著色（非索引、每個三角形三個法線一樣）
  const g = clay.geometry, pos = g.attributes.position, col = g.attributes.color, nor = g.attributes.normal;
  assert.equal(g.index, null, 'non-indexed');
  const hex = i => new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)).getHex(), tol = (a, b) => Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) + Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) + Math.abs((a & 255) - (b & 255)) <= 6;
  const bands = [0xd2b48c, 0x8a7563, 0x4a3f38], seen = new Set(), STREAK = 0xe8794f;
  let low = 0, lowSand = 0, top = 0, topDark = 0, streak = 0, streakLow = Infinity;
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, r = Math.hypot(pos.getX(i), pos.getZ(i)), c = hex(i);
    bands.forEach((b, k) => { if (tol(c, b)) seen.add(k); });
    if (tol(c, 0xb8a892)) continue;   // 石頭（ico，自己的平滑法線）
    if (tol(c, STREAK)) { for (let j = 0; j < 3; j++) { streak++; streakLow = Math.min(streakLow, pos.getY(i + j)); } continue; }   // 熔岩痕：錐身的面塗熔岩橘
    if (r > 0.7 && y < 0.5) { low++; if (tol(c, bands[0])) lowSand++; }
    if (r > 0.6 && r < 1.1 && y > 1.42) { top++; if (tol(c, bands[2])) topDark++; }
    const n0 = [nor.getX(i), nor.getY(i), nor.getZ(i)];
    if (bands.some(b => tol(c, b))) for (const j of [1, 2]) assert.ok(Math.abs(nor.getX(i + j) - n0[0]) + Math.abs(nor.getY(i + j) - n0[1]) + Math.abs(nor.getZ(i + j) - n0[2]) < 1e-5, 'flat-shaded face');
  }
  assert.equal(seen.size, 3, 'three colour bands');
  assert.ok(streak >= 12 && streakLow >= 0.6, `lava streaks painted on the cone: ${streak} vertices, lowest ${streakLow.toFixed(2)}`);
  assert.ok(low > 20 && lowSand / low > 0.95, `lower slope sand (${lowSand}/${low})`);
  assert.ok(top > 10 && topDark / top > 0.9, `crater rim darkest (${topDark}/${top})`);
  // 抖動過：錐腳那一圈頂點離中心不一樣遠（不是正 12 邊形），每次建出來一模一樣
  const foot = new Set(); for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i)) < 1e-6) foot.add(Math.hypot(pos.getX(i), pos.getZ(i)).toFixed(3));
  assert.ok(foot.size >= 6, `jittered foot ring (${foot.size} radii)`);
  const again = make().part.object.children.find(o => o.isMesh && !o.material.emissive?.getHex()).geometry.attributes.position.array;
  assert.deepEqual([...again], [...pos.array], 'deterministic');
  part.dispose(); assert.equal(glow.size, 0, 'dispose unregisters the lava');
  assert.equal(make('low').part.object.children.filter(o => o.isMesh).length, 1, 'phone: one mesh');
});
// 平台上的東西不出格：火山錐腳（1.45＋抖動）與四顆石頭都在火山格裡
test('the volcano foot and rocks stay inside the volcano cell', () => {
  const spec = landmarks.view(zero, {})['landmarks.volcano'], c = axialToWorld(0, -1), hexIn = 2.5 * Math.sqrt(3) / 2;
  const edge = p => hexIn - Math.max(...[0, 1, 2, 3, 4, 5].map(k => (p.x - c.x) * Math.cos(k * Math.PI / 3 + Math.PI / 6) + (p.z - c.z) * Math.sin(k * Math.PI / 3 + Math.PI / 6)));
  for (let k = 0; k < 24; k++) { const a = k / 24 * 2 * Math.PI, p = { x: spec.at.x + Math.cos(a) * 1.55, z: spec.at.z + Math.sin(a) * 1.55 }; assert.ok(cellAt(p.x, p.z)?.join() === '0,-1', `foot ${k}`); }
  for (const r of spec.parts.filter(p => p.kind === 'ico')) assert.ok(cellAt(spec.at.x + r.pos[0], spec.at.z + r.pos[2])?.join() === '0,-1');
  assert.ok(edge(spec.at) > 1.55, 'room for the foot');
});
