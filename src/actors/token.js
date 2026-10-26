// 代幣（物品 v2 §4.1，max 10）：站牌＋小月台 → 小站（售票亭、站務員）→ 大車站（站體、站前廣場）→ 環狀線 3 節通勤車 → 5 節
//   → 高鐵（白底橘線）→ ★◆ 支線通到風車島與遊樂場島（列車開過去）→ 離島接駁車 → 豪華賽博站（霓虹站體、懸浮月台）
//   → ◆ 飛天車（三台繞 101 一圈、停在車站屋頂）。捷運淹水（代幣 ≤2 時颱風登陸）站體變游泳池。
// 列車用 Kenney Train Kit（subway／bullet，車頭、中間車、車尾），賽博站用 Quaternius Cyberpunk Kit（月台、欄杆、招牌），
//   飛天車用 Kenney Space Kit 的 speeder（零件 kind 'orbit'，parts.js），都經載入器 tint 重上色票。
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
const GAP = 0.6;   // 車廂間距（弧長）
const POOL = 0xa4d4da;
const AT = anchorWorld('token'), TOWER = anchorWorld('tower');
export const POST = offset(AT, 0.6, 0.55), DOOR = offset(AT, 0, 0.5);   // 站務員的崗位（站門口旁）、站門
// 名冊入口（§13.2）：站體北側（背面），站務員與泳客都從這裡繞過站體走來。計畫給的 offset(AT, 1.6, 0.9) 離崗位只有 1.06；
// 往外推到 ≥ 1.5 的點（+x、+z 那側）又會穿過珍奶攤車前的人龍。這一點離崗位 2.4、離泳客站位 ≥ 1.6，兩條正解每一刻都走得到，
// 走到崗位的路線離 Lv1–2 每個排隊站位 ≥ 0.3、不經過攤車前方
export const STAFF_ENTRY = offset(AT, -0.35, -1.65);

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
export const SPUR_SPEED = 2.5;   // 支線上的車速（每秒公尺），約跟環上一樣
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
    parts.push({ kind: 'box', pos: [0, y, z], scale: [0.3, 0.08, seg * 1.05], color: C.cream });
    if (i % 2 === 1 && i < 7) { const q = pylon(L.ux * (L.from + z), L.uz * (L.from + z), L.y0 + y); parts.push({ ...q, pos: [0, q.pos[1] - L.y0, z] }); }
  }
  const curve = spurTrip(kind).path.filter(p => Math.hypot(p.x, p.z) < L.from + 0.6);
  for (let i = 1; i < curve.length; i++) {
    const [ax, az] = local(curve[i - 1]), [bx, bz] = local(curve[i]), len = Math.hypot(bx - ax, bz - az);
    parts.push({ kind: 'box', pos: [(ax + bx) / 2, 0, (az + bz) / 2], scale: [0.3, 0.08, len * 1.1], rot: [0, Math.atan2(bx - ax, bz - az), 0], color: C.cream });
  }
  return { kind: 'spur', at, bearing, footprint: false, parts };
}

// ── 列車（Kenney Train Kit）：車頭 a、中間車 b／c、車尾是車頭轉半圈；車廂高 0.3（長約 0.5，間距 0.6）──
// 色票圖的格子顏色（'#rrggbb'，sRGB）分族：紅色飾條、藍色（高鐵車頂與鼻）、淺藍車窗、橘色車燈、近黑（輪子、車底）、其餘灰藍車身分深淺兩段
const WINDOW = '^#(8[0-9a-f][a-b]|9[0-9a-f][b-c]|a[0-9a-f][c-d]|b[0-9a-f][d-e])';
const trainTint = (stripe, glass) => ({
  [WINDOW]: glass, '^#[b-e][0-9a-f][2-5]': stripe, '^#[56][0-9a-f][5-8][0-9a-f][b-d]': stripe, '^#ff': C.yellow,
  '^#[34]': C.ink, '^#[5-8]': C.curb, '^#[9a-f]': C.white,
});
const SUBWAY_TINT = trainTint(C.blue, C.glass);    // 北捷：白車身、藍飾條、淺色車窗
const BULLET_TINT = trainTint(C.coral, C.ink);     // 高鐵：白底橘線、深色車窗
const CAR_H = 0.3;
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
    { kind: 'box', pos: [0, ROOF_Y - 0.03, 0], scale: [1.1, 0.06, 0.82], color: C.ink },
    ...[-0.5, 0.5].map(x => ({ kind: 'box', pos: [x, 0.33, 0.38], scale: [0.03, 0.66, 0.03], color: C.neonBlue, glow: C.neonBlue })),
    { kind: 'box', pos: [0, ROOF_Y, 0.41], scale: [1.1, 0.025, 0.025], color: C.neonBlue, glow: C.neonBlue },
    { kind: 'cylinder', pos: [0.42, ROOF_Y + 0.23, -0.3], scale: [0.02, 0.46, 0.02], color: C.curb },
    { kind: 'sphere', pos: [0.42, ROOF_Y + 0.47, -0.3], scale: 0.05, color: C.neonBlue, glow: C.neonBlue },
    ...ticketMachine(C.ink),
    ...plaza(C.navy, [{ kind: 'box', pos: [0, 0.026, 1.2], scale: [1.5, 0.006, 0.03], color: C.neonBlue, glow: C.neonBlue }]),
  ] };
}
// 賽博站的懸浮月台（一個零件 kind 'deck'，裡面三個 Cyberpunk Kit glb，一起閃白、一起浮上來）：站前廣場上空 0.7 的月台（人從底下走）、
// 月台前緣的欄杆、立在月台上的霓虹招牌。pos 相對 DECK_AT；footprint 不算
export const DECK_AT = offset(AT, 0, 1.0, 0.7);   // 燈泡 Lv9 的月台霓虹也貼在這裡
const DECK_MODELS = [
  { path: 'quat/cyberpunk/Platform_4x1_Empty.glb', pos: [0, 0, 0], h: 0.224 * 1.4 / 3.863, tint: { '^LightGrey$': C.curb, '^Grey$': C.navy }, glow: { '^Texture_Signs$': C.neonBlue } },
  { path: 'quat/cyberpunk/Rail_Long.glb', pos: [0, 0.08, 0.13], h: 0.237 * 1.2 / 2.293, glow: { '^Black$': C.neonPink } },
  { path: 'quat/cyberpunk/Sign_1.glb', pos: [0, 0.08, 0], h: 0.462 * 0.62 / 1.294, tint: { '^Grey$': C.ink }, glow: { '^Texture_Signs$': C.neonPink } },
];
const DECK_RISE = 0.65;   // Lv9 劇本：懸浮月台從地面浮上來的高度

