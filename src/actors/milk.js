// 鮮奶（物品 v2 §4.2，max 10）：牛奶箱 → 早餐店 → 小學（一層）＋ 3 個小孩 → 兩層、小孩長高 → 三層、升旗 → 鐘塔、棒球帽（有球場就組少棒隊）
//   → ◆ 大學（校舍拉長、拱門校門、學士帽）→ 研究大樓（玻璃盒）、白袍、校門 YouBike → 畢業典禮（拋學士帽、101 打字）
//   → ◆ 鮮奶節（全島每格多一個小孩、牛奶箱旁停牛奶車、岸邊觀光船載牛奶箱）。
// 校舍是視覺標準件（§7.1）：小學／大學／研究大樓用 Kenney City Kit Commercial 的 glb，經載入器重上色票（牆奶油、飾邊珊瑚、玻璃藍）。
// 被老鼠咬或颱風登陸那回合：小孩躲回校舍，窗戶亮燈（下一回合照常出來；颱風賴著不走也一樣）。
// 劇本（§6）：一級 3–5 秒（走到位、一個動作、閃白、LEVEL UP）；◆ Lv7、Lv10 ≤ 10 秒、最後回全景定格。
import { anchorWorld, cellCentre } from './anchors.js';
import { HOME_R } from './landmarks.js';
import { C, roofColor, rebuilt, offset } from './palette.js';
import { WATER_Y } from '../scene/hex.js';

export const id = 'milk';
export const labelY = 1.4;

const AT = anchorWorld('milk');
const SPOILED = 0xb9b5b0, SPOILED_BAND = 0x8c8a88;   // 停電後的牛奶箱（灰）
export const CRATE = offset(AT, -0.95, 0.75);         // 牛奶箱
const PLAY = offset(AT, 0, 0.95);                     // 操場中心
export const FESTIVAL_HOMES = [[-1, 0], [1, 0], [1, -1]].map(cellCentre);   // 鮮奶節多的三個小孩：鮮奶格、晶片格、溫泉格（裁決 R16）
const POLE = offset(AT, 0.75, 0.95);                  // 旗桿
const ARCH = offset(AT, 1.1, 0.3), PILLAR = 0.3;      // 大學拱門校門（中心、兩根柱子離中心多遠）；右柱離小學生入口 ≥ 0.3（柱子有 footprint）
const BIKES = offset(AT, 1.4, 0.8);                   // 校門旁的 YouBike 站
const TRUCK = offset(AT, -1.25, 0.1);                 // 鮮奶節的牛奶車：牛奶箱與研究大樓之間（西岸的電工主路、橋頭都不擋）
// 小學生的入口（§13.2）：校門外、靠中心格那側的邊上（中心格那座橋的橋頭旁）；出場、躲完回來、退場都走這裡
export const KID_ENTRY = offset(AT, 1.65, 0.1);
const MILK = [-1, 0];   // 鏡頭對的格子：校舍
// 少棒隊只在鐘塔那一級（Lv6）：升格大學後回校園
const league = lv => lv.milk === 6 && lv.baseball >= 2;
// 小孩日常的中心：少棒隊在巨蛋旁的空地練球（門口留給球員和觀眾），否則在操場
const kidsCenter = lv => (league(lv) ? offset(anchorWorld('baseball'), -1.15, 0.75) : PLAY);

