// 棒球（物品 v2 §4.8，max 8）：沙地 → 木看台（Kenney Racing Kit grandStand ×2）與兩個傳接球的球員
//   → ◆ 大巨蛋（Kenney Space Kit hangar_roundA，要趕在捷運通車到離島前）→ 比賽開打（頂縫透光、觀眾 3 人）
//   → 演唱會（藍色應援棒、圓頂飾條發光、觀眾 4 人＋草皮 1 人）→ 跨年煙火（珍奶的觀光客 2 人來看）
//   → 大巨蛋擴建（hangar_roundB 更高的圓頂、外牆 LED 帶、觀眾 5 人）→ ◆ 巨蛋捷運站直通（環狀線上一座月台接到巨蛋門口，兩個觀眾從列車下來）。
// 人數預算（使用者 2026-10-26；裁決 R13 一格 ≤ 8 人：球員 2＋草皮 1＋觀眾 ≤ 5，老鼠與鼠災工作人員不算）：觀眾 Lv4 3、Lv5 4、Lv7 5；
// 跨年來看煙火的觀光客 ≤ 2。
// 大巨蛋鼠災：兩個戴安全帽的工作人員追著老鼠跑。
// 劇本（§6）：一級 3–5 秒；◆ Lv3、Lv8 6–10 秒、最後回全景定格。
import { anchorWorld, frontOf } from './anchors.js';
import { cellAt } from '../scene/hex.js';
import { TRACK } from './token.js';
import { C, offset } from './palette.js';

export const id = 'baseball';
export const labelY = 1.3;
const SHIRTS = [C.coral, C.blue, 0xf2b5c6, 0x8db86f, C.yellow, C.white, C.navy, 0xe8b04a];

// 四個壘包（本壘在前、一壘在右）：島民放置時照這個順序跑一圈，白線一段段跟著出現
const BASES = [[0, 0.5], [0.5, 0], [0, -0.5], [-0.5, 0]];
// 木看台：兩座 grandStand 並排，寬 1.2（原程式版 1.4）、footprint 只比看台寬 0.05：西端外擴 PAD 後才不蓋到球場格西北的橋頭（電工主路 ROAD 經過）
const STANDS_W = 1.2, STANDS = { x: 0, z: -1.33, w: STANDS_W + 0.05, d: 0.6 };
export const MODELS = {
  stand: { path: 'kenney/racing/grandStand.glb', size: [1, 0.9, 1] },
  domeA: { path: 'kenney/space/hangar_roundA.glb', size: [3.27, 1.5, 2.83] },
  domeB: { path: 'kenney/space/hangar_roundB.glb', size: [3.27, 1.8, 2.83] },
};
const STAND_H = STANDS_W / 2 * MODELS.stand.size[1] / MODELS.stand.size[0];   // 一座寬 0.6
const STAND_TINT = { '^grey$': C.wood, '^_defaultMat$': C.cream, '^red$': C.coral, '^road$': C.ink, '^glass$': C.glass };
// 大巨蛋：A 高 1.0（底 2.18 × 1.89）、擴建後的 B 高 1.2（同一個底、圓頂高 1.2 倍）——footprint 一樣是 2.3 × 1.9 的橢圓（含底座），
// 門前的球員、觀眾、門口都在外面
export const DOME_H = { a: 1.0, b: 1.2 };
const DOME_FP = { rx: 1.15, rz: 0.95 };
const DOME_TINT = { '^metal$': C.cream, '^metalDark$': C.curb, '^metalRed$': C.coral, '^dark$': C.white };   // 圓頂白、飾條珊瑚
// 兩壘之間的白線（相對 at）
function line([x0, z0], [x1, z1]) {
  const dx = x1 - x0, dz = z1 - z0;
  return { kind: 'box', pos: [(x0 + x1) / 2, 0.035, (z0 + z1) / 2], scale: [0.03, 0.01, Math.hypot(dx, dz)], rot: [0, Math.atan2(dx, dz), 0], color: C.white };
}
// 兩個球員在本壘前面面對面傳接球
const players = at => [{ ...offset(at, -0.45, 1.05), yaw: Math.PI / 2 }, { ...offset(at, 0.45, 1.05), yaw: -Math.PI / 2 }];

