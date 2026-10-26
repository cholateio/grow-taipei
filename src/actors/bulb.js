// 燈泡（§5.1）：一盞路燈 → 五個低格的路都有燈、夜市兩攤 → 霓虹（粉藍交錯）→ 夜市四攤＋霓虹招牌 → 全島 LED（燈光秀在 101）。
// 大停電：所有燈熄（view 拿掉發光；app 另外把全島發光歸零）。
// 劇本（§8.3）：電工從 101 工地走來裝第一盞 → 沿主路一盞盞點燈、夜市開張 → 夜市霓虹、傍晚 → 島民來排隊 → 101 腳下全島 LED、入夜。
import { anchorWorld, landmarkWorld } from './anchors.js';
import { axialToWorld, cellAt, cellTop, worldToAxial, RING_R } from '../scene/hex.js';
import { TIMES } from '../scene/daynight.js';
import { C, offset } from './palette.js';

export const id = 'bulb';
export const labelY = 0.8;
const AT = anchorWorld('bulb'), TOWER = anchorWorld('tower'), MARKET = landmarkWorld('market');
const SITE = offset(TOWER, 0.9, 1.0);     // 101 工地（電工從這裡出發；名冊入口 §13.2）：101 南側走得到的空地，和晶片的工人同一處
export const ELECTRICIAN_ENTRY = SITE;
const HOME_CELL = [0, 0], MARKET_CELL = worldToAxial(MARKET.x, MARKET.z);   // 鏡頭對的格子：路燈（中心格）、夜市
const FOOT = offset(TOWER, 0.95, 0.25);   // 101 腳下
const SQ3 = Math.sqrt(3), LAMP_R = RING_R + 0.12, APPROACH = 0.45;
export const LIGHTING_SPEED = 2.8;   // 點燈這段電工快走（一般走路 1.6；2.4 → 2.8 是節奏驗收的裁定，見規格 §12）
// 格內方位角 deg 上、離格心 r 的點（y 是格面）
function ringPoint(cell, deg, r) {
  const c = axialToWorld(...cell), a = deg * Math.PI / 180;
  return { x: c.x + Math.cos(a) * r, y: cellTop(cell), z: c.z + Math.sin(a) * r };
}

// 主路：五個低格的環路接成一圈（pointy-top：角在 30°+60°k、邊中點＝橋頭在 60°k）。
// 從中心格西橋頭出發，走中心格南半邊 → 晶片格 → 捷運格 → 球場格 → 校舍格繞外圈，回到中心格。
// 角往內收 0.05（離外側的路燈桿 0.17，不踩到；再收就會切進河濱公園、夜市的範圍）；橋頭和 island.js 的橋同一組端點。
const TOUR = [
  [[0, 0], [180, 150, 90, 30, 0]], [[1, 0], [180, 210, 270, 330, 30, 90, 120]], [[0, 1], [300, 330, 30, 90, 150, 180]],
  [[-1, 1], [0, 30, 90, 150, 210, 240]], [[-1, 0], [60, 90, 150, 210, 270, 330, 0]],
];
export const ROAD = TOUR.flatMap(([cell, degs]) => degs.map(d => ringPoint(cell, d, d % 60 ? RING_R - 0.05 : RING_R * SQ3 / 2)));

