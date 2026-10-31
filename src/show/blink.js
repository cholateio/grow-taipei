// 亮一下（計畫 9 §4，取代閃白；計畫 11 §設計 1 收斂成四種：建築長出來、起因提示、名冊換位／換裝、扶正）：亮一下 BLINK 秒再回原樣——不塗純白。
//   其餘零件直接出現，要拿掉的縮下去（shrink），不亮。
//   part(object3d, dur, onEnd?)：底下每個 mesh 的材質換成原材質的複本（同一個 part 裡共用同一個原材質的 mesh 共用一份複本；
//     原材質從來不改，island.js 那種各色共用的材質才不會整島一起亮）。有 emissive 的：emissive 設白、
//     emissiveIntensity = GLOW × (1 − easeOut(t/dur))（從 GLOW 以 ease-out 降到 0）；本來就在發光的（燈、窗）保留自己的光、白光疊在上面，
//     每幀照原材質當下的強度算（夜晚、大停電調的是原材質）。沒有 emissive 的（MeshBasicMaterial）把 color 往白 lerp 同一個比例。
//     時間到換回原材質、dispose 複本，再呼叫 onEnd。
//   grow(object3d, dur = GROW_DUR)：長出來（修正批次 2，取代小彈一下 0.94 → 1：使用者「建築物升級時只會原地閃爍」）——記下呼叫時的 scale，
//     只動 y：先在 GROW_FROM 倍停 GROW_HOLD 秒（矮樁），再花 dur 秒以 ease-in-out（smoothstep）長到 1 倍，最後 25 %（SETTLE 之後）疊一個小衝過頭、
//     最高 GROW_PEAK 倍再落回 1 倍（共 GROW_HOLD + dur）；x、z 不動。零件的原點就是它的底（at，零件從 y 0 往上蓋；glb 模型由 assets.spawn 把底放在 y 0，
//     晚到的模型加進零件的 group 時也吃 group 的 scale），所以是從地面長上來，object.position 不動。結束設回記下的 scale（壓扁過的零件也不會被設成 1）。
//     使用者 2026-10-31「閃一下」（30 fps 錄影：矮樁只停一幀、三幀內就長滿，整棟一片白）：舊曲線 ease-out-back 0.5 s 在 0.1 s 就到 0.72，
//     加上同時亮一下（part）的白光——改成先停 0.2 s、慢慢起步，長的時候不亮（stage.js commit 只呼叫 grow）。哪些零件會長由 stage.js growsOn 決定（只有建築）
//   shrink(object3d, dur = SHRINK_DUR, onEnd?)：縮下去（計畫 11 §設計 1：要拿掉的零件不亮）——記下呼叫時的 scale 與位置，只動 y：以 ease-in 花 dur 秒
//     從 1 倍縮到 SHRINK_TO 倍，材質不換。軸是零件自己的底（呼叫時包圍盒的最低點）：建築的原點就是底，position 不動；
//     畫在高處的（颱風雲、煙、雨——原點在地面）在自己的底部壓扁，不會整團掉到地上。包圍盒是空的（還沒載到的模型）就用原點。
//     時間到先設回記下的 scale 與位置再呼叫 onEnd（舞台在 onEnd 拿掉它）。正在長的先收掉 grow（從自己的高度縮）。stop／clear：立刻回原樣並呼叫 onEnd
//   nod(object3d, dur = NOD_DUR)：彈一下（裁決 R21，起因提示用；使用者 2026-10-31 19:58 錄影：幫手那棟每次亮 0.4 s 看起來就是「學校閃了好幾次」）——不換材質、
//     只動 y：先壓到 NOD_DIP 倍、再彈過 NOD_PEAK 倍、回 1 倍（三段 smoothstep，共 dur 秒）；底不動（同 grow：零件的原點就是底）。結束設回記下的 scale
//   walker(w, dur)：小人是 InstancedMesh 的一個實例，改用 people.flashInstance 把整個實例塗白、時間到重塗原色（名冊換位置用，照舊）。
// 哪些東西會亮（計畫 11 §設計 1／裁決 R15、R20、R21；使用者 2026-10-31「閃一下」之後建築不再亮：長出來只長、起因提示只彈）：名冊的人換位置／換裝、扶正（被撞歪的零件下一回合開頭，turn.js upright）。
// 亮到一半再亮同一個東西：計時重來，不再複製一次。父子各自 part（巢狀）：後來的那個跳過已經在亮的 mesh（各自換回自己的原材質）。clear()：全部立刻回原樣（跳過、RESET）。
// stop(object 或 walker)：只把這一個立刻收掉（要拿掉、放回模型池的東西先換回原材質與原大小，複本才不會被帶走）。
// has(object 或 walker)：這一個現在正在亮、正在長、正在縮或正在彈（測試查「換位置的那一幀有閃」）。count：正在亮／長／縮／閃的東西有幾個（同一個東西只算一次）。
export const BLINK = 0.15;
export const GLOW = 0.35;
export const GROW_DUR = 0.6, GROW_HOLD = 0.2;   // 長高的秒數（smoothstep，最後 25 % 帶衝過頭）；長之前先停在矮樁的秒數（30 fps 停 6 幀，看得出是從矮樁長起來）
export const GROW_PEAK = 1.04;   // 衝過頭最高幾倍（測試量它）
const GROW_FROM = 0.15, SETTLE = 0.75;   // 矮樁幾倍高；長高那段的第幾成之後才開始衝過頭
export const SHRINK_DUR = 0.2, SHRINK_TO = 0.15;   // 縮下去的秒數；縮到幾倍高（之後拿掉）
export const NOD_DUR = 0.4, NOD_DIP = 0.9, NOD_PEAK = 1.06;   // 彈一下：秒數（同 turn.js CAUSE_FLASH，節奏帳不變）；先壓到幾倍、再彈到幾倍
const NOD_DOWN = 0.35, NOD_UP = 0.7;   // 彈一下三段的分界（0 → 壓到底 → 彈到頂 → 回 1）
const smooth = k => k * k * (3 - 2 * k);
// 衝過頭的鼓包：u 0 → 1 是長高那段的最後 25 %，u²(1 − u)³ 兩端斜率都是 0（接得順、停得穩），u = 0.4 最高、除掉 0.03456 正規化成 1；
// OVER 是疊在 smoothstep 上的高度：兩者加起來最高點剛好 GROW_PEAK（數值解，約在長高那段的 0.87 處、從呼叫起 0.72 s）
const bump = u => (u * u * (1 - u) ** 3) / 0.03456, OVER = 0.08456;
// t：從呼叫起算的秒數；前 GROW_HOLD 秒停在 GROW_FROM，之後 dur 秒長上去
function growAt(t, dur) {
  if (t <= GROW_HOLD) return GROW_FROM;
  const k = Math.min(1, (t - GROW_HOLD) / dur), v = GROW_FROM + (1 - GROW_FROM) * smooth(k);
  return k > SETTLE ? v + OVER * bump((k - SETTLE) / (1 - SETTLE)) : v;
}
const easeOut = k => 1 - (1 - k) ** 2;
// k：彈一下的進度 0 → 1；三段都用 smoothstep，接點斜率 0（壓到底、彈到頂都停得穩）
function nodAt(k) {
  if (k < NOD_DOWN) return 1 - (1 - NOD_DIP) * smooth(k / NOD_DOWN);
  if (k < NOD_UP) return NOD_DIP + (NOD_PEAK - NOD_DIP) * smooth((k - NOD_DOWN) / (NOD_UP - NOD_DOWN));
  return NOD_PEAK - (NOD_PEAK - 1) * smooth((k - NOD_UP) / (1 - NOD_UP));
}
const shrinkAt = k => 1 - (1 - SHRINK_TO) * Math.min(1, k) ** 2;   // ease-in：一開始慢、越縮越快