// 入口點（§13.2）：球員從看台後方的格邊走出來，繞過看台到本壘前——看台正後方的格子北角被看台和兩邊的格邊圍住、走不出去，
// 所以用看台後方東側的格邊（往中心格的橋頭）。觀眾從捷運站前（月台）走來，四個點沿 x 錯開、往站那側（−x）偏
const AT = anchorWorld('baseball');
export const PLAYER_ENTRY = [offset(AT, 0.95, -1.45), offset(AT, 1.15, -1.6)];
const PLATFORM = offset(anchorWorld('token'), 0.9, 0.9);   // 捷運站前：觀眾下車的地方
export const CROWD_ENTRY = [0, 1, 2, 3].map(k => offset(PLATFORM, (k - 2.7) * 0.25, 0.15));
// 比賽開打的三個觀眾從往捷運站那座橋的球場格橋頭走來（剛下車、過橋）：離他們的站位 ≥ 1.85（§6 一級 3–5 秒，從站前走過來要 4 秒）
export const BRIDGE_IN = [0, 1, 2].map(k => offset(AT, 1.95, 0.05 + 0.25 * k));
// 巨蛋東北邊的草皮（散步的觀眾）：在外擴 PAD 後的巨蛋橢圓外（約 1.5 倍）、離門口弧線最東的觀眾 1.5；
// 演唱會的應援棒（巨蛋外一圈、沒有 footprint）都在散步圈外 ≥ 0.18，人不會停在棒子上
export const LAWN = offset(AT, 1.7, -0.7), LAWN_R = 0.6;
// 演唱會的藍色應援棒：巨蛋外一圈 8 根（相對 at）
export const STICKS = Array.from({ length: 8 }, (_, i) => { const a = i / 8 * Math.PI * 2; return [Math.cos(a) * 1.3, Math.sin(a) * 1.1]; });

// 觀眾站在巨蛋門前的弧線上（半徑 1.75）：六個位置，正中間留一條走道給球員。人少的時候從靠走道的兩個開始往外補
// （同一批人加人不換位置）：3 人 = 走道兩側＋西邊一個、4 人左右對稱、5 人再補西端（東端那個位置留空）
function arc(at, n) {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1) - 0.5, a = t * 1.7 + Math.sign(t) * 0.25, r = 1.75, x = Math.sin(a) * r, z = Math.cos(a) * r;
    return { ...offset(at, x, z), yaw: Math.atan2(-x, -z) };
  });
}
const ARC = arc(AT, 6), ORDER = [2, 3, 1, 4, 0, 5];
export const crowdN = n => (n >= 7 ? 5 : n >= 5 ? 4 : n >= 4 ? 3 : 0);
// 第 i 個觀眾的站位（i 依加入的順序）
export const fanSpots = n => ORDER.slice(0, n).map(k => ARC[k]);

