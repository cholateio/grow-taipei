// 晶片（物品 v2 §4.3，max 9）：北士科工地 → 冒煙的廠房、2 個工程師走去 101 → 園區三棟玻璃盒、多一個工程師（3 個穿外套的照樣通勤）
//   → 「星群」總部（弧形玻璃）→ 太陽能板屋頂＋變電站（小房子＋電線桿，煙囪不冒煙了）→ ★ 廠房通電（海底電纜從風車島接進變電站、發光、廠房燈全亮）
//   → ★ 101 頂端長出矽盾天線（零件由列車運進來）→ ★ 矽盾測試（罩子閃三下又收起，全島抬頭）→ ★◆ 矽盾待命（罩子淡淡常駐、101 每 3 秒閃一圈）。
// 天線與罩子是 101 的零件（tower.js 照 lv.chip 畫 tower.antenna、tower.shield），這裡的劇本用 apply 的 only 叫它們出來。
// 廠房、煙囪、太陽能板用 Kenney City Kit Industrial 的 glb（零件 kind 'campus'，同鮮奶的校舍），經載入器重上色票；
//   電線桿、海底電纜是程式畫的（§7.2 找不到 CC0 的那幾樣）；玻璃盒、總部圓頂、變電站也是程式畫的（玻璃要一整塊玻璃色）。
// 海底電纜（零件 kind 'cable'，parts.js）歸晶片管：燈泡 Lv8 先鋪好（暗），晶片 Lv6 通電發光（控制者裁決：燈泡只點亮風車與燈塔）。
// 老鼠 ≥2 且晶片 ≥3：其中一個工程師變成拿放大鏡的「鼠類偵防師」，跟著老鼠；老鼠坐上環狀線的車時在捷運站北側等牠們下車。
// 劇本（§6）：一級 3–5 秒（走到位、一個動作、閃白、LEVEL UP）；◆ Lv9 6–10 秒、回全景定格。
import { anchorWorld, routeBetween, frontOf } from './anchors.js';
import { SATELLITES, axialToWorld, TOP, WATER_Y } from '../scene/hex.js';
import { builders as towerBuilders } from './tower.js';
import { builders as milkBuilders } from './milk.js';
import { SHIELD_TEST_DUR } from './parts.js';
import { C, roofColor, rebuilt, offset } from './palette.js';
import { lookUp } from '../show/crowd.js';
import { ratMode } from './rat.js';   // 只在函式裡用（唯一正解之後 rat.js 不再 import 這裡：賽博 Lv4 不走工程師路線了）

export const id = 'chip';
export const labelY = 1.5;
const AT = anchorWorld('chip'), TOWER = anchorWorld('tower');
// 廠門外（工程師通勤的起點）：每一級的建築最南到 z +1.0，外擴 PAD 後 1.12；門口站在 1.25，不站進建築裡（§14.1）
const DOOR = offset(AT, -0.3, 1.25), DOOR_WEST = offset(AT, -1.45, 1.25);   // DOOR_WEST：沿園區南緣往西走到這裡才轉去橋頭
// 蓋東西站的鏡頭側距離（§14）：工地的三角錐到 z +1.06、外擴 PAD 後 1.18，鏡頭方向（z 分量 0.96）1.3 才站得到外面
export const FRONT_R = 1.3;
const SITE = offset(TOWER, 0.9, 1.0);             // 101 工地（工人從這裡走過來）：101 南側、河濱公園北邊那條走得到的空地
export const FOOT = offset(TOWER, 0.95, 0.25);    // 101 腳下（通勤的終點、天線零件送到這裡）
// 入口（§13.2）：工人從 101 工地來；工程師（與偵防師）從廠門外靠橋那側來——廠房西北、上台地那座階梯旁
export const WORKER_ENTRY = SITE;
export const ENGINEER_ENTRY = [offset(AT, -1.2, -1.4), offset(AT, -0.9, -1.55)];
// 偵防師等老鼠下車的地方：捷運站北側（不在散步客繞的西橋頭、不在工程師通勤的園區南緣）——老鼠坐在環狀線的車上時追不到，站在這裡等
const WATCH = { ...offset(anchorWorld('token'), 0.3, -1.0), yaw: 0 };
// 偵防師盯鼠窩的地方：窩在球場格巨蛋正東（2026-10-28 錄影修正：從東南角搬過來，離巨蛋門口的觀眾 ≥ 1.09），他站在隔壁捷運格裡、
// 往捷運格那座橋的北側看著窩（選擇帶動升級：老鼠放下當回合就生窩，常常碰上大巨蛋 Lv8 坐新線來的觀眾——球場格已經 8 個人，
// 他再跟進去就 9 個，人數預算一格 ≤ 8）。不站橋口（第二輪審稿：原本 (1.7, 0) 在橋的中線上、離橋端 0.07，過橋的人讓不開）：
// 離每個橋端、電工主路都 0.58
const NEST = anchorWorld('rat');
export const NEST_WATCH = { ...offset(NEST, 1.8, -0.55), yaw: Math.atan2(-1.8, 0.55) };
const CHIP = [1, 0], TOKEN = [0, 1], TOWER_CELL = [0, 0];   // 鏡頭對的格子：園區、捷運站、101
// 工程師上下班：廠門 → 沿園區南緣往西 → 橋 → 101 腳下（開放路徑，走到底折返）
const COMMUTE = routeBetween([1, 0], DOOR, [0, 0], FOOT);
export const ENGINEER_ROUTE = [COMMUTE[0], { ...DOOR_WEST, y: COMMUTE[0].y }, ...COMMUTE.slice(1)];

