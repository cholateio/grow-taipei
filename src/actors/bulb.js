// 燈泡（物品 v2 §4.4，max 9）：一盞路燈 → 五個低格的路都有燈、夜市兩攤 → 霓虹（粉藍交錯）、傍晚 → 夜市四攤＋霓虹招牌
//   → 全島 LED（燈光秀在 101）、夜晚 → 變電所（儲能櫃、變壓器嗡嗡亮）→ ★◆ 離岸風電啟動（電工搭列車到風車島按開關：風車轉、燈塔亮）
//   → ★ 海底電纜（晶片的 chip.cable 鋪好；晶片 Lv6 才通電發光）→ ◆ 全島賽博霓虹（橋面、懸浮月台、夜市與車站的招牌發光）。
// 風車與燈塔是衛星島的零件（satellites.js 看燈泡 ≥7）；電纜是晶片的零件（chip.js 看燈泡 ≥8）——燈泡的劇本用 apply 的 only 叫它們出來。
// 大停電：所有燈熄（view 拿掉發光；app 另外把全島發光歸零）。
// 電工：Lv1–6 沿主路巡；Lv7 搭車去風車島開了風電，之後就住在風車島上（繞風機腳下的小圈，衛星島的 wander），Lv8 在島上接電纜。
// 劇本（§6）：一級 3–5 秒；Lv2 點燈繞全島一圈是燈泡保留的長旅程（§6「保留一兩段最好看的」）；◆ Lv7、Lv9 6–10 秒、回全景定格。
import { anchorWorld, landmarkWorld, frontOf } from './anchors.js';
import { axialToWorld, cellAt, cellTop, worldToAxial, RING_R, MAIN_CELLS, adjacentPairs, edgeMidpoint, SATELLITES, TOP } from '../scene/hex.js';
import { bridgeDecks } from '../scene/bridge.js';
import { TIMES } from '../scene/daynight.js';
import { BLINK } from '../show/blink.js';
import { STATION_A, SPUR_BRAKE } from '../show/beats.js';
import { DECK_AT } from './token.js';
import { C, offset } from './palette.js';

export const id = 'bulb';
export const labelY = 0.8;
const AT = anchorWorld('bulb'), TOWER = anchorWorld('tower'), MARKET = landmarkWorld('market');
// 夜市前（第一攤西邊、捷運站那側的空地）：Lv4 島民排隊站這裡。攤子之間、東攤與格子東角之間的空隙外擴 PAD 後是走不進去的死角，
// 不用「夜市中心附近的可走點」（會挑到死角裡、走不到）
const MARKET_FRONT = offset(MARKET, -0.6, 0);
const SITE = offset(TOWER, 0.9, 1.0);     // 101 工地（電工從這裡出發；名冊入口 §13.2）：101 南側走得到的空地，和晶片的工人同一處
export const ELECTRICIAN_ENTRY = SITE;
const STATION = anchorWorld('token');
const HOME_CELL = [0, 0], MARKET_CELL = worldToAxial(MARKET.x, MARKET.z), TOKEN_CELL = worldToAxial(STATION.x, STATION.z);   // 鏡頭對的格子：路燈（中心格）、夜市、捷運站
const ISLAND_ZOOM = 0.8;   // 鏡頭到衛星島拉近 0.8（島和支線都要進畫面，同代幣 Lv7）
const QUEUE_SPEED = 2.4;   // Lv4 島民快步去夜市排隊（一般走路 1.6；一級 3–5 秒）
const FOOT = offset(TOWER, 0.95, 0.25);   // 101 腳下
const SQ3 = Math.sqrt(3), LAMP_R = RING_R + 0.12, APPROACH = 0.45;
export const ISLAND_LV = 7;   // 離岸風電啟動那一級起，電工住在風車島上
export const LIGHTING_SPEED = 2.8;   // 點燈這段電工快走（一般走路 1.6；2.4 → 2.8 是節奏驗收的裁定，見規格 §12）
export const WALKED = 3;   // Lv2 電工走過去親手點的站數；其餘的站回全景後一站站自己亮
// 格內方位角 deg 上、離格心 r 的點（y 是格面）
function ringPoint(cell, deg, r) {
  const c = axialToWorld(...cell), a = deg * Math.PI / 180;
  return { x: c.x + Math.cos(a) * r, y: cellTop(cell), z: c.z + Math.sin(a) * r };
}

