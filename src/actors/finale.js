// 最終章（計畫 5，設計 §3、§9；選擇帶動升級 2026-10-28 §4 改版）：隕石警告、隕石、真結局尾聲——都不是物品，是遊戲層合成的事件。
// 修正批次 trim §C（2026-11-01，協調者裁決）：原本是「海的那一頭亮紅光、射一枚飛彈打 101」，容易被讀成兩岸軍事威脅（政治風險），
// 換成天外隕石——從天上掉下來、沒有方向、沒有國家；三種結果的意思不變。程式識別字沿用 missile（事件、旗標、零件 finale.missile），畫面上看得到的全換掉。
// 遊戲層（game.js）在第 8 個放完、最後一輪（一般回合）演完之後演一個終局回合：最前面 warning 事件（game.js WARNING，flag alarm = 1），
// 接 missile 事件（flag missile = shield／deflect／hit），真結局與有收尾的壞結局（BAD_EPILOGUES，計畫 17）再接 epilogue（flag epilogue = 結局 id）。
// 旗標只折進舞台（stage.flags，foldEvent 照 e.flag 折），引擎狀態不碰。turn.js 把這三種事件的劇本交給這個模組（script[e.kind]）。
// 警告（選擇帶動升級 §4；原本倒數 3 的宣告去掉數字）——終局回合一開頭，101 正上方偏北的高空亮起一顆越來越亮的橘紅光點（finale.star，
// 發光球＋往外拖長的淡光尾）；鏡頭先抬頭看天（全景只框到 101 頭頂上一點、天空整片出畫），再退到 WIDE（島＋101＋上方天空），全島抬頭看、冒「！」、蹲下；
// 光點以固定 FLARE_HZ 脈動，隕石落下時熄掉（flags.missile 一設就不畫）。
// 任務 5：隕石（設計 §6）——光點熄掉、隕石從光點的位置由上往下斜斜落向 101（零件自己演：userData.launch；鏡頭在 WIDE），三種結果：
//   shield 罩子全亮、隕石撞上罩子碎成一發煙火、全島跳＋♥；deflect 落到 101 旁被風吹偏、邊滾邊掉進北投溫泉、水花、全島？再♪；
//   hit 砸進 101 中段、101 彎成 L（tower.js body bent，一瞬間折下去、不重長）、隕石掉到底座西邊的地上（METEOR_REST）、全島躺平比讚（worldEffects mood 'lie'）。
// 任務 6：賽博尾聲（設計 §7）——天黑、霓虹（燈泡 Lv9 早就開到 NEON_BOOST）→ 101 閃白換成黑塔＋頂端螢幕（tower.js）→ 第四台飛天車（紅色，finale.car，orbit 零件）
//   從海上飛進來繞 101 一圈、停上黑塔屋頂；機器鼠軍團閃白出現在屋頂排一排（rat.js ROOF_SPOTS）→ 全景停 1.5 秒。
// 任務 7：外星尾聲（設計 §7）——鏡頭對溫泉格，變異鼠王對天揮手＋「！」→ 鏡頭推到石堆島（裁決 R5：石堆島在全景畫面外，
//   16:9 島心 NDC (0.91, −1.08)、直式整座出畫）：綠光圈閃白變降落場（satellites.js）→
//   三台 UFO（finale.ufos，一個 compound 三個碟）從天上降到降落場 2 秒 → 三個外星生物（finale.aliens）閃白出現在 UFO 和主島之間 →
//   回全景 → 101 閃白變母艦（tower.js ship）→ 全島小人長出第三隻眼（worldEffects mood 'alien'）→ 變異鼠王閃白坐上碟頂（rat.js SHIP_SPOT）＋「♥」→ 全景停 1.5 秒。
//   唯一正解（2026-10-31 §4.5）：外星改成壞結局「變異鼠稱王」（畫面就是老鼠 Lv4 外星型態＋石堆島綠光圈＋小 UFO）；
//   計畫 17 任務 4（2026-11-04）：壞結局也演收尾——改成災難版（alienEpilogue）：前面加鼠群變異（SWARM_N 隻變異鼠 rat.swarm 從園區門口衝向 101、
//   全島小人躲進建築），UFO 降落 1 秒，母艦一換鼠群和鼠王一起閃白站上碟緣／碟頂，最後走出來才長第三隻眼；整段 ≤ 5.5 s、全景停 ALIEN_END 1.0 秒。
// 計畫 17 任務 3：大停電（漆黑、只剩 101 塔尖的警示燈 finale.beacon 從慢閃變快閃）與捷運淹水（捷運格淹水、小船載兩個泳客划到東南岸、
//   珍奶老闆跳上攤車頂）的收尾，見 blackoutEpilogue、floodEpilogue。
// 計畫 17 任務 5：大巨蛋淹水（球員拉竿、一條魚從泳池跳出來）、珍奶攤被吹走（老闆坐小船追漂走的攤車）、鮮奶過期（長腳的牛奶箱走到西岸掉進海裡）的收尾，
//   見 domeFloodEpilogue、cartBlownEpilogue、milkExpiredEpilogue。
// R47（使用者 2026-11-06：我理想中的鼠災是整島都是老鼠）：大巨蛋鼠災也接收尾——鼠群從巨蛋門口撒滿全島、大家躲進門，見 domeRatsEpilogue。
import { lookUp, crowd, islanders } from '../show/crowd.js';
import { anchorWorld, landmarkWorld } from './anchors.js';
import { SHIELD_R, stageOfView, body as towerBody, bendPoint } from './tower.js';
import { ROOF_SPOTS, SHIP_SPOT, SAUCER_SPOTS, SWARM_ENTRIES, SWARM_N, UFO_PARTS, DASH, GATE } from './rat.js';
import { island, ROCKS_HOME_A as HOME_A } from './satellites.js';
import { BLINK } from '../show/blink.js';
import { TIMES } from '../scene/daynight.js';
import { NEON_BOOST } from './world.js';
import { C, offset } from './palette.js';
import { roadsterParts, BOAT_FROM, BOAT_TO, boatSeat, SHEET_DROP } from './token.js';
import { floodPerch, BOAT_START as SKIFF_FROM, BOAT_END as SKIFF_TO, boatSeat as skiffSeat, BLOWN, CART_END, QUAY } from './boba.js';
import { fishArc, FISH_UP } from './baseball.js';
import { CRATE, CRATE_BRINK, CRATE_SEA } from './milk.js';
import { WATER_Y, cellAt } from '../scene/hex.js';
import { FOCUS_BEAT } from '../show/beats.js';
import { toDoor } from './typhoon.js';
import { BATHERS_OUT } from './landmarks.js';
// 有收尾的壞結局（計畫 17）：清單定義在規則層（game.js finaleEvents 只讀規則層），這裡原樣再匯出給劇本與測試
export { BAD_EPILOGUES } from '../rules/endings.js';

export const id = 'finale';

const TOWER = anchorWorld('tower'), SPRING = landmarkWorld('spring');
// 警告：全島抬頭看光點 1.2 秒、頭上「！」0.8 秒、再一起蹲下護頭 DUCK 秒（真實秒數；終局回合 1 倍速）
export const LOOK = 1.2, SHOUT = 0.8, DUCK = 0.8;   // DUCK 1.0 → 0.8（修正輪 1：吹歪的終局只剩 0.7 s）

// 天上的光點（trim §C，取代海平面的紅光柱 finale.flare）：101 正上方偏北 3.7、高 14。全景（16:9）只框到 101 頭頂上一點、天空整片出畫，
// 所以警告先抬頭：鏡頭對 101 頭頂與光點的中點（SKY_ZOOM），停 SKY_HOLD，再退到 WIDE。
// 發光球（半徑 STAR_R）＋一條從球往外（離開 101 那頭）拖 STAR_TAIL 長的淡光尾；建好後 STAR_RAMP 秒內越來越亮，之後照 FLARE_HZ 脈動
export const STAR_AT = { x: TOWER.x, y: 14, z: TOWER.z - 3.7 };
export const STAR_COLOR = 0xff5020, STAR_R = 0.4, STAR_TAIL = 3.2, STAR_RAMP = 2.0;
// 脈動頻率（選擇帶動升級 §4：固定 2 Hz；以前倒數 3／2／1 越閃越快）
export const FLARE_HZ = 2;
export const SKY_ZOOM = 1.3, SKY_HOLD = 0.4;
// WIDE：隕石落下時的鏡頭（注視點在島心上方 5、全景距離 × 1.5）——16:9 主島四角都在畫面裡、光點到罩面那段落下的路線約八成在畫面裡（直式整條）
export const WIDE = { x: 0.3, y: 5, z: -1 }, WIDE_ZOOM = 1.5;
// 101 頂上的警示燈（計畫 13 §設計 5，使用者 2026-11-01「飛彈發射過來前的警告請優化呈現方式」）：塔尖上 BEACON_UP 一顆紅球（半徑 BEACON_R）
// ＋一道從球心往外 BEAM_L 長的扁平紅光束，繞 y 軸每秒 BEACON_REV 圈；亮度跟光點同一個 FLARE_HZ 脈動。
// 計畫寫「headOf('tower') 之上 0.15」：headOf 是泡泡的位置、比塔尖高 0.6（LABEL_UP），燈會飄在半空——改放塔尖（這一階段塔身的 top）之上 0.15
export const BEACON_UP = 0.15, BEACON_R = 0.12, BEAM_L = 3, BEACON_REV = 1;
const BEACON_RED = C.red;