// 路燈：每個低格的 90°／210°／330° 角各一盞。燈都在路口：隔著水道的兩三盞是同一個路口，電工站在第一盞旁一站點完。
// 路口照沿主路經過的順序排；LAMP_POINTS 是攤平後的順序。
const JUNCTIONS = [
  [[[0, 0], 90], [[0, 1], 210], [[-1, 1], 330]],   // 中心格南角：三格交會
  [[[1, 0], 210], [[0, 0], 330]], [[[1, 0], 330]], [[[1, 0], 90], [[0, 1], 330]], [[[0, 1], 90]], [[[-1, 1], 90]],
  [[[-1, 0], 90], [[-1, 1], 210]],                  // 站在校舍格這側（球場格那個角被巨蛋擋在死角裡）
  [[[-1, 0], 210]], [[[-1, 0], 330], [[0, 0], 210]],
];
const LAMPS = JUNCTIONS.flat();
export const LAMP_POINTS = LAMPS.map(([cell, deg]) => ringPoint(cell, deg, LAMP_R));
// 電工點燈時站的位置：燈往格心收 0.45（在走路格裡）
export const lampApproach = i => { const [cell, deg] = LAMPS[i]; return ringPoint(cell, deg, LAMP_R - APPROACH); };
// 每一站（路口）點的燈號：[[0, 1, 2], [3, 4], [5], …]；燈頭零件 bulb.lamps.<站> 照這張表分組（大停電也一站站熄）
export const LAMP_STOPS = JUNCTIONS.map((j, k) => j.map((_, i) => JUNCTIONS.slice(0, k).flat().length + i));

const post = (x, z) => ({ kind: 'cylinder', pos: [x, 0.25, z], scale: [0.06, 0.5, 0.06], color: C.ink });
const bulbHead = (x, z, head) => ({ kind: 'sphere', pos: [x, 0.52, z], scale: 0.12, ...head });
const lamp = (x, z, head) => [post(x, z), bulbHead(x, z, head)];

export function view(lv, flags) {
  const n = lv.bulb, at = AT, v = {};
  if (!n) return v;
  const lit = !flags.blackout, head = i => {
    const c = n >= 3 ? (i % 2 ? C.neonBlue : C.neonPink) : C.yellow;
    return lit ? { color: c, glow: c } : { color: C.window };
  };
  v['bulb.main'] = { kind: 'compound', at, parts: lamp(0, 0, head(0)), footprint: { r: 0.15 } };
  v['bulb.electrician'] = { kind: 'roster', at, n: 1, accessory: 'vest', home: { kind: 'path', path: ROAD, loop: true, speed: 0.5, entry: ELECTRICIAN_ENTRY } };
  if (n >= 2) {
    // 燈桿全部一個零件（同一種材質只花一個 draw call）；燈頭每一站一個零件：Lv2 劇本一站站閃白點亮、大停電一站站熄
    v['bulb.posts'] = { kind: 'compound', at, parts: LAMP_POINTS.map(p => post(p.x - at.x, p.z - at.z)), footprint: false };
    LAMP_STOPS.forEach((g, k) => {
      const o = LAMP_POINTS[g[0]];
      v[`bulb.lamps.${k}`] = { kind: 'compound', at: o, parts: g.map(i => bulbHead(LAMP_POINTS[i].x - o.x, LAMP_POINTS[i].z - o.z, head(i + 1))), footprint: false };
    });
    const stall = (x, z, roof) => [
      { kind: 'box', pos: [x, 0.22, z], scale: [0.5, 0.45, 0.4], color: C.wall },
      { kind: 'hip', pos: [x, 0.58, z], scale: [0.62, 0.22, 0.52], color: roof },
      { kind: 'sphere', pos: [x + 0.2, 0.47, z + 0.22], scale: 0.07, ...(lit ? { color: C.warm, glow: C.warm } : { color: C.window }) },
    ];
    const market = [...stall(0, 0, C.coral), ...stall(0.6, 0.5, C.yellow)];
    if (n >= 4) market.push(...stall(-0.6, 0.5, C.navy), ...stall(0, 1.0, C.coral));   // 夜市擴大到四攤
    if (n >= 4) market.push({ kind: 'box', pos: [0.3, 0.95, 0.25], scale: [0.7, 0.18, 0.04], ...(lit ? { color: C.neonPink, glow: C.neonPink } : { color: C.window }) });
    v['bulb.market'] = { kind: 'compound', at: landmarkWorld('market'), parts: market };
  }
  return v;
}

