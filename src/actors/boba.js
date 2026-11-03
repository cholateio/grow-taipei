// 珍奶（唯一正解 §4.4，max 6）：路邊攤車 → 人龍 3 人（攤車前一排）→ 珍奶店（Quaternius 兩層店面、Kenney 茶杯招牌、遮雨棚；人龍改排店門口）
//   → 噴泉廣場（噴泉在店的東側、離鏡頭那邊，不擋店）
//   → 外送無人機（店屋頂兩台起飛繞店一圈、觀光船多兩艘；一級劇本，不是 ◆）。修正批次 trim §A（使用者 2026-11-01「最後一輪動畫太多了，
//     刪減一下吧，我建議離島珍奶店全砍」）：原本這一級是 ◆ 離島（小森林島分店、燈塔島旗艦店、坐渡船的觀光客、棧橋、茶屋桌椅），全部拿掉
//   → ◆ 世界珍奶節（原本的 Lv7；全島海岸綁氣球、掛燈籠的船隊繞島（101 頭上的「世界珍奶節」標題字計畫 15 D 拿掉了）；2026-10-28 錄影修正：不用任何旗子（矩形旗面）；
//     MAX 主島的店也變：屋頂超大充氣珍奶杯、店門口氣球拱門、店到噴泉一串彩色三角旗——修正批次 max-skip §B，使用者 2026-11-01 要的三角旗串，不是旗面）。
// 人數預算（使用者 2026-10-26）：人龍最多 3 人（2026-10-28 錄影修正：4 → 3，珍奶格太擠）、不再有閒晃的觀光客。
// 老闆、觀光客是名冊（§8.7 的劇本讓同一批人走過來排隊）；颱風外送是颱風模組的劇本，不在這裡（老鼠撞翻攤車：唯一正解 §5.2 拿掉了）。
// 劇本（§6）：一級 ≤ 4.5 秒；◆ Lv6 ≤ 8 秒（最後回全景定格）。正解最後一輪珍奶 4 → 6 跳級：合成一段演 ◆6（turn.js jumpPairs）。
import { anchorWorld } from './anchors.js';
import { heldBy } from '../rules/engine.js';
import { C, offset } from './palette.js';
import { bunting } from './bunting.js';
import { stormy } from './world.js';
import { BLINK } from '../show/blink.js';
import { MAIN_CELLS, NEIGHBORS, axialToWorld, cellTop, WATER_Y, R } from '../scene/hex.js';
import { islanders } from '../show/crowd.js';

export const id = 'boba';
export const labelY = 1.0;
export const TEA = 0xc9a27c;
const SHIRTS = [C.coral, C.blue, 0xf2b5c6, 0x8db86f, C.yellow, C.white, C.navy, 0xe8b04a];

// ── 版面（捷運格東半邊）：北邊是燈泡的夜市（兩攤，南緣在錨點北邊 1.1）、西邊是捷運站與站前廣場、東邊是環島步道（計畫 16 前電工的主路，站位照舊）。
// 攤車／店在錨點北邊 0.05（SHOP）：2026-10-28 錄影修正——原本在錨點南邊 0.4，店和人龍貼著格子前緣、珍奶格看起來很擠；
// 夜市縮成兩攤之後往北挪 0.45，店北緣離夜市攤身 0.64，店前（南邊）留出空地。人龍在店前面（南邊）一排，人龍、老闆站位、立牌、噴泉都跟著 SHOP 走 ──
const AT = anchorWorld('boba');
const SHOP_DZ = -0.05;
export const SHOP = offset(AT, -0.1, SHOP_DZ);   // queue() 用同一個偏移
// 排隊（§13.3，計畫 3.8 Task 7）：橫排一列沿 x 往 −x（捷運站那側）排，所有人同一個 z——沿 z 排的話在畫面上會疊成一條黑色長條。
// 攤車時排在攤車前方（SHOP +z 0.6，排頭在攤車東緣）；珍奶店時改排店門口（SHOP +z 0.7，排頭在門前）。
// 間距 0.25 = 站著的人的分離距離（nav.SEPARATION），站定不會再被擠開。都面向攤車／店。
// 南邊格子收窄（離格邊 MARGIN 0.35 才走得到）：店北移之後店門口那排離格子南緣還有 0.45 的空地
const QUEUE_GAP = 0.25;
export function queue(at, n, shop = false) {
  const front = offset(at, -0.1, SHOP_DZ);   // 攤車／店（at 是錨點時就是 SHOP）
  return Array.from({ length: n }, (_, i) => {
    const p = offset(at, (shop ? 0 : 0.2) - QUEUE_GAP * i, SHOP_DZ + (shop ? 0.7 : 0.6));
    return { ...p, yaw: Math.atan2(front.x - p.x, front.z - p.z) };
  });
}
// 人龍最多 3 人一排（人數預算：使用者 2026-10-26 人龍太容易卡住 → 4；2026-10-28 錄影修正珍奶格太擠 → 3）
export const QUEUE_MAX = 3;
// 碼頭（觀光客的入口，§13.2）：珍奶格靠海的東北角、夜市北邊（夜市 footprint 外擴 PAD 之外）；四個點沿 −x 錯開 0.25（一人一個）
export const PIER = [0, 1, 2, 3].map(k => offset(AT, 0.35 - 0.25 * k, -1.7));

