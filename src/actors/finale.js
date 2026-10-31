// 最終章（計畫 5，設計 §3、§9；選擇帶動升級 2026-10-28 §4 改版）：飛彈警告、飛彈、真結局尾聲——都不是物品，是遊戲層合成的事件。
// 遊戲層（game.js）在第 8 個放完、最後一輪（一般回合）演完之後演一個終局回合：最前面 warning 事件（game.js WARNING，flag alarm = 1），
// 接 missile 事件（flag missile = shield／deflect／hit），真結局再接 epilogue（flag epilogue = 結局 id）。
// 旗標只折進舞台（stage.flags，foldEvent 照 e.flag 折），引擎狀態不碰。turn.js 把這三種事件的劇本交給這個模組（script[e.kind]）。
// 警告（選擇帶動升級 §4；原本倒數 3 的宣告去掉數字）——終局回合一開頭，鏡頭對面遠方的海平面亮起紅光（finale.flare），
// 全島抬頭看、冒「！」；紅光以固定 FLARE_HZ 脈動，飛彈發射時熄掉（flags.missile 一設就不畫）。
// 任務 5：飛彈（設計 §6）——紅光熄掉、飛彈從紅光的位置沿拋物線飛向 101（零件自己演：userData.launch），三種結果：
//   shield 罩子全亮、飛彈碎成一發煙火、全島跳＋♥；deflect 飛到 101 旁被風吹歪、邊轉邊掉、機頭朝下插進北投溫泉、水花、全島？再♪；
//   hit 撞進 101 中段、101 彎成 L（tower.js body bent）、全島躺平比讚（worldEffects mood 'lie'）。
// 任務 6：賽博尾聲（設計 §7）——天黑、霓虹（燈泡 Lv9 早就開到 NEON_BOOST）→ 101 閃白換成黑塔＋頂端螢幕（tower.js）→ 第四台飛天車（紅色，finale.car，orbit 零件）
//   從海上飛進來繞 101 一圈、停上黑塔屋頂；飛到後半螢幕上冒跑馬燈泡泡 → 機器鼠軍團閃白出現在屋頂排兩排（rat.js ROOF_SPOTS）→ 全景停 1.5 秒。
// 任務 7：外星尾聲（設計 §7）——鏡頭對溫泉格，變異鼠王對天揮手＋「！」→ 鏡頭推到石堆島（裁決 R5：石堆島在全景畫面外，
//   16:9 島心 NDC (0.91, −1.08)、直式整座出畫）：綠光圈閃白變降落場（satellites.js）→
//   三台 UFO（finale.ufos，一個 compound 三個碟）從天上降到降落場 2 秒 → 三個外星生物（finale.aliens）閃白出現在 UFO 和主島之間 →
//   回全景 → 101 閃白變母艦（tower.js ship）→ 全島小人長出第三隻眼（worldEffects mood 'alien'）→ 變異鼠王閃白坐上碟頂（rat.js SHIP_SPOT）＋「♥」→ 全景停 1.5 秒。
//   唯一正解（2026-10-31 §4.5）：外星改成壞結局「變異鼠稱王」（畫面就是老鼠 Lv4 外星型態＋石堆島綠光圈＋小 UFO），只有 cyber 演尾聲——
//   外星尾聲在單一正解下到不了。劇本、零件、母艦都留著（之後給圖鑑）；測試只驗 view（finale.test），沒有測試演這段劇本。
import { lookUp, crowd, islanders } from '../show/crowd.js';
import { anchorWorld, landmarkWorld } from './anchors.js';
import { SHIELD_R, stageOfView, body as towerBody, bendPoint } from './tower.js';
import { ROOF_SPOTS, SHIP_SPOT, UFO_PARTS } from './rat.js';
import { island, ROCKS_HOME_A as HOME_A } from './satellites.js';
import { BLINK } from '../show/blink.js';
import { TIMES } from '../scene/daynight.js';
import { NEON_BOOST } from './world.js';
import { C } from './palette.js';
import { roadsterParts } from './token.js';

export const id = 'finale';

// 警告：全島抬頭看紅光 1.2 秒、頭上「！」0.8 秒、再一起蹲下護頭 DUCK 秒（真實秒數；終局回合 1 倍速）；鏡頭先拉到 101 的 zoom
export const LOOK = 1.2, SHOUT = 0.8, DUCK = 0.8, TOWER_ZOOM = 0.9;   // DUCK 1.0 → 0.8（修正輪 1：吹歪的終局只剩 0.7 s）