// ── 校舍模型（§7.1 標準件）：size = glb 原始包圍盒（x, y, z），縮放到高度 h 後的佔地照比例算 ──
export const MODELS = {
  shop: { path: 'quat/buildings/1Story_Sign_Mat.glb', size: [2.15, 1.79, 2.15] },        // 早餐店
  wing: { path: 'kenney/commercial/building-e.glb', size: [1.64, 0.89, 1.01] },         // 一層教室＋兩層辦公室（小學、大學的側翼）
  block2: { path: 'kenney/commercial/building-c.glb', size: [0.88, 0.89, 1.09] },       // 兩層教室
  block3: { path: 'kenney/commercial/building-a.glb', size: [0.88, 1.29, 0.94] },       // 三層教室
  lab: { path: 'kenney/commercial/low-detail-building-wide-b.glb', size: [1.0, 1.15, 0.5] },   // 研究大樓（帶狀玻璃）
  truck: { path: 'kenney/car/truck.glb', size: [1.5, 1.3, 2.95] },
  boat: { path: 'quat/ships/Boat.glb' },
};
// Kenney 新版套件的顏色在色票圖裡：tint 的鍵是色票格 '#rrggbb' 的正規式（順序 = 比對優先序）
const WINDOW = '^#[7-9][0-9a-f][a-b][0-9a-f][d-e][0-9a-f]$';   // 藍玻璃窗
const kenneyTint = (trim, { glass = C.window, wall = C.cream } = {}) => ({
  [WINDOW]: glass, '^#[34][0-9a-f]|^#50': C.navy, '^#[5-8][0-9a-f][5-8]': trim, '^#[c-f]': wall,
});
const LAB_TINT = kenneyTint(C.blue, { glass: C.blue, wall: C.glass });   // 研究大樓：帶狀玻璃藍、樓板淡玻璃色
const SHOP_TINT = { '^DarkWood$': C.coral, '^DarkBrown$': C.wood, '^Dark$': C.wall, '^Bricks$': C.sand, '^Main$': C.cream, '^Light$': C.yellow, '^White$': C.white, '^Black$': C.ink, '^Glass$': C.glass };
// 牛奶車：綠色車身換白、車窗淡藍
const TRUCK_TINT = { '^#[3-5][0-9a-f][9a-c]': C.white, '^#[89ab][0-9a-f][89ab][0-9a-f][a-e]': C.glass, '^#[3-4][0-9a-f][3-4]': C.navy };
const BOAT_TINT = { '^DarkWood$': C.coral, '^Wood$': C.cream };

