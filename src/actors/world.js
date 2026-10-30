// 全島效果（純函數）：燈泡推動時間（物品 v2 §4.4：Lv3 傍晚、Lv5 夜晚、Lv9 賽博霓虹加亮）、大停電全島熄燈、颱風的暴風雨（§5.1、§9.2）。app 只負責套用。
// 颱風放下那回合（meta.landing）小人躲進室內改由颱風劇本一個個在門口藏（名冊），不再整群關掉：淹水的站務員、鼠災的工作人員
// 要在大家躲好之後出來演（Task 15 裁定）。peopleVisible 欄位留著（app 照舊讀），一律 true。
// 颱風 Lv1–3（101、車站、巨蛋上空，唯一正解 §5.1）都在下雨：放下那回合大雨，之後移站的回合雨和浪變小（LINGER），Lv4 放晴。
import { TIMES } from '../scene/daynight.js';

export const LINGER = 0.35;
// 燈泡 Lv9 全島賽博霓虹（物品 v2 §4.4）：全島發光材質再亮一點
export const NEON_BOOST = 1.25;
// 颱風還在島上（Lv1–3：雨、機車、風車搖、船收起來）；satellites、boba 共用
export const stormy = lv => lv.typhoon >= 1 && lv.typhoon <= 3;

export function worldEffects(lv, flags, meta = {}) {
  const time = flags.blackout || lv.bulb >= 5 ? TIMES.night : lv.bulb >= 3 ? TIMES.dusk : TIMES.day;
  const storm = stormy(lv) ? (meta.landing ? 1 : LINGER) : 0;
  // 全島心情（最終章 §6、§8）：飛彈命中全島躺平比讚，外星尾聲全島長第三隻眼；app 交給 people.setMood
  const mood = flags.missile === 'hit' ? 'lie' : flags.epilogue === 'alien' ? 'alien' : 'normal';
  return { time, peopleVisible: true, glowScale: flags.blackout ? 0 : lv.bulb >= 9 ? NEON_BOOST : 1, storm, rain: storm, mood };
}

// 每幀把目前的全島效果往目標趨近（約 1 秒到 98%），接近就貼齊；小人躲／出來、心情（mood）是事件當下的事，直接切
// （非數值欄位由 { ...target } 原樣帶過；same 也要比 mood，不然只換心情的那一幀會被當成沒變而丟掉）。
const RATE = 4, SNAP = { time: 0.5, glowScale: 0.01, storm: 0.01, rain: 0.01 };
export function stepWorld(cur, target, dt) {
  const k = 1 - Math.exp(-RATE * dt);
  let same = cur.peopleVisible === target.peopleVisible && cur.mood === target.mood;
  const next = { ...target };
  for (const f in SNAP) {
    const v = cur[f] + (target[f] - cur[f]) * k;
    next[f] = Math.abs(target[f] - v) < SNAP[f] ? target[f] : v;
    if (cur[f] !== target[f]) same = false;
  }
  return same ? cur : next;
}