// ── 巨蛋捷運站（Lv8）：環狀線往巨蛋門口方位（徑向）的那一點停車；一座高架月台從軌道邊接到球場格西南的格邊，
// 再一條磚道接到門口。觀眾從列車下來（月台靠軌道那頭）、沿月台走上岸、走到門口 ──
const GATE = offset(AT, 0, 1.1);
export const DOME_STOP = Math.atan2(GATE.z, GATE.x);
const U = { x: Math.cos(DOME_STOP), z: Math.sin(DOME_STOP) };
const ringAt = (r, side = 0, y = 0) => ({ x: U.x * r - U.z * side, y, z: U.z * r + U.x * side });
// 月台外緣（DECK_OUT + 0.1）離車廂側面 ≥ 0.1：最寬的車廂（Kenney 地鐵、高鐵，高 CAR_H 0.42，載入器量的包圍盒）半寬約 0.18
// （2026-10-28 列車加大之後月台往島那側收 0.05：原本 −0.35 時只剩 0.07）
const DECK_IN = 6.75, DECK_OUT = TRACK.radius - 0.4, DECK_Y = AT.y - 0.06;
// 下車的地方：月台靠軌道那頭，兩個人並排
export const RIDE_OFF = [-0.1, 0.1].map(s => ringAt(DECK_OUT - 0.12, s, DECK_Y + 0.03));
// 直通之後兩個觀眾坐新線來：Lv8 門口留走道兩側和西邊三個人，Lv7 的另外兩個走回捷運站，空出來的兩個位置給從月台下車的人。
// 下車的人先走到門口正前方（球員兩側之外、弧線之內）停下歡呼，那兩個觀眾等他們到了、全景定格之後才走（不像同一批人交叉換位）
export const RIDER_SPOTS = ORDER.slice(3, 5).map(k => ARC[k]);
export const RIDER_WAIT = [-0.2, 0.2].map(x => offset(AT, x, 1.45));
function platformParts() {
  const at = ringAt((DECK_IN + DECK_OUT) / 2), len = DECK_OUT - DECK_IN + 0.2, ry = Math.atan2(U.x, U.z), rel = p => [p.x - at.x, p.y, p.z - at.z];
  const yaw = { rot: [0, ry, 0] };
  return { at: { x: at.x, y: 0, z: at.z }, parts: [
    { kind: 'box', pos: rel(ringAt((DECK_IN + DECK_OUT) / 2, 0, DECK_Y)), scale: [0.55, 0.06, len], ...yaw, color: C.curb },
    { kind: 'box', pos: rel(ringAt((DECK_IN + DECK_OUT) / 2, 0.28, DECK_Y + 0.05)), scale: [0.02, 0.1, len], ...yaw, color: C.yellow },   // 月台邊的黃線（靠走道那側）
    ...[DECK_IN + 0.3, DECK_OUT - 0.3].map(r => ({ kind: 'cylinder', pos: rel(ringAt(r, 0, (DECK_Y - 0.25) / 2)), scale: [0.1, DECK_Y + 0.25, 0.1], color: C.curb })),   // 橋墩
    // 軌道那頭的雨棚：兩根柱子、一片屋頂、站名牌
    ...[-0.22, 0.22].map(s => ({ kind: 'cylinder', pos: rel(ringAt(DECK_OUT - 0.1, s, DECK_Y + 0.3)), scale: [0.04, 0.6, 0.04], color: C.cream })),
    { kind: 'box', pos: rel(ringAt(DECK_OUT - 0.1, 0, DECK_Y + 0.62)), scale: [0.62, 0.04, 0.4], ...yaw, color: C.navy },
    { kind: 'box', pos: rel(ringAt(DECK_OUT - 0.1, 0, DECK_Y + 0.72)), scale: [0.4, 0.12, 0.03], ...yaw, color: C.blue },
    // 岸上：月台頭接到巨蛋門口的磚道（走得到、沒有 footprint）
    ...(() => {
      const a = ringAt(DECK_IN - 0.1, 0, AT.y), b = GATE, L = Math.hypot(b.x - a.x, b.z - a.z);
      return [{ kind: 'box', pos: [(a.x + b.x) / 2 - at.x, AT.y + 0.008, (a.z + b.z) / 2 - at.z], scale: [0.4, 0.016, L], rot: [0, Math.atan2(b.x - a.x, b.z - a.z), 0], color: C.sand }];
    })(),
  ] };
}