// ── 飛天車（Lv10）：Kenney Space Kit 三款 speeder，一款一台、寬 0.3；從海上飛進來繞 101 一圈、停在賽博站屋頂（左中右）。
// 停好之後每台各自隔 rest 秒再起飛繞一圈（錯開，天上常常有一台在飛）
const SPEEDERS = [
  { path: 'kenney/space/craft_speederA.glb', size: [2.0, 0.8], accent: C.coral },
  { path: 'kenney/space/craft_speederB.glb', size: [2.0, 0.6], accent: C.blue },
  { path: 'kenney/space/craft_speederC.glb', size: [2.8, 0.6], accent: C.yellow },
];
const ORBIT = { speed: 2.5, legs: [1.4, 1.0] }, FLY_STAGGER = 0.3;
export const FLIGHT = ORBIT.legs[0] + 2 * Math.PI / ORBIT.speed + ORBIT.legs[1];   // 一趟飛行幾秒
function speeder(i) {
  const m = SPEEDERS[i], phase = Math.atan2(AT.z - TOWER.z, AT.x - TOWER.x), sea = 0.26 + i * 0.35;   // 繞完從朝車站那側離開；從右前方的海上飛進來
  return {
    kind: 'orbit', at: TOWER, r: 1.7 + 0.3 * i, h: 3.4 + 0.6 * i, phase, ...ORBIT,
    from: { x: Math.cos(sea) * 14, y: 3.5, z: Math.sin(sea) * 14 }, park: offset(AT, (i - 1) * 0.33, 0.02, ROOF_Y),   // 停好朝最後一段的方向（從 101 那側飛過來）
    path: m.path, size: 0.3 * m.size[1] / m.size[0], ry: Math.PI, rest: 16 + 6 * i, footprint: false,   // 模型機頭朝 −z：轉半圈才朝前進方向
    tint: { '^metalRed$': m.accent, '^metalDark$': C.curb, '^metal$': C.white, '^dark$': C.ink },
  };
}

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
  if (flags.flooded) v['token.swimmers'] = { kind: 'roster', at, n: 2, accessory: 'none', from: 'token.staff', home: { kind: 'stand', spots: [{ ...offset(at, -0.25, 0.1, -0.12), yaw: 0.5 }, { ...offset(at, 0.25, -0.15, -0.12), yaw: -2 }], rescue: true, entry: STAFF_ENTRY } };
  // 站務員一直只有一位：Lv8 原本多一位（站門另一側），人數預算（裁決 R16，全島 ≤ 30）拿掉——鮮奶節那一回合全島剛好多一個人
  else if (n >= 2) v['token.staff'] = { kind: 'roster', at, n: 1, accessory: 'uniform', home: { kind: 'stand', spots: [{ ...POST, yaw: 0 }], rescue: true, entry: STAFF_ENTRY } };
  if (n >= 9 && !flags.flooded) v['token.deck'] = { kind: 'deck', at: DECK_AT, models: DECK_MODELS, footprint: false };
  if (n >= 4) {
    const origin = { x: 0, y: 0, z: 0 }, parts = [{ kind: 'rail', pos: [0, TRACK.y, 0], scale: TRACK.radius * 2, rot: [Math.PI / 2, 0, 0], color: C.cream }];
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + 0.13; parts.push(pylon(Math.cos(a) * TRACK.radius, Math.sin(a) * TRACK.radius)); }
    v['token.track'] = { kind: 'compound', at: origin, parts, footprint: false };
    if (n >= 7) for (const kind of SPURS) v[`token.spur.${kind}`] = spur(kind);
    // 離島接駁車走遊樂場島的支線（at 在支線起點：從那裡閃白出現）
    if (n >= 8) { const path = spurPath('playground'); v['token.shuttle'] = { kind: 'shuttle', at: path[0], path, speed: flags.flooded ? 0 : 1.2, footprint: false }; }
    const bullet = n >= 6;
    v['token.train'] = { kind: 'train', at: origin, models: trainModels(bullet ? 'bullet' : 'subway', trainCars(n)), h: CAR_H, tint: bullet ? BULLET_TINT : SUBWAY_TINT, speed: flags.flooded ? 0 : 0.35, footprint: false };
  }
  if (n >= 10) for (let i = 0; i < 3; i++) v[`token.cars.${i}`] = speeder(i);
  return v;
}

