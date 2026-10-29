// 代幣（物品 v2 §4.1，max 10）：站牌＋小月台 → 小站（售票亭、站務員）→ 大車站（站體、站前廣場）→ 環狀線 3 節通勤車 → 5 節
//   → 高鐵（白底橘線）→ ★◆ 支線通到風車島與遊樂場島（列車開過去）→ 離島接駁車 → 豪華賽博站（霓虹站體、懸浮月台）
//   → ◆ 飛天車（Tesla Roadster 三台從屋頂斜坡起飛、繞 101 一圈、落回車站屋頂）。捷運淹水（代幣 ≤2 時颱風登陸）站體變游泳池。
// 列車用 Kenney Train Kit（subway／bullet，車頭、中間車、車尾），賽博站用 Quaternius Cyberpunk Kit（月台、欄杆、招牌），
//   都經載入器 tint 重上色票；飛天車是 kit 零件拼的 Roadster（零件 kind 'orbit' 的 model.parts，parts.js）。
// TRACK 與 trainPose 也給老鼠用（老鼠坐在車頂上）。ctx.rail 是共用的列車時鐘：offset 讓列車從站出發、停站；
//   trip（trainStop 的支線版在演時才有）＝列車正開在支線上：車頭在 trip.path 上第 s 公尺，後面的車廂還在環上。
// 劇本（§6）：一級 3–5 秒；◆ Lv7、Lv10 6–10 秒、最後回全景定格。
import { anchorWorld } from './anchors.js';
import { TOP, groundAt, axialToWorld, SATELLITES } from '../scene/hex.js';
import { C, roofColor, rebuilt, offset } from './palette.js';
import { createPathCursor, measurePath, locateOnPath } from '../scene/path.js';

export const id = 'token';
export const labelY = 1.0;
// 環狀線沿著主島外圍的水道繞（像淡水線沿河），橋墩立在水裡；放低、放外面才不會擋住島上的東西
export const TRACK = { radius: 8.3, y: TOP - 0.25 };   // 比島面低：從前面看只會切到島的側壁，不會切到建築
// 列車車廂高（Kenney Train Kit glb 縮放到這個高度）：2026-10-28 錄影修正 0.3 → 0.42（列車太小）。車廂長、寬、間距、
// 車頂座位（老鼠、小人坐車頂）、車頭泡泡的高度、接駁車都照 CAR_H 等比例——原本在 0.3 調好的比例不動
export const CAR_H = 0.42;
const K = CAR_H / 0.3;
export const GAP = 0.6 * K;   // 車廂間距（弧長）：車長約 1.7 × CAR_H（0.3 時長約 0.5、間距 0.6）
export const RIDE_Y = 0.6 * CAR_H;          // 車頂座位的高度（軌道面以上；roster 的 ride、beats 的上車都用這一個）
export const TRAIN_HEAD_Y = 0.5 * K;        // 車頭泡泡（列車當主角時的頭頂；0.3 時是 0.5）
const POOL = 0xa4d4da;
const AT = anchorWorld('token'), TOWER = anchorWorld('tower');
export const POST = offset(AT, 0.6, 0.55), DOOR = offset(AT, 0, 0.5);   // 站務員的崗位（站門口旁）、站門
// 名冊入口（§13.2）：站體北側（背面），站務員與泳客都從這裡繞過站體走來。計畫給的 offset(AT, 1.6, 0.9) 離崗位只有 1.06；
// 往外推到 ≥ 1.5 的點（+x、+z 那側）又會穿過珍奶攤車前的人龍。這一點離崗位 2.4、離泳客站位 ≥ 1.6，兩條正解每一刻都走得到，
// 走到崗位的路線離 Lv1–2 每個排隊站位 ≥ 0.3、不經過攤車前方
export const STAFF_ENTRY = offset(AT, -0.35, -1.25);   // 錨點北退 0.4 之後入口跟著縮回來（原 −1.65 會落在格邊 MARGIN 之外）

// 列車幾節：Lv4 環狀線 3 節、Lv5 起 5 節，之前沒有列車（老鼠搭車、車頂座位都看這個）
export const trainCars = n => (n >= 5 ? 5 : n >= 4 ? 3 : 0);

const ring = a => ({ x: Math.cos(a) * TRACK.radius, y: TRACK.y, z: Math.sin(a) * TRACK.radius, yaw: Math.atan2(-Math.sin(a), Math.cos(a)) });
// 第 i 節車廂在時間 t 的位置：逆時針繞島，角速度 speed（rad/s）。trip（列車開在支線上）：車頭在支線第 s 公尺，
// 第 i 節在 s − i·GAP；還沒轉進支線的車廂在環上支線入口（角 trip.a）後面
export function trainPose(t, i, { speed = 0.35, trip = null } = {}) {
  if (!trip) return ring(t * speed - i * GAP / TRACK.radius);
  const d = trip.s - i * GAP;
  return d >= 0 ? locateOnPath(trip.path, trip.lens, d, false) : ring(trip.a + d / TRACK.radius);
}

const pylon = (x, z, top = TRACK.y) => { const base = groundAt(x, z), h = top - base; return { kind: 'cylinder', pos: [x, base + h / 2, z], scale: [0.12, h, 0.12], color: C.curb }; };

