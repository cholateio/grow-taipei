// 衛星島與海面（§5.3，使用者 2026-10-25「只有中心的島在動，不夠磅礡」）：七座小島和海上的船跟著主島的等級反應。
// 和主島的演員一樣是 view(lv, flags) → 零件；固定的島形與地標在 scene/island.js 的 kit 裡，這裡只畫會變的東西。
// 離島三段（計畫 6 §7）：每座島空島 → 第一段 → 第二段，觸發照 STAGE 表、兩段各自獨立（stages()；零件見下方說明與 docs/assets/manifest.md）。
import { SATELLITES, axialToWorld, TOP, WATER_Y } from '../scene/hex.js';
import { ringPath } from '../scene/people.js';
import { C } from './palette.js';
import { builders as ratBuilders } from './rat.js';
import { kidAccessory } from './milk.js';
import * as spec from '../rules/spec.js';
import { DOCK } from './boba.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

export const id = 'satellites';
const TOP_SAT = satTop(), GOLD = 0xe8c547;
// 函數宣告（不是 const）：boba.js 匯入 island、這裡又匯入 boba 的 DOCK（循環）——宣告會提升，誰先載入都叫得到（不碰本檔的 const）
export function island(kind) { const s = SATELLITES.find(x => x.kind === kind), c = axialToWorld(s.q, s.r); return { x: c.x, y: satTop(), z: c.z }; }
// 衛星島面高度 TOP_SAT 的唯一來源：也是函數宣告（island 在本檔的 const 初始化之前就可能被叫到，碰 TOP_SAT 會 TDZ）
function satTop() { return TOP - 0.2; }
const at = (kind, dx = 0, dz = 0, dy = 0) => { const c = island(kind); return { x: c.x + dx, y: c.y + dy, z: c.z + dz }; };
// 石堆島朝主島中心的方位角（xz 平面，atan2(z, x)）：降落場的三盞燈從這個方位起等分；finale.js 的外星生物站在這個方位、
// 三台 UFO 的碟心從它 + π/3 起等分（燈在碟心之間的空檔）——兩邊共用這一個值
export const ROCKS_HOME_A = Math.atan2(-island('rocks').z, -island('rocks').x);
// 石堆島綠光圈的直徑（torus 單位半徑 0.5）
const RING_D = 2.2;
const allMax = lv => spec.ORDER.every(id => lv[id] === spec.ITEMS[id].max);

// 離岸風電（物品 v2 §5）：燈泡 Lv7 電工搭車去風車島按開關之前，風車不轉、燈塔不亮
export const POWERED = 7;
export const powered = (lv, flags = {}) => lv.bulb >= POWERED && !flags.blackout;
// 珍奶連鎖店（物品 v2 §4.7 Lv5）：小森林島開分店、觀光船多兩艘
export const BRANCH = 5;

