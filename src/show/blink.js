// 閃白（§13.2，取代平面白光）：東西出現、消失、換裝時，它自己變白 BLINK 秒再回原色。
//   part(object3d, dur, onEnd?)：底下每個 mesh 的材質換成同一個白色 MeshBasicMaterial，時間到換回原材質（再呼叫 onEnd）；
//   walker(w, dur)：小人是 InstancedMesh 的一個實例，改用 people.flashInstance 把整個實例塗白、時間到重塗原色。
// 閃到一半再閃同一個東西：計時重來，原材質不會被白色蓋掉。clear()：全部立刻回原樣（跳過、RESET），不留白色材質。
// stop(object 或 walker)：只把這一個立刻收掉（要拿掉、放回模型池的東西先換回原材質，白色材質才不會被 dispose 或帶走）。
export const BLINK = 0.15;

export function createBlink(THREE, { people }) {
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const parts = new Map();     // object3d → { t, dur, saved: [[mesh, 原材質]], onEnd }
  const walkers = new Map();   // walker → { t, dur }

  function part(object, dur = BLINK, onEnd = null) {
    const was = parts.get(object);
    if (was) { was.t = 0; was.dur = dur; if (onEnd) was.onEnd = onEnd; return; }
    const saved = [];
    object.traverse(o => { if (o.isMesh && o.material !== white) { saved.push([o, o.material]); o.material = white; } });
    parts.set(object, { t: 0, dur, saved, onEnd });
  }
  function endPart(object, it) {
    parts.delete(object);
    for (const [mesh, material] of it.saved) mesh.material = material;
    it.onEnd?.();
  }

  function walker(w, dur = BLINK) {
    const was = walkers.get(w);
    if (was) { was.t = 0; was.dur = dur; return; }
    walkers.set(w, { t: 0, dur }); people.flashInstance(w, true);
  }
  function endWalker(w) { walkers.delete(w); people.flashInstance(w, false); }

  function update(dt) {
    for (const [o, it] of [...parts]) if ((it.t += dt) >= it.dur - 1e-9) endPart(o, it);
    for (const [w, it] of [...walkers]) if ((it.t += dt) >= it.dur - 1e-9) endWalker(w);
  }
  function stop(target) {
    const it = parts.get(target); if (it) endPart(target, it);
    if (walkers.has(target)) endWalker(target);
  }
  function clear() {
    for (const [o, it] of [...parts]) endPart(o, it);
    for (const w of [...walkers.keys()]) endWalker(w);
  }
  return { part, walker, update, stop, clear, get count() { return parts.size + walkers.size; } };
}
