// 結局判定（設計文件 §8.1–8.3；唯一正解 2026-10-31 §4.5）。真結局只有賽博（全 MAX 且老鼠分岔 cyber）；否則取表中第一個成立的壞結局。
import * as defaultSpec from './spec.js';
import { isAllMax } from './engine.js';

export const ENDINGS = {
  cyber: { id: 'cyber', title: '賽博龐克台北', kind: 'true', line: '矽盾擋下飛彈，飛天跑車停上 101 屋頂' },
  // 2026-10-31：外星改成壞結局（畫面留著：變異鼠加冕＋UFO，不演母艦尾聲）
  alien: { id: 'alien', title: '變異鼠稱王', kind: 'bad', line: '變異老鼠戴上王冠，101 變成母艦' },
  blackout: { id: 'blackout', title: '大停電', kind: 'bad', line: '全島黑掉，只剩 101 一盞紅燈在閃' },
  flood: { id: 'flood', title: '捷運淹水', kind: 'bad', line: '車站變游泳池，大家划船上班' },
  domeFlood: { id: 'domeFlood', title: '大巨蛋淹水', kind: 'bad', line: '球場變游泳池，球員坐在屋頂釣魚' },
  domeRats: { id: 'domeRats', title: '大巨蛋鼠災', kind: 'bad', line: '比賽暫停，工作人員拿水桶追老鼠' },
  shieldDown: { id: 'shieldDown', title: '矽盾未就緒', kind: 'bad', line: '101 被撞成 L 形，大家躺平比讚' },
  typhoonDeflect: { id: 'typhoonDeflect', title: '颱風擋飛彈', kind: 'bad', line: '飛彈被吹進北投，變成飛彈溫泉' },
  milkExpired: { id: 'milkExpired', title: '鮮奶過期', kind: 'bad', line: '整島泛黃，牛奶箱長腳跑掉了' },
  bobaSugar: { id: 'bobaSugar', title: '珍奶糖分超標', kind: 'bad', line: '大家圓成一顆球滾來滾去' },
  tryAgain: { id: 'tryAgain', title: '再接再厲', kind: 'neutral', line: '台北還在長大中' },
};

// 矽盾 MAX → 擋下；否則颱風還沒放晴（< 4，雲還在島上）→ 吹歪；否則命中
export function missile(state, spec = defaultSpec) {
  if (state.lv.chip === spec.ITEMS.chip.max) return 'shield';
  return state.lv.typhoon < spec.ITEMS.typhoon.max ? 'deflect' : 'hit';
}

export function satisfied(state, spec = defaultSpec) {
  const m = missile(state, spec), f = state.flags;
  // 具體災難排前面，颱風沒放晴（吹歪）與矽盾沒滿排最後（設計 2026-10-31 §4.5）。
  // 矽盾未就緒 = 晶片沒滿（不管飛彈後來怎麼了）；被颱風吹歪時兩格圖鑑都亮
  const checks = [
    ['blackout', f.blackout], ['flood', f.flooded], ['domeFlood', f.domeFlood], ['domeRats', f.domeRats], ['alien', f.ratBranch === 'alien'],
    ['milkExpired', f.milkExpired], ['bobaSugar', f.bobaSugar],
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