// ── 支線（Lv7）：環上離衛星島最近的點往島上架高架。R10：風車島（電工搭車去開風車，燈泡 Lv7）與遊樂場島（Lv8 接駁車、小孩）——燈塔島沒有支線 ──
export const SPURS = ['windmill', 'playground'];
function spurLine(kind) {
  if (!SPURS.includes(kind)) throw new Error(`no spur to ${kind}`);
  const s = SATELLITES.find(x => x.kind === kind), c = axialToWorld(s.q, s.r), d = Math.hypot(c.x, c.z);
  return { ux: c.x / d, uz: c.z / d, from: TRACK.radius, to: d - 1.0, y0: TRACK.y, y1: TOP - 0.2 + 0.1 };
}
// 高架面離島心 r 處的高度：環上 TRACK.y，一路爬到島上
const deckY = (L, r) => L.y0 + (L.y1 - L.y0) * Math.min(1, Math.max(0, (r - L.from) / (L.to - L.from)));
// 接駁車走的中心線：從環上到島上（車身在路面上 0.1）
export function spurPath(kind) {
  const L = spurLine(kind);
  return [{ x: L.ux * L.from, y: L.y0 + 0.1, z: L.uz * L.from }, { x: L.ux * L.to, y: L.y1 + 0.1, z: L.uz * L.to }];
}
// 列車的支線行程：車頭在環上角 a（比徑向早 DELTA rad）沿切線轉出去（二次貝茲：切線 → 徑向），再沿徑向開到島那頭。
// 回傳 { kind, a, path, lens, total }；trainStop({ spur }) 把列車開到 total 那頭停住再倒回環上
const DELTA = 0.13;
export const SPUR_SPEED = 2.5;
export const SPUR_RUSH = 3.5;   // 代幣 Lv7 ◆ 那一趟的支線車速（計畫 5b 任務 4：◆ ≤ 8 s）   // 支線上的車速（每秒公尺），約跟環上一樣
export function spurTrip(kind) {
  const L = spurLine(kind), b = Math.atan2(L.uz, L.ux), a = b - DELTA, r1 = L.from / Math.cos(DELTA);
  const p0 = { x: Math.cos(a) * L.from, z: Math.sin(a) * L.from }, p1 = { x: L.ux * r1, z: L.uz * r1 }, p2 = { x: L.ux * (r1 + 0.5), z: L.uz * (r1 + 0.5) };
  const pts = Array.from({ length: 9 }, (_, i) => {
    const k = i / 8, q = (1 - k) ** 2, w = 2 * (1 - k) * k, e = k * k;
    return { x: q * p0.x + w * p1.x + e * p2.x, z: q * p0.z + w * p1.z + e * p2.z };
  });
  pts[0] = p0;
  pts.push({ x: L.ux * L.to, z: L.uz * L.to });
  const path = pts.map(p => ({ x: p.x, y: deckY(L, Math.hypot(p.x, p.z)), z: p.z })), lens = measurePath(path, false);
  return { kind, a, path, lens, total: lens.at(-1) };
}
// 支線零件（kind 'spur'）：at 在環上的徑向點，零件在本地座標裡沿 +z 往外（builders.spur 把整組轉到 bearing），
// 劇本才能用 scaleIn 沿 z 把它從環上「長」出去。8 段階梯狀的高架一路降到島上、每兩段一根橋墩；前面加支線入口的彎道
function spur(kind) {
  const L = spurLine(kind), bearing = Math.atan2(L.ux, L.uz), at = { x: L.ux * L.from, y: L.y0, z: L.uz * L.from }, seg = (L.to - L.from) / 8, parts = [];
  const local = p => { const vx = p.x - at.x, vz = p.z - at.z; return [vx * Math.cos(bearing) - vz * Math.sin(bearing), vz * Math.cos(bearing) + vx * Math.sin(bearing)]; };
  for (let i = 0; i < 8; i++) {
    const z = seg * (i + 0.5), y = (L.y1 - L.y0) * (i + 0.5) / 8;
    parts.push({ kind: 'box', pos: [0, y, z], scale: [0.3 * K, 0.08, seg * 1.05], color: C.cream });   // 路面寬照車寬放大（2026-10-28 列車加大，車廂不懸空）
    if (i % 2 === 1 && i < 7) { const q = pylon(L.ux * (L.from + z), L.uz * (L.from + z), L.y0 + y); parts.push({ ...q, pos: [0, q.pos[1] - L.y0, z] }); }
  }
  const curve = spurTrip(kind).path.filter(p => Math.hypot(p.x, p.z) < L.from + 0.6);
  for (let i = 1; i < curve.length; i++) {
    const [ax, az] = local(curve[i - 1]), [bx, bz] = local(curve[i]), len = Math.hypot(bx - ax, bz - az);
    parts.push({ kind: 'box', pos: [(ax + bx) / 2, 0, (az + bz) / 2], scale: [0.3 * K, 0.08, len * 1.1], rot: [0, Math.atan2(bx - ax, bz - az), 0], color: C.cream });
  }
  return { kind: 'spur', at, bearing, footprint: false, parts };
}

// ── 列車（Kenney Train Kit）：車頭 a、中間車 b／c、車尾是車頭轉半圈；車廂高 CAR_H（長約 1.7 × CAR_H，間距 GAP）──
// 色票圖的格子顏色（'#rrggbb'，sRGB）分族：紅色飾條、藍色（高鐵車頂與鼻）、淺藍車窗、橘色車燈、近黑（輪子、車底）、其餘灰藍車身分深淺兩段
const WINDOW = '^#(8[0-9a-f][a-b]|9[0-9a-f][b-c]|a[0-9a-f][c-d]|b[0-9a-f][d-e])';
const trainTint = (stripe, glass) => ({
  [WINDOW]: glass, '^#[b-e][0-9a-f][2-5]': stripe, '^#[56][0-9a-f][5-8][0-9a-f][b-d]': stripe, '^#ff': C.yellow,
  '^#[34]': C.ink, '^#[5-8]': C.curb, '^#[9a-f]': C.white,
});
const SUBWAY_TINT = trainTint(C.blue, C.glass);    // 北捷：白車身、藍飾條、淺色車窗
const BULLET_TINT = trainTint(C.coral, C.ink);     // 高鐵：白底橘線、深色車窗
function trainModels(kind, n) {
  const p = x => `kenney/train/train-electric-${kind}-${x}.glb`;
  const mids = n === 5 ? ['b', 'c', 'b'] : ['b'];
  return [{ path: p('a') }, ...mids.map(x => ({ path: p(x) })), { path: p('a'), ry: Math.PI }];
}