// 一棟模型：pos 相對零件的 at；佔地（footprint）照縮放後的尺寸（轉 90° 長寬對調）
const model = (key, pos, h, extra = {}) => ({ path: MODELS[key].path, pos, h, ...extra });
function footprintOf(m) {
  const k = Object.values(MODELS).find(x => x.path === m.path), s = m.h / k.size[1], turned = Math.abs(Math.sin(m.ry ?? 0)) > 0.5;
  const [w, d] = turned ? [k.size[2] * s, k.size[0] * s] : [k.size[0] * s, k.size[2] * s];
  return { x: m.pos[0], z: m.pos[2], w, d };
}
// 每一級的校舍（Lv2 起）：x 置中排在操場後面（z −0.5）
const ROW = -0.5, UNI = -0.6;
const LAB = offset(AT, -0.95, UNI);   // 研究大樓（Lv8 起換掉大學左翼）
function campusModels(n) {
  if (n === 2) return [model('shop', [-0.2, 0, ROW], 0.85)];
  if (n === 3) return [model('wing', [0, 0, ROW], 0.8)];
  if (n === 4) return [model('wing', [-0.4, 0, ROW], 0.8), model('block2', [0.75, 0, ROW], 0.85)];
  if (n <= 6) return [model('wing', [-0.4, 0, ROW], 0.8), model('block3', [0.75, 0, ROW], 1.2)];
  // 大學：兩翼對稱拉長（右翼轉半圈），中間鐘塔；往後退一點，校門口的入口才不貼牆。Lv8 起左翼換成研究大樓
  const right = model('wing', [0.92, 0, UNI], 0.85, { ry: Math.PI });
  return n === 7 ? [model('wing', [-0.92, 0, UNI], 0.85), right] : [model('lab', [LAB.x - AT.x, 0, UNI], 1.6), right];
}
// 鐘塔：Lv6 在三層樓頂，Lv7 起在大學兩翼中間（從地面起）；尖頂到 top + 0.4
const towerOf = n => (n === 6 ? { x: 0.75, z: ROW, base: 1.2, w: 0.3, hh: 0.45 } : { x: 0, z: UNI + 0.15, base: 0, w: 0.42, hh: 1.4 });
function clockTower(n, lv) {
  const { x, z, base, w, hh } = towerOf(n), top = base + hh;
  return [
    { kind: 'box', pos: [x, base + hh / 2, z], scale: [w, hh, w], color: C.wall },
    { kind: 'cone', pos: [x, top + 0.2, z], scale: [w + 0.12, 0.4, w + 0.12], color: roofColor(C.navy, rebuilt(lv)) },
    { kind: 'sphere', pos: [x, top - 0.16, z + w / 2 + 0.01], scale: [0.18, 0.18, 0.04], color: C.yellow, glow: C.yellow },
  ];
}
// 早餐店門口的兩張桌子（桌面、桌腳、兩張板凳）
const table = (x, z) => [
  { kind: 'cylinder', pos: [x, 0.2, z], scale: [0.32, 0.03, 0.32], color: C.cream },
  { kind: 'cylinder', pos: [x, 0.1, z], scale: [0.04, 0.2, 0.04], color: C.wood },
  { kind: 'cylinder', pos: [x - 0.24, 0.07, z], scale: [0.12, 0.14, 0.12], color: C.coral },
  { kind: 'cylinder', pos: [x + 0.24, 0.07, z], scale: [0.12, 0.14, 0.12], color: C.coral },
];
// YouBike：黃車架、黑輪，三台前後排（車身沿 x，輪子朝鏡頭）＋車柱
const bikes = (x, z) => [
  ...[-0.18, 0, 0.18].flatMap(dz => [
    { kind: 'box', pos: [x, 0.13, z + dz], scale: [0.24, 0.04, 0.03], color: C.yellow },
    { kind: 'box', pos: [x - 0.12, 0.17, z + dz], scale: [0.03, 0.1, 0.03], color: C.yellow },
    { kind: 'torus', pos: [x - 0.09, 0.08, z + dz], scale: 0.13, color: C.ink },
    { kind: 'torus', pos: [x + 0.09, 0.08, z + dz], scale: 0.13, color: C.ink },
  ]),
  { kind: 'box', pos: [x - 0.2, 0.1, z], scale: [0.05, 0.2, 0.5], color: C.yellow },
];
// 觀光船停在西岸（水上，格子外）
const BOAT = offset(AT, -2.8, 0.55, WATER_Y - AT.y - 0.02);

// 小學生的配件（遊樂場島的小孩也照這張表，satellites.js）：Lv6 棒球帽、Lv7 學士帽、Lv8 白袍、Lv9 起帽子拋掉了
export const kidAccessory = n => (n >= 9 ? 'none' : n >= 8 ? 'coat' : n >= 7 ? 'mortar' : n >= 6 ? 'cap' : 'none');