// 攤車（Lv1–2）：佔地 0.6 × 0.5；老闆從西邊推進來（PUSH_END）
const CART = { w: 0.6, d: 0.5 }, HANDLE = 0.45;
const PUSH_END = offset(SHOP, -HANDLE, 0);
// 珍奶店（Lv3 起）：Quaternius 兩層店面 2Story_Sign_Mat（原始 2.2 × 2.7 × 2.2），高 1.0 → 佔地 0.81 見方；招牌杯立在屋頂前緣
export const MODELS = {
  shop: { path: 'quat/buildings/2Story_Sign_Mat.glb', size: [2.2, 2.7, 2.2] },
  cup: { path: 'kenney/food/cup-tea.glb', size: [0.24, 0.2, 0.29] },
  drone: { path: 'kenney/space/craft_miner.glb', size: [1.8, 0.7, 2.6] },
};
const SHOP_H = 1.0, SHOP_W = MODELS.shop.size[0] * SHOP_H / MODELS.shop.size[1];
// 店面重上色票：牆奶油、磚與深色飾邊木色、招牌與木作珊瑚（和鮮奶的早餐店分得出來：早餐店磚邊沙色、牆奶油）
const SHOP_TINT = { '^DarkWood$': C.coral, '^DarkBrown$': C.wood, '^Dark$': C.wood, '^Bricks$': C.wood, '^Main$': C.cream, '^Light$': C.yellow, '^White$': C.white, '^Black$': C.ink, '^Glass$': C.glass };
// 珍奶店體：店面 glb（高 h）＋屋頂前緣的杯子招牌（高 cupH；離前緣 0.15 × h / SHOP_H）。回傳 [店, 杯子]，呼叫端再補 footprint、labelY。
// （以前兩座離島店也用它，修正批次 trim §A 全砍了）
// inset：杯子中心離屋頂前緣多遠（預設 0.15 × h / SHOP_H；MAX 的大杯子往後收，見 BIG_CUP）
export function storefront(at, h, cupH, inset = 0.15 * h / SHOP_H) {
  const w = MODELS.shop.size[0] * h / MODELS.shop.size[1];
  return [
    { kind: 'glb', at, path: MODELS.shop.path, h, tint: SHOP_TINT },
    { kind: 'glb', at: offset(at, 0, w / 2 - inset, h), path: MODELS.cup.path, h: cupH, footprint: false },
  ];
}
// MAX（Lv6，修正批次 max-skip §B；使用者 2026-11-01「棒球和珍奶店的 level max 不夠明顯」）：屋頂的杯子招牌變成超大充氣珍奶杯——
// 同一個 glb 只改高度（0.32 → 0.65，比店身 1.0 矮；不多 draw call）。杯子深 = 高 × 0.29 / 0.2，中心往後收到杯子前緣只凸出屋頂前緣 0.08（同小杯子的凸出量）
export const CUP_H = 0.32, BIG_CUP_H = 0.65;
const BIG_CUP_INSET = BIG_CUP_H * MODELS.cup.size[2] / MODELS.cup.size[1] / 2 - 0.08;
// 老闆日常站在攤車／店的東南角外（面向排頭）：攤車後面（北邊）離夜市太近；推車的位置會被 Lv3 的店面蓋住
// （跳級 1→3 沒有劇本，人在建築裡會穿牆走出來）；店東側和格邊之間那條縫走路格（0.3 一格）走不進去。
// 這一點在攤車、店、噴泉外擴 PAD 之外，南邊接著人龍那排，每一級都走得到（§14.1）
const BY_DOOR = offset(SHOP, 0.51, 0.56);
export const ownerSpot = n => { const q = queue(AT, 1, n >= 3)[0]; return { ...BY_DOOR, yaw: Math.atan2(q.x - BY_DOOR.x, q.z - BY_DOOR.z) }; };

// 噴泉（Lv4）：店的東側、往北（離鏡頭那邊）退 0.3——鏡頭在南邊往北看，噴泉不在店與鏡頭之間。
// 2026-10-28 錄影修正：店北移 0.45 之後這一段電工主路比較靠西（330°–30° 那一段是斜的），半徑 0.3 的噴泉東緣離主路只剩 0.02；
// 西邊是店、北邊是夜市與店之間的走道、往南會擋在店前面，沒地方挪——半徑縮成 0.25：西緣離店身 0.02、東緣離電工主路 0.124
// （≥ PAD 0.12，手畫的主路不切進外擴後的噴泉）、北緣離夜市第一攤 0.3
export const FOUNTAIN = offset(SHOP, 0.675, -0.3), FOUNTAIN_R = 0.25;

// 海面高度（船隊）
const SEA_Y = WATER_Y - 0.02;

// ── 外送無人機（Lv5）：Kenney Space Kit craft_miner，一台寬約 0.26；停在店屋頂兩側，每隔一陣子繞店飛一小圈（零件 kind 'orbit'，parts.js）──
const DRONE_TINT = { '^metalRed$': C.coral, '^metalDark$': C.curb, '^metal$': C.white, '^dark$': C.ink };
const DRONE_SIZE = 0.1;
export const DRONE_KEYS = ['boba.drones.0', 'boba.drones.1'];
function drone(i) {
  const park = offset(SHOP, (i ? 0.2 : -0.2), -0.15, SHOP_H + 0.02);
  return {
    kind: 'orbit', at: SHOP, r: 0.75 + 0.3 * i, h: 1.45 + 0.25 * i, phase: i * Math.PI, speed: 2.2, legs: [0.6, 0.6],
    from: park, park, path: MODELS.drone.path, size: DRONE_SIZE, ry: Math.PI, rest: 9 + 4 * i, tint: DRONE_TINT, footprint: false,
  };
}

// ── 世界珍奶節（Lv6）：主島外圍每一條靠海的格邊綁一束氣球（棒球格西南邊那條留給巨蛋捷運站的月台）；全部併在院子那個零件（不多花 draw call）。
// 2026-10-28 錄影修正：原本是海岸一圈旗竿＋旗面，旗子政治敏感，全部換成氣球——一條細繩（高 0.5）頂上三顆小球（半徑 0.07，錯開高度），沒有任何矩形旗面 ──
const BALLOON_R = 2.0;   // 離格心：走路格（離格邊 0.35）外、還在島面上
const SKIP_EDGE = '-1,1>-2,2';
export const BALLOON_SPOTS = MAIN_CELLS.flatMap(cell => NEIGHBORS.filter(([dq, dr]) => !MAIN_CELLS.some(c => c[0] === cell[0] + dq && c[1] === cell[1] + dr))
  .filter(([dq, dr]) => `${cell}>${cell[0] + dq},${cell[1] + dr}` !== SKIP_EDGE)
  .map(([dq, dr]) => {
    const c = axialToWorld(...cell), n = axialToWorld(cell[0] + dq, cell[1] + dr), d = Math.hypot(n.x - c.x, n.z - c.z);
    return { x: c.x + (n.x - c.x) / d * BALLOON_R, y: cellTop(cell), z: c.z + (n.z - c.z) / d * BALLOON_R };
  }));