// 紅光的位置：鏡頭對面（全景沿 −z 看過去）主島西北方、背景環山山腳前的海面上。
// 設計 §4 寫「背景山之外」，但環山（terrain.js 半徑 25–50 隆起、遠側不壓低）山脊以外的點在 16:9 全景一律投影到 NDC y > 1（出畫），
// 所以退到山腳前的海面（地形 y −0.6）、往 −x 偏開 101（16:9 全景裡 101 就在畫面正中，紅光放 x −6 會被塔身擋住）。
// 實測（點燈天際線 7.75）：16:9 NDC (−0.24, 0.61)、390×844 (−0.60, 0.39)；工地天際線 ≤ 3：16:9 (−0.27, 0.87)、390×844 (−0.70, 0.58)；
// 沿視線到鏡頭都不被地形擋（帶 app.js 的雜訊取樣）
export const FLARE_AT = { x: -12, y: 2.5, z: -23 };
export const FLARE_COLOR = 0xff5a3c, FLARE_R = 0.9, COLUMN_H = 6;
// 脈動頻率（選擇帶動升級 §4：固定 2 Hz；以前倒數 3／2／1 越閃越快）
export const FLARE_HZ = 2;
// 101 頂上的警示燈（計畫 13 §設計 5，使用者 2026-11-01「飛彈發射過來前的警告請優化呈現方式」）：塔尖上 BEACON_UP 一顆紅球（半徑 BEACON_R）
// ＋一道從球心往外 BEAM_L 長的扁平紅光束，繞 y 軸每秒 BEACON_REV 圈；亮度跟紅光同一個 FLARE_HZ 脈動。
// 計畫寫「headOf('tower') 之上 0.15」：headOf 是泡泡的位置、比塔尖高 0.6（LABEL_UP），燈會飄在半空——改放塔尖（這一階段塔身的 top）之上 0.15
export const BEACON_UP = 0.15, BEACON_R = 0.12, BEAM_L = 3, BEACON_REV = 1;
const BEACON_RED = C.red;

// ── 飛彈（設計 §6）──
// 真實秒數：拋物線飛 FLIGHT 秒；deflect 的第二段（被風吹歪、邊轉邊掉進溫泉）DEFLECT 秒；結果演完回全景停 HOLD_END 秒
export const FLIGHT = 2.5, DEFLECT = 1.2, HOLD_END = 1.0;
// 拋物線 p(k) = lerp(from, to, k) + up · LOB · sin(πk)，k = t / FLIGHT
export const LOB = 2;
// 機身：紅白紅三節圓柱（半徑 0.18、長 1.2，沿 +z）＋圓頭（機頭尖在中心前 NOSE_TIP）
export const NOSE_TIP = 0.78;
const MISSILE_R = 0.18, HALF = 0.6, RED = 0xe8322e;
const TOWER = anchorWorld('tower'), SPRING = landmarkWorld('spring');
// 矽盾罩面上的撞點：從 101 底座中心朝紅光（xz）方向、仰角 55°
const DOME_EL = 55 * Math.PI / 180;
const toFlare = (() => { const dx = FLARE_AT.x - TOWER.x, dz = FLARE_AT.z - TOWER.z, L = Math.hypot(dx, dz); return { x: dx / L, z: dz / L }; })();
const DOME_HIT = { x: TOWER.x + toFlare.x * SHIELD_R * Math.cos(DOME_EL), y: TOWER.y + SHIELD_R * Math.sin(DOME_EL), z: TOWER.z + toFlare.z * SHIELD_R * Math.cos(DOME_EL) };
// 溫泉池中心、池面上 0.1（池水 cylinder 頂在 landmark 上 0.13）
const POOL = { x: SPRING.x, y: SPRING.y + 0.1, z: SPRING.z };
// deflect 被吹歪的點：101 塔頂旁、朝紅光那側 1.5
const SIDESTEP = 1.5;
// 命中：機頭尖插進塔面（方錐台半寬 0.58）BURY_TOWER；吹歪：機頭朝下斜 TILT 插進池裡 BURY_POOL，尾巴露在外面
const TOWER_HALF = 0.58, BURY_TOWER = 0.3, BURY_POOL = 0.35, TILT = 30 * Math.PI / 180;
// 煙火：霓虹粉、霓虹藍、黃、珊瑚
const FIREWORKS = [C.neonPink, C.neonBlue, C.yellow, C.coral];

