// 鮮奶（§5.1）：牛奶箱 → 一層小學與 3 個小孩 → 兩層、小孩長高 1.3 倍 → 三層、升旗 → 鐘塔、棒球帽（有球場就組少棒隊）→ 大學、學士帽。
// 被老鼠咬或颱風登陸那回合：小孩躲回校舍，窗戶亮燈（下一回合照常出來；颱風賴著不走也一樣）。
// 劇本（§8.1）：島民送奶 → 小學生從校門跑出來 → 去牛奶箱喝奶長高 → 升旗 → 換棒球帽去巨蛋旁練球 → 工程師來邀、一個學生跟去園區。
import { anchorWorld } from './anchors.js';
import { C, roofColor, rebuilt, offset } from './palette.js';

export const id = 'milk';
export const labelY = 1.4;

const AT = anchorWorld('milk');
export const CRATE = offset(AT, -0.95, 0.75);         // 牛奶箱
const GATE = offset(AT, 0, 0.1);                      // 校門口（校舍正前方）
const PLAY = offset(AT, 0, 0.95);                     // 操場中心
const POLE = offset(AT, 0.75, 0.95);                  // 旗桿
const PARK = offset(anchorWorld('chip'), -0.3, 0.75); // 園區門口（工程師通勤的起點）
const league = lv => lv.milk >= 5 && lv.baseball >= 2;
// 小孩日常的中心：少棒隊在巨蛋旁的空地練球（門口留給球員和觀眾），否則在操場
const kidsCenter = lv => (league(lv) ? offset(anchorWorld('baseball'), -1.15, 0.75) : PLAY);

export function view(lv, flags, meta = {}) {
  const n = lv.milk, at = AT, v = {};
  if (!n) return v;
  v['milk.crate'] = { kind: 'compound', at: CRATE, labelY: 0.8, footprint: { r: 0.3 }, parts: [
    { kind: 'rbox', pos: [0, 0.225, 0], scale: 0.45, color: C.cream },
    { kind: 'box', pos: [0, 0.3, 0], scale: [0.47, 0.08, 0.47], color: C.blue },
  ] };
  const home = (lv.typhoon === 2 && !!meta.landing) || !!meta.bitten;
  // 一級蓋一層：Lv2 一層、Lv3 兩層、Lv4 起三層；Lv6 升格大學，校舍拉長
  const floors = n >= 4 ? 3 : n >= 3 ? 2 : n >= 2 ? 1 : 0, h = 0.2 + 0.5 * floors, w = n >= 6 ? 2.2 : 1.4;
  if (floors) {
    const win = home ? { color: C.warm, glow: C.warm } : { color: C.window };
    const parts = [
      { kind: 'box', pos: [0, h / 2, -0.45], scale: [w, h, 0.8], color: C.wall },
      { kind: 'hip', pos: [0, h + 0.2, -0.45], scale: [w + 0.1, 0.4, 0.9], color: roofColor(C.coral, rebuilt(lv)) },
      { kind: 'cylinder', pos: [0, 0.02, 0.95], scale: [1.2, 0.04, 1.2], color: C.sand },
      { kind: 'cylinder', pos: [0.75, 0.4, 0.95], scale: [0.03, 0.8, 0.03], color: C.cream },
    ];
    const cols = n >= 6 ? [-0.75, -0.45, -0.15, 0.15, 0.45, 0.75] : [-0.45, -0.15, 0.15, 0.45];
    for (let row = 0; row < floors; row++) for (const x of cols) parts.push({ kind: 'box', pos: [x, 0.38 + row * 0.5, -0.04], scale: [0.16, 0.2, 0.02], ...win, win: true });
    if (n >= 5) parts.push(
      { kind: 'box', pos: [0, h + 0.5, -0.45], scale: [0.4, 1.0, 0.4], color: C.wall },
      { kind: 'cone', pos: [0, h + 1.2, -0.45], scale: [0.5, 0.4, 0.5], color: roofColor(C.navy, rebuilt(lv)) },
      { kind: 'sphere', pos: [0, h + 0.75, -0.24], scale: [0.2, 0.2, 0.04], color: C.yellow, glow: C.yellow },
    );
    // footprint 只擋校舍（含屋簷），操場和旗桿可以走
    v['milk.main'] = { kind: 'compound', at, parts, labelY: n >= 5 ? h + 1.6 : h + 0.6, footprint: { x: 0, z: -0.45, w: w + 0.1, d: 0.9 } };
  }
  // 旗子自己一個零件：Lv4 劇本讓它沿著旗桿升上去（scale.y 0→1，以地面為基準）
  if (n >= 4) v['milk.flag'] = { kind: 'compound', at, footprint: false, parts: [{ kind: 'box', pos: [0.86, 0.72, 0.95], scale: [0.2, 0.13, 0.02], color: C.coral, flag: true }] };
  // 大學校門：兩根柱子 + 半圈拱（拱門可以穿過去）
  if (n >= 6) v['milk.gate'] = { kind: 'compound', at, footprint: false, parts: [
    { kind: 'box', pos: [0.95, 0.35, 0.2], scale: [0.1, 0.7, 0.1], color: C.wall },
    { kind: 'box', pos: [1.55, 0.35, 0.2], scale: [0.1, 0.7, 0.1], color: C.wall },
    { kind: 'torus', pos: [1.25, 0.7, 0.2], scale: 0.62, color: C.wall },
  ] };
  if (n >= 2 && !home) v['milk.kids'] = {
    kind: 'roster', at, n: 3, shirt: C.yellow, accessory: n >= 6 ? 'mortar' : n >= 5 ? 'cap' : 'none', scale: n >= 3 ? 1.3 : 1,
    home: { kind: 'wander', at: kidsCenter(lv), r: league(lv) ? 0.4 : 0.5 },
  };
  return v;
}