// ── 隕石（設計 §6；trim §C 取代飛彈）──
// 真實秒數：落下 FLIGHT 秒；deflect 的第二段（被風吹偏、邊滾邊掉進溫泉）DEFLECT 秒；結果演完回全景停 HOLD_END 秒
export const FLIGHT = 2.5, DEFLECT = 1.2, HOLD_END = 1.0;
// 岩石：三顆 ico 低多邊形（一顆壓扁轉過的大石＋兩個凸起的小塊）併成一個黏土 mesh，深灰褐；主石半徑 ROCK_R（沿 +z 是前進方向）。
// 外殼：半徑 ROCK_R × 1.15 的半透明發光橘色 ico；拖尾：TRAIL 四顆發光球沿 −z（來向）排開，越後面越小、越淡
export const ROCK_R = 0.32, ROCK_COLOR = 0x5a4a42, SHELL_COLOR = 0xff7a3a, SHELL_OPACITY = 0.55;
export const ROCK_PARTS = [
  { kind: 'ico', pos: [0, 0, 0], scale: [ROCK_R * 2, ROCK_R * 1.76, ROCK_R * 1.9], rot: [0.4, 0.7, 0.2], color: ROCK_COLOR },
  { kind: 'ico', pos: [0.17, 0.12, -0.05], scale: 0.3, rot: [0.9, 0.2, 0], color: ROCK_COLOR },
  { kind: 'ico', pos: [-0.14, -0.1, 0.08], scale: 0.26, rot: [0.3, 1.1, 0.5], color: ROCK_COLOR },
];
// [往後多遠, 半徑, 不透明度]
const TRAIL = [[0.55, 0.26, 0.5], [0.95, 0.2, 0.36], [1.3, 0.14, 0.24], [1.6, 0.09, 0.14]];
// 落下時沿前進方向滾一圈（2π 的整數倍：落地的終態不用轉回來）
const TUMBLE = 2 * Math.PI;
// 矽盾罩面上的撞點：101 底座中心往光點那條線、罩子半徑處（從天上直直落下，撞在罩頂偏北）
const toStar = (() => { const dx = STAR_AT.x - TOWER.x, dy = STAR_AT.y - TOWER.y, dz = STAR_AT.z - TOWER.z, L = Math.hypot(dx, dy, dz), H = Math.hypot(dx, dz); return { x: dx / L, y: dy / L, z: dz / L, hx: dx / H, hz: dz / H }; })();
const DOME_HIT = { x: TOWER.x + toStar.x * SHIELD_R, y: TOWER.y + toStar.y * SHIELD_R, z: TOWER.z + toStar.z * SHIELD_R };
// 溫泉池中心、池面上 0.1（池水 cylinder 頂在 landmark 上 0.13）
const POOL = { x: SPRING.x, y: SPRING.y + 0.1, z: SPRING.z };
// deflect 被吹偏的點：101 塔頂旁、朝光點那側（水平）1.5
const SIDESTEP = 1.5;
// 命中：岩石卡在塔面（方錐台半寬 0.58）外；吹偏：斜 TILT 掉進池裡、前緣在池面下 BURY_POOL（大半露在水面上）
const TOWER_HALF = 0.58, BURY_POOL = 0.2, TILT = 30 * Math.PI / 180;
// 命中之後（2026-11-05 使用者「隕石位置怪怪的」：以前一直卡在塔的西面、浮在半空）：撞上那一刻在塔面停 HIT_HANG 秒（塔在這時折下去），
// 再 HIT_DROP 秒照重力掉到 101 底座（1.6 見方）西緣外的地上、半埋著（中心比地面高 0.45 個半徑），往鏡頭那側 0.2——METEOR_REST（世界座標，不看階段）。
// 掉下去是零件自己演（劇本的 replay 拍只等 FLIGHT 秒，後面的拍照常走、終局秒數不變）
export const HIT_HANG = 0.2, HIT_DROP = 0.5;
export const METEOR_REST = { x: TOWER.x - (0.8 + ROCK_R * 0.6), y: TOWER.y + ROCK_R * 0.45, z: TOWER.z + 0.2 };
// 煙火：霓虹粉、霓虹藍、黃、珊瑚
const FIREWORKS = [C.neonPink, C.neonBlue, C.yellow, C.coral];

// ── 賽博尾聲（設計 §7）──
// 紅色飛天跑車：代幣 Lv10 那台 Tesla Roadster 的同一個模型（token.js roadsterParts，車身 C.red；parts.js orbit；?quality=low 不畫，裁決照舊）。
// 從鏡頭右前方的海上（CAR_FROM）飛進來，在 101 頂上（點燈的塔頂 + 0.6）半徑 1.4 繞一圈，進出圈都在鏡頭那側（phase π/2，+z），
// 停到黑塔屋頂前緣正中（CAR_PARK_Z；後面是一排機器鼠）；沒有 rest：停好就不再起飛（標題卡前畫面要定住）。
// 車長 0.54：停好時車頭朝 −x（park.yaw −π/2，就是離圈那一刻的切線方向，下降時不用轉）、側身對鏡頭——順著 z 停的話車尾會伸出屋頂前緣；
// 落地同代幣那三台：落地前噴氣、四輪著地壓一下回彈（squash）
const CAR_FROM = { x: 10, y: 3.5, z: 9 }, CAR_ORBIT = { r: 1.4, speed: 2.5, legs: [1.2, 0.8] }, CAR_PARK_Z = 0.58;
export const CAR_FLIGHT = CAR_ORBIT.legs[0] + 2 * Math.PI / CAR_ORBIT.speed + CAR_ORBIT.legs[1];   // 一趟幾秒（≈ 4.5）
const carSpec = () => ({
  kind: 'orbit', model: { parts: roadsterParts(C.red) }, squash: 0.03,
  at: TOWER, h: towerBody('lit').top + 0.6, phase: Math.PI / 2, ...CAR_ORBIT, from: CAR_FROM,
  park: { x: TOWER.x, y: TOWER.y + towerBody('lit', { dark: true }).roof, z: TOWER.z + CAR_PARK_Z, yaw: -Math.PI / 2 }, footprint: false,
});
// 跑馬燈「飛天跑車今日抵台…」2026-11-03 拿掉了（使用者：小字越少越好）；最後全景停 END_HOLD 秒
const END_HOLD = 1.5;

// ── 外星尾聲（設計 §7、§8）──
// 三台 UFO：老鼠 Lv5 小 UFO 的零件（rat.js UFO_PARTS）放大 2 倍（碟半徑 1.0），碟心在石堆島中心外 UFO_R、等分三個方位；
// 朝主島那個方位（HOME_A）留空給外星生物，碟心在 HOME_A ± π/3 與對面。UFO_R 1.2：三個碟心彼此 2.08（碟寬 2.0，不重疊）。
// 石堆的四顆石頭擠在島心 0.7 以內、最高 0.56：碟懸停在島面上 UFO_Y，底光（碟心下 0.24）離最高的石頭還有 0.05（設計寫「降到降落場」，
// 0.35 會讓石頭穿過碟身）。三個碟是一個 compound：手機畫質（quality low）發光併進黏土，一個 mesh
export const UFO_N = 3, UFO_R = 1.2, UFO_Y = 0.85, UFO_DROP = 7, UFO_FALL = 1.0;   // 降落 2.0 → 1.0 s（計畫 17 任務 4：收尾 ≤ 5.5 s）
const ROCKS = island('rocks');   // HOME_A：石堆島朝主島中心的方位（satellites.js ROCKS_HOME_A，降落場的燈也從它起算）
const big = p => ({ ...p, pos: p.pos.map(x => x * 2), scale: p.scale.map(x => x * 2) });
export const UFO_PARTS_BIG = UFO_PARTS.map(big);
const ufoParts = () => Array.from({ length: UFO_N }, (_, i) => {
  const a = HOME_A + Math.PI / 3 + i * 2 * Math.PI / UFO_N, cx = Math.cos(a) * UFO_R, cz = Math.sin(a) * UFO_R;
  return UFO_PARTS_BIG.map(p => ({ ...p, pos: [p.pos[0] + cx, p.pos[1] + UFO_Y, p.pos[2] + cz] }));
}).flat();
// 外星生物：三個並排（間距 ALIEN_GAP）站在島上朝主島那側、離島心 ALIEN_R（兩台碟之間的空檔），面向主島；離地漂浮、一起上下晃 ±BOB。
// 一個生物：綠色發光的圓柱身（r 0.12、高 0.3，底離地 0.2）＋綠色發光的頭（r 0.18）＋臉上三顆墨色眼睛（r 0.03，品字形，朝 +z）
export const ALIEN_R = 1.9, ALIEN_GAP = 0.4, BOB = 0.08;
const ALIEN_AT = { x: ROCKS.x + Math.cos(HOME_A) * ALIEN_R, y: ROCKS.y, z: ROCKS.z + Math.sin(HOME_A) * ALIEN_R };
const ALIEN_YAW = Math.atan2(-ALIEN_AT.x, -ALIEN_AT.z);   // 局部 +z 朝主島中心
export const alienParts = () => [-1, 0, 1].flatMap(k => {
  const x = k * ALIEN_GAP, body = 0.2 + 0.15, head = 0.2 + 0.3 + 0.16, face = 0.17;
  return [
    { kind: 'cylinder', pos: [x, body, 0], scale: [0.24, 0.3, 0.24], color: C.alien, glow: C.alien },
    { kind: 'sphere', pos: [x, head, 0], scale: 0.36, color: C.alien, glow: C.alien },
    ...[[-0.065, 0.02], [0.065, 0.02], [0, 0.085]].map(([ex, ey]) => ({ kind: 'sphere', pos: [x + ex, head + ey, face - Math.abs(ex) * 0.4], scale: 0.06, color: C.ink })),
  ];
});
// 外星收尾的真實秒數（計畫 17 任務 4，協調者裁決整段 ≤ 5.5 s，見 alienEpilogue）：鼠王揮手＋「！」WAVE、鼠群衝向 101 RUSH、
// UFO 降落 UFO_FALL、回全景後 SHIP_WAIT 才換母艦（鏡頭從石堆島飛回來，101 先進畫面）、「♥」LOVE、最後全景停 ALIEN_END
// （其他收尾停 END_HOLD 1.5；外星的吹偏局警告＋隕石已經 10.2 s）
export const WAVE = 0.8, RUSH = 1.2, SHIP_WAIT = 0.4, LOVE = 0.7, ALIEN_END = 1.0;

// 警示燈的位置：這一階段的塔尖上 BEACON_UP（stageOfView）。命中（flags.missile 'hit'，工地不彎）之後塔尖倒向 +x：
// tower.js 的 bent 把彎角（by）以上的點 (x, y) 轉成 (y − by, by − x)——尖端 (0, top) 落在 (top − by, by)，燈再往外（+x）BEACON_UP
export function beaconAt(lv, flags = {}, meta = {}) {
  const stage = stageOfView(lv, meta), top = towerBody(stage).top;
  if (flags.missile !== 'hit' || stage === 'site') return { x: TOWER.x, y: TOWER.y + top + BEACON_UP, z: TOWER.z };
  const by = bendPoint(stage).y - TOWER.y;
  return { x: TOWER.x + (top - by) + BEACON_UP, y: TOWER.y + by, z: TOWER.z };
}