export function view(lv, flags) {
  const v = {}, storm = lv.typhoon === 2, on = powered(lv, flags);
  // 風車：通電後慢慢轉；颱風時整座搖——沒電也被風吹著轉（3，那是風不是電），通電時狂轉（6）
  // 離島三段：燈泡 Lv7 起第二支風機（塔身在 sat.windmill.stage1，第一段）的葉片也在這個零件裡（twin = 第二個轉子相對主轉子的位置）——
  // 同一個 speed／wobble，颱風改速度時只重建這一個零件（第一段不跟著重建、不多閃一次）
  v['sat.windmill'] = { kind: 'blades', at: at('windmill', 0, 0.12, 1.6), speed: storm ? (on ? 6 : 3) : on ? 1 : 0, wobble: storm, ...(lv.bulb >= POWERED ? { twin: TWIN } : {}) };
  if (on) {
    v['sat.lighthouse'] = { kind: 'compound', at: at('lighthouse'), parts: [{ kind: 'sphere', pos: [0, 1.45, 0], scale: 0.38, color: C.yellow, glow: C.yellow }] };
    v['sat.beam'] = { kind: 'beam', at: at('lighthouse', 0, 0, 1.45) };
  }
  // 守塔人（§14.3）：燈塔亮了（燈泡 Lv7）之後一位守塔人繞著燈塔走（衛星島的 wander 是 ringPath，半徑 0.6 在塔身外、樹的內側）
  if (lv.bulb >= POWERED) v['sat.keeper'] = { kind: 'roster', at: at('lighthouse'), n: 1, shirt: C.navy, accessory: 'cap', home: { kind: 'wander', at: at('lighthouse'), r: 0.6 } };
  // 遊樂場的小孩是坐接駁車（代幣 Lv8）來的：代幣的劇本 hold 住這個名冊、在車旁 spawn；日常在島上繞圈（名冊的衛星島 wander）
  // 物品 v2：鮮奶 Lv3 才有小學生（Lv2 是早餐店），配件跟鮮奶格的小孩同一張表
  if (lv.token >= 8 && lv.milk >= 3) {
    v['sat.playground'] = { kind: 'roster', at: at('playground'), n: 2, shirt: C.yellow, accessory: kidAccessory(lv.milk), home: { kind: 'wander', at: at('playground', -0.2, 0.3), r: 0.5 } };
  }
  // 小森林島的觀光客跟著珍奶分店（物品 v2：Lv5 連鎖店）一起來：珍奶 Lv5 的劇本鏡頭移過去時閃白出現（§8.7）
  if (lv.boba >= BRANCH) {
    const f = island('forest'), yaw = Math.atan2(-f.x, -f.z);   // 面向主島拍照
    v['sat.forest'] = { kind: 'roster', at: f, n: 2, accessory: 'suitcase', home: { kind: 'stand', spots: [{ ...at('forest', 0.3, 1.1), yaw }, { ...at('forest', -0.2, 1.25), yaw }] } };
  }
  // 石堆上的老鼠；賽博最終型態（10 隻軍團）時不畫，守住骨架動畫 ≤ 12；外星尾聲時也不畫（三台大 UFO 降在這裡，finale.js）
  if (lv.rat >= 3 && !(lv.rat >= 5 && flags.ratBranch === 'cyber') && flags.epilogue !== 'alien') v['sat.rocks'] = { kind: 'rats', at: island('rocks'), path: 'quat/enemies/Rat.glb', n: 2, h: 0.14, anim: 'Idle',
    spots: [{ ...at('rocks', -0.4, 0.3, 0.52), yaw: 0.6 }, { ...at('rocks', 0.5, -0.2, 0.44), yaw: -2.2 }] };
  // 外星 Lv5（變異鼠加冕）：石堆小島一圈綠光（外星結局的降落場前身，物品 v2 §8）
  // 外星尾聲（最終章 §7）：綠光圈變降落場——圈更亮（管子粗 2.5 倍、內側再一圈）＋三盞落地燈（r 0.08）等分站在圈上；
  // 同一個 C.alien 發光材質，draw call 不變
  if (lv.rat >= 5 && flags.ratBranch === 'alien') {
    const pad = flags.epilogue === 'alien';
    v['sat.rocksRing'] = { kind: 'compound', at: island('rocks'), shadow: false, footprint: false, parts: [
      { kind: 'torus', pos: [0, 0.06, 0], scale: [RING_D, RING_D, pad ? 2.5 : 1], rot: [Math.PI / 2, 0, 0], color: C.alien, glow: C.alien },
      ...(pad ? [
        { kind: 'torus', pos: [0, 0.05, 0], scale: [RING_D * 0.8, RING_D * 0.8, 1.5], rot: [Math.PI / 2, 0, 0], color: C.alien, glow: C.alien },
        ...[0, 1, 2].map(i => { const a = ROCKS_HOME_A + i * Math.PI * 2 / 3; return { kind: 'sphere', pos: [Math.cos(a) * RING_D / 2, 0.14, Math.sin(a) * RING_D / 2], scale: 0.16, color: C.alien, glow: C.alien }; }),
      ] : []),
    ] };
  }
  const open = allMax(lv);
  v['sat.chest'] = { kind: 'compound', at: at('chest'), open, parts: [...(open ? [
    { kind: 'rbox', pos: [0.2, 0.52, -0.02], scale: [0.58, 0.08, 0.43], rot: [-1.2, 0, 0], color: GOLD },
    { kind: 'sphere', pos: [0.2, 0.36, 0.2], scale: [0.4, 0.12, 0.28], color: GOLD, glow: GOLD },
    ...Array.from({ length: 6 }, (_, i) => ({ kind: 'cylinder', pos: [0.2 + Math.cos(i) * 0.5, 0.02, 0.2 + Math.sin(i) * 0.45], scale: [0.09, 0.02, 0.09], color: GOLD })),
  ] : [{ kind: 'rbox', pos: [0.2, 0.37, 0.2], scale: [0.58, 0.08, 0.43], color: GOLD }])] };
  Object.assign(v, stages(lv, flags, on));
  // low: false——?quality=low（手機）不畫海上的小船（點綴，一艘一個 draw call，裁決 R18）
  if (!storm) v['sat.boats'] = { kind: 'boats', at: { x: 0, y: WATER_Y - 0.02, z: 0 }, n: 2 + (lv.boba >= 2 ? 2 : 0) + (lv.boba >= BRANCH ? 2 : 0), low: false };
  return v;
}

