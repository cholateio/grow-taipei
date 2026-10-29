// 珍奶（物品 v2 §4.7，max 7）：路邊攤車 → 人龍 3 人（攤車前一排）→ 珍奶店（Quaternius 兩層店面、Kenney 茶杯招牌、遮雨棚；人龍改排店門口）
//   → 噴泉廣場（噴泉在店的東側、離鏡頭那邊，不擋店）→ 連鎖店（小森林島分店、觀光船多兩艘：satellites.js）
//   → ★ 離島旗艦店（燈塔島開店；兩個觀光客坐小船從碼頭過去、住在島上；外送無人機兩台繞著店飛）
//   → ◆ 世界珍奶節（全島海岸綁氣球、掛燈籠的船隊繞島、101 打「世界珍奶節」；2026-10-28 錄影修正：不用任何旗子）。
// 人數預算（使用者 2026-10-26）：人龍最多 3 人（2026-10-28 錄影修正：4 → 3，珍奶格太擠）、不再有閒晃的觀光客；燈塔島住 2 個觀光客。
// 老闆、觀光客是名冊（§8.7 的劇本讓同一批人走過來排隊）；老鼠撞翻攤車、颱風外送是那兩個模組的劇本，不在這裡。
// 劇本（§6）：一級 3–5 秒；◆ Lv7 6–10 秒、最後回全景定格。
import { anchorWorld } from './anchors.js';
import { C, offset } from './palette.js';
import { island } from './satellites.js';
import { BLINK } from '../show/blink.js';
import { MAIN_CELLS, NEIGHBORS, axialToWorld, cellTop, WATER_Y } from '../scene/hex.js';
import { measurePath, locateOnPath } from '../scene/path.js';

export const id = 'boba';
export const labelY = 1.0;
const TEA = 0xc9a27c, SHIRTS = [C.coral, C.blue, 0xf2b5c6, 0x8db86f, C.yellow, C.white, C.navy, 0xe8b04a];

// ── 版面（捷運格東半邊）：北邊是燈泡的夜市（兩攤，南緣在錨點北邊 1.1）、西邊是捷運站與站前廣場、東邊是電工主路。
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
  flagship: { path: 'quat/buildings/1Story_Sign_Mat.glb', size: [2.15, 1.79, 2.15] },
  cup: { path: 'kenney/food/cup-tea.glb', size: [0.24, 0.2, 0.29] },
  boat: { path: 'quat/ships/Boat.glb' },
  drone: { path: 'kenney/space/craft_miner.glb', size: [1.8, 0.7, 2.6] },
};
const SHOP_H = 1.0, SHOP_W = MODELS.shop.size[0] * SHOP_H / MODELS.shop.size[1];
// 店面重上色票：牆奶油、磚與深色飾邊木色、招牌與木作珊瑚（和鮮奶的早餐店分得出來：早餐店磚邊沙色、牆奶油）
const SHOP_TINT = { '^DarkWood$': C.coral, '^DarkBrown$': C.wood, '^Dark$': C.wood, '^Bricks$': C.wood, '^Main$': C.cream, '^Light$': C.yellow, '^White$': C.white, '^Black$': C.ink, '^Glass$': C.glass };
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

// ── 燈塔島（Lv6 旗艦店）：燈塔在島中心（底座半徑 0.5）、守塔人繞 0.6 一圈、東南有一棵樹；旗艦店在西南（朝主島、靠鏡頭那側）──
const LIGHT = island('lighthouse');
export const FLAGSHIP = offset(LIGHT, -1.15, 0.85);
const FLAGSHIP_H = 0.7;
// 兩個觀光客住在旗艦店門前（面向店）
export const TOURIST_SPOTS = [offset(LIGHT, -1.3, 1.5), offset(LIGHT, -0.95, 1.6)].map(p => ({ ...p, yaw: Math.atan2(FLAGSHIP.x - p.x, FLAGSHIP.z - p.z) }));
// 小船（裁決 R10：燈塔島沒有支線，觀光客坐船去）：從珍奶格東岸外的碼頭出發，經環狀線兩根橋墩之間（方位 0.42，橋墩在 0.13 和 0.65）
// 開到燈塔島西南岸外停好；水面高度，停好朝最後一段的方向
const SEA_Y = WATER_Y - 0.02;
export const FERRY_PATH = [offset(AT, 1.6, -0.15), { x: 7.6, z: 3.4 }, offset(LIGHT, -1.6, 2.0)].map(p => ({ x: p.x, y: SEA_Y, z: p.z }));
const FERRY_LENS = measurePath(FERRY_PATH, false), FERRY_LEN = FERRY_LENS.at(-1);
export const DOCK = FERRY_PATH.at(-1);
const DOCK_YAW = (() => { const [a, b] = FERRY_PATH.slice(-2); return Math.atan2(b.x - a.x, b.z - a.z); })();
export const SAIL = 2.4;   // 船開幾秒（R10：≤ 5 s）
export const FERRY_H = 0.3;
const BOAT_TINT = { '^DarkWood$': C.coral, '^Wood$': C.cream }, SEATS = [0.14, -0.14], SEAT_Y = 0.12;