// 主路：五個低格的環路接成一圈（pointy-top：角在 30°+60°k、邊中點＝橋頭在 60°k）。
// 從中心格西橋頭出發，走中心格南半邊 → 晶片格 → 捷運格 → 球場格 → 校舍格繞外圈，回到中心格。
// 角往內收 0.05（離外側的路燈桿 0.17，不踩到；再收就會切進河濱公園、夜市的範圍）；橋頭和 island.js 的橋同一組端點。
// 例外 [角度, 半徑]：捷運格 30° 角往外放到 RING_R + 0.05（那個角沒有路燈）——330° → 30° 那一段夾在夜市東攤和噴泉（珍奶 Lv3，外擴後半徑 0.92）
// 東邊，角照常內收的話會擦進噴泉外擴 PAD 的範圍
const TOUR = [
  [[0, 0], [180, 150, 90, 30, 0]], [[1, 0], [180, 210, 270, 330, 30, 90, 120]], [[0, 1], [300, 330, [30, RING_R + 0.05], 90, 150, 180]],
  [[-1, 1], [0, 30, 90, 150, 210, 240]], [[-1, 0], [60, 90, 150, 210, 270, 330, 0]],
];
export const ROAD = TOUR.flatMap(([cell, degs]) => degs.map(d => (Array.isArray(d) ? ringPoint(cell, ...d) : ringPoint(cell, d, d % 60 ? RING_R - 0.05 : RING_R * SQ3 / 2))));

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

// 夜市的攤子 [x, z, 屋頂色]（相對夜市地標）：Lv2 兩攤、Lv4 擴大到四攤。東西兩攤在 ±0.5：
// 東攤的攤身外擴 PAD 後到 x +0.87，離電工主路（捷運格東邊 330°–30° 那一段，x +0.91）還有 0.04
const STALL_W = 0.5, STALL_D = 0.4;
const marketStalls = n => [[0, 0, C.coral], [0.5, 0.5, C.yellow], ...(n >= 4 ? [[-0.5, 0.5, C.navy], [0, 1.0, C.coral]] : [])];
// 夜市的 footprint：每一攤的攤身（不是整個包圍盒：攤子外圍、東側主路那一條都是走得到的地）；四攤圍成一圈時中間的小空地
// 外擴 PAD 後是走不出去的死角（站位被救到裡面就困住了），一起擋掉
const marketFootprint = n => [...marketStalls(n).map(([x, z]) => ({ x, z, w: STALL_W, d: STALL_D })), ...(n >= 4 ? [{ x: 0, z: 0.5, w: 0.5, d: 0.6 }] : [])];

const post = (x, z) => ({ kind: 'cylinder', pos: [x, 0.25, z], scale: [0.06, 0.5, 0.06], color: C.ink });
const bulbHead = (x, z, head) => ({ kind: 'sphere', pos: [x, 0.52, z], scale: 0.12, ...head });
const lamp = (x, z, head) => [post(x, z), bulbHead(x, z, head)];

// ── 變電所（Lv6）：中心格西北、101 西邊的空地（電工主路在中心格南半邊，離這裡遠；101 外擴後和它之間留一條走道）。
// 水泥台上兩座儲能櫃（白櫃、前面一條指示燈）＋一座變壓器（深藍箱、三根礙子），通電時指示燈與礙子亮淡藍（嗡嗡亮）；四角矮圍籬 ──
const SUB = { w: 0.8, d: 0.5 };
const CENTRE = axialToWorld(0, 0);
export const SUBSTATION = { x: CENTRE.x - 1.15, y: cellTop([0, 0]), z: CENTRE.z - 0.85 };
export const SUBSTATION_FRONT = offset(SUBSTATION, 0, 0.6);   // 電工蓋變電所站的位置（台子的鏡頭側，外擴後的 footprint 外）
function substationParts(lit) {
  const glow = lit ? { color: C.neonBlue, glow: C.neonBlue } : { color: C.window };
  return [
    { kind: 'box', pos: [0, 0.02, 0], scale: [SUB.w, 0.04, SUB.d], color: C.curb },
    ...[-0.27, -0.07].flatMap(x => [
      { kind: 'box', pos: [x, 0.2, -0.03], scale: [0.16, 0.32, 0.3], color: C.white },
      { kind: 'box', pos: [x, 0.3, 0.125], scale: [0.1, 0.03, 0.012], ...glow },
    ]),
    { kind: 'box', pos: [0.22, 0.17, 0], scale: [0.26, 0.26, 0.26], color: C.navy },
    ...[-0.08, 0, 0.08].map(dx => ({ kind: 'cylinder', pos: [0.22 + dx, 0.36, 0], scale: [0.04, 0.12, 0.04], ...glow })),
    ...[[-0.38, -0.23], [0.38, -0.23], [-0.38, 0.23], [0.38, 0.23]].map(([x, z]) => ({ kind: 'cylinder', pos: [x, 0.12, z], scale: [0.03, 0.2, 0.03], color: C.wood })),
  ];
}

