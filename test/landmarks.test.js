import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as landmarks from '../src/actors/landmarks.js';
import { PLATEAU_TOP, axialToWorld, cellTop } from '../src/scene/hex.js';
const zero = { milk: 0, chip: 0, bulb: 0, token: 0, typhoon: 0, rat: 0, boba: 0, baseball: 0 };
test('volcano and hot spring are on the plateau from the start, both steaming', () => {
  const v = landmarks.view(zero, {});
  assert.deepEqual(Object.keys(v).sort(), ['landmarks.islanders', 'landmarks.spring', 'landmarks.springSteam', 'landmarks.volcano', 'landmarks.volcanoSmoke']);
  for (const k in v) if (k !== 'landmarks.islanders') assert.equal(v[k].at.y, PLATEAU_TOP, k);
  assert.equal(v['landmarks.volcanoSmoke'].kind, 'smoke'); assert.equal(v['landmarks.springSteam'].kind, 'smoke');
  assert.ok(v['landmarks.volcano'].parts.some(p => p.glow), 'crater glows');
});
// 島民六人是一個名冊：中心格、[-1,1]、[1,0] 三格輪流當家（第 i 人用 home.at[i % 3]）
test('the six islanders are one roster wandering over three cells', () => {
  const r = landmarks.view(zero, {})['landmarks.islanders'];
  assert.equal(r.kind, 'roster'); assert.equal(r.n, 6); assert.deepEqual(r.accessory, ['none', 'cap']);
  assert.equal(r.home.kind, 'wander'); assert.equal(r.home.r, 1.8); assert.equal(r.home.at.length, 3);
  const cells = [[0, 0], [-1, 1], [1, 0]];
  r.home.at.forEach((p, i) => { const c = axialToWorld(...cells[i]); assert.deepEqual(p, { x: c.x, y: cellTop(cells[i]), z: c.z }); });
  assert.deepEqual(r.at, r.home.at[0]);
});
