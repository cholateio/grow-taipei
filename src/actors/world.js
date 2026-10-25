// 全島效果（純函數）：燈泡推動時間、颱風登陸那回合小人躲進室內、大停電全島熄燈（§5.1、§9.2）。app 只負責套用。
// 颱風被大巨蛋卡在 Lv2 的後續回合：人回來、雨和浪變小（錄影審查 2026-10-25：不然半場遊戲的角色都消失）。
import { TIMES } from '../scene/daynight.js';

export const LINGER = 0.35;

export function worldEffects(lv, flags, meta = {}) {
  const time = flags.blackout || lv.bulb >= 5 ? TIMES.night : lv.bulb >= 3 ? TIMES.dusk : TIMES.day;
  const landing = lv.typhoon === 2 && !!meta.landing, storm = lv.typhoon === 2 ? (landing ? 1 : LINGER) : 0;
  return { time, peopleVisible: !landing, glowScale: flags.blackout ? 0 : 1, storm, rain: storm };
}

// 每幀把目前的全島效果往目標趨近（約 1 秒到 98%），接近就貼齊；小人躲／出來是事件當下的事，直接切。
const RATE = 4, SNAP = { time: 0.5, glowScale: 0.01, storm: 0.01, rain: 0.01 };
export function stepWorld(cur, target, dt) {
  const k = 1 - Math.exp(-RATE * dt);
  let same = cur.peopleVisible === target.peopleVisible;
  const next = { ...target };
  for (const f in SNAP) {
    const v = cur[f] + (target[f] - cur[f]) * k;
    next[f] = Math.abs(target[f] - v) < SNAP[f] ? target[f] : v;
    if (cur[f] !== target[f]) same = false;
  }
  return same ? cur : next;
}