// ── 風車島（Lv7 起電工的家）：kit 在風機腳下 (0.3, 0.25) 畫了開關箱（island.js），海底電纜從它底下接出去 ──
const WIND = (() => { const s = SATELLITES.find(x => x.kind === 'windmill'), c = axialToWorld(s.q, s.r); return { x: c.x, y: TOP - 0.2, z: c.z }; })();
export const SWITCH = offset(WIND, 0.3, 0.25);
const SWITCH_FRONT = { ...offset(WIND, 0.3, 0.6), yaw: Math.PI };   // 開關箱的鏡頭側，面向箱子
// 島上的小圈：在風機腳下的東南（風機塔身、開關箱、西邊的小屋、東邊進島的支線高架都不碰）
export const ISLAND_HOME = offset(WIND, 0.5, 0.75), ISLAND_R = 0.35;

// ── 全島賽博霓虹（Lv9）：主島每一座橋（含上台地的階梯）兩側一條霓虹藍燈條；懸浮月台四邊一圈粉紅燈條＋電視牆；
// 夜市每一攤屋簷一條燈條＋霓虹招牌（換掉 Lv4 的招牌板）。每一份是一個零件（劇本一份份閃白亮起）——三份共 7 個 draw call ──
const NEON = [C.neonPink, C.neonBlue, C.yellow];   // 燈頭的霓虹三色
const strip = (x, y, z, len, ry, glow) => ({ kind: 'box', pos: [x, y, z], scale: [0.03, 0.02, len], rot: [0, ry, 0], ...glow });
function bridgeStrips(glow) {
  const out = [];
  for (const [A, B] of adjacentPairs(MAIN_CELLS)) {
    const ta = cellTop(A), tb = cellTop(B), { a, b } = edgeMidpoint(A, B, RING_R * Math.sqrt(3) / 2);
    const side = (ry, s, w) => [Math.cos(ry) * w * s, -Math.sin(ry) * w * s];
    if (ta === tb) {
      for (const d of bridgeDecks(a, b, { base: ta, arch: 0.08 })) for (const k of [-1, 1]) {
        const [ox, oz] = side(d.ry, k, 0.23); out.push(strip(d.x + ox, d.y + 0.035, d.z + oz, d.len * 1.1, d.ry, glow));
      }
      continue;
    }
    // 階梯（同 island.js）：每一階的階面兩側一段
    const steps = 5, dx = b.x - a.x, dz = b.z - a.z, ry = Math.atan2(dx, dz), len = Math.hypot(dx, dz) / steps;
    for (let i = 0; i < steps; i++) for (const k of [-1, 1]) {
      const t = (i + 0.5) / steps, [ox, oz] = side(ry, k, 0.28);
      out.push(strip(a.x + dx * t + ox, ta + (tb - ta) * t + 0.012, a.z + dz * t + oz, len, ry, glow));
    }
  }
  return out;
}
// 懸浮月台（token.js 的 DECK_AT：寬 1.4、深 0.35）底緣四邊
const DECK = { w: 1.4, d: 0.36 };
const deckStrips = glow => [
  ...[-1, 1].map(k => ({ kind: 'box', pos: [0, 0, k * DECK.d / 2], scale: [DECK.w, 0.02, 0.025], ...glow })),
  ...[-1, 1].map(k => ({ kind: 'box', pos: [k * DECK.w / 2, 0, 0], scale: [0.025, 0.02, DECK.d], ...glow })),
];
const CYBER = { path: p => `quat/cyberpunk/${p}.glb`, tint: { '^Grey$': C.ink, '^LightGrey$': C.navy, '^MetalLight$': C.curb } };
const sign = (file, pos, h, glow, lit) => ({ path: CYBER.path(file), pos, h, tint: CYBER.tint, ...(lit ? { glow: { '^Texture_Signs$': glow } } : {}) });

