// 北側台地的常駐地標：陽明山（火山，山口冒煙）與北投溫泉（池子、小澡堂、蒸氣）。開局就在（§4.1）。
import { landmarkWorld, cellCentre } from './anchors.js';
import { offset } from './palette.js';
import { trainCars } from './token.js';
import { mulberry32 } from '../scene/random.js';

export const id = 'landmarks';

// 島民（§14.3 人分散）：一個名冊，一人住一格散步（第 i 人用 home.at[i]）——人數預算（裁決 R16）：
// 最擠的球場格（球員、觀眾、草皮、搭車來的球迷）與珍奶格（人龍、站務員）不住島民；溫泉格住的是下面兩位溫泉客。
// 修正批次 max-skip §E（使用者 2026-11-01 開局截圖「開局時的左側上的人和右側的人可以移除，只留 101 區塊和泡溫泉的人」）：
// 原本四格各一位（101、晶片、鮮奶、火山格），只留 101 格一位；他是離車站最近的島民，代幣 Lv2 轉成站長之後島上就沒有島民了。
// 他的家不在格心、在 101 西南邊（鏡頭那側、往捷運站的橋那邊，格心往 (−0.5, 1.0)）、散步半徑 ISLANDER_R 1.0：
// 101 工地蓋住格子中間一大塊，格心半徑 1.8 散步時會走到 101 北側，從那裡繞到站務崗位要 8.3 m（5.2 s），代幣 Lv2 的劇本超過 6 s 例外；
// 西南這一塊到崗位最遠 5.6 m（3.5 s）、到月台 5.4 m（散步中心 (−0.5, 0.9) 時外星壞局第 8 回合兩隻老鼠擠過站著的偵防師 2 幀，
// 同 roster.test 鼠群擦身那一類對軌跡敏感的老問題，(−0.5, 1.0) 目前剛好 0 幀，見 roster.test 的 todo「two rats walking nose to tail past a stander」）
export const HOME_R = 1.8;   // 散步半徑：格子中心常被建築蓋住，要夠大才挑得到走得到的點（鮮奶節的小孩同一個半徑，milk.js）
export const ISLANDER_R = 1.0;
export const HOMES = [offset(cellCentre([0, 0]), -0.5, 1.0)];
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

// 島民人數：HOMES（一位）減掉轉成角色的（代幣 ≥2 的站長），最少 0。flush() 會把不夠的名冊補滿，所以宣告的人數一定要跟著減。
// 鮮奶不再借島民（計畫 13 §設計 1：兩個小學生都從校門外走進來）
export const islanderCount = (lv = {}) => Math.max(0, HOMES.length - (lv.token >= 2 ? 1 : 0));

const ROCK = 0xb8a892, CLIFF = 0xd2b48c, WALL = 0xf1e7da, YELLOW = 0xfcea8b, WATER = 0xa4d4da;