export function view(lv, flags = {}) {
  const n = lv.baseball, at = AT, v = {};
  if (!n) return v;
  if (n <= 2) {
    // 沙地（Lv1）＋木看台（Lv2，兩座 glb）
    const parts = [{ kind: 'cylinder', pos: [0, 0.015, 0], scale: [2.0, 0.03, 2.0], color: C.sand }];
    for (const [x, z] of BASES) parts.push({ kind: 'box', pos: [x, 0.04, z], scale: [0.1, 0.03, 0.1], color: C.white });
    for (let i = 0; i < 6; i++) { const a = Math.PI * (0.75 + i * 0.1); parts.push({ kind: 'box', pos: [Math.cos(a) * 1.05, 0.1, Math.sin(a) * 1.05], scale: [0.04, 0.2, 0.36], rot: [0, -a, 0], color: C.wood }); }
    v['baseball.main'] = { kind: 'compound', at, footprint: false, parts };
    for (let i = 0; i < 4; i++) v[`baseball.lines.${i}`] = { kind: 'compound', at, footprint: false, parts: [line(BASES[i], BASES[(i + 1) % 4])] };
    if (n === 2) v['baseball.stands'] = { kind: 'stands', at: offset(at, STANDS.x, STANDS.z), footprint: { w: STANDS.w, d: STANDS.d },
      models: [-1, 1].map(k => ({ path: MODELS.stand.path, pos: [k * STANDS_W / 4, 0, 0], h: STAND_H, tint: STAND_TINT })) };
  } else {
    // 大巨蛋（glb）
    const big = n >= 7, m = big ? MODELS.domeB : MODELS.domeA, h = big ? DOME_H.b : DOME_H.a;
    v['baseball.main'] = { kind: 'glb', at, path: m.path, h, tint: DOME_TINT, labelY: h + 0.35, footprint: DOME_FP };
    // 底座、門口、頂縫透光（Lv4 暖黃；演唱會起跟應援棒、LED 帶同一個霓虹藍——一種發光色一個 draw call，整局截圖 ≤ 150）、
    // 應援棒（Lv5）、外牆 LED 帶（Lv7）：一個零件
    const deco = [
      { kind: 'cylinder', pos: [0, 0.03, 0], scale: [2.3, 0.06, 1.9], color: C.curb },
      { kind: 'box', pos: [0, 0.22, 0.93], scale: [0.36, 0.3, 0.05], color: C.window },
    ];
    const neon = { color: C.neonBlue, glow: C.neonBlue };
    if (n >= 4) deco.push({ kind: 'box', pos: [0, h - 0.01, 0], scale: [1.2, 0.03, 0.1], ...(n >= 5 ? neon : { color: C.yellow, glow: C.yellow }) });
    if (n >= 5) for (const [x, z] of STICKS) deco.push({ kind: 'box', pos: [x, 0.2, z], scale: [0.06, 0.3, 0.06], ...neon });
    if (big) deco.push({ kind: 'rail', pos: [0, h * 0.42, 0], scale: [2.2, 1.9, 2.2], rot: [Math.PI / 2, 0, 0], ...neon, led: true });
    v['baseball.deco'] = { kind: 'compound', at, footprint: false, parts: deco };
  }
  // 球員：Lv1 一個（放置時從看台後方的格邊進場跑壘，之後站在本壘前），Lv2 起兩個傳接球
  v['baseball.players'] = { kind: 'roster', at, n: n >= 2 ? 2 : 1, accessory: 'cap', shirt: [C.white, C.navy], home: { kind: 'stand', spots: players(at), rescue: true, entry: PLAYER_ENTRY } };
  if (n >= 2) {
    v['baseball.ball'] = { kind: 'ball', at, from: [-0.4, 1.05], to: [0.4, 1.05], footprint: false };
    // 觀眾：Lv8 兩個是坐新線來的（baseball.riders），門口的名冊留前三個人
    const fans = n >= 8 ? 3 : crowdN(n);
    if (fans) v['baseball.crowd'] = { kind: 'roster', at, n: fans, shirt: SHIRTS, home: { kind: 'stand', spots: fanSpots(fans), fidget: 'jump', rescue: true, entry: CROWD_ENTRY } };
    if (n >= 8) v['baseball.riders'] = { kind: 'roster', at, n: 2, shirt: SHIRTS.slice(5), home: { kind: 'stand', spots: RIDER_SPOTS, fidget: 'jump', rescue: true, entry: CROWD_ENTRY } };
    // 演唱會起多一個觀眾在巨蛋東北邊的草皮散步（§14.3）；從月台走來
    if (n >= 5) v['baseball.lawn'] = { kind: 'roster', at: LAWN, n: 1, shirt: SHIRTS.slice(4), home: { kind: 'wander', at: LAWN, r: LAWN_R, entry: CROWD_ENTRY } };
  }
  // 跨年煙火：巨蛋上空循環放
  if (n >= 6) v['baseball.fireworks'] = { kind: 'fireworks', at: offset(at, 0, 0, 4), colors: [C.neonPink, C.neonBlue, C.yellow, C.coral], footprint: false, low: false };
  if (n >= 8) { const p = platformParts(); v['baseball.platform'] = { kind: 'compound', at: p.at, footprint: false, parts: p.parts }; }
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
  // 木看台：兩座 glb 併成一個零件（位置相對零件的 at），一起閃白
  stands(THREE, spec, ctx) {
    const object = new THREE.Group();
    const subs = spec.models.map(m => { const p = ctx.build({ kind: 'glb', at: { x: m.pos[0], y: m.pos[1], z: m.pos[2] }, path: m.path, h: m.h, ry: m.ry ?? 0, tint: m.tint }); object.add(p.object); return p; });
    return { object, dispose() { for (const p of subs) p.dispose(); } };
  },
};