export function view(lv, flags = {}) {
  const n = lv.bulb, at = AT, v = {};
  if (!n) return v;
  const lit = !flags.blackout, glowOf = c => (lit ? { color: c, glow: c } : { color: C.window });
  // 燈頭：Lv1–2 暖黃；Lv3 起霓虹，一站一色、沿路粉→藍→黃輪流（一站只有一種發光色 → 一站一個 draw call；
  // 九站繞一圈，兩色輪流的話最後一站和第一站會同色，三色剛好每一對相鄰的站都不同）
  const head = k => glowOf(n >= 3 ? NEON[k % NEON.length] : C.yellow);
  v['bulb.main'] = { kind: 'compound', at, parts: lamp(0, 0, head(0)), footprint: { r: 0.15 } };
  v['bulb.electrician'] = n >= ISLAND_LV
    ? { kind: 'roster', at: ISLAND_HOME, n: 1, accessory: 'vest', home: { kind: 'wander', at: ISLAND_HOME, r: ISLAND_R } }
    : { kind: 'roster', at, n: 1, accessory: 'vest', home: { kind: 'path', path: ROAD, loop: true, speed: 0.5, entry: ELECTRICIAN_ENTRY } };
  if (n >= 2) {
    // 燈桿全部一個零件（同一種材質只花一個 draw call）；燈頭每一站一個零件：Lv2 劇本一站站閃白點亮、大停電一站站熄
    v['bulb.posts'] = { kind: 'compound', at, parts: LAMP_POINTS.map(p => post(p.x - at.x, p.z - at.z)), footprint: false };
    LAMP_STOPS.forEach((g, k) => {
      const o = LAMP_POINTS[g[0]];
      v[`bulb.lamps.${k}`] = { kind: 'compound', at: o, parts: g.map(i => bulbHead(LAMP_POINTS[i].x - o.x, LAMP_POINTS[i].z - o.z, head(k + 1))), footprint: false };
    });
    const stall = ([x, z, roof]) => [
      { kind: 'box', pos: [x, 0.22, z], scale: [STALL_W, 0.45, STALL_D], color: C.wall },
      { kind: 'hip', pos: [x, 0.58, z], scale: [0.62, 0.22, 0.52], color: roof },
      { kind: 'sphere', pos: [x + 0.2, 0.47, z + 0.22], scale: 0.07, ...glowOf(C.warm) },
    ];
    const stalls = marketStalls(n), market = stalls.flatMap(stall);
    if (n >= 4 && n < 9) market.push({ kind: 'box', pos: [0.25, 0.95, 0.25], scale: [0.7, 0.18, 0.04], ...glowOf(C.neonPink) });
    v['bulb.market'] = { kind: 'compound', at: MARKET, parts: market, footprint: marketFootprint(n) };
    if (n >= 9) v['bulb.neon.market'] = { kind: 'neon', at: MARKET, footprint: false,
      parts: stalls.map(([x, z]) => ({ kind: 'box', pos: [x, 0.48, z + 0.27], scale: [0.6, 0.025, 0.025], ...glowOf(C.neonBlue) })),
      models: [sign('Sign_2', [0.25, 0.82, 0.25], 0.3, C.neonPink, lit)] };
  }
  if (n >= 6) v['bulb.substation'] = { kind: 'compound', at: SUBSTATION, parts: substationParts(lit), footprint: { x: 0, z: 0, w: SUB.w, d: SUB.d } };
  if (n >= 9) {
    v['bulb.neon.bridges'] = { kind: 'neon', at: { x: 0, y: 0, z: 0 }, parts: bridgeStrips(glowOf(C.neonBlue)), footprint: false };
    // 懸浮月台是代幣 Lv9 的（燈泡 Lv9 要代幣 ≥9，一定在；淹水的站沒有月台）
    if (lv.token >= 9 && !flags.flooded) v['bulb.neon.station'] = { kind: 'neon', at: DECK_AT, footprint: false, parts: deckStrips(glowOf(C.neonPink)),
      models: [sign('TV_1', [0.52, 0.07, -0.06], 0.36, C.neonBlue, lit)] };
  }
  return v;
}

export const builders = {
  // 霓虹：一份燈條（compound）＋幾個 glb 招牌併成一個零件（位置相對零件的 at），一起閃白。
  // ?quality=low（手機，裁決 R18 draw call ≤ 150）：燈條不畫，只留招牌
  neon(THREE, spec, ctx) {
    const object = new THREE.Group(), subs = [];
    if (spec.parts?.length && ctx.quality !== 'low') subs.push(ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: spec.parts }));
    for (const m of spec.models ?? []) subs.push(ctx.build({ kind: 'glb', at: { x: m.pos[0], y: m.pos[1], z: m.pos[2] }, path: m.path, h: m.h, ry: m.ry ?? 0, tint: m.tint, glow: m.glow }));
    for (const p of subs) object.add(p.object);
    return { object, dispose() { for (const p of subs) p.dispose?.(); } };
  },
};