// ── 賽博尾聲（設計 §7）──
// 紅色飛天跑車：代幣 Lv10 那三台 Tesla Roadster 的同一個模型（token.js roadsterParts，車身 C.red；parts.js orbit；?quality=low 不畫，裁決照舊）。
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
export const MARQUEE = '飛天跑車今日抵台，先付清 755 萬';
// 跑馬燈：起飛後 MARQUEE_AT 秒冒、停 MARQUEE_DUR 秒（跟飛行後半重疊，剛好在車停好時收掉）；最後全景停 END_HOLD 秒
const MARQUEE_AT = 1.5, MARQUEE_DUR = 3.0, END_HOLD = 1.5;

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

export function view(lv, flags = {}, meta = {}) {
  const v = {};
  // 飛彈一發射紅光就熄（設計 §4、§6）；alarm 只會是 1（警告）。脈動頻率固定 FLARE_HZ（builders.flare）
  if (flags.alarm && !flags.missile) {
    v['finale.flare'] = { kind: 'flare', at: FLARE_AT, shadow: false, footprint: false };
    // 警示燈：101 的階段照 tower.js 的算法（stageOfView），站在這一階段的塔尖上
    v['finale.beacon'] = { kind: 'beacon', at: { x: TOWER.x, y: TOWER.y + towerBody(stageOfView(lv, meta)).top + BEACON_UP, z: TOWER.z }, shadow: false, footprint: false };
  }
  const o = flags.missile;
  if (o) {
    // 101 的階段照 tower.js 的算法（stageOfView：meta.total，沒給才自己加總）：deflect 的塔頂跟著塔身；
    // hit 的彎角照這一階段（tower.js bendPoint：蓋一半彎得低、工地打在底座）
    const stage = stageOfView(lv, meta);
    const at = o === 'shield' ? DOME_HIT : o === 'hit' ? bendPoint(stage) : POOL;
    v['finale.missile'] = { kind: 'missile', at, from: FLARE_AT, outcome: o, footprint: false, shadow: false };
    if (o === 'deflect') {
      v['finale.missile'].via = { x: TOWER.x + toFlare.x * SIDESTEP, y: TOWER.y + towerBody(stage).top, z: TOWER.z + toFlare.z * SIDESTEP };
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

// 飛彈的軌跡（純函式）：missilePath(spec) → t => { x, y, z（機身中心，世界座標）, d（機頭方向，單位向量）, spin（繞機身軸轉幾弧度）, visible }。
// 第一段（0 ≤ t < FLIGHT）：拋物線從 from 到 to1，機頭朝速度方向（dp/dk = to1 − from + up · LOB · π · cos(πk)）。
//   shield：to1 = 罩面撞點；之後藏起來（煙火由零件放）。
//   hit：to1 = 讓機頭尖插進塔面 BURY_TOWER 的機身中心（方向用飛到 at 的末速度估）；之後停在那裡（終態）。
//   deflect：to1 = via（塔頂旁）；第二段 DEFLECT 秒：水平等速、高度先被風抬一下再加速往下掉到池裡，機頭從末速度轉到朝下斜 30°、
//   邊掉邊繞機身轉兩圈；終態機頭朝下插進池裡 BURY_POOL、尾巴往 via 那側翹出水面。t = Infinity 就是終態（建好即飛完）
const v3 = (x, y, z) => ({ x, y, z });
const plus = (a, b, k = 1) => v3(a.x + b.x * k, a.y + b.y * k, a.z + b.z * k);
const minus = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const unit = a => { const L = Math.hypot(a.x, a.y, a.z); return v3(a.x / L, a.y / L, a.z / L); };
const mix = (a, b, k) => v3(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
const smooth = k => k * k * (3 - 2 * k);
export function missilePath(spec) {
  const { from, at, outcome } = spec;
  const lobAt = (to, k) => plus(mix(from, to, k), v3(0, LOB * Math.sin(Math.PI * k), 0));
  const lobDir = (to, k) => unit(plus(minus(to, from), v3(0, LOB * Math.PI * Math.cos(Math.PI * k), 0)));
  let to1 = at;
  if (outcome === 'hit') {
    const d0 = lobDir(at, 1), h = unit(v3(d0.x, 0, d0.z));
    to1 = plus(plus(at, h, -(TOWER_HALF - BURY_TOWER)), d0, -NOSE_TIP);
  } else if (outcome === 'deflect') to1 = spec.via;
  const end1 = lobDir(to1, 1), fly = k => ({ ...lobAt(to1, k), d: lobDir(to1, k), spin: 0, visible: true });
  // deflect 的終態：機頭方向 down（水平分量朝 via → 池的方向、跟垂直夾 TILT），機頭尖在池面下 BURY_POOL
  let down = null, rest = null;
  if (outcome === 'deflect') {
    const h = unit(v3(at.x - to1.x, 0, at.z - to1.z));
    down = unit(v3(h.x * Math.sin(TILT), -Math.cos(TILT), h.z * Math.sin(TILT)));
    rest = plus(plus(at, down, BURY_POOL), down, -NOSE_TIP);
  }
  return t => {
    if (t < FLIGHT) return fly(Math.max(0, t) / FLIGHT);
    if (outcome === 'shield') return { ...at, d: end1, spin: 0, visible: false };
    if (outcome === 'hit') return fly(1);
    const u = t - FLIGHT;
    if (u >= DEFLECT) return { ...rest, d: down, spin: 0, visible: true };
    const k = u / DEFLECT, p = mix(to1, rest, k);
    return { x: p.x, y: to1.y + (rest.y - to1.y) * k * k + 0.8 * Math.sin(Math.PI * k), z: p.z, d: unit(mix(end1, down, smooth(k))), spin: 4 * Math.PI * k, visible: true };
  };
}

// 機身零件（沿 +z、中心在原點）：紅白紅三節、紅色圓頭、三片白尾翼、圓頭上兩顆白眼睛＋墨色瞳孔、眼睛上方一條皺成 V 的墨色眉毛（兩截）。
// 全部是黏土色、不發光：compound 併成一個 mesh（手機畫質也一樣，一個 draw call）
const D = 2 * MISSILE_R, ALONG_Z = [Math.PI / 2, 0, 0];
const MISSILE_PARTS = [
  { kind: 'cylinder', pos: [0, 0, -0.4], scale: [D, 0.4, D], rot: ALONG_Z, color: RED },
  { kind: 'cylinder', pos: [0, 0, 0], scale: [D, 0.4, D], rot: ALONG_Z, color: C.white },
  { kind: 'cylinder', pos: [0, 0, 0.4], scale: [D, 0.4, D], rot: ALONG_Z, color: RED },
  { kind: 'sphere', pos: [0, 0, HALF], scale: D, color: RED },
  // 尾翼：一片朝上、兩片朝左右下（120° 間隔），薄板沿機身
  ...[0, 2 * Math.PI / 3, -2 * Math.PI / 3].map(a => ({ kind: 'box', pos: [Math.sin(a) * 0.29, Math.cos(a) * 0.29, -0.48], scale: [0.03, 0.22, 0.26], rot: [0, 0, -a], color: C.white })),
  ...[-1, 1].flatMap(s => [
    { kind: 'sphere', pos: [s * 0.065, 0.06, 0.72], scale: 0.11, color: C.white },
    { kind: 'sphere', pos: [s * 0.062, 0.056, 0.772], scale: 0.055, color: C.ink },
    { kind: 'box', pos: [s * 0.048, 0.128, 0.735], scale: [0.075, 0.02, 0.03], rot: [0, 0, s * 0.45], color: C.ink },   // 內側低、外側高：皺眉
  ]),
];

export const builders = {
  // 外星生物：三個一個 compound（不投影），整群面向主島、一起上下漂 ±BOB（每 π 秒一個來回）
  aliens(THREE, spec, ctx) {
    const part = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: alienParts(), shadow: false }), object = new THREE.Group();
    object.add(part.object); object.rotation.y = spec.yaw ?? 0;
    return { object, materials: part.materials, update(dt, t) { part.object.position.y = BOB * Math.sin(t * 2); }, dispose: part.dispose };
  },
  // 紅光：發光的球（r 0.9）＋一道從海面往上的淡淡光柱（高 6、半透明、不寫深度）。不投影、不收影（遠方的光，不是實體）。
  // 自己建材質（不走 compound 的 glow 分組）：手機畫質（quality low）compound 會把發光併進 clay，紅光就不亮了。
  // 強度照 tower.js 矽盾天線的作法：底強度 1.2 不跟夜晚歸零（白天也看得到）＋ ctx.glow.intensity，再乘脈動。
  // 光柱：從海面（球心下 FLARE_AT.y + 0.18 ≈ 2.7）往上，總高 COLUMN_H
  flare(THREE, spec, ctx) {
    const object = new THREE.Group();
    const orbMat = new THREE.MeshStandardMaterial({ color: FLARE_COLOR, emissive: FLARE_COLOR, roughness: 0.6, metalness: 0 });
    const beamMat = new THREE.MeshBasicMaterial({ color: FLARE_COLOR, transparent: true, opacity: 0.35, depthWrite: false });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(FLARE_R, 20, 14), orbMat);
    const bottom = -(spec.at.y + 0.18), beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, COLUMN_H, 14, 1, true), beamMat);
    beam.position.y = bottom + COLUMN_H / 2;
    orb.name = 'orb'; beam.name = 'beam';
    for (const m of [orb, beam]) { m.castShadow = m.receiveShadow = false; object.add(m); }
    const pose = t => {
      const k = (1 + Math.sin(t * Math.PI * 2 * FLARE_HZ)) / 2;
      orbMat.emissiveIntensity = (1.2 + ctx.glow.intensity) * (0.35 + 0.65 * k);
      beamMat.opacity = 0.15 + 0.3 * k;
    };
    pose(0);
    return {
      object, materials: [orbMat], update(dt, t) { pose(t); },
      dispose() { orb.geometry.dispose(); beam.geometry.dispose(); orbMat.dispose(); beamMat.dispose(); },
    };
  },
  // 警示燈：紅球（'lamp'）＋扁平光束（'beam'：圓錐殼從球心往 +x 張開到半徑 0.35、再壓扁成 0.25 倍高，雙面、半透明、不寫深度），
  // 光束繞 y 每秒 BEACON_REV 圈。跟紅光一樣自己建材質、底強度 1.2 不跟夜晚歸零（白天也看得到、手機畫質照亮），再乘 FLARE_HZ 脈動；不投影
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
    pose(0);
    return {
      object, materials: [lampMat], update(dt, t) { pose(t); },
      dispose() { lamp.geometry.dispose(); beam.geometry.dispose(); lampMat.dispose(); beamMat.dispose(); },
    };
  },
  // 飛彈：Group 在 at（撞點），機身 compound（'body'）照 missilePath 擺；shield 多帶一發煙火（parts.js fireworks once，'fireworks'），
  // 飛完（t ≥ FLIGHT）那一刻放。建好即終態（t = Infinity：shield 藏起來、煙火放完；hit 卡在彎角；deflect 插在池裡）——
  // 跳過、reduced-motion、截圖、舞台重建零件都直接看到結果。
  // object.userData.launch({ speed })：時鐘歸零、從紅光重飛（劇本的 replay 拍叫；speed 演出倍速）；finish()：跳到終態（跳過）
  missile(THREE, spec, ctx) {
    const object = new THREE.Group(), at = spec.at, path = missilePath(spec), origin = { x: 0, y: 0, z: 0 };
    const body = ctx.build({ kind: 'compound', at: origin, parts: MISSILE_PARTS, shadow: false });
    body.object.name = 'body'; object.add(body.object);
    const fw = spec.outcome === 'shield' ? ctx.build({ kind: 'fireworks', at: origin, once: true, colors: FIREWORKS }) : null;
    if (fw) { fw.object.name = 'fireworks'; object.add(fw.object); }
    const Z = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3(), roll = new THREE.Quaternion();
    let t = Infinity, rate = 1, popped = true;
    const end = FLIGHT + (spec.outcome === 'deflect' ? DEFLECT : 0);   // 軌跡演完（之後 path 回的都是終態）
    const put = () => {
      const p = path(t), o = body.object;
      o.visible = p.visible; o.position.set(p.x - at.x, p.y - at.y, p.z - at.z);
      o.quaternion.setFromUnitVectors(Z, dir.set(p.d.x, p.d.y, p.d.z)).multiply(roll.setFromAxisAngle(Z, p.spin));
      if (fw && !popped && t >= FLIGHT) { popped = true; fw.object.userData.burst(); }
    };
    object.userData.launch = ({ speed = 1 } = {}) => { t = 0; rate = speed; popped = false; fw?.object.userData.finish(); put(); };
    object.userData.finish = () => { t = Infinity; popped = true; fw?.object.userData.finish(); put(); };
    put();   // 煙火建好就是藏著的（once 建好即終態）
    return {
      object,
      // 演完最後擺一次終態就停（t 設回 Infinity，跟建好、finish 一樣）：不再每幀重擺
      update(dt, now) { if (t !== Infinity) { t += dt * rate; put(); if (t >= end) t = Infinity; } fw?.update(dt * rate, now); },
      dispose() { body.dispose(); fw?.dispose(); },
    };
  },
};

