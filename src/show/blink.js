// 亮一下（計畫 9 §4，取代閃白）：東西出現、消失、換裝時，它自己亮一下 BLINK 秒再回原樣——不塗純白。
//   part(object3d, dur, onEnd?)：底下每個 mesh 的材質換成原材質的複本（同一個 part 裡共用同一個原材質的 mesh 共用一份複本；
//     原材質從來不改，island.js 那種各色共用的材質才不會整島一起亮）。有 emissive 的：emissive 設白、
//     emissiveIntensity = GLOW × (1 − easeOut(t/dur))（從 GLOW 以 ease-out 降到 0）；本來就在發光的（燈、窗）保留自己的光、白光疊在上面，
//     每幀照原材質當下的強度算（夜晚、大停電調的是原材質）。沒有 emissive 的（MeshBasicMaterial）把 color 往白 lerp 同一個比例。
//     時間到換回原材質、dispose 複本，再呼叫 onEnd。
//   grow(object3d, dur = GROW_DUR)：長出來（修正批次 2，取代小彈一下 0.94 → 1：使用者「建築物升級時只會原地閃爍」）——記下呼叫時的 scale，
//     只動 y：先在 GROW_FROM 倍停 GROW_HOLD 秒（就是亮一下的那段：玩家看到一截發亮的矮樁），再花 dur 秒以 ease-out-back 長到 GROW_PEAK 倍、
//     回 1 倍（共 GROW_HOLD + dur）；x、z 不動。零件的原點就是它的底（at，零件從 y 0 往上蓋），所以是從地面長上來，object.position 不動。
//     結束設回記下的 scale（壓扁過的零件也不會被設成 1）。和亮一下（part）同時開始，亮一下照舊 BLINK 秒淡掉。哪些零件會長由 stage.js growsOn 決定（只有建築）
//   walker(w, dur)：小人是 InstancedMesh 的一個實例，改用 people.flashInstance 把整個實例塗白、時間到重塗原色（名冊換位置用，照舊）。
// 亮到一半再亮同一個東西：計時重來，不再複製一次。父子各自 part（巢狀）：後來的那個跳過已經在亮的 mesh（各自換回自己的原材質）。clear()：全部立刻回原樣（跳過、RESET）。
// stop(object 或 walker)：只把這一個立刻收掉（要拿掉、放回模型池的東西先換回原材質與原大小，複本才不會被帶走）。
// has(object 或 walker)：這一個現在正在亮或正在長（測試查「換位置的那一幀有閃」）。count：正在亮／長／閃的東西有幾個（同一個東西只算一次）。
export const BLINK = 0.15;
export const GLOW = 0.35;
export const GROW_DUR = 0.5, GROW_HOLD = 0.15;   // 長高的秒數；長之前先停在矮樁的秒數（＝亮一下 BLINK，協調者裁決：曲線不藏在白光裡）
const GROW_FROM = 0.15, GROW_PEAK = 1.06;
// ease-out-back：f(0) = 0、f(1) = 1，中途衝過頭 1 + 4s³ / (27 (s + 1)²)；s = 1.4 衝到 1.0706，乘上 (1 − GROW_FROM) 剛好是 GROW_PEAK 1.06
const BACK = 1.4;
const easeOutBack = k => { const u = k - 1; return 1 + (BACK + 1) * u ** 3 + BACK * u ** 2; };
// t：從呼叫起算的秒數；前 GROW_HOLD 秒停在 GROW_FROM，之後 dur 秒長上去
const growAt = (t, dur) => (t <= GROW_HOLD ? GROW_FROM : GROW_FROM + (1 - GROW_FROM) * easeOutBack(Math.min(1, (t - GROW_HOLD) / dur)));
const easeOut = k => 1 - (1 - k) ** 2;

export function createBlink(THREE, { people }) {
  const parts = new Map();     // object3d → { t, dur, saved: [[mesh, 原材質（或陣列）]], clones: Map(原材質 → 複本), onEnd }
  const active = new Set();    // 正在用的複本：巢狀的 part（父子各亮一次）跳過已經在亮的 mesh——不然會複製複本，先結束的那個換回去之後另一個再換回已 dispose 的複本
  const grows = new Map();     // object3d → { t, dur, scale: 呼叫時的 scale }
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
      // 零件自己抓著原材質調透明度（淡入淡出）的，亮的期間也跟著。每幀抄一次靠 show/index.js 的 update 順序：
      //   blink.update 在 timeline／stage 前面，抄到的是上一幀拍子設的透明度（慢一幀，看不出來）；改那邊的順序要一起看這裡
      c.opacity = m.opacity;
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
      if (!o.isMesh || [].concat(o.material).some(m => active.has(m))) return;   // 這個 mesh 正被另一個 part 亮著：交給它
      saved.push([o, o.material]);
      o.material = Array.isArray(o.material) ? o.material.map(m => cloneOf(m, clones)) : cloneOf(o.material, clones);
    });
    for (const c of clones.values()) active.add(c);
    const it = { t: 0, dur, saved, clones, onEnd };
    parts.set(object, it); paint(it);
  }
  function endPart(object, it) {
    parts.delete(object);
    for (const [mesh, material] of it.saved) mesh.material = material;
    for (const c of it.clones.values()) { active.delete(c); c.dispose(); }
    it.onEnd?.();
  }

  function grow(object, dur = GROW_DUR) {
    const was = grows.get(object);
    if (was) { was.t = 0; was.dur = dur; } else grows.set(object, { t: 0, dur, scale: object.scale.clone() });   // dur 是長高那段，總長 GROW_HOLD + dur
    stretch(object, grows.get(object));
  }
  function stretch(object, it) { object.scale.set(it.scale.x, it.scale.y * growAt(it.t, it.dur), it.scale.z); }
  function endGrow(object, it) { grows.delete(object); object.scale.copy(it.scale); }

  function walker(w, dur = BLINK) {
    const was = walkers.get(w);
    if (was) { was.t = 0; was.dur = dur; return; }
    walkers.set(w, { t: 0, dur }); people.flashInstance(w, true);
  }
  function endWalker(w) { walkers.delete(w); people.flashInstance(w, false); }

  function update(dt) {
    for (const [o, it] of [...parts]) if ((it.t += dt) >= it.dur - 1e-9) endPart(o, it); else paint(it);
    for (const [o, it] of [...grows]) if ((it.t += dt) >= GROW_HOLD + it.dur - 1e-9) endGrow(o, it); else stretch(o, it);
    for (const [w, it] of [...walkers]) if ((it.t += dt) >= it.dur - 1e-9) endWalker(w);
  }
  function stop(target) {
    const it = parts.get(target); if (it) endPart(target, it);
    const g = grows.get(target); if (g) endGrow(target, g);
    if (walkers.has(target)) endWalker(target);
  }
  function clear() {
    for (const [o, it] of [...parts]) endPart(o, it);
    for (const [o, it] of [...grows]) endGrow(o, it);
    for (const w of [...walkers.keys()]) endWalker(w);
  }
  const has = target => parts.has(target) || grows.has(target) || walkers.has(target);
  return {
    part, grow, walker, update, stop, clear, has,
    get count() { return new Set([...parts.keys(), ...grows.keys(), ...walkers.keys()]).size; },
  };
}
