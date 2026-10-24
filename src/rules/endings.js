// 結局判定（設計文件 §8.1–8.3）。全 MAX 一定是真結局；否則取表中第一個成立的壞結局。
import * as defaultSpec from './spec.js';
import { isAllMax } from './engine.js';

export const ENDINGS = {
  cyber: { id: 'cyber', title: '賽博龐克台北', kind: 'true', line: '矽盾擋下飛彈，飛天跑車停上 101 屋頂' },
  alien: { id: 'alien', title: '外星人統治台北', kind: 'true', line: '變異老鼠戴上王冠，101 變成母艦' },
  blackout: { id: 'blackout', title: '大停電', kind: 'bad', line: '全島黑掉，只剩 101 一盞紅燈在閃' },
  flood: { id: 'flood', title: '捷運淹水', kind: 'bad', line: '車站變游泳池，大家划船上班' },
  domeRats: { id: 'domeRats', title: '大巨蛋鼠災', kind: 'bad', line: '比賽暫停，工作人員拿水桶追老鼠' },
  shieldDown: { id: 'shieldDown', title: '矽盾未就緒', kind: 'bad', line: '101 被撞成 L 形，大家躺平比讚' },
  typhoonDeflect: { id: 'typhoonDeflect', title: '颱風擋飛彈', kind: 'bad', line: '飛彈被吹進北投，變成飛彈溫泉' },
  milkExpired: { id: 'milkExpired', title: '鮮奶過期', kind: 'bad', line: '整島泛黃，牛奶箱長腳跑掉了' },
  bobaSugar: { id: 'bobaSugar', title: '珍奶糖分超標', kind: 'bad', line: '大家圓成一顆球滾來滾去' },
  tryAgain: { id: 'tryAgain', title: '再接再厲', kind: 'neutral', line: '台北還在長大中' },
};

export function missile(state, spec = defaultSpec) {
  if (state.lv.chip === spec.ITEMS.chip.max) return 'shield';
  return state.lv.typhoon === 2 ? 'deflect' : 'hit';
}

export function satisfied(state, spec = defaultSpec) {
  const m = missile(state, spec), f = state.flags;
  // 矽盾未就緒 = 晶片沒滿（不管飛彈後來怎麼了）；被颱風吹歪時標題卡是颱風，兩格圖鑑都亮
  const checks = [
    ['blackout', f.blackout], ['flood', f.flooded], ['domeRats', f.domeRats],
    ['typhoonDeflect', m === 'deflect'], ['shieldDown', m !== 'shield'],
    ['milkExpired', f.milkExpired], ['bobaSugar', f.bobaSugar],
  ];
  return checks.filter(([, ok]) => ok).map(([id]) => id);
}

export function resolve(state, spec = defaultSpec) {
  const m = missile(state, spec), sat = satisfied(state, spec);
  let id, extras;
  if (isAllMax(state, spec)) { id = state.flags.ratBranch === 'alien' ? 'alien' : 'cyber'; extras = sat; }
  else { id = sat[0] ?? 'tryAgain'; extras = sat.slice(1); }
  return { id, title: ENDINGS[id].title, missile: m, extras };
}
