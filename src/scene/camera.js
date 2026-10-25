// 鏡頭：全景框景與 800ms 飛行（政策島提示詞 §3）。controls 只需要 { target, update() }。
const n = Math.hypot(0.24, 0.33, 0.87);
export const OVERVIEW_DIR = { x: 0.24 / n, y: 0.33 / n, z: 0.87 / n };

// 再拉近：主島佔滿畫面，外圈衛星島可以被切到（使用者 2026-10-25）
export function overviewDistance(aspect) { return aspect >= 1.4 ? 19 : aspect >= 0.8 ? 26 : 40; }
export function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

export function createCameraRig({ THREE, camera, controls, center = { x: 0.4, y: 0.6, z: 0 }, reducedMotion = false }) {
  const home = new THREE.Vector3(center.x, center.y, center.z);
  let aspect = 16 / 9, flight = null;
  const v = (p) => new THREE.Vector3(p.x, p.y, p.z);

  function go(pos, target, ms) {
    if (reducedMotion || ms <= 0) {
      flight = null; camera.position.copy(pos); controls.target.copy(target); camera.lookAt(target); controls.update(); return;
    }
    flight = { fromPos: camera.position.clone(), fromTarget: controls.target.clone(), pos, target, ms, t: 0 };
  }
  const overviewPos = () => home.clone().addScaledVector(v(OVERVIEW_DIR), overviewDistance(aspect));

  return {
    get flying() { return !!flight; },
    setReducedMotion(flag) { reducedMotion = flag; if (flag && flight) go(flight.pos, flight.target, 0); },
    fit(a) { aspect = a; go(overviewPos(), home.clone(), 0); },
    // 回到全景框景
    home(ms = 1000) { go(overviewPos(), home.clone(), ms); },
    // 平移：鏡頭與注視點同向移動 target − home，視角不變
    panTo(target, ms = 1000) {
      const t = v(target), delta = t.clone().sub(home);
      go(overviewPos().add(delta), t, ms);
    },
    cancel() { flight = null; },
    update(dt) {
      if (flight) {
        flight.t += dt * 1000;
        const k = easeInOutCubic(Math.min(1, flight.t / flight.ms));
        camera.position.lerpVectors(flight.fromPos, flight.pos, k);
        controls.target.lerpVectors(flight.fromTarget, flight.target, k);
        if (k >= 1) flight = null;
      }
      controls.update();
    },
  };
}
