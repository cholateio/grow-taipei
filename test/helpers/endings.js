// 固定的壞結局局（最終章計畫 5 任務 8，設計 §10）：pace 的「命中／吹偏 終局」列、npm run shot 的 hit／deflect 截圖用同一局。
// EXAMPLE.hit／deflect：求解器枚舉（src/solver/run.js enumerate，深度優先、spec.ORDER 的順序）裡第一個放完 8 個＋CLOSING_TURNS
// 輪最後一輪之後 resolve().missile 為 hit／deflect 的放置順序——寫成字面值，test/endings.test.js 重算一次、不一樣就失敗（規則改了要跟著換）。
// finaleStep(state)：照 game.js 的 pick() 合成終局回合的事件（警告、隕石、真結局與有收尾的壞結局再接收尾），也回結局本身
import * as spec from '../../src/rules/spec.js';
import { resolve } from '../../src/rules/endings.js';
import { finaleEvents } from '../../src/game.js';

export const EXAMPLE = {
  hit: ['milk', 'chip', 'bulb', 'token', 'typhoon', 'rat', 'boba', 'baseball'],       // 結局 flood（2026-10-31 唯一正解重找）
  deflect: ['milk', 'chip', 'bulb', 'token', 'rat', 'boba', 'baseball', 'typhoon'],   // 結局 flood（修正批次 2 颱風三級重找；颱風第 8 個放，最後一輪 Lv2 暴風圈還在）
  // 計畫 17：有收尾的六個壞結局各一局——枚舉裡第一個 resolve().id 是它的順序（括號是隕石結果）
  blackout: ['milk', 'chip', 'bulb', 'typhoon', 'token', 'rat', 'boba', 'baseball'],    // hit
  flood: ['milk', 'chip', 'bulb', 'token', 'typhoon', 'rat', 'boba', 'baseball'],       // hit（同 EXAMPLE.hit）
  alien: ['milk', 'chip', 'bulb', 'token', 'baseball', 'boba', 'rat', 'typhoon'],       // deflect（老鼠 Lv4 外星分岔）
  domeFlood: ['milk', 'chip', 'typhoon', 'rat', 'baseball', 'bulb', 'token', 'boba'],   // hit
  cartBlown: ['milk', 'chip', 'bulb', 'baseball', 'token', 'rat', 'typhoon', 'boba'],   // hit
  milkExpired: ['milk', 'typhoon', 'chip', 'rat', 'bulb', 'token', 'boba', 'baseball'], // hit
};

export function finaleStep(state) {
  const ending = resolve(state, spec);
  return { events: finaleEvents(ending), ending };
}
