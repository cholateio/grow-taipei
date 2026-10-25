import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as baseball from '../src/actors/baseball.js';
import { RING_R } from '../src/scene/hex.js';
import { lv, worldPoints, distToCell } from './helpers/actors.js';
import { createPartFactory } from '../src/actors/parts.js';
import { createGlowRegistry } from '../src/scene/glow.js';

test('baseball lv1 is a sand lot; lv2 a dome with two players and a ball', () => {
  const v1 = baseball.view(lv({ baseball: 1 }), {}); assert.deepEqual(Object.keys(v1), ['baseball.main']);
  assert.ok(!v1['baseball.main'].parts.some(p => p.kind === 'dome'));
  const v2 = baseball.view(lv({ baseball: 2 }), {});
  assert.ok(v2['baseball.main'].parts.some(p => p.kind === 'dome')); assert.equal(v2['baseball.players'].stand.length, 2);
  assert.equal(v2['baseball.players'].accessory, 'cap'); assert.equal(v2['baseball.ball'].kind, 'ball');
});
test('lv3 adds a crowd of 4 and the glowing roof slit; lv4 six fans and blue light sticks', () => {
  const v3 = baseball.view(lv({ baseball: 3 }), {}), v4 = baseball.view(lv({ baseball: 4 }), {});
  assert.equal(v3['baseball.crowd'].n, 4); assert.ok(v3['baseball.main'].parts.some(p => p.glow === 0xfcea8b));
  assert.equal(v4['baseball.crowd'].n, 6); assert.ok(v4['baseball.main'].parts.filter(p => p.glow === 0x3fe0ff).length >= 8);
});
test('domeRats flag adds two helmeted staff running around the gate', () => {
  const v = baseball.view(lv({ baseball: 2 }), { domeRats: true });
  assert.equal(v['baseball.staff'].n, 2); assert.equal(v['baseball.staff'].accessory, 'helmet');
});
test('the ball flies back and forth between the players', () => {
  const f = createPartFactory(THREE, { glow: createGlowRegistry(), builders: baseball.builders });
  const spec = baseball.view(lv({ baseball: 2 }), {})['baseball.ball'], p = f.build(spec), ball = p.object.children[0];
  p.update(0, 0); const x0 = ball.position.x; p.update(0, 0.3); assert.ok(ball.position.y > 0.2); p.update(0, 0.6); assert.ok(Math.sign(ball.position.x) !== Math.sign(x0) || Math.abs(ball.position.x - x0) > 0.5);
});
test('every baseball part stays inside its cell', () => {
  for (const n of [1, 2, 3, 4]) for (const s of Object.values(baseball.view(lv({ baseball: n }), { domeRats: true }))) for (const p of worldPoints(s)) assert.ok(distToCell(p, [-1, 1]) < RING_R, `lv${n} ${JSON.stringify(p)}`);
});
test('crowd leaves an aisle for the players: no fan within 0.35 of a player', () => {
  const v = baseball.view(lv({ baseball: 4 }), {});
  for (const f of v['baseball.crowd'].stand) for (const p of v['baseball.players'].stand) assert.ok(Math.hypot(f.x - p.x, f.z - p.z) > 0.35);
});
