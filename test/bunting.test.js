// 三角旗串（修正批次 max-skip §A、§B：棒球／珍奶 MAX）：一面三角旗是 kit 的 prism（三稜柱）轉成直立、尖朝下；
// 旗面所在的平面法線朝 yaw；旗串的繩子是一段段斜的細盒子（拋物線下垂）。用真的 THREE 把零件的 rot／scale／pos 套上去量
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { pennant, bunting, eulerYawPitch, PENNANT_COLORS } from '../src/actors/bunting.js';
import { makeGeometry } from '../src/scene/kit.js';

// 零件的頂點（世界座標，相對零件的原點）
function verts(p) {
  const g = makeGeometry(THREE, p.kind), o = new THREE.Object3D();
  o.position.set(...p.pos); o.rotation.set(...(p.rot ?? [0, 0, 0])); o.scale.set(...[].concat(p.scale).flatMap(s => (Array.isArray(p.scale) ? [s] : [s, s, s])));
  o.updateMatrixWorld(); const a = g.attributes.position, v = new THREE.Vector3(), out = [];
  for (let i = 0; i < a.count; i++) out.push(v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld).clone());
  return out;
}
test('eulerYawPitch: a box whose long axis is z points along yaw, pitched up by pitch', () => {
  for (const [yaw, pitch] of [[0, 0], [0.7, 0.3], [-2.1, -0.4], [Math.PI / 2, 0.2]]) {
    const e = new THREE.Euler(...eulerYawPitch(yaw, pitch)), d = new THREE.Vector3(0, 0, 1).applyEuler(e);
    assert.ok(Math.abs(d.x - Math.cos(pitch) * Math.sin(yaw)) < 1e-9 && Math.abs(d.y - Math.sin(pitch)) < 1e-9 && Math.abs(d.z - Math.cos(pitch) * Math.cos(yaw)) < 1e-9, `${yaw}, ${pitch}`);
  }
});
test('a pennant is an upright triangle hanging point-down from its top, its face normal along yaw', () => {
  for (const yaw of [0, 0.9, -2.4]) {
    const top = [0.3, 1.0, -0.2], p = pennant(top, yaw, 0xdb6a41, 0.1, 0.12), vs = verts(p);
    assert.equal(p.kind, 'prism'); assert.equal(p.color, 0xdb6a41); assert.equal(p.pennant, true);
    const ys = vs.map(v => v.y), lo = Math.min(...ys), hi = Math.max(...ys);
    assert.ok(Math.abs(hi - top[1]) < 1e-6 && Math.abs(hi - lo - 0.12) < 1e-6, `hangs 0.12 below its top (${lo}, ${hi})`);
    const tip = vs.filter(v => v.y < lo + 1e-6), base = vs.filter(v => v.y > hi - 1e-6);
    const span = Math.max(...base.map(a => Math.max(...base.map(b => Math.hypot(a.x - b.x, a.z - b.z)))));
    assert.ok(Math.abs(span - 0.1) < 0.02, `base about 0.1 wide (${span})`);
    for (const v of tip) assert.ok(Math.hypot(v.x - top[0], v.z - top[2]) < 0.02, 'the point is right under the top');
    const n = [Math.sin(yaw), Math.cos(yaw)];   // 旗面法線：所有頂點到旗面中心的位移跟法線幾乎垂直（只有薄薄的厚度）
    for (const v of vs) assert.ok(Math.abs((v.x - top[0]) * n[0] + (v.z - top[2]) * n[1]) < 0.01, 'flat, facing yaw');
  }
});
test('bunting: a sagging string of thin boxes between two points, pennants in rotating colours hung along it, all clay', () => {
  const a = [0, 1, 0], b = [1, 0.8, 0.5], parts = bunting(a, b, { n: 6, sag: 0.1 });
  const flags = parts.filter(p => p.pennant), string = parts.filter(p => !p.pennant);
  assert.equal(flags.length, 6); assert.ok(string.length >= 3 && string.every(p => p.kind === 'box'), 'string segments');
  assert.ok(new Set(flags.map(p => p.color)).size >= 5 && flags.every(p => PENNANT_COLORS.includes(p.color)), 'five or more colours');
  assert.ok(parts.every(p => !p.glow), 'no glow (no extra draw call)');
  const ends = string.flatMap(verts), d = (v, q) => Math.hypot(v.x - q[0], v.y - q[1], v.z - q[2]);
  assert.ok(Math.min(...ends.map(v => d(v, a))) < 0.02 && Math.min(...ends.map(v => d(v, b))) < 0.02, 'the string reaches both ends');
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  assert.ok(Math.min(...string.map(p => p.pos[1] - mid[1])) < -0.05, 'sags in the middle');
});