// ── 車站本體（compound）：每一級一份零件、footprint、頭頂高度 ──
const platform = (w, d, z = 0) => [
  { kind: 'box', pos: [0, 0.04, z], scale: [w, 0.08, d], color: C.curb },
  { kind: 'box', pos: [0, 0.086, z + d / 2 - 0.04], scale: [w, 0.012, 0.05], color: C.yellow },   // 月台邊的黃線
];
const signPost = (x, z) => [
  { kind: 'cylinder', pos: [x, 0.35, z], scale: [0.04, 0.7, 0.04], color: C.cream },
  { kind: 'box', pos: [x, 0.66, z], scale: [0.34, 0.14, 0.03], color: C.blue },
  { kind: 'cylinder', pos: [x - 0.1, 0.66, z + 0.02], scale: [0.08, 0.01, 0.08], rot: [Math.PI / 2, 0, 0], color: C.white },
];
const ticketMachine = (color = C.blue) => [
  { kind: 'box', pos: [0.6, 0.175, 0.3], scale: [0.2, 0.35, 0.2], color },
  { kind: 'cylinder', pos: [0.6, 0.3, 0.41], scale: [0.08, 0.02, 0.08], rot: [Math.PI / 2, 0, 0], color: C.neonBlue, glow: C.neonBlue },
];
const plaza = (floor, extra = []) => [
  { kind: 'box', pos: [0, 0.012, 0.9], scale: [1.5, 0.024, 0.7], color: floor },
  { kind: 'cylinder', pos: [-0.62, 0.08, 1.0], scale: [0.16, 0.16, 0.16], color: C.wood },   // 花台
  { kind: 'sphere', pos: [-0.62, 0.22, 1.0], scale: 0.2, color: 0x9bbd7e },
  ...extra,
];
export const ROOF_Y = 0.72;   // 賽博站的平屋頂（飛天車停這裡）
// 賽博站平屋頂的大小（相對錨點、置中）與後緣右側的天線桅杆（相對錨點）：站體零件、飛天車停車點、坡道、王冠鼠的測試都讀這兩個
export const ROOF = { w: 1.1, d: 0.82 }, ANTENNA = { x: 0.42, z: -0.3, r: 0.01, h: 0.46 };
function station(n, lv) {
  const roof = roofColor(C.navy, rebuilt(lv));
  if (n === 1) return { labelY: 0.95, footprint: { x: 0, z: 0, w: 0.9, d: 0.4 }, parts: [
    ...platform(0.9, 0.4), ...signPost(-0.3, 0.1),
    { kind: 'box', pos: [0.2, 0.17, -0.06], scale: [0.36, 0.04, 0.12], color: C.wood },   // 長椅
    ...[0.06, 0.34].map(x => ({ kind: 'box', pos: [x, 0.12, -0.06], scale: [0.04, 0.08, 0.1], color: C.wood })),
  ] };
  // 小站：月台、售票亭（斜屋頂）、售票機、站牌
  if (n === 2) return { labelY: 1.0, footprint: { x: 0.05, z: 0.075, w: 1.3, d: 0.65 }, parts: [
    ...platform(1.2, 0.6, 0.05), ...signPost(-0.45, 0.25),
    { kind: 'box', pos: [-0.15, 0.3, -0.05], scale: [0.55, 0.44, 0.4], color: C.wall },
    { kind: 'hip', pos: [-0.15, 0.6, -0.05], scale: [0.66, 0.2, 0.5], color: roof },
    { kind: 'box', pos: [-0.15, 0.3, 0.155], scale: [0.28, 0.14, 0.02], color: C.window },
    ...ticketMachine(),
  ] };
  const fp = { x: 0.1, z: 0, w: 1.2, d: 0.9 };
  // 大車站：站房＋圓頂＋拱門入口＋鐘＋售票機；站前廣場（沙色地坪、花台）
  if (n <= 8) return { labelY: 1.15, footprint: fp, parts: [
    { kind: 'box', pos: [0, 0.28, 0], scale: [1.0, 0.56, 0.75], color: C.wall },
    { kind: 'box', pos: [0, 0.58, 0], scale: [1.06, 0.05, 0.8], color: C.cream },
    { kind: 'dome', pos: [0, 0.6, 0], scale: [0.9, 0.6, 0.9], color: roof },
    { kind: 'box', pos: [0, 0.2, 0.38], scale: [0.34, 0.36, 0.02], color: C.window },
    { kind: 'cylinder', pos: [0, 0.47, 0.385], scale: [0.14, 0.02, 0.14], rot: [Math.PI / 2, 0, 0], color: C.yellow, glow: C.yellow },
    ...ticketMachine(), ...plaza(C.sand),
  ] };
  // 豪華賽博站：深藍站體、玻璃帶、霓虹藍邊條（柱、屋簷、天線燈）、平屋頂（停飛天車）；廣場換深色地坪、地上一條霓虹。
  // 粉紅霓虹在招牌與懸浮月台的欄杆（glb）上——站體只用一種發光色，整格 draw call 才壓得在 20 以內
  return { labelY: ROOF_Y + 0.45, footprint: fp, parts: [
    { kind: 'box', pos: [0, 0.33, 0], scale: [1.0, 0.66, 0.75], color: C.navy },
    { kind: 'box', pos: [0, 0.24, 0.38], scale: [0.84, 0.3, 0.02], color: C.glass },
    { kind: 'box', pos: [0, 0.15, 0.386], scale: [0.3, 0.3, 0.02], color: C.ink },
    { kind: 'box', pos: [0, ROOF_Y - 0.03, 0], scale: [ROOF.w, 0.06, ROOF.d], color: C.ink },
    ...[-0.5, 0.5].map(x => ({ kind: 'box', pos: [x, 0.33, 0.38], scale: [0.03, 0.66, 0.03], color: C.neonBlue, glow: C.neonBlue })),
    { kind: 'box', pos: [0, ROOF_Y, ROOF.d / 2], scale: [ROOF.w, 0.025, 0.025], color: C.neonBlue, glow: C.neonBlue },
    { kind: 'cylinder', pos: [ANTENNA.x, ROOF_Y + ANTENNA.h / 2, ANTENNA.z], scale: [ANTENNA.r * 2, ANTENNA.h, ANTENNA.r * 2], color: C.curb },
    { kind: 'sphere', pos: [ANTENNA.x, ROOF_Y + ANTENNA.h + 0.01, ANTENNA.z], scale: 0.05, color: C.neonBlue, glow: C.neonBlue },
    ...ticketMachine(C.ink),
    ...plaza(C.navy, [{ kind: 'box', pos: [0, 0.026, 1.2], scale: [1.5, 0.006, 0.03], color: C.neonBlue, glow: C.neonBlue }]),
  ] };
}
// 賽博站的懸浮月台（一個零件 kind 'deck'，裡面三個 Cyberpunk Kit glb，一起閃白、一起浮上來）：站前廣場上空 0.7 的月台（人從底下走）、
// 月台前緣的欄杆、立在月台上的霓虹招牌。pos 相對 DECK_AT；footprint 不算
export const DECK_AT = offset(AT, 0, 1.0, 0.7);   // 燈泡 Lv9 的月台霓虹也貼在這裡
// 月台的尺寸（相對 DECK_AT）：板面寬 w、深 d、頂面高 top；正中的招牌寬 signW；前緣欄杆在 z railZ、寬 railW（王冠鼠的站位讀這些，rat.js）
export const PLATFORM = { w: 1.4, d: 0.36, top: 0.08, signW: 0.62, railZ: 0.13, railW: 1.2 };
const DECK_MODELS = [
  { path: 'quat/cyberpunk/Platform_4x1_Empty.glb', pos: [0, 0, 0], h: 0.224 * PLATFORM.w / 3.863, tint: { '^LightGrey$': C.curb, '^Grey$': C.navy }, glow: { '^Texture_Signs$': C.neonBlue } },
  { path: 'quat/cyberpunk/Rail_Long.glb', pos: [0, PLATFORM.top, PLATFORM.railZ], h: 0.237 * PLATFORM.railW / 2.293, glow: { '^Black$': C.neonPink } },
  { path: 'quat/cyberpunk/Sign_1.glb', pos: [0, PLATFORM.top, 0], h: 0.462 * PLATFORM.signW / 1.294, tint: { '^Grey$': C.ink }, glow: { '^Texture_Signs$': C.neonPink } },
];
const DECK_RISE = 0.65;   // Lv9 劇本：懸浮月台從地面浮上來的高度

