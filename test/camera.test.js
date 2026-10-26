import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { overviewDistance, easeInOutCubic, createCameraRig, OVERVIEW_DIR } from '../src/scene/camera.js';
const rigWith = (opts = {}) => { const camera = new THREE.PerspectiveCamera(32, 1, .3, 320); const controls = { target: new THREE.Vector3(), update() {} }; return { rig: createCameraRig({ THREE, camera, controls, ...opts }), camera, controls }; };
test('overview distance by aspect', () => { assert.equal(overviewDistance(16 / 9), 19); assert.equal(overviewDistance(1), 26); assert.equal(overviewDistance(9 / 16), 40); });
test('ease endpoints and midpoint', () => { assert.equal(easeInOutCubic(0), 0); assert.equal(easeInOutCubic(1), 1); assert.equal(easeInOutCubic(.5), .5); });
test('fit places the camera along OVERVIEW_DIR at the aspect distance', () => {
  const { rig, camera } = rigWith(); rig.fit(16 / 9);
  const d = camera.position.clone().sub(new THREE.Vector3(.4, .6, 0)); assert.ok(Math.abs(d.length() - 19) < 1e-6);
  assert.ok(Math.abs(d.normalize().dot(new THREE.Vector3(OVERVIEW_DIR.x, OVERVIEW_DIR.y, OVERVIEW_DIR.z)) - 1) < 1e-6);
});
test('panTo translates camera and target by the same vector, keeping the viewing angle', () => {
  const { rig, camera, controls } = rigWith(); rig.fit(16 / 9); const dir = camera.position.clone().sub(controls.target);
  rig.panTo({ x: 5, y: 0.6, z: 5 }, 1000); rig.update(0.5); assert.ok(rig.flying); rig.update(0.6); assert.ok(!rig.flying);
  assert.ok(controls.target.distanceTo(new THREE.Vector3(5, 0.6, 5)) < 1e-6); assert.ok(camera.position.clone().sub(controls.target).distanceTo(dir) < 1e-6);
  rig.home(1000); rig.update(1.1); assert.ok(controls.target.distanceTo(new THREE.Vector3(.4, .6, 0)) < 1e-6);
});
test('reduced motion snaps immediately; cancel stops a flight', () => {
  const a = rigWith({ reducedMotion: true }); a.rig.fit(1); a.rig.panTo({ x: 5, y: 0, z: 5 }); assert.equal(a.rig.flying, false); assert.ok(a.controls.target.distanceTo(new THREE.Vector3(5, 0, 5)) < 1e-6);
  const b = rigWith(); b.rig.fit(1); b.rig.panTo({ x: 5, y: 0, z: 5 }); b.rig.update(.1); const mid = b.camera.position.clone(); b.rig.cancel(); b.rig.update(.5); assert.ok(b.camera.position.distanceTo(mid) < 1e-9);
});
test('overview flies back to the fitted framing', () => {
  const { rig, camera } = rigWith(); rig.fit(16 / 9); const home = camera.position.clone();
  rig.panTo({ x: 5, y: 0, z: 5 }); rig.update(1.1); rig.home(800); rig.update(1);
  assert.ok(camera.position.distanceTo(home) < 1e-6);
});
test('focus moves the target to the point and brings the camera to zoom × overview distance along the same direction', () => {
  const { rig, camera, controls } = rigWith(); rig.fit(16 / 9); const dir = camera.position.clone().sub(controls.target).normalize();
  rig.focus({ x: 4, y: 0.65, z: 2 }, { zoom: 0.6, ms: 1000 }); rig.update(1.1);
  assert.ok(controls.target.distanceTo(new THREE.Vector3(4, 0.65, 2)) < 1e-6);
  const d = camera.position.clone().sub(controls.target); assert.ok(Math.abs(d.length() - 19 * 0.6) < 1e-6); assert.ok(d.normalize().distanceTo(dir) < 1e-6);
});
test('cancel marks the rig grabbed; home clears it; focus while grabbed does nothing', () => {
  const { rig, controls } = rigWith(); rig.fit(16 / 9); rig.focus({ x: 4, y: 0, z: 2 }); rig.update(0.3); rig.cancel();
  assert.equal(rig.grabbed, true); const mid = controls.target.clone(); rig.focus({ x: -4, y: 0, z: 0 }); rig.update(1); assert.ok(controls.target.distanceTo(mid) < 1e-9);
  rig.home(0); assert.equal(rig.grabbed, false);
});
