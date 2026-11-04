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
//   hit 砸進 101 中段、101 彎成 L（tower.js body bent）、全島躺平比讚（worldEffects mood 'lie'）。
// 任務 6：賽博尾聲（設計 §7）——天黑、霓虹（燈泡 Lv9 早就開到 NEON_BOOST）→ 101 閃白換成黑塔＋頂端螢幕（tower.js）→ 第四台飛天車（紅色，finale.car，orbit 零件）
//   從海上飛進來繞 101 一圈、停上黑塔屋頂；機器鼠軍團閃白出現在屋頂排兩排（rat.js ROOF_SPOTS）→ 全景停 1.5 秒。
// 任務 7：外星尾聲（設計 §7）——鏡頭對溫泉格，變異鼠王對天揮手＋「！」→ 鏡頭推到石堆島（裁決 R5：石堆島在全景畫面外，
//   16:9 島心 NDC (0.91, −1.08)、直式整座出畫）：綠光圈閃白變降落場（satellites.js）→
//   三台 UFO（finale.ufos，一個 compound 三個碟）從天上降到降落場 2 秒 → 三個外星生物（finale.aliens）閃白出現在 UFO 和主島之間 →
//   回全景 → 101 閃白變母艦（tower.js ship）→ 全島小人長出第三隻眼（worldEffects mood 'alien'）→ 變異鼠王閃白坐上碟頂（rat.js SHIP_SPOT）＋「♥」→ 全景停 1.5 秒。
//   唯一正解（2026-10-31 §4.5）：外星改成壞結局「變異鼠稱王」（畫面就是老鼠 Lv4 外星型態＋石堆島綠光圈＋小 UFO）；
//   計畫 17（2026-11-04）壞結局也接收尾（任務 1 先只套用），任務 4 把這段改成災難版接進 script.epilogue（外星局 test/helpers/endings.js EXAMPLE.alien）。
// 計畫 17 任務 3：大停電（漆黑、只剩 101 塔尖的警示燈 finale.beacon 從慢閃變快閃）與捷運淹水（捷運格淹水、小船載兩個泳客划到東南岸、
//   珍奶老闆跳上攤車頂）的收尾，見 blackoutEpilogue、floodEpilogue。
import { lookUp, crowd, islanders } from '../show/crowd.js';
import { anchorWorld, landmarkWorld } from './anchors.js';
import { SHIELD_R, stageOfView, body as towerBody, bendPoint } from './tower.js';
import { ROOF_SPOTS, SHIP_SPOT, UFO_PARTS } from './rat.js';
import { island, ROCKS_HOME_A as HOME_A } from './satellites.js';
import { BLINK } from '../show/blink.js';
import { TIMES } from '../scene/daynight.js';
import { NEON_BOOST } from './world.js';
import { C } from './palette.js';
import { roadsterParts, BOAT_FROM, BOAT_TO, boatSeat, SHEET_DROP } from './token.js';
import { floodPerch } from './boba.js';
import { SHIELD_FAIL_DUR } from './parts.js';
import { FOCUS_BEAT } from '../show/beats.js';
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
// 煙火：霓虹粉、霓虹藍、黃、珊瑚
const FIREWORKS = [C.neonPink, C.neonBlue, C.yellow, C.coral];

