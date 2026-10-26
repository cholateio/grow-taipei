// 鏡頭：全景框景與 1000ms 飛行（政策島提示詞 §3）。controls 只需要 { target, update() }。
const n = Math.hypot(0.24, 0.33, 0.87);
export const OVERVIEW_DIR = { x: 0.24 / n, y: 0.33 / n, z: 0.87 / n };

// 再拉近：主島佔滿畫面，外圈衛星島可以被切到（使用者 2026-10-25）
export function overviewDistance(aspect) { return aspect >= 1.4 ? 19 : aspect >= 0.8 ? 26 : 40; }
export function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

export function createCameraRig({ THREE, camera, controls, center = { x: 0.4, y: 0.6, z: 0 }, reducedMotion = false }) {
  const home = new THREE.Vector3(center.x, center.y, center.z);
  let aspect = 16 / 9, flight = null, grabbed = false;
  // 現在的框景（全景、平移、focus）：fit 換長寬比時照這個重算，不把演到一半的 focus 拉回全景
  let framing = { kind: 'home' };
  const v = (p) => new THREE.Vector3(p.x, p.y, p.z);

  function go(pos, target, ms) {
    if (reducedMotion || ms <= 0) {
      flight = null; camera.position.copy(pos); controls.target.copy(target); camera.lookAt(target); controls.update(); return;
    }
    flight = { fromPos: camera.position.clone(), fromTarget: controls.target.clone(), pos, target, ms, t: 0 };
  }
  const overviewPos = () => home.clone().addScaledVector(v(OVERVIEW_DIR), overviewDistance(aspect));
  // 框景 → { pos, target }（距離用目前的長寬比）
  function frame(f) {
    if (f.kind === 'pan') return { pos: overviewPos().add(f.target.clone().sub(home)), target: f.target.clone() };
    if (f.kind === 'focus') return { pos: f.target.clone().addScaledVector(f.dir, overviewDistance(aspect) * f.zoom), target: f.target.clone() };
    return { pos: overviewPos(), target: home.clone() };
  }
  function show(f, ms) { framing = f; const { pos, target } = frame(f); go(pos, target, ms); }

  return {
    get flying() { return !!flight; },
    // 玩家拖過鏡頭：這回合 focus 不再搶鏡頭，home 回全景時清掉（§13.1）
    get grabbed() { return grabbed; },
    setReducedMotion(flag) { reducedMotion = flag; if (flag && flight) go(flight.pos, flight.target, 0); },
    // 換長寬比：照現在的框景重算；飛到一半就只換終點（照樣飛過去），沒在飛就直接到位
    fit(a) {
      aspect = a;
      const { pos, target } = frame(framing);
      if (flight) { flight.pos = pos; flight.target = target; } else go(pos, target, 0);
    },
    // 回到全景框景
    home(ms = 1000) { grabbed = false; show({ kind: 'home' }, ms); },
    // 平移：鏡頭與注視點同向移動 target − home，視角不變
    panTo(target, ms = 1000) { show({ kind: 'pan', target: v(target) }, ms); },
    // 平移＋拉近：注視點移到 target，沿目前視線方向退到全景距離 × zoom（§13.1）
    focus(target, { zoom = 0.6, ms = 1000 } = {}) {
      if (grabbed) return;
      const t = v(target), dir = camera.position.clone().sub(controls.target);
      if (dir.lengthSq() < 1e-12) dir.copy(v(OVERVIEW_DIR));
      show({ kind: 'focus', target: t, dir: dir.normalize(), zoom }, ms);
    },
    // 玩家按下滑鼠：停掉飛行、標記拖過。正在飛回全景（回合最後那拍不佔時間，turn() resolve 後還在飛）就直接落在全景，
    // 不停在半路——點一下等於「跳到全景」（final review 2）；其他框景照舊停在原地
    cancel() {
      if (flight && framing.kind === 'home') go(flight.pos, flight.target, 0);
      flight = null; grabbed = true;
    },
    // 回合開始放開拖過的記號（不動鏡頭）：回合之間拖一下不影響下一回合跟主線
    release() { grabbed = false; },
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