export function view(lv, flags = {}, meta = {}) {
  const v = {};
  // 隕石一落下光點就熄（設計 §4、§6）；alarm 只會是 1（警告）。脈動頻率固定 FLARE_HZ（builders.star）
  if (flags.alarm && !flags.missile) {
    v['finale.star'] = { kind: 'star', at: STAR_AT, shadow: false, footprint: false };
    // 警示燈：101 的階段照 tower.js 的算法（stageOfView），站在這一階段的塔尖上
    v['finale.beacon'] = { kind: 'beacon', at: beaconAt(lv, flags, meta), shadow: false, footprint: false };
  }
  // 大停電收尾（計畫 17 任務 3）：全島漆黑，只剩 101 塔尖這一盞紅燈（隕石落下時熄掉的同一個警示燈，重新亮在現在的塔尖上；劇本把它從 rate 1 加快成 BEACON_FAST）
  if (flags.epilogue === 'blackout') v['finale.beacon'] = { kind: 'beacon', at: beaconAt(lv, flags, meta), rate: 1, shadow: false, footprint: false };
  const o = flags.missile;
  if (o) {
    // 101 的階段照 tower.js 的算法（stageOfView：meta.total，沒給才自己加總）：deflect 的塔頂跟著塔身；
    // hit 的彎角照這一階段（tower.js bendPoint：蓋一半彎得低、工地打在底座）
    const stage = stageOfView(lv, meta);
    const at = o === 'shield' ? DOME_HIT : o === 'hit' ? bendPoint(stage) : POOL;
    // 掉到地上的那顆不擋路（footprint false）：METEOR_REST 在夜市攤子和 101 底座之間的走道上，擋了全島回家要繞出中央格（審稿 2026-11-05）
    v['finale.missile'] = { kind: 'missile', at, from: STAR_AT, outcome: o, footprint: false, shadow: false };
    if (o === 'deflect') {
      v['finale.missile'].via = { x: TOWER.x + toStar.hx * SIDESTEP, y: TOWER.y + towerBody(stage).top, z: TOWER.z + toStar.hz * SIDESTEP };
      // 池邊冒一下水花：白煙 4 團、短（smoke 會一直循環，留到標題卡也無妨）
      v['finale.splash'] = { kind: 'smoke', at: POOL, n: 4, color: 0xffffff, size: 0.3, rise: 0.6, footprint: false };
    }
  }
  // 鮮奶過期收尾（計畫 17 任務 5）：牛奶箱掉進西岸外的海裡，那裡冒一下水花（同 finale.splash 的白煙；finale.splash 只在吹偏、留在溫泉池）
  if (flags.epilogue === 'milkExpired') v['finale.crateSplash'] = { kind: 'smoke', at: { x: CRATE_SEA.x, y: WATER_Y, z: CRATE_SEA.z }, n: 4, color: 0xffffff, size: 0.3, rise: 0.6, footprint: false };
  if (flags.epilogue === 'cyber') v['finale.car'] = carSpec();
  if (flags.epilogue === 'alien') {
    v['finale.ufos'] = { kind: 'compound', at: ROCKS, parts: ufoParts(), footprint: false };
    v['finale.aliens'] = { kind: 'aliens', at: ALIEN_AT, yaw: ALIEN_YAW, footprint: false, shadow: false };
  }
  return v;
}

