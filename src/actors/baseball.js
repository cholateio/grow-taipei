// 棒球（§5.1）：沙地 → 木看台與兩個傳接球的球員 → 大巨蛋 → 比賽開打（頂縫透光、觀眾 4 人）→ 演唱會（藍色應援棒、觀眾 6 人）→ 跨年煙火。
// 大巨蛋鼠災：兩個戴安全帽的工作人員追著老鼠跑。
import { anchorWorld } from './anchors.js';
import { C, offset } from './palette.js';

export const id = 'baseball';
export const labelY = 1.3;
const SHIRTS = [C.coral, C.blue, 0xf2b5c6, 0x8db86f, C.yellow, C.white, C.navy, 0xe8b04a];

// 四個壘包（本壘在前、一壘在右）：島民放置時照這個順序跑一圈，白線一段段跟著出現
const BASES = [[0, 0.5], [0.5, 0], [0, -0.5], [-0.5, 0]];
const STANDS = { x: 0, z: -1.33, w: 1.5, d: 0.6 };
// 兩壘之間的白線（相對 at）
function line([x0, z0], [x1, z1]) {
  const dx = x1 - x0, dz = z1 - z0;
  return { kind: 'box', pos: [(x0 + x1) / 2, 0.035, (z0 + z1) / 2], scale: [0.03, 0.01, Math.hypot(dx, dz)], rot: [0, Math.atan2(dx, dz), 0], color: C.white };
}
// 兩個球員在本壘前面面對面傳接球
const players = at => [{ ...offset(at, -0.45, 1.05), yaw: Math.PI / 2 }, { ...offset(at, 0.45, 1.05), yaw: -Math.PI / 2 }];

// 觀眾站在巨蛋門前的弧線上，正中間留一條走道給球員；人數少一點，不然和小孩、老鼠擠成一團
function fans(at, n) {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1) - 0.5, a = t * 1.7 + Math.sign(t) * 0.25, r = 1.75, x = Math.sin(a) * r, z = Math.cos(a) * r;
    return { ...offset(at, x, z), yaw: Math.atan2(-x, -z) };
  });
}

export function view(lv, flags) {
  const n = lv.baseball, at = anchorWorld('baseball'), v = {};
  if (!n) return v;
  const parts = [];
  if (n <= 2) {
    // 沙地（Lv1）→ 加木看台（Lv2）
    parts.push({ kind: 'cylinder', pos: [0, 0.015, 0], scale: [2.0, 0.03, 2.0], color: C.sand });
    for (const [x, z] of BASES) parts.push({ kind: 'box', pos: [x, 0.04, z], scale: [0.1, 0.03, 0.1], color: C.white });
    for (let i = 0; i < 6; i++) { const a = Math.PI * (0.75 + i * 0.1); parts.push({ kind: 'box', pos: [Math.cos(a) * 1.05, 0.1, Math.sin(a) * 1.05], scale: [0.04, 0.2, 0.36], rot: [0, -a, 0], color: C.wood }); }
    if (n === 2) for (let r = 0; r < 3; r++) parts.push({ kind: 'box', pos: [0, 0.08 + r * 0.12, -1.15 - r * 0.18], scale: [1.4, 0.16 + r * 0.12, 0.18], color: C.wood, stand: true });
  } else {
    parts.push(
      { kind: 'cylinder', pos: [0, 0.06, 0], scale: [2.3, 0.12, 1.9], color: C.curb },
      { kind: 'dome', pos: [0, 0.12, 0], scale: [2.2, 1.2, 1.8], color: C.cream, ...(n >= 5 ? { glow: 0x9fe8ff } : {}) },
      { kind: 'box', pos: [0, 0.25, 0.86], scale: [0.32, 0.26, 0.06], color: C.window },
    );
    if (n >= 4) parts.push({ kind: 'box', pos: [0, 0.72, 0], scale: [1.2, 0.04, 0.12], color: C.yellow, glow: C.yellow });
    if (n >= 5) for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; parts.push({ kind: 'box', pos: [Math.cos(a) * 1.3, 0.2, Math.sin(a) * 1.1], scale: [0.06, 0.3, 0.06], color: C.neonBlue, glow: C.neonBlue }); }
  }
  if (n <= 2) for (let i = 0; i < 4; i++) v[`baseball.lines.${i}`] = { kind: 'compound', at, footprint: false, parts: [line(BASES[i], BASES[(i + 1) % 4])] };
  if (n >= 2) {
    v['baseball.players'] = { kind: 'roster', at, n: 2, accessory: 'cap', shirt: [C.white, C.navy], home: { kind: 'stand', spots: players(at), rescue: true } };
    v['baseball.ball'] = { kind: 'ball', at, from: [-0.4, 1.05], to: [0.4, 1.05], footprint: false };
    if (n >= 4) { const k = n >= 5 ? 6 : 4; v['baseball.crowd'] = { kind: 'roster', at, n: k, shirt: SHIRTS, home: { kind: 'stand', spots: fans(at, k), fidget: 'jump', rescue: true } }; }
  }
  // 跨年煙火：巨蛋上空循環放
  if (n >= 6) v['baseball.fireworks'] = { kind: 'fireworks', at: offset(at, 0, 0, 4), colors: [C.neonPink, C.neonBlue, C.yellow, C.coral], footprint: false };
  // footprint：沙地可以走（島民跑壘），Lv2 只擋木看台；巨蛋擋住整個圓頂（含底座），門前的球員、觀眾、門口都在外面
  v['baseball.main'] = { kind: 'compound', at, parts, footprint: n === 1 ? false : n === 2 ? STANDS : { w: 2.3, d: 1.9 } };
  // 鼠災的工作人員：名冊，日常跟在最近的老鼠旁邊；颱風的劇本從巨蛋門口放他們出來
  if (flags.domeRats) v['baseball.staff'] = { kind: 'roster', at: offset(at, 0, 1.1), n: 2, accessory: 'helmet', home: { kind: 'follow', key: 'rat.pack', dist: 0.6 } };
  // 鍵的順序：main 先（標籤掛在 main）
  return { 'baseball.main': v['baseball.main'], ...v };
}

