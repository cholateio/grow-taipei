// 鏡頭：全景框景與 1000ms 飛行（政策島提示詞 §3）。controls 只需要 { target, update() }。
const n = Math.hypot(0.24, 0.33, 0.87);
export const OVERVIEW_DIR = { x: 0.24 / n, y: 0.33 / n, z: 0.87 / n };

// 再拉近：主島佔滿畫面，外圈衛星島可以被切到（使用者 2026-10-25）
export function overviewDistance(aspect) { return aspect >= 1.4 ? 19 : aspect >= 0.8 ? 26 : 40; }
// 全景跟 101 高度（§14.4）：天際線（101 頭頂 y）超過 SKYLINE_FLOOR 的每一單位，注視點抬高 SKYLINE_LIFT、距離多拉 SKYLINE_PULL 倍，
// 頭頂在 16:9 與 21:9 都落在畫面上緣 10% 以內（NDC y ≤ 0.8；完工頭頂 7.75 約 0.72），島中心最多掉到 NDC −0.32；≤ 3（工地）全景不變
export const SKYLINE_FLOOR = 3, SKYLINE_LIFT = 0.5, SKYLINE_PULL = 0.05;
export function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

export function createCameraRig({ THREE, camera, controls, center = { x: 0.4, y: 0.6, z: 0 }, reducedMotion = false }) {
  const home = new THREE.Vector3(center.x, center.y, center.z);
  let aspect = 16 / 9, flight = null, grabbed = false, rise = 0;   // rise：天際線超過 SKYLINE_FLOOR 多少
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
  // 框景 → { pos, target }（距離用目前的長寬比）；只有全景跟天際線，平移、focus 照舊
  function frame(f) {
    if (f.kind === 'pan') return { pos: overviewPos().add(f.target.clone().sub(home)), target: f.target.clone() };
    if (f.kind === 'focus') return { pos: f.target.clone().addScaledVector(f.dir, overviewDistance(aspect) * f.zoom), target: f.target.clone() };
    const target = home.clone(); target.y += SKYLINE_LIFT * rise;
    return { pos: target.clone().addScaledVector(v(OVERVIEW_DIR), overviewDistance(aspect) * (1 + SKYLINE_PULL * rise)), target };
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
    // 全景跟 101 頭頂高度 topY 走（§14.4）：在全景就重算——飛回全景途中只換終點、停在全景就照常飛 1000 ms 過去（玩家拖過就不搶；
    // reduced-motion 照舊直接到位）。最終審稿 2：颱風登陸那回合 101 的劇本只剩回全景（indoorSettle），回合收尾的 focus('home', { skyline })
    // 跑的時候鏡頭已經停在全景，原本直接到位就是一幀跳 4–6 公尺。
    // 在平移／focus 只記下來，下次回全景才用。高度沒變什麼都不做
    setSkyline(topY) {
      const r = Math.max(0, topY - SKYLINE_FLOOR);
      if (r === rise) return;
      rise = r;
      if (framing.kind !== 'home') return;
      const { pos, target } = frame(framing);
      if (flight) { flight.pos = pos; flight.target = target; } else if (!grabbed) go(pos, target, 1000);
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
