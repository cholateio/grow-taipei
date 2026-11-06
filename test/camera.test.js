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
// 全景跟 101 高度（§14.4）：頭頂那一點在 16:9 與 21:9 都落在畫面上緣 10% 以內（NDC y ≤ 0.8），島中心不掉出下半（≥ −0.6）
const TOWER = { x: 0.6, z: -0.3 };   // anchorWorld('tower') 的水平位置
const ndcY = (camera, p) => { camera.updateMatrixWorld(); return new THREE.Vector3(p.x, p.y, p.z).project(camera).y; };
test('setSkyline raises the home target and distance so a point at (tower.x, topY, tower.z) projects to NDC y ≤ 0.8 at aspects 1.78 and 2.37, while the island centre stays at NDC y ≥ -0.6; topY ≤ 3 leaves the overview unchanged', () => {
  for (const aspect of [16 / 9, 2.37]) {
    const ref = rigWith(); ref.camera.aspect = aspect; ref.camera.updateProjectionMatrix(); ref.rig.fit(aspect);
    for (const topY of [0, 1.4, 3]) {
      const { rig, camera, controls } = rigWith(); camera.aspect = aspect; camera.updateProjectionMatrix(); rig.fit(aspect); rig.setSkyline(topY);
      assert.ok(camera.position.distanceTo(ref.camera.position) < 1e-9 && controls.target.distanceTo(ref.controls.target) < 1e-9, `topY ${topY}: overview unchanged`);
    }
    // 4.45 = 101 蓋一半的頭頂、7.75 = 完工／點燈的頭頂（stage.headOf('tower').y）
    for (const topY of [3.5, 4.45, 6, 7.75]) {
      const { rig, camera, controls } = rigWith(); camera.aspect = aspect; camera.updateProjectionMatrix(); rig.fit(aspect); rig.setSkyline(topY);
      assert.equal(rig.flying, true, 'at home and not flying: flies to the new framing (final review 2)'); rig.update(1.1); assert.equal(rig.flying, false);
      const top = ndcY(camera, { x: TOWER.x, y: topY, z: TOWER.z }), centre = ndcY(camera, { x: 0.4, y: 0.6, z: 0 });
      assert.ok(top <= 0.8, `aspect ${aspect.toFixed(2)} topY ${topY}: top at NDC ${top.toFixed(3)}`);
      assert.ok(centre >= -0.6, `aspect ${aspect.toFixed(2)} topY ${topY}: island centre at NDC ${centre.toFixed(3)}`);
      assert.ok(controls.target.y > 0.6, 'target raised');
      const d = camera.position.clone().sub(controls.target);
      assert.ok(d.length() > overviewDistance(aspect), 'pulled back'); assert.ok(d.normalize().dot(new THREE.Vector3(OVERVIEW_DIR.x, OVERVIEW_DIR.y, OVERVIEW_DIR.z)) > 1 - 1e-9, 'same viewing angle');
    }
    // 7.75 的頭頂在現在的全景是出框的（這個測試真的在量東西）
    assert.ok(ndcY(ref.camera, { x: TOWER.x, y: 7.75, z: TOWER.z }) > 1);
  }
});
test('setSkyline while flying home retargets the flight; while in a focus framing it does not move the camera', () => {
  const raised = rigWith(); raised.rig.fit(16 / 9); raised.rig.setSkyline(7.75); raised.rig.update(1.1);
  const pos = raised.camera.position.clone(), target = raised.controls.target.clone();
  // 飛回全景途中：照樣飛，終點換成抬高的全景
  const a = rigWith(); a.rig.fit(16 / 9); a.rig.focus({ x: 4, y: 0.65, z: 2 }); a.rig.update(1.1); a.rig.home(1000); a.rig.update(0.3);
  a.rig.setSkyline(7.75); assert.equal(a.rig.flying, true, 'still flying');
  a.rig.update(0.8); assert.equal(a.rig.flying, false);
  assert.ok(a.camera.position.distanceTo(pos) < 1e-6 && a.controls.target.distanceTo(target) < 1e-6, 'landed at the raised overview');
  // focus 框景：只記下來，鏡頭不動；之後回全景才用新的高度
  const b = rigWith(); b.rig.fit(16 / 9); const p = new THREE.Vector3(4, 0.65, 2);
  b.rig.focus(p); b.rig.update(1.1); const fpos = b.camera.position.clone();
  b.rig.setSkyline(7.75); assert.equal(b.rig.flying, false);
  b.rig.update(1); assert.ok(b.camera.position.distanceTo(fpos) < 1e-9 && b.controls.target.distanceTo(p) < 1e-9, 'focus untouched');
  b.rig.fit(16 / 9); assert.ok(Math.abs(b.camera.position.distanceTo(p) - 19 * 0.6) < 1e-6, 'focus distance ignores the skyline');
  b.rig.home(0); assert.ok(b.camera.position.distanceTo(pos) < 1e-6 && b.controls.target.distanceTo(target) < 1e-6, 'home uses the stored skyline');
  // 抬高之後換長寬比照樣跟著；再降回 ≤ 3 就回到原本的全景（RESET）
  b.rig.fit(1); assert.ok(b.camera.position.distanceTo(b.controls.target) > 26 + 1e-6);
  b.rig.setSkyline(1.4); b.rig.update(1.1); assert.ok(b.controls.target.distanceTo(new THREE.Vector3(0.4, 0.6, 0)) < 1e-9 && Math.abs(b.camera.position.distanceTo(b.controls.target) - 26) < 1e-9);
});
// 最終審稿 2：停在全景時天際線變了，照常飛 1000 ms 過去（颱風登陸那回合 101 的劇本只剩回全景，回合收尾 focus('home', { skyline }) 原本在一幀裡跳 5.66）；
// reduced-motion 照舊直接到位；玩家拖過鏡頭就不動
test('setSkyline at home with no flight flies there over 1000 ms (no single-frame jump); reduced motion snaps; grabbed stays put', () => {
  const end = rigWith(); end.rig.fit(16 / 9); end.rig.setSkyline(7.75); end.rig.update(1.1);
  const { rig, camera, controls } = rigWith(); rig.fit(16 / 9); const p0 = camera.position.clone();
  rig.setSkyline(7.75);
  assert.equal(rig.flying, true, 'flying'); assert.ok(camera.position.distanceTo(p0) < 1e-9, 'nothing moved yet');
  let prev = camera.position.clone(), most = 0;
  for (let i = 0; i < 30; i++) { rig.update(1 / 30); most = Math.max(most, camera.position.distanceTo(prev)); prev = camera.position.clone(); if (i === 14) assert.ok(camera.position.distanceTo(p0) > 0.1 && camera.position.distanceTo(end.camera.position) > 0.1, 'interpolating half way'); }
  rig.update(0.1); assert.equal(rig.flying, false);
  assert.ok(camera.position.distanceTo(end.camera.position) < 1e-6 && controls.target.distanceTo(end.controls.target) < 1e-6, 'lands on the raised overview');
  assert.ok(most < 0.5 * p0.distanceTo(end.camera.position), `largest frame step ${most.toFixed(3)}`);
  const r = rigWith({ reducedMotion: true }); r.rig.fit(16 / 9); r.rig.setSkyline(7.75);
  assert.equal(r.rig.flying, false); assert.ok(r.camera.position.distanceTo(end.camera.position) < 1e-6, 'reduced motion: at once');
  const g = rigWith(); g.rig.fit(16 / 9); const g0 = g.camera.position.clone(); g.rig.cancel(); g.rig.setSkyline(7.75); g.rig.update(1.1);
  assert.equal(g.rig.flying, false); assert.ok(g.camera.position.distanceTo(g0) < 1e-9, 'grabbed: not moved');
});
// R42（使用者 2026-11-06）：手機橫版物品列是右側直排側欄，鏡頭用 view offset 往右推半個側欄，島在側欄左邊那塊置中
test('setInset({ right }) shifts the view by half the rail (camera.setViewOffset(w, h, right/2, 0, w, h)); right 0 clears it; fit keeps it', () => {
  const { camera, rig } = rigWith();
  rig.fit(2, { width: 1000, height: 500 }); rig.setInset({ right: 122 });
  assert.equal(camera.view?.enabled, true); assert.equal(camera.view.offsetX, 61); assert.equal(camera.view.fullWidth, 1000); assert.equal(camera.view.fullHeight, 500);
  rig.fit(2, { width: 800, height: 400 }); assert.equal(camera.view.fullWidth, 800); assert.equal(camera.view.offsetX, 61, 'inset survives a resize');
  rig.setInset({ right: 0 }); assert.ok(!camera.view?.enabled);
  // 側欄開著時島心（home）投影到左側那塊的正中：NDC x ≈ −(61 / 800)·2 = −0.1525（整個畫面的座標），即剩下那塊的中心
  rig.setInset({ right: 122 }); rig.home(0); camera.updateMatrixWorld();
  const p = new THREE.Vector3(0.4, 0.6, 0).project(camera); assert.ok(Math.abs(p.x - (-0.1525)) < 0.02, `home NDC x ${p.x.toFixed(3)}`);
});