// ── 外送無人機（Lv6）：Kenney Space Kit craft_miner，一台寬約 0.26；停在店屋頂兩側，每隔一陣子繞店飛一小圈（零件 kind 'orbit'，parts.js）──
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

// ── 世界珍奶節（Lv7）：主島外圍每一條靠海的格邊綁一束氣球（棒球格西南邊那條留給巨蛋捷運站的月台）；全部併在院子那個零件（不多花 draw call）。
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

// 遮雨棚、店前的磚地、立牌（Lv2 只有立牌：人龍排頭旁）。fresh（鮮奶 ≥4，跳級條件「鮮奶珍奶」）：立牌白底藍字，否則珊瑚底奶油字
function yardParts(n, fresh) {
  // 立牌靠店（攤車）東牆外、老闆站位（BY_DOOR，sz + 0.56）北邊 0.41：原本在 sz + 0.62 跟老闆站位只差 0.12，錄影裡老闆和立牌疊在一起（2026-10-27）；
  // 噴泉（Lv4，SHOP + (0.73, −0.3)、r 0.3）南緣在 sz + 0.0，立牌離噴泉心 0.46
  const sx = SHOP.x - AT.x, sz = SHOP.z - AT.z, board = [sx + 0.62, sz + 0.15];
  const sign = [
    { kind: 'box', pos: [board[0], 0.22, board[1]], scale: [0.2, 0.28, 0.04], rot: [-0.2, 0, 0], color: fresh ? C.white : C.coral, sign: true },
    { kind: 'box', pos: [board[0], 0.24, board[1] + 0.03], scale: [0.14, 0.05, 0.01], rot: [-0.2, 0, 0], color: fresh ? C.blue : C.cream },
  ];
  if (n < 3) return sign;
  const front = sz + SHOP_W / 2;
  return [
    { kind: 'cylinder', pos: [sx, 0.012, front + 0.2], scale: [1.3, 0.024, 0.5], color: C.sand },   // 店前磚地（走得到）
    ...[-0.24, 0, 0.24].map((dx, i) => ({ kind: 'box', pos: [sx + dx, 0.5, front + 0.1], scale: [0.24, 0.03, 0.24], rot: [0.45, 0, 0], color: i % 2 ? C.white : C.coral })),   // 遮雨棚（紅白條）
    ...sign,
  ];
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
  const fresh = lv.milk >= 4, storm = lv.typhoon === 2;
  if (n < 3) {
    v['boba.main'] = { kind: 'compound', at: SHOP, footprint: { w: CART.w, d: CART.d }, parts: [
      { kind: 'box', pos: [0, 0.35, 0], scale: [CART.w, 0.5, 0.4], color: C.wall },
      { kind: 'hip', pos: [0, 0.75, 0], scale: [0.75, 0.25, 0.55], color: C.coral },
      { kind: 'torus', pos: [-0.2, 0.1, 0.21], scale: 0.2, color: C.ink }, { kind: 'torus', pos: [0.2, 0.1, 0.21], scale: 0.2, color: C.ink },
      { kind: 'cylinder', pos: [0, 1.0, 0], scale: [0.2, 0.25, 0.2], color: TEA },
      { kind: 'sphere', pos: [0, 0.92, 0.1], scale: 0.05, color: C.ink },
    ] };
  } else {
    v['boba.main'] = { kind: 'glb', at: SHOP, path: MODELS.shop.path, h: SHOP_H, tint: SHOP_TINT, labelY: SHOP_H + 0.55, footprint: { w: SHOP_W, d: SHOP_W } };
    v['boba.sign'] = { kind: 'glb', at: offset(SHOP, 0, SHOP_W / 2 - 0.15, SHOP_H), path: MODELS.cup.path, h: 0.32, footprint: false };
  }
  // 世界珍奶節的氣球併在院子這個零件裡（整局截圖的 draw call ≤ 150）
  if (n >= 2) v['boba.yard'] = { kind: 'compound', at: AT, footprint: false, parts: [...yardParts(n, fresh), ...(n >= 7 ? balloonParts(AT) : [])] };
  if (n >= 4) v['boba.fountain'] = { kind: 'compound', at: FOUNTAIN, footprint: { r: FOUNTAIN_R }, parts: fountainParts() };
  // 老闆日常：站著搖杯（每 3 秒揮一下手）；站位萬一落進別的 footprint，rescue 讓他站到最近的可走點
  // 入口：碼頭（推攤車那段是劇本從北邊放他出來；名冊自己補人時從碼頭走來）
  v['boba.owner'] = { kind: 'roster', at: SHOP, n: 1, accessory: 'apron', home: { kind: 'stand', spots: [ownerSpot(n)], fidget: 'wave', rescue: true, entry: PIER[3] } };
  // 人龍：攤車前／店門口一排（人數預算 ≤ 3）；從碼頭走來
  if (n >= 2) v['boba.queue'] = { kind: 'roster', at: AT, n: QUEUE_MAX, accessory: 'suitcase', shirt: SHIRTS, home: { kind: 'stand', spots: queue(AT, QUEUE_MAX, n >= 3), rescue: true, entry: PIER } };
  if (n >= 6) {
    v['boba.flagship'] = { kind: 'glb', at: FLAGSHIP, path: MODELS.flagship.path, h: FLAGSHIP_H, tint: SHOP_TINT, footprint: false };
    v['boba.ferry'] = { kind: 'glb', at: DOCK, path: MODELS.boat.path, h: FERRY_H, ry: DOCK_YAW, tint: BOAT_TINT, footprint: false };
    // 坐船過去的兩個觀光客住在燈塔島上（衛星島沒有走路格：stand 的站位直線走回去，同 sat.forest）
    v['boba.tourists'] = { kind: 'roster', at: FLAGSHIP, n: 2, accessory: 'suitcase', shirt: SHIRTS.slice(4), home: { kind: 'stand', spots: TOURIST_SPOTS } };
    DRONE_KEYS.forEach((k, i) => { v[k] = drone(i); });
  }
  if (n >= 7 && !storm) {
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
const passenger = i => c => c.roster.members('boba.tourists')[i] ?? null;
const islander = i => c => c.roster.members('landmarks.islanders').filter(m => !m.hidden)[i] ?? null;
const FOREST = island('forest'), ISLANDERS = 10;   // 糖分超標時最多這麼多島民一起 ♥
const ISLAND_ZOOM = 0.8;
// 推攤車：老闆從攤位北邊約 3.65 的地方出發（捷運站那側的路口），尋路最後一段從夜市西邊轉進來，攤車停在 SHOP 剛好接上。
// 攤車在他面前 HANDLE 的地方；攤車朝向追著老闆的朝向轉（每秒 TURN 的比例），轉彎時不會瞬間甩到旁邊
const FROM = offset(AT, -1.0, -3.65), TURN = 12;
const start = c => { const p = c.nav.nearestWalkable(FROM); return { ...p, yaw: Math.atan2(PUSH_END.x - p.x, PUSH_END.z - p.z) }; };
const ahead = (p, yaw) => ({ x: p.x + Math.sin(yaw) * HANDLE, y: p.y, z: p.z + Math.cos(yaw) * HANDLE });
// 攤車在出發點（老闆面前）出現、閃白 BLINK 秒
function cartIn() {
  let obj = null;
  return {
    kind: 'cartIn', dur: BLINK,
    start(c) {
      obj = c.stage.partObject('boba.main'); if (!obj) return false;
      const p = start(c), q = ahead(p, p.yaw); obj.position.set(q.x, p.y, q.z); obj.visible = true;
      c.blink.part(obj);
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

// ── Lv6 小船：船身沿 FERRY_PATH 開 SAIL 秒（緩起緩停），坐在船上的兩個觀光客每幀擺在座位上；
// 一開始在碼頭閃白出現；end 停在 DOCK（船的零件本來就停在那裡，轉正）。跳過時直接停好、觀光客由後面的 jump 拍落地 ──
const ease = k => k * k * (3 - 2 * k);
const ferryAt = k => locateOnPath(FERRY_PATH, FERRY_LENS, FERRY_LEN * ease(Math.min(1, Math.max(0, k))), false);
// 船在 k（0–1）時第 i 個座位的位置（沿船身前後錯開）
export const seatAt = (k, i) => { const p = ferryAt(k); return { x: p.x + Math.sin(p.yaw) * SEATS[i], y: p.y + SEAT_Y, z: p.z + Math.cos(p.yaw) * SEATS[i], yaw: p.yaw }; };
function sail() {
  let obj = null;
  const put = (c, k) => {
    const p = ferryAt(k); obj.position.set(p.x, p.y, p.z); obj.rotation.y = p.yaw - DOCK_YAW;
    for (let i = 0; i < 2; i++) { const m = passenger(i)(c); if (m && m.mode === 'script') c.roster.setPose(m, { ...seatAt(k, i), walking: false }); }
  };
  return {
    kind: 'sail', dur: SAIL,
    start(c) { obj = c.stage.partObject('boba.ferry'); if (!obj) return false; put(c, 0); c.blink.part(obj); },
    step(k, dt, c) { put(c, k); },
    end(c) { if (!obj) return; put(c, 1); obj.position.set(DOCK.x, DOCK.y, DOCK.z); obj.rotation.y = 0; },
  };
}
// 無人機起飛（不佔時間：繞一圈在背景飛完）
const launch = () => ({ kind: 'fly', dur: 0, start(c) { DRONE_KEYS.forEach((k, i) => c.stage.partObject(k)?.userData.fly?.({ delay: i * 0.4 })); return false; } });
// 從離島回珍奶格再打 LEVEL UP（先飛回來、再彈字）：跟飛行一起彈的話，前半秒鏡頭還對著森林島，字在畫面外
// （Task 6a：EXAMPLE.deflect 最後一輪珍奶 5 的 LEVEL UP 16/30 幀在畫面外）。focus 拍不算劇本秒數
const levelUpAtShop = B => [B.focus('boba'), B.levelUp('boba')];

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
      const { B } = ctx, spots = queue(AT, QUEUE_MAX), sp = spots.map((_, k) => B.spawn('boba.queue', pier(k)));
      return [
        B.apply(e, { hold: ['boba.queue'] }), ...sp,
        B.together(sp.map((b, k) => B.walk(() => b.member, spots[k], { delay: k * 0.1 }))),   // 一個接一個出發，間隔 0.25 → 0.15（裁決 R15）→ 0.1（計畫 6 裁決 R2：拜訪之後第 6 回合 ≤ 60 s）
        B.home(shown('boba.queue')), B.levelUp('boba'),
      ];
    },
    // 珍奶店：老闆 …… → 揮鋤頭 → 閃白店面、招牌杯、遮雨棚（攤車收掉）；人龍挪到店門口 → LEVEL UP
    3(e, s, ctx) {
      const { B } = ctx;
      return [B.bubble(owner, '……', 0.8), B.gesture(owner, 'build', 1.2, { at: SHOP }), B.apply(e), B.home(owner), B.home(shown('boba.queue')), B.levelUp('boba')];
    },
    // 噴泉廣場（晶片 ≥2）：老闆轉向店東側揮鋤頭 → 閃白噴泉 → 排頭兩個觀光客 ♥ → LEVEL UP
    4(e, s, ctx) {
      const { B } = ctx;
      return [
        B.gesture(owner, 'build', 1.2, { at: FOUNTAIN }), B.apply(e),
        B.together([0, 1].map(i => B.bubble(tourist(i), '♥', 0.8))), B.home(owner), B.levelUp('boba'),
      ];
    },
    // 分店：老闆 …… → 圖框「小島」→ 鏡頭到小森林島（focus，zoom 0.8）→ 閃白分店、觀光客 2 人 → 觀光船多 2 艘 →
    // 鏡頭跟 LEVEL UP 一起回珍奶格（levelUp 1 秒 ≥ focus 拍，不多佔時間）
    5(e, s, ctx) {
      const { B } = ctx;
      return [
        B.bubble(owner, '……', 0.9), B.bubble(owner, { icon: 'islet' }, 1.0), B.focus(FOREST, { zoom: ISLAND_ZOOM }),
        B.apply(e, { only: ['sat.forest.stage1', 'sat.forest'] }), B.apply(e), ...levelUpAtShop(B),   // 分店與茶屋桌椅（離島三段第一段 sat.forest.stage1，分店是基座）一起閃
      ];
    },
    // ★ 旗艦店：鏡頭到燈塔島（zoom 0.8）→ 小船載著兩個觀光客在珍奶格東岸外閃白出現、開到燈塔島（SAIL 秒）→ 兩人跳上岸 →
    //   閃白旗艦店、店屋頂兩台外送無人機 → 鏡頭跟 LEVEL UP 一起回珍奶格，無人機同時起飛繞店一圈
    6(e, s, ctx) {
      const { B } = ctx, sp = [0, 1].map(i => B.spawn('boba.tourists', () => seatAt(0, i)));
      const hop = B.together([0, 1].map(i => B.jump(passenger(i), () => TOURIST_SPOTS[i], 0.5)));
      return [
        B.focus(LIGHT, { zoom: ISLAND_ZOOM }),
        B.apply(e, { only: ['boba.ferry', 'boba.tourists'], hold: ['boba.tourists'], blink: false }), ...sp,
        B.together([sail(), B.apply(e, { only: ['sat.lighthouse.stage2'] })]), hop, B.home([passenger(0), passenger(1)]),   // 棧橋（離島三段）在小船開過去時閃白
        B.apply(e), B.together([B.focus('boba'), launch(), B.levelUp('boba')]),
      ];
    },
    // ◆ 世界珍奶節（燈泡 ≥5）：老闆 ！ → 回全景，全島海岸的氣球、繞島的船隊閃白出現 → 101 頭上打「世界珍奶節」→
    //   排隊的觀光客 ♥ → 全景定格 → LEVEL UP
    7(e, s, ctx) {
      const { B } = ctx;
      return [
        B.bubble(owner, '！', 0.8),
        B.together([B.focus('home', { hold: 1.2 }), B.apply(e, { only: ['boba.yard', 'boba.fleet'] })]),
        B.levelUp('tower', { text: '世界珍奶節' }),   // 鏡頭停在全景時打字（全景裝得下 101 頭頂，§14.4；拉近 101 格會切掉頭頂）
        B.together([B.focus('home', { hold: 1.5 }), ...Array.from({ length: QUEUE_MAX }, (_, i) => B.bubble(tourist(i), '♥', 1.0))]),
        B.apply(e), B.levelUp('boba'),
      ];
    },
  },
  // 糖分超標（物品 v2：珍奶升到 Lv4 時鮮奶 ≤2，旗標事件緊接在 grow 4 後面）：折進旗標、島民一起 ♥
  fx(e, s, ctx) {
    if (e.flag?.name !== 'bobaSugar') return null;
    const { B } = ctx;
    return [B.apply(e, { blink: false }), B.together(Array.from({ length: ISLANDERS }, (_, i) => B.bubble(islander(i), '♥')))];
  },
  rep: (s, ctx) => ctx.roster.members('boba.owner').find(m => !m.hidden) ?? null,   // 代表（拜訪、撲空找的人）：藏起來的人（躲進門裡）不算
  hasRep: lv => lv >= 1,   // 這一級有沒有代表（turn.js 排撲空的位子用，最終審稿 3）：每一級都有老闆
};
// ◆ 關鍵節點（裁決 R11）：跳級的第二級落在這一級，也演完整劇本（turn.js）
script.grow[7].key = true;

// 拜訪點（計畫 6 設計 §4，同 5b 之前的趕工）：Lv1–4 攤車／店／噴泉廣場（錨點）；Lv5 森林島分店、Lv6 燈塔島旗艦店在離島 → null；
// Lv7 珍奶節 → 主島的店
export const visitSpot = n => ((n >= 1 && n <= 4) || n === 7 ? { ...AT, r: 0.9 } : null);