// delay 秒後才開演 beat（together 裡用：飛彈飛到一半才冒「！」）；dur 是 beat 自己的秒數（together 在 start 就要知道總長）。
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
// 飛彈各段的真實秒數：「！」0.8、矽盾擋下的跳＋♥ 1.0、吹歪的「？」1.0 再「♪」0.8
const CHEER = 1.0, HUH = 1.0, TUNE = 0.8, CROWD = 24;

// 101 的半腰：塔腳（錨點）到頭頂（stage.headOf）的中點，警告時鏡頭對這裡（塔頂的警示燈與島都在畫面裡）
export const towerWaist = c => { const h = c.stage.headOf('tower'); return { x: h.x, y: (TOWER.y + h.y) / 2, z: h.z }; };
export const script = {
  // 警告（終局回合第一個事件，選擇帶動升級 §4；原本倒數 3 的宣告去掉數字）：紅光與 101 頂上的警示燈一起出現 →
  // 鏡頭先飛到 101（FOCUS_BEAT 0.8 s，計畫 13）、馬上飛回全景 → 全島（最多 24 人）轉頭看紅光 1.2 s（鏡頭在這段飛回全景）→
  // 同一批人頭上一起冒「！」、蹲下護頭（duck）0.8 s → 放回日常。終局回合 1 倍速，秒數就是真實秒數（約 2.8 s）。
  // 計畫寫「！」跟抬頭一起、回全景交給飛彈那段：鏡頭停在 101 時島的兩側與前緣出畫，24 個「！」有 11 個整段在畫面外
  // （chain.test 的字在畫面裡不變式）——改成鏡頭先回全景、「！」跟蹲下一起冒（鏡頭已經到全景）
  warning(e, s, ctx) {
    const { B } = ctx, up = lookUp(B, FLARE_AT, LOOK);
    return [
      // 鏡頭對 101 的半腰（地面到頭頂 stage.headOf 的中點）：對那一格的地面（focus('tower')）全景距離 × 0.9 會把塔頂、警示燈切出畫面，
      // 對頭頂又整座島掉出畫面下緣、只剩背景的山（截圖量的）
      // 紅光、警示燈在鏡頭飛過去的途中出現（同一拍，修正輪 1：省下 apply 的 0.3 s）
      B.together([B.apply(e, { only: ['finale.flare', 'finale.beacon'] }), B.focus(towerWaist, { zoom: TOWER_ZOOM })]), B.focus('home'),
      B.together(up.look), B.together([...up.say('！', SHOUT), ...up.act('duck', DUCK)]), up.release,
    ];
  },
  // 飛彈（設計 §6，真實秒數，終局回合 1 倍速）：回全景停 0.8 → 紅光熄掉 → 飛彈從紅光的位置發射（replay：套用零件、launch 重飛），
  //   飛到一半全島（最多 24 人，演到才點名、整段同一批人）冒「！」→ 結果 → 套上剩下的 → 放人回日常 → 回全景停 HOLD_END。
  //   shield：罩子切 full（閃白就是那一下亮），飛彈自己碎成煙火；全島原地跳＋♥。
  //   deflect：第二段 DEFLECT 秒掉進溫泉（同一個 replay 拍裡）→ 水花 → 全島「？」再「♪」。
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
    const lead = [B.focus('home', { hold: 0.8 }), B.apply(e, { only: ['finale.flare'] }), B.together([fly, later(FLIGHT / 2, SHOUT, all(m => [B.bubble(m, '！', SHOUT)]))])];
    const tail = [B.apply(e), B.home(() => list ?? []), B.focus('home', { hold: HOLD_END })];
    if (o === 'shield') return [...lead, B.apply(e, { only: ['tower.shield'] }), all(m => [B.gesture(m, 'jump', CHEER), B.bubble(m, '♥', CHEER)]), ...tail];
    if (o === 'deflect') return [...lead, B.apply(e, { only: ['finale.splash'] }), all(m => [B.bubble(m, '？', HUH)]), all(m => [B.bubble(m, '♪', TUNE)]), ...tail];
    return [...lead, B.apply(e, { only: ['tower.main', 'tower.antenna', 'tower.show', 'tower.shield'] }), B.worldNow(), ...tail];   // 心情照 world.js 的規則重算（單一來源，最終審稿）
  },
  // 賽博（設計 §7，≤ 12 秒真實，終局回合 1 倍速）：夜晚＋霓虹（world 拍只帶 time／glowScale，app 合進目前的全島效果；
  //   賽博一定是燈泡 Lv9，glowScale 早就是 NEON_BOOST、時間多半也已是夜晚——這拍不會更亮，只是保證尾聲是夜晚霓虹）→
  //   黑塔、燈光秀、天線、螢幕閃白換上 → 紅車飛一趟（replay：套用零件、fly 從海上重飛；跳過時 land 直接停好），
  //   同時起飛後 1.5 秒螢幕冒跑馬燈 3 秒 → 機器鼠的家搬上屋頂（apply）、閃白放上站位（roof 拍；屋頂在 101 的 footprint 裡走不上去）→
  //   放回日常（站定在屋頂）→ 剩下的套用 → 全景停 1.5 秒。外星尾聲在下面的 alien()
  epilogue(e, s, ctx) {
    const { B } = ctx;
    if (e.ending === 'alien') return alien(e, ctx);
    if (e.ending !== 'cyber') return [B.apply(e)];
    const rats = c => c.roster.members('rat.pack');
    const fly = B.replay(e, 'finale.car', CAR_FLIGHT, {
      begin: (o, c) => { if (!o.userData.fly) return false; o.userData.fly({ speed: c.speed ?? 1 }); return true; },
      finish: o => o.userData.land(),
    });
    const marquee = later(MARQUEE_AT, MARQUEE_DUR, B.bubble('tower.screen', { text: MARQUEE }, MARQUEE_DUR));
    return [
      B.world({ time: TIMES.night, glowScale: NEON_BOOST }),
      B.apply(e, { only: ['tower.main', 'tower.show', 'tower.antenna', 'tower.screen'] }),
      B.together([fly, marquee]),
      B.apply(e, { only: ['rat.pack', 'rat.king'] }), roof(rats, m => ROOF_SPOTS[m.i % ROOF_SPOTS.length]), B.home(rats),
      B.apply(e), B.focus('home', { hold: END_HOLD }),
    ];
  },
};

// 外星（設計 §7，≤ 12 秒真實，終局回合 1 倍速；唯一正解下到不了——外星是壞結局、不演尾聲，留給圖鑑，見檔頭）：鏡頭對溫泉格，變異鼠王（名冊 rat.pack 唯一一隻，演到才點名）對天揮手＋「！」→
//   鏡頭推到石堆島（裁決 R5；focus 的點用 worldToAxial 反算格子，衛星島也算得出格子，點直接交給 rig.focus）→ 降落場閃白（綠光圈換成更亮的圈＋三盞燈、石堆兩隻老鼠閃白拿掉）→ 三台 UFO 不閃白套上、從 7 高降下來 2 秒 →
//   外星生物閃白 → 回全景停 0.8 → 母艦閃白（塔身、天線、燈光秀；罩子沒變）→ 全島第三隻眼（world 拍只帶 mood，回合收尾的 world 拍照舞台旗標也是 alien）→
//   老鼠的家搬上碟頂（apply）、閃白放上去（roof 拍：碟頂在 101 的 footprint 上面，走不上去）→ 放回日常 → 剩下的套用（小 UFO 拿掉）→
//   「♥」→ 全景停 1.5 秒
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };
function alien(e, ctx) {
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