export const builders = {
  // 傳接球：兩個球員之間來回的拋物線，單程 0.6 秒
  ball(THREE, spec, ctx) {
    const part = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, shadow: false, parts: [{ kind: 'sphere', pos: [0, 0, 0], scale: 0.06, color: C.white }] });
    const object = new THREE.Group(), ball = part.object; object.add(ball);
    const [ax, az] = spec.from, [bx, bz] = spec.to;
    return {
      object,
      update(dt, t) {
        const leg = Math.floor(t / 0.6), s = t / 0.6 - leg, [x0, z0, x1, z1] = leg % 2 ? [bx, bz, ax, az] : [ax, az, bx, bz];
        ball.position.set(x0 + (x1 - x0) * s, 0.25 + Math.sin(Math.PI * s) * 0.5, z0 + (z1 - z0) * s);
      },
      dispose: part.dispose,
    };
  },
};

// ── 劇本（§8.8）──
// 角色都是演到那一拍才找（還沒出來就回 null，那拍跳過）；once 找到第一次就記住，整段劇本同一個人。
const AT = anchorWorld('baseball'), GATE = offset(AT, 0, 1.1), DOME_EDGE = offset(AT, 0, 1.6);
const PLATFORM = offset(anchorWorld('token'), 0.9, 0.9);   // 捷運站前：觀眾下車的地方
const BASE_AT = BASES.map(([x, z]) => offset(AT, x, z));
const RUN_SPEED = 0.7;   // 島民沿壘包慢慢走一圈（約 4 s）
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const nearestIslander = (c, p) => c.roster.members('landmarks.islanders').filter(m => !m.hidden).sort((a, b) => dist(a.pos, p) - dist(b.pos, p))[0] ?? null;
// 某名冊第一個沒藏起來的人；沒有就找離 p 最近的島民
const helper = (key, p) => once(c => c.roster.members(key).find(m => !m.hidden) ?? nearestIslander(c, p));
// 冒泡泡的人跳過藏起來的（颱風登陸回合躲進門裡的人）
const shown = key => c => c.roster.members(key).filter(m => !m.hidden);
const player = i => c => shown('baseball.players')(c)[i] ?? null;
const fan = i => c => shown('baseball.crowd')(c)[i] ?? null;
const ALL_FANS = 6;