// ── 離島三段（計畫 6 §7）：每座島 = 空島（island.js 的 kit）→ 第一段 → 第二段，觸發固定照表、兩段各自獨立（亂放時第二段可以先出現）。
// 零件：一段一個零件 sat.<島>.stage1／stage2（裁決 R7：下一段出現時已經站著的東西不重閃）。同一級一起出現的基座跟第一段併在一起：
// 階梯丘的營區（晶片 Lv3）在 sat.pyramid.stage1、小森林的分店（珍奶 Lv5）在 sat.forest.stage1——基座手機照畫，點綴零件標 low: false（與 stage: 1／2）。
// 寶箱島的海鷗是自己的 sat.chest.stage1（不併進寶箱：寶箱開箱時才變）。會動的段：鞦韆（架子＋座位一個 mesh）、旋轉木馬、金幣，
// 第二支風機的轉子在 sat.windmill 裡（rig：幾組各繞 pivot 動的零件併成一個 mesh）。
// footprint: false（衛星島沒有走路格）；零件位置都相對島心（at = island(kind)）。
// 每段閃白出現由舞台的 apply 管（那一級的劇本鏡頭在這座島就跟著閃白，否則回合末）。各島已經有的東西與要讓開的站位：
//   燈塔島：塔身半徑 0.25、守塔人繞 0.6 一圈、東南一棵樹 (0.9, 0.5)、西南旗艦店 (-1.15, 0.85)、觀光客 (-1.3, 1.5)／(-0.95, 1.6)、小船停在 boba.DOCK
//   風車島：風機 (0, 0)、開關箱 (0.3, 0.25)、電工散步 (0.5, 0.75) r 0.35、小屋 (-0.7, 0.4)、支線停在東邊 (1.0, 0)、電纜往東南下水
//   石堆島：四顆石頭（最大的 (-0.4, 0.3)）、兩隻老鼠站在兩顆大石頭頂上、綠光圈半徑 1.1
//   階梯丘：五層梯田（最上層半徑 0.27、頂 0.9；營區在頂上）
//   遊樂場島：溜滑梯 (0.3, 0) 往南、樹 (-0.7, 0.3)、小孩繞 (-0.2, 0.3) r 0.5、支線停在西南 (-0.5, 0.87)
//   小森林：五棵樹、分店 (1.0, 0.9)、觀光客 (0.3, 1.1)／(-0.2, 1.25)
//   寶箱島：寶箱 (0.2, 0.2)、樹 (-0.6, -0.3)
// draw call：每個零件黏土一個 + 每種發光色一個；每座島的衛星零件 ≤ 6（satellites.test）。全 MAX 一般畫質截圖（計畫 6 任務 6 修正第 1 輪實測）：
//   wide-end 249 → 245、end 246 → 243、alien 208 → 205（手機 143／137 不變）；省下來的是營區／分店併第一段、鞦韆與兩支轉子各一個 mesh（裁決 R7：≤ 246）。
//   low: false——?quality=low（手機）不畫點綴：全 MAX 的手機截圖本來就 143（≤ 150），十幾個點綴放不下（併進黏土也一段一個）
// tagAlong：跟同一拍第一個閃的零件一起閃、不多佔 stagger（beats.apply）——加了點綴，劇本與整局的時間一格不變。
//   含基座的第一段（階梯丘、小森林）不標：營區、分店是那一級的主角，跟原本的 sat.camp／sat.forestShop 一樣自己佔一格
export const STAGE = { lighthouse: [['bulb', 7], ['boba', 6]], windmill: [['bulb', 7], ['chip', 6]], rocks: [['rat', 3]], pyramid: [['chip', 3], ['chip', 9]],
  playground: [['token', 8], ['milk', 10]], forest: [['boba', 5], ['bulb', 9]], chest: [['baseball', 6]] };