// 一束氣球的三顆球 [dx, 高度, 顏色]：左右錯開 0.07、高低錯開，最高那顆在中間
const BALLOONS = [[-0.07, 0.5, C.coral], [0, 0.6, C.yellow], [0.07, 0.47, C.white]];
// 氣球的零件（相對 o）；coast：在海岸邊、珍奶格外（不出格的測試放行）
const balloonParts = o => BALLOON_SPOTS.flatMap(p => [
  { kind: 'cylinder', pos: [p.x - o.x, p.y - o.y + 0.25, p.z - o.z], scale: [0.012, 0.5, 0.012], color: C.cream, coast: true },
  ...BALLOONS.map(([dx, y, color]) => ({ kind: 'sphere', pos: [p.x - o.x + dx, p.y - o.y + y, p.z - o.z], scale: 0.14, color, coast: true })),
]);
// 船隊：五艘小船（船身、船艙、桅杆、桅杆頂一顆珊瑚色圓燈籠——不掛旗）排在半徑 FLEET_R 的圓上（衛星島外、海上觀光船內），整組繞島慢慢轉——一個零件
export const FLEET_R = 14.6, FLEET_N = 5;
const fleetParts = () => Array.from({ length: FLEET_N }, (_, i) => {
  const a = i / FLEET_N * Math.PI * 2, x = Math.cos(a) * FLEET_R, z = Math.sin(a) * FLEET_R, ry = Math.atan2(-Math.sin(a), Math.cos(a));   // 船頭朝切線（逆時針）
  const at = (u, v, y) => [x + Math.sin(ry) * u + Math.cos(ry) * v, y, z + Math.cos(ry) * u - Math.sin(ry) * v];
  return [
    { kind: 'rbox', pos: at(0, 0, 0.08), scale: [0.3, 0.14, 0.7], rot: [0, ry, 0], color: C.white },
    { kind: 'box', pos: at(-0.08, 0, 0.21), scale: [0.22, 0.14, 0.24], rot: [0, ry, 0], color: C.cream },
    { kind: 'cylinder', pos: at(0.12, 0, 0.4), scale: [0.025, 0.5, 0.025], color: C.wood },
    { kind: 'sphere', pos: at(0.12, 0, 0.62), scale: 0.14, color: C.coral },
  ];
}).flat();