// 隕石的軌跡（純函式）：missilePath(spec) → t => { x, y, z（岩石中心，世界座標）, d（前進方向，單位向量）, spin（繞前進方向滾幾弧度）, visible }。
// 第一段（0 ≤ t < FLIGHT）：從 from（光點）直線等速落到 to1，前進方向固定、邊落邊滾一圈（TUMBLE）。
//   shield：to1 = 罩面撞點；之後藏起來（煙火由零件放）。
//   hit：to1 = 彎角高度、塔的西側面外 ROCK_R × 0.5（咬進塔面；修正輪 1，以前卡在北面被塔身擋住）；停 HIT_HANG 秒，
//   再 HIT_DROP 秒照重力（高度 k²、水平等速）掉到 METEOR_REST、再滾半圈（終態：半埋在底座西邊的地上）。
//   deflect：to1 = via（塔頂旁）；第二段 DEFLECT 秒：水平等速、高度先被風抬一下再加速往下掉到池裡，方向從落下方向轉到朝下斜 30°、
//   邊掉邊再滾兩圈；終態前緣在池面下 BURY_POOL。t = Infinity 就是終態（建好即落完）
const v3 = (x, y, z) => ({ x, y, z });
const plus = (a, b, k = 1) => v3(a.x + b.x * k, a.y + b.y * k, a.z + b.z * k);
const minus = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const unit = a => { const L = Math.hypot(a.x, a.y, a.z); return v3(a.x / L, a.y / L, a.z / L); };
const mix = (a, b, k) => v3(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
const smooth = k => k * k * (3 - 2 * k);
export function missilePath(spec) {
  const { from, at, outcome } = spec;
  const dirTo = to => unit(minus(to, from));
  let to1 = at;
  // 修正輪 1（審稿 Important 2）：卡在塔的西側面——101 往 +x 倒、西側不會被蓋住；中心在西面外 ROCK_R × 0.5（咬進塔面半個半徑）、
  // 往鏡頭那側 0.2，從鏡頭方向看過去岩石一半以上在塔身輪廓外（以前卡在北面，整顆被塔身擋住）。方向照舊從光點陡落
  if (outcome === 'hit') to1 = plus(at, v3(-(TOWER_HALF + ROCK_R * 0.5), 0.1, 0.2));
  else if (outcome === 'deflect') to1 = spec.via;
  const end1 = dirTo(to1), fly = k => ({ ...mix(from, to1, k), d: end1, spin: TUMBLE * k, visible: true });
  // deflect 的終態：方向 down（水平分量朝 via → 池的方向、跟垂直夾 TILT），前緣在池面下 BURY_POOL
  let down = null, rest = null;
  if (outcome === 'deflect') {
    const h = unit(v3(at.x - to1.x, 0, at.z - to1.z));
    down = unit(v3(h.x * Math.sin(TILT), -Math.cos(TILT), h.z * Math.sin(TILT)));
    rest = plus(plus(at, down, BURY_POOL), down, -ROCK_R);
  }
  return t => {
    if (t < FLIGHT) return fly(Math.max(0, t) / FLIGHT);
    if (outcome === 'shield') return { ...at, d: end1, spin: 0, visible: false };
    if (outcome === 'hit') {
      const k = Math.min(1, Math.max(0, t - FLIGHT - HIT_HANG) / HIT_DROP);
      if (k === 0) return fly(1);
      return { x: to1.x + (METEOR_REST.x - to1.x) * k, y: to1.y + (METEOR_REST.y - to1.y) * k * k, z: to1.z + (METEOR_REST.z - to1.z) * k, d: end1, spin: TUMBLE + Math.PI * k, visible: true };
    }
    const u = t - FLIGHT;
    if (u >= DEFLECT) return { ...rest, d: down, spin: 0, visible: true };
    const k = u / DEFLECT, p = mix(to1, rest, k);
    return { x: p.x, y: to1.y + (rest.y - to1.y) * k * k + 0.8 * Math.sin(Math.PI * k), z: p.z, d: unit(mix(end1, down, smooth(k))), spin: TUMBLE + 4 * Math.PI * k, visible: true };
  };
}

export const builders = {
  // 外星生物：三個一個 compound（不投影），整群面向主島、一起上下漂 ±BOB（每 π 秒一個來回）
  aliens(THREE, spec, ctx) {
    const part = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: alienParts(), shadow: false }), object = new THREE.Group();
    object.add(part.object); object.rotation.y = spec.yaw ?? 0;
    return { object, materials: part.materials, update(dt, t) { part.object.position.y = BOB * Math.sin(t * 2); }, dispose: part.dispose };
  },
  // 光點（trim §C）：發光的球（'orb'，r STAR_R）＋一條從球往外（離開 101 那頭）拖長的淡光尾（'tail'：圓錐殼，靠球那端粗、遠端尖，半透明、不寫深度）。
  // 不投影、不收影（天上的光，不是實體）。自己建材質（不走 compound 的 glow 分組）：手機畫質（quality low）compound 會把發光併進 clay，光點就不亮了。
  // 強度照 tower.js 矽盾天線的作法：底強度不跟夜晚歸零（白天也看得到）＋ ctx.glow.intensity，乘「越來越亮」（建好後 STAR_RAMP 秒從 45% 爬到 100%）
  // 再乘 FLARE_HZ 脈動（相位跟著零件自己的時鐘）
  star(THREE, spec, ctx) {
    const object = new THREE.Group();
    const orbMat = new THREE.MeshStandardMaterial({ color: STAR_COLOR, emissive: STAR_COLOR, roughness: 0.6, metalness: 0 });
    const tailMat = new THREE.MeshBasicMaterial({ color: STAR_COLOR, transparent: true, opacity: 0.3, depthWrite: false });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(STAR_R, 20, 14), orbMat);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, STAR_R * 0.8, STAR_TAIL, 14, 1, true).translate(0, STAR_TAIL / 2, 0), tailMat);
    tail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(toStar.x, toStar.y, toStar.z));
    orb.name = 'orb'; tail.name = 'tail';
    for (const m of [orb, tail]) { m.castShadow = m.receiveShadow = false; object.add(m); }
    let age = 0;
    const pose = () => {
      const k = (1 + Math.sin(age * Math.PI * 2 * FLARE_HZ)) / 2, ramp = Math.min(1, 0.45 + 0.55 * age / STAR_RAMP);
      orbMat.emissiveIntensity = (0.7 + 0.6 * ctx.glow.intensity) * (0.35 + 0.65 * k) * ramp;   // 底 0.7（1.2 會被色調映射洗成淡黃，截圖量的）
      tailMat.opacity = (0.12 + 0.22 * k) * ramp;
    };
    pose();
    return {
      object, materials: [orbMat], update(dt) { age += dt; pose(); },
      dispose() { orb.geometry.dispose(); tail.geometry.dispose(); orbMat.dispose(); tailMat.dispose(); },
    };
  },
  // 警示燈：紅球（'lamp'）＋扁平光束（'beam'：圓錐殼從球心往 +x 張開到半徑 0.35、再壓扁成 0.25 倍高，雙面、半透明、不寫深度），
  // 光束繞 y 每秒 BEACON_REV 圈。跟光點一樣自己建材質、底強度 1.2 不跟夜晚歸零（白天也看得到、手機畫質照亮），再乘 FLARE_HZ 脈動；不投影
  beacon(THREE, spec, ctx) {
    const object = new THREE.Group();
    const lampMat = new THREE.MeshStandardMaterial({ color: BEACON_RED, emissive: BEACON_RED, roughness: 0.5, metalness: 0 });
    const beamMat = new THREE.MeshBasicMaterial({ color: BEACON_RED, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(BEACON_R, 16, 12), lampMat);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.02, BEAM_L, 16, 1, true).translate(0, BEAM_L / 2, 0).rotateZ(-Math.PI / 2).scale(1, 0.25, 1), beamMat);
    lamp.name = 'lamp'; beam.name = 'beam';
    for (const m of [lamp, beam]) { m.castShadow = m.receiveShadow = false; object.add(m); }
    const pose = t => {
      const k = (1 + Math.sin(t * Math.PI * 2 * FLARE_HZ)) / 2;
      lampMat.emissiveIntensity = (1.2 + ctx.glow.intensity) * (0.5 + 0.5 * k);
      beamMat.opacity = 0.15 + 0.4 * k;
      beam.rotation.y = t * Math.PI * 2 * BEACON_REV;
    };
    // 速率（計畫 17 任務 3，大停電收尾從慢閃變快閃）：脈動與光束一起照「相位」走，相位 = base + (t − t0) × rate；
    // userData.setRate(r) 在最後一次 update 的時刻接上（相位不跳）。spec.rate 沒給是 1（相位就是 t，跟以前一樣）
    let rate = spec.rate ?? 1, base = 0, t0 = 0, last = 0;
    const phase = t => base + (t - t0) * rate;
    object.userData.rate = rate;
    object.userData.setRate = r => { base = phase(last); t0 = last; rate = r; object.userData.rate = r; };
    pose(0);
    return {
      object, materials: [lampMat], update(dt, t) { last = t; pose(phase(t)); },
      dispose() { lamp.geometry.dispose(); beam.geometry.dispose(); lampMat.dispose(); beamMat.dispose(); },
    };
  },
  // 隕石（trim §C，取代飛彈機身）：Group 在 at（撞點），'body'（照 missilePath 擺、+z 朝前進方向）裡有岩石 compound（'rock'，一個黏土 mesh）、
  // 發光外殼（'shell'）、拖尾（'trail'，落地後熄掉）；shield 多帶一發煙火（parts.js fireworks once，'fireworks'），落完（t ≥ FLIGHT）那一刻放。
  // 建好即終態（t = Infinity：shield 藏起來、煙火放完；hit 半埋在底座西邊的地上；deflect 落在池裡）——跳過、reduced-motion、截圖、舞台重建零件都直接看到結果。
  // object.userData.launch({ speed })：時鐘歸零、從光點重落（劇本的 replay 拍叫；speed 演出倍速）；finish()：跳到終態（跳過）
  missile(THREE, spec, ctx) {
    const object = new THREE.Group(), at = spec.at, path = missilePath(spec), origin = { x: 0, y: 0, z: 0 };
    const body = new THREE.Group(); body.name = 'body'; object.add(body);
    const rock = ctx.build({ kind: 'compound', at: origin, parts: ROCK_PARTS, shadow: false });
    rock.object.name = 'rock'; body.add(rock.object);
    // 疊加混色（AdditiveBlending）：白天蓋在深色岩石上也是亮橘色、拖尾越淡越透
    const glowMat = opacity => new THREE.MeshBasicMaterial({ color: SHELL_COLOR, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    const shellMat = glowMat(SHELL_OPACITY), shell = new THREE.Mesh(new THREE.IcosahedronGeometry(ROCK_R * 1.15, 1), shellMat);
    shell.name = 'shell'; body.add(shell);
    const trail = new THREE.Group(), ballGeo = new THREE.SphereGeometry(1, 12, 8);
    trail.name = 'trail'; body.add(trail);
    const trailMats = TRAIL.map(([back, r, opacity]) => { const m = glowMat(opacity), b = new THREE.Mesh(ballGeo, m); b.position.z = -back; b.scale.setScalar(r); trail.add(b); return m; });
    for (const m of [shell, ...trail.children]) m.castShadow = m.receiveShadow = false;
    const fw = spec.outcome === 'shield' ? ctx.build({ kind: 'fireworks', at: origin, once: true, colors: FIREWORKS }) : null;
    if (fw) { fw.object.name = 'fireworks'; object.add(fw.object); }
    const Z = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3(), roll = new THREE.Quaternion();
    let t = Infinity, rate = 1, popped = true;
    const end = FLIGHT + (spec.outcome === 'deflect' ? DEFLECT : spec.outcome === 'hit' ? HIT_HANG + HIT_DROP : 0);   // 軌跡演完（之後 path 回的都是終態）
    const lands = spec.outcome === 'hit' ? FLIGHT : end;   // 拖尾熄掉的時刻：命中是撞上塔那一刻（之後是掉下去，不是飛）
    const put = () => {
      const p = path(t);
      body.visible = p.visible; body.position.set(p.x - at.x, p.y - at.y, p.z - at.z);
      body.quaternion.setFromUnitVectors(Z, dir.set(p.d.x, p.d.y, p.d.z)).multiply(roll.setFromAxisAngle(Z, p.spin));
      trail.visible = t < lands;   // 落地（命中：撞上塔）就熄掉
      if (fw && !popped && t >= FLIGHT) { popped = true; fw.object.userData.burst(); }
    };
    object.userData.launch = ({ speed = 1 } = {}) => { t = 0; rate = speed; popped = false; fw?.object.userData.finish(); put(); };
    object.userData.finish = () => { t = Infinity; popped = true; fw?.object.userData.finish(); put(); };
    put();   // 煙火建好就是藏著的（once 建好即終態）
    return {
      object,
      // 演完最後擺一次終態就停（t 設回 Infinity，跟建好、finish 一樣）：不再每幀重擺
      update(dt, now) { if (t !== Infinity) { t += dt * rate; if (t >= end) t = Infinity; put(); } fw?.update(dt * rate, now); },
      dispose() { rock.dispose(); shell.geometry.dispose(); ballGeo.dispose(); for (const m of [shellMat, ...trailMats]) m.dispose(); fw?.dispose(); },
    };
  },
};

// delay 秒後才開演 beat（together 裡用：隕石落到一半才冒「！」）；dur 是 beat 自己的秒數（together 在 start 就要知道總長）。
// 跳過時還沒開演的 beat 照樣 start → end
const later = (delay, dur, beat) => {
  let on = false, shown = false;
  const open = c => { on = true; shown = beat.start?.(c) !== false; };
  return {
    kind: 'later', dur: delay + dur, beat,   // beat 留在拍上給測試看
    start() { on = false; shown = false; },
    step(k, dt, c) {
      const t = k * (delay + dur);
      if (!on && t >= delay) open(c);
      if (shown) beat.step?.(Math.min(1, (t - delay) / dur), dt, c);
    },
    end(c) { if (!on) open(c); if (shown) beat.end?.(c); },
  };
};
// 隕石各段的真實秒數：「！」0.8、矽盾擋下的跳＋♥ 1.0、吹偏的「？」1.0 再「♪」0.8
const CHEER = 1.0, HUH = 1.0, TUNE = 0.8, CROWD = 24;
// R49：溫泉客逃出池子時頭上的「！」秒數；名冊的兩位溫泉客（landmarks.bathers）
const BATHER_SHOUT = 0.6;
const bathers = c => c.roster.members('landmarks.bathers') ?? [];

// 零件閃白一下（blink.part；外星收尾換上母艦那一刻用）。
// R48（使用者 2026-11-06：矽盾只有在真結局才會長）：計畫 17 任務 2 的試升失敗（晶片 7–8 警告裡罩子升起又縮回、天線環閃白）整段拿掉了
const blinkPart = key => ({ kind: 'blinkPart', key, dur: 0, start(c) { const o = c.stage.partObject(key); if (!o || !c.blink) return false; c.blink.part(o); } });
// 抬頭看天：101 頭頂（stage.headOf）與光點的中點，警告時鏡頭先對這裡（光點、警示燈、塔頂都在畫面裡；全景看不到天空）
export const skyShot = c => { const h = c.stage.headOf('tower'); return { x: (h.x + STAR_AT.x) / 2, y: (h.y + STAR_AT.y) / 2, z: (h.z + STAR_AT.z) / 2 }; };
export const script = {
  // 警告（終局回合第一個事件，選擇帶動升級 §4；原本倒數 3 的宣告去掉數字；trim §C 光點搬到天上）：光點與 101 頂上的警示燈一起出現，
  // 同時鏡頭抬頭看天（skyShot，FOCUS_BEAT 0.8 s）→ 停 SKY_HOLD → 鏡頭退到 WIDE、全島（最多 24 人）轉頭看光點 1.2 s（鏡頭在這段飛過去）→
  // 同一批人頭上一起冒「！」、蹲下護頭（duck）0.8 s → 放回日常。終局回合 1 倍速，秒數就是真實秒數（約 3.2 s）。
  // 「！」等鏡頭到 WIDE 才冒（chain.test 的字在畫面裡不變式：天空鏡頭裡島整座出畫）
  // R48（使用者 2026-11-06：矽盾只有在真結局才會長）：晶片幾級都一樣——以前晶片 7–8 在這裡插一段試升失敗，拿掉了
  warning(e, s, ctx) {
    const { B } = ctx, up = lookUp(B, STAR_AT, LOOK);
    return [
      B.together([B.apply(e, { only: ['finale.star', 'finale.beacon'] }), B.focus(skyShot, { zoom: SKY_ZOOM })]), B.wait(SKY_HOLD),
      B.together([B.focus(WIDE, { zoom: WIDE_ZOOM }), ...up.look]), B.together([...up.say('！', SHOUT), ...up.act('duck', DUCK)]), up.release,
    ];
  },
  // 隕石（設計 §6，真實秒數，終局回合 1 倍速）：鏡頭在 WIDE（警告已經停在那裡，這拍 0.8 s 當停頓）→ 光點熄掉 →
  //   隕石從光點的位置由上往下落（replay：套用零件、launch 重落），落到一半全島（最多 24 人，演到才點名、整段同一批人）冒「！」→
  //   結果 → 套上剩下的 → 放人回日常 → 回全景停 HOLD_END（後面接收尾時不停：e.epilogue，計畫 17 任務 3 裁決）。
  //   shield：罩子切 full（閃白就是那一下亮），隕石撞上罩子碎成煙火；全島原地跳＋♥。罩子從撞上算 0.8 s 起淡掉、1.6 s 藏起來（parts.js shieldPose）。
  //   deflect：第二段 DEFLECT 秒被風吹偏、掉進溫泉（同一個 replay 拍裡）→ 水花 → 全島「？」再「♪」。
  //   hit：101 換成彎 L 的塔身、天線／燈光秀／罩子／鷹架（晶片 8，R48）拿掉（閃白）→ 全島躺平（world 拍只帶 mood，app 合進目前的全島效果；
  //   回合收尾的 world 拍照舞台旗標再算一次，一樣是 lie）。
  //   replay 的 finish 只在跳過（ctx.instant）時跳到終態：live 時拍演完零件自己還在演（煙火撞上罩子才放、放 1.2 秒）
  missile(e, s, ctx) {
    const { B } = ctx, o = e.outcome, flight = FLIGHT + (o === 'deflect' ? DEFLECT : 0);
    // 罩子（full）建好時藏著（parts.js shield）：套用的同一幀從 0 演（全亮 0.8 s → 淡掉 → 1.6 s 藏起來），之後零件自己演完；
    // 跳過（ctx.instant）不演，終態就是沒有罩子。together 裡排在 apply 後面：apply 先 commit 零件，這拍才拿得到、閃白閃的是亮著的罩子
    const domeUp = { kind: 'domeUp', dur: 0, start(c) { const d = c.stage.partObject('tower.shield'); if (!c.instant) d?.userData.test?.({ speed: c.speed ?? 1 }); return false; } };
    let list = null;
    const people = c => (list ??= islanders(c).slice(0, CROWD));
    const all = fn => crowd(B, c => people(c).flatMap(fn));
    const fly = B.replay(e, 'finale.missile', flight, {
      begin: (m, c) => { if (!m.userData.launch) return false; m.userData.launch({ speed: c.speed ?? 1 }); return true; },
      finish: (m, c) => { if (c?.instant) m.userData.finish(); },
    });
    // R49（使用者 2026-11-06：隕石砸到溫泉裡時裡面還有人很奇怪）：吹偏時，隕石撞到塔頂被風吹偏那一刻（FLIGHT）起，兩位溫泉客從池裡爬出來、
    // 小跑（DASH）到池子東側的池緣外（landmarks.BATHERS_OUT；nav 先從池子 footprint 裡逃到最近的可走點再繞過去，約 0.5 s），頭上「！」BATHER_SHOUT。
    // 疊在隕石那個 together 裡（第二段 DEFLECT 秒正好跑完），不拉長終局（吹偏局的終局 15.4 / 16 s）；跑不到的話 DEFLECT 到了 walk 的收尾把人放到終點。
    // 演完由 tail 的 home 放回日常——那時旗標已折進來（apply），名冊的站位就是 BATHERS_OUT，不再走回池子
    // 修正輪（任務 2 的小問題）：later 把整段拉長到 DEFLECT，walk 跑到了還在 walking（原地跑步）——用 dash（照 rush 自己記真實秒數，跑到就停）
    const flee = o !== 'deflect' ? [] : [later(FLIGHT, DEFLECT, crowd(B, c => bathers(c).map((m, i) => B.together([dash(B, m, BATHERS_OUT[i]), B.bubble(m, '！', BATHER_SHOUT)]))))];
    const lead = [B.focus(WIDE, { zoom: WIDE_ZOOM }), B.apply(e, { only: ['finale.star'] }), B.together([fly, later(FLIGHT / 2, SHOUT, all(m => [B.bubble(m, '！', SHOUT)])), ...flee])];
    // 後面接收尾（e.epilogue，game.js finaleEvents；計畫 17 任務 3 裁決）：不回全景停 HOLD_END——收尾第一拍自己平移鏡頭（終局 ≤ 16 s 的預算）
    // home 也放溫泉客（R49：他們被逃跑那一拍點走了；全島的名單 list 多半也有他們，重複的 home 無害）
    const tail = [B.apply(e), B.home(c => [...(list ?? []), ...(o === 'deflect' ? bathers(c) : [])]), ...(e.epilogue ? [] : [B.focus('home', { hold: HOLD_END })])];
    if (o === 'shield') return [...lead, B.together([B.apply(e, { only: ['tower.shield'] }), domeUp]), all(m => [B.gesture(m, 'jump', CHEER), B.bubble(m, '♥', CHEER)]), ...tail];
    if (o === 'deflect') return [...lead, B.apply(e, { only: ['finale.splash'] }), all(m => [B.bubble(m, '？', HUH)]), all(m => [B.bubble(m, '♪', TUNE)]), ...tail];
    return [...lead, B.apply(e, { only: ['tower.main', 'tower.antenna', 'tower.show', 'tower.shield', 'tower.scaffold'] }), B.worldNow(), ...tail];   // 心情照 world.js 的規則重算（單一來源，最終審稿）
  },
  // 賽博（設計 §7，≤ 12 秒真實，終局回合 1 倍速）：夜晚＋霓虹（world 拍只帶 time／glowScale，app 合進目前的全島效果；
  //   賽博一定是燈泡 Lv9，glowScale 早就是 NEON_BOOST、時間多半也已是夜晚——這拍不會更亮，只是保證尾聲是夜晚霓虹）→
  //   黑塔、燈光秀、天線、螢幕閃白換上 → 紅車飛一趟（replay：套用零件、fly 從海上重飛；跳過時 land 直接停好），
  //   → 機器鼠的家搬上屋頂（apply）、閃白放上站位（roof 拍；屋頂在 101 的 footprint 裡走不上去）→
  //   放回日常（站定在屋頂）→ 剩下的套用 → 全景停 1.5 秒。最前面先回全景（隕石停在 WIDE，見下面）。
  epilogue(e, s, ctx) {
    const { B } = ctx;
    // 計畫 17：壞結局各自的收尾。任務 3：大停電、捷運淹水（blackoutEpilogue、floodEpilogue）；任務 4：變異鼠稱王（alienEpilogue）；
    // 任務 5：大巨蛋淹水、珍奶攤被吹走、鮮奶過期（domeFloodEpilogue、cartBlownEpilogue、milkExpiredEpilogue）——都在下面。
    // 沒有收尾劇本的結局（不在 BAD_EPILOGUES 裡；遊戲層不會發 epilogue 事件）：只套用，安全網
    if (e.ending === 'blackout') return blackoutEpilogue(e, ctx);
    if (e.ending === 'flood') return floodEpilogue(e, ctx);
    if (e.ending === 'alien') return alienEpilogue(e, ctx);
    if (e.ending === 'domeFlood') return domeFloodEpilogue(e, ctx);
    if (e.ending === 'cartBlown') return cartBlownEpilogue(e, ctx);
    if (e.ending === 'milkExpired') return milkExpiredEpilogue(e, ctx);
    if (e.ending === 'domeRats') return domeRatsEpilogue(e, ctx);
    if (e.ending !== 'cyber') return [B.apply(e)];
    const rats = c => c.roster.members('rat.pack');
    const fly = B.replay(e, 'finale.car', CAR_FLIGHT, {
      begin: (o, c) => { if (!o.userData.fly) return false; o.userData.fly({ speed: c.speed ?? 1 }); return true; },
      finish: o => o.userData.land(),
    });
    // 計畫 17 任務 3 修正輪 1：隕石後面接收尾時不回全景停（e.epilogue），鏡頭還在 WIDE——第一拍先回全景、停 FOCUS_BEAT 等鏡頭飛到，賽博整段照舊在全景演
    return [
      B.focus('home', { hold: FOCUS_BEAT }),
      B.world({ time: TIMES.night, glowScale: NEON_BOOST }),
      B.apply(e, { only: ['tower.main', 'tower.show', 'tower.antenna', 'tower.screen'] }),
      fly,
      B.apply(e, { only: ['rat.pack', 'rat.king'] }), roof(rats, m => ROOF_SPOTS[m.i % ROOF_SPOTS.length]), B.home(rats),
      B.apply(e), B.focus('home', { hold: END_HOLD }),
    ];
  },
};

// ── 計畫 17 任務 4：變異鼠稱王（災難版）收尾（設計 §4 alien；以舊的外星尾聲為底，前面加鼠群變異；終局回合 1 倍速，真實秒數）──
// 協調者裁決：整段 ≤ 5.5 s（外星局約一半是吹偏局，警告＋吹偏的隕石 10.2 s，壞結局終局 ≤ 16 s），所以各段疊著演：
//   ① 鏡頭到溫泉格，同時鼠王（名冊 rat.pack 唯一一隻，演到才點名）揮手＋「！」WAVE 秒；第一拍先折旗標（apply only []）、
//      心情先切回站著（world mood normal：命中之後大家躺平；第三隻眼留到最後走出來那一刻，所以不在這裡 worldNow）；
//   ② 一段：回全景（鏡頭飛 1 s），鼠群（rat.swarm SWARM_N 隻）從園區門口（SWARM_ENTRIES）閃白出現、衝向 101 腳下 RUSH 秒（DASH，跑不到的停在半路），
//      同一刻小 UFO、石堆島的兩隻老鼠縮掉（骨架動畫 ≤ 12：鼠群 SWARM_N＋鼠王＋柴犬）、主島的小人（crowd.islanders，演到才點名）各自快走到最近的建築門口躲進去
//      （typhoon.js toDoor，同颱風放下的躲雨；hideBeat 上限 RUSH ＋ UFO_FALL）；
//      RUSH 秒後鏡頭推到石堆島（裁決 R5：石堆島在全景畫面外）：綠光圈閃白變降落場，三台 UFO 不閃白套上、從 UFO_DROP 高降下 UFO_FALL 秒，
//      降落前 BLINK 外星生物閃白；
//   ③ 回全景，SHIP_WAIT 秒後 101 閃白變母艦（塔身、天線、燈光秀、罩子；命中局也變，tower.js；母艦 grow false 不從矮樁長，這裡自己 blinkPart 閃白；
//      颱風 Lv1–2 的暴風雲、雨、外送機車同一拍縮掉——母艦一來暴風圈就散了，typhoon.js），同一刻鼠群、鼠王閃白站上碟緣（rat.js SAUCER_SPOTS）、碟頂（SHIP_SPOT）
//      （roof 拍：碟頂在 101 的 footprint 上面，走不上去）→ 放回日常（站定）；
//   ④ worldNow（全島第三隻眼：world.js 有外星收尾就是 mood alien；雨停 storm 0）、躲著的人走出來（放回日常、roster.showAll({ walk })：從門口用走路速度走回家），同時鼠王「♥」LOVE 秒；
//   ⑤ 剩下的套用 → 全景停 ALIEN_END。
// 名義秒數 WAVE＋RUSH＋UFO_FALL＋SHIP_WAIT＋BLINK＋LOVE＋ALIEN_END＝5.25 s（live 多幾幀拍與拍之間的換手）。
// 跳過：躲進門的 toDoor 收尾照樣藏起來，④ 的走出來（跳過時也是 start → end）、回合 snap 的 showAll 都把人放出來
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };
// 鼠群閃白出現（BLINK 秒）：名冊新生的成員不閃，模型 holder 是非同步載入的——這拍每幀看一次，誰的 holder 到了就閃誰（每隻一次）
const appear = who => {
  let done = new Set();
  const flash = c => { for (const m of who(c)) if (m.holder && !done.has(m)) { done.add(m); c.blink?.part(m.holder); } };
  return { kind: 'appear', dur: BLINK, start(c) { done = new Set(); if (!who(c).length) return false; flash(c); }, step(k, dt, c) { flash(c); } };
};
// 衝向 101：走 RUSH 秒（DASH）就停——跑到了照 walk 的收尾停在終點，沒跑到的停在半路原地（不瞬移到終點；之後 roof 閃白上碟緣）
const rush = (B, m, to) => {
  const w = B.walk(m, to, { speed: DASH });
  let t = 0, done = false;
  return {
    kind: 'rush', dur: RUSH,
    start(c) { t = 0; done = false; return w.start(c); },
    step(k, dt, c) { if (done) return; t += dt; if (t >= w.dur()) { done = true; w.end(c); } else w.step(k, dt, c); },
    end(c) { if (!done && !m.gone) c.roster.setPose(m, { ...m.pos, walking: false }); },
  };
};
// 快跑到 to（DASH）：照 rush 自己記真實秒數，跑到就收尾（walk 的 end：停在終點、不再 walking）——包在 later 裡被拉長時不會原地跑步。
// 跟 rush 不同：沒有上限，跳過時 walk 的收尾照樣放到終點（R49 溫泉客逃到池邊）
const dash = (B, m, to) => {
  const w = B.walk(m, to, { speed: DASH });
  let t = 0, done = false;
  return {
    kind: 'dash', dur: c => w.dur(c),
    start(c) { t = 0; done = false; return w.start(c); },
    step(k, dt, c) { if (done) return; t += dt; if (t >= w.dur()) { done = true; w.end(c); } else w.step(k, dt, c); },
    end(c) { if (!done) { done = true; w.end(c); } },
  };
};
// 躲進門（typhoon.js toDoor）有上限 RUSH ＋ UFO_FALL（第二段的長度）：離門很遠的人時間到就在半路藏起來（toDoor 的收尾把他擺到門口、藏好），
// 第二段不會因為誰站得遠被拉長（吹偏局的終局只剩約 0.4 s）。dur 照 walk 的長度、超過就截到上限；拍照常 step／end
const capped = (beat, max) => {
  let d = 0;
  return {
    kind: beat.kind, dur: () => d,
    start(c) { const r = beat.start?.(c); d = r === false ? 0 : Math.min(max, typeof beat.dur === 'function' ? beat.dur(c) : beat.dur); return r; },
    step(k, dt, c) { beat.step?.(k, dt, c); },
    end(c) { beat.end?.(c); },
  };
};
export const hideBeat = (B, m) => capped(toDoor(B, m), RUSH + UFO_FALL);
// 母艦一來暴風圈就散了（審稿：颱風 Lv1–2 的雲把 101 跟母艦蓋住）：雲、雨、外送機車跟母艦同一拍套用（縮下去），
// 雨停（world.js 外星收尾 storm 0）在第 ④ 拍的 worldNow
const STORM = ['typhoon.main', 'typhoon.rain', 'typhoon.scooter'];
export function alienEpilogue(e, ctx) {
  const { B } = ctx, king = once(c => c.roster.members('rat.pack')?.[0]), swarm = c => c.roster.members('rat.swarm') ?? [];
  // 101 腳下一圈 2 × SWARM_N 個點，離園區門口近的先給（老鼠 0 從最靠 101 的入口出來）
  const foot = once(c => { const from = SWARM_ENTRIES[0]; return c.nav.slots(TOWER, 2 * SWARM_N, 1.3).sort((p, q) => Math.hypot(p.x - from.x, p.z - from.z) - Math.hypot(q.x - from.x, q.z - from.z)); });
  const cast = once(c => islanders(c));
  const drop = B.together([B.apply(e, { only: ['finale.ufos'], blink: false }), B.move('finale.ufos', { from: { dy: UFO_DROP }, to: {}, dur: UFO_FALL })]);
  const comeOut = { kind: 'home', dur: 0, start(c) { for (const m of cast(c) ?? []) c.roster.home(m); c.roster.showAll({ walk: true }); return false; } };
  const crew = c => [...swarm(c), king(c)].filter(Boolean);
  return [
    B.together([B.apply(e, { only: [] }), B.world({ mood: 'normal' }), B.focus(SPRING), B.gesture(king, 'wave', WAVE), B.bubble(king, '！', WAVE)]),
    B.together([
      B.focus('home'), B.apply(e, { only: ['rat.pack', 'rat.swarm', 'rat.ufo', 'sat.rocks'] }), appear(swarm),
      crowd(B, c => swarm(c).map((m, i) => rush(B, m, foot(c)[i]))),
      crowd(B, c => cast(c).map(m => hideBeat(B, m))),
      later(RUSH, UFO_FALL, drop),
      later(RUSH, BLINK, B.apply(e, { only: ['sat.rocksRing'] })),
      later(RUSH, FOCUS_BEAT, B.focus(ROCKS)),
      later(RUSH + UFO_FALL - BLINK, BLINK, B.apply(e, { only: ['finale.aliens'] })),
    ]),
    B.together([
      B.focus('home'),
      // 同一幀的順序：前一個 later 先開演、apply 第一步就 commit 母艦，blinkPart 接著才開，閃的是剛換上的母艦（不是舊的塔）
      later(SHIP_WAIT, BLINK, B.apply(e, { only: ['tower.main', 'tower.antenna', 'tower.show', 'tower.shield', 'tower.scaffold', ...STORM] })), later(SHIP_WAIT, 0, blinkPart('tower.main')),
      later(SHIP_WAIT, BLINK, roof(crew, m => (m.key === 'rat.swarm' ? SAUCER_SPOTS[m.i % SAUCER_SPOTS.length] : SHIP_SPOT))),
    ]),
    B.home(crew),
    B.together([B.worldNow(), comeOut, B.bubble(king, '♥', LOVE)]),
    B.apply(e), B.focus('home', { hold: ALIEN_END }),
  ];
}
// ── R47 大巨蛋鼠災收尾（使用者 2026-11-06：我理想中的鼠災是整島都是老鼠；終局回合 1 倍速，真實秒數 ≤ 5.5 s——
//   鼠災局多半是吹偏局，警告 3.3＋吹偏的隕石約 7.0，壞結局終局 ≤ 16 s）──
//   ① 折旗標（apply only []）＋ worldNow（吹偏之後本來就站著；命中局躺平的人站起來）＋鏡頭到大巨蛋（FOCUS_BEAT）；
//   ② 一段：鼠群零件 rat.plague（rat.js，一個 InstancedMesh、PLAGUE_N 隻）套上、閃白，同一刻 plagueRush：RUSH 秒內從門口沿直線撒到七個主格；
//      門口那兩隻名冊老鼠（rat.pack）也往門口外衝（rush，DASH）——拿水桶的工作人員（baseball.staff，家是 follow 老鼠）跟著追、不躲；
//      兩個工作人員從現在站的地方快跑（DASH）到兩隻老鼠後面 0.6（剛好是他們 follow 的距離；上限同躲進門：跳過時 walk 的收尾直接放到那裡，
//      不會留在出生的入口疊在巨蛋後面）；DOME_HOLD 秒後鏡頭回全景（修正輪 1：0.4 → 0.8，等鼠群衝出門口看得到）；
//      全島的人（演到才點名，工作人員除外；修正輪 1：不只 crowd.islanders——還在路上的〔arriving、劇本剛放回來還在走〕也算，見 sheltering）
//      快走到最近的建築門口躲進去（hideBeat，同外星收尾，上限 RUSH ＋ UFO_FALL）；颱風天的外送員（typhoon.scooter）同一拍縮掉（修正輪 1；收尾的 view 不畫）；
//   ③ 躲進去就不出來了（roster.hide stay：跳過的 snap 也不放出來，live 跟跳過終態一樣）、交回日常；這一刻主島上還露在外面的人
//      （點名之後才從橋上走上格子的）一起藏好（同一個 stay）；名冊老鼠、工作人員交回日常（在門口晃、跟著追）；
//   ④ 修正輪 1：鏡頭推近中心格（101 那格，zoom 0.6）CLOSE_UP 秒看老鼠亂竄；
//   ⑤ 剩下的套用 → 全景停 PLAGUE_END。沒有新文字。
//   名義秒數 FOCUS_BEAT 0.8 ＋ RUSH ＋ UFO_FALL（躲進門的上限）2.2 ＋ CLOSE_UP 1.2 ＋ PLAGUE_END 1.0 ＝ 5.2 s
export const PLAGUE_END = 1.0, DOME_HOLD = 0.8, CLOSE_UP = 1.2;
// 名冊老鼠衝出去的點：門口外（往鏡頭那側）左右各一，離門口 0.78（還在牠們日常 wander GATE 0.9 的圈裡：交回日常時不會掉頭跑回去）
const GATE_OUT = [offset(GATE, -0.5, 0.6), offset(GATE, 0.5, 0.6)];
// 工作人員追老鼠的站位：各自那隻老鼠的正後方（門口那側）0.6——baseball.staff 的家是 follow rat.pack、dist 0.6，交回日常不用再動
const CHASE = GATE_OUT.map(p => offset(p, 0, -0.6));
// 鼠群從門口撒出去（照 bulb.js spinUp 的寫法）：拍長是真的 RUSH（together 等它），零件吃真實秒數，所以 dur ÷ 演出速度；
// 跳過（instant）不呼叫——零件建好就是終態；end 跳到終態（照常演完時本來就到了）
// 整支審稿：鼠群的目的地挪出建築（rat.js userData.place）——live、跳過都要（跟 plagueRush 不同），跳過的終態才一樣；放在 plagueRush 前面
const placePlague = { kind: 'placePlague', dur: 0, start(c) { c.stage.partObject('rat.plague')?.userData.place?.(c.nav); return false; } };
const plagueRush = dur => ({
  kind: 'plagueRush', dur,
  start(c) { if (!c.instant) c.stage.partObject('rat.plague')?.userData.rush?.(dur / (c.speed ?? 1)); },
  end(c) { c.stage.partObject('rat.plague')?.userData.finish?.(); },
});
// 要躲進門的人（修正輪 1：不只 crowd.islanders）：主島格上、露出來的小人（walker），日常裡站著的、還在路上的（arriving）、
// 劇本手上還在演的都算；工作人員（追老鼠）、正在走出去的（exit）、拿掉的不算。衛星島、橋上的人 cellAt 回 null，不算
const CENTRE_CELL = [0, 0];
const sheltering = c => c.roster.keys().filter(k => k !== 'baseball.staff').flatMap(k => c.roster.members(k))
  .filter(m => m.walker && !m.hidden && !m.gone && m.mode !== 'exit' && cellAt(m.pos.x, m.pos.z));