// ── 賽博尾聲（設計 §7）──
// 紅色飛天跑車：代幣 Lv10 那台 Tesla Roadster 的同一個模型（token.js roadsterParts，車身 C.red；parts.js orbit；?quality=low 不畫，裁決照舊）。
// 從鏡頭右前方的海上（CAR_FROM）飛進來，在 101 頂上（點燈的塔頂 + 0.6）半徑 1.4 繞一圈，進出圈都在鏡頭那側（phase π/2，+z），
// 停到黑塔屋頂前緣正中（CAR_PARK_Z；後面是兩排機器鼠）；沒有 rest：停好就不再起飛（標題卡前畫面要定住）。
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
export const UFO_N = 3, UFO_R = 1.2, UFO_Y = 0.85, UFO_DROP = 7, UFO_FALL = 2.0;
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
// 外星尾聲的真實秒數：揮手 1.0、「！」0.8、回全景停 0.8、「♥」0.9、最後全景停 END_HOLD
const WAVE = 1.0, ALIEN_HOLD = 0.8, LOVE = 0.9;

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
    v['finale.missile'] = { kind: 'missile', at, from: STAR_AT, outcome: o, footprint: false, shadow: false };
    if (o === 'deflect') {
      v['finale.missile'].via = { x: TOWER.x + toStar.hx * SIDESTEP, y: TOWER.y + towerBody(stage).top, z: TOWER.z + toStar.hz * SIDESTEP };
      // 池邊冒一下水花：白煙 4 團、短（smoke 會一直循環，留到標題卡也無妨）
      v['finale.splash'] = { kind: 'smoke', at: POOL, n: 4, color: 0xffffff, size: 0.3, rise: 0.6, footprint: false };
    }
  }
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
//   hit：to1 = 彎角高度、塔的西側面外 ROCK_R × 0.5（咬進塔面；修正輪 1，以前卡在北面被塔身擋住）；之後停在那裡（終態）。
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
    if (outcome === 'hit') return fly(1);
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
  // 建好即終態（t = Infinity：shield 藏起來、煙火放完；hit 卡在彎角；deflect 落在池裡）——跳過、reduced-motion、截圖、舞台重建零件都直接看到結果。
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
    const end = FLIGHT + (spec.outcome === 'deflect' ? DEFLECT : 0);   // 軌跡演完（之後 path 回的都是終態）
    const put = () => {
      const p = path(t);
      body.visible = p.visible; body.position.set(p.x - at.x, p.y - at.y, p.z - at.z);
      body.quaternion.setFromUnitVectors(Z, dir.set(p.d.x, p.d.y, p.d.z)).multiply(roll.setFromAxisAngle(Z, p.spin));
      trail.visible = t < end;   // 落地（終態）就熄掉
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
    kind: 'later', dur: delay + dur,
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

// 試升失敗（計畫 17 任務 2）：tower.shield 套上 fail 狀態（tower.js：alarm、晶片 7–8、還沒落下）並從 0 演 shieldPose('fail')
// （升到 0.6 倍、閃兩下、縮回藏起來，SHIELD_FAIL_DUR）——跟晶片 Lv8 的矽盾測試同一個零件介面（userData.test／finish）；
// 同時天線環（tower.antenna）閃白一下（blink.part）。鏡頭停在 WIDE，101 與罩子都在畫面裡。演完零件藏著，隕石落下時 view 就拿掉
export const FAIL_WAIT = 0.2;
const blinkPart = key => ({ kind: 'blinkPart', key, dur: 0, start(c) { const o = c.stage.partObject(key); if (!o || !c.blink) return false; c.blink.part(o); } });
const shieldFail = (B, e) => Object.assign(B.together([
  B.replay(e, 'tower.shield', SHIELD_FAIL_DUR, {
    begin: (o, c) => { if (!o.userData.test) return false; o.userData.test({ speed: c.speed ?? 1 }); return true; }, finish: o => o.userData.finish?.(),
  }),
  blinkPart('tower.antenna'),
]), { name: 'shieldFail' });
// 抬頭看天：101 頭頂（stage.headOf）與光點的中點，警告時鏡頭先對這裡（光點、警示燈、塔頂都在畫面裡；全景看不到天空）
export const skyShot = c => { const h = c.stage.headOf('tower'); return { x: (h.x + STAR_AT.x) / 2, y: (h.y + STAR_AT.y) / 2, z: (h.z + STAR_AT.z) / 2 }; };
export const script = {
  // 警告（終局回合第一個事件，選擇帶動升級 §4；原本倒數 3 的宣告去掉數字；trim §C 光點搬到天上）：光點與 101 頂上的警示燈一起出現，
  // 同時鏡頭抬頭看天（skyShot，FOCUS_BEAT 0.8 s）→ 停 SKY_HOLD → 鏡頭退到 WIDE、全島（最多 24 人）轉頭看光點 1.2 s（鏡頭在這段飛過去）→
  // 同一批人頭上一起冒「！」、蹲下護頭（duck）0.8 s → 放回日常。終局回合 1 倍速，秒數就是真實秒數（約 3.2 s）。
  // 「！」等鏡頭到 WIDE 才冒（chain.test 的字在畫面裡不變式：天空鏡頭裡島整座出畫）
  // 計畫 17 任務 2：晶片 7–8（矽盾還沒好；晶片 9 規則上就是擋下）在全島抬頭之後、「！」之前插一段試升失敗 shieldFail（見下面），再停 FAIL_WAIT
  warning(e, s, ctx) {
    const { B } = ctx, up = lookUp(B, STAR_AT, LOOK), chip = s.lv?.chip;
    const fail = chip === 7 || chip === 8 ? [shieldFail(B, e), B.wait(FAIL_WAIT)] : [];
    return [
      B.together([B.apply(e, { only: ['finale.star', 'finale.beacon'] }), B.focus(skyShot, { zoom: SKY_ZOOM })]), B.wait(SKY_HOLD),
      B.together([B.focus(WIDE, { zoom: WIDE_ZOOM }), ...up.look]), ...fail, B.together([...up.say('！', SHOUT), ...up.act('duck', DUCK)]), up.release,
    ];
  },
  // 隕石（設計 §6，真實秒數，終局回合 1 倍速）：鏡頭在 WIDE（警告已經停在那裡，這拍 0.8 s 當停頓）→ 光點熄掉 →
  //   隕石從光點的位置由上往下落（replay：套用零件、launch 重落），落到一半全島（最多 24 人，演到才點名、整段同一批人）冒「！」→
  //   結果 → 套上剩下的 → 放人回日常 → 回全景停 HOLD_END（後面接收尾時不停：e.epilogue，計畫 17 任務 3 裁決）。
  //   shield：罩子切 full（閃白就是那一下亮），隕石撞上罩子碎成煙火；全島原地跳＋♥。
  //   deflect：第二段 DEFLECT 秒被風吹偏、掉進溫泉（同一個 replay 拍裡）→ 水花 → 全島「？」再「♪」。
  //   hit：101 換成彎 L 的塔身、天線／燈光秀／罩子拿掉（閃白）→ 全島躺平（world 拍只帶 mood，app 合進目前的全島效果；
  //   回合收尾的 world 拍照舞台旗標再算一次，一樣是 lie）。
  //   replay 的 finish 只在跳過（ctx.instant）時跳到終態：live 時拍演完零件自己還在演（煙火撞上罩子才放、放 1.2 秒）
  missile(e, s, ctx) {
    const { B } = ctx, o = e.outcome, flight = FLIGHT + (o === 'deflect' ? DEFLECT : 0);
    let list = null;
    const people = c => (list ??= islanders(c).slice(0, CROWD));
    const all = fn => crowd(B, c => people(c).flatMap(fn));
    const fly = B.replay(e, 'finale.missile', flight, {
      begin: (m, c) => { if (!m.userData.launch) return false; m.userData.launch({ speed: c.speed ?? 1 }); return true; },
      finish: (m, c) => { if (c?.instant) m.userData.finish(); },
    });
    const lead = [B.focus(WIDE, { zoom: WIDE_ZOOM }), B.apply(e, { only: ['finale.star'] }), B.together([fly, later(FLIGHT / 2, SHOUT, all(m => [B.bubble(m, '！', SHOUT)]))])];
    // 後面接收尾（e.epilogue，game.js finaleEvents；計畫 17 任務 3 裁決）：不回全景停 HOLD_END——收尾第一拍自己平移鏡頭（終局 ≤ 16 s 的預算）
    const tail = [B.apply(e), B.home(() => list ?? []), ...(e.epilogue ? [] : [B.focus('home', { hold: HOLD_END })])];
    if (o === 'shield') return [...lead, B.apply(e, { only: ['tower.shield'] }), all(m => [B.gesture(m, 'jump', CHEER), B.bubble(m, '♥', CHEER)]), ...tail];
    if (o === 'deflect') return [...lead, B.apply(e, { only: ['finale.splash'] }), all(m => [B.bubble(m, '？', HUH)]), all(m => [B.bubble(m, '♪', TUNE)]), ...tail];
    return [...lead, B.apply(e, { only: ['tower.main', 'tower.antenna', 'tower.show', 'tower.shield'] }), B.worldNow(), ...tail];   // 心情照 world.js 的規則重算（單一來源，最終審稿）
  },
  // 賽博（設計 §7，≤ 12 秒真實，終局回合 1 倍速）：夜晚＋霓虹（world 拍只帶 time／glowScale，app 合進目前的全島效果；
  //   賽博一定是燈泡 Lv9，glowScale 早就是 NEON_BOOST、時間多半也已是夜晚——這拍不會更亮，只是保證尾聲是夜晚霓虹）→
  //   黑塔、燈光秀、天線、螢幕閃白換上 → 紅車飛一趟（replay：套用零件、fly 從海上重飛；跳過時 land 直接停好），
  //   → 機器鼠的家搬上屋頂（apply）、閃白放上站位（roof 拍；屋頂在 101 的 footprint 裡走不上去）→
  //   放回日常（站定在屋頂）→ 剩下的套用 → 全景停 1.5 秒。最前面先回全景（隕石停在 WIDE，見下面）。外星尾聲在下面的 alienEpilogue()（計畫 17 任務 4 接回 dispatch）
  epilogue(e, s, ctx) {
    const { B } = ctx;
    // 計畫 17：壞結局各自的收尾。任務 3：大停電、捷運淹水（blackoutEpilogue、floodEpilogue，見下面）。
    // 其餘的壞結局先只套用（之後的任務各自換成自己的劇本；外星由任務 4 以下面的 alienEpilogue 為底改成災難版）
    if (e.ending === 'blackout') return blackoutEpilogue(e, ctx);
    if (e.ending === 'flood') return floodEpilogue(e, ctx);
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

// 外星（設計 §7，≤ 12 秒真實，終局回合 1 倍速；外星是壞結局，計畫 17 任務 4 以這段為底改成災難版再接進 script.epilogue，見檔頭；
//   匯出給任務 4 與 finale.test——測試從真的外星局 live 演這段）：鏡頭對溫泉格，變異鼠王（名冊 rat.pack 唯一一隻，演到才點名）對天揮手＋「！」→
//   鏡頭推到石堆島（裁決 R5；focus 的點用 worldToAxial 反算格子，衛星島也算得出格子，點直接交給 rig.focus）→ 降落場閃白（綠光圈換成更亮的圈＋三盞燈、石堆兩隻老鼠閃白拿掉）→ 三台 UFO 不閃白套上、從 7 高降下來 2 秒 →
//   外星生物閃白 → 回全景停 0.8 → 母艦閃白（塔身、天線、燈光秀；罩子沒變）→ 全島第三隻眼（world 拍只帶 mood，回合收尾的 world 拍照舞台旗標也是 alien）→
//   老鼠的家搬上碟頂（apply）、閃白放上去（roof 拍：碟頂在 101 的 footprint 上面，走不上去）→ 放回日常 → 剩下的套用（小 UFO 拿掉）→
//   「♥」→ 全景停 1.5 秒
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };
export function alienEpilogue(e, ctx) {
  const { B } = ctx, king = once(c => c.roster.members('rat.pack')?.[0]), kings = c => [king(c)].filter(Boolean);
  return [
    B.focus(SPRING), B.together([B.gesture(king, 'wave', WAVE), B.bubble(king, '！', SHOUT)]),
    B.focus(ROCKS), B.apply(e, { only: ['sat.rocksRing', 'sat.rocks'] }),
    B.apply(e, { only: ['finale.ufos'], blink: false }), B.move('finale.ufos', { from: { dy: UFO_DROP }, to: {}, dur: UFO_FALL }),
    B.apply(e, { only: ['finale.aliens'] }), B.focus('home', { hold: ALIEN_HOLD }),
    B.apply(e, { only: ['tower.main', 'tower.antenna', 'tower.show', 'tower.shield'] }), B.worldNow(),
    B.apply(e, { only: ['rat.pack'] }), roof(kings, () => SHIP_SPOT), B.home(kings),
    B.apply(e), B.bubble(king, '♥', LOVE), B.focus('home', { hold: END_HOLD }),
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

// 閃白站上 101 頂（BLINK 秒）：先拿到劇本手上（日常的「不瞬移」不算這一下）、放到 spot(m)（賽博：屋頂 ROOF_SPOTS[i]；外星：碟頂 SHIP_SPOT）、閃白；
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