const reached = (lv, [item, n]) => lv[item] >= n;
// 第二支風機：塔頂 (-0.55, 1.2, -0.9) 相對島心；轉子在塔頂前 0.1，換成相對主轉子（at('windmill', 0, 0.12, 1.6)）的位置
const TWIN_HUB = [-0.55, 1.2, -0.9], TWIN = [TWIN_HUB[0], TWIN_HUB[1] - 1.6, TWIN_HUB[2] + 0.1 - 0.12];
// 棧橋：燈塔島西南岸朝小船停的地方（boba.DOCK）伸出去、靠在小船旁邊。沿 d（島心 → DOCK）量的 s：DOCK 在 s 2.56，
// 這條線上的海岸（六角島緣）在 s ≈ 2.3；板面 s 2.2–2.85——一小段搭在路緣上、大部分伸在水面上，遠端過了船身中段。
// 往側邊（n 的負向）讓開 LAT 0.68：小船最後一段航線（船寬 0.71、長 1.3，Boat.glb 量的）掃過的範圍離板面 ≥ 0.09，
// 停好時船側離板面 ≈ 0.17（看得出靠在棧橋旁）；觀光客在 n 的正向那側、離板面 ≥ 0.6。
// 板面頂在島面上 0.02（蓋在路緣上），柱子從水面下插上來
// （第一次用到才算：boba.js 先載入時，本檔先跑、DOCK 還沒初始化）
let pier = null;
const PIER = () => pier ??= (() => {
  const c = island('lighthouse'), dx = DOCK.x - c.x, dz = DOCK.z - c.z, m = Math.hypot(dx, dz), d = [dx / m, dz / m], n = [d[1], -d[0]], LAT = -0.68;
  const pt = (s, lat = LAT) => [d[0] * s + n[0] * lat, d[1] * s + n[1] * lat];
  return { pt, yaw: Math.atan2(d[0], d[1]), d, n, LAT };
})();
export const PIER_SPAN = [2.2, 2.85];   // 板面沿 d 的起訖（相對島心；測試量海岸與小船用）
export const pierFrame = () => PIER();
// 寶箱島 1：一隻海鷗停在寶箱蓋上（全 MAX 開箱後蓋子掀起來，改站到箱子東邊的草地上）
function gull(open) {
  const g = open ? [0.72, 0, 0.42] : [0.3, 0.41, 0.25];
  return [
    { kind: 'sphere', pos: [g[0], g[1] + 0.07, g[2]], scale: [0.09, 0.08, 0.15], color: C.white },
    { kind: 'sphere', pos: [g[0], g[1] + 0.14, g[2] + 0.06], scale: 0.06, color: C.white },
    { kind: 'cone', pos: [g[0], g[1] + 0.135, g[2] + 0.11], scale: [0.025, 0.05, 0.025], rot: [Math.PI / 2, 0, 0], color: C.yellow },
    ...[-1, 1].map(sx => ({ kind: 'box', pos: [g[0] + sx * 0.05, g[1] + 0.09, g[2] - 0.01], scale: [0.02, 0.05, 0.12], rot: [0, 0, sx * 0.3], color: 0x9a9a9a })),
    ...[-1, 1].map(sx => ({ kind: 'cylinder', pos: [g[0] + sx * 0.025, g[1] + 0.015, g[2]], scale: [0.012, 0.03, 0.012], color: C.yellow })),
  ];
}
// 點綴零件：標第幾段（測試用）、手機不畫
const deco = (n, parts) => parts.map(p => ({ ...p, low: false, stage: n }));
const shift = (parts, [dx, dy, dz]) => parts.map(p => ({ ...p, pos: [p.pos[0] + dx, p.pos[1] + dy, p.pos[2] + dz] }));
function stages(lv, flags, on) {
  const v = {}, has = (kind, i) => !!STAGE[kind][i] && reached(lv, STAGE[kind][i]);
  // 一段一個零件（裁決 R7）。base：同一級一起出現的基座（併進第一段；手機照畫；那一級的主角，不 tagAlong）；
  // 沒有基座的段整個零件在手機不畫（給空 Group，劇本照樣找得到鍵）、tagAlong
  const put = (kind, i, parts, { base = [] } = {}) => {
    if (has(kind, i)) v[`sat.${kind}.stage${i + 1}`] = { kind: 'compound', at: island(kind), footprint: false, ...(base.length ? {} : { tagAlong: true, low: false }), parts: [...base, ...deco(i + 1, parts())] };
  };
  const anim = (kind, i, part) => { if (has(kind, i)) v[`sat.${kind}.stage${i + 1}`] = { at: island(kind), footprint: false, tagAlong: true, low: false, ...part }; };
  // 燈塔島 1：守塔人小屋——白牆紅頂，在島的東北（守塔人的圈外、樹的北邊）；2：棧橋碼頭——板面一條、橫板四片、柱子四根
  const P = PIER(), [s0, s1] = PIER_SPAN, deck = (s, y, sc, color) => { const [x, z] = P.pt(s); return { kind: 'box', pos: [x, y, z], scale: sc, rot: [0, P.yaw, 0], color }; };
  const sea = WATER_Y - TOP_SAT - 0.05;   // 柱腳在水面下 0.05
  put('lighthouse', 0, () => [
    { kind: 'box', pos: [0.7, 0.15, -1.15], scale: [0.42, 0.3, 0.32], color: C.cream },
    { kind: 'hip', pos: [0.7, 0.38, -1.15], scale: [0.5, 0.18, 0.4], color: C.coral },
    { kind: 'box', pos: [0.7, 0.09, -0.985], scale: [0.1, 0.18, 0.02], color: C.window },
    { kind: 'cylinder', pos: [0.84, 0.45, -1.2], scale: [0.06, 0.14, 0.06], color: C.wall },
  ]);
  put('lighthouse', 1, () => [
    deck((s0 + s1) / 2, 0.0, [0.24, 0.04, s1 - s0], C.wood),   // 頂在 +0.02；第二段的第一個零件是板面（測試量海岸與小船）
    ...[2.32, 2.47, 2.62, 2.77].map(s => deck(s, 0.025, [0.3, 0.02, 0.05], 0xb48560)),
    ...[[2.45, 0.1], [2.45, -0.1], [2.8, 0.1], [2.8, -0.1]].map(([s, l]) => { const [x, z] = P.pt(s, P.LAT + l); return { kind: 'cylinder', pos: [x, sea / 2, z], scale: [0.05, -sea, 0.05], color: C.wood }; }),
  ]);
  // 風車島 1：第二支風機的塔身（矮一點，西北；葉片是 sat.windmill 的 twin 轉子；塔身是這個零件的第一個）＋電池屋（西邊，通電時亮一條綠燈）；
  // 2：變電小站——水泥墊、變壓箱、兩個礙子（霓虹藍，同 chip.cable 的光）
  put('windmill', 0, () => [
    { kind: 'cylinder', pos: [-0.55, 0.6, -0.9], scale: [0.08, 1.2, 0.08], color: C.cream }, { kind: 'sphere', pos: [-0.55, 1.2, -0.86], scale: 0.11, color: C.cream },
    { kind: 'rbox', pos: [-1.45, 0.14, -0.2], scale: [0.36, 0.28, 0.28], color: C.navy },
    { kind: 'box', pos: [-1.45, 0.2, -0.055], scale: [0.26, 0.05, 0.02], color: on ? C.alien : C.window, ...(on ? { glow: C.alien } : {}) },
    { kind: 'box', pos: [-1.45, 0.3, -0.2], scale: [0.38, 0.03, 0.3], color: C.curb },
  ]);
  put('windmill', 1, () => [
    { kind: 'box', pos: [0.6, 0.02, -1.05], scale: [0.6, 0.04, 0.42], color: C.curb },
    { kind: 'rbox', pos: [0.45, 0.14, -1.05], scale: [0.2, 0.22, 0.24], color: 0x8a8f96 },
    ...[0.68, 0.82].flatMap(x => [
      { kind: 'cylinder', pos: [x, 0.13, -1.05], scale: [0.04, 0.22, 0.04], color: C.curb },
      ...[0.2, 0.26, 0.32].map(y => ({ kind: 'cylinder', pos: [x, y, -1.05], scale: [0.09, 0.03, 0.09], color: C.neonBlue, glow: C.neonBlue })),
    ]),
  ]);
  // 石堆島 1：最大那顆石頭的鏡頭側一個鼠洞＋島東南一塊曬太陽的平石板（老鼠照舊站在石頭頂上）
  put('rocks', 0, () => [
    { kind: 'sphere', pos: [-0.38, 0.1, 0.66], scale: [0.2, 0.15, 0.06], color: C.ink },
    { kind: 'box', pos: [0.6, 0.04, 0.5], scale: [0.5, 0.06, 0.34], rot: [0, 0.4, 0], color: 0xd6c8b4 },
    { kind: 'box', pos: [0.62, 0.075, 0.48], scale: [0.36, 0.02, 0.22], rot: [0, 0.4, 0], color: C.sand },
  ]);
  // 階梯丘：基座是營區（晶片 Lv3，梯田頂上，原本的 sat.camp；手機照畫）；1：第二頂帳篷，在第四層梯田上（營區旁、鏡頭側）；
  // 2：觀測站——梯田腳下東北一座小圓頂（淡淡發光）＋斜指天空的望遠鏡。營區跟第一段同一級出現，併在第一段（那一拍營區佔一格）；觀測站自己一個零件（tagAlong）
  const camp = shift([
    { kind: 'prism', pos: [-0.12, 0.14, 0], scale: [0.36, 0.5, 0.28], rot: [0, 0, Math.PI / 2], color: C.yellow },
    ...[0, 1, 2].map(i => ({ kind: 'trunk', pos: [0.22 + Math.cos(i * 2.1) * 0.05, 0.03, Math.sin(i * 2.1) * 0.05], scale: [0.03, 0.06, 0.12], rot: [Math.PI / 2, i * 2.1, 0], color: C.wood })),
    { kind: 'sphere', pos: [0.22, 0.09, 0], scale: 0.09, color: C.coral, glow: C.coral },
  ], [0, 0.9, 0]);
  put('pyramid', 0, () => [
    { kind: 'prism', pos: [0.05, 0.81, 0.35], scale: [0.2, 0.32, 0.18], rot: [0, 0, Math.PI / 2], color: C.coral },
    { kind: 'box', pos: [0.05, 0.725, 0.45], scale: [0.18, 0.01, 0.06], color: C.wood },
  ], { base: camp });
  put('pyramid', 1, () => [
    { kind: 'cylinder', pos: [1.25, 0.12, -0.75], scale: [0.5, 0.24, 0.5], color: C.wall },
    { kind: 'dome', pos: [1.25, 0.24, -0.75], scale: [0.48, 0.44, 0.48], color: C.cream, glow: C.glass },
    { kind: 'cylinder', pos: [1.12, 0.46, -0.62], scale: [0.07, 0.4, 0.07], rot: [0.6, 0, 0.5], color: C.navy },
  ]);
  // 遊樂場島 1：鞦韆——西北一座 A 字架、兩個座位（update 盪）
  anim('playground', 0, { kind: 'swing', pivot: [-0.55, 0.62, -1.05], parts: [
    ...[-0.38, 0.38].flatMap(dx => [-0.12, 0.12].map(dz => ({ kind: 'cylinder', pos: [-0.55 + dx, 0.3, -1.05 + dz], scale: [0.04, 0.64, 0.04], rot: [dz > 0 ? -0.36 : 0.36, 0, 0], color: C.blue }))),
    { kind: 'cylinder', pos: [-0.55, 0.62, -1.05], scale: [0.05, 0.8, 0.05], rot: [0, 0, Math.PI / 2], color: C.blue },
  ], seats: [-0.16, 0.16].flatMap(dx => [
    { kind: 'box', pos: [dx - 0.07, -0.24, 0], scale: [0.01, 0.48, 0.01], color: C.ink }, { kind: 'box', pos: [dx + 0.07, -0.24, 0], scale: [0.01, 0.48, 0.01], color: C.ink },
    { kind: 'box', pos: [dx, -0.48, 0], scale: [0.18, 0.025, 0.1], color: C.coral },
  ]) });
  // 遊樂場島 2：旋轉木馬——東邊一座圓台、四根柱子、條紋頂篷、四匹小馬（update 轉；大停電時停，同燈籠串）
  anim('playground', 1, { kind: 'carousel', pivot: [1.3, 0, 0.45], speed: flags.blackout ? 0 : 1, parts: [
    { kind: 'cylinder', pos: [1.3, 0.04, 0.45], scale: [0.78, 0.08, 0.78], color: C.cream },
    { kind: 'cylinder', pos: [1.3, 0.3, 0.45], scale: [0.08, 0.5, 0.08], color: C.yellow },
    { kind: 'cone', pos: [1.3, 0.64, 0.45], scale: [0.86, 0.26, 0.86], color: C.coral },
    ...[0, 1, 2, 3].flatMap(i => { const a = i * Math.PI / 2 + Math.PI / 4, x = 1.3 + Math.cos(a) * 0.28, z = 0.45 + Math.sin(a) * 0.28; return [
      { kind: 'cylinder', pos: [x, 0.3, z], scale: [0.025, 0.5, 0.025], color: C.yellow },
      { kind: 'rbox', pos: [x, 0.2, z], scale: [0.06, 0.08, 0.14], rot: [0, -a, 0], color: [C.white, C.blue, C.yellow, C.wall][i] },
    ]; }),
  ] });
  // 小森林：基座是分店（珍奶 Lv5，原本的 sat.forestShop；手機照畫）；1：茶屋桌椅——分店北邊兩張圓桌、四張小凳；
  // 2：燈籠串——兩棵樹之間（西南那棵到東邊那棵）一條往鏡頭側彎的繩子掛六顆燈籠（暖黃發光；大停電時暗）
  const lit = !flags.blackout, bez = k => { const P0 = [-0.45, 0.62, 0.62], C1 = [0.05, 0.5, 0.95], P2 = [0.55, 0.62, 0.55], u = 1 - k; return P0.map((a, j) => u * u * a + 2 * u * k * C1[j] + k * k * P2[j]); };
  const lamps = Array.from({ length: 6 }, (_, i) => bez((i + 0.5) / 6)), knots = Array.from({ length: 7 }, (_, i) => bez(i / 6));
  const shop = shift([
    { kind: 'box', pos: [0, 0.22, 0], scale: [0.45, 0.44, 0.35], color: C.wall }, { kind: 'hip', pos: [0, 0.55, 0], scale: [0.55, 0.2, 0.45], color: C.coral },
    { kind: 'cylinder', pos: [0, 0.78, 0], scale: [0.16, 0.22, 0.16], color: 0xc9a27c },
  ], [1.0, 0, 0.9]);
  put('forest', 0, () => [0, 1].flatMap(i => { const x = 1.25 + i * 0.2, z = 0.2 - i * 0.5; return [   // 六角半徑 ≤ 1.9：離島緣的步道環（2.11 起）遠
    { kind: 'cylinder', pos: [x, 0.17, z], scale: [0.24, 0.025, 0.24], color: C.wood }, { kind: 'cylinder', pos: [x, 0.08, z], scale: [0.04, 0.16, 0.04], color: C.wood },
    { kind: 'cylinder', pos: [x - 0.18, 0.06, z + 0.05], scale: [0.1, 0.12, 0.1], color: C.coral }, { kind: 'cylinder', pos: [x + 0.18, 0.06, z - 0.05], scale: [0.1, 0.12, 0.1], color: C.coral },
  ]; }), { base: shop });
  put('forest', 1, () => [
    ...knots.slice(1).map((b, i) => { const a = knots[i], dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dx, dy, dz);
      return { kind: 'box', pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.06, (a[2] + b[2]) / 2], scale: [0.012, 0.012, l], rot: [-Math.asin(dy / l), Math.atan2(dx, dz), 0], color: C.ink }; }),
    ...lamps.map(p => ({ kind: 'sphere', pos: p, scale: [0.09, 0.11, 0.09], color: C.warm, ...(lit ? { glow: C.warm } : {}) })),
  ]);
  // 寶箱島 1：海鷗（自己一個零件：寶箱開箱時才變，海鷗飛來不重閃寶箱）
  put('chest', 0, () => gull(allMax(lv)));
  // 寶箱島 2：金幣噴泉——全 MAX 開箱，六枚金幣從箱口慢慢噴起、落回（update；一個 InstancedMesh、金色發光）
  if (allMax(lv)) v['sat.chest.stage2'] = { kind: 'coins', at: island('chest'), footprint: false, tagAlong: true, low: false, parts: Array.from({ length: 6 }, (_, i) => ({ kind: 'cylinder', pos: [0.2 + Math.cos(i * 1.05) * 0.12, 0.42, 0.2 + Math.sin(i * 1.05) * 0.1], scale: [0.1, 0.02, 0.1], color: GOLD })) };
  return v;
}