export const builders = {
  // 小島接駁車：一節黃色小車在支線上來回
  shuttle(THREE, spec, ctx) {
    const car = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: [{ kind: 'rbox', pos: [0, 0.14, 0], scale: [0.25, 0.22, 0.4], color: C.yellow }, { kind: 'box', pos: [0, 0.18, 0], scale: [0.26, 0.06, 0.32], color: C.white }] });
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
  spur(THREE, spec, ctx) {
    const inner = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: spec.parts }), object = new THREE.Group();
    object.add(inner.object); object.rotation.y = spec.bearing;
    return { object, dispose: inner.dispose };
  },
};

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
// 飛天車起飛：三台錯開 FLY_STAGGER 秒從海上飛進來（零件的 userData.fly）；跳過時 land 立刻停好
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
      return [B.bubble(st, '！', 0.8), B.together([B.apply(e), B.trainDepart(), B.gesture(st, 'wave')]), B.bubble(B.trainHead(ctx), '♪', 0.9), B.levelUp('token'), B.home(st)];
    },
    // 高鐵：站務員 ！ → 列車閃白換成白底橘線的高鐵、從站後面駛出 → 車頭 ♪、站務員跳起來 → LEVEL UP
    6(e, s, ctx) {
      const { B } = ctx, st = staffOf();
      return [
        B.bubble(st, '！', 1.0), B.together([B.apply(e), B.trainDepart()]),
        B.together([B.bubble(B.trainHead(ctx), '♪', 1.2), B.gesture(st, 'jump')]), B.levelUp('token'), B.home(st),
      ];
    },
    // ◆ 通車到離島：鏡頭到風車島（zoom 0.8）→ 兩條支線從環上長出去，同時列車趕到支線入口（最多 4.5 倍、減速停進入口）→ 開進支線、
    //   到風車島那頭停一下 → 鏡頭回全景定格，看著列車倒回環上、緩緩開走 → LEVEL UP（遊樂場島的支線同時長好，接駁車 Lv8 才來）。
    //   支線 0.8 秒長完（每秒 3 公尺多），比車速 2.5 快，列車追不上還沒長好的那一段
    7(e, s, ctx) {
      const { B } = ctx, keys = SPURS.map(k => `token.spur.${k}`);
      return [
        B.focus(WINDMILL, { zoom: ISLAND_ZOOM }),
        B.apply(e, { only: keys, blink: false }),
        // ◆ ≤ 8 s（裁決 R17）：全景停 2.0 → 1.0；列車最多 2 秒趕到支線口（上限照舊 4.5 倍；剛開過頭就倒車回來）
        B.together([...keys.map(k => B.scaleIn(k, { axis: 'z', dur: 0.8 })), B.trainStop({ spur: 'windmill', stop: 0.2, arrive: 2.0, back: Math.PI / 2, during: [B.focus('home', { hold: 1.0 })] })]),
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
        B.wait(1.8),   // 車速 1.2，支線約 2.2：開到島那頭
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
    // ◆ 飛天車：回全景 → 三台懸浮車從海上飛進來、繞 101 一圈、停到車站屋頂 → 全景定格 → LEVEL UP
    10(e, s, ctx) {
      const { B } = ctx;
      return [B.focus('home'), B.apply(e, { only: CAR_KEYS, blink: false }), fly(), B.apply(e), B.focus('home', { hold: 1.2 }), B.levelUp('token')];   // 停 2.0 → 1.2（裁決 R17 ◆ ≤ 8 s）
    },
  },
  fx: () => null,   // 捷運淹水是颱風的劇本（cause 是颱風）
  rep: (s, ctx) => ctx.roster.members('token.staff').find(m => !m.hidden) ?? null,   // 等待圖框的代表：藏起來的人（躲進門裡）不算
};
// ◆ 關鍵節點（裁決 R11）：跳級的第二級落在這兩級、或在倒數蒙太奇裡，也演完整劇本（turn.js）
script.grow[7].key = script.grow[10].key = true;