export function view(lv, flags, meta = {}) {
  const n = lv.milk, at = AT, v = {};
  if (!n) return v;
  // 大停電：冰箱沒電，牛奶箱變灰（颱風劇本閃白換上、LEVEL DOWN）
  // 被老鼠咬的那回合：箱子側躺（藍帶從頂上轉到側面）、地上一灘牛奶（下一回合閃白扶正）
  const spoiled = !!flags.blackout, tipped = !!meta.bitten;
  v['milk.crate'] = { kind: 'compound', at: CRATE, labelY: 0.8, footprint: { r: 0.3 }, parts: [
    { kind: 'rbox', pos: [0, 0.225, 0], scale: 0.45, color: spoiled ? SPOILED : C.cream },
    tipped ? { kind: 'box', pos: [-0.075, 0.225, 0], scale: [0.08, 0.47, 0.47], color: spoiled ? SPOILED_BAND : C.blue }
      : { kind: 'box', pos: [0, 0.3, 0], scale: [0.47, 0.08, 0.47], color: spoiled ? SPOILED_BAND : C.blue },
    ...(tipped ? [{ kind: 'cylinder', pos: [0.38, 0.01, 0.05], scale: [0.4, 0.02, 0.28], color: C.white, spill: true }] : []),
  ] };
  if (n < 2) return v;
  const home = (lv.typhoon === 2 && !!meta.landing) || !!meta.bitten;
  // 校舍：一個零件裡幾棟 glb（builders.campus）；飾邊是屋頂色（颱風重建換色），小孩躲回來時窗戶亮燈
  const trim = roofColor(C.coral, rebuilt(lv)), lit = home ? { [WINDOW]: C.warm } : null;
  const models = campusModels(n).map(m => ({
    ...m, tint: m.path === MODELS.shop.path ? SHOP_TINT : m.path === MODELS.lab.path ? LAB_TINT : kenneyTint(trim),
    ...(lit && m.path.startsWith('kenney/commercial/building-') ? { glow: lit } : {}),   // 有藍玻璃窗的那幾棟
  }));
  // 頭上（LEVEL UP、泡泡）：最高的那棟或鐘塔尖頂再高一點
  const top = Math.max(...models.map(m => m.h), n >= 6 ? towerOf(n).base + towerOf(n).hh + 0.4 : 0);
  v['milk.main'] = { kind: 'campus', at, models, labelY: top + 0.3, footprint: models.map(footprintOf) };
  if (n >= 6) v['milk.tower'] = { kind: 'compound', at, footprint: n >= 7 ? { x: 0, z: UNI + 0.15, w: 0.42, d: 0.42 } : false, parts: clockTower(n, lv) };
  // 院子：Lv2 早餐店的桌子；Lv3 起操場（沙地），Lv5 起旗桿；Lv10 岸邊觀光船上的牛奶箱也併在這裡（一個 draw call）
  const yard = n === 2 ? [...table(-0.6, 0.3), ...table(0.3, 0.45)] : [
    { kind: 'cylinder', pos: [0, 0.02, 0.95], scale: [1.2, 0.04, 1.2], color: C.sand },
    ...(n >= 5 ? [{ kind: 'cylinder', pos: [0.75, 0.4, 0.95], scale: [0.03, 0.8, 0.03], color: C.cream }] : []),
    ...(n >= 9 ? [   // 畢業典禮的紅布條：操場後面兩根竿子
      { kind: 'box', pos: [-0.45, 0.35, 0.3], scale: [0.03, 0.7, 0.03], color: C.cream }, { kind: 'box', pos: [0.45, 0.35, 0.3], scale: [0.03, 0.7, 0.03], color: C.cream },
      { kind: 'box', pos: [0, 0.6, 0.3], scale: [0.9, 0.16, 0.02], color: C.coral },
    ] : []),
    ...(n >= 10 ? [-0.12, 0.14].map((dx, i) => ({ kind: 'rbox', pos: [BOAT.x - at.x + dx, BOAT.y - at.y + 0.3 + i * 0.05, BOAT.z - at.z], scale: 0.2, color: C.cream })) : []),
  ];
  // footprint 只算早餐店的桌子（操場、旗桿、布條可以走）
  v['milk.yard'] = { kind: 'compound', at, parts: yard, footprint: n === 2 ? [{ x: -0.6, z: 0.3, r: 0.4 }, { x: 0.3, z: 0.45, r: 0.4 }] : false };
  // 旗子自己一個零件：Lv5 劇本讓它沿著旗桿升上去（scale.y 0→1，以地面為基準）
  if (n >= 5) v['milk.flag'] = { kind: 'compound', at, footprint: false, parts: [{ kind: 'box', pos: [0.86, 0.72, 0.95], scale: [0.2, 0.13, 0.02], color: C.coral, flag: true }] };
  // 大學校門：兩根柱子 + 半圈拱；Lv8 起旁邊 YouBike 站。footprint 只算兩根柱子（拱門中間可以穿過去；
  // 單車跟旗桿一樣是小東西，不擋往橋頭的路）
  const pillars = [-PILLAR, PILLAR].map(dx => ({ x: ARCH.x - at.x + dx, z: ARCH.z - at.z }));
  if (n >= 7) v['milk.gate'] = { kind: 'compound', at, footprint: pillars.map(p => ({ ...p, r: 0.06 })), parts: [
    ...pillars.map(p => ({ kind: 'box', pos: [p.x, 0.35, p.z], scale: [0.1, 0.7, 0.1], color: C.wall })),
    { kind: 'torus', pos: [ARCH.x - at.x, 0.7, ARCH.z - at.z], scale: 2 * PILLAR + 0.02, color: C.wall },
    ...(n >= 8 ? bikes(BIKES.x - at.x, BIKES.z - at.z) : []),
  ] };
  // 畢業典禮拋上天的學士帽，落在操場上（Lv9 劇本從空中掉下來）
  if (n >= 9) v['milk.hats'] = { kind: 'compound', at, footprint: false, parts: [[-0.5, 0.75], [-0.2, 1.3], [0.3, 1.25], [0.5, 0.65], [0.05, 0.6], [-0.45, 1.15]].map(([x, z], i) => (
    { kind: 'box', pos: [x, 0.05, z], scale: [0.13, 0.015, 0.13], rot: [0, i * 0.7, 0], color: C.ink })) };
  // 鮮奶節：牛奶車（停在牛奶箱旁）、西岸觀光船
  if (n >= 10) {
    const truck = { path: MODELS.truck.path, pos: [0, 0, 0], h: 0.38, ry: Math.PI / 2 };
    v['milk.truck'] = { kind: 'glb', at: TRUCK, path: truck.path, h: truck.h, ry: truck.ry, tint: TRUCK_TINT, footprint: footprintOf(truck) };
    v['milk.boat'] = { kind: 'glb', at: BOAT, path: MODELS.boat.path, h: 0.35, tint: BOAT_TINT, footprint: false };
  }
  if (n >= 3 && !home) {
    v['milk.kids'] = {
      kind: 'roster', at, n: 3, shirt: C.yellow, accessory: kidAccessory(n), scale: n >= 4 ? 1.3 : 1,
      home: { kind: 'wander', at: kidsCenter(lv), r: league(lv) ? 0.4 : 0.5, entry: KID_ENTRY },
    };
    // 鮮奶節：多三個小孩，鮮奶格、晶片格、溫泉格各一個（人數預算，裁決 R16；同島民的散步半徑，各自從自己那格的邊上走進來）
    if (n >= 10) v['milk.extraKids'] = { kind: 'roster', at: FESTIVAL_HOMES[0], n: FESTIVAL_HOMES.length, shirt: C.yellow, accessory: 'cap', home: { kind: 'wander', at: FESTIVAL_HOMES, r: HOME_R } };
  }
  return v;
}