// ── 模型（Kenney City Kit Industrial）：size = glb 原始包圍盒（x, y, z）；roof = 平屋頂在全高的幾成（太陽能板放這裡）──
export const MODELS = {
  factory: { path: 'kenney/industrial/building-a.glb', size: [2.08, 1.47, 1.24], roof: 1.28 / 1.47 },
  chimney: { path: 'kenney/industrial/chimney-medium.glb', size: [0.45, 1.92, 0.45] },
  solar: { path: 'kenney/industrial/solar-panel-landscape.glb', size: [0.71, 0.26, 0.40] },
};
// 色票圖的格子顏色（'#rrggbb'）分族（在遊戲裡每族塗一個鮮豔色看過）：藍窗；近黑那族是廠房的牆面與屋頂 → 奶油牆；
// 灰藍那族是樓層之間的飾條與屋頂邊 → 屋頂色（颱風重建換色）；淺色那族是一樓牆腳與煙囪的條紋 → 珊瑚；煙囪的橘條 → 白
const WINDOW = '^#[7-9a][0-9a-f][a-c][0-9a-f][d-f][0-9a-f]$';
const industrialTint = roof => ({
  [WINDOW]: C.window, '^#ff': C.white, '^#[34]|^#5[0-2]': C.wall, '^#[5-9][0-9a-f][5-9]': roof, '^#[a-f]': C.coral,
});
// 太陽能板：藍紫色的板面換深藍、鋁框換路緣色
const SOLAR_TINT = { '^#[5-7][0-9a-f][5-8][0-9a-f][9a-e]': C.navy, '^#[7-9][0-9a-f][9a][0-9a-f][d-e]': C.blue, '^#': C.curb };
const model = (key, pos, h, extra = {}) => ({ path: MODELS[key].path, pos, h, ...extra });
// 一棟模型的佔地（照縮放後的尺寸）
function footprintOf(m) {
  const k = Object.values(MODELS).find(x => x.path === m.path), s = m.h / k.size[1];
  return { x: m.pos[0], z: m.pos[2], w: k.size[0] * s, d: k.size[2] * s };
}
// 廠房在園區西北（後排），煙囪立在它的平屋頂東南角（落地的話會和廠房、玻璃盒、總部圍出一塊走不出去的死角）；Lv5 起屋頂後排三片太陽能板
const FACTORY = model('factory', [-0.45, 0, -0.65], 0.85), ROOF_Y = MODELS.factory.roof * FACTORY.h;
const CHIMNEY = model('chimney', [0, ROOF_Y, -0.45], 0.9);
const SOLAR = [-0.85, -0.45, -0.05].map(x => model('solar', [x, ROOF_Y, -0.82], 0.13, { tint: SOLAR_TINT }));