// ── 攤車被吹走（修正批次 2：颱風放下時珍奶 ≤3；計畫 14 改成 ≤1（只有攤車），雨中放下的攤車也算；flags.cartBlown；珍奶鎖住不長）：攤車翻倒在珍奶格東岸外的淺水裡（格邊之外、
// 不在走路格、不算 footprint——不擋電工主路，Lv3 放晴的堤防在格面上、離格心 2.08，碰不到），老闆站到岸邊最東的可走點、面向海看著它。
// 翻倒照拿掉撞攤車之前的寫法：零件自己轉（攤車的零件都沒有 rot，整台繞 z 轉 TIP，頂朝外海）。被吹走的是攤車本身（boba.main）。
// （修正輪 1 裁決 3：≤1 之後 Lv3「店前那台攤車被吹走」（boba.blown）走不到，刪掉）
const CELL = axialToWorld(0, 1), APOTHEM = R * Math.sqrt(3) / 2;
export const BLOWN = { x: CELL.x + APOTHEM + 0.1, y: WATER_Y - 0.02, z: AT.z + 0.2 };   // 格邊外 0.1 的水面
export const CART_TIP = -1.2;   // 往海那邊倒（頂朝 +x）
const TIP = CART_TIP;
// 攤車（計畫 13 任務 2，使用者 2026-11-01「第一階段的珍奶店太醜請重新設計」）：夜市的珍奶攤車。相對 SHOP、原點在地面；
// 老闆在西邊（−x）推，鏡頭在南邊（+z）。車身尺寸不變（CART.w × 0.5 × 0.42：footprint、推車距離 HANDLE、老闆站位、立牌都不搬）——
// 計畫寫的 0.7 寬會讓車身西緣伸進推車老闆的身體，跟「車身尺寸不變」衝突，照 CART.w。
//   車身：奶油色箱體（離地 0.06）、下半一圈珊瑚裙板（高 0.18）、頂上一片木色檯面（四周凸出 0.03）；
//   遮雨棚：檯面上 0.3、往鏡頭那側斜的五條紅白直條（各 0.16 寬，合起來 0.8 × 0.5），後緣兩根木柱撐著，前緣垂三個小波浪（倒扣的半球）；
//   招牌：棚左上一支細桿頂著珍奶杯（杯蓋、斜插的吸管、杯身正面三顆珍珠）；輪子：後半（老闆那側）前後兩面各一個小輪（半徑 0.09）；
//   推桿：車身後面 0.2 高接出、接近水平伸到 (−0.42, 0.22)（老闆的手搭在上面）；檯面上兩杯小珍奶。全部不發光，合併成一個黏土 mesh
const CART_BODY = { h: 0.5, d: 0.42, y0: 0.06 }, COUNTER_Y = CART_BODY.y0 + CART_BODY.h + 0.02, CANOPY_Y = COUNTER_Y + 0.32, CANOPY_TILT = 0.22;
// 推桿（修正輪 1：原本從 0.30 斜上到 0.63、只偏垂直 20°，推車時豎在老闆臉前）：從車身後面 0.2 高接出、接近水平地伸到 (−0.42, 0.22)
const CUP_Y = CANOPY_Y + 0.42, BAR_FROM = [-CART.w / 2, 0.2], BAR_TO = [-0.42, 0.22];
const BAR_L = Math.hypot(BAR_TO[0] - BAR_FROM[0], BAR_TO[1] - BAR_FROM[1]), BAR_TILT = Math.atan2(BAR_FROM[0] - BAR_TO[0], BAR_TO[1] - BAR_FROM[1]);
const cartParts = () => [
  { kind: 'box', pos: [0, CART_BODY.y0 + CART_BODY.h / 2, 0], scale: [CART.w, CART_BODY.h, CART_BODY.d], color: C.wall },
  { kind: 'box', pos: [0, CART_BODY.y0 + 0.09, 0], scale: [CART.w + 0.01, 0.18, CART_BODY.d + 0.01], color: C.coral },
  { kind: 'box', pos: [0, COUNTER_Y, 0], scale: [CART.w + 0.06, 0.04, CART_BODY.d + 0.04], color: C.wood },
  ...[-0.28, 0.28].map(x => ({ kind: 'box', pos: [x, COUNTER_Y + 0.185, -0.19], scale: [0.03, 0.33, 0.03], color: C.wood })),
  ...[-2, -1, 0, 1, 2].map(i => ({ kind: 'box', pos: [i * 0.16, CANOPY_Y, 0], scale: [0.16, 0.03, 0.5], rot: [CANOPY_TILT, 0, 0], color: i % 2 ? C.white : C.coral })),
  ...[-1, 0, 1].map(i => ({ kind: 'dome', pos: [i * 0.25, CANOPY_Y - 0.25 * Math.sin(CANOPY_TILT) - 0.01, 0.25 * Math.cos(CANOPY_TILT)], scale: [0.22, 0.07, 0.04], rot: [Math.PI, 0, 0], color: i ? C.coral : C.white })),
  { kind: 'box', pos: [-0.24, CANOPY_Y + 0.17, -0.05], scale: [0.03, 0.3, 0.03], color: C.wood },
  { kind: 'cylinder', pos: [-0.24, CUP_Y, -0.05], scale: [0.14, 0.2, 0.14], color: TEA },
  { kind: 'dome', pos: [-0.24, CUP_Y + 0.1, -0.05], scale: [0.15, 0.08, 0.15], color: C.white },
  { kind: 'box', pos: [-0.22, CUP_Y + 0.18, -0.05], scale: [0.02, 0.14, 0.02], rot: [0, 0, -0.25], color: C.coral },
  ...[[-0.03, -0.07], [0.03, -0.07], [0, -0.03]].map(([x, y]) => ({ kind: 'sphere', pos: [-0.24 + x, CUP_Y + y, -0.05 + 0.065], scale: 0.04, color: C.ink })),
  ...[1, -1].map(s => ({ kind: 'torus', pos: [-0.14, 0.09, s * (CART_BODY.d / 2 + 0.015)], scale: 0.18, color: C.ink })),
  { kind: 'box', pos: [(BAR_FROM[0] + BAR_TO[0]) / 2, (BAR_FROM[1] + BAR_TO[1]) / 2, 0], scale: [0.03, BAR_L, 0.03], rot: [0, 0, BAR_TILT], color: C.wood },
  ...[0.1, 0.2].map(x => ({ kind: 'cylinder', pos: [x, COUNTER_Y + 0.06, 0.12], scale: [0.05, 0.08, 0.05], color: TEA })),
];
// 轉動（three.js Euler 'XYZ'：向量先轉 z、再 y、再 x）↔ 3×3 矩陣（列優先）；翻倒＝整台繞 z 轉 TIP：每個零件的矩陣左乘 Rz(TIP) 再拆回 Euler
const rotXYZ = ([x, y, z]) => {
  const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
  return [c * e, -c * f, d, a * f + b * e * d, a * e - b * f * d, -b * c, b * f - a * e * d, b * e + a * f * d, a * c];
};
const eulerXYZ = m => {
  const y = Math.asin(Math.max(-1, Math.min(1, m[2])));
  return Math.abs(m[2]) < 0.9999999 ? [Math.atan2(-m[5], m[8]), y, Math.atan2(-m[1], m[0])] : [Math.atan2(m[7], m[4]), y, 0];
};
const mul3 = (A, B) => [0, 1, 2].flatMap(r => [0, 1, 2].map(c => A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]));
const tipped = parts => parts.map(p => {
  const [x, y, z] = p.pos, c = Math.cos(TIP), sn = Math.sin(TIP);
  return { ...p, pos: [x * c - y * sn, x * sn + y * c, z], rot: eulerXYZ(mul3(rotXYZ([0, 0, TIP]), rotXYZ(p.rot ?? [0, 0, 0]))) };
});
const blownCart = () => ({ kind: 'compound', at: BLOWN, labelY: 1.0, footprint: false, parts: tipped(cartParts()) });
// 被老鼠咬（計畫 14 R30：老鼠 Lv1–2 時放下的珍奶，flags.bitten_boba；老鼠搭上捷運 Lv3 就恢復）：攤車正面（鏡頭那側）右半一個深色缺口、
// 車前地上兩顆掉出來的珍珠。併在攤車同一個 compound（黏土、不發光：同一個 mesh，不多 draw call）；老鼠咬的劇本在 rat.js（跑到 BITE_SPOT 聞一聞）
const BITE_PARTS = [
  { kind: 'box', pos: [0.16, CART_BODY.y0 + 0.3, CART_BODY.d / 2 + 0.004], scale: [0.13, 0.11, 0.012], color: C.ink },
  ...[[0.2, 0.34], [0.27, 0.3]].map(([x, z]) => ({ kind: 'sphere', pos: [x, 0.022, z], scale: 0.045, color: C.ink })),
];
// 老鼠咬攤車時站的地方（相對 SHOP：攤車前、缺口左下，珍珠在牠右手邊）
export const BITE_SPOT = offset(SHOP, -0.05, 0.5);
// 擋不擋照規則算（engine.heldBy：咬它的那個的 bite.while），不在這裡寫死老鼠級數（修正輪 1）
export const bitten = (lv, flags) => !!heldBy({ lv, flags }, 'boba');
// 老闆：岸邊（格邊往內 0.5：走路格離格邊 0.35、格點 0.3 一格，0.45 起才走得到）看著海裡的攤車；往南 0.35，不跟立牌（SHOP 東邊 0.50）疊在一起
const SHORE = { x: CELL.x + APOTHEM - 0.5, z: AT.z + 0.35 };
export const blownSpot = () => ({ ...SHORE, y: AT.y, yaw: Math.atan2(BLOWN.x - SHORE.x, BLOWN.z - SHORE.z) });

