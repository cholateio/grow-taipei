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
// 另外兩位溫泉客（landmarks.bathers）站在池邊（池子 footprint 外擴 PAD 之外、rescue），偶爾看一下池子
import { MAIN_CELLS, cellAt } from '../src/scene/hex.js';
import { landmarkWorld } from '../src/actors/anchors.js';
import { createNav, PAD } from '../src/show/nav.js';
const SPRING = landmarkWorld('spring');
test('islanders: n 5, wander homes cover all six main cells, two of them stand at the spring pool edge with fidget look and never inside the pool footprint', () => {
  const v = landmarks.view(zero, {}), r = v['landmarks.islanders'];
  assert.equal(r.kind, 'roster'); assert.equal(r.n, 5); assert.deepEqual(r.accessory, ['none', 'cap']);
  assert.equal(r.home.kind, 'wander'); assert.equal(r.home.r, 1.8); assert.equal(r.home.at.length, 6);
  const cells = r.home.at.map(p => String(cellAt(p.x, p.z)));
  assert.deepEqual([...cells].sort(), MAIN_CELLS.filter(c => String(c) !== '1,-1').map(String).sort(), 'six main cells, the spring cell is the bathers\'');
  r.home.at.forEach((p, i) => { const c = axialToWorld(...cellAt(p.x, p.z)); assert.deepEqual(p, { x: c.x, y: cellTop(cellAt(p.x, p.z)), z: c.z }, `home ${i} is the cell centre`); });
  // 五個散步的人家都不一樣，不擠在珍奶格（最擠的那格排在第六個）
  assert.equal(new Set(Array.from({ length: r.n }, (_, i) => cells[i % 6])).size, 5); assert.equal(cells[5], '0,1');
  const b = v['landmarks.bathers'];
  assert.deepEqual([b.kind, b.n, b.home.kind, b.home.fidget, b.home.rescue, b.home.spots.length], ['roster', 2, 'stand', 'look', true, 2]);
  const fp = [].concat(v['landmarks.spring'].footprint), nav = createNav();
  nav.setFootprints(fp.map(f => ({ ...f, x: SPRING.x + (f.x ?? 0), z: SPRING.z + (f.z ?? 0) })));
  for (const [i, p] of b.home.spots.entries()) {
    assert.deepEqual(cellAt(p.x, p.z), [1, -1], `bather ${i} in the spring cell`);
    const d = Math.hypot(p.x - SPRING.x, p.z - SPRING.z);
    assert.ok(d > fp[0].r + PAD && d < fp[0].r + PAD + 0.3, `bather ${i} on the pool edge (${d.toFixed(2)})`);
    assert.ok(nav.walkable(p.x, p.z), `bather ${i} walkable`);
    assert.ok(Math.abs(Math.atan2(Math.sin(p.yaw - Math.atan2(SPRING.x - p.x, SPRING.z - p.z)), Math.cos(p.yaw - Math.atan2(SPRING.x - p.x, SPRING.z - p.z)))) < 1e-9, `bather ${i} faces the pool`);
    assert.ok(p.z > SPRING.z, `bather ${i} on the camera side`);
  }
});
// 審查重點 4：老鼠泡溫泉（老鼠 ≥3、沒搭上捷運）時，溫泉客站池邊、老鼠在池裡，10 秒內每一對都 ≥ 0.25
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
  bathers().forEach((b, i) => { const s = landmarks.view(show.stage.lv, show.stage.flags)['landmarks.bathers'].home.spots[i]; assert.ok(Math.hypot(b.pos.x - s.x, b.pos.z - s.z) < 0.1, `bather ${i} on the pool edge`); });
});
// 島民、溫泉客的入口（預設：家那格邊上離家最遠的可走點）兩條正解每一刻都走得到、離站位 ≥ 1.5
test('islander and bather entries are walkable and ≥ 1.5 from their homes through both solutions', async () => {
  const spec = await import('../src/rules/spec.js'), { enumerate, stats } = await import('../src/solver/run.js'), { entriesThroughSolutions } = await import('./helpers/show.js');
  assert.deepEqual(await entriesThroughSolutions(landmarks, stats(enumerate(spec), spec).full.map(r => r.order)), []);
});