export const builders = {
  // 校舍：幾棟 glb 併成一個零件（每棟一個 glb 子零件，位置相對零件的 at）；閃白、拿掉都整組一起
  campus(THREE, spec, ctx) {
    const object = new THREE.Group();
    const subs = spec.models.map(m => {
      const p = ctx.build({ kind: 'glb', at: { x: m.pos[0], y: m.pos[1], z: m.pos[2] }, path: m.path, h: m.h, ry: m.ry ?? 0, tint: m.tint, glow: m.glow });
      object.add(p.object); return p;
    });
    return { object, dispose() { for (const s of subs) s.dispose(); } };
  },
};

// ── 劇本（§6：一級 3–5 秒）──
// 角色都是演到那一拍才找（小孩可能還沒出來、或躲在校舍裡 → 回空值，那拍跳過）；找到第一次就記住，整段劇本同一個人。
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };
const kid = (ctx, i) => () => ctx.roster.members('milk.kids')[i] ?? null;
const KIDS = [0, 1, 2];
const allKids = c => c.roster.members('milk.kids');
// 從入口（校門外靠中心格那側）放一個小學生出來；小孩這時躲在校舍裡（老鼠咬、颱風登陸）就沒有名冊可放，這拍跳過
function spawnKid(ctx) {
  const beat = ctx.B.spawn('milk.kids', KID_ENTRY), start = beat.start;
  beat.start = c => (view(c.stage.lv, c.stage.flags, c.stage.meta)['milk.kids'] ? start(c) : false);
  return beat;
}
// 三個小孩一起走到 centre 附近各自的位置（slots 半徑 r）
const gather = (ctx, centre, r, opts) => ctx.B.together(KIDS.map(i => ctx.B.walk(kid(ctx, i), c => c.nav.slots(centre, 3, r)[i], opts?.(i))));

