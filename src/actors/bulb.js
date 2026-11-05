// 燈泡（物品 v2 §4.4，max 9）：一盞路燈 → 五個低格的路都有燈、夜市一攤 → 霓虹（粉藍交錯）、傍晚 → 夜市第二攤（招牌板 2026-11-05 拿掉）
//   → 全島 LED（燈光秀在 101）、夜晚 → 變電所（儲能櫃、變壓器嗡嗡亮）→ ★◆ 離岸風電啟動（電工搭列車到風車島按開關：風車轉、燈塔亮）
//   → ★ 海底電纜（晶片的 chip.cable 鋪好；晶片 Lv6 才通電發光）→ ◆ 全島賽博霓虹（橋面、懸浮月台、車站的招牌發光）。
// 風車與燈塔是衛星島的零件（satellites.js 看燈泡 ≥7）；電纜是晶片的零件（chip.js 看燈泡 ≥8）——燈泡的劇本用 apply 的 only 叫它們出來。
// 大停電：所有燈熄（view 拿掉發光；app 另外把全島發光歸零）。
// 電工（計畫 16，使用者 2026-11-03：「拿掉前期的燈泡工人，他亂跑」）：Lv1–6 沒有他；Lv7 才從捷運站門口走出來、搭車去風車島開了風電，
//   之後就住在風車島上（繞風機腳下的小圈，衛星島的 wander），Lv8 在島上接電纜。
// 劇本（§6）：一級 3–4.5 秒、Lv1–6 沒有人走路（燈自己亮）；Lv2 燈光沿環掃一圈是燈泡保留的「繞全島一圈」；◆ Lv7、Lv9 6–8 秒、回全景定格。
import { anchorWorld, landmarkWorld } from './anchors.js';
import { axialToWorld, cellAt, cellTop, worldToAxial, RING_R, MAIN_CELLS, adjacentPairs, edgeMidpoint, SATELLITES, TOP } from '../scene/hex.js';
import { bridgeDecks } from '../scene/bridge.js';
import { TIMES } from '../scene/daynight.js';
import { BLINK } from '../show/blink.js';
import { STATION_A, SPUR_BRAKE } from '../show/beats.js';
import { DECK_AT, DOOR as STATION_DOOR, hasTrain, view as tokenView } from './token.js';
import { C, offset } from './palette.js';

export const id = 'bulb';
export const labelY = 0.8;
const AT = anchorWorld('bulb'), TOWER = anchorWorld('tower'), MARKET = landmarkWorld('market');
// 夜市前（第二攤櫃台的南邊）：Lv4 小學生排隊站這裡，面向攤子、背對鏡頭（計畫 16 夜市搬到第一盞路燈旁之後）。
// 設計原訂 offset(MARKET, 0.25, 0.55)、是照夜市 dx −1.2 算的（世界座標 (−0.95, 0.9)）；夜市往西挪到 −1.45 之後同一個公式會落在路燈外擴 PAD 裡，
// 兩個排隊位有一個掉進「兩攤、路燈、格邊」圍起來的死角（走路格連不出去）。改 +0.5：世界座標還是設計那一點，正好在第二攤（Lv4 開張那攤）櫃台前。
// 不用「夜市中心附近的可走點」（會挑到攤子後面、走不到的死角）
export const MARKET_FRONT = offset(MARKET, 0.5, 0.55);
const STATION = anchorWorld('token');
const HOME_CELL = [0, 0], MARKET_CELL = worldToAxial(MARKET.x, MARKET.z), TOKEN_CELL = worldToAxial(STATION.x, STATION.z);   // 鏡頭對的格子：路燈（中心格）、夜市（計畫 16 起也在中心格）、捷運站
const ISLAND_ZOOM = 0.8;   // 鏡頭到衛星島拉近 0.8（島和支線都要進畫面，同代幣 Lv7）
const QUEUE_SPEED = 2.4;   // Lv4 小學生快步去夜市排隊（一般走路 1.6；一級 3–4.5 秒）
const LAMP_R = RING_R + 0.12;
export const ISLAND_LV = 7;   // 離岸風電啟動那一級電工才登場，之後住在風車島上
// 格內方位角 deg 上、離格心 r 的點（y 是格面）
function ringPoint(cell, deg, r) {
  const c = axialToWorld(...cell), a = deg * Math.PI / 180;
  return { x: c.x + Math.cos(a) * r, y: cellTop(cell), z: c.z + Math.sin(a) * r };
}

// 路燈：每個低格的 90°／210°／330° 角各一盞。燈都在路口：隔著水道的兩三盞是同一個路口，一站一起亮。
// 路口沿環排（中心格南角 → 晶片格 → 捷運格 → 球場格 → 校舍格 → 回中心格）；LAMP_POINTS 是攤平後的順序。
const JUNCTIONS = [
  [[[0, 0], 90], [[0, 1], 210], [[-1, 1], 330]],   // 中心格南角：三格交會
  [[[1, 0], 210], [[0, 0], 330]], [[[1, 0], 330]], [[[1, 0], 90], [[0, 1], 330]], [[[0, 1], 90]], [[[-1, 1], 90]],
  [[[-1, 0], 90], [[-1, 1], 210]],                  // 站在校舍格這側（球場格那個角被巨蛋擋在死角裡）
  [[[-1, 0], 210]], [[[-1, 0], 330], [[0, 0], 210]],
];
export const LAMP_POINTS = JUNCTIONS.flat().map(([cell, deg]) => ringPoint(cell, deg, LAMP_R));
// 每一站（路口）點的燈號：[[0, 1, 2], [3, 4], [5], …]；燈頭零件 bulb.lamps.<站> 照這張表分組（大停電也一站站熄）
export const LAMP_STOPS = JUNCTIONS.map((j, k) => j.map((_, i) => JUNCTIONS.slice(0, k).flat().length + i));