// ── 陽明山（計畫 13 §設計 4，使用者 2026-11-01「火山太醜請重新設計」）：builders.volcano 自己算一座有稜角的低多邊形錐——
// 錐身 12 邊 6 段（頂半徑 0.95、腳 1.45、高 1.5），每個頂點決定性抖動（mulberry32 固定種子：徑向 ±0.08、高度 ±0.04，錐腳不離地），
// 同一個位置的頂點抖一樣（錐身頂圈、口緣環、碗口接得起來不裂）；非索引、每個三角形自己的法線＝平面著色（共用的黏土材質就畫得出稜角，
// 不另開材質、不多 draw call）。頂點色一個三角形一色（高度相對錐高 1.5）：0–0.78 沙色、0.78–0.92 淺一點的棕（修正輪 0／0b：0x6b5a4e、
// 從 0.55 起都太重）、0.92 以上與口緣、碗更深，分層邊界也抖——山體主要是沙色、頂上一圈深色。頂上凹一個 0.18 深的碗（口 0.75、底 0.55，
// 面朝內），碗底一片熔岩（發光）。熔岩痕直接塗在錐身的面上（修正輪 0：原本是凸出山體的發光細長盒；0b：兩面寬流到山腰太搶眼）：
// 朝鏡頭那側三道「剛從口緣溢出來」的細熔岩，各一面寬、兩個高度段（流到 1.0 上下）——第一段是頂邊貼著口緣、尖朝下的三角，
// 第二段錯半面再收一個尖朝下的三角；暗一階的熔岩橘、不發光。
// 錐、碗、四顆石頭併成一個黏土 mesh，碗底的熔岩一個發光 mesh（走 ctx.glow：白天、大停電歸零）——跟原本的錐台＋圓盤＋橢球一樣兩個
const CONE = { top: 0.95, foot: 1.45, h: 1.5, seg: 12, rows: 6 }, CRATER = { r: 0.75, floor: 0.55, depth: 0.18 };
const LAVA = 0xdb6a41, SLOPE = 0x8a7563, RIM = 0x4a3f38, STREAK = 0xc85a33, VOLCANO_SEED = 7;
const JITTER_R = 0.08, JITTER_Y = 0.04, BAND_JITTER = 0.06, BANDS = [[0.78, CLIFF], [0.92, SLOPE], [Infinity, RIM]];
// 熔岩痕在錐身的哪幾欄（第 x 欄是方位 x/12 · 2π 到 (x+1)/12 · 2π，0 朝鏡頭 +z）、往下幾段。
// CylinderGeometry 的三角形照「欄 x → 段 y（0 在頂）→ (a,b,d)、(b,c,d)」排：第 f 個面在 x = ⌊f / 12⌋、y = ⌊(f mod 12) / 2⌋、tri = f mod 2
const STREAK_COLS = [10, 0, 2], STREAK_ROWS = 2;
// 每段只塗本欄的左上三角（a, b, d：頂邊在上、尖朝下）：第 0 段頂邊就是口緣；第 1 段的頂邊從上一段的尖往右錯半面，收成第二個尖
const onStreak = f => {
  const x = Math.floor(f / (CONE.rows * 2)), y = Math.floor((f % (CONE.rows * 2)) / 2), tri = f % 2;
  return y < STREAK_ROWS && tri === 0 && STREAK_COLS.includes(x);
};
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
      c.setHex(k === 0 && onStreak(i / 3) ? STREAK : (BANDS.find(([top]) => h < top) ?? BANDS.at(-1))[1]);
      for (let j = 0; j < 3; j++) cols.set([c.r, c.g, c.b], (i + j) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeVertexNormals();
    return g;
  });
  return out;
}
export const builders = {
  volcano(THREE, spec, ctx) {
    const clay = volcanoGeometry(THREE);
    const part = ctx.build({ kind: 'compound', at: spec.at, parts: [...clay.map(geometry => ({ geometry, pos: [0, 0, 0] })), ...spec.parts] });
    for (const g of clay) g.dispose();   // compound 合併時各自 clone 過了
    return part;
  },
};

// 老鼠泡溫泉（老鼠 ≥3、沒搭上捷運）時池水變成淡綠色
// 舞台照模組的共同簽名 view(lv, flags, meta) 呼叫；地標用不到旗標（計畫 13 起溫泉客不看變異鼠換位置），只看 lv
export function view(lv = {}) {
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
    'landmarks.islanders': { kind: 'roster', at: HOMES[0], n: islanderCount(lv), accessory: 'none', home: { kind: 'wander', at: HOMES, r: ISLANDER_R } },
    // 溫泉客：泡在池裡偶爾看一下（fidget look）；站位在池子 footprint 裡、不帶 rescue（計畫 13 §設計 3）
    'landmarks.bathers': { kind: 'roster', at: s, n: 2, shirt: [WALL, 0xf2b5c6], home: { kind: 'stand', spots: BATHERS.map(({ p, yaw }) => ({ ...offset(s, p.x, p.z, WATER_TOP - SOAK), yaw })), fidget: 'look' } },
  };
}
