import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import * as baseball from '../src/actors/baseball.js';
import { RING_R } from '../src/scene/hex.js';
import { lv, worldPoints, distToCell } from './helpers/actors.js';
import { createPartFactory } from '../src/actors/parts.js';
import { createGlowRegistry } from '../src/scene/glow.js';

test('baseball lv1 sand lot; lv2 wooden stands + two players and a ball; lv3 the dome', () => {
  const v1 = baseball.view(lv({ baseball: 1 }), {}); assert.deepEqual(Object.keys(v1), ['baseball.main']);
  const v2 = baseball.view(lv({ baseball: 2 }), {});
  assert.ok(!v2['baseball.main'].parts.some(p => p.kind === 'dome')); assert.ok(v2['baseball.main'].parts.filter(p => p.stand).length >= 3, 'stands');
  assert.equal(v2['baseball.players'].stand.length, 2); assert.equal(v2['baseball.ball'].kind, 'ball');
  assert.ok(baseball.view(lv({ baseball: 3 }), {})['baseball.main'].parts.some(p => p.kind === 'dome'));
});
test('lv4 crowd of 4 + roof slit; lv5 six fans + blue sticks; lv6 fireworks over the dome', () => {
  const v4 = baseball.view(lv({ baseball: 4 }), {}), v5 = baseball.view(lv({ baseball: 5 }), {}), v6 = baseball.view(lv({ baseball: 6 }), {});
  assert.equal(v4['baseball.crowd'].n, 4); assert.ok(v4['baseball.main'].parts.some(p => p.glow === 0xfcea8b));
  assert.equal(v5['baseball.crowd'].n, 6); assert.ok(v5['baseball.main'].parts.filter(p => p.glow === 0x3fe0ff).length >= 8);
  assert.equal(v6['baseball.fireworks'].kind, 'fireworks'); assert.equal(v5['baseball.fireworks'], undefined);
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
  for (const n of [1, 2, 3, 4, 5, 6]) for (const s of Object.values(baseball.view(lv({ baseball: n }), { domeRats: true }))) if (s.kind !== 'fireworks') for (const p of worldPoints(s)) assert.ok(distToCell(p, [-1, 1]) < RING_R, `lv${n} ${JSON.stringify(p)}`);
});
test('crowd leaves an aisle for the players: no fan within 0.35 of a player', () => {
  const v = baseball.view(lv({ baseball: 5 }), {});
  for (const f of v['baseball.crowd'].stand) for (const p of v['baseball.players'].stand) assert.ok(Math.hypot(f.x - p.x, f.z - p.z) > 0.35);
});