// 立牌的板子（相對 AT）：靠店（攤車）東牆外、老闆站位（BY_DOOR，sz + 0.56）北邊 0.41：原本在 sz + 0.62 跟老闆站位只差 0.12，錄影裡老闆和立牌疊在一起（2026-10-27）。
// 立牌擋人（修正批次 fix3 §A，使用者 2026-11-01「珍奶店升級時顧客會穿越招牌」：院子以前 footprint false，人龍從碼頭走來時直直穿過立牌）：
// footprint 只有立牌（0.16 × 0.08，蓋住 0.16 × 0.04 的板子和往後仰的那一截），磚地與遮雨棚照舊走得過去；外擴 PAD 後是 0.40 × 0.32 的框。
// 板子往西挪、改窄（SHOP 東邊 0.62、寬 0.2 → 0.50、寬 0.16；修正輪 1：0.47、寬 0.2 時 Lv3 起板子西端插進店牆 0.037）：
//   店東牆（SHOP 東邊 0.41）和格邊之間只有一排走路格點（SHOP 東邊 0.71），板子留在 0.62 的話外擴後的框蓋住那一排，
//   Lv3（店、還沒有噴泉）夜市第二攤（燈泡 ≥4）在北邊時，店東側北半截那兩個格點整個被關起來（老鼠在燈泡門口晃的家就落在那裡、進場點離家 0.4）。
//   0.50：板子西端 0.42 在牆外 0.01、框的東緣 0.70 在那排格點西邊 0.01，外擴後不關住任何格點。
// 人龍站位、老闆站位、被吹走時岸邊的站位、碼頭（≥ 1.6）、環島步道（舊電工主路）都在框外，站位不用搬；噴泉（Lv4，SHOP + (0.675, −0.3)、r 0.25）本身不碰外擴後的框
const BOARD = [SHOP.x - AT.x + 0.50, SHOP.z - AT.z + 0.15], BOARD_W = 0.16;
const SIGN_FOOTPRINT = [{ x: BOARD[0], z: BOARD[1], w: BOARD_W, d: 0.08 }];

// 遮雨棚、店前的磚地、立牌（Lv2 只有立牌：人龍排頭旁）。fresh（鮮奶 ≥4，跳級條件「鮮奶珍奶」）：立牌白底藍字，否則珊瑚底奶油字
function yardParts(n, fresh) {
  const sx = SHOP.x - AT.x, sz = SHOP.z - AT.z, board = BOARD;
  const sign = [
    { kind: 'box', pos: [board[0], 0.22, board[1]], scale: [BOARD_W, 0.28, 0.04], rot: [-0.2, 0, 0], color: fresh ? C.white : C.coral, sign: true },
    { kind: 'box', pos: [board[0], 0.24, board[1] + 0.03], scale: [0.11, 0.05, 0.01], rot: [-0.2, 0, 0], color: fresh ? C.blue : C.cream },
  ];
  if (n < 3) return sign;
  const front = sz + SHOP_W / 2;
  return [
    { kind: 'cylinder', pos: [sx, 0.012, front + 0.2], scale: [1.3, 0.024, 0.5], color: C.sand },   // 店前磚地（走得到）
    ...[-0.24, 0, 0.24].map((dx, i) => ({ kind: 'box', pos: [sx + dx, 0.5, front + 0.1], scale: [0.24, 0.03, 0.24], rot: [0.45, 0, 0], color: i % 2 ? C.white : C.coral })),   // 遮雨棚（紅白條）
    ...sign,
  ];
}
// MAX 的店門口（Lv6，修正批次 max-skip §B，相對 AT）：
//   氣球拱門：店牆前 0.05、跨在門前的半圓（半徑 0.3、圓心離地 0.13），兩腳各一顆落在門兩側、弧上 11 顆，珊瑚／黃／白輪流（直徑 0.09）。
//     頂（0.43）在遮雨棚底下（棚的前緣離地約 0.45）；人龍（店門口 0.7）、老闆站位都離拱門 ≥ 0.23——拱門是裝飾，沒有 footprint；
//   三角旗串：店東牆前緣上方（離地 0.88）拉到噴泉柱頂（0.62），六面（寬 0.12、垂 0.14）、繩子垂 0.06。兩樣都併進院子的 compound（黏土，不多 draw call）
const ARCH = { r: 0.3, y0: 0.13, ball: 0.09, colors: [C.coral, C.yellow, C.white] };
function maxYardParts() {
  const sx = SHOP.x - AT.x, sz = SHOP.z - AT.z, z = sz + SHOP_W / 2 + 0.05;
  const pts = [[sx - ARCH.r, ARCH.ball / 2], ...Array.from({ length: 11 }, (_, i) => { const a = Math.PI * (1 - i / 10); return [sx + Math.cos(a) * ARCH.r, ARCH.y0 + Math.sin(a) * ARCH.r]; }), [sx + ARCH.r, ARCH.ball / 2]];
  const arch = pts.map(([x, y], i) => ({ kind: 'sphere', pos: [x, y, z], scale: ARCH.ball, color: ARCH.colors[i % 3], arch: true }));
  const from = [sx + SHOP_W / 2 + 0.02, 0.88, sz + SHOP_W / 2 - 0.05], to = [FOUNTAIN.x - AT.x, 0.62, FOUNTAIN.z - AT.z];
  return [...arch, ...bunting(from, to, { n: 6, sag: 0.06, w: 0.12, h: 0.14 })];
}
// 噴泉：矮池子、水面、珍奶色的柱子與頂上三顆珍珠（不發光：整局截圖的 draw call ≤ 150）
const fountainParts = () => [
  { kind: 'cylinder', pos: [0, 0.06, 0], scale: [FOUNTAIN_R * 2, 0.12, FOUNTAIN_R * 2], color: C.curb },
  { kind: 'cylinder', pos: [0, 0.125, 0], scale: [FOUNTAIN_R * 1.7, 0.02, FOUNTAIN_R * 1.7], color: C.glass },
  { kind: 'cylinder', pos: [0, 0.32, 0], scale: [0.14, 0.4, 0.14], color: C.sand },
  ...[0, 1, 2].map(i => ({ kind: 'sphere', pos: [Math.cos(i * 2.1) * 0.05, 0.56 + (i === 0 ? 0.06 : 0), Math.sin(i * 2.1) * 0.05], scale: 0.08, color: C.ink })),
];