// ── 劇本（§8.3）──
// 角色都是演到那一拍才找（回 null 那拍跳過）；once 找到第一次就記住，整段劇本同一組人。
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };
const el = ctx => () => ctx.roster.members('bulb.electrician')[0] ?? null;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 從離 p 最近的那一站開始、沿路繞一圈的站序（沒有人就從第 0 站）
function rotationFrom(p) {
  const n = LAMP_STOPS.length, near = k => dist(lampApproach(LAMP_STOPS[k][0]), p);
  const k0 = p ? LAMP_STOPS.reduce((b, _, k) => (near(k) < near(b) ? k : b), 0) : 0;
  return LAMP_STOPS.map((_, i) => (k0 + i) % n);
}
// 離夜市最近的兩個看得見的島民（每段劇本自己記一組）
const nearestPair = () => once(c => c.roster.members('landmarks.islanders').filter(m => !m.hidden).sort((a, b) => dist(a.pos, MARKET) - dist(b.pos, MARKET)).slice(0, 2));
// 第 k 站電工站的那一格
export const stopCell = k => { const p = lampApproach(LAMP_STOPS[k][0]); return worldToAxial(p.x, p.z); };
const sameCell = (a, b) => a[0] === b[0] && a[1] === b[1];
// 走向另一格那段的鏡頭：和那段走路放在同一個 together，等到他進格前 FLIGHT 秒（鏡頭飛行時間）才轉，他過橋進格時鏡頭剛好到。
// 拍開始時用同一條路線（nav.route 從他現在的位置，和 walk 同一幀算）量出進格要走多遠；cellFn 回 null（同一格）這拍跳過
const FLIGHT = 1, SAMPLE = 0.05;
function entryDistance(route, cell) {
  let s = 0;
  for (let k = 1; k < route.length; k++) {
    const a = route[k - 1], b = route[k], L = Math.hypot(b.x - a.x, b.z - a.z);
    for (let u = 0; L > 0 && u <= L; u += SAMPLE) { const c = cellAt(a.x + (b.x - a.x) * u / L, a.z + (b.z - a.z) * u / L); if (c && sameCell(c, cell)) return s + u; }
    s += L;
  }
  return 0;
}
function panAhead(B, who, to, cellFn, speed) {
  let inner = null, left = 0, d = 0;
  const fire = c => { if (inner) { const f = inner; inner = null; f.start(c); } };
  return {
    kind: 'focus', target: cellFn, dur: () => d,
    start(c) {
      inner = null; d = 0;
      const cell = cellFn(c), m = who(c); if (!cell || !m) return false;
      const v = speed * (c.montage ? 2 : 1);
      left = Math.max(0, entryDistance(c.nav.route(m.pos, to(c)), cell) / v - FLIGHT);
      inner = B.focus(cell); d = left + inner.dur;
      if (left <= 0) fire(c);
    },
    step(_k, dt, c) { left -= dt; if (left <= 0) fire(c); },
    end: fire,
  };
}
// LEVEL UP 在路燈（中心格）頭上：鏡頭不在中心格就跟 LEVEL UP 一起轉回去（levelUp 1 秒 ≥ focus 拍，不多佔時間）
const levelUpAtHome = (B, last) => B.together([B.focus(c => (last && sameCell(last(c), HOME_CELL) ? null : HOME_CELL)), B.levelUp('bulb')]);