// ── 飛天車（Lv10）：致敬 2026-10-16 在 SpaceX McGregor 發表的 Tesla Roadster（設計 §4.6）——kit 零件拼的低扁楔形車身、一整片玻璃座艙、
// 四個輪子、車底 4 個冷氣體噴嘴（沒有後視鏡；零件見 roadsterParts）；紅、白、石墨灰三台停在賽博站屋頂（左中右）、車頭朝 101。
// 起飛：每台車頭前一條坡道（token.ramp 的三條 LANES：長 RAMP_LEN、仰角 RAMP_ANGLE、朝 101），在屋頂上開過去、車鼻碰坡、前輪上坡、
// 一路仰起來，前輪到坡頂離開坡道，車底噴白煙、拋物線拉高、繞 101 一圈、回屋頂四輪落地壓一下回彈（倒車入位：車頭一直朝 101）
// （orbit 零件的 ramp／squash，parts.js orbitPose／rampRest）。停好之後每台各自隔 rest 秒再飛一趟（錯開，天上常常有一台在飛）。
// 尺寸（§7 留給實作者）：車身 0.27 × 0.54（設計寫 0.3 × 0.6 的九成）——三台並排、各自車頭朝 101（彼此差約 4°），
// 0.3 × 0.6 在 1.1 × 0.82 的屋頂上會碰在一起、壓到後緣的天線；九成時車與車之間留 3 公分、離天線 11 公分
const ROADSTERS = [{ color: C.coral }, { color: C.white }, { color: C.ink }];
// 車身尺寸（車頭朝 +z、原點在輪底＝地面）：RIDE_H 底盤離地、CHASSIS_* 底盤、DECK_H 後車廂厚、HOOD_* 引擎蓋（往前壓低 HOOD_PITCH）；
// 輪子 r WHEEL_R、寬 WHEEL_W、前後在 ±WHEEL_Z、比車側凸出 WHEEL_OUT；輪轂 HUB_*；噴嘴高 NOZZLE_H、比底盤低 NOZZLE_DROP
export const CAR_W = 0.27, CAR_L = 0.54, RIDE_H = 0.015, CHASSIS_W = 0.22, CHASSIS_H = 0.035, DECK_H = 0.045;
export const HOOD_L = 0.28, HOOD_H = 0.04, HOOD_PITCH = 8 * Math.PI / 180;
export const WHEEL_R = 0.045, WHEEL_W = 0.035, WHEEL_Z = 0.17, WHEEL_OUT = 0.01, HUB_R = 0.02, HUB_W = 0.004;
const NOZZLE_H = 0.03, NOZZLE_DROP = 0.01;
const CHASSIS_TOP = RIDE_H + CHASSIS_H, DECK_TOP = CHASSIS_TOP + DECK_H, WHEEL_X = CAR_W / 2 + WHEEL_OUT - WHEEL_W / 2;
// 車底會碰地的點 [沿車頭方向, 離輪底高]：後保險桿底、後輪、前輪、車鼻底（坡道起飛的姿勢用這幾點算，parts.js rampRest）
export const CAR_CONTACTS = [[-CAR_L / 2, RIDE_H], [-WHEEL_Z, 0], [WHEEL_Z, 0], [CAR_L / 2, RIDE_H]];
// Roadster 的零件（尾聲的紅色跑車 finale.car 也用這一份）——楔形：
//   黑色底盤（全長、離地 RIDE_H）→ 車漆：後半是平的後車廂，前半是往下壓 8° 的引擎蓋（車鼻比後車廂低）→ 後緣一片薄擾流板；
//   座艙是一顆壓扁的深藍玻璃橢球（往後擺）；四輪在四角，比車側凸出、比底盤低（全景看得到），淺色輪轂；
//   車鼻兩顆白色小頭燈、車尾一條發光的紅色燈條（一台車只有一種發光色：一台 = 黏土一個 + 紅光一個 draw call）；
//   車底四個噴嘴（錐口朝下）夾在前後輪之間，比底盤低 NOZZLE_DROP
export const roadsterParts = color => [
  { kind: 'box', pos: [0, RIDE_H + CHASSIS_H / 2, 0], scale: [CHASSIS_W, CHASSIS_H, CAR_L], color: C.ink },   // 底盤（暗色車底）
  { kind: 'box', pos: [0, CHASSIS_TOP + DECK_H / 2, -CAR_L / 4], scale: [CAR_W, DECK_H, CAR_L / 2], color },   // 後車廂
  // 引擎蓋：後緣上沿接在後車廂頂，往前壓低 HOOD_PITCH
  { kind: 'box', pos: [0, DECK_TOP - HOOD_H / 2 - HOOD_L / 2 * Math.sin(HOOD_PITCH), CAR_L / 4], scale: [CAR_W, HOOD_H, HOOD_L], rot: [HOOD_PITCH, 0, 0], color },
  { kind: 'box', pos: [0, DECK_TOP + 0.006, -CAR_L / 2 + 0.015], scale: [CAR_W, 0.012, 0.03], color },   // 擾流板
  { kind: 'sphere', pos: [0, DECK_TOP, -0.06], scale: [0.17, 0.1, 0.26], color: C.navy },   // 座艙（深色玻璃）
  ...[[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => ({ kind: 'cylinder', pos: [sx * WHEEL_X, WHEEL_R, sz * WHEEL_Z], scale: [WHEEL_R * 2, WHEEL_W, WHEEL_R * 2], rot: [0, 0, Math.PI / 2], color: C.ink })),
  ...[[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => ({ kind: 'cylinder', pos: [sx * (WHEEL_X + WHEEL_W / 2 + HUB_W / 2 - 0.001), WHEEL_R, sz * WHEEL_Z], scale: [HUB_R * 2, HUB_W, HUB_R * 2], rot: [0, 0, Math.PI / 2], color: C.curb })),   // 輪轂
  ...[-1, 1].map(sx => ({ kind: 'box', pos: [sx * 0.09, 0.042, CAR_L / 2 + 0.003], scale: [0.045, 0.014, 0.008], color: C.white })),   // 頭燈
  { kind: 'box', pos: [0, DECK_TOP - 0.011, -CAR_L / 2 - 0.004], scale: [CHASSIS_W, 0.012, 0.008], color: C.red, glow: C.red },   // 尾燈條
  ...[[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => ({ kind: 'cone', pos: [sx * 0.06, RIDE_H - NOZZLE_DROP + NOZZLE_H / 2, sz * 0.08], scale: [0.035, NOZZLE_H, 0.035], color: C.curb })),   // 噴嘴
];
export const RAMP_LEN = 0.35, RAMP_ANGLE = 20 * Math.PI / 180;
const ORBIT = { speed: 2.5, legs: [1.4, 1.0], squash: 0.03 }, FLY_STAGGER = 0.3;
export const FLIGHT = ORBIT.legs[0] + 2 * Math.PI / ORBIT.speed + ORBIT.legs[1];   // 一趟飛行幾秒（屋頂＋坡道＋拉高 1.4、一圈、下降＋落地 1.0；跟以前的 speeder 一樣長）
// 停車點：屋頂左中右（間距 0.33、比錨點往前 0.1，車頭那側留給坡道）；各自車頭朝 101、繞圈的入口（phase）在
// 101 到停車點的那條線上——坡道、拉高、回程下降都是同一條直線
const parkOf = i => { const p = offset(AT, (i - 1) * 0.33, 0.1, ROOF_Y); return { ...p, yaw: Math.atan2(TOWER.x - p.x, TOWER.z - p.z) }; };
// 三條坡道（一台一條，世界座標）：坡腳在車鼻前 LANE_GAP、朝那台的車頭方向（101）、寬 LANE_W（比車身窄一點，前後輪都壓在坡面上）；
// 右邊那條離天線（ANTENNA）的距離由測試量。坡道的表面（parts.js rampSurface）跟零件用同一份 LANES
export const LANE_W = 0.26, LANE_T = 0.012, LANE_GAP = 0.02;
export const LANES = [0, 1, 2].map(i => {
  const park = parkOf(i), d = CAR_L / 2 + LANE_GAP;
  return { foot: { x: park.x + Math.sin(park.yaw) * d, y: park.y, z: park.z + Math.cos(park.yaw) * d }, yaw: park.yaw, len: RAMP_LEN, angle: RAMP_ANGLE, width: LANE_W };
});
function roadster(i) {
  const park = parkOf(i);
  return {
    kind: 'orbit', at: TOWER, r: 1.7 + 0.3 * i, h: 3.4 + 0.6 * i, phase: Math.atan2(park.z - TOWER.z, park.x - TOWER.x), ...ORBIT,
    park, ramp: { ...LANES[i], points: CAR_CONTACTS },
    model: { parts: roadsterParts(ROADSTERS[i].color) }, rest: 16 + 6 * i, footprint: false,
  };
}
// 坡道零件（Lv10，kind 'ramp'，三條併成一個 compound＝一個 draw call）：每條本地 +z 沿坡往上、原點在坡腳；坡面（頂面就是 rampSurface）、
// 兩條深色邊線（貼在坡面上，看得出是三條跑道）、一對支柱撐在屋頂上。builder 把每條轉到自己的 yaw、放到坡腳；手機（low: false）不畫
const STRUT_D = 0.12;   // 支柱離坡腳的水平距離（還在屋頂上）
export const laneParts = lane => {
  const A = lane.angle, half = lane.len / 2, up = [0, Math.cos(A), -Math.sin(A)], mid = [0, half * Math.sin(A), half * Math.cos(A)];
  const along = (n, x = 0) => [x + n * up[0], mid[1] + n * up[1], mid[2] + n * up[2]];   // 坡面中線上、沿法線 n
  const sh = STRUT_D * Math.tan(A);
  return [
    { kind: 'box', pos: along(-LANE_T / 2), scale: [lane.width, LANE_T, lane.len], rot: [-A, 0, 0], color: C.curb },
    ...[-1, 1].map(s => ({ kind: 'box', pos: along(0.002, s * (lane.width / 2 - 0.008)), scale: [0.012, 0.004, lane.len], rot: [-A, 0, 0], color: C.ink })),
    ...[-1, 1].map(s => ({ kind: 'box', pos: [s * (lane.width / 2 - 0.03), sh / 2, STRUT_D], scale: [0.02, sh, 0.02], color: C.ink })),
  ];
};
const rampSpec = () => ({ kind: 'ramp', at: offset(AT, 0, 0, ROOF_Y), lanes: LANES, footprint: false, low: false });

export function view(lv, flags) {
  const n = lv.token, at = AT, v = {};
  if (!n) return v;
  // 站體的 footprint（§14.1，錄影裡有人站進站體）；淹水時整個是泳池
  const st = station(n, lv);
  v['token.main'] = flags.flooded
    ? { kind: 'compound', at, footprint: { r: 0.65 }, parts: [
      { kind: 'cylinder', pos: [0, 0.05, 0], scale: [1.3, 0.1, 1.3], color: C.cliff },
      { kind: 'cylinder', pos: [0, 0.07, 0], scale: [1.12, 0.1, 1.12], color: POOL },
      { kind: 'box', pos: [0.6, 0.175, 0.3], scale: [0.2, 0.35, 0.2], color: C.blue },
    ] }
    : { kind: 'compound', at, labelY: st.labelY, footprint: st.footprint, parts: st.parts };
  // 站務員（Lv2 起 1 人、Lv8 起 2 人）站在站門口、面向外；淹水時站務員原地換成泳客（from），泳客共 2 人（人數預算 ≤ 3）。
  // 站位落在站體（含 PAD）裡就站到最近的可走點（rescue）
  if (flags.flooded) v['token.swimmers'] = { kind: 'roster', at, n: 2, accessory: 'none', from: 'token.staff', home: { kind: 'stand', spots: [{ ...offset(at, -0.3, 0.3, -0.12), yaw: 0.5 }, { ...offset(at, 0.3, 0.15, -0.12), yaw: -2 }], rescue: true, entry: STAFF_ENTRY } };
  // 站務員一直只有一位：Lv8 原本多一位（站門另一側），人數預算（裁決 R16，全島 ≤ 30）拿掉——鮮奶節那一回合全島剛好多一個人
  else if (n >= 2) v['token.staff'] = { kind: 'roster', at, n: 1, accessory: 'uniform', home: { kind: 'stand', spots: [{ ...POST, yaw: 0 }], rescue: true, entry: STAFF_ENTRY } };
  if (n >= 9 && !flags.flooded) v['token.deck'] = { kind: 'deck', at: DECK_AT, models: DECK_MODELS, footprint: false };
  if (n >= 4) {
    const origin = { x: 0, y: 0, z: 0 }, parts = [{ kind: 'rail', pos: [0, TRACK.y, 0], scale: TRACK.radius * 2, rot: [Math.PI / 2, 0, 0], color: C.cream }];
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + 0.13; parts.push(pylon(Math.cos(a) * TRACK.radius, Math.sin(a) * TRACK.radius)); }
    v['token.track'] = { kind: 'compound', at: origin, parts, footprint: false };
    if (n >= 7) for (const kind of SPURS) v[`token.spur.${kind}`] = spur(kind);
    // 燈泡 Lv7 離岸風電（spec：要高鐵，代幣 ≥6）在代幣通車到離島（Lv7）之前就可能發生（賽博正解第 6 回合）：
    // 高鐵先把風車島那條支線鋪過去載電工（燈泡 Lv7 劇本裡長出來），遊樂場島的支線照舊等代幣 Lv7
    else if (lv.bulb >= 7) v['token.spur.windmill'] = spur('windmill');
    // 離島接駁車走遊樂場島的支線（at 在支線起點：從那裡閃白出現）
    if (n >= 8) { const path = spurPath('playground'); v['token.shuttle'] = { kind: 'shuttle', at: path[0], path, speed: flags.flooded ? 0 : 1.2, footprint: false }; }
    const bullet = n >= 6;
    v['token.train'] = { kind: 'train', at: origin, models: trainModels(bullet ? 'bullet' : 'subway', trainCars(n)), h: CAR_H, tint: bullet ? BULLET_TINT : SUBWAY_TINT, speed: flags.flooded ? 0 : 0.35, footprint: false };
  }
  if (n >= 10) { for (let i = 0; i < 3; i++) v[`token.cars.${i}`] = roadster(i); v['token.ramp'] = rampSpec(); }
  return v;
}

export const builders = {
  // 小島接駁車：一節黃色小車在支線上來回（跟列車一起照 CAR_H 等比例放大）
  shuttle(THREE, spec, ctx) {
    const car = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: [{ kind: 'rbox', pos: [0, 0.14 * K, 0], scale: [0.25 * K, 0.22 * K, 0.4 * K], color: C.yellow }, { kind: 'box', pos: [0, 0.18 * K, 0], scale: [0.26 * K, 0.06 * K, 0.32 * K], color: C.white }] });
    const object = new THREE.Group(), cursor = createPathCursor(spec.path, { loop: false }), o = spec.at; object.add(car.object);   // path 是世界座標，車放在 at 底下
    return { object, update(dt) { cursor.advance(dt * spec.speed); const p = cursor.locate(); car.object.position.set(p.x - o.x, p.y - o.y, p.z - o.z); car.object.rotation.y = p.yaw; }, dispose: car.dispose };
  },
  // 列車：每節一個 glb（車頭朝 +z＝前進方向），沿環狀線跑；列車開在支線上（ctx.rail.trip）就跟著支線走
  train(THREE, spec, ctx) {
    const object = new THREE.Group();
    const cars = spec.models.map(m => { const c = ctx.build({ kind: 'glb', at: { x: 0, y: 0, z: 0 }, path: m.path, h: spec.h, ry: m.ry ?? 0, tint: spec.tint }); object.add(c.object); return c; });
    return {
      object,
      update(dt, t) {
        const tt = t + (ctx.rail?.offset ?? 0), trip = ctx.rail?.trip ?? null;
        cars.forEach((c, i) => { const p = trainPose(tt, i, { speed: spec.speed, trip }); c.object.position.set(p.x, p.y, p.z); c.object.rotation.y = p.yaw; });
      },
      dispose() { for (const c of cars) c.dispose(); },
    };
  },
  // 懸浮月台：幾個 glb 併成一個零件（位置相對零件的 at），閃白、浮上來都整組一起
  deck(THREE, spec, ctx) {
    const object = new THREE.Group();
    const subs = spec.models.map(m => { const p = ctx.build({ kind: 'glb', at: { x: m.pos[0], y: m.pos[1], z: m.pos[2] }, path: m.path, h: m.h, tint: m.tint, glow: m.glow }); object.add(p.object); return p; });
    return { object, dispose() { for (const p of subs) p.dispose(); } };
  },
  // 支線：一個 compound 轉到 bearing（本地 +z 沿徑向往外），scaleIn 沿 z 就是從環上長出去
  spur: turned,
  // 屋頂坡道（Lv10）：三條 lanes 各自轉到自己的 yaw、放到坡腳，併成一個 compound（零件的 rot 是 XYZ 尤拉角：先算好「先仰再轉」的等效角）
  ramp(THREE, spec, ctx) {
    const at = spec.at, q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
    const parts = spec.lanes.flatMap(lane => laneParts(lane).map(p => {
      q.setFromEuler(e.set(p.rot?.[0] ?? 0, lane.yaw, 0, 'YXZ')); const r = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      v.set(...p.pos).applyAxisAngle(new THREE.Vector3(0, 1, 0), lane.yaw);
      return { ...p, pos: [lane.foot.x - at.x + v.x, lane.foot.y - at.y + v.y, lane.foot.z - at.z + v.z], rot: [r.x, r.y, r.z] };
    }));
    return ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts });
  },
};
function turned(THREE, spec, ctx) {
  const inner = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: spec.parts }), object = new THREE.Group();
  object.add(inner.object); object.rotation.y = spec.bearing;
  return { object, dispose: inner.dispose };
}