// 夜市的攤子 [x, z, 屋頂色]（相對夜市地標）：Lv2 一攤、Lv4 第二攤（2026-10-28 錄影修正：原本 Lv2 兩攤、Lv4 四攤）。
// 第二攤放東邊、往南錯開 0.15（跟第一攤肩並肩）；兩攤外擴 PAD 後連成一塊，不留夾縫。
// 計畫 16（使用者 2026-11-03：「車站旁的這兩棟是什麼，看不出來」）：夜市從捷運站旁搬到中心格第一盞路燈旁（anchors.js 的 LANDMARKS.market）——
//   西邊（格邊）、北邊（變電所）、南邊（路燈）都靠著，東攤和 101 底座之間留一條外擴後 0.26 寬的走道（西橋頭、120° 橋頭、101 北側照樣互通）
export const STALL_W = 0.5, STALL_D = 0.4;
export const marketStalls = n => [[0, 0, C.coral], ...(n >= 4 ? [[0.5, 0.15, C.yellow]] : [])];
// 夜市的 footprint：每一攤的攤身（不是整個包圍盒：攤子外圍是走得到的地；燈籠串在頭上，不算）
const marketFootprint = n => marketStalls(n).map(([x, z]) => ({ x, z, w: STALL_W, d: STALL_D }));
// 攤子（計畫 16 重畫）：開放式攤位——四根木柱撐一片斜棚、前面（+z，鏡頭側）一張櫃台（底在地面）；
// 第一攤櫃台上兩層蒸籠＋白色薄蓋、第二攤一座烤架＋三根斜插的竹籤。棚子底在柱頂 POST_H
const POST_H = 0.55, ROOF = [0.62, 0.22, 0.52], COUNTER = [STALL_W, 0.22, 0.18];
const COUNTER_Z = STALL_D / 2 - COUNTER[2] / 2;   // 櫃台前緣貼攤身前緣
const roofApex = (x, z) => [x, POST_H + ROOF[1], z];
const onCounter = h => COUNTER[1] + h / 2;   // 擺在櫃台上、高 h 的東西的中心高度
const STEAMER_H = 0.06, LID_H = 0.015;       // 蒸籠一層的高度（兩層疊著）、白色薄蓋的厚度（蓋在第二層頂上）
function stall([x, z, roof], i) {
  const cz = z + COUNTER_Z, steamTop = COUNTER[1] + 2 * STEAMER_H, out = [
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ kind: 'cylinder', pos: [x + sx * (STALL_W / 2 - 0.02), POST_H / 2, z + sz * (STALL_D / 2 - 0.02)], scale: [0.03, POST_H, 0.03], color: C.wood })),
    { kind: 'hip', pos: [x, POST_H + ROOF[1] / 2, z], scale: ROOF, color: roof },
    { kind: 'box', pos: [x, COUNTER[1] / 2, cz], scale: COUNTER, color: C.cream },
  ];
  if (i === 0) out.push(   // 蒸籠：兩層疊著、頂上一個白色薄圓蓋
    ...[0, 1].map(k => ({ kind: 'cylinder', pos: [x - 0.1, onCounter(STEAMER_H) + k * STEAMER_H, cz], scale: [0.16, STEAMER_H, 0.16], color: C.wood })),
    { kind: 'cylinder', pos: [x - 0.1, steamTop + LID_H / 2, cz], scale: [0.17, LID_H, 0.17], color: C.white },
  );
  else out.push(           // 烤架＋三根竹籤（往後斜插，籤尾在烤架上）
    { kind: 'box', pos: [x + 0.06, onCounter(0.04), cz], scale: [0.26, 0.04, 0.12], color: C.ink },
    ...[-0.08, 0, 0.08].map(dx => ({ kind: 'cylinder', pos: [x + 0.06 + dx, COUNTER[1] + 0.04 + 0.1 * Math.cos(0.5), cz - 0.1 * Math.sin(0.5)], scale: [0.012, 0.2, 0.012], rot: [-0.5, 0, 0], color: C.cream })),
  );
  return out;
}
// 紅燈籠串：從第一盞路燈的桿頂拉到一攤的棚頂尖（from、to 相對夜市地標），等距四顆燈籠穿在一條細繩上。
// 端點直接用桿頂與棚頂的座標算——夜市挪位置時兩端跟著走，不會懸空
const LANTERNS = 4;
// 一段細線（墨黑圓柱）從 from 拉到 to
function wire(from, to) {
  const d = to.map((v, k) => v - from[k]), L = Math.hypot(...d), u = d.map(v => v / L);
  return { kind: 'cylinder', pos: from.map((v, k) => v + d[k] / 2), scale: [0.008, L, 0.008], rot: [Math.atan2(u[2], u[1]), 0, -Math.asin(u[0])], color: C.ink };
}
function lanternString(from, to, look) {
  const d = to.map((v, k) => v - from[k]);
  return [wire(from, to), ...Array.from({ length: LANTERNS }, (_, j) => ({ kind: 'sphere', pos: from.map((v, k) => v + d[k] * (j + 1) / (LANTERNS + 1)), scale: 0.07, ...look }))];
}