// ── 劇本（§8.3）──
// 角色都是演到那一拍才找（回 null 那拍跳過）；once 找到第一次就記住，整段劇本同一組人。
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };
const el = ctx => () => ctx.roster.members('bulb.electrician')[0] ?? null;
// Lv8：電工在風車島上才演他的拍（不在島上——例如剛 RESET 還沒到家——那幾拍跳過，不從主島走過海）
const onIsland = ctx => () => { const m = ctx.roster.members('bulb.electrician')[0]; return m && !cellAt(m.pos.x, m.pos.z) ? m : null; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 從離 p 最近的那一站開始、沿路繞一圈的站序（沒有人就從第 0 站）
function rotationFrom(p) {
  const n = LAMP_STOPS.length, near = k => dist(lampApproach(LAMP_STOPS[k][0]), p);
  const k0 = p ? LAMP_STOPS.reduce((b, _, k) => (near(k) < near(b) ? k : b), 0) : 0;
  return LAMP_STOPS.map((_, i) => (k0 + i) % n);
}
// 離夜市最近的兩個看得見的島民（每段劇本自己記一組）
// 離夜市最近的兩個看得見、在日常裡的人：島民或站務員（夜市在捷運站旁；人數預算裁決 R16 之後代幣／珍奶格不住島民，只找島民要從別格走來）
const nearestPair = () => once(c => ['landmarks.islanders', 'token.staff'].flatMap(k => c.roster.members(k)).filter(m => !m.hidden && m.mode === 'home').sort((a, b) => dist(a.pos, MARKET) - dist(b.pos, MARKET)).slice(0, 2));
// 第 k 站電工站的那一格
export const stopCell = k => { const p = lampApproach(LAMP_STOPS[k][0]); return worldToAxial(p.x, p.z); };
const sameCell = (a, b) => a[0] === b[0] && a[1] === b[1];
// 走向另一格那段的鏡頭：和那段走路放在同一個 together，等到他進格前 FLIGHT 秒（鏡頭飛行時間）才轉，他過橋進格時鏡頭剛好到。
// 拍開始時用同一條路線（nav.route 從他現在的位置，和 walk 同一幀算）量出進格要走多遠；cellFn 回 null（同一格）這拍跳過
const FLIGHT = 1, SAMPLE = 0.05;
// 走路那段至少幾秒（人本來就在附近時站著等，一級才不短於 3 秒；裁決 R15 把其餘的拍砍短之後才需要）：Lv4 夜市、Lv6 變電所
const MIN_WALK = { market: 1.7, substation: 1.0 };
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
      // 演出時間：蒙太奇倍速由時間軸換算（step 的 dt 已經乘過），鏡頭飛行 FLIGHT 秒也跟著快
      left = Math.max(0, entryDistance(c.nav.route(m.pos, to(c)), cell) / speed - FLIGHT);
      inner = B.focus(cell); d = left + inner.dur;
      if (left <= 0) fire(c);
    },
    step(_k, dt, c) { left -= dt; if (left <= 0) fire(c); },
    end: fire,
  };
}
// LEVEL UP 在路燈（中心格）頭上：鏡頭不在中心格就跟 LEVEL UP 一起轉回去（levelUp 1 秒 ≥ focus 拍，不多佔時間）
const levelUpAtHome = (B, last) => B.together([B.focus(c => (last && sameCell(last(c), HOME_CELL) ? null : HOME_CELL)), B.levelUp('bulb')]);