export function domeRatsEpilogue(e, ctx) {
  const { B } = ctx, pack = c => c.roster.members('rat.pack') ?? [], staff = c => c.roster.members('baseball.staff') ?? [];
  const cast = once(c => sheltering(c));
  const out = once(c => GATE_OUT.map(p => c.nav.nearestWalkable(p))), chase = once(c => CHASE.map(p => c.nav.nearestWalkable(p)));
  // 躲著就不出來（stay），交回日常（hidden 的人日常不動；跟跳過的 snap 一樣是 home 模式）；
  // 這一刻主島上還露在外面的（躲進門那拍點名之後才從橋上走上來的）一起藏好——終態主島上除了工作人員沒有人
  const shelter = { kind: 'shelter', dur: 0, start(c) {
    for (const m of [...(cast(c) ?? []), ...sheltering(c)]) { c.roster.hide(m, { stay: true }); c.roster.home(m); }
    return false;
  } };
  return [
    B.together([B.apply(e, { only: [] }), B.worldNow(), B.focus('baseball')]),
    B.together([
      // 同一幀的順序：apply 第一步就 commit 鼠群，later 的 blinkPart 接著才開（閃的是剛露出來的鼠群）；plagueRush 在 apply 之後 start（零件已經建好）
      B.apply(e, { only: ['rat.plague', 'typhoon.scooter'] }), placePlague, plagueRush(RUSH), later(0, 0, blinkPart('rat.plague')),
      crowd(B, c => pack(c).map((m, i) => rush(B, m, out(c)[i % out(c).length]))),
      crowd(B, c => staff(c).map((m, i) => capped(B.walk(m, chase(c)[i % chase(c).length], { speed: DASH }), RUSH + UFO_FALL))),
      later(DOME_HOLD, FOCUS_BEAT, B.focus('home')),
      crowd(B, c => cast(c).map(m => hideBeat(B, m))),
    ]),
    shelter, B.home(c => [...pack(c), ...staff(c)]),
    B.together([B.focus(CENTRE_CELL, { zoom: 0.6 }), B.wait(CLOSE_UP)]),
    B.apply(e), B.focus('home', { hold: PLAGUE_END }),
  ];
}