// ── 園區（程式畫的玻璃）：Lv3 三棟玻璃盒；Lv4 起前排中間那棟換成「星群」總部的弧形玻璃圓頂。Lv6 起每棟的窗帶亮暖光 ──
const BOXES = [{ x: 0.95, z: -0.45, w: 0.55, h: 1.2 }, { x: 0.05, z: 0.45, w: 0.6, h: 0.8 }, { x: 1.0, z: 0.5, w: 0.5, h: 1.35 }];
const HQ = { x: 0.05, z: 0.35, rx: 0.7, rz: 0.52 };
const SIGN = { x: -0.45, z: 0.95 };   // 廠門旁的招牌：貼著總部（Lv3 是前排玻璃盒）的前緣，外擴後和它連成一塊——中間不留夾縫（颱風天躲在那裡的人走不出來）
function campus(n) {
  const lit = n >= 6, boxes = n >= 4 ? [BOXES[0], BOXES[2]] : BOXES, parts = [];
  for (const b of boxes) parts.push(
    { kind: 'box', pos: [b.x, b.h / 2, b.z], scale: [b.w, b.h, b.w], color: C.glass },
    { kind: 'box', pos: [b.x, b.h * 0.62, b.z + b.w / 2 + 0.01], scale: [b.w * 0.8, b.h * 0.5, 0.02], color: lit ? C.warm : C.window, ...(lit ? { glow: C.warm } : {}) },
  );
  if (n >= 4) parts.push(
    { kind: 'cylinder', pos: [HQ.x, 0.05, HQ.z], scale: [2 * HQ.rx, 0.1, 2 * HQ.rz], color: C.curb },
    { kind: 'dome', pos: [HQ.x, 0.1, HQ.z], scale: [2 * HQ.rx - 0.1, 0.85, 2 * HQ.rz - 0.1], color: C.glass },
    { kind: 'box', pos: [HQ.x, 0.2, HQ.z + HQ.rz - 0.04], scale: [0.36, 0.22, 0.04], color: lit ? C.warm : C.window, ...(lit ? { glow: C.warm } : {}) },   // 總部大門
  );
  // 園區招牌：白板 + 珊瑚色字條（廠門旁）
  parts.push({ kind: 'box', pos: [SIGN.x, 0.25, SIGN.z], scale: [0.6, 0.3, 0.05], color: C.white }, { kind: 'box', pos: [SIGN.x, 0.27, SIGN.z + 0.03], scale: [0.44, 0.06, 0.02], color: C.coral });
  const footprint = [
    ...boxes.map(b => ({ x: b.x, z: b.z, w: b.w, d: b.w })),
    ...(n >= 4 ? [{ x: HQ.x, z: HQ.z, rx: HQ.rx, rz: HQ.rz }] : []),
    { x: SIGN.x, z: SIGN.z + 0.01, w: 0.6, d: 0.08, door: false },   // 招牌不是門
  ];
  return { parts, footprint, top: Math.max(...boxes.map(b => b.h), n >= 4 ? 0.95 : 0) };
}