// ── ★◆ Lv7 離岸風電啟動：電工走到站前島緣 → 列車進站停下、他跳上車頂 → 列車慢慢加速、沿環（鏡頭那一側）開到風車島的支線、開進島上
//   → 他從車頂跳到開關箱前、揮手按開關 → 風車閃白開始轉 → 回全景、燈塔閃白亮起、守塔人出來 → LEVEL UP。全程沒有瞬移 ──
const JUMP = 0.35, JUMP_ON = 0.45, SWITCH_PUSH = 0.25, DASH = 3.2;   // 跳下車、跳上車頂（離島緣 1.4，慢一點）的秒數、按開關（build 揮一下）的秒數、趕車小跑的速度（點燈快走 2.8）
// 站前島緣（老鼠搭車也在這裡上車）：捷運站對島心方位上、離島心 7 的點拉回走得到的地方
const SHORE = c => c.nav.nearestWalkable({ x: Math.cos(STATION_A) * 7, z: Math.sin(STATION_A) * 7 });
// 進站：最快 1.0 秒趕到（他還在走的話等他走到），最多 4.5 倍（beats 的 TRAIN_MAX_BOOST）；車頭剛開過站不到半圈時，倒車比往前繞快就倒車回來。開往支線：最快 0.6 秒、從站上慢慢加速；支線上開快一點（每秒 7 公尺，平常 2.5）
// （裁決 R17 ◆ ≤ 8 s：進站 1.5 → 1.0、開往支線 1.0 → 0.6、支線車速 4 → 7、按開關 0.6 → 0.25）
const BOARD_WITHIN = 1.0, BOARD_BACK = Math.PI, RIDE_WITHIN = 0.6, RIDE_SPUR = 7;
// 車頂座位：第一節車廂、往車尾 0.2（老鼠的 0 號座位在車廂正中，錯開一個身位）
const SEAT_CAR = 0, SEAT_OFF = -0.2;
// 沒有列車在跑（沒車、淹水停駛）就演不了：照規則燈泡 Lv7 一定有代幣 ≥7 的列車；萬一沒有，直接報錯，不讓他從海上瞬移過去
const needTrain = (B, c) => { if (!B.trainRuns(c)) throw new Error('bulb Lv7 needs a running train (token ≥ 7, not flooded)'); };
// 走到站前 ‖ 列車進站：兩邊同時開始，列車停在站上等他走到（during 先等 wait 秒）再跳上車頂。
// 拍開始時才知道他要走多久、列車多久到（trainRun 跟 trainStop 同一幀算，數字一樣），所以 together 在 start 才建
function board(B, who) {
  let inner = null;
  return {
    kind: 'board', dur: c => (inner ? inner.dur(c) : 0),
    start(c) {
      const m = who(c); if (!m) return false;
      needTrain(B, c);
      // 列車算的是「within 秒內開到、再花煞車時間停穩」：目標先扣掉 SPUR_BRAKE，停穩的時候才剛好是他走到的時候（加速上限照舊 4.5 倍）
      const walk = B.walk(m, SHORE, { speed: DASH }), wt = walk.estimate(c), within = Math.max(BOARD_WITHIN, wt - SPUR_BRAKE);
      // 倒車回來和往前繞，哪個比較快進站就走哪個（倒車要先煞車再起步，剛開過頭一點才划算；裁決 R17 ◆ ≤ 8 s）
      const run = back => B.trainRun(c, STATION_A, { within, back }), back = run(BOARD_BACK).arrive < run(0).arrive ? BOARD_BACK : 0;
      const wait = Math.max(0, wt - run(back).arrive), seat = cc => B.ridePose(cc, SEAT_CAR, SEAT_OFF);
      inner = B.together([walk, B.trainStop({ arrive: within, back, stop: wait + JUMP_ON + 0.05, during: [B.wait(wait), B.jump(m, seat, JUMP_ON)] })]);
      inner.start(c);
    },
    step(k, dt, c) { inner.step(k, dt, c); },
    end(c) { inner?.end(c); inner = null; },
  };
}
// 坐車到風車島：trainStop（支線版、launch）每幀先推列車，再把還坐在車頂上的他擺到座位上；during 第一拍（跳下車）一開始他就不坐了。
// 列車在島那頭只停 0.1 秒：他一起跳就倒車回環上（跳下車的落點是固定的開關箱前，不跟著車）
function ride(B, who, during) {
  let riding = true;
  const [off, ...rest] = during, start = off.start;
  off.start = c => { riding = false; return start(c); };
  const T = B.trainStop({ spur: 'windmill', launch: true, arrive: RIDE_WITHIN, spurSpeed: RIDE_SPUR, stop: 0.1, during: [off, ...rest] });
  const begin = T.start, step = T.step;
  T.start = c => { needTrain(B, c); riding = true; return begin(c); };
  T.step = (k, dt, c) => { step(k, dt, c); const m = riding ? who(c) : null; if (m) c.roster.setPose(m, { ...B.ridePose(c, SEAT_CAR, SEAT_OFF), walking: false }); };
  return T;
}
// 套用的估計長度照真的閃幾個零件算（trainStop 的 during 用估計長度排時間；估短了 LEVEL UP 會被截掉）
const applyN = (B, e, only, n) => Object.assign(B.apply(e, { only }), { estimate: () => BLINK + 0.15 * (n - 1) });

