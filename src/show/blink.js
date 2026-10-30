// 亮一下（計畫 9 §4，取代閃白）：東西出現、消失、換裝時，它自己亮一下 BLINK 秒再回原樣——不塗純白。
//   part(object3d, dur, onEnd?)：底下每個 mesh 的材質換成原材質的複本（同一個 part 裡共用同一個原材質的 mesh 共用一份複本；
//     原材質從來不改，island.js 那種各色共用的材質才不會整島一起亮）。有 emissive 的：emissive 設白、
//     emissiveIntensity = GLOW × (1 − easeOut(t/dur))（從 GLOW 以 ease-out 降到 0）；本來就在發光的（燈、窗）保留自己的光、白光疊在上面，
//     每幀照原材質當下的強度算（夜晚、大停電調的是原材質）。沒有 emissive 的（MeshBasicMaterial）把 color 往白 lerp 同一個比例。
//     時間到換回原材質、dispose 複本，再呼叫 onEnd。
//   pop(object3d, dur)：小彈一下——記下呼叫時的 scale，乘上 0.94 → 1 的 ease-out，結束設回記下的 scale（壓扁過的零件也不會被設成 1）。
//   walker(w, dur)：小人是 InstancedMesh 的一個實例，改用 people.flashInstance 把整個實例塗白、時間到重塗原色（名冊換位置用，照舊）。
// 亮到一半再亮同一個東西：計時重來，不再複製一次。clear()：全部立刻回原樣（跳過、RESET）。
// stop(object 或 walker)：只把這一個立刻收掉（要拿掉、放回模型池的東西先換回原材質與原大小，複本才不會被帶走）。
// has(object 或 walker)：這一個現在正在亮或正在彈（測試查「換位置的那一幀有閃」）。count：正在亮／彈／閃的東西有幾個（同一個東西只算一次）。
export const BLINK = 0.15;
export const GLOW = 0.35;
const POP_FROM = 0.94;
const easeOut = k => 1 - (1 - k) ** 2;

export function createBlink(THREE, { people }) {
  const parts = new Map();     // object3d → { t, dur, saved: [[mesh, 原材質（或陣列）]], clones: Map(原材質 → 複本), onEnd }
  const pops = new Map();      // object3d → { t, dur, scale: 呼叫時的 scale }
  const walkers = new Map();   // walker → { t, dur }
  const WHITE = new THREE.Color(1, 1, 1);
  const lit = m => m.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0;

  // 複本：Material.copy 不帶 onBeforeCompile（assets.js 的多色發光靠它乘頂點色），自己補上
  function cloneOf(m, clones) {
    if (!m || !(m.emissive || m.color)) return m;   // 不能亮的材質（沒有顏色）照用原材質
    if (!clones.has(m)) {
      const c = m.clone();
      for (const k of ['onBeforeCompile', 'customProgramCacheKey', 'onBeforeRender']) if (Object.hasOwn(m, k)) c[k] = m[k];
      clones.set(m, c);
    }
    return clones.get(m);
  }
  function paint(it) {
    const k = GLOW * (1 - easeOut(Math.min(1, it.t / it.dur)));
    for (const [m, c] of it.clones) {
      c.opacity = m.opacity;   // 零件自己抓著原材質調透明度（淡入淡出）的，亮的期間也跟著
      if (c.emissive) {
        if (lit(m)) { c.emissive.copy(m.emissive).multiplyScalar(m.emissiveIntensity); c.emissive.r += k; c.emissive.g += k; c.emissive.b += k; c.emissiveIntensity = 1; }
        else { c.emissive.setRGB(1, 1, 1); c.emissiveIntensity = k; }
      } else c.color.copy(m.color).lerp(WHITE, k);
    }
  }

  function part(object, dur = BLINK, onEnd = null) {
    const was = parts.get(object);
    if (was) { was.t = 0; was.dur = dur; if (onEnd) was.onEnd = onEnd; paint(was); return; }
    const saved = [], clones = new Map();
    object.traverse(o => {
      if (!o.isMesh) return;
      saved.push([o, o.material]);
      o.material = Array.isArray(o.material) ? o.material.map(m => cloneOf(m, clones)) : cloneOf(o.material, clones);
    });
    const it = { t: 0, dur, saved, clones, onEnd };
    parts.set(object, it); paint(it);
  }
  function endPart(object, it) {
    parts.delete(object);
    for (const [mesh, material] of it.saved) mesh.material = material;
    for (const c of it.clones.values()) c.dispose();
    it.onEnd?.();
  }

  function pop(object, dur = BLINK) {
    const was = pops.get(object);
    if (was) { was.t = 0; was.dur = dur; } else pops.set(object, { t: 0, dur, scale: object.scale.clone() });
    stretch(object, pops.get(object));
  }
  function stretch(object, it) { object.scale.copy(it.scale).multiplyScalar(POP_FROM + (1 - POP_FROM) * easeOut(Math.min(1, it.t / it.dur))); }
  function endPop(object, it) { pops.delete(object); object.scale.copy(it.scale); }

  function walker(w, dur = BLINK) {
    const was = walkers.get(w);
    if (was) { was.t = 0; was.dur = dur; return; }
    walkers.set(w, { t: 0, dur }); people.flashInstance(w, true);
  }
  function endWalker(w) { walkers.delete(w); people.flashInstance(w, false); }

  function update(dt) {
    for (const [o, it] of [...parts]) if ((it.t += dt) >= it.dur - 1e-9) endPart(o, it); else paint(it);
    for (const [o, it] of [...pops]) if ((it.t += dt) >= it.dur - 1e-9) endPop(o, it); else stretch(o, it);
    for (const [w, it] of [...walkers]) if ((it.t += dt) >= it.dur - 1e-9) endWalker(w);
  }
  function stop(target) {
    const it = parts.get(target); if (it) endPart(target, it);
    const p = pops.get(target); if (p) endPop(target, p);
    if (walkers.has(target)) endWalker(target);
  }
  function clear() {
    for (const [o, it] of [...parts]) endPart(o, it);
    for (const [o, it] of [...pops]) endPop(o, it);
    for (const w of [...walkers.keys()]) endWalker(w);
  }
  const has = target => parts.has(target) || pops.has(target) || walkers.has(target);
  return {
    part, pop, walker, update, stop, clear, has,
    get count() { return new Set([...parts.keys(), ...pops.keys(), ...walkers.keys()]).size; },
  };
}