export const script = {
  // 電工從 101 工地走到路邊 → 敲 → 閃白第一盞路燈 → 沿主路巡
  placed(e, s, ctx) {
    const { B } = ctx, m = el(ctx), k = 0.4 / dist(AT, { x: 0, z: 0 });   // 路燈往中心格格心收 0.4（中心格格心就是原點）
    return [
      B.apply(e, { only: ['bulb.electrician'], hold: ['bulb.electrician'] }), B.spawn('bulb.electrician', ELECTRICIAN_ENTRY),
      B.walk(m, offset(AT, -AT.x * k, -AT.z * k)), B.gesture(m, 'knock'), B.apply(e), B.home(m),
    ];
  },
  grow: {
    // 整條路：電工快走沿主路繞一圈，每到一個路口，上一站的燈一盞盞亮（邊走邊亮；燈桿跟第一站一起出現）→ 夜市兩攤閃白。
    // 從離他最近的那一站開始繞（他在主路上巡，人在哪就從哪開始）
    // 鏡頭（§13.1）：第一拍對著他第一站那一格；之後每走向另一格的第一站，那段走路途中轉過去（panAhead：他過橋進格時鏡頭剛好到；
    //   同一格裡的下一站不轉）。9 站跨 5 格，一圈轉 4–6 次；點完最後一站跟 LEVEL UP 一起轉回中心格
    2(e, s, ctx) {
      const { B } = ctx, m = el(ctx), n = LAMP_STOPS.length;
      // 站的順序在第一拍（鏡頭對準第一站那格）開始時才定（同回合前面的劇本演的時候他還在巡路）；之後每拍都照這個順序
      const order = once(c => rotationFrom(c.roster.members('bulb.electrician')[0]?.pos));
      const stop = i => c => order(c)[i], cell = i => c => stopCell(stop(i)(c));
      const at = i => c => lampApproach(LAMP_STOPS[stop(i)(c)][0]), go = i => B.walk(m, at(i), { speed: LIGHTING_SPEED });
      const pan = i => panAhead(B, m, at(i), c => (sameCell(cell(i)(c), cell(i - 1)(c)) ? null : cell(i)(c)), LIGHTING_SPEED);
      // 夜市兩攤、燈塔島的燈在走最後一段時跟上一站一起亮（他快到了，夜市先開張）；到了最後一站點完燈就 LEVEL UP
      const light = i => B.apply(e, { only: c => [...(i === 0 ? ['bulb.posts'] : []), `bulb.lamps.${stop(i)(c)}`, ...(i === n - 2 ? ['bulb.market', 'sat.lighthouse'] : [])] });
      return [
        B.focus(cell(0)), go(0), ...Array.from({ length: n - 1 }, (_, i) => B.together([go(i + 1), light(i), pan(i + 1)])), light(n - 1),
        B.home(m), levelUpAtHome(B, cell(n - 1)),
      ];
    },
    // 霓虹、傍晚：電工走到夜市 → ♪ → 閃白霓虹 → 天色淡入傍晚（鏡頭對著夜市格，LEVEL UP 時轉回中心格）
    3(e, s, ctx) {
      const { B } = ctx, m = el(ctx);
      return [B.focus(MARKET_CELL), B.walk(m, MARKET), B.bubble(m, '♪'), B.apply(e), B.world({ time: TIMES.dusk }), B.home(m), levelUpAtHome(B)];
    },
    // 四攤：離夜市最近的兩個島民走去排隊 → 一起 ♥ → 閃白多兩攤（鏡頭對著夜市格，LEVEL UP 時轉回中心格）
    4(e, s, ctx) {
      const { B } = ctx, pair = nearestPair(), islander = i => c => pair(c)[i] ?? null, slot = i => c => c.nav.slots(MARKET, 2, 0.7)[i];
      return [
        B.focus(MARKET_CELL), B.together([0, 1].map(i => B.walk(islander(i), slot(i)))), B.together([0, 1].map(i => B.bubble(islander(i), '♥'))),
        B.apply(e), B.home([islander(0), islander(1)]), levelUpAtHome(B),
      ];
    },
    // 全島 LED（棒球 ≥4）：電工走到 101 腳下 → ！ → 閃白全島 LED、101 燈光秀 → 入夜
    5(e, s, ctx) {
      const { B } = ctx, m = el(ctx);
      return [B.walk(m, FOOT), B.bubble(m, '！'), B.apply(e), B.world({ time: TIMES.night }), B.home(m), B.levelUp('bulb')];
    },
  },
  fx: () => null,   // 燈泡自己沒有 onLevel
  rep: (s, ctx) => ctx.roster.members('bulb.electrician').find(m => !m.hidden) ?? null,   // 等待圖框的代表：藏起來的人（躲進門裡）不算
};