export const script = {
  // 電工從 101 工地走到路邊 → 敲 → 閃白第一盞路燈 → ♪ → 沿主路巡
  placed(e, s, ctx) {
    const { B } = ctx, m = el(ctx), k = 0.4 / dist(AT, { x: 0, z: 0 });   // 路燈往中心格格心收 0.4（中心格格心就是原點）
    return [
      B.apply(e, { only: ['bulb.electrician'], hold: ['bulb.electrician'] }), B.spawn('bulb.electrician', ELECTRICIAN_ENTRY),
      B.walk(m, offset(AT, -AT.x * k, -AT.z * k)), B.gesture(m, 'knock'), B.apply(e), B.bubble(m, '♪', 0.8), B.home(m),
    ];
  },
  grow: {
    // 整條路：電工快走沿主路點最近的三站（每到一個路口，上一站的燈亮；燈桿跟第一站一起出現）→ 回全景，
    //   其餘六站每 0.15 秒一站閃白亮起、夜市兩攤跟最後一站一起開張 → LEVEL UP（物品 v2 §6：≤ 8 秒，裁決）。
    // 從離他最近的那一站開始（他在主路上巡，人在哪就從哪開始），沿路的順序
    // 鏡頭（§13.1）：第一拍對著他第一站那一格；走向另一格的那段路途中轉過去（panAhead：他過橋進格時鏡頭剛好到；同一格不轉）
    2(e, s, ctx) {
      const { B } = ctx, m = el(ctx), n = LAMP_STOPS.length;
      // 站的順序在第一拍（鏡頭對準第一站那格）開始時才定（同回合前面的劇本演的時候他還在巡路）；之後每拍都照這個順序
      const order = once(c => rotationFrom(c.roster.members('bulb.electrician')[0]?.pos));
      const stop = i => c => order(c)[i], cell = i => c => stopCell(stop(i)(c));
      const at = i => c => lampApproach(LAMP_STOPS[stop(i)(c)][0]), go = i => B.walk(m, at(i), { speed: LIGHTING_SPEED });
      const pan = i => panAhead(B, m, at(i), c => (sameCell(cell(i)(c), cell(i - 1)(c)) ? null : cell(i)(c)), LIGHTING_SPEED);
      const light = i => B.apply(e, { only: c => [...(i === 0 ? ['bulb.posts'] : []), `bulb.lamps.${stop(i)(c)}`, ...(i === n - 1 ? ['bulb.market'] : [])] });
      return [
        B.focus(cell(0)), go(0), ...Array.from({ length: WALKED - 1 }, (_, i) => B.together([go(i + 1), light(i), pan(i + 1)])), light(WALKED - 1),
        B.home(m), B.focus('home'), ...Array.from({ length: n - WALKED }, (_, j) => light(WALKED + j)),
        B.levelUp('bulb'),
      ];
    },
    // 霓虹、傍晚：電工快走到離他最近的那一站路燈下 → 敲一下 → 全島燈頭一站站閃白換成霓虹（粉藍交錯）→ 天色淡入傍晚。
    // 物品 v2 §6（一級 3–5 秒）：不再走到夜市前（從主路另一頭走過去要 3 秒多）；鏡頭對著那一站的格子，LEVEL UP 時轉回中心格
    3(e, s, ctx) {
      const { B } = ctx, m = el(ctx), k0 = once(c => rotationFrom(c.roster.members('bulb.electrician')[0]?.pos)[0]), cell = c => stopCell(k0(c));
      return [
        B.focus(cell), B.walk(m, c => lampApproach(LAMP_STOPS[k0(c)][0]), { speed: LIGHTING_SPEED }), B.gesture(m, 'knock', 0.8),
        B.apply(e), B.world({ time: TIMES.dusk }), B.home(m), levelUpAtHome(B, cell),
      ];
    },
    // 四攤：離夜市最近的兩個人（島民、站務員）快步走去夜市前排隊 → 閃白多兩攤、一起 ♥（鏡頭對著夜市格，LEVEL UP 時轉回中心格）
    4(e, s, ctx) {
      const { B } = ctx, pair = nearestPair(), islander = i => c => pair(c)[i] ?? null, slot = i => c => c.nav.slots(MARKET_FRONT, 2, 0.15)[i];
      return [
        // 閃白多兩攤的同時一起 ♥（裁決 R15 一級 ≤ 4.5 s）
        B.focus(MARKET_CELL), B.together([...[0, 1].map(i => B.walk(islander(i), slot(i), { speed: QUEUE_SPEED })), B.wait(MIN_WALK.market)]), B.together([B.apply(e), ...[0, 1].map(i => B.bubble(islander(i), '♥', 0.4))]),
        B.home([islander(0), islander(1)]), levelUpAtHome(B),
      ];
    },
    // 全島 LED（棒球 ≥4）：電工走到 101 腳下 → ！ → 閃白全島 LED、101 燈光秀 → 入夜
    5(e, s, ctx) {
      const { B } = ctx, m = el(ctx);
      return [B.walk(m, FOOT), B.bubble(m, '！', 0.8), B.apply(e), B.world({ time: TIMES.night }), B.home(m), B.levelUp('bulb')];
    },
    // 變電所（晶片 ≥3 或代幣 ≥3）：電工快走到 101 西邊的空地 → 揮鋤頭 → 閃白變電所（儲能櫃、變壓器亮淡藍）、♪（嗡嗡響）
    6(e, s, ctx) {
      const { B } = ctx, m = el(ctx);
      // 揮一下、閃白的同時 ♪（裁決 R15 一級 ≤ 4.5 s：鋤頭 1.0 → 0.6）；他本來就在空地旁邊時走路那段至少 MIN_WALK 秒（站著等一下），整級不短於 3 秒
      return [
        B.together([B.walk(m, c => frontOf(SUBSTATION, SUBSTATION_FRONT.z - SUBSTATION.z, c.nav), { speed: LIGHTING_SPEED }), B.wait(MIN_WALK.substation)]),
        B.gesture(m, 'build', 0.6, { at: SUBSTATION }),
        B.together([B.apply(e), B.bubble(m, '♪', 0.6)]), B.home(m), B.levelUp('bulb'),
      ];
    },
    // ★◆ 離岸風電啟動（代幣 ≥7：支線通到風車島）：鏡頭到捷運站 → 電工走到站前、列車進站，他跳上車頂 → 鏡頭飛去風車島，
    //   列車沿環開到支線、開進島上 → 他跳到開關箱前按下開關 → 風車閃白開始轉 → 回全景、燈塔與光束閃白、守塔人出來（列車倒回環上）→ LEVEL UP。
    //   他就留在風車島上（家換成島上的小圈），不再回主島巡路
    7(e, s, ctx) {
      const { B } = ctx, m = el(ctx);
      return [
        B.together([B.focus(TOKEN_CELL), board(B, m)]),   // 鏡頭飛去站前的同時他就出發、列車同時趕來
        B.together([B.focus(WIND, { zoom: ISLAND_ZOOM }), ride(B, m, [
          // 按下開關 → 風車閃白開始轉 → 回全景（裁決 R17 ◆ ≤ 8 s：不再停 1 秒等鏡頭，燈塔在鏡頭飛往全景時亮）
          B.jump(m, () => SWITCH_FRONT, JUMP), B.gesture(m, 'build', SWITCH_PUSH, { at: SWITCH }), applyN(B, e, ['sat.windmill'], 1),
          B.focus('home'),
          B.home(m), B.together([applyN(B, e, ['sat.lighthouse', 'sat.beam', 'sat.keeper', 'bulb.electrician'], 2), B.levelUp('bulb')]),
        ])]),
      ];
    },
    // ★ 海底電纜（晶片 ≥5）：鏡頭到風車島 → 電工走到開關箱前一敲（接上電纜）→ 電纜閃白鋪好（晶片 <6 還沒通電：暗的）→ ♪ → 回全景看整條電纜 → LEVEL UP
    8(e, s, ctx) {
      const { B } = ctx, m = onIsland(ctx);
      return [
        // 裁決 R15（颱風回合 ≤ 50 s）：一敲 1.0 → 0.8、♪ 1.0 → 0.8
        B.focus(WIND, { zoom: ISLAND_ZOOM }), B.walk(m, SWITCH_FRONT), B.gesture(m, 'build', 0.8, { at: SWITCH }),
        B.apply(e, { only: ['chip.cable'] }), B.bubble(m, '♪', 0.8), B.home(m),
        B.focus('home', { hold: 0.6 }), B.levelUp('bulb'),   // 全景停 1.0 → 0.6（裁決 R17，颱風回合 ≤ 50 s）
      ];
    },
    // ◆ 全島賽博霓虹（代幣 ≥9）：鏡頭到車站格 → 站務員 ！ → 懸浮月台的燈條與電視牆閃白亮起 → 回全景，同時橋面燈條、夜市招牌一份份亮起
    //   （霓虹從第一份到最後一份 ≤ 1.5 秒）→ 全景定格 → 大家 ♪ → LEVEL UP
    9(e, s, ctx) {
      const { B } = ctx, staff = c => c.roster.members('token.staff').find(m => !m.hidden) ?? null;
      const cheer = c => [...c.roster.members('token.staff'), ...c.roster.members('landmarks.islanders')].filter(m => !m.hidden);
      return [
        B.focus(TOKEN_CELL), B.bubble(staff, '！', 0.8),
        B.apply(e, { only: ['bulb.neon.station'] }),
        B.together([B.focus('home', { hold: 2.4 }), B.apply(e, { only: ['bulb.neon.bridges', 'bulb.neon.market', 'bulb.market'] })]),
        B.together([0, 1, 2, 3].map(i => B.bubble(c => cheer(c)[i] ?? null, '♪', 1.0))),
        B.levelUp('bulb'),
      ];
    },
  },
  fx: () => null,   // 燈泡自己沒有 onLevel
  // 等待圖框的代表：藏起來的人（躲進門裡）不算；Lv7 起電工在風車島上（鏡頭不在那裡），改用離燈泡最近的島民
  rep: (s, ctx) => ctx.roster.members('bulb.electrician').find(m => !m.hidden && cellAt(m.pos.x, m.pos.z)) ?? null,
};
// ◆ 關鍵節點（裁決 R11）：跳級的第二級落在這兩級，也演完整劇本（turn.js）
script.grow[7].key = script.grow[9].key = true;