export function view(lv, flags = {}) {
  const n = lv.boba, v = {};
  if (!n) return v;
  const fresh = lv.milk >= 4, storm = stormy(lv), blown = !!flags.cartBlown;
  if (n < 3) {
    v['boba.main'] = blown ? blownCart() : { kind: 'compound', at: SHOP, footprint: { w: CART.w, d: CART.d }, parts: bitten(lv, flags) ? [...cartParts(), ...BITE_PARTS] : cartParts() };
  } else {
    const [shop, sign] = n >= 6 ? storefront(SHOP, SHOP_H, BIG_CUP_H, BIG_CUP_INSET) : storefront(SHOP, SHOP_H, CUP_H);
    v['boba.main'] = { ...shop, labelY: SHOP_H + (n >= 6 ? 0.85 : 0.55), footprint: { w: SHOP_W, d: SHOP_W } };   // 標籤在大杯子頂上
    v['boba.sign'] = sign;
  }
  // 世界珍奶節的氣球、MAX 的氣球拱門與三角旗併在院子這個零件裡（整局截圖的 draw call ≤ 150）
  // 只有立牌擋人（SIGN_FOOTPRINT）；院子不是會長的建築（grow false：有了 footprint 也照舊直接出現，Lv6 海岸的氣球不從珍奶格長出來）
  if (n >= 2) v['boba.yard'] = { kind: 'compound', at: AT, footprint: SIGN_FOOTPRINT, grow: false, parts: [...yardParts(n, fresh), ...(n >= 6 ? [...balloonParts(AT), ...maxYardParts()] : [])] };
  if (n >= 4) v['boba.fountain'] = { kind: 'compound', at: FOUNTAIN, footprint: { r: FOUNTAIN_R }, parts: fountainParts() };
  // 老闆日常：站著搖杯（每 3 秒揮一下手）；站位萬一落進別的 footprint，rescue 讓他站到最近的可走點
  // 入口：碼頭（推攤車那段是劇本從北邊放他出來；名冊自己補人時從碼頭走來）
  // 攤車被吹走：老闆走到岸邊、面向海看著翻在水裡的攤車（fidget look：偶爾瞥一下）
  v['boba.owner'] = { kind: 'roster', at: SHOP, n: 1, accessory: 'apron', home: { kind: 'stand', spots: [blown ? blownSpot() : ownerSpot(n)], fidget: blown ? 'look' : 'wave', rescue: true, entry: PIER[3] } };
  // 人龍：攤車前／店門口一排（人數預算 ≤ 3）；從碼頭走來
  if (n >= 2) v['boba.queue'] = { kind: 'roster', at: AT, n: QUEUE_MAX, accessory: 'suitcase', shirt: SHIRTS, home: { kind: 'stand', spots: queue(AT, QUEUE_MAX, n >= 3), rescue: true, entry: PIER } };
  // Lv5 外送無人機：店屋頂兩台（修正批次 trim §A：離島的分店、旗艦店、渡船、觀光客全砍，只剩主島這兩台）
  if (n >= 5) DRONE_KEYS.forEach((k, i) => { v[k] = drone(i); });
  if (n >= 6 && !storm) {
    v['boba.fleet'] = { kind: 'fleet', at: { x: 0, y: SEA_Y, z: 0 }, speed: 0.04, footprint: false, low: false, parts: fleetParts() };
  }
  return v;
}

export const builders = {
  // 船隊：一個 compound 整組繞島心慢慢轉（逆時針，同列車）
  fleet(THREE, spec, ctx) {
    const inner = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: spec.parts, shadow: false }), object = new THREE.Group();
    object.add(inner.object);
    return { object, update(dt, t) { inner.object.rotation.y = -t * spec.speed; }, dispose: inner.dispose };
  },
};

