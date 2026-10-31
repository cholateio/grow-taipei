// 北側台地的常駐地標：陽明山（火山，山口冒煙）與北投溫泉（池子、小澡堂、蒸氣）。開局就在（§4.1）。
import { landmarkWorld, cellCentre } from './anchors.js';
import { offset } from './palette.js';
import { trainCars } from './token.js';
import { mulberry32 } from '../scene/random.js';

export const id = 'landmarks';

// 島民（§14.3 人分散）：最多四個人一個名冊，一人住一格散步（第 i 人用 home.at[i]）——人數預算（裁決 R16）：
// 最擠的球場格（球員、觀眾、草皮、搭車來的球迷）與珍奶格（人龍、站務員）不住島民；溫泉格住的是下面兩位溫泉客
export const HOME_R = 1.8;   // 散步半徑：格子中心常被建築蓋住，要夠大才挑得到走得到的點（鮮奶節的小孩同一個半徑，milk.js）
export const HOMES = [[0, 0], [1, 0], [-1, 0], [0, -1]].map(cellCentre);
// 溫泉池（底座半徑 0.7，加上池邊的石頭到 0.75）、小澡堂、木牌各自的 footprint——不再用整個包圍盒（會把池邊整圈都擋掉）。
// 颱風登陸時池子不能躲（door: false），小澡堂可以（door: true，比一般的門小）
const POOL_R = 0.75;
export const BATHHOUSE = { x: 0.95, z: -0.75, w: 0.6, d: 0.5, door: true };
const SPRING_FP = [{ r: POOL_R, door: false }, BATHHOUSE, { x: -0.85, z: 0.75, w: 0.36, d: 0.04 }];
// 溫泉客泡在池裡（計畫 13 §設計 3，使用者 2026-11-01「溫泉區可以有人進去泡」）：池心半徑 0.3、靠鏡頭那側兩點（角度 0.93、2.0），面向池心；
// y 壓到池水面（底座頂 0.13）下 0.15——水淹到胸口，只露頭肩與手臂（計畫寫 0.22，截圖裡只剩一顆頭）。站位在池子 footprint 裡又不帶 rescue（同淹水的泳客）：
// 名冊補人、颱風躲完雨回來都是走到池邊最近的可走點、最後一段直直走進池裡（roster 的 authored 站位）。
// 泡湯老鼠（rat.js SPRING_SPOTS：池心半徑 0.62、5 隻）離每位溫泉客 ≥ 0.37（≥ 0.25）；
// 外星的變異鼠站在池子前緣（rat.js MUTANT）時離兩人都 0.73（≥ 0.6），溫泉客在池裡不換位置——
// 計畫寫的「改用北側的角度」要先從池裡走出來（nav 從 footprint 裡逃到最近的可走點，正好是變異鼠站的池子前緣）再繞一圈，反而貼著牠走
const SOAK_R = 0.3, WATER_TOP = 0.13, SOAK = 0.15;
const BATHERS = [0.93, 2.0].map(a => { const p = { x: Math.cos(a) * SOAK_R, z: Math.sin(a) * SOAK_R }; return { p, yaw: Math.atan2(-p.x, -p.z) }; });

// 島民人數：四個人減掉轉成角色的（代幣 ≥2 的站長）。flush() 會把不夠的名冊補滿，所以宣告的人數一定要跟著減。
// 鮮奶不再借島民（計畫 13 §設計 1：兩個小學生都從校門外走進來）
export const islanderCount = (lv = {}) => HOMES.length - (lv.token >= 2 ? 1 : 0);

const ROCK = 0xb8a892, CLIFF = 0xd2b48c, WALL = 0xf1e7da, YELLOW = 0xfcea8b, WATER = 0xa4d4da;