// ── 劇本（§8.1）──
// 角色都是演到那一拍才找（小孩可能還沒出來、或躲在校舍裡 → 回空值，那拍跳過）；找到第一次就記住，整段劇本同一個人。
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };
const kid = (ctx, i) => () => ctx.roster.members('milk.kids')[i] ?? null;
const KIDS = [0, 1, 2];
// 從校門口放一個小學生出來；小孩這時躲在校舍裡（老鼠 ≥2、颱風登陸）就沒有名冊可放，這拍跳過
function spawnKid(ctx) {
  const beat = ctx.B.spawn('milk.kids', GATE), start = beat.start;
  beat.start = c => (view(c.stage.lv, c.stage.flags, c.stage.meta)['milk.kids'] ? start(c) : false);
  return beat;
}

export const script = {
  // 最近的島民把牛奶箱送來
  placed(e, s, ctx) {
    const { B } = ctx, islander = once(c => c.roster.nearest('landmarks.islanders', CRATE));
    return [B.walk(islander, offset(CRATE, 0.5, 0.1)), B.gesture(islander, 'look', { at: CRATE }), B.apply(e), B.bubble(islander, '♥'), B.home(islander)];
  },
  grow: {
    // 一層小學：校舍白光，3 個小學生一個接一個從校門口跑出來到操場
    2(e, s, ctx) {
      const { B } = ctx, spot = i => c => c.nav.slots(PLAY, 3, 0.45)[i];
      const run = i => B.walk(kid(ctx, i), spot(i));
      return [
        B.apply(e, { hold: ['milk.kids'] }),
        spawnKid(ctx), B.together([run(0), spawnKid(ctx)]), B.together([run(1), spawnKid(ctx)]), run(2),
        B.gesture(kid(ctx, 0), 'jump'), B.home(c => c.roster.members('milk.kids')), B.levelUp('milk'),
      ];
    },
    // 長高：一起去牛奶箱喝奶、各 ♥ → 白光變高 1.3、校舍加一層 → 跑回操場
    3(e, s, ctx) {
      const { B } = ctx;
      return [
        B.together(KIDS.map(i => B.walk(kid(ctx, i), c => c.nav.slots(CRATE, 3, 0.55)[i]))),
        B.together(KIDS.map(i => B.bubble(kid(ctx, i), '♥', 1))),
        B.apply(e),
        B.together(KIDS.map(i => B.walk(kid(ctx, i), c => c.nav.slots(PLAY, 3, 0.45)[i]))),
        B.home(c => c.roster.members('milk.kids')), B.levelUp('milk'),
      ];
    },
    // 升旗：一個小學生走到旗桿 → ！ → 旗子沿旗桿升上去 → 校舍白光加層
    4(e, s, ctx) {
      const { B } = ctx, k0 = kid(ctx, 0);
      return [
        B.walk(k0, offset(POLE, -0.2, 0.15)), B.bubble(k0, '！'),
        B.apply(e, { only: ['milk.flag'], flash: false }),
        B.together([B.scaleIn('milk.flag', { axis: 'y', dur: 1.5 }), B.gesture(k0, 'look', { at: POLE })]),
        B.gesture(k0, 'wave'), B.apply(e), B.home(k0), B.levelUp('milk'),
      ];
    },
    // 鐘塔、少棒：白光換棒球帽 → 一起走到巨蛋旁空地 → 球員 ♪ → 鐘塔白光
    5(e, s, ctx) {
      const { B } = ctx, centre = kidsCenter(s.lv), player = () => ctx.roster.members('baseball.players')?.[0] ?? null;
      return [
        B.apply(e, { only: ['milk.kids'] }), B.wait(0.6),
        B.together(KIDS.map(i => B.walk(kid(ctx, i), c => c.nav.slots(centre, 3, 0.4)[i]))),
        B.together(KIDS.map(i => B.gesture(kid(ctx, i), 'jump'))),
        B.bubble(player, '♪'), B.apply(e), B.home(c => c.roster.members('milk.kids')), B.levelUp('milk'),
      ];
    },
    // 大學：一個工程師從園區走到校門口 → …… → 圖框「學士帽」→ 白光：拱門、校舍拉長、學士帽 → 一個學生跟工程師走回園區
    6(e, s, ctx) {
      const { B } = ctx, k0 = kid(ctx, 0);
      const engineer = once(c => c.roster.members('chip.engineers')?.[0] ?? c.roster.nearest('landmarks.islanders', GATE));
      return [
        B.walk(engineer, offset(GATE, 0.35, 0.25)), B.bubble(engineer, '……'), B.bubble(engineer, { icon: 'mortar' }),
        B.apply(e),
        // 兩人出發走回園區的同時，鮮奶頭上 LEVEL UP（不然要等他們橫越全島才標）
        B.together([B.walk(engineer, PARK), B.walk(k0, offset(PARK, 0.3, 0.1)), B.levelUp('milk')]),
        B.home([engineer, k0]),
      ];
    },
  },
  fx: () => null,   // 鮮奶自己沒有 onLevel
  rep: (s, ctx) => ctx.roster.members('milk.kids')[0] ?? null,
};