// ── 劇本（§8.7）──
// 角色都是演到那一拍才找（還沒出來就回 null，那拍跳過）；once 找到第一次就記住，整段劇本同一個人。
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };
const owner = c => c.roster.members('boba.owner')[0] ?? null;
const shown = key => c => c.roster.members(key).filter(m => !m.hidden);
const tourist = i => c => shown('boba.queue')(c)[i] ?? null;
// 糖分超標一起 ♥ 的人：主島上在日常裡的人（show/crowd.js islanders，同全島抬頭）——修正批次 max-skip §E 之後島民只剩 101 格一位、
// 代幣 Lv2 起一位都沒有，只點 landmarks.islanders 的話整段沒人冒泡泡。演到才點名、整段同一份名單
const sweetTooth = () => { let list = null; return i => c => (list ??= islanders(c).slice(0, ISLANDERS))[i] ?? null; };
const ISLANDERS = 10;   // 糖分超標時最多這麼多人一起 ♥
// 推攤車：老闆從攤位北邊約 3.65 的地方出發（捷運站那側的路口），尋路最後一段從夜市西邊轉進來，攤車停在 SHOP 剛好接上。
// 攤車在他面前 HANDLE 的地方；攤車朝向追著老闆的朝向轉（每秒 TURN 的比例），轉彎時不會瞬間甩到旁邊
const FROM = offset(AT, -1.0, -3.65), TURN = 12;
const start = c => { const p = c.nav.nearestWalkable(FROM); return { ...p, yaw: Math.atan2(PUSH_END.x - p.x, PUSH_END.z - p.z) }; };
const ahead = (p, yaw) => ({ x: p.x + Math.sin(yaw) * HANDLE, y: p.y, z: p.z + Math.cos(yaw) * HANDLE });
// 攤車在出發點（老闆面前）出現，停 BLINK 秒（計畫 11 §設計 1：攤車不是會長的建築，直接出現、不亮；拍長不變）
function cartIn() {
  let obj = null;
  return {
    kind: 'cartIn', dur: BLINK,
    start(c) {
      obj = c.stage.partObject('boba.main'); if (!obj) return false;
      const p = start(c), q = ahead(p, p.yaw); obj.position.set(q.x, p.y, q.z); obj.visible = true;
    },
    end() { if (obj) obj.visible = true; },
  };
}
// 每幀把攤車放在老闆面前；end 停在 SHOP（轉正）
function push(w) {
  let obj = null, yaw = 0;
  const dyaw = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return {
    kind: 'push', dur: () => w.dur(),
    start(c) { obj = c.stage.partObject('boba.main'); const m = owner(c); if (!obj || !m) return false; yaw = m.yaw; },
    step(k, dt, c) {
      const m = owner(c); if (!m) return;
      yaw += dyaw(yaw, m.yaw) * Math.min(1, dt * TURN);
      const q = ahead(m.pos, yaw); obj.position.set(q.x, m.pos.y, q.z); obj.rotation.y = 0;
    },
    end() { if (obj) { obj.position.set(SHOP.x, SHOP.y, SHOP.z); obj.rotation.z = 0; obj.visible = true; } },
  };
}
// 觀光客從碼頭出來（一人一個入口點；被擋就站到最近的可走點）
const pier = k => c => c.nav.nearestWalkable(PIER[k % PIER.length]);
// Lv2 人龍從碼頭出發的間隔（秒，計畫 11 最終修正 #2 裁決 ≥ 0.28：一人身寬 0.25 ÷ 0.9 m/s；名冊走路速度 1.6 時前後相距約 0.45 m）
export const QUEUE_DELAY = 0.28;
// 誰先出發（計畫 16）：人龍第 k 位從自己的碼頭點走到 spots[k]，出發順序照「走過去不會擦過已經站好的人」挑。碼頭到人龍的路看走路格——
//   夜市還在碼頭南邊時大家都從攤車西邊繞，照 0、1、2 走剛好；夜市搬去中心格（燈泡第一盞路燈旁）之後頭兩位改從東邊繞，
//   照 0、1、2 走的話第 1 位會從站好的第 0 位身上擦過去（0.28 × 兩人半徑）。每一種順序數一次擦過幾回（路線離先到的人站位 < PASS），
//   挑最少的；一樣少就照原本的 0、1、2
const PASS = 0.2;
const perms = a => (a.length < 2 ? [a] : a.flatMap((x, i) => perms(a.filter((_, j) => j !== i)).map(p => [x, ...p])));
const segDist = (a, b, p) => {
  const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2)) : 0;
  return Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z);
};
const brushes = (route, p) => route.some((q, i) => i > 0 && segDist(route[i - 1], q, p) < PASS);
// rank[k]：人龍第 k 位第幾個出發
function departRanks(c, spots) {
  const routes = spots.map((sp, k) => c.nav.route(pier(QUEUE_MAX - 1 - k)(c), sp));
  const cost = order => order.reduce((n, k, i) => n + order.slice(0, i).filter(j => brushes(routes[k], spots[j])).length, 0);
  const best = perms(spots.map((_, k) => k)).reduce((b, o) => (cost(o) < cost(b) ? o : b));
  return spots.map((_, k) => best.indexOf(k));
}