// ── 陽明山（計畫 13 §設計 4，使用者 2026-11-01「火山太醜請重新設計」）：builders.volcano 自己算一座有稜角的低多邊形錐——
// 錐身 12 邊 6 段（頂半徑 0.95、腳 1.45、高 1.5），每個頂點決定性抖動（mulberry32 固定種子：徑向 ±0.08、高度 ±0.04，錐腳不離地），
// 同一個位置的頂點抖一樣（錐身頂圈、口緣環、碗口接得起來不裂）；非索引、每個三角形自己的法線＝平面著色（共用的黏土材質就畫得出稜角，
// 不另開材質、不多 draw call）。頂點色一個三角形一色：高度 0–0.55 沙色、0.55–0.9 深棕、0.9 以上與口緣、碗更深，分層邊界也抖。
// 頂上凹一個 0.18 深的碗（口 0.75、底 0.55，面朝內），碗底一片熔岩；三條熔岩痕從口緣沿斜面流到高度 0.6（細長盒、發光同色）。
// 錐、碗、四顆石頭併成一個黏土 mesh，熔岩（碗底＋三條痕）一個發光 mesh（走 ctx.glow：白天、大停電歸零）——跟原本的錐台＋圓盤＋橢球一樣兩個
const CONE = { top: 0.95, foot: 1.45, h: 1.5, seg: 12, rows: 6 }, CRATER = { r: 0.75, floor: 0.55, depth: 0.18 };
const LAVA = 0xdb6a41, SLOPE = 0x6b5a4e, RIM = 0x4a3f38, VOLCANO_SEED = 7;
const JITTER_R = 0.08, JITTER_Y = 0.04, BAND_JITTER = 0.06, BANDS = [[0.55, CLIFF], [0.9, SLOPE], [Infinity, RIM]];
const STREAKS = [-0.6, 0.15, 0.9], STREAK_TO = 0.6;   // 熔岩痕的方位（0 = 朝鏡頭 +z）、流到的高度
function volcanoGeometry(THREE) {
  const side = new THREE.CylinderGeometry(CONE.top, CONE.foot, CONE.h, CONE.seg, CONE.rows, true).translate(0, CONE.h / 2, 0);
  const rim = new THREE.RingGeometry(CRATER.r, CONE.top, CONE.seg).rotateX(-Math.PI / 2).translate(0, CONE.h, 0);
  const bowl = new THREE.CylinderGeometry(CRATER.r, CRATER.floor, CRATER.depth, CONE.seg, 1, true).translate(0, CONE.h - CRATER.depth / 2, 0);
  const rnd = mulberry32(VOLCANO_SEED), moved = new Map();
  const key = (x, y, z) => [x, y, z].map(v => Math.round(v * 1000) + 0).join();   // + 0：−0 與 0 同一格
  const out = [side, rim, bowl].map((g0, k) => {
    const p0 = g0.attributes.position;
    for (let i = 0; i < p0.count; i++) {
      const x = p0.getX(i), y = p0.getY(i), z = p0.getZ(i), id = key(x, y, z);
      if (!moved.has(id)) moved.set(id, [(rnd() * 2 - 1) * JITTER_R, y < 1e-6 ? 0 : (rnd() * 2 - 1) * JITTER_Y]);
      const [dr, dy] = moved.get(id), r = Math.hypot(x, z), s = r > 1e-6 ? (r + dr) / r : 1;
      p0.setXYZ(i, x * s, y + dy, z * s);
    }
    const g = g0.toNonIndexed(); g0.dispose(); g.deleteAttribute('uv');
    const p = g.attributes.position, n = p.count, cols = new Float32Array(n * 3), c = new THREE.Color();
    if (k === 2) for (let i = 0; i < n; i += 3) {   // 碗：面朝內（三角形反過來繞）
      const t = [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)]; p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, ...t);
    }
    for (let i = 0; i < n; i += 3) {
      const yc = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, h = k ? Infinity : yc / CONE.h + (rnd() * 2 - 1) * BAND_JITTER;
      c.setHex((BANDS.find(([top]) => h < top) ?? BANDS.at(-1))[1]);
      for (let j = 0; j < 3; j++) cols.set([c.r, c.g, c.b], (i + j) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeVertexNormals();
    return g;
  });
  // 熔岩痕：口緣（半徑 0.95、高 1.5）沿斜面流到 STREAK_TO 高；每條兩截細長盒（上截寬、下截窄、方位偏一點，像流下來拐了一下），
  // 沿斜面躺著、浮出斜面 0.035（抖動過的斜面凸出來的地方會蓋住一點，像順著溝流）
  const M = THREE.Matrix4, radius = y => CONE.top + (CONE.foot - CONE.top) * (CONE.h - y) / CONE.h;
  const segment = (t, y0, y1, w) => {
    const L = Math.hypot(y0 - y1, radius(y1) - radius(y0)), a = Math.atan2(radius(y1) - radius(y0), y0 - y1);
    const g = new THREE.BoxGeometry(w, L, 0.1).toNonIndexed(); g.deleteAttribute('uv');
    return g.applyMatrix4(new M().makeRotationY(t).multiply(new M().makeTranslation(0, (y0 + y1) / 2, (radius(y0) + radius(y1)) / 2 + 0.035)).multiply(new M().makeRotationX(-a)));
  };
  const mid = (CONE.h + STREAK_TO) / 2;
  const streaks = STREAKS.flatMap((t, i) => [segment(t, CONE.h + 0.02, mid - 0.03, 0.075), segment(t + (i % 2 ? -0.07 : 0.07), mid, STREAK_TO, 0.05)]);
  return { clay: out, lava: streaks };
}
export const builders = {
  volcano(THREE, spec, ctx) {
    const { clay, lava } = volcanoGeometry(THREE);
    const part = ctx.build({ kind: 'compound', at: spec.at, parts: [
      ...clay.map(geometry => ({ geometry, pos: [0, 0, 0] })), ...lava.map(geometry => ({ geometry, pos: [0, 0, 0], color: LAVA, glow: LAVA })), ...spec.parts,
    ] });
    for (const g of [...clay, ...lava]) g.dispose();   // compound 合併時各自 clone 過了
    return part;
  },
};