const POST_TOP = 0.5;   // 路燈桿頂（燈頭中心 0.52 的下緣附近）：夜市的燈籠串從這裡拉出去
const post = (x, z) => ({ kind: 'cylinder', pos: [x, POST_TOP / 2, z], scale: [0.06, POST_TOP, 0.06], color: C.ink });
const bulbHead = (x, z, head) => ({ kind: 'sphere', pos: [x, 0.52, z], scale: 0.12, ...head });
const lamp = (x, z, head) => [post(x, z), bulbHead(x, z, head)];

// ── 假升級（2026-11-05 使用者：「電燈早放也能自己多長一兩級（虛構的級數），主要目的是讓畫面有在動，不一定要動到求解器」）──
// 電燈 Lv2 起原地等的回合（舞台 meta.idle.bulb，wait 事件列到它就 +1；stage.js）多畫一段、最多 IDLE_MAX 段，規則、等級徽章都不動、不冒 LEVEL UP：
//   第 1 段：中心格另外三個角（30°／150°／270°；原本的三盞在 90°／210°／330°）補上路燈、六條邊的桿頂之間拉下垂的彩燈串（STRING_BULBS 顆三色小燈）；
//   第 2 段：外圈四格（有路燈的那四格）也各自補滿。一格一個零件 bulb.idle.<q,r>（墨黑的桿子和線一個 draw call、發光的燈三色三個）。
//   升到下一級就歸零（零件縮掉；霓虹同一刻點起來）。鎖住（停電）之後不再延伸（不在 wait 裡），燈頭改成壞掉的樣子：flicker 零件偶爾閃一下（flickerOn）
export const IDLE_MAX = 2, STRING_BULBS = 5, STRING_SAG = 0.15, FLICKER_PERIOD = 4.5;
const STRING_COLORS = [C.yellow, C.neonPink, C.neonBlue];   // 彩燈串三色輪流（直線單色看起來像圍籬，截圖 2026-11-05）
const IDLE_CORNERS = [30, 150, 270], IDLE_STAGES = [[[0, 0]], [[1, 0], [0, 1], [-1, 1], [-1, 0]]];
const IDLE_HOLD = 0.6;   // 一段演完停一下
// 這回合的假升級是第幾段：舞台的數字（到上一回合為止）+ 1（turn.js 把回合開始的 meta 放在 s.meta）
export const idleOf = s => (s.meta?.idle?.bulb ?? 0) + 1;
const idleKey = cell => `bulb.idle.${cell}`;
// 壞掉的燈：每 FLICKER_PERIOD 秒閃兩下（0.12 s 亮、0.08 s 暗、0.08 s 亮），各站錯開（seed × 1.3 s）；純函式，零件每幀查
export function flickerOn(t, seed = 0) {
  const u = (((t + seed * 1.3) % FLICKER_PERIOD) + FLICKER_PERIOD) % FLICKER_PERIOD;
  return u < 0.12 || (u > 0.2 && u < 0.28);
}
// 彩燈串：from → to 之間一條下垂的線（拋物線，中間垂 STRING_SAG；三段細線折出來）＋ STRING_BULBS 顆小燈掛在線上、三色輪流
function fairyString(from, to, look) {
  const at = k => from.map((v, i) => v + (to[i] - v) * k - (i === 1 ? STRING_SAG * 4 * k * (1 - k) : 0));
  return [
    ...[0, 1, 2].map(i => wire(at(i / 3), at((i + 1) / 3))),
    ...Array.from({ length: STRING_BULBS }, (_, j) => ({ kind: 'sphere', pos: at((j + 1) / (STRING_BULBS + 1)), scale: 0.06, ...look(STRING_COLORS[j % STRING_COLORS.length]) })),
  ];
}
// 一格的假升級零件：三根桿、三個燈頭（head）、六條邊的彩燈串（look：顏色 → 亮／暗的外觀）；相對格心
function idleParts(cell, head, look) {
  const c = axialToWorld(...cell), corner = deg => ringPoint(cell, deg, LAMP_R), rel = p => [p.x - c.x, p.z - c.z];
  const posts = IDLE_CORNERS.flatMap(deg => { const [x, z] = rel(corner(deg)); return lamp(x, z, head); });
  const strings = Array.from({ length: 6 }, (_, i) => {
    const [ax, az] = rel(corner(30 + 60 * i)), [bx, bz] = rel(corner(30 + 60 * (i + 1)));
    return fairyString([ax, POST_TOP, az], [bx, POST_TOP, bz], look);
  });
  return [...posts, ...strings.flat()];
}
// 燈頭零件：亮著就是一般 compound；停電就是 flicker（parts 暗的那份、lit 亮的那份，零件自己偶爾把 lit 露出來）
const lampPart = (at, lit, dark, bright, seed) => (lit ? { kind: 'compound', at, parts: bright, footprint: false } : { kind: 'flicker', at, parts: dark, lit: bright.filter(p => p.glow), seed, footprint: false });