// ── 計畫 17 任務 3：大停電、捷運淹水收尾（設計 §4；終局回合 1 倍速，真實秒數，每段 ≤ 7.0 s；隕石命中之後全島躺平，
//   收尾第一拍把 epilogue 旗標折進舞台、緊接 worldNow——world.js 有收尾就不躺，大家站起來）──
// 大停電（約 4 s）：警示燈重新亮在塔尖（閃白；折旗標）→ worldNow（漆黑 TIMES.pitch、發光照舊關著、站起來）→
//   鏡頭推近 101 塔尖（beaconAt，zoom TIP_ZOOM 0.4＝全景距離的 0.4 倍：紅燈是畫面主角，截圖選的；設計的 1.2 比全景還遠）→ 警示燈從慢閃變快閃（replay：rate × BEACON_FAST，SPEED_UP 秒）→ 剩下的套用 → 全景停 END_HOLD
export const TIP_ZOOM = 0.4, SPEED_UP = 1.5, BEACON_FAST = 2;
export function blackoutEpilogue(e, ctx) {
  const { B } = ctx, fast = o => { if (!o.userData.setRate) return false; o.userData.setRate(BEACON_FAST); return true; };
  return [
    B.apply(e, { only: ['finale.beacon'] }), B.worldNow(),
    B.focus(c => beaconAt(c.stage.lv, c.stage.flags, c.stage.meta), { zoom: TIP_ZOOM }),
    B.replay(e, 'finale.beacon', SPEED_UP, { begin: fast, finish: o => o.userData.setRate?.(BEACON_FAST) }),
    B.apply(e), B.focus('home', { hold: END_HOLD }),
  ];
}
// 捷運淹水（約 5.25 s；計畫 17 任務 3 裁決：鏡頭平移跟水升起同時、老闆在船划完前 OWNER_JUMP 秒起跳——吹偏局的終局才在 16 s 內）：
//   折旗標 → worldNow（站起來）→ 鏡頭到捷運格，同時水（token.floodSheet）從格面下 SHEET_DROP 升上來 FLOOD_RISE 秒（不閃白）→
//   小船（token.boat）在車站門口出現（零件的 at 是東南岸的終點，先用 0 秒的 move 擺到門口的偏移再露出來），同一刻兩個划船的人閃白坐上船（board）→
//   船划到東南岸 BOAT_ROW 秒，兩人每幀照船的位置坐在座位上（token.js boatSeat，±0.15；同燈泡 Lv7 坐車頂的 ride 做法）→
//   船划完前 OWNER_JUMP 秒，珍奶老闆跳上攤車頂（boba.js floodPerch：攤車 SHOP 上方 0.95；攤車被吹走就跳上翻在海裡的那台）→
//   兩個泳客、老闆的家搬到船上／攤車頂（他們還在劇本手上，名冊不會叫他們走過去）→ 放回日常（就站在家裡）→ 剩下的套用 → 全景停 END_HOLD。
//   划船的人：設計寫「站長（token.staff 第一位）和一個泳客」——淹水時站長已經換成了泳客（token.js：flooded 時沒有 token.staff），所以是兩個泳客（0 號就是原本的站長）；
//   有站長的話站長優先（防呆）
export const FLOOD_RISE = 1.0, BOAT_ROW = 2.5, OWNER_JUMP = 0.5;
const BOAT_OFF = { dx: BOAT_FROM.x - BOAT_TO.x, dy: BOAT_FROM.y - BOAT_TO.y, dz: BOAT_FROM.z - BOAT_TO.z };
// 把人擺上船（不在船上的人：閃白換位，同 roof）
const hop = (c, m, pose) => {
  c.roster.claim(m); c.roster.setPose(m, { ...pose, walking: false });
  if (m.holder) c.blink.part(m.holder); else if (m.walker) c.blink.walker(m.walker);
};
const board = who => ({
  kind: 'board', dur: BLINK,
  start(c) { const list = who(c); if (!list.length) return false; list.forEach((m, i) => hop(c, m, boatSeat(i, BOAT_FROM))); },
});
// 划船：move 推船、每幀把人擺回座位（船不在：move.start 回 false，這拍跳過；end 照樣把人放在終點的座位上）
function row(B, who) {
  const mv = B.move('token.boat', { from: BOAT_OFF, to: {}, dur: BOAT_ROW });
  const seat = c => { const o = c.stage.partObject('token.boat'); if (o) who(c).forEach((m, i) => c.roster.setPose(m, { ...boatSeat(i, o.position), walking: false })); };
  return {
    kind: 'row', dur: BOAT_ROW,
    start(c) { if (mv.start(c) === false) return false; seat(c); },
    step(k, dt, c) { mv.step(k, dt, c); seat(c); },
    end(c) { mv.end(c); seat(c); },
  };
}
export function floodEpilogue(e, ctx) {
  const { B } = ctx;
  const riders = once(c => [...(c.roster.members('token.staff') ?? []).slice(0, 1), ...(c.roster.members('token.swimmers') ?? [])].filter(m => !m.hidden).slice(0, 2));
  const owner = c => c.roster.members('boba.owner')?.[0] ?? null;
  return [
    B.apply(e, { only: [] }), B.worldNow(),
    B.together([B.focus('token'), B.apply(e, { only: ['token.floodSheet'], blink: false }), B.move('token.floodSheet', { from: { dy: -SHEET_DROP }, to: {}, dur: FLOOD_RISE })]),
    B.together([B.apply(e, { only: ['token.boat'] }), B.move('token.boat', { from: BOAT_OFF, to: BOAT_OFF, dur: 0 }), board(riders)]),
    B.together([row(B, riders), later(BOAT_ROW - OWNER_JUMP, OWNER_JUMP, B.jump(owner, c => floodPerch(c.stage.lv, c.stage.flags), OWNER_JUMP))]),
    B.apply(e, { only: ['token.swimmers', 'boba.owner'] }), B.home(c => [...riders(c), owner(c)].filter(Boolean)),
    B.apply(e), B.focus('home', { hold: END_HOLD }),
  ];
}