// ── 劇本（§8.8）──
// 角色都是演到那一拍才找（還沒出來就回 null，那拍跳過）；once 找到第一次就記住，整段劇本同一個人。
// 蓋東西站的鏡頭側距離（§14）：巨蛋橢圓外擴 PAD 後 1.27 × 1.07，鏡頭方向 1.6 站在底座外、門前球員的東邊（跟原本站的巨蛋正前方一樣遠）
export const FRONT_R = 1.6;
const BASE_AT = BASES.map(([x, z]) => offset(AT, x, z));
const RUN_SPEED = 0.7;   // 島民沿壘包慢慢走一圈（約 4 s）
const TOURIST_SPEED = 2.8;   // 跨年：珍奶的觀光客快步過來看煙火（一般走路 1.6；同燈泡點燈的快走 2.8，一級 3–5 秒）
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const nearestIslander = (c, p) => c.roster.members('landmarks.islanders').filter(m => !m.hidden && cellAt(m.pos.x, m.pos.z)).sort((a, b) => dist(a.pos, p) - dist(b.pos, p))[0] ?? null;
// 冒泡泡的人跳過藏起來的（颱風登陸回合躲進門裡的人）
const shown = key => c => c.roster.members(key).filter(m => !m.hidden);
const player = i => c => shown('baseball.players')(c)[i] ?? null;
const fansAll = c => [...shown('baseball.crowd')(c), ...shown('baseball.riders')(c), ...shown('baseball.lawn')(c)];
const fan = i => c => fansAll(c)[i] ?? null;
const ALL_FANS = 6;   // 觀眾最多 5 人＋草皮 1 人
const cheer = (B, dur = 0.9) => B.together(Array.from({ length: ALL_FANS }, (_, i) => B.bubble(fan(i), '♪', dur)));
// 列車在巨蛋站最多趕這麼久進站（車頭剛開過不到四分之一圈就倒車回來）、停多久
const STOP_WITHIN = 2.0, STOP_BACK = Math.PI / 2, STOP_FOR = 0.6;