// ── 變電所（Lv6）：中心格西北、101 西邊的空地（101 外擴後和它之間留一條走道）。
// 水泥台上兩座儲能櫃（白櫃、前面一條指示燈）＋一座變壓器（深藍箱、三根礙子），通電時指示燈與礙子亮淡藍（嗡嗡亮）；四角矮圍籬 ──
const SUB = { w: 0.8, d: 0.5 };
const CENTRE = axialToWorld(0, 0);
export const SUBSTATION = { x: CENTRE.x - 1.15, y: cellTop([0, 0]), z: CENTRE.z - 0.85 };
export const SUBSTATION_FRONT = offset(SUBSTATION, 0, 0.6);   // 變電所正面（台子的鏡頭側，外擴後的 footprint 外）：visitSpot 的半徑（老鼠的 trouble 點）
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
// 每一份是一個零件（劇本一份份閃白亮起）。夜市的屋簷燈條＋霓虹招牌（bulb.neon.market）2026-11-04 拿掉了 ──
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

export function view(lv, flags = {}, meta = {}) {
  const n = lv.bulb, at = AT, v = {};
  if (!n) return v;
  const lit = !flags.blackout, bright = c => ({ color: c, glow: c }), dark = () => ({ color: C.window }), glowOf = c => (lit ? bright(c) : dark(c));
  // 燈頭：Lv1–2 暖黃；Lv3 起霓虹，一站一色、沿路粉→藍→黃輪流（一站只有一種發光色 → 一站一個 draw call；
  // 九站繞一圈，兩色輪流的話最後一站和第一站會同色，三色剛好每一對相鄰的站都不同）
  const head = k => glowOf(n >= 3 ? NEON[k % NEON.length] : C.yellow);
  v['bulb.main'] = { kind: 'compound', at, parts: lamp(0, 0, head(0)), footprint: { r: 0.15 } };
  // 電工 Lv7 起才在（計畫 16）：住在風車島上（衛星島的 wander、沒有入口）；Lv7 的劇本 hold 住這份宣告、從車站門口把他生出來
  if (n >= ISLAND_LV) v['bulb.electrician'] = { kind: 'roster', at: ISLAND_HOME, n: 1, accessory: 'vest', home: { kind: 'wander', at: ISLAND_HOME, r: ISLAND_R } };
  if (n >= 2) {
    // 燈桿全部一個零件（同一種材質只花一個 draw call）；燈頭每一站一個零件：Lv2 劇本一站站閃白點亮、大停電一站站熄
    v['bulb.posts'] = { kind: 'compound', at, parts: LAMP_POINTS.map(p => post(p.x - at.x, p.z - at.z)), footprint: false };
    const headColor = k => (n >= 3 ? NEON[k % NEON.length] : C.yellow);
    LAMP_STOPS.forEach((g, k) => {
      const o = LAMP_POINTS[g[0]], heads = look => g.map(i => bulbHead(LAMP_POINTS[i].x - o.x, LAMP_POINTS[i].z - o.z, look(headColor(k + 1))));
      v[`bulb.lamps.${k}`] = lampPart(o, lit, heads(dark), heads(bright), k);
    });
    // 假升級（見 IDLE_STAGES）：等了幾回合就畫幾段；第 1 段的燈頭跟第一盞同色，第 2 段四格照站的輪色
    IDLE_STAGES.slice(0, Math.min(meta?.idle?.bulb ?? 0, IDLE_MAX)).forEach((cells, si) => cells.forEach((cell, ci) => {
      const c = axialToWorld(...cell), parts = look => idleParts(cell, look(headColor(si === 0 ? 0 : ci + 1)), look);
      v[idleKey(cell)] = lampPart({ x: c.x, y: cellTop(cell), z: c.z }, lit, parts(dark), parts(bright), LAMP_STOPS.length + si * 4 + ci);
    }));
    // 燈籠：Lv2 紅色不亮、Lv3（霓虹、傍晚）起發光；大停電不亮（glowOf）。一攤一串，從路燈桿頂（燈頭底下）拉過去
    const stalls = marketStalls(n), lantern = n >= 3 ? glowOf(C.coral) : { color: C.coral };
    const postTop = [AT.x - MARKET.x, POST_TOP, AT.z - MARKET.z];
    const market = stalls.flatMap((s, i) => [...stall(s, i), ...lanternString(postTop, roofApex(s[0], s[1]), lantern)]);
    // 招牌拿掉（使用者 2026-11-04：「夜市上面這塊方方的是什麼，不好看」）：Lv4–8 的粉紅招牌板、Lv9 的霓虹招牌（bulb.neon.market）都不畫，
    // 夜市的霓虹就是 Lv3 起發光的燈籠串
    v['bulb.market'] = { kind: 'compound', at: MARKET, parts: market, footprint: marketFootprint(n) };
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
  // 壞掉的燈（停電）：暗的那份一直在，亮的那份藏著、flickerOn 的那幾幀露出來（不改材質：亮的是另一份 mesh，發光材質照常登記在 glow）
  flicker(THREE, spec, ctx) {
    const object = new THREE.Group(), origin = { x: 0, y: 0, z: 0 };
    const dark = ctx.build({ kind: 'compound', at: origin, parts: spec.parts }), lit = ctx.build({ kind: 'compound', at: origin, parts: spec.lit });
    lit.object.visible = false; object.add(dark.object, lit.object);
    return {
      object, materials: [...(dark.materials ?? []), ...(lit.materials ?? [])],
      update(dt, t) { lit.object.visible = flickerOn(t, spec.seed ?? 0); },
      dispose() { dark.dispose?.(); lit.dispose?.(); },
    };
  },
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
// Lv4 去夜市排隊的人：鮮奶的兩個小學生（milk.kids）——「夜市開第二攤，小學生來排隊」（計畫 16 修正輪 1，協調者裁決）。
//   燈泡 Lv4 要鮮奶 ≥3（up[4] = min('milk', 3)），小學（Lv3）和兩個小學生一定已經在；從校舍格走西橋過來。
//   以前找島民或站務員：站務員從捷運格走過來，同回合下一個代幣劇本要他時還在回崗位的半路上（吹偏／老鼠跑遠第 7 回合代幣 3 拖到 6.4 s）；
//   島民到燈泡 Lv4 時都已經換了身分。看得見、在日常裡的才叫（藏起來的、正被別的劇本拿著的不叫）；不夠兩位就一位或沒有。
//   每段劇本自己記一組；排的順序照走過去的路有多長（不是直線距離：直線近的人可能隔著一座橋要繞，計畫 9 任務 3）。
//   走不到的人（nav.route 到不了就只回起點，路長 0）不算——不然 0 會排第一
export const QUEUE_KEY = 'milk.kids';
export const nearestPair = () => once(c => {
  const end = c.nav.nearestWalkable(MARKET_FRONT);
  const walk = m => { const path = c.nav.route(m.pos, MARKET_FRONT), last = path.at(-1); return last && dist(last, end) < 1e-3 ? c.nav.routeLength(path) : Infinity; };
  return c.roster.members(QUEUE_KEY).filter(m => !m.hidden && m.mode === 'home')
    .map(m => [m, walk(m)]).filter(([, d]) => d < Infinity).sort((a, b) => a[1] - b[1]).slice(0, 2).map(([m]) => m);
});
// 第 k 站那一格（站的第一盞燈在哪一格）：Lv2 燈光掃到這一站時鏡頭對的格子
export const stopCell = k => { const p = LAMP_POINTS[LAMP_STOPS[k][0]]; return cellAt(p.x, p.z); };
const sameCell = (a, b) => a[0] === b[0] && a[1] === b[1];
// 從別格叫來的人演完放回日常：hurry（roster.home）——走路速度回家、不在別人的格子裡站著等焦點；藏起來、已經在退場的不管
const hurryHome = who => ({ kind: 'home', dur: 0, start(c) { for (const f of who) { const m = f(c); if (m) c.roster.home(m, { hurry: true }); } } });
// Lv4 排隊那段至少幾秒（小學生本來就在附近、或沒有人可叫時站著等，一級才不短於 3 秒）
const QUEUE_MIN = 1.7;
// Lv2 燈光一站一拍：亮了停 SWEEP_STEP 秒再換下一站（計畫 16 §設計 4 原訂 0.3；九站加夜市、LEVEL UP 劇本 5.6 s，超過 4.5 → 0.25 是設計給的退路）
const SWEEP_STEP = 0.25;
// LEVEL UP 在路燈（中心格）頭上：鏡頭不在中心格就跟 LEVEL UP 一起轉回去（levelUp 1 秒 ≥ focus 拍，不多佔時間）
const levelUpAtHome = (B, last) => B.together([B.focus(c => (last && sameCell(last(c), HOME_CELL) ? null : HOME_CELL)), B.levelUp('bulb')]);

// ── ★◆ Lv7 離岸風電啟動：電工從捷運站門口走出來、走到站前島緣 → 列車進站停下、他跳上車頂 → 列車慢慢加速、沿環（鏡頭那一側）開到風車島的支線、開進島上
//   → 他從車頂跳到開關箱前、揮手按開關 → 風車閃白開始轉 → 回全景、燈塔閃白亮起、守塔人出來 → LEVEL UP。全程沒有瞬移 ──
const JUMP = 0.35, JUMP_ON = 0.45, SWITCH_PUSH = 0.25, DASH = 3.2;   // 跳下車、跳上車頂（離島緣 1.4，慢一點）的秒數、按開關（build 揮一下）的秒數、趕車小跑的速度（一般走路 1.6）
// 站前島緣（老鼠搭車也在這裡上車）：捷運站對島心方位上、離島心 7 的點拉回走得到的地方
const SHORE = c => c.nav.nearestWalkable({ x: Math.cos(STATION_A) * 7, z: Math.sin(STATION_A) * 7 });
// 進站：最快 1.0 秒趕到（他還在走的話等他走到），最多 4.5 倍（beats 的 TRAIN_MAX_BOOST）；車頭剛開過站不到半圈時，倒車比往前繞快就倒車回來。開往支線：最快 0.6 秒、從站上慢慢加速；支線上開快一點（每秒 7 公尺，平常 2.5）
// （裁決 R17 ◆ ≤ 8 s：進站 1.5 → 1.0、開往支線 1.0 → 0.6、支線車速 4 → 7、按開關 0.6 → 0.25）
const BOARD_WITHIN = 1.0, BOARD_BACK = Math.PI, RIDE_WITHIN = 0.6, RIDE_SPUR = 7;
// 車頂座位：第一節車廂、往車尾 0.2（老鼠的 0 號座位在車廂正中，錯開一個身位）
const SEAT_CAR = 0, SEAT_OFF = -0.2;
// 搭車那段要有列車在跑（任何在跑的列車都行）。回到 GROW（2026-10-29）時燈泡 7 是 auto，沒放代幣（< 4 沒有環狀線）或淹水停駛時也會長到 7：
// 建串時就問 token.js 的 hasTrain，沒車改演不搭車的版本（Task 6a 修正輪裁決：見 7 的註解）。
// 計畫 9 連鎖（2026-10-30）之後燈泡 7 要代幣 ≥5，規則下到不了沒車的 7；退路留著當防呆（設計 §8 R3，bulb.test 用合成狀態驗）。
// 建串時看得到車、演到時車卻停了（萬一，安全網）：上車那拍（board）start 回 false、整拍跳過；坐車那拍（ride）start 回 false 時
// 時間軸照樣呼叫 trainStop.end，during 剩下的拍 start → end 跑完——跳下車的 jump.end 把他放到開關箱前（SWITCH_FRONT），不丟錯
const trainLikely = s => hasTrain(s.lv, s.flags);
// 電工登場（計畫 16）：hold 住 Lv7 的宣告（日常不從入口補人），從 at 把他生出來（不閃、不佔時間，之後由劇本帶著走）。
// 他已經在了（舞台早就到 Lv7：合成測試先瞬間演過一次 6 → 7）就不生第二個——這時沒有東西 hold 得住，spawnHeld 會丟錯；劇本照常叫現在這個他
function enter(B, e, at) {
  const spawn = B.spawn('bulb.electrician', at), start = spawn.start;
  spawn.start = c => (c.roster.members('bulb.electrician').length ? false : start(c));
  return [B.apply(e, { only: ['bulb.electrician'], hold: ['bulb.electrician'] }), spawn];
}
// 走到站前 ‖ 列車進站：兩邊同時開始，列車停在站上等他走到（during 先等 wait 秒）再跳上車頂。
// 拍開始時才知道他要走多久、列車多久到（trainRun 跟 trainStop 同一幀算，數字一樣），所以 together 在 start 才建
function board(B, who) {
  let inner = null;
  return {
    kind: 'board', dur: c => (inner ? inner.dur(c) : 0),
    start(c) {
      const m = who(c); if (!m || !B.trainRuns(c)) return false;
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
// 列車在島那頭只停 0.1 秒：他一起跳就倒車回環上（跳下車的落點是固定的開關箱前，不跟著車）。
// 演到時列車停了（安全網，見 trainLikely）：start 回 false，trainStop.end 把 during 跑完、jump.end 把他放到開關箱前
function ride(B, who, during) {
  let riding = true;
  const [off, ...rest] = during, start = off.start;
  off.start = c => { riding = false; return start(c); };
  const T = B.trainStop({ spur: 'windmill', launch: true, arrive: RIDE_WITHIN, spurSpeed: RIDE_SPUR, stop: 0.1, during: [off, ...rest] });
  const begin = T.start, step = T.step;
  T.start = c => { if (!B.trainRuns(c)) return false; riding = true; return begin(c); };
  T.step = (k, dt, c) => { step(k, dt, c); const m = riding ? who(c) : null; if (m) c.roster.setPose(m, { ...B.ridePose(c, SEAT_CAR, SEAT_OFF), walking: false }); };
  return T;
}
// 套用的估計長度照真的閃幾個零件算（trainStop 的 during 用估計長度排時間；估短了 LEVEL UP 會被截掉）
const applyN = (B, e, only, n) => Object.assign(B.apply(e, { only }), { estimate: () => BLINK });

export const script = {
  // 假升級（wait 事件列到電燈，turn.js）：第 1 段平移到中心格、閃白那一份；第 2 段回全景、外圈四格一格一格閃白；
  // 超過 IDLE_MAX、或已經鎖住（停電）回 []（turn.js 照舊不演、不平移）。每段 ≤ SCRIPT_MAX
  idle(e, s, ctx) {
    const { B } = ctx, n = idleOf(s);
    if (n > IDLE_MAX || s.flags?.blackout) return [];
    const cells = IDLE_STAGES[n - 1];
    if (n === 1) return [B.focus(cells[0]), B.apply(e, { only: [idleKey(cells[0])] }), B.wait(IDLE_HOLD)];
    return [B.focus('home'), ...cells.flatMap(c => [B.apply(e, { only: [idleKey(c)] }), B.wait(SWEEP_STEP)]), B.wait(IDLE_HOLD)];
  },
  // 第一盞路燈自己長出來 → 停一下 → 燈頭上 ♪（同鮮奶放下的節奏；計畫 16 起沒有電工走過來敲）
  placed(e, s, ctx) {
    const { B } = ctx;
    return [B.apply(e), B.wait(0.9), B.bubble(B.partHead('bulb.main', 0.6, ctx), '♪', 1.0), B.wait(1.0)];
  },
  grow: {
    // 燈光沿環掃一圈（計畫 16 §設計 4，保留「繞全島一圈」、沒有人走）：從第一盞路燈那站開始照 LAMP_STOPS 一站一站閃白亮起
    //   （燈桿跟第 0 站一起），鏡頭跟著站換格（同一格連續的站不重複平移）→ 九站掃完回全景 → 夜市第一攤開張 → LEVEL UP
    2(e, s, ctx) {
      const { B } = ctx;
      const sweep = LAMP_STOPS.flatMap((_, k) => [
        ...(k && sameCell(stopCell(k), stopCell(k - 1)) ? [] : [B.focus(stopCell(k))]),
        B.apply(e, { only: [...(k === 0 ? ['bulb.posts'] : []), `bulb.lamps.${k}`] }), B.wait(SWEEP_STEP),
      ]);
      return [...sweep, B.focus('home'), B.apply(e, { only: ['bulb.market'] }), B.wait(0.4), B.levelUp('bulb')];
    },
    // 霓虹、傍晚（全島的事，回全景）：全島燈頭同一刻換成霓虹（粉藍黃交錯）、燈籠發光 → 天色淡入傍晚 → LEVEL UP
    3(e, s, ctx) {
      const { B } = ctx;
      return [B.focus('home'), B.apply(e), B.wait(0.8), B.world({ time: TIMES.dusk }), B.wait(1.2), B.levelUp('bulb')];
    },
    // 第二攤：兩個小學生快步走去夜市前排隊 → 閃白第二攤開張、一起 ♥（鏡頭對著夜市格；計畫 16 起夜市就在中心格，LEVEL UP 不再轉）。
    //   沒有人可叫（見 nearestPair）：照樣等 QUEUE_MIN、開張那拍停 0.4（♥ 的長度），一級不短於 3 秒
    4(e, s, ctx) {
      const { B } = ctx, pair = nearestPair(), pupil = i => c => pair(c)[i] ?? null, slot = i => c => c.nav.slots(MARKET_FRONT, 2, 0.15)[i];
      // 這一級只在演的時候把小學生拿在手上；演完用 hurry 放回日常（走路速度、焦點不在小學那格也照走，同颱風躲雨走出來）——
      //   一般的 home 在焦點外會站在夜市前等焦點回來，下一回合鮮奶 4 叫他們時還在中心格（命中最後一輪鮮奶 4 拖到 7.2 s）
      return [
        // 閃白第二攤的同時一起 ♥（裁決 R15 一級 ≤ 4.5 s）
        B.focus(MARKET_CELL), B.together([...[0, 1].map(i => B.walk(pupil(i), slot(i), { speed: QUEUE_SPEED })), B.wait(QUEUE_MIN)]),
        B.together([B.apply(e), B.wait(0.4), ...[0, 1].map(i => B.bubble(pupil(i), '♥', 0.4))]),
        hurryHome([pupil(0), pupil(1)]), levelUpAtHome(B, () => MARKET_CELL),
      ];
    },
    // 全島 LED（棒球 ≥4）：回全景 → 停一下 → 閃白全島 LED、101 燈光秀 → 入夜 → LEVEL UP（全景裝得下整島與 101）
    5(e, s, ctx) {
      const { B } = ctx;
      return [B.focus('home'), B.wait(0.6), B.apply(e), B.world({ time: TIMES.night }), B.wait(1.4), B.levelUp('bulb')];
    },
    // 變電所（晶片 ≥3 或代幣 ≥3）：鏡頭到中心格 → 變電所長出來（儲能櫃、變壓器亮淡藍）→ ♪ 冒在變電所上（嗡嗡響）→ LEVEL UP（冒在變電所上，計畫 15 D）
    6(e, s, ctx) {
      const { B } = ctx;
      return [B.focus(HOME_CELL), B.apply(e), B.wait(0.6), B.bubble(B.partHead('bulb.substation', 0.7, ctx), '♪', 0.8), B.wait(0.6), B.levelUp('bulb')];
    },
    // ★◆ 離岸風電啟動（列車載電工去：有環狀線（代幣 ≥4）、沒淹水就行，高鐵或地鐵都載）：鏡頭到捷運站 → 電工從車站門口走出來（計畫 16：他這一級才登場）、
    //   走到站前、列車進站，他跳上車頂 → 鏡頭飛去風車島，
    //   列車沿環開到支線、開進島上 → 他跳到開關箱前按下開關 → 風車閃白開始轉 → 回全景、燈塔與光束閃白、守塔人出來（列車倒回環上）→ LEVEL UP。
    //   之後他就住在風車島上（島上的小圈）。
    //   代幣還沒到 7（支線還沒通，選擇帶動升級之後賽博正解就是這樣）：鏡頭飛去風車島的同時風車島那條支線從環上長出去
    //   （0.8 s，跟代幣 Lv7 一樣；列車從站前開到支線口比它慢，追不上還沒長好的那一段）
    //   沒有列車在跑（見 trainLikely；Task 6a 修正輪裁決）：不叫他走去搭車——鏡頭飛去風車島的同時他直接生在島上的家（不閃）、
    //   風車與燈塔跟著套用閃白、回日常、回全景、LEVEL UP。之後的燈泡 8 他就在島上的開關箱旁。
    //   登場那兩拍（hold、spawn）放進第一拍的 together、排在 focus 後面：turn.js 看劇本第一拍有 focus 就不另外補一次平移（opensOnFocus），
    //   together 依序 start，生出來之後 board 才找得到他
    7(e, s, ctx) {
      if (!trainLikely(s)) { const { B } = ctx, m = el(ctx); return [B.together([B.focus(WIND, { zoom: ISLAND_ZOOM }), ...enter(B, e, ISLAND_HOME)]), B.apply(e), B.home(m), B.focus('home'), B.levelUp('bulb')]; }
      const { B } = ctx, m = el(ctx), SPUR = 'token.spur.windmill',
        prev = s.prev ?? { lv: { ...s.lv, bulb: 6 }, flags: s.flags };   // 劇本單獨建拍（測試）沒有 prev：當作從 Lv6 長上來
      const lay = tokenView(prev.lv, prev.flags)[SPUR] ? [] : [B.apply(e, { only: [SPUR], blink: false }), B.scaleIn(SPUR, { axis: 'z', dur: 0.8 })];
      return [
        // 鏡頭飛去站前的同時他從車站門口走出來、出發，列車同時趕來
        B.together([B.focus(TOKEN_CELL), ...enter(B, e, c => c.nav.nearestWalkable(STATION_DOOR)), board(B, m)]),
        ...lay.slice(0, 1),
        B.together([B.focus(WIND, { zoom: ISLAND_ZOOM }), ...lay.slice(1), ride(B, m, [
          // 按下開關 → 風車閃白開始轉 → 回全景（裁決 R17 ◆ ≤ 8 s：不再停 1 秒等鏡頭，燈塔在鏡頭飛往全景時亮）
          B.jump(m, () => SWITCH_FRONT, JUMP), B.gesture(m, 'build', SWITCH_PUSH, { at: SWITCH }), applyN(B, e, ['sat.windmill', 'sat.windmill.stage1'], 1),   // 第二支風機與電池屋（離島三段，tagAlong）跟風車同一拍閃白、不多佔時間
          B.focus('home'),
          B.home(m), B.together([applyN(B, e, ['sat.lighthouse', 'sat.beam', 'sat.keeper', 'sat.lighthouse.stage1'], 2), B.levelUp('bulb')]),
        ])]),
      ];
    },
    // ★ 海底電纜（晶片 ≥5）：鏡頭到風車島 → 電工走到開關箱前一敲（接上電纜）→ 電纜閃白鋪好（晶片 <6 還沒通電：暗的）→ ♪ → 回全景看整條電纜 → LEVEL UP
    8(e, s, ctx) {
      const { B } = ctx, m = onIsland(ctx);
      return [
        // 裁決 R15（颱風回合 ≤ 50 s）：一敲 1.0 → 0.8、♪ 1.0 → 0.8；Task 6a：♪ 0.8 → 1.0——回到 GROW 之後正解的晶片 6 在燈泡 8 之前
        //   （同一回合），電纜已經亮著鋪好、這拍沒有東西閃，整級剩 3.0 s（一級 3–4.5 s）；燈泡 8 的回合 54／64 s（上限 84）
        B.focus(WIND, { zoom: ISLAND_ZOOM }), B.walk(m, SWITCH_FRONT), B.gesture(m, 'build', 0.8, { at: SWITCH }),
        B.apply(e, { only: ['chip.cable'] }), B.bubble(m, '♪', 1.0), B.home(m),
        B.focus('home', { hold: 0.6 }), B.levelUp('bulb'),   // 全景停 1.0 → 0.6（裁決 R17，颱風回合 ≤ 50 s）
      ];
    },
    // ◆ 全島賽博霓虹（代幣 ≥9）：鏡頭到車站格 → 站務員 ！ → 懸浮月台的燈條與電視牆閃白亮起 → 回全景，同時橋面燈條、風車林一份份亮起
    //   （霓虹從第一份到最後一份 ≤ 1.5 秒；夜市招牌 2026-11-04 拿掉了，夜市 Lv9 不再變）→ 全景定格 → 大家 ♪ → LEVEL UP
    9(e, s, ctx) {
      const { B } = ctx, staff = c => c.roster.members('token.staff').find(m => !m.hidden) ?? null;
      const cheer = c => [...c.roster.members('token.staff'), ...c.roster.members('landmarks.islanders')].filter(m => !m.hidden);
      return [
        B.focus(TOKEN_CELL), B.bubble(staff, '！', 0.8),
        B.apply(e, { only: ['bulb.neon.station'] }),
        B.together([B.focus('home', { hold: 2.4 }), B.apply(e, { only: ['bulb.neon.bridges', 'sat.forest.stage2'] })]),
        B.together([0, 1, 2, 3].map(i => B.bubble(c => cheer(c)[i] ?? null, '♪', 1.0))),
        B.levelUp('bulb'),
      ];
    },
  },
  fx: () => null,   // 燈泡自己沒有 onLevel
};
// ◆ 關鍵節點（裁決 R11）：跳級的第二級落在這兩級，也演完整劇本（turn.js）
script.grow[7].key = script.grow[9].key = true;

// 拜訪點（計畫 6 設計 §4，同 5b 之前的趕工）：Lv1–3 路燈（錨點）、Lv4 夜市、Lv5 101（全島 LED 燈光秀）、Lv6 變電所（正面 SUBSTATION_FRONT）、
// Lv9 霓虹 → 夜市（三處霓虹裡唯一的「店面」）。Lv7 風車島、Lv8 海底電纜在主島外 → null（不插拜訪）
export function visitSpot(n) {
  if (n >= 1 && n <= 3) return { ...AT, r: 0.8 };
  if (n === 4 || n === 9) return { ...MARKET, r: 1.0 };
  if (n === 5) return { ...TOWER, r: 1.1 };
  if (n === 6) return { ...SUBSTATION, r: SUBSTATION_FRONT.z - SUBSTATION.z };
  return null;
}