export function createBlink(THREE, { people }) {
  const parts = new Map();     // object3d → { t, dur, saved: [[mesh, 原材質（或陣列）]], clones: Map(原材質 → 複本), onEnd }
  const active = new Set();    // 正在用的複本：巢狀的 part（父子各亮一次）跳過已經在亮的 mesh——不然會複製複本，先結束的那個換回去之後另一個再換回已 dispose 的複本
  const grows = new Map();     // object3d → { t, dur, scale: 呼叫時的 scale }
  const shrinks = new Map();   // object3d → { t, dur, scale: 呼叫時的 scale, onEnd }
  const nods = new Map();      // object3d → { t, dur, scale: 呼叫時的 scale }
  const walkers = new Map();   // walker → { t, dur }
  const WHITE = new THREE.Color(1, 1, 1), box = new THREE.Box3(), foot = new THREE.Vector3();
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

  // 零件的底（父座標的 y）：包圍盒最低點；空的就是原點
  function baseOf(object) {
    box.setFromObject(object);
    if (box.isEmpty()) return object.position.y;
    foot.set((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
    if (object.parent) { object.parent.updateWorldMatrix(true, false); object.parent.worldToLocal(foot); }
    return foot.y;
  }
  function shrink(object, dur = SHRINK_DUR, onEnd = null) {
    const g = grows.get(object); if (g) endGrow(object, g);   // 長到一半就要拿掉：從自己的高度縮
    const was = shrinks.get(object);
    if (was) { was.t = 0; was.dur = dur; if (onEnd) was.onEnd = onEnd; }
    else shrinks.set(object, { t: 0, dur, scale: object.scale.clone(), y: object.position.y, base: baseOf(object), onEnd });
    squash(object, shrinks.get(object));
  }
  // y 方向乘 k，底（base）不動：position.y 跟著往底部靠（原點就是底的零件 position 不動）
  function squash(object, it) {
    const k = shrinkAt(it.t / it.dur);
    object.scale.set(it.scale.x, it.scale.y * k, it.scale.z); object.position.y = it.base - k * (it.base - it.y);
  }
  // 先離開 shrinks 再呼叫 onEnd：onEnd 拿掉零件時會 stop 它，不會再進來一次
  function endShrink(object, it) { shrinks.delete(object); object.scale.copy(it.scale); object.position.y = it.y; it.onEnd?.(); }

  function nod(object, dur = NOD_DUR) {
    const was = nods.get(object);
    if (was) { was.t = 0; was.dur = dur; } else nods.set(object, { t: 0, dur, scale: object.scale.clone() });
    bob(object, nods.get(object));
  }
  function bob(object, it) { object.scale.set(it.scale.x, it.scale.y * nodAt(Math.min(1, it.t / it.dur)), it.scale.z); }
  function endNod(object, it) { nods.delete(object); object.scale.copy(it.scale); }

  function walker(w, dur = BLINK) {
    const was = walkers.get(w);
    if (was) { was.t = 0; was.dur = dur; return; }
    walkers.set(w, { t: 0, dur }); people.flashInstance(w, true);
  }
  function endWalker(w) { walkers.delete(w); people.flashInstance(w, false); }

  function update(dt) {
    for (const [o, it] of [...parts]) if ((it.t += dt) >= it.dur - 1e-9) endPart(o, it); else paint(it);
    for (const [o, it] of [...grows]) if ((it.t += dt) >= GROW_HOLD + it.dur - 1e-9) endGrow(o, it); else stretch(o, it);
    for (const [o, it] of [...shrinks]) if ((it.t += dt) >= it.dur - 1e-9) endShrink(o, it); else squash(o, it);
    for (const [o, it] of [...nods]) if ((it.t += dt) >= it.dur - 1e-9) endNod(o, it); else bob(o, it);
    for (const [w, it] of [...walkers]) if ((it.t += dt) >= it.dur - 1e-9) endWalker(w);
  }
  function stop(target) {
    const it = parts.get(target); if (it) endPart(target, it);
    const g = grows.get(target); if (g) endGrow(target, g);
    const sh = shrinks.get(target); if (sh) endShrink(target, sh);
    const n = nods.get(target); if (n) endNod(target, n);
    if (walkers.has(target)) endWalker(target);
  }
  function clear() {
    for (const [o, it] of [...parts]) endPart(o, it);
    for (const [o, it] of [...grows]) endGrow(o, it);
    for (const [o, it] of [...shrinks]) endShrink(o, it);
    for (const [o, it] of [...nods]) endNod(o, it);
    for (const w of [...walkers.keys()]) endWalker(w);
  }
  const has = target => parts.has(target) || grows.has(target) || shrinks.has(target) || nods.has(target) || walkers.has(target);
  return {
    part, grow, shrink, nod, walker, update, stop, clear, has,
    get count() { return new Set([...parts.keys(), ...grows.keys(), ...shrinks.keys(), ...nods.keys(), ...walkers.keys()]).size; },
  };
}