export const script = {
  // 閃白沙地 → 第一個球員從看台後方的格邊（入口）進場、走到本壘 → 沿一壘、二壘、三壘繞回本壘，每走一段那段白線就閃白出現 → 站到本壘前。
  // 人數預算（裁決 R16）：球場格不住島民，從別格過橋走來要 3–4 秒（一級 3–5 秒放不下），所以跑壘的是球場自己的球員
  placed(e, s, ctx) {
    const { B } = ctx, sp = B.spawn('baseball.players', PLAYER_ENTRY[0]), m = () => sp.member;
    return [
      B.apply(e, { only: ['baseball.main', 'baseball.players'], hold: ['baseball.players'] }), sp, B.walk(m, BASE_AT[0]),
      ...BASE_AT.map((_, i) => B.together([B.walk(m, BASE_AT[(i + 1) % 4], { speed: RUN_SPEED }), B.apply(e, { only: [`baseball.lines.${i}`] })])),
      B.home(m),
    ];
  },
  grow: {
    // 看台、球員：閃白木看台 → 第二個球員從看台後方（入口）出來、繞過看台走到本壘前（第一個放置時就在了）→ 閃白球（傳接球）
    2(e, s, ctx) {
      const { B } = ctx, spots = players(AT);
      const sp = B.spawn('baseball.players', PLAYER_ENTRY[1]);
      return [
        B.apply(e, { only: ['baseball.stands', 'baseball.players'], hold: ['baseball.players'] }), sp,
        B.walk(() => sp.member, spots[1]), B.apply(e),
        B.home(c => c.roster.members('baseball.players')), B.levelUp('baseball'),
      ];
    },
    // ◆ 大巨蛋：球員 …… → 圖框「巨蛋」→ 離巨蛋鏡頭側最近的球員走過去 → 揮鋤頭 ×2 → 閃白巨蛋 → 回全景定格 → LEVEL UP
    // （人數預算，裁決 R16：球場格不住島民，從別格過橋找人來蓋要多 3–4 秒；沒有球員才找島民）
    3(e, s, ctx) {
      const { B } = ctx, front = c => frontOf(AT, FRONT_R, c.nav);
      const w = once(c => shown('baseball.players')(c).sort((a, b) => dist(a.pos, front(c)) - dist(b.pos, front(c)))[0] ?? nearestIslander(c, front(c)));
      return [
        // 裁決 R17 ◆ ≤ 8 s：泡泡 0.8／0.9 → 0.6／0.7、鋤頭 1.2 → 0.9、全景停 1.4 → 1.0
        B.bubble(player(0), '……', 0.6), B.bubble(player(0), { icon: 'dome' }, 0.7),
        B.walk(w, front), B.gesture(w, 'build', 0.9, { at: AT }), B.gesture(w, 'build', 0.9, { at: AT }), B.apply(e), B.home(w),
        B.focus('home', { hold: 1.0 }), B.levelUp('baseball'),
      ];
    },
    // 開打：三個觀眾從捷運站那座橋的橋頭走來（剛下車）→ 走到門口 → 閃白頂縫透光、一起 ♪
    4(e, s, ctx) {
      const { B } = ctx, spots = fanSpots(3);
      const sp = BRIDGE_IN.map(p => B.spawn('baseball.crowd', c => c.nav.nearestWalkable(p)));
      return [
        B.apply(e, { only: ['baseball.crowd'], hold: ['baseball.crowd'] }), ...sp,
        B.together(sp.map((b, i) => B.walk(() => b.member, spots[i], { delay: i * 0.2 }))),
        B.together([B.apply(e), ...[0, 1, 2].map(i => B.bubble(fan(i), '♪', 0.6))]),   // 頂縫閃白的同時 ♪（裁決 R15）
        B.home(shown('baseball.crowd')), B.levelUp('baseball'),
      ];
    },
    // 演唱會：離門口最近的觀眾走到門口 → 敲 → 閃白應援棒、圓頂飾條發藍光（多的觀眾從月台入口走來）→ 觀眾一起 ♪
    5(e, s, ctx) {
      const { B } = ctx, f = once(c => shown('baseball.crowd')(c).sort((a, b) => dist(a.pos, GATE) - dist(b.pos, GATE))[0] ?? nearestIslander(c, GATE));
      return [B.walk(f, GATE), B.gesture(f, 'knock', 0.8), B.apply(e), cheer(B), B.home(f), B.levelUp('baseball')];
    },
    // 煙火：珍奶排隊的觀光客裡離巨蛋最近的兩個快步走到巨蛋門口 → 煙火 → 在場的球員、觀眾、觀光客全部 ♪ → 觀光客走回人龍
    // 鏡頭（§13.1）：先對著珍奶人龍（珍奶格），他們出發就轉到巨蛋格
    6(e, s, ctx) {
      const { B } = ctx, n = 2;   // 人數預算：觀光客 ≤ 2
      const tourists = once(c => shown('boba.queue')(c).sort((a, b) => dist(a.pos, GATE) - dist(b.pos, GATE)).slice(0, n));
      const tourist = i => c => tourists(c)[i] ?? null, slot = i => c => c.nav.slots(GATE, n, 1.2)[i];
      const everyone = c => [...shown('baseball.players')(c), ...fansAll(c), ...tourists(c)];
      return [
        B.focus('boba'), B.together([B.focus('baseball'), ...Array.from({ length: n }, (_, i) => B.walk(tourist(i), slot(i), { speed: TOURIST_SPEED }))]),
        // 煙火閃白的同時大家 ♪（裁決 R15 一級 ≤ 4.5 s）
        B.together([B.apply(e), ...Array.from({ length: 2 + ALL_FANS + n }, (_, i) => B.bubble(c => everyone(c)[i] ?? null, '♪', 0.6))]),
        B.home(tourists), B.levelUp('baseball'),
      ];
    },
    // 擴建：球員 ！ → 閃白更高的圓頂與 LED 帶（多的兩個觀眾從月台入口走來）→ 觀眾 ♪ → LEVEL UP
    7(e, s, ctx) {
      const { B } = ctx;
      return [B.bubble(player(0), '！', 0.8), B.apply(e), cheer(B), B.levelUp('baseball')];
    },
    // ◆ 巨蛋捷運站直通（代幣 ≥8）：鏡頭對著巨蛋格 → 月台閃白出現 → 列車進巨蛋站停下，兩個觀眾從列車下來 →
    //   沿月台、磚道走到門口正前方 → 回全景定格、大家 ♪ → 這時 Lv7 的兩個觀眾才走回捷運站（套用觀眾 5 → 3），
    //   下車的兩個人在背景走到他們空出來的位置 → LEVEL UP
    8(e, s, ctx) {
      const { B } = ctx, sp = RIDE_OFF.map(p => B.spawn('baseball.riders', p));
      return [
        B.focus('baseball'),
        B.apply(e, { only: ['baseball.platform', 'baseball.riders'], hold: ['baseball.riders'] }),
        B.trainStop({ at: DOME_STOP, arrive: STOP_WITHIN, back: STOP_BACK, stop: STOP_FOR, during: sp }),
        B.together(sp.map((b, i) => B.walk(() => b.member, RIDER_WAIT[i], { delay: i * 0.2 }))),
        B.together([B.focus('home', { hold: 1.0 }), cheer(B, 1.0)]),
        B.apply(e), B.home(shown('baseball.riders')), B.levelUp('baseball'),
      ];
    },
  },
  fx: () => null,   // 大巨蛋鼠災是颱風的劇本（domeRats）
  rep: (s, ctx) => ctx.roster.members('baseball.players').find(m => !m.hidden) ?? null,   // 等待圖框的代表：藏起來的人（躲進門裡）不算
};
// ◆ 關鍵節點（裁決 R11）：跳級的第二級落在這兩級，也演完整劇本（turn.js）
script.grow[3].key = script.grow[8].key = true;