export const script = {
  // 白光沙地 → 最近的島民走到本壘 → 沿一壘、二壘、三壘繞回本壘，每走一段那段白線就白光出現
  placed(e, s, ctx) {
    const { B } = ctx, m = once(c => nearestIslander(c, BASE_AT[0]));
    return [
      B.apply(e, { only: ['baseball.main'] }), B.walk(m, BASE_AT[0]),
      ...BASE_AT.map((_, i) => B.together([B.walk(m, BASE_AT[(i + 1) % 4], { speed: RUN_SPEED }), B.apply(e, { only: [`baseball.lines.${i}`] })])),
      B.home(m),
    ];
  },
  grow: {
    // 看台、球員：白光木看台 → 2 個球員從看台前排出來、走到本壘前 → 白光球（傳接球）
    2(e, s, ctx) {
      const { B } = ctx, spots = players(AT);
      const sp = [-0.3, 0.3].map(x => B.spawn('baseball.players', offset(AT, x, -0.95)));
      return [
        B.apply(e, { only: ['baseball.main', 'baseball.players'], hold: ['baseball.players'] }), ...sp,
        B.together(sp.map((b, i) => B.walk(() => b.member, spots[i]))), B.apply(e),
        B.home(c => c.roster.members('baseball.players')), B.levelUp('baseball'),
      ];
    },
    // 大巨蛋：球員 …… → 圖框「巨蛋」→ 101 工地的工人（沒有就島民）走到巨蛋前 → 敲 ×2 → 白光巨蛋 → 走回
    3(e, s, ctx) {
      const { B } = ctx, w = helper('chip.worker', DOME_EDGE);
      return [
        B.bubble(player(0), '……'), B.bubble(player(0), { icon: 'dome' }),
        B.walk(w, DOME_EDGE), B.gesture(w, 'knock'), B.gesture(w, 'knock'), B.apply(e), B.home(w), B.levelUp('baseball'),
      ];
    },
    // 開打：列車進站停 → 4 個觀眾在站前一個個下車 → 一起走到巨蛋門口 → 一起 ♪ → 白光頂縫透光
    4(e, s, ctx) {
      const { B } = ctx, spots = fans(AT, 4);
      const sp = [0, 1, 2, 3].map(k => B.spawn('baseball.crowd', c => c.nav.nearestWalkable(offset(PLATFORM, (k - 1.5) * 0.25, 0))));
      return [
        B.apply(e, { only: ['baseball.crowd'], hold: ['baseball.crowd'] }),
        B.trainStop({ during: [...sp, B.together(sp.map((b, i) => B.walk(() => b.member, spots[i])))] }),
        B.together([0, 1, 2, 3].map(i => B.bubble(fan(i), '♪'))), B.apply(e),
        B.home(c => c.roster.members('baseball.crowd')), B.levelUp('baseball'),
      ];
    },
    // 演唱會：電工（沒有就島民）走到巨蛋門口 → 敲 → 白光應援棒、觀眾補到 6 → 觀眾一起 ♪
    5(e, s, ctx) {
      const { B } = ctx, el = helper('bulb.electrician', GATE);
      return [
        B.walk(el, GATE), B.gesture(el, 'knock'), B.apply(e),
        B.together(Array.from({ length: ALL_FANS }, (_, i) => B.bubble(fan(i), '♪'))), B.home(el), B.levelUp('baseball'),
      ];
    },
    // 煙火：珍奶的觀光客人龍一起走到巨蛋門口 → 煙火 → 在場的球員、觀眾、觀光客全部 ♪ → 觀光客走回人龍
    6(e, s, ctx) {
      const { B } = ctx, tourists = once(c => c.roster.members('boba.queue').filter(m => !m.hidden));
      const n = 10;   // 人龍最多 10 人（珍奶 Lv3 + 鮮奶 ≥2）；沒那麼多人的拍跳過
      const tourist = i => c => tourists(c)[i] ?? null, slot = i => c => c.nav.slots(GATE, tourists(c).length, 1.2)[i];
      const everyone = c => [...shown('baseball.players')(c), ...shown('baseball.crowd')(c), ...tourists(c)];
      return [
        B.together(Array.from({ length: n }, (_, i) => B.walk(tourist(i), slot(i)))), B.apply(e),
        B.together(Array.from({ length: 2 + ALL_FANS + n }, (_, i) => B.bubble(c => everyone(c)[i] ?? null, '♪'))),
        B.home(tourists), B.levelUp('baseball'),
      ];
    },
  },
  fx: () => null,   // 大巨蛋鼠災是颱風的劇本（domeRats）
  rep: (s, ctx) => ctx.roster.members('baseball.players').find(m => !m.hidden) ?? null,   // 等待圖框的代表：藏起來的人（躲進門裡）不算
};