// ── 變電站（Lv5）：園區東側兩棟玻璃盒之間的小房子＋變壓器礙子，兩根電線桿從玻璃盒背後把電拉到廠房屋頂；Lv6 通電礙子發淡藍光。
// 燈泡電工的主路沿晶片格外圈走（東邊那段在 x +1.81、330° 那盞燈的站位在 (1.56, −0.76)）：變電站與桿子外擴 PAD 後都不碰到 ──
const SUB = { x: 1.48, z: 0.03, w: 0.34, d: 0.32, h: 0.32 };
// 兩根桿子立在後排那棟玻璃盒（BOXES[0]，Lv3 起一直在）背面、它外擴後的範圍裡，自己不另外擋：細桿的外擴圓比走路格的一格小，
// 路線會擦著它走、每幀的防穿牆又擋住，下車走進來的老鼠就卡在桿子旁（審稿第 2 輪）。桿子比玻璃盒高，從鏡頭看得到桿頭與電線
const POLES = [{ x: 1.2, z: -0.8, h: 1.4 }, { x: 0.75, z: -0.8, h: 1.4 }];
const INSULATOR_Y = SUB.h + 0.1;
// 兩點之間的細線（box 沿 z 拉長）：rot = [atan2(−dy, dz), asin(dx / L), 0]（Euler XYZ）
const wire = (a, b, t = 0.014) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
  return { kind: 'box', pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], scale: [t, t, L], rot: [Math.atan2(-dy, dz), Math.asin(dx / L), 0], color: C.ink };
};
// 下垂的線：中點往下 sag，兩段
const sagging = (a, b, sag = 0.08) => { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - sag, (a[2] + b[2]) / 2]; return [wire(a, m), wire(m, b)]; };
function substation(n) {
  const lit = n >= 6, top = POLES.map(p => [p.x, p.h - 0.04, p.z]);
  const parts = [
    { kind: 'box', pos: [SUB.x, SUB.h / 2, SUB.z], scale: [SUB.w, SUB.h, SUB.d], color: C.wall },
    { kind: 'box', pos: [SUB.x, SUB.h + 0.02, SUB.z], scale: [SUB.w + 0.04, 0.04, SUB.d + 0.04], color: C.navy },
    { kind: 'box', pos: [SUB.x - 0.08, 0.12, SUB.z + SUB.d / 2 + 0.01], scale: [0.12, 0.2, 0.02], color: C.window },   // 門
    ...[-0.1, 0, 0.1].map(dx => ({ kind: 'cylinder', pos: [SUB.x + dx, SUB.h + 0.08, SUB.z], scale: [0.05, 0.12, 0.05], color: lit ? C.neonBlue : C.cream, ...(lit ? { glow: C.neonBlue } : {}) })),
    ...POLES.flatMap(p => [
      { kind: 'cylinder', pos: [p.x, p.h / 2, p.z], scale: [0.05, p.h, 0.05], color: C.wood },
      { kind: 'box', pos: [p.x, p.h - 0.04, p.z], scale: [0.26, 0.03, 0.04], color: C.wood },
    ]),
    ...sagging([SUB.x, INSULATOR_Y + 0.04, SUB.z], top[0]), ...sagging(top[0], top[1]), ...sagging(top[1], [FACTORY.pos[0] + 0.55, ROOF_Y + 0.02, -0.95], 0.06),
  ];
  return { parts, footprint: [{ x: SUB.x, z: SUB.z, w: SUB.w + 0.04, d: SUB.d + 0.04 }] };
}

// ── 海底電纜（§5）：風車島的風車腳下 → 島的東南岸下水 → 沿主島南側的海面繞半圈（半徑 7.6，在主島與環狀線之間、鏡頭那一側）
//   → 晶片格東岸的登陸桿（崖邊、燈泡電工主路的外側）→ 下垂跨過主路接進變電站的礙子。晶片還沒蓋變電站（< 5）時接到登陸桿腳下就停 ──
const satCentre = kind => { const s = SATELLITES.find(x => x.kind === kind), c = axialToWorld(s.q, s.r); return { x: c.x, y: TOP - 0.2, z: c.z }; };
const WINDMILL = satCentre('windmill');
export const LANDING = offset(AT, 2.0, 0.45);   // 登陸桿（晶片格東岸、崖邊）
const LANDING_H = 0.55, SEA_R = 7.6, SEA_Y = WATER_Y + 0.03;
function cablePath(landed) {
  const p = (x, y, z) => ({ x, y, z });
  const island = [p(WINDMILL.x + 0.25, WINDMILL.y + 0.02, WINDMILL.z + 0.3), p(WINDMILL.x + 1.2, WINDMILL.y + 0.02, WINDMILL.z + 1.0), p(WINDMILL.x + 2.0, SEA_Y, WINDMILL.z + 1.6)];
  const a0 = Math.PI - 0.2, a1 = 0.1, N = 28;
  const arc = Array.from({ length: N + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / N; return p(Math.cos(a) * SEA_R, SEA_Y, Math.sin(a) * SEA_R); });
  const shore = [p(LANDING.x + 0.3, SEA_Y, LANDING.z + 0.15), p(LANDING.x + 0.05, LANDING.y + 0.15, LANDING.z), p(LANDING.x, LANDING.y + LANDING_H, LANDING.z)];
  if (!landed) return [...island, ...arc, ...shore.slice(0, 2), p(LANDING.x - 0.05, LANDING.y + 0.03, LANDING.z - 0.05)];
  const ins = offset(AT, SUB.x, SUB.z, INSULATOR_Y + 0.04), top = shore.at(-1), mid = p((top.x + ins.x) / 2, (top.y + ins.y) / 2 - 0.1, (top.z + ins.z) / 2);
  return [...island, ...arc, ...shore, mid, ins];
}
const cable = (lit, landed) => ({
  kind: 'cable', at: LANDING, path: cablePath(landed), r: 0.05, lit, color: C.ink, glow: C.neonBlue, footprint: { r: 0.04 },
  parts: [{ kind: 'cylinder', pos: [0, LANDING_H / 2, 0], scale: [0.05, LANDING_H, 0.05], color: C.wood }, { kind: 'box', pos: [0, LANDING_H - 0.03, 0], scale: [0.04, 0.03, 0.16], color: C.wood }],
});