// ── 劇本（§6）──
// 角色都是演到那一拍才找（還沒出來就回 null，那拍跳過）；once 找到第一次就記住，整段劇本同一個人。
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };
const staffOf = () => once(c => c.roster.members('token.staff').find(m => !m.hidden) ?? null);
const kid = i => c => c.roster.members('sat.playground')[i] ?? null;
const satCentre = kind => { const s = SATELLITES.find(x => x.kind === kind), c = axialToWorld(s.q, s.r); return { x: c.x, y: TOP - 0.2, z: c.z }; };
const WINDMILL = satCentre('windmill'), PLAYGROUND = satCentre('playground');
// 接駁車在遊樂場島那頭的終點往島心收 0.3：小孩下車的地方；溜滑梯腳下兩個點（相距 0.4）
const KID_OFF = (() => { const e = spurPath('playground').at(-1), d = Math.hypot(e.x, e.z), k = (d + 0.3) / d; return { x: e.x * k, y: TOP - 0.2, z: e.z * k }; })();
const SLIDE = [offset(PLAYGROUND, 0.1, 1.1), offset(PLAYGROUND, 0.5, 1.1)];
// 鏡頭（§13.1）：衛星島拉近 0.8（島和支線都要進畫面）；Lv8 的 LEVEL UP 在站上：鏡頭先轉回代幣格再打 LEVEL UP
// （跟 focus 一起演的話，從遊樂場島轉回來的路上字有一半時間在畫面外）
const ISLAND_ZOOM = 0.8;
const levelUpAtStation = B => [B.focus('token'), B.levelUp('token')];
const CAR_KEYS = [0, 1, 2].map(i => `token.cars.${i}`);
// 飛天車起飛：三台錯開 FLY_STAGGER 秒從屋頂斜坡起飛、繞 101 一圈、落回屋頂（零件的 userData.fly）；跳過時 land 立刻停好
const fly = () => ({
  kind: 'fly', dur: FLIGHT + FLY_STAGGER * (CAR_KEYS.length - 1),
  start(c) { CAR_KEYS.forEach((k, i) => c.stage.partObject(k)?.userData.fly?.({ delay: i * FLY_STAGGER, speed: c.speed ?? 1 })); },
  end(c) { for (const k of CAR_KEYS) c.stage.partObject(k)?.userData.land?.(); },
});