// 老鼠泡溫泉（老鼠 ≥3、沒搭上捷運）時池水變成淡綠色
export function view(lv = {}, flags = {}) {
  const v = landmarkWorld('volcano'), s = landmarkWorld('spring'), water = lv.rat >= 3 && !trainCars(lv.token) ? 0xbfd39c : WATER;
  return {
    // 錐、碗、熔岩痕由 builders.volcano 算；這裡只列碗底的熔岩與錐腳四顆石頭（錐腳比原本的錐台寬 0.15，石頭照比例往外挪 1.2 倍，一樣半埋在錐腳）
    'landmarks.volcano': {
      kind: 'volcano', at: v, parts: [
        { kind: 'cylinder', pos: [0, CONE.h - CRATER.depth + 0.015, 0], scale: [1.24, 0.03, 1.24], color: LAVA, glow: LAVA },
        ...[[1.1, 0.5], [-0.9, 0.8], [0.4, -1.15], [-1.2, -0.4]].map(([x, z], i) => ({ kind: 'ico', pos: [x * 1.2, 0.12, z * 1.2], scale: [0.32, 0.24, 0.3], rot: [0, i, 0], color: ROCK })),
      ],
    },
    'landmarks.volcanoSmoke': { kind: 'smoke', at: v, n: 6, size: 0.3, rise: 1.8, offsetY: CONE.h },
    'landmarks.spring': {
      kind: 'compound', at: s, parts: [
        { kind: 'cylinder', pos: [0, 0.06, 0], scale: [1.4, 0.12, 1.4], color: CLIFF },
        { kind: 'cylinder', pos: [0, 0.08, 0], scale: [1.16, 0.1, 1.16], color: water, glow: water },
        ...[[0.62, 0.3], [-0.55, 0.42], [0.2, -0.66], [-0.4, -0.5]].map(([x, z], i) => ({ kind: 'ico', pos: [x, 0.14, z], scale: 0.18, rot: [0, i * 2, 0], color: ROCK })),
        { kind: 'box', pos: [0.95, 0.2, -0.75], scale: [0.5, 0.4, 0.4], color: WALL },
        { kind: 'hip', pos: [0.95, 0.52, -0.75], scale: [0.6, 0.24, 0.5], color: YELLOW },
        { kind: 'box', pos: [-0.85, 0.25, 0.75], scale: [0.04, 0.5, 0.04], color: 0x9c7a4e },
        { kind: 'box', pos: [-0.85, 0.48, 0.75], scale: [0.36, 0.18, 0.04], color: 0x9c7a4e },
      ],
      footprint: SPRING_FP,
    },
    'landmarks.springSteam': { kind: 'smoke', at: s, n: 3, size: 0.14, rise: 0.9, offsetY: 0.1 },
    // 被轉走的島民不補（裁決 R23）：代幣 ≥2 一個變站長（token.staff，from 這裡 pick 'nearest'）；鮮奶不再借島民（計畫 13）
    'landmarks.islanders': { kind: 'roster', at: HOMES[0], n: islanderCount(lv), accessory: ['none', 'cap'], home: { kind: 'wander', at: HOMES, r: HOME_R } },
    // 溫泉客：泡在池裡偶爾看一下（fidget look）；站位在池子 footprint 裡、不帶 rescue（計畫 13 §設計 3）
    'landmarks.bathers': { kind: 'roster', at: s, n: 2, shirt: [WALL, 0xf2b5c6], home: { kind: 'stand', spots: BATHERS.map(({ p, yaw }) => ({ ...offset(s, p.x, p.z, WATER_TOP - SOAK), yaw })), fidget: 'look' } },
  };
}