export function view(lv, flags = {}) {
  const n = lv.chip, at = AT, v = {};
  // 電纜：燈泡 Lv8 鋪好（暗的、還沒通電）或晶片 Lv6 通電；晶片沒放也照鋪（接到晶片格東岸）
  const wired = lv.bulb >= 8 || n >= 6;
  if (!n) return wired ? { 'chip.cable': cable(false, false) } : v;
  const roof = roofColor(C.navy, rebuilt(lv));
  if (n === 1) {
    const parts = [{ kind: 'box', pos: [0, 0.05, 0], scale: [1.2, 0.1, 1.0], color: C.cliff }];
    for (let i = 0; i < 8; i++) {
      const side = i >> 1, k = i % 2 ? 0.4 : -0.4, horiz = side % 2 === 0, s = side < 2 ? -0.8 : 0.8;
      parts.push({ kind: 'box', pos: horiz ? [k, 0.15, s] : [s, 0.15, k], scale: horiz ? [0.78, 0.3, 0.03] : [0.03, 0.3, 0.78], color: C.yellow });
    }
    for (const [x, z] of [[-0.95, 0.95], [-0.6, 1.0], [0.95, 0.9]]) parts.push({ kind: 'cone', pos: [x, 0.09, z], scale: [0.12, 0.18, 0.12], color: C.coral });
    v['chip.main'] = { kind: 'compound', at, parts };
    v['chip.crane'] = { kind: 'crane', at, height: 1.8, offset: [0.5, 0, -0.4], footprint: { x: 0.5, z: -0.4, w: 0.2, d: 0.2 } };   // footprint 擋塔架（at + offset）：0.2 外擴 PAD 後 0.44，剛好蓋住 0.4 的底座
    v['chip.worker'] = { kind: 'roster', at, n: 1, accessory: 'helmet', home: { kind: 'wander', at, r: 0.9, entry: WORKER_ENTRY } };
  } else {
    // 廠房＋煙囪（Lv6 起窗戶全亮）；Lv2–4 煙囪冒煙，Lv5 換太陽能就不冒了
    const lit = n >= 6 ? { glow: { [WINDOW]: C.warm } } : {};
    const models = [{ ...FACTORY, tint: industrialTint(roof), ...lit }, { ...CHIMNEY, tint: industrialTint(roof) }];
    const c = n >= 3 ? campus(n) : null, top = Math.max(ROOF_Y + CHIMNEY.h, c?.top ?? 0);
    v['chip.main'] = { kind: 'campus', at, models, labelY: top + 0.3, footprint: [footprintOf(FACTORY)] };   // 煙囪在屋頂上，不另外擋
    if (n <= 4) v['chip.smoke'] = { kind: 'smoke', at: offset(at, CHIMNEY.pos[0], CHIMNEY.pos[2]), n: 4, size: 0.14, rise: 1.0, offsetY: ROOF_Y + CHIMNEY.h + 0.05 };
    if (c) v['chip.campus'] = { kind: 'compound', at, parts: c.parts, footprint: c.footprint };
    if (n >= 5) {
      const sub = substation(n);
      v['chip.solar'] = { kind: 'campus', at, models: SOLAR, footprint: false };
      v['chip.substation'] = { kind: 'compound', at, parts: sub.parts, footprint: sub.footprint };
    }
  }
  if (wired) v['chip.cable'] = cable(n >= 6, n >= 5);
  if (n >= 2) {
    // 穿外套的工程師走上下班路線（開放路徑、走到底折返）：Lv2 兩個、Lv3 起三個。
    // 騎 YouBike 的四個 2026-10-30 拿掉了（計畫 9 §5、使用者「騎腳踏車人員可以拿掉，太擠了」）：四台走通勤路線在 101 腳下的死路擠成一坨，
    //   改繞園區的環又找不到位子——草地上的環躲不開這條通勤路線和拜訪站位（visitSpot 的鏡頭側）
    const detective = lv.rat >= 2 && n >= 3, k = (n >= 3 ? 3 : 2) - (detective ? 1 : 0);
    v['chip.engineers'] = { kind: 'roster', at, n: k, accessory: 'coat', home: { kind: 'path', path: ENGINEER_ROUTE, loop: false, speed: 0.45, entry: ENGINEER_ENTRY } };
    // 偵防師是從工程師裡轉過來的（原地閃白換放大鏡），日常改成跟著老鼠
    // 老鼠坐車（rat 的 'train' 模式）時改成在捷運站北側等（審稿第 2 輪：一直對著飛快的列車重新規劃只會在站旁的橋頭原地踏步、擋住散步客）
    // 老鼠還在窩裡（'nest'）時站在隔壁格邊上盯著窩，不跟進球場格
    const mode = ratMode(lv, flags), post = mode === 'train' ? WATCH : mode === 'nest' ? NEST_WATCH : null;
    if (detective) v['chip.detective'] = { kind: 'roster', at, n: 1, accessory: 'glass', from: 'chip.engineers',
      home: post ? { kind: 'stand', spots: [post], rescue: true, entry: ENGINEER_ENTRY[0] } : { kind: 'follow', key: 'rat.pack', dist: 0.6, entry: ENGINEER_ENTRY[0] } };
  }
  return v;
}

