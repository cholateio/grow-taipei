// 結局判定（設計文件 §8.1–8.3；唯一正解 2026-10-31 §4.5）。修正批次 trim §C：標題、故事句的「飛彈」改「隕石」（政治風險）。真結局只有賽博（全 MAX 且老鼠分岔 cyber）；否則取表中第一個成立的壞結局。
import * as defaultSpec from './spec.js';
import { isAllMax } from './engine.js';

export const ENDINGS = {
  cyber: { id: 'cyber', title: '賽博龐克台北', kind: 'true', line: '矽盾擋下隕石，飛天跑車停上 101 屋頂' },
  // 2026-10-31：外星改成壞結局（畫面留著：變異鼠加冕＋UFO、石堆島綠光圈；標題卡那行不提母艦）。計畫 17 起壞結局也接收尾（BAD_EPILOGUES）
  alien: { id: 'alien', title: '變異鼠稱王', kind: 'bad', line: '變異老鼠戴上王冠，石堆島亮起綠光' },
  blackout: { id: 'blackout', title: '大停電', kind: 'bad', line: '全島黑掉，只剩 101 一盞紅燈在閃' },
  flood: { id: 'flood', title: '捷運淹水', kind: 'bad', line: '車站變游泳池，大家划船上班' },
  domeFlood: { id: 'domeFlood', title: '大巨蛋淹水', kind: 'bad', line: '球場變游泳池，球員坐在屋頂釣魚' },
  // 修正批次 2（2026-10-31）：颱風放下時珍奶還是攤車（計畫 14 從 ≤3 改成 ≤1；雨中放下的攤車也算）→ 攤車被吹到海邊
  cartBlown: { id: 'cartBlown', title: '珍奶攤被吹走', kind: 'bad', line: '攤車飛到海上，老闆划船去追' },
  domeRats: { id: 'domeRats', title: '大巨蛋鼠災', kind: 'bad', line: '比賽暫停，工作人員拿水桶追老鼠' },
  shieldDown: { id: 'shieldDown', title: '矽盾未就緒', kind: 'bad', line: '101 被撞成 L 形，大家躺平比讚' },
  typhoonDeflect: { id: 'typhoonDeflect', title: '颱風吹偏隕石', kind: 'bad', line: '隕石被吹進北投，變成隕石溫泉' },
  milkExpired: { id: 'milkExpired', title: '鮮奶過期', kind: 'bad', line: '整島泛黃，牛奶箱長腳跑掉了' },
  tryAgain: { id: 'tryAgain', title: '再接再厲', kind: 'neutral', line: '台北還在長大中' },
};

// 有收尾的壞結局（計畫 17，使用者 2026-11-04：壞結局不再全部停在同一張隕石圖）：終局回合在隕石之後接 epilogue 事件
// （game.js finaleEvents），劇本在 finale.js script.epilogue。清單放規則層，game.js 只讀規則層；finale.js 原樣再匯出。
// 矽盾未就緒、颱風吹偏、再接再厲沒有收尾。R47（使用者 2026-11-06：我理想中的鼠災是整島都是老鼠）：大巨蛋鼠災加進來（整島撒滿老鼠）
export const BAD_EPILOGUES = ['blackout', 'flood', 'alien', 'domeFlood', 'cartBlown', 'milkExpired', 'domeRats'];

// 隕石（trim §C：原本是飛彈，政治風險換掉；識別字 missile 沿用）：矽盾 MAX → 擋下；否則颱風放了還沒放晴（0 < lv < max：Lv1–2，暴風圈還在島上）→ 吹偏；否則命中（沒放的颱風沒有雲，不算吹偏）
export function missile(state, spec = defaultSpec) {
  if (state.lv.chip === spec.ITEMS.chip.max) return 'shield';
  const t = state.lv.typhoon;
  return t > 0 && t < spec.ITEMS.typhoon.max ? 'deflect' : 'hit';
}

export function satisfied(state, spec = defaultSpec) {
  const m = missile(state, spec), f = state.flags;
  // 具體災難排前面，颱風沒放晴（吹歪）與矽盾沒滿排最後（設計 2026-10-31 §4.5）。
  // 矽盾未就緒 = 晶片沒滿（不管隕石後來怎麼了）；被颱風吹歪時兩格圖鑑都亮
  const checks = [
    ['blackout', f.blackout], ['flood', f.flooded], ['domeFlood', f.domeFlood], ['cartBlown', f.cartBlown], ['domeRats', f.domeRats], ['alien', f.ratBranch === 'alien'],
    ['milkExpired', f.milkExpired],
    ['typhoonDeflect', m === 'deflect'], ['shieldDown', m !== 'shield'],
  ];
  return checks.filter(([, ok]) => ok).map(([id]) => id);
}

// 全 MAX 且老鼠分岔 cyber → 賽博（其餘成立的列成附註）；其他一律取第一個成立的壞結局，沒有就再接再厲。
// 全 MAX 但分岔 alien 求解器下不會發生，程式上就落到外星壞結局
export function resolve(state, spec = defaultSpec) {
  const m = missile(state, spec), sat = satisfied(state, spec);
  let id, extras;
  if (isAllMax(state, spec) && state.flags.ratBranch === 'cyber') { id = 'cyber'; extras = sat; }
  else { id = sat[0] ?? 'tryAgain'; extras = sat.slice(1); }
  return { id, title: ENDINGS[id].title, missile: m, extras };
}