export const script = {
  // 最近的島民把牛奶箱送來：走到箱子旁、看一眼、閃白放下、♥、揮手
  placed(e, s, ctx) {
    const { B } = ctx, islander = once(c => c.roster.nearest('landmarks.islanders', CRATE));
    return [B.walk(islander, offset(CRATE, 0.5, 0.1)), B.gesture(islander, 'look', { at: CRATE }), B.apply(e), B.bubble(islander, '♥'), B.gesture(islander, 'wave'), B.home(islander)];
  },
  grow: {
    // 早餐店：送牛奶的島民走到店門口、揮鋤頭蓋 → 閃白店面與桌子 → LEVEL UP
    2(e, s, ctx) {
      const { B } = ctx, islander = once(c => c.roster.nearest('landmarks.islanders', CRATE)), front = offset(AT, -0.2, 0.15);
      return [
        // 裁決 R15 一級 ≤ 4.5 s：鋤頭 1.2 → 0.9、閃白的同時 ♥
        B.walk(islander, front), B.gesture(islander, 'build', 0.9, { at: offset(AT, -0.2, ROW) }),
        B.together([B.apply(e), B.bubble(islander, '♥', 0.8)]), B.levelUp('milk'), B.home(islander),
      ];
    },
    // 小學：校舍閃白，3 個小學生從校門外一起跑進操場（一個接一個出發）→ ♪ → 跳一下、LEVEL UP
    3(e, s, ctx) {
      const { B } = ctx;
      return [
        B.apply(e, { hold: ['milk.kids'] }),
        spawnKid(ctx), spawnKid(ctx), spawnKid(ctx),
        gather(ctx, PLAY, 0.45, i => ({ delay: i * 0.3 })),
        B.together(KIDS.map(i => B.bubble(kid(ctx, i), '♪', 0.6))),
        B.together([B.gesture(kid(ctx, 0), 'jump'), B.levelUp('milk')]), B.home(allKids),
      ];
    },
    // 長高、兩層：一起去牛奶箱喝奶、各 ♥ → 閃白變高 1.3、校舍加一棟兩層（大家轉頭看）→ 跑回操場（同時 LEVEL UP）
    4(e, s, ctx) {
      const { B } = ctx;
      return [
        gather(ctx, CRATE, 0.55),
        B.together(KIDS.map(i => B.bubble(kid(ctx, i), '♥', 1.0))),
        B.apply(e), B.together(KIDS.map(i => B.gesture(kid(ctx, i), 'look', { at: offset(AT, 0.75, ROW) }))),
        B.together([gather(ctx, PLAY, 0.45), B.levelUp('milk')]),
        B.home(allKids),
      ];
    },
    // 三層、升旗：一個小學生走到旗桿、！→ 旗子沿旗桿升上去（他抬頭看）→ 校舍閃白 → LEVEL UP
    5(e, s, ctx) {
      const { B } = ctx, k0 = kid(ctx, 0);
      return [
        B.walk(k0, offset(POLE, -0.2, 0.15)), B.bubble(k0, '！', 0.8),
        B.apply(e, { only: ['milk.flag', 'milk.yard'], blink: false }),
        B.together([B.scaleIn('milk.flag', { axis: 'y', dur: 1.2 }), B.gesture(k0, 'look', { at: POLE })]),
        B.apply(e), B.levelUp('milk'), B.home(k0),
      ];
    },
    // 鐘塔、少棒：鐘塔閃白、♪（鐘響，小孩抬頭看）→ 換上棒球帽跳起來 → LEVEL UP；有球場的話他們回日常時自己走去巨蛋旁練球
    6(e, s, ctx) {
      const { B } = ctx;
      return [
        B.apply(e, { only: ['milk.tower'] }),
        B.together([B.bubble(B.partHead('milk.tower', 2.2, ctx), '♪', 1.5), ...KIDS.map(i => B.gesture(kid(ctx, i), 'look', { at: offset(AT, 0.75, ROW) }))]),
        B.apply(e), B.together(KIDS.map(i => B.gesture(kid(ctx, i), 'jump'))),
        B.levelUp('milk'), B.home(allKids),
      ];
    },
    // ◆ 大學：小孩走到拱門校門的位置（少棒隊從巨蛋旁回來）→ 圖框「學士帽」→ 閃白：兩翼拉長、拱門、鐘塔移到中間、學士帽
    //   → 跳起來 → 回全景定格 → LEVEL UP
    7(e, s, ctx) {
      const { B } = ctx;
      return [
        gather(ctx, offset(ARCH, -0.1, 0.55), 0.4),
        B.bubble(kid(ctx, 0), { icon: 'mortar' }, 1.0),
        B.apply(e), B.together(KIDS.map(i => B.gesture(kid(ctx, i), 'jump'))),
        B.focus('home', { hold: 2.0 }), B.levelUp('milk'), B.home(allKids),
      ];
    },
    // 研究大樓：左翼閃白換成玻璃研究大樓、大家抬頭看、一個人 ！→ 一個走去校門的 YouBike 站（白袍、車站閃白）♪ → LEVEL UP
    8(e, s, ctx) {
      const { B } = ctx;
      return [
        B.apply(e, { only: ['milk.main'] }),
        B.together([...KIDS.map(i => B.gesture(kid(ctx, i), 'look', { at: LAB })), B.bubble(kid(ctx, 0), '！', 1.0)]),
        B.together([B.walk(kid(ctx, 1), offset(BIKES, -0.35, 0)), B.apply(e)]), B.bubble(kid(ctx, 1), '♪', 0.8),
        B.levelUp('milk'), B.home(allKids),
      ];
    },
    // 畢業典禮：小孩聚到操場中間 → 跳起來、學士帽從空中落下滿地 → 101 頭上打「恭喜畢業」→ 布條閃白 → LEVEL UP
    9(e, s, ctx) {
      const { B } = ctx;
      return [
        gather(ctx, PLAY, 0.35),
        B.apply(e, { only: ['milk.hats', 'milk.kids'], blink: false }),
        B.together([...KIDS.map(i => B.gesture(kid(ctx, i), 'jump')), B.move('milk.hats', { from: { dy: 1.0 }, to: { dy: 0 }, dur: 0.8 })]),
        B.together([B.focus('tower'), B.levelUp('tower', { text: '恭喜畢業' })]), B.focus(MILK),
        B.apply(e), B.levelUp('milk'), B.home(allKids),
      ];
    },
    // ◆ 鮮奶節：牛奶車閃白停在牛奶箱旁 → 小孩跑去、各 ♥ → 觀光船、全島的小孩出現（從各格的邊上走進來）、跳起來 → 回全景定格 → LEVEL UP
    10(e, s, ctx) {
      const { B } = ctx;
      return [
        B.apply(e, { only: ['milk.truck'] }),
        gather(ctx, offset(TRUCK, 0.8, 0.1), 0.3),
        B.together(KIDS.map(i => B.bubble(kid(ctx, i), '♥', 0.8))),
        B.apply(e), B.together(KIDS.map(i => B.gesture(kid(ctx, i), 'jump'))),
        B.focus('home', { hold: 2.5 }), B.levelUp('milk'), B.home(allKids),
      ];
    },
  },
  fx: () => null,   // 鮮奶自己沒有 onLevel
  rep: (s, ctx) => ctx.roster.members('milk.kids').find(m => !m.hidden) ?? null,   // 等待圖框的代表：藏起來的人（躲進門裡）不算
};
// ◆ 關鍵節點（裁決 R11）：跳級的第二級落在這兩級、或在倒數蒙太奇裡，也演完整劇本（turn.js）
script.grow[7].key = script.grow[10].key = true;
