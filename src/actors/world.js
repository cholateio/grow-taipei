// 全島效果（純函數）：燈泡推動時間、颱風 Lv2 小人躲進室內、大停電全島熄燈（§5.1、§9.2）。app 只負責套用。
import { TIMES } from '../scene/daynight.js';

export function worldEffects(lv, flags) {
  const time = flags.blackout || lv.bulb >= 5 ? TIMES.night : lv.bulb >= 3 ? TIMES.dusk : TIMES.day;
  return { time, peopleVisible: lv.typhoon !== 2, glowScale: flags.blackout ? 0 : 1, storm: lv.typhoon === 2 ? 1 : 0 };
}