// Lv5 劇本看無人機飛幾秒再打 LEVEL UP（2.4 + LEVEL UP 1.0 ≈ 第一台繞完一圈，整段約 4 s；trim §A）
export const DRONE_WATCH = 2.4;
// 無人機起飛（不佔時間：繞一圈在背景飛完，一趟 legs 0.6 + 一圈 2π / 2.2 + 0.6 ≈ 4.1 s，第二台晚 0.4 s）
const launch = () => ({ kind: 'fly', dur: 0, start(c) { DRONE_KEYS.forEach((k, i) => c.stage.partObject(k)?.userData.fly?.({ delay: i * 0.4 })); return false; } });
export const script = {
  // 老闆從捷運站北邊推著攤車走過來（攤車每幀都在他面前）→ 停好 → ♪、繞到攤車東南角站好（他推車的位置下一級會蓋店面）
  placed(e, s, ctx) {
    const { B } = ctx, w = B.walk(owner, PUSH_END);
    return [
      B.apply(e, { only: ['boba.owner'], hold: ['boba.owner'] }), B.apply(e, { only: ['boba.main'], blink: false }),
      B.together([B.spawn('boba.owner', start), cartIn()]),
      B.together([w, push(w)]),
      B.apply(e), B.together([B.bubble(owner, '♪', 0.8), B.walk(owner, ownerSpot(1))]), B.home(owner),
    ];
  },
  grow: {
    // 人龍：3 個觀光客從碼頭一個接一個走過來，在攤車前排成一排 → LEVEL UP
    2(e, s, ctx) {
      // 先出發的站在碼頭西端（離開碼頭的路往西走）：後面的人還在原地等時，前面的人不從他身邊擦過去（計畫 11 最終修正 #2）
      const { B } = ctx, spots = queue(AT, QUEUE_MAX), sp = spots.map((_, k) => B.spawn('boba.queue', pier(QUEUE_MAX - 1 - k))), rank = once(c => departRanks(c, spots));
      return [
        B.apply(e, { hold: ['boba.queue'] }), ...sp,
        // 一個接一個出發，間隔 0.25 → 0.15（裁決 R15）→ 0.1（計畫 6 裁決 R2：拜訪之後第 6 回合 ≤ 60 s）→ QUEUE_DELAY（計畫 11 最終修正 #2：
        //   0.1 s 時三人從碼頭疊成一串走、相距 0.09 m 走了 2.2 s）
        //   出發順序看走路格（departRanks，計畫 16）
        B.together(sp.map((b, k) => B.walk(() => b.member, spots[k], { delay: c => rank(c)[k] * QUEUE_DELAY }))),
        B.home(shown('boba.queue')), B.levelUp('boba'),
      ];
    },
    // 珍奶店：老闆 …… → 揮鐵鎚 → 閃白店面、招牌杯、遮雨棚（攤車收掉）；人龍挪到店門口 → LEVEL UP
    3(e, s, ctx) {
      const { B } = ctx;
      return [B.bubble(owner, '……', 0.8), B.gesture(owner, 'build', 1.2, { at: SHOP }), B.apply(e), B.home(owner), B.home(shown('boba.queue')), B.levelUp('boba')];
    },
    // 噴泉廣場（晶片 ≥2）：老闆轉向店東側揮鐵鎚 → 閃白噴泉 → 排頭兩個觀光客 ♥ → LEVEL UP
    4(e, s, ctx) {
      const { B } = ctx;
      return [
        B.gesture(owner, 'build', 1.2, { at: FOUNTAIN }), B.apply(e),
        B.together([0, 1].map(i => B.bubble(tourist(i), '♥', 0.8))), B.home(owner), B.levelUp('boba'),
      ];
    },
    // 外送無人機（修正批次 trim §A：一級 3–4.5 s，不是 ◆；原本的 ◆ 離島劇本——鏡頭飛去小森林島、燈塔島、渡船——全砍）：
    //   鏡頭在珍奶格（turn.js 補的平移）→ 店屋頂兩台無人機閃白出現 → 起飛繞店一圈（背景飛，DRONE_WATCH 秒後第一台差不多繞完）→ LEVEL UP
    5(e, s, ctx) {
      const { B } = ctx;
      return [B.apply(e), B.together([launch(), B.wait(DRONE_WATCH)]), B.levelUp('boba')];
    },
    // ◆ 世界珍奶節（原本的 Lv7）：老闆 ！ → 回全景，全島海岸的氣球、繞島的船隊、店頂的大杯子、店門口的氣球拱門與旗串出現 →
    //   排隊的觀光客 ♥ → 全景定格 → LEVEL UP。計畫 15 D（使用者 2026-11-02「畫面上的字越少越好」）：101 頭上不再打「世界珍奶節」
    6(e, s, ctx) {
      const { B } = ctx;
      return [
        B.bubble(owner, '！', 0.8),
        // MAX 的大杯子（boba.sign）跟氣球、拱門、旗串同一拍出現（原本留到最後一拍；拍數不變）
        B.together([B.focus('home', { hold: 1.2 }), B.apply(e, { only: ['boba.yard', 'boba.sign', 'boba.fleet'] })]),
        // 全景定格 1.5 → 1.2（修正批次 trim §A：正解裡 4 → 6 合成這一段，前面多了平移到珍奶格、LEVEL UP 彈兩次，live 8.1 s 超過 ◆ 8 s）
        //   → 2.2（計畫 15 D：拿掉 101 頭上 1 秒的「世界珍奶節」，單獨演的整段剩 5.3 s < ◆ 6 s；加回 1.5 只到 5.6，2.2 → 單獨 6.3、正解合成 7.2）
        B.together([B.focus('home', { hold: 2.2 }), ...Array.from({ length: QUEUE_MAX }, (_, i) => B.bubble(tourist(i), '♥', 1.0))]),
        B.apply(e), B.levelUp('boba'),
      ];
    },
  },
  // 糖分超標（物品 v2：珍奶升到 Lv4 時鮮奶 ≤2，旗標事件緊接在 grow 4 後面）：折進旗標、主島上的人一起 ♥
  fx(e, s, ctx) {
    if (e.flag?.name !== 'bobaSugar') return null;
    const { B } = ctx;
    const who = sweetTooth();
    return [B.apply(e, { blink: false }), B.together(Array.from({ length: ISLANDERS }, (_, i) => B.bubble(who(i), '♥')))];
  },
};
// ◆ 關鍵節點（裁決 R11；唯一正解 §5.3）：珍奶 6。修正批次 trim §A：Lv5 不再是 ◆——正解最後一輪 4 → 5、5 → 6（跳級）合成一段，
// 演 ◆6 世界珍奶節（turn.js jumpPairs；以前兩級都是 ◆、不合成，各演一段 ◆）
script.grow[6].key = true;

// 拜訪點（計畫 6 設計 §4，同 5b 之前的趕工）：Lv1–4 攤車／店／噴泉廣場（錨點）；Lv5 外送無人機（修正批次 trim §A 回到主島，
// 以前離島 → null）、Lv6 珍奶節 → 主島的店。
// 計畫 14：有人龍（Lv2 起）時換到人龍尾巴西邊（錨點西 1.4，往鏡頭側 0.9）——錨點正面被 stage.troubleSpot 拉回格心 1.3 之內，
// 剛好落在人龍那一排上（正解第 8 回合珍奶 4 在等颱風放晴、老鼠守在這裡，在排隊的人中間鑽來鑽去）。Lv1 攤車沒有人龍，照舊在攤車前
export const QUEUE_SIDE = offset(AT, -1.4, 0);   // 修正輪 1：再往西 0.2（珍奶 3 被守那局量到老鼠擦過人龍尾巴）
export const visitSpot = n => (n === 1 ? { ...AT, r: 0.9 } : n >= 2 && n <= 6 ? { ...QUEUE_SIDE, r: 0.9 } : null);
