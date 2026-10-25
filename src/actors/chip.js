// 晶片（§5.1）：北士科工地 → 冒煙的廠房、2 個工程師走去 101 → 園區三棟玻璃盒、4 個工程師騎 YouBike → 星群總部（弧形玻璃）→ 矽盾待命（閃光在 101）。
// 老鼠 ≥2 且晶片 ≥3：其中一個工程師變成拿放大鏡的「鼠類偵防師」。
// 劇本（§8.2）：工人從 101 工地走來開工 → 工程師從廠門走去 101 → 騎 YouBike 回來 → 小學生來園區門口 → 站前接箱子送到 101 → 看見彩虹、矽盾待命。
import { anchorWorld, routeBetween } from './anchors.js';
import { builders as towerBuilders } from './tower.js';
import { C, roofColor, rebuilt, offset } from './palette.js';

export const id = 'chip';
export const labelY = 1.5;
const AT = anchorWorld('chip'), TOWER = anchorWorld('tower');
const DOOR = offset(AT, -0.3, 0.75);              // 廠門（工程師通勤的起點）
const SITE = offset(TOWER, 0.9, 0.6);             // 101 工地（工人從這裡走過來）
const FOOT = offset(TOWER, 0.95, 0.25);           // 101 腳下（通勤的終點）
const KID_GATE = offset(AT, -1.5, 0.6);           // 園區西側門口（總部那回合小學生從中心格過橋來，停在這裡）
const BRIDGE_END = offset(AT, -3.0, 0.2);         // 中心格那頭的橋口（小學生走到這裡才開始冒圖框）
const PLATFORM = offset(anchorWorld('token'), 0.9, 0.9);   // 捷運站前
const RAINBOW = offset(anchorWorld('typhoon'), 0.6, -5.2); // 彩虹（台地後面，颱風 Lv3 起）
// 工程師上下班：廠門 → 橋 → 101 腳下（開放路徑，走到底折返）
export const ENGINEER_ROUTE = routeBetween([1, 0], DOOR, [0, 0], FOOT);

export function view(lv) {
  const n = lv.chip, at = AT, v = {};
  if (!n) return v;
  const parts = [];
  if (n === 1) {
    parts.push({ kind: 'box', pos: [0, 0.05, 0], scale: [1.2, 0.1, 1.0], color: C.cliff });
    for (let i = 0; i < 8; i++) {
      const side = i >> 1, k = i % 2 ? 0.4 : -0.4, horiz = side % 2 === 0, s = side < 2 ? -0.8 : 0.8;
      parts.push({ kind: 'box', pos: horiz ? [k, 0.15, s] : [s, 0.15, k], scale: horiz ? [0.78, 0.3, 0.03] : [0.03, 0.3, 0.78], color: C.yellow });
    }
    for (const [x, z] of [[-0.95, 0.95], [-0.6, 1.0], [0.95, 0.9]]) parts.push({ kind: 'cone', pos: [x, 0.09, z], scale: [0.12, 0.18, 0.12], color: C.coral });
    v['chip.crane'] = { kind: 'crane', at, height: 1.8, offset: [0.5, 0, -0.4], footprint: { x: 0.5, z: -0.4, w: 0.6, d: 0.6 } };   // footprint 擋塔架（at + offset）
    v['chip.worker'] = { kind: 'roster', at, n: 1, accessory: 'helmet', home: { kind: 'wander', at, r: 0.9 } };
  } else if (n === 2) {
    parts.push(
      { kind: 'box', pos: [0, 0.4, -0.1], scale: [1.4, 0.8, 1.0], color: C.wall },
      { kind: 'box', pos: [0, 0.84, -0.1], scale: [1.48, 0.08, 1.08], color: roofColor(C.navy, rebuilt(lv)) },
      { kind: 'cylinder', pos: [0.45, 1.1, -0.4], scale: [0.2, 0.6, 0.2], color: C.cliff },
      { kind: 'box', pos: [-0.3, 0.2, 0.41], scale: [0.3, 0.4, 0.02], color: C.window },
    );
    v['chip.smoke'] = { kind: 'smoke', at: offset(at, 0.45, -0.4), n: 4, size: 0.14, rise: 1.0, offsetY: 1.45 };
  } else {
    if (n === 3) parts.push(
      { kind: 'box', pos: [-0.55, 0.55, -0.35], scale: [0.6, 1.1, 0.6], color: C.glass },
      { kind: 'box', pos: [0.35, 0.45, -0.45], scale: [0.9, 0.9, 0.9], color: C.glass },
      { kind: 'box', pos: [0.6, 0.65, 0.5], scale: [0.6, 1.3, 0.6], color: C.glass },
    );
    else parts.push(
      { kind: 'cylinder', pos: [0, 0.05, -0.2], scale: [2.1, 0.1, 1.6], color: C.curb },
      { kind: 'dome', pos: [0, 0.1, -0.2], scale: [2.0, 1.1, 1.5], color: C.glass },
      { kind: 'box', pos: [-1.0, 0.35, 0.45], scale: [0.4, 0.7, 0.4], color: C.glass },
      { kind: 'box', pos: [1.0, 0.45, 0.4], scale: [0.4, 0.9, 0.4], color: C.glass },
    );
    // 園區招牌：白板 + 珊瑚色字條
    parts.push({ kind: 'box', pos: [-0.5, 0.25, 0.95], scale: [0.7, 0.3, 0.05], color: C.white }, { kind: 'box', pos: [-0.5, 0.27, 0.98], scale: [0.5, 0.06, 0.02], color: C.coral });
  }
  v['chip.main'] = { kind: 'compound', at, parts };
  if (n >= 2) {
    const detective = lv.rat >= 2 && n >= 3, k = (n >= 3 ? 4 : 2) - (detective ? 1 : 0);
    v['chip.engineers'] = { kind: 'roster', at, n: k, accessory: n >= 3 ? 'bike' : 'coat', home: { kind: 'path', path: ENGINEER_ROUTE, loop: false, speed: n >= 3 ? 0.8 : 0.45 } };
    // 偵防師是從工程師裡轉過來的（原地白光換放大鏡），日常改成跟著老鼠
    if (detective) v['chip.detective'] = { kind: 'roster', at, n: 1, accessory: 'glass', from: 'chip.engineers', home: { kind: 'follow', key: 'rat.pack', dist: 0.6 } };
  }
  return { 'chip.main': v['chip.main'], ...v };
}