// ── 計畫 17 任務 5：大巨蛋淹水、珍奶攤被吹走、鮮奶過期收尾（設計 §4；終局回合 1 倍速，真實秒數；全枚舉裡這三個結局都沒有吹偏局——
//   domeFlood、milkExpired 全是隕石命中，cartBlown 命中或擋下（4 局），所以每段 ≤ 7.0 s；live 量到 3.6、5.1、4.5 s）──
// 第一拍照舊折旗標＋worldNow（命中之後躺平的人站起來）；最後剩下的套用、全景停 END_HOLD。
// 零件照偏移演（offset，同 B.move：userData.showOffset 記目前的偏移，零件的 at 是演完的位置）；glide 是 move 的曲線版：f(k) 回偏移 { dx, dy, dz }，
// turn(o, k) 可以順便轉零件；end 一律擺到 f(1)（跳過也是）
function glide(kind, key, dur, f, turn) {
  let obj = null, base = null;
  const put = k => { const o = f(k); obj.position.set(base.x + o.dx, base.y + o.dy, base.z + o.dz); obj.userData.showOffset = o; turn?.(obj, k); };
  return {
    kind, dur,
    start(c) {
      obj = c.stage.partObject(key); if (!obj) return false;
      const o = obj.userData.showOffset ?? {};
      base = { x: obj.position.x - (o.dx ?? 0), y: obj.position.y - (o.dy ?? 0), z: obj.position.z - (o.dz ?? 0) };
      put(0);
    },
    step(k) { put(k); },
    end() { if (obj) put(1); },
  };
}
const offTo = (p, q) => ({ dx: p.x - q.x, dy: p.y - q.y, dz: p.z - q.z });   // 從 q（零件的 at）看 p 的偏移