export const script = {
  // 站牌＋小月台：閃白 → 最近的島民走來月台前（西南角，靠鄰格的橋那側）等車 → ♪
  placed(e, s, ctx) {
    const { B } = ctx, islander = once(c => c.roster.nearest('landmarks.islanders', AT));
    // 站牌閃白的同時他就出發；♪ 0.8 → 0.6。代幣格不住島民（人數預算，裁決 R16），人是從鄰格走來的：走路 0.5–4 秒不等，
    // 走路那段至少 2.5 秒（近的時候在月台前多等一下），整級 3–6 秒（例外表 SCRIPT_EXCEPT 'token 1'）
    return [B.together([B.apply(e), B.walk(islander, offset(AT, -0.45, 0.45)), B.wait(2.5)]), B.bubble(islander, '♪', 0.6), B.home(islander)];
  },
  grow: {
    // 小站：閃白售票亭 → 站務員從站後面（入口）走到崗位 → ♪ → LEVEL UP
    2(e, s, ctx) {
      const { B } = ctx, st = staffOf();
      return [B.apply(e, { hold: ['token.staff'] }), B.spawn('token.staff', STAFF_ENTRY), B.walk(st, POST), B.bubble(st, '♪', 0.8), B.levelUp('token'), B.home(st)];
    },
    // 大車站：站務員走到站前揮鋤頭 → 閃白站體與廣場 → ♥ → LEVEL UP
    3(e, s, ctx) {
      const { B } = ctx, st = staffOf();
      return [B.walk(st, offset(AT, 0.15, 0.75)), B.gesture(st, 'build', 1.2, { at: AT }), B.apply(e), B.bubble(st, '♥', 0.8), B.levelUp('token'), B.home(st)];
    },
    // 環狀線：站務員圖框「列車」→ 軌道從海面升起 → 3 節通勤車從站後面閃白駛出（站務員揮手）→ LEVEL UP
    4(e, s, ctx) {
      const { B } = ctx, st = staffOf();
      return [
        B.bubble(st, { icon: 'train' }, 0.9),
        B.apply(e, { only: ['token.track'], blink: false }), B.scaleIn('token.track', { dur: 0.8 }),
        B.together([B.apply(e), B.trainDepart(), B.gesture(st, 'wave')]),   // 先建好列車（藏著）再改時鐘，列車才在站後面閃白
        B.levelUp('token'), B.home(st),
      ];
    },
    // 五節：站務員 ！ → 列車閃白加長成 5 節、從站後面駛出（揮手）→ 車頭 ♪ → LEVEL UP
    5(e, s, ctx) {
      const { B } = ctx, st = staffOf();
      // ！ 0.8 → 0.6、♪ 0.9 → 0.7（計畫 5b 任務 4，賽博第 6 回合 ≤ 50 s）
      return [B.bubble(st, '！', 0.6), B.together([B.apply(e), B.trainDepart(), B.gesture(st, 'wave')]), B.bubble(B.trainHead(ctx), '♪', 0.7), B.levelUp('token'), B.home(st)];
    },
    // 高鐵：站務員 ！ → 列車閃白換成白底橘線的高鐵、從站後面駛出 → 車頭 ♪、站務員跳起來 → LEVEL UP
    6(e, s, ctx) {
      const { B } = ctx, st = staffOf();
      return [
        // ！ 1.0 → 0.8、♪ 1.2 → 1.1（計畫 5b 任務 4，外星第 6 回合 ≤ 50 s；一級至少 3 秒）
        B.bubble(st, '！', 0.8), B.together([B.apply(e), B.trainDepart()]),
        B.together([B.bubble(B.trainHead(ctx), '♪', 1.1), B.gesture(st, 'jump')]), B.levelUp('token'), B.home(st),
      ];
    },
    // ◆ 通車到離島：鏡頭到風車島（zoom 0.8）→ 兩條支線從環上長出去，同時列車趕到支線入口（最多 4.5 倍、減速停進入口）→ 開進支線、
    //   到風車島那頭停一下 → 鏡頭回全景定格，看著列車倒回環上、緩緩開走 → LEVEL UP（遊樂場島的支線同時長好，接駁車 Lv8 才來）。
    //   支線 0.8 秒長完（每秒約 3.7 公尺），比支線車速 SPUR_RUSH 3.5 快一點，列車追不上還沒長好的那一段
    // 風車島的支線若已經被燈泡 Lv7 鋪好（view 的 lv.bulb ≥ 7），只長還沒有的那條——鏡頭改到遊樂場島、列車開進遊樂場島的支線
    //   （選擇帶動升級裁決 R7：賽博正解燈泡 Lv7 先到，以前照樣飛去風車島，新長的遊樂場支線整段在畫面外）。
    // 兩條都要長（外星正解）：風車島那條跟著鏡頭先長；遊樂場島在風車島的對面、拉近時在畫面外，等鏡頭回到全景（遊樂場島在全景裡）才長出來——
    //   排在列車島那頭停站的 during 裡，回全景 1.0 + 長 0.8 不比列車倒回環上久，整級不變長
    7(e, s, ctx) {
      const { B } = ctx, prev = s.prev ?? { lv: { ...s.lv, token: 6 }, flags: s.flags }, had = view(prev.lv, prev.flags), keys = SPURS.map(k => `token.spur.${k}`).filter(k => !had[k]);
      const dest = had['token.spur.windmill'] ? 'playground' : 'windmill', far = 'token.spur.playground';
      const later = dest === 'windmill' && keys.includes(far) ? [far] : [], now = keys.filter(k => !later.includes(k));
      const grow = k => B.scaleIn(k, { axis: 'z', dur: 0.8 });
      return [
        B.focus(dest === 'windmill' ? WINDMILL : PLAYGROUND, { zoom: ISLAND_ZOOM }),
        B.apply(e, { only: now, blink: false }),
        // ◆ ≤ 8 s（裁決 R17）：全景停 2.0 → 1.0；列車最多 2 秒趕到支線口（上限照舊 4.5 倍；剛開過頭就倒車回來）；
        //   支線上每秒 3.5 公尺（平常 2.5；計畫 5b 任務 4：列車剛開過支線口時整級 8.4 s，支線來回省 0.7 s）
        B.together([...now.map(grow), B.trainStop({ spur: dest, stop: 0.2, arrive: 2.0, back: Math.PI / 2, spurSpeed: SPUR_RUSH, during: [
          B.focus('home', { hold: 1.0 }), ...later.flatMap(k => [B.apply(e, { only: [k], blink: false }), grow(k)]),
        ] })]),
        B.apply(e), B.levelUp('token'),
      ];
    },
    // 接駁車：鏡頭到遊樂場島（zoom 0.8）→ 閃白接駁車在支線起點 → 開到島上 → 鮮奶 ≥3（有小學）時兩個小孩下車走到溜滑梯
    //   → 鏡頭跟 LEVEL UP 一起回代幣格
    8(e, s, ctx) {
      const { B } = ctx, kids = s.lv.milk >= 3;
      return [
        B.focus(PLAYGROUND, { zoom: ISLAND_ZOOM }),
        B.apply(e, { only: ['token.shuttle', ...(kids ? ['sat.playground'] : [])], hold: ['sat.playground'] }),
        B.together([B.wait(1.8), B.apply(e, { only: ['sat.playground.stage1'] })]),   // 車速 1.2，支線約 2.2：開到島那頭；鞦韆（離島三段）在鏡頭裡閃白
        ...(kids ? [
          B.spawn('sat.playground', KID_OFF), B.spawn('sat.playground', offset(KID_OFF, 0.25, 0.15)),
          B.together([0, 1].map(i => B.walk(kid(i), SLIDE[i]))), B.home([kid(0), kid(1)]),
        ] : [B.wait(0.4)]),
        B.apply(e), ...levelUpAtStation(B),
      ];
    },
    // 豪華賽博站：站務員看站、！ → 閃白霓虹站體 → 懸浮月台（連欄杆、招牌）在地面閃白出現、浮上來 → ♪、跳 → LEVEL UP
    9(e, s, ctx) {
      const { B } = ctx, st = staffOf();
      return [
        B.together([B.gesture(st, 'look', { at: AT }), B.bubble(st, '！', 0.8)]),
        B.apply(e, { only: ['token.main'] }),
        // 同一幀先建好（藏著）、移到地面，再閃白露出來往上浮
        B.together([B.apply(e, { only: ['token.deck'] }), B.move('token.deck', { from: { dy: -DECK_RISE }, to: 0, dur: 1.0 })]),
        B.together([B.bubble(st, '♪', 0.8), B.gesture(st, 'jump')]),
        B.apply(e), B.levelUp('token'), B.home(st),
      ];
    },
    // ◆ 飛天車（Tesla Roadster）：回全景 → 三台和屋頂斜坡一起出現（不閃白：一出現就是停好的樣子）→ 沿斜坡起飛、繞 101 一圈、
    //   四輪落回屋頂 → 全景定格 → LEVEL UP
    10(e, s, ctx) {
      const { B } = ctx;
      return [B.focus('home'), B.apply(e, { only: [...CAR_KEYS, 'token.ramp'], blink: false }), fly(), B.apply(e), B.focus('home', { hold: 1.2 }), B.levelUp('token')];   // 停 2.0 → 1.2（裁決 R17 ◆ ≤ 8 s）
    },
  },
  fx: () => null,   // 捷運淹水是颱風的劇本（cause 是颱風）
  rep: (s, ctx) => ctx.roster.members('token.staff').find(m => !m.hidden) ?? null,   // 代表（拜訪、撲空找的人）：藏起來的人（躲進門裡）不算
  hasRep: lv => lv >= 2,   // 這一級有沒有代表（turn.js 排撲空的位子用，最終審稿 3）：站務員 Lv2 起才有
};
// ◆ 關鍵節點（裁決 R11）：跳級的第二級落在這幾級，也演完整劇本（turn.js）。
// Lv4 環狀線（選擇帶動升級裁決 R6）：代幣 up[3]、up[4] 都是 auto，2 → 4 一定跳級——環狀線與列車是整局的主線，不標 ◆ 就只剩 apply + LEVEL UP
script.grow[4].key = script.grow[7].key = script.grow[10].key = true;

// 拜訪點（計畫 6 設計 §4，同 5b 之前的趕工）：每一級都在車站（錨點）；Lv7 支線、Lv8 接駁車在離島 → null（不插拜訪）。
// Lv10 飛天車停在站頂，敲的也是車站
export const visitSpot = n => (n >= 1 && n <= 10 && n !== 7 && n !== 8 ? { ...AT, r: 1.2 } : null);