export const builders = { crane: towerBuilders.crane };

// ── 劇本（§8.2）──
// 角色都是演到那一拍才找（還沒出來就回 null，那拍跳過）；once 找到第一次就記住，整段劇本同一個人。
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };
const worker = ctx => () => ctx.roster.members('chip.worker')[0] ?? null;
const eng = (ctx, i) => () => ctx.roster.members('chip.engineers')[i] ?? null;
const ENGINEERS = c => c.roster.members('chip.engineers');
// 偵防師（老鼠 ≥2 且晶片 ≥3）：apply 時名冊自己用 from 把一個工程師原地換成放大鏡；這裡補一拍 ！
// （老鼠那邊的劇本在老鼠 Lv2 成立時也補這一拍，哪邊先成立哪邊演）
const detective = (ctx, s) => (s.lv.rat >= 2 ? [ctx.B.bubble(() => ctx.roster.members('chip.detective')[0] ?? null, '！', 0.8)] : []);

export const script = {
  // 工地開工：白光圍籬 → 工人從 101 工地走過來 → 繞工地
  placed(e, s, ctx) {
    const { B } = ctx, w = worker(ctx);
    return [B.apply(e, { hold: ['chip.worker'] }), B.spawn('chip.worker', SITE), B.walk(w, DOOR), B.home(w)];
  },
  grow: {
    // 廠房：工人 …… → 敲 → 白光廠房（工人收工）→ 2 個工程師從廠門走出來、走去 101
    2(e, s, ctx) {
      const { B } = ctx, w = worker(ctx), foot = i => c => c.nav.slots(FOOT, 2, 0.2)[i];
      return [
        B.bubble(w, '……'), B.gesture(w, 'knock'),
        B.apply(e, { hold: ['chip.engineers'] }),
        B.spawn('chip.engineers', DOOR), B.spawn('chip.engineers', offset(DOOR, 0.3, 0)),
        B.together([B.walk(eng(ctx, 0), foot(0)), B.walk(eng(ctx, 1), foot(1))]),
        B.home(ENGINEERS), B.levelUp('chip'),
      ];
    },
    // 園區：工程師下班回廠門 → ♪ → 白光三棟玻璃盒、換 YouBike、多兩個人（老鼠 ≥2 時一個變偵防師）
    3(e, s, ctx) {
      const { B } = ctx, door = i => c => c.nav.slots(DOOR, 2, 0.25)[i];
      return [
        B.together([B.walk(eng(ctx, 0), door(0)), B.walk(eng(ctx, 1), door(1))]),
        B.bubble(eng(ctx, 0), '♪', 0.9), B.apply(e), ...detective(ctx, s),
        B.home(ENGINEERS), B.levelUp('chip'),
      ];
    },
    // 總部（鮮奶 ≥3）：長高的小學生（離園區最近的那個）過橋走到園區西側門口，最後一段邊走邊冒圖框「晶片」→ 工程師 ♥ → 白光總部
    4(e, s, ctx) {
      const { B } = ctx, kid = once(c => (c.roster.members('milk.kids').length ? c.roster.nearest('milk.kids', KID_GATE) : c.roster.nearest('landmarks.islanders', KID_GATE)));
      return [
        B.walk(kid, BRIDGE_END), B.together([B.walk(kid, KID_GATE), B.bubble(kid, { icon: 'chip' }, 1.0)]),
        B.bubble(eng(ctx, 0), '♥', 0.9), B.apply(e), B.home(kid), B.levelUp('chip'),
      ];
    },
    // 天線（代幣 ≥3）：工程師走到站前等 → 列車進站停下，一停就敲（接箱子）→ 不等車開就送去 101 腳下 → 白光天線
    5(e, s, ctx) {
      const { B } = ctx, e0 = eng(ctx, 0);
      return [
        B.walk(e0, PLATFORM), B.trainStop({ during: [B.gesture(e0, 'knock', 0.6), B.walk(e0, FOOT)] }),
        B.apply(e), B.home(e0), B.levelUp('chip'),
      ];
    },
    // 矽盾（颱風 Lv3）：工程師走到 101 腳下 → 轉頭看彩虹 → ！ → 天線開始脈衝
    6(e, s, ctx) {
      const { B } = ctx, e0 = eng(ctx, 0);
      return [B.walk(e0, FOOT), B.gesture(e0, 'look', { at: RAINBOW }), B.bubble(e0, '！'), B.apply(e), B.home(e0), B.levelUp('chip')];
    },
  },
  fx: () => null,   // 晶片自己沒有 onLevel
  rep: (s, ctx) => ctx.roster.members('chip.engineers').find(m => !m.hidden) ?? ctx.roster.members('chip.worker').find(m => !m.hidden) ?? null,   // 等待圖框的代表：藏起來的人（躲進門裡）不算
};