// 幾組各自繞自己的 pivot 動的零件，併成一個 mesh（一個 draw call；計畫 6 任務 6）：每組先用 compound 併好（只用黏土色），
// 再整個併成一個幾何；pivots[i]（object 底下的空 Group，可以巢狀）是第 i 組的座標系，劇本／測試照舊轉它們，
// pose() 在 CPU 上把每組的頂點套上 pivot 相對 object 的矩陣（幾百個頂點，一幀一次）。建好就是 pose 過的樣子
function rig(THREE, ctx, object, groups) {
  const built = groups.map(g => ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: g.parts }));
  const meshes = built.map(b => b.object.children[0]), geo = mergeGeometries(meshes.map(m => m.geometry)), material = meshes[0].material;
  const ranges = []; let at = 0; for (const m of meshes) { const n = m.geometry.attributes.position.count; ranges.push([at, n]); at += n; }
  built.forEach(b => b.dispose());
  const pos = geo.attributes.position, nor = geo.attributes.normal, base = pos.array.slice(), baseN = nor.array.slice();
  const mesh = new THREE.Mesh(geo, material); mesh.castShadow = mesh.receiveShadow = true; object.add(mesh);
  // 包圍球（視錐與陰影的裁切用）：每組的頂點只繞自己的 pivot 轉，落在「pivot 為心、半徑 = 縮放 × 最遠頂點」的球裡——各組的球聯集，
  // 建一次就涵蓋所有姿勢（不關裁切：關掉的話鏡頭外的轉子也多一個 draw call）
  const reach = ranges.map(([s, n]) => { let r = 0; for (let j = s; j < s + n; j++) r = Math.max(r, Math.hypot(base[j * 3], base[j * 3 + 1], base[j * 3 + 2])); return r; });
  const m4 = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  const pose = () => {
    object.updateMatrixWorld(true);
    inv.copy(object.matrixWorld).invert();
    groups.forEach((g, i) => {
      m4.multiplyMatrices(inv, g.pivot.matrixWorld); nm.getNormalMatrix(m4);
      const [s, n] = ranges[i];
      for (let j = s; j < s + n; j++) {
        v.fromArray(base, j * 3).applyMatrix4(m4).toArray(pos.array, j * 3);
        v.fromArray(baseN, j * 3).applyMatrix3(nm).normalize().toArray(nor.array, j * 3);
      }
    });
    pos.needsUpdate = nor.needsUpdate = true;
  };
  pose();
  geo.boundingSphere = groups.reduce((acc, g, i) => {
    m4.multiplyMatrices(inv, g.pivot.matrixWorld);
    const sph = new THREE.Sphere(new THREE.Vector3().setFromMatrixPosition(m4), reach[i] * m4.getMaxScaleOnAxis());
    return acc ? acc.union(sph) : sph;
  }, null);
  return { mesh, pose, dispose() { geo.dispose(); } };
}