// 大巨蛋淹水（約 3.6 s）：鏡頭到球場格，同時第一個球員拉竿（gesture knock，1.0 s）；拉到 KNOCK_LEAD 秒，魚（baseball.fish，不閃白）從泳池水面跳出拋物線
//   （baseball.js fishArc：水平 0.5 往球員那邊、最高 FISH_UP 0.9，FISH_LEAP 秒；魚頭照拋物線的斜率抬起、落水時擺平）→
//   第一個球員「♪」、另一個「！」（Lv1 只有一個球員：找球場格 FAN_R 內最近的島民，沒有就只有「♪」）→ 剩下的套用 → 全景停 END_HOLD
export const KNOCK_LEAD = 0.5, FISH_LEAP = 0.8, FAN_R = 3;
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const fishLeap = () => {
  let arc = null;
  const f = k => ({ dx: (arc.from.x - arc.to.x) * (1 - k), dy: 4 * FISH_UP * k * (1 - k), dz: (arc.from.z - arc.to.z) * (1 - k) });
  // 魚頭朝前進方向、照拋物線的斜率抬起（繞水平、垂直於前進方向的軸）；落水（k = 1）擺平
  const turn = (o, k) => {
    const L = flat(arc.from, arc.to), ux = (arc.to.x - arc.from.x) / L, uz = (arc.to.z - arc.from.z) / L, slope = 4 * FISH_UP * (1 - 2 * k) / L;
    if (k >= 1) o.quaternion.set(0, 0, 0, 1); else o.quaternion.setFromAxisAngle({ x: -uz, y: 0, z: ux }, Math.atan(slope));
  };
  const g = glide('leap', 'baseball.fish', FISH_LEAP, f, turn), start = g.start;
  g.start = c => { arc = fishArc(c.stage.lv.baseball); return start(c); };
  return g;
};
export function domeFloodEpilogue(e, ctx) {
  const { B } = ctx, AT = anchorWorld('baseball');
  const players = c => (c.roster.members('baseball.players') ?? []).filter(m => !m.hidden);
  const angler = c => players(c)[0] ?? null;
  const other = once(c => players(c)[1] ?? islanders(c).filter(m => !m.hidden && flat(m.pos, AT) < FAN_R).sort((a, b) => flat(a.pos, AT) - flat(b.pos, AT))[0] ?? null);
  return [
    B.apply(e, { only: [] }), B.worldNow(),
    B.together([
      B.focus('baseball'), B.gesture(angler, 'knock'),
      later(KNOCK_LEAD, FISH_LEAP, B.together([B.apply(e, { only: ['baseball.fish'], blink: false }), fishLeap()])),
    ]),
    B.together([B.bubble(angler, '♪', TUNE), B.bubble(other, '！', TUNE)]),
    B.apply(e), B.focus('home', { hold: END_HOLD }),
  ];
}

// 珍奶攤被吹走（約 5 s）：鏡頭到珍奶格東北角外的海（SHORE_SHOT：攤車、船的中間），同時小船（boba.boat）在 BOAT_START 閃白出現
//   （零件的 at 是終點 BOAT_END，先用 0 秒的 move 擺到起點的偏移）、老闆沿東岸走到 QUAY（boba.js；照一般走路速度，走不到的就停在最近的可走點）→
//   老闆跳上船（BOAT_HOP 秒，boba.js boatSeat）→
//   船往東划 CART_ROW 秒，老闆每幀照船的位置站在船上；同時攤車（boba.main，不閃白換成漂遠的 CART_END）從 BLOWN 的偏移往東北漂 1.2（CART_ROW 秒，迎向船）；
//   划到 SHOUT_AT 秒老闆「！」→ 老闆的家搬到船上 → 放回日常 → 剩下的套用 → 全景停 END_HOLD
export const BOAT_HOP = 0.5, CART_ROW = 2.0, SHOUT_AT = 1.2;
export const SHORE_ZOOM = 0.4;   // 比格子特寫（0.6）近：船和攤車都小，在格子東北角外的海上
const SHORE_SHOT = { x: (SKIFF_FROM.x + CART_END.x) / 2, y: 0.2, z: (SKIFF_FROM.z + BLOWN.z) / 2 };
const SKIFF_OFF = offTo(SKIFF_FROM, SKIFF_TO);
function rowSkiff(B, who) {
  const mv = B.move('boba.boat', { from: SKIFF_OFF, to: {}, dur: CART_ROW });
  const seat = c => { const o = c.stage.partObject('boba.boat'), m = who(c); if (o && m) c.roster.setPose(m, { ...skiffSeat(o.position), walking: false }); };
  return {
    kind: 'row', dur: CART_ROW,
    start(c) { if (mv.start(c) === false) return false; seat(c); },
    step(k, dt, c) { mv.step(k, dt, c); seat(c); },
    end(c) { mv.end(c); seat(c); },
  };
}
export function cartBlownEpilogue(e, ctx) {
  const { B } = ctx, owner = c => c.roster.members('boba.owner')?.[0] ?? null;
  return [
    B.apply(e, { only: [] }), B.worldNow(),
    B.together([
      B.focus(SHORE_SHOT, { zoom: SHORE_ZOOM }), B.apply(e, { only: ['boba.boat'] }), B.move('boba.boat', { from: SKIFF_OFF, to: SKIFF_OFF, dur: 0 }),
      B.walk(owner, c => c.nav.nearestWalkable(QUAY)),
    ]),
    B.jump(owner, () => skiffSeat(SKIFF_FROM), BOAT_HOP),
    B.together([
      rowSkiff(B, owner), B.apply(e, { only: ['boba.main'], blink: false }), B.move('boba.main', { from: offTo(BLOWN, CART_END), to: {}, dur: CART_ROW }),
      later(SHOUT_AT, SHOUT, B.bubble(owner, '！', SHOUT)),
    ]),
    B.apply(e, { only: ['boba.owner'] }), B.home(c => [owner(c)].filter(Boolean)),
    B.apply(e), B.focus('home', { hold: END_HOLD }),
  ];
}

// 鮮奶過期（約 4.5 s）：鏡頭到鮮奶格，同時 milk.crate 閃白換成過期版（milk.js：箱體 C.sour、兩條腿；零件的 at 是海裡的終點 CRATE_SEA，先用 0 秒的 move 擺回 CRATE）→
//   （R38，使用者 2026-11-05：鮮奶過期現在一定是被老鼠咬住的鮮奶 1，沒有學校也沒有學生，原本學生轉頭「……」那拍拿掉）閃完 → 箱子沿 x 走到西岸格邊（CRATE_BRINK，WADDLE 秒，走 WADDLE_STEPS 步、每步顛 WADDLE_BOB）→
//   往外掉進海裡（CRATE_FALL 秒：水平等速往外、高度加速往下 1.1：島面到水面 0.8 再沉一個腿長，milk.js CRATE_SEA）→ 掉到水面那一刻水花（finale.crateSplash，不閃白）冒出來 → 剩下的套用 → 全景停 END_HOLD
export const WADDLE = 1.5, CRATE_FALL = 0.5, WADDLE_STEPS = 3, WADDLE_BOB = 0.04;
const BRINK_OFF = offTo(CRATE_BRINK, CRATE_SEA), CRATE_OFF = offTo(CRATE, CRATE_SEA);
export function milkExpiredEpilogue(e, ctx) {
  const { B } = ctx;
  const walk = glide('waddle', 'milk.crate', WADDLE, k => ({
    dx: CRATE_OFF.dx + (BRINK_OFF.dx - CRATE_OFF.dx) * k, dy: CRATE_OFF.dy + WADDLE_BOB * Math.abs(Math.sin(Math.PI * WADDLE_STEPS * k)), dz: CRATE_OFF.dz,
  }));
  const fall = glide('fall', 'milk.crate', CRATE_FALL, k => ({ dx: BRINK_OFF.dx * (1 - k), dy: BRINK_OFF.dy * (1 - k * k), dz: BRINK_OFF.dz * (1 - k) }));
  return [
    B.apply(e, { only: [] }), B.worldNow(),
    B.together([
      B.focus('milk'), B.apply(e, { only: ['milk.crate'] }), B.move('milk.crate', { from: CRATE_OFF, to: CRATE_OFF, dur: 0 }),
    ]),
    walk,
    B.together([fall, later(CRATE_FALL, 0, B.apply(e, { only: ['finale.crateSplash'], blink: false }))]),
    B.apply(e), B.focus('home', { hold: END_HOLD }),
  ];
}

// 閃白站上 101 頂（BLINK 秒）：先拿到劇本手上（日常的「不瞬移」不算這一下）、放到 spot(m)（賽博：屋頂 ROOF_SPOTS[i]；外星：鼠群碟緣 SAUCER_SPOTS[i]、鼠王碟頂 SHIP_SPOT）、閃白；
// 之後 B.home 放回日常（stand 已在站位上，站定）
function roof(who, spot) {
  return {
    kind: 'roof', dur: BLINK,
    start(c) {
      const list = who(c); if (!list.length) return false;
      for (const m of list) {
        c.roster.claim(m); c.roster.setPose(m, { ...spot(m), walking: false });
        if (m.holder) c.blink.part(m.holder); else if (m.walker) c.blink.walker(m.walker);
      }
    },
  };
}
