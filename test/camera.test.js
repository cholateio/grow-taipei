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
// 回合最後回全景飛到一半被點一下（final review 2）：回全景的飛行直接落地，不停在半路；其他框景照舊停在半路
test('cancel during a flight home lands at the overview at once and still marks the rig grabbed', () => {
  const { rig, camera, controls } = rigWith(); rig.fit(16 / 9); const home = camera.position.clone();
  rig.focus({ x: 4, y: 0.65, z: 2 }); rig.update(1.1); rig.home(1000); rig.update(0.3);
  assert.ok(rig.flying, 'mid-flight home'); rig.cancel();
  assert.equal(rig.flying, false); assert.equal(rig.grabbed, true);
  assert.ok(camera.position.distanceTo(home) < 1e-6 && controls.target.distanceTo(new THREE.Vector3(0.4, 0.6, 0)) < 1e-6, 'landed at the overview');
  rig.update(0.5); assert.ok(camera.position.distanceTo(home) < 1e-6, 'stays there');
  rig.home(0); rig.cancel(); assert.equal(rig.grabbed, true, 'a click at the overview just marks grabbed');
  assert.ok(camera.position.distanceTo(home) < 1e-6);
});
// 回合開始放開「拖過」的記號，但鏡頭留在玩家拖到的地方（計畫 3.8 R4）
test('release clears grabbed without moving the camera', () => {
  const { rig, camera, controls } = rigWith(); rig.fit(16 / 9); rig.cancel();
  const pos = camera.position.clone(), target = controls.target.clone();
  rig.release(); assert.equal(rig.grabbed, false); assert.equal(rig.flying, false);
  rig.update(1); assert.ok(camera.position.distanceTo(pos) < 1e-9); assert.ok(controls.target.distanceTo(target) < 1e-9);
});
// 視窗縮放（fit）不能把演到一半的 focus 拉回全景（控制者 F1）：記住現在的框景，用新的長寬比重算
test('fit after a focus keeps the focus target at zoom × the new overview distance; fit during the flight retargets it', () => {
  const { rig, camera, controls } = rigWith(); rig.fit(16 / 9); const dir = camera.position.clone().sub(controls.target).normalize();
  const p = new THREE.Vector3(4, 0.65, 2);
  rig.focus(p, { zoom: 0.6, ms: 1000 }); rig.update(1.1); rig.fit(1);
  assert.equal(rig.flying, false); assert.ok(controls.target.distanceTo(p) < 1e-6);
  const d = camera.position.clone().sub(controls.target); assert.ok(Math.abs(d.length() - 26 * 0.6) < 1e-6); assert.ok(d.normalize().distanceTo(dir) < 1e-6);
  // 飛到一半縮放：照樣飛，終點換成新長寬比的框景
  const b = rigWith(); b.rig.fit(16 / 9); b.rig.focus(p, { zoom: 0.6, ms: 1000 }); b.rig.update(0.3); b.rig.fit(9 / 16);
  assert.equal(b.rig.flying, true); b.rig.update(0.8);
  assert.ok(b.controls.target.distanceTo(p) < 1e-6); assert.ok(Math.abs(b.camera.position.distanceTo(p) - 40 * 0.6) < 1e-6);
});
test('fit after home stays at home; fit after panTo keeps the pan', () => {
  const { rig, camera, controls } = rigWith(); rig.fit(16 / 9);
  rig.focus({ x: 4, y: 0.65, z: 2 }); rig.update(1.1); rig.home(1000); rig.update(1.1); rig.fit(1);
  assert.ok(controls.target.distanceTo(new THREE.Vector3(0.4, 0.6, 0)) < 1e-6); assert.ok(Math.abs(camera.position.distanceTo(controls.target) - 26) < 1e-6);
  rig.panTo({ x: 5, y: 0.6, z: 5 }, 0); rig.fit(16 / 9);
  assert.ok(controls.target.distanceTo(new THREE.Vector3(5, 0.6, 5)) < 1e-6); assert.ok(Math.abs(camera.position.distanceTo(controls.target) - 19) < 1e-6);
});
