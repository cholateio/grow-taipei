import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKit, KINDS, GLOW, makeGeometry } from '../src/scene/kit.js';
import { mulberry32 } from '../src/scene/random.js';

test('mulberry32 is deterministic and in [0,1)', () => {
  const a = mulberry32(7), b = mulberry32(7); const xs = Array.from({ length: 5 }, () => a());
  assert.deepEqual(xs, Array.from({ length: 5 }, () => b())); assert.ok(xs.every(x => x >= 0 && x < 1));
});
test('one InstancedMesh per used kind with the right counts', () => {
  const kit = createKit(THREE);
  kit.part('box', { pos: [0, 0, 0], scale: 1, color: 0xff0000 }); kit.part('box', { pos: [1, 0, 0], scale: 1, color: 0xff0000 }); kit.part('cone', { pos: [0, 1, 0], scale: [1, 2, 1], color: 0x00ff00 });
  const g = kit.build();
  assert.equal(g.children.length, 2); assert.ok(g.children.every(m => m.isInstancedMesh));
  assert.equal(kit.count('box'), 2); assert.equal(kit.count('cone'), 1);
});
test('instance matrix carries position and (jittered) scale', () => {
  const kit = createKit(THREE); const e = kit.part('box', { pos: [1, 2, 3], scale: 2, color: 0xffffff }); const g = kit.build();
  const m = new THREE.Matrix4(); g.children[0].getMatrixAt(e.index, m);
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s);
  assert.deepEqual([p.x, p.y, p.z], [1, 2, 3]); assert.ok(Math.abs(s.x - 2) < 2 * 0.0073);
});
test('materials: clay standard for solids, emissive for glow kinds, shadows on', () => {
  const kit = createKit(THREE); kit.part('box', { pos: [0, 0, 0], scale: 1, color: 0xffffff }); kit.part('glowbox', { pos: [0, 0, 0], scale: 1, color: 0xffffff });
  const g = kit.build(); const solid = g.children.find(m => m.material.emissive.getHex() === 0), glow = g.children.find(m => m !== solid);
  assert.equal(solid.material.roughness, 0.78); assert.equal(solid.material.metalness, 0); assert.equal(solid.material.flatShading, false);
  assert.equal(glow.material.emissive.getHex(), GLOW); assert.equal(kit.glowMaterials.length, 1);
  assert.ok(solid.castShadow && solid.receiveShadow);
});
test('setColor after build updates instanceColor; unknown kind throws', () => {
  const kit = createKit(THREE); const e = kit.part('box', { pos: [0, 0, 0], scale: 1, color: 0x000000 }); const g = kit.build();
  kit.setColor(e, 0xff0000); const c = new THREE.Color(); g.children[0].getColorAt(e.index, c); assert.equal(c.getHex(), 0xff0000);
  assert.throws(() => kit.part('banana', { pos: [0, 0, 0], scale: 1, color: 0 }), /unknown kind/);
  assert.ok(KINDS.includes('hip'));
});
test('every kind builds a geometry with positions', () => {
  const kit = createKit(THREE);
  for (const k of KINDS) kit.part(k, { pos: [0, 0, 0], scale: 1, color: 0x888888 });
  const g = kit.build(); assert.equal(g.children.length, KINDS.length);
  for (const m of g.children) assert.ok(m.geometry.attributes.position.count > 0);
});
test('frustum and rail kinds exist and makeGeometry is exported for dynamic parts', () => {
  assert.ok(KINDS.includes('frustum') && KINDS.includes('rail'));
  assert.ok(makeGeometry(THREE, 'frustum').isBufferGeometry); assert.ok(makeGeometry(THREE, 'rail').isBufferGeometry);
});