export const builders = { crane: towerBuilders.crane, campus: milkBuilders.campus };

// ── 劇本（§6）──
// 角色都是演到那一拍才找（還沒出來就回 null，那拍跳過）；once 找到第一次就記住，整段劇本同一個人。藏起來的人（颱風登陸躲進門裡）不算。
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };
const seen = (c, key) => c.roster.members(key).filter(m => !m.hidden);
const worker = () => c => seen(c, 'chip.worker')[0] ?? null;
const eng = i => c => seen(c, 'chip.engineers')[i] ?? null;
const ENGINEERS = c => c.roster.members('chip.engineers');
const nearestEng = p => once(c => seen(c, 'chip.engineers').sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z))[0] ?? null);
// 工程師（最多 3 個）一起轉頭看 p
const engineersLook = (B, p, dur = 1.0) => B.together([0, 1, 2].map(i => B.gesture(eng(i), 'look', dur, { at: p })));
// 偵防師（老鼠 ≥2 且晶片 ≥3）：apply 時名冊自己用 from 把一個工程師原地換成放大鏡；這裡補一拍 ！
// （老鼠那邊的劇本在老鼠 Lv2 成立時也補這一拍，哪邊先成立哪邊演）
const detective = (ctx, s) => (s.lv.rat >= 2 ? [ctx.B.bubble(c => c.roster.members('chip.detective')[0] ?? null, '！', 0.8)] : []);
// 零件自己演的動畫用 beats.js 的 B.replay（套用零件、同一拍歸零重演、end 跳到演完）
// 電纜通電：光從風車島那頭跑到變電站（零件的 userData.progress）
const surge = (B, e, dur) => B.replay(e, 'chip.cable', dur, {
  begin: o => { if (!o.userData.progress) return false; o.userData.progress(0); return true; },
  step: (o, k) => o.userData.progress(k), finish: o => o.userData.progress?.(1),
});
// 矽盾測試：罩子閃三下又收起（零件的 userData.test／finish）
const shieldTest = (B, e) => B.replay(e, 'tower.shield', SHIELD_TEST_DUR, {
  begin: (o, c) => { if (!o.userData.test) return false; o.userData.test({ speed: c.speed ?? 1 }); return true; }, finish: o => o.userData.finish?.(),
});
// 矽盾測試時全島抬頭：主島上看得到、在日常裡的小人（不含模型、坐車的、正在走進場的）都轉頭看 101；演到這拍才點名，最多 24 個
// （show/crowd.js 的 lookUp，最終章的宣告也用）。這級一開始就回全景，全島都在鏡頭裡，所以不看焦點格。release：看完馬上放回日常（不凍到回合結束）

