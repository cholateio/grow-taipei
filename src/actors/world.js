// 全島效果（純函數）：燈泡推動時間（物品 v2 §4.4：Lv3 傍晚、Lv5 夜晚、Lv9 賽博霓虹加亮）、大停電全島熄燈、颱風的暴風雨（§5.1、§9.2）。app 只負責套用。
// 颱風登陸那回合小人躲進室內改由颱風劇本一個個在門口藏（名冊），不再整群關掉：淹水的站務員、鼠災的工作人員
// 要在大家躲好之後出來演（Task 15 裁定）。peopleVisible 欄位留著（app 照舊讀），一律 true。
// 颱風被大巨蛋卡在 Lv2 的後續回合：雨和浪變小。
import { TIMES } from '../scene/daynight.js';

export const LINGER = 0.35;
// 燈泡 Lv9 全島賽博霓虹（物品 v2 §4.4）：全島發光材質再亮一點
export const NEON_BOOST = 1.25;

export function worldEffects(lv, flags, meta = {}) {
  const time = flags.blackout || lv.bulb >= 5 ? TIMES.night : lv.bulb >= 3 ? TIMES.dusk : TIMES.day;
  const landing = lv.typhoon === 2 && !!meta.landing, storm = lv.typhoon === 2 ? (landing ? 1 : LINGER) : 0;
  return { time, peopleVisible: true, glowScale: flags.blackout ? 0 : lv.bulb >= 9 ? NEON_BOOST : 1, storm, rain: storm };
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