export const builders = {
  rats: ratBuilders.rats,
  // 風車葉片：三片繞 hub 轉；暴風時整座搖。twin（離島三段，燈泡 Lv7 起）：第二支風機的轉子（縮 0.8）在相對 hub 的 twin 處，同速轉、同樣搖；?quality=low 不畫（塔身那段也不畫）
  blades(THREE, spec, ctx) {
    const blades = () => [0, 1, 2].map(i => { const a = i * Math.PI * 2 / 3; return { kind: 'box', pos: [Math.sin(a) * 0.38, Math.cos(a) * 0.38, 0], scale: [0.08, 0.75, 0.03], rot: [0, 0, -a], color: C.cream }; });
    // 搖晃只加在葉片的角度上（轉角 spin + 搖 w）：轉子的 hub 一直在各自的塔頂上，第二支不會繞著第一支的 hub 甩。
    // 兩個轉子併成一個 mesh（rig）：object.children[0] 是主轉子的 pivot、children[1]（holder，縮 0.8）.children[0] 是第二支的 pivot
    const object = new THREE.Group(), rotor = new THREE.Group(); object.add(rotor);
    const twin = spec.twin && ctx.quality !== 'low' ? new THREE.Group() : null, holder = new THREE.Group();
    if (twin) { holder.position.set(...spec.twin); holder.scale.setScalar(0.8); holder.add(twin); object.add(holder); }
    const r = rig(THREE, ctx, object, [{ parts: blades(), pivot: rotor }, ...(twin ? [{ parts: blades(), pivot: twin }] : [])]);
    let spin = 0;
    return {
      object,
      update(dt, t) {
        const w = spec.wobble ? Math.sin(t * 8) * 0.05 : 0;
        spin -= dt * spec.speed; rotor.rotation.z = spin + w;
        if (twin) twin.rotation.z = spin + (spec.wobble ? Math.sin(t * 8 + 1) * 0.05 : 0);
        if (spec.speed || spec.wobble) r.pose();
      },
      dispose: r.dispose,
    };
  },
  // 鞦韆：架子不動；兩個座位（含吊繩）掛在橫桿 pivot 上，前後盪 ±0.45 rad。架子和座位併成一個 mesh（rig）
  swing(THREE, spec, ctx) {
    const object = new THREE.Group(), frame = new THREE.Group(), pivot = new THREE.Group(); pivot.position.set(...spec.pivot); object.add(frame, pivot);
    const r = rig(THREE, ctx, object, [{ parts: spec.parts, pivot: frame }, { parts: spec.seats, pivot }]);
    return { object, update(dt, t) { pivot.rotation.x = Math.sin(t * 2.4) * 0.45; r.pose(); }, dispose: r.dispose };
  },
  // 旋轉木馬：整座繞 pivot 的直軸慢慢轉（speed 1 = 每 8 秒一圈；0 停）
  carousel(THREE, spec, ctx) {
    const [px, py, pz] = spec.pivot, body = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: spec.parts.map(p => ({ ...p, pos: [p.pos[0] - px, p.pos[1] - py, p.pos[2] - pz] })) });
    const pivot = new THREE.Group(); pivot.position.set(px, py, pz); pivot.add(body.object);
    const object = new THREE.Group(); object.add(pivot);
    return { object, update(dt) { pivot.rotation.y += dt * (spec.speed ?? 1) * Math.PI / 4; }, dispose: body.dispose };
  },
  // 金幣噴泉：六枚金幣（spec.parts 是箱口的起點）輪流沿拋物線噴起 0.5、往外 0.25 落回，一枚 2.4 秒、彼此錯開；邊飛邊翻，頭尾縮放（不閃現）。
  // 一個 InstancedMesh（一個 draw call），金色發光（?quality=low 不發光）；建好就是 t = 0 的樣子
  coins(THREE, spec, ctx) {
    const N = spec.parts.length, PERIOD = 2.4, geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
    const glow = ctx.quality !== 'low', mat = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.5, metalness: 0.2, ...(glow ? { emissive: GOLD } : {}) });
    if (glow) ctx.glow.add(mat);
    const mesh = new THREE.InstancedMesh(geo, mat, N); mesh.castShadow = false; mesh.frustumCulled = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const pose = t => {
      spec.parts.forEach((c, i) => {
        const k = ((t / PERIOD + i / N) % 1 + 1) % 1, a = i * 1.05, out = 0.25 * k;
        p.set(c.pos[0] + Math.cos(a) * out, c.pos[1] + 2 * 0.5 * 2 * k * (1 - k), c.pos[2] + Math.sin(a) * out);
        const g = Math.min(1, k / 0.12, (1 - k) / 0.12);   // 噴出時從 0 長大、落回箱口前縮到 0：一輪接一輪不跳
        mesh.setMatrixAt(i, m4.compose(p, q.setFromEuler(e.set(k * 6, a, 0)), sc.set(c.scale[0] * g, c.scale[1] * g, c.scale[2] * g)));
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    pose(0);
    const object = new THREE.Group(); object.add(mesh);
    return { object, update(dt, t) { pose(t); }, dispose() { geo.dispose(); if (glow) ctx.glow.remove(mat); mat.dispose(); } };
  },
  // 燈塔光束：半透明長錐，每 4 秒掃一圈
  beam(THREE) {
    const geo = new THREE.ConeGeometry(0.5, 4, 12, 1, true).translate(0, -2, 0).rotateZ(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    const object = new THREE.Group(); object.add(mesh);
    return { object, update(dt, t) { mesh.rotation.y = t * Math.PI / 2; }, dispose() { geo.dispose(); mesh.material.dispose(); } };
  },
  // 海上的船：小船／帆船交錯，各自繞一圈；觀光船隨珍奶變多
  boats(THREE, spec, ctx) {
    const object = new THREE.Group();
    const subs = Array.from({ length: spec.n }, (_, i) => {
      const r = 15.5 + i * 0.9, sail = i % 2 === 1;
      const sub = ctx.build({ kind: 'glb', at: { x: 0, y: 0, z: 0 }, path: `quat/ships/${sail ? 'BoatWSail' : 'Boat'}.glb`, h: sail ? 0.8 : 0.35,
        loop: { path: ringPath({ x: 0, z: 0 }, r, 0, 48), speed: (0.05 + i * 0.01) * r, phase: i / spec.n } });
      object.add(sub.object); return sub;
    });
    return { object, update(dt, t) { subs.forEach((s, i) => { s.update(dt, t); s.object.position.y = Math.sin(t * 2 + i) * 0.02; }); }, dispose() { for (const s of subs) s.dispose(); } };
  },
};