export const script = {
  // 工地開工：閃白圍籬 → 工人從 101 工地走過來 → ♪ → 繞工地
  placed(e, s, ctx) {
    const { B } = ctx, w = worker();
    return [B.apply(e, { hold: ['chip.worker'] }), B.spawn('chip.worker', WORKER_ENTRY), B.walk(w, DOOR), B.bubble(w, '♪', 0.8), B.home(w)];
  },
  grow: {
    // 廠房：工人走到工地的鏡頭側揮鋤頭 → 閃白廠房（工人收工，走回 101 工地）→ 2 個工程師從廠門外（橋那側）出來上班
    2(e, s, ctx) {
      const { B } = ctx, w = worker();
      return [
        B.walk(w, c => frontOf(AT, FRONT_R, c.nav)), B.gesture(w, 'build', 1.2, { at: AT }),
        B.apply(e, { hold: ['chip.engineers'] }),
        B.spawn('chip.engineers', ENGINEER_ENTRY[0]), B.spawn('chip.engineers', ENGINEER_ENTRY[1]),
        B.home(ENGINEERS), B.levelUp('chip'),
      ];
    },
    // 園區：工程師轉頭看廠房旁的空地 → 閃白三棟玻璃盒、多一個人（老鼠 ≥2 時一個變偵防師）→ ♪
    3(e, s, ctx) {
      const { B } = ctx;
      // ♪ 0.9 → 0.7（計畫 5b 任務 4，第 6 回合 ≤ 50 s）
      return [engineersLook(B, offset(AT, 0.6, 0)), B.apply(e), ...detective(ctx, s), B.bubble(eng(0), '♪', 0.7), B.home(ENGINEERS), B.levelUp('chip')];
    },
    // 星群總部（鮮奶 ≥4：喝鮮奶長大的人才）：工程師圖框「鮮奶」→ 閃白弧形玻璃總部 → 大家轉頭看、♥
    4(e, s, ctx) {
      const { B } = ctx;
      return [B.bubble(eng(0), { icon: 'milk' }, 1.0), B.apply(e), B.together([engineersLook(B, offset(AT, HQ.x, HQ.z)), B.bubble(eng(1), '♥', 1.0)]), B.home(ENGINEERS), B.levelUp('chip')];
    },
    // 太陽能＋變電站（燈泡 ≥3）：煙囪的煙停了 → ！→ 屋頂閃白太陽能板（大家抬頭看）→ 閃白變電站與電線桿
    5(e, s, ctx) {
      const { B } = ctx;
      return [
        B.apply(e, { only: ['chip.smoke'] }), B.bubble(eng(0), '！', 0.8),
        B.apply(e, { only: ['chip.solar'] }), engineersLook(B, offset(AT, FACTORY.pos[0], FACTORY.pos[2])),
        B.apply(e), B.home(ENGINEERS), B.levelUp('chip'),
      ];
    },
    // ★ 廠房通電（燈泡 ≥8 海底電纜鋪好了）：回全景 → 電纜換成發光的、光從風車島一路跑進變電站 → 鏡頭回園區 → 廠房燈全亮、♪
    6(e, s, ctx) {
      const { B } = ctx;
      return [
        // surge 1.5 s：roster 的 live 不變式（偵防師與散步客不相碰、下車的老鼠不進建築）對整局的時間很敏感，審稿第 1、2 輪都是調時間才翻出來的；
        //   偵防師改成老鼠坐車時在站旁等之後 1.5、1.6 都過。任務 8 改了時間要再驗（見任務 6 報告）
        // 裁決 R17（颱風回合 ≤ 50 s）：光跑 1.5 → 1.2、♪ 與轉頭 0.9 → 0.7
        B.focus('home'), B.together([surge(B, e, 1.2), B.apply(e, { only: ['sat.windmill.stage2'] })]),   // 變電小站（離島三段）在全景裡跟著光閃白
        B.focus(CHIP), B.apply(e), B.together([B.bubble(eng(0), '♪', 0.7), engineersLook(B, offset(AT, FACTORY.pos[0], FACTORY.pos[2]), 0.7)]),
        B.home(ENGINEERS), B.levelUp('chip'),
      ];
    },
    // ★ 矽盾天線（代幣 ≥7）：零件搭列車來——鏡頭在站前，列車進站停下、站務員一敲（卸下箱子）→ 鏡頭轉去 101：
    //   離 101 腳下最近的工程師抱著箱子（圖框「晶片」）走到腳下 → 天線在塔頂閃白 → LEVEL UP 時轉回晶片格。
    //   （工程師平常在廠門與 101 腳下之間通勤，離站前都很遠；走過去要 4–5 秒，所以接箱子交給本來就站在月台旁的站務員）
    //   列車從它現在的位置趕來（最多 4.5 倍、減速進站，不瞬移）：剛開走的車要繞一整圈，最多 4.3 秒才到，所以這級最長約 6.9 秒。
    //   Task 6a（◆ ≤ 8 s：外星第 8 回合 6 → 7 合成一段 live 9.5 s——兩級的零件一起閃、工程師離 101 比較遠）：剛開過站不到半圈的車倒回來
    //   （同燈泡 Lv7 上車，back = π）、趕路的目標 4 → 2.5 s，鏡頭飛去站前的同時列車就趕來（together；列車最快也要 1 秒多才進站）
    7(e, s, ctx) {
      const { B } = ctx, staff = once(c => seen(c, 'token.staff')[0] ?? null), e0 = nearestEng(FOOT);
      return [
        B.together([B.focus(TOKEN), B.trainStop({ stop: 0.6, arrive: 2.5, back: Math.PI, during: [B.gesture(staff, 'knock', 0.6)] })]),
        B.together([B.focus(TOWER_CELL), B.walk(e0, FOOT), B.bubble(e0, { icon: 'chip' }, 0.8)]),
        B.apply(e), B.home(e0), B.together([B.focus(CHIP), B.levelUp('chip')]),
      ];
    },
    // ★ 矽盾測試：回全景 → 罩子出現、閃三下又縮回地面、全島的人轉頭看 101（看完就放回日常）→ LEVEL UP
    8(e, s, ctx) {
      const { B } = ctx, up = lookUp(B, TOWER, 1.2);
      return [B.focus('home'), B.together([shieldTest(B, e), ...up.look]), up.release, B.apply(e), B.levelUp('chip')];
    },
    // ★◆ 矽盾待命（颱風 ≥2：暴風圈下測過）：回全景 → 罩子從地面長起來、淡淡常駐 → 天線換成每 3 秒閃一圈（工程師 ！）
    //   → 全景定格（看一次 101 閃光）→ LEVEL UP
    9(e, s, ctx) {
      const { B } = ctx;
      return [
        B.focus('home'), B.apply(e, { only: ['tower.shield'], blink: false }), B.scaleIn('tower.shield', { axis: 'y', dur: 1.5 }),
        B.together([B.apply(e), B.bubble(eng(0), '！', 0.8)]),
        B.focus('home', { hold: 3.2 }), B.home(ENGINEERS), B.levelUp('chip'),
      ];
    },
  },
  fx: () => null,   // 晶片自己沒有 onLevel
  rep: (s, ctx) => ctx.roster.members('chip.engineers').find(m => !m.hidden) ?? ctx.roster.members('chip.worker').find(m => !m.hidden) ?? null,   // 代表（撲空找的人）：藏起來的人（躲進門裡）不算
  hasRep: lv => lv >= 1,   // 這一級有沒有代表（turn.js 排撲空的位子用，最終審稿 3）：Lv1 工人、Lv2 起工程師
};
// ◆ 關鍵節點（裁決 R11）：跳級的第二級落在這幾級，也演完整劇本（turn.js）。
// Lv7 天線、Lv8 矽盾測試（選擇帶動升級裁決 R6）：離島鏈是整局的主線，跳級變多之後兩級常是跳級的第二級（外星 6 → 7、賽博 6 → 8），
// 不標 ◆ 就看不到箱子搭車來、罩子閃三下
script.grow[7].key = script.grow[8].key = script.grow[9].key = true;

// 拜訪點（計畫 6 設計 §4，同 5b 之前的趕工）：Lv1 工地、Lv2 廠房（園區錨點）、Lv3 園區玻璃盒、Lv4 起星群總部、Lv5 變電站——站位半徑 FRONT_R。
// Lv6 海底電纜在海裡 → 敲上岸那頭的變電站；Lv7 天線（101 上）、Lv8 矽盾測試、Lv9 待命 → 總部（拜訪的是晶片自己那格）
const VISIT = { 1: AT, 2: AT, 3: offset(AT, 0.6, 0), 5: offset(AT, SUB.x, SUB.z), 6: offset(AT, SUB.x, SUB.z) };
export const visitSpot = n => (n >= 1 && n <= 9 ? { ...(VISIT[n] ?? offset(AT, HQ.x, HQ.z)), r: FRONT_R } : null);
