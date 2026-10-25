// 東西出現／消失處的白光：FLASH_PEAK 最亮的那一刻呼叫 onPeak（揭露或移除零件），FLASH 結束後 resolve。
import { CSS2DObject } from '../../vendor/three/addons/renderers/CSS2DRenderer.js';

export const FLASH = 0.5, FLASH_PEAK = 0.25;
const FLASH_DY = 0.3;

export function createFlash(THREE, { group }) {
  const items = [];
  const peak = it => { if (!it.peaked) { it.peaked = true; it.onPeak?.(); } };
  const drop = it => {
    items.splice(items.indexOf(it), 1); group.remove(it.obj); it.obj.element.remove(); it.resolve();
  };
  function at(p, { onPeak } = {}) {
    let resolve; const done = new Promise(r => { resolve = r; });
    const el = document.createElement('div'); el.className = 'flash';
    const obj = new CSS2DObject(el); obj.position.set(p.x, p.y + FLASH_DY, p.z); group.add(obj);
    items.push({ obj, t: 0, onPeak, peaked: false, resolve });
    return done;
  }
  function update(dt) {
    for (const it of [...items]) { it.t += dt; if (it.t >= FLASH_PEAK) peak(it); if (it.t >= FLASH) drop(it); }
  }
  // 跳過／RESET：還沒到最亮的也要先呼叫 onPeak（它要揭露的東西不能弄丟），再 resolve，等白光的拍才不會卡住
  function clear() { for (const it of [...items]) { peak(it); drop(it); } }
  return { at, update, clear, get count() { return items.length; } };
}
