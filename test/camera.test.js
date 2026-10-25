import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { overviewDistance, easeInOutCubic, createCameraRig, OVERVIEW_DIR } from '../src/scene/camera.js';
const rigWith = (opts = {}) => { const camera = new THREE.PerspectiveCamera(32, 1, .3, 320); const controls = { target: new THREE.Vector3(), update() {} }; return { rig: createCameraRig({ THREE, camera, controls, ...opts }), camera, controls }; };
test('overview distance by aspect', () => { assert.equal(overviewDistance(16 / 9), 33); assert.equal(overviewDistance(1), 40); assert.equal(overviewDistance(9 / 16), 56); });
test('ease endpoints and midpoint', () => { assert.equal(easeInOutCubic(0), 0); assert.equal(easeInOutCubic(1), 1); assert.equal(easeInOutCubic(.5), .5); });
test('fit places the camera along OVERVIEW_DIR at the aspect distance', () => {
  const { rig, camera } = rigWith(); rig.fit(16 / 9);
  const d = camera.position.clone().sub(new THREE.Vector3(.4, .6, 0)); assert.ok(Math.abs(d.length() - 33) < 1e-6);
  assert.ok(Math.abs(d.normalize().dot(new THREE.Vector3(OVERVIEW_DIR.x, OVERVIEW_DIR.y, OVERVIEW_DIR.z)) - 1) < 1e-6);
});
test('focus flies over ms and lands on target + offset', () => {
  const { rig, camera, controls } = rigWith(); rig.fit(1); rig.focus({ x: 5, y: 0, z: 5 }, { x: 1.6, y: 2.5, z: 3.2 }, 800);
  assert.equal(rig.flying, true); rig.update(.4); assert.equal(rig.flying, true); rig.update(.5);
  assert.equal(rig.flying, false); assert.ok(camera.position.distanceTo(new THREE.Vector3(6.6, 2.5, 8.2)) < 1e-6); assert.ok(controls.target.distanceTo(new THREE.Vector3(5, 0, 5)) < 1e-6);
});
test('reduced motion snaps immediately; cancel stops a flight', () => {
  const a = rigWith({ reducedMotion: true }); a.rig.fit(1); a.rig.focus({ x: 5, y: 0, z: 5 }); assert.equal(a.rig.flying, false); assert.ok(a.controls.target.distanceTo(new THREE.Vector3(5, 0, 5)) < 1e-6);
  const b = rigWith(); b.rig.fit(1); b.rig.focus({ x: 5, y: 0, z: 5 }); b.rig.update(.1); const mid = b.camera.position.clone(); b.rig.cancel(); b.rig.update(.5); assert.ok(b.camera.position.distanceTo(mid) < 1e-9);
});
test('overview flies back to the fitted framing', () => {
  const { rig, camera } = rigWith(); rig.fit(16 / 9); const home = camera.position.clone();
  rig.focus({ x: 5, y: 0, z: 5 }); rig.update(1); rig.overview(800); rig.update(1);
  assert.ok(camera.position.distanceTo(home) < 1e-6);
});
