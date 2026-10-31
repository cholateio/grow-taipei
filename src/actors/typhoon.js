// 颱風（唯一正解 2026-10-31 §4.3、§5.1，max 4）：四站——Lv1 暴風雲到 101 旁邊上空（放下那回合：大雨、全島跑去門口躲一下；有珍奶就有外送機車在雨中繞；
//   衛星島的風車被吹得搖）→ Lv2 移到捷運站上空 → Lv3 移到大巨蛋上空 → Lv4 風停、彩虹、河濱公園、屋頂換色、堤防沿主島水道一圈。
//   「所有房子換新屋頂」由各模組的 roofColor(…, rebuilt(lv)) 處理。雨、機車整段 Lv1–3 都在。
// 劇本：颱風雲是主角——◆ 放下：飄進來 → 鼓脹、下大雨 → 全島 ！跑去門口躲一下、又走出來淋雨；Lv2／Lv3：雲從上一站飄到下一站（B.move）→ LEVEL UP；
//   ◆ Lv4 雨過天晴。全島檢查（放下的大停電、颱風假；車站的淹水、外送；巨蛋的淹水、鼠災）是同一回合接著的 fx 事件，照一般事件演（turn.js 預設劇本），
//   這裡不寫反應劇本。修正輪 1 裁決：躲雨不再是回合狀態（舊的 indoors：放下之後整回合只演 apply + LEVEL UP），同一回合後面的升級照常演。
import { anchorWorld, landmarkWorld } from './anchors.js';
import { R, TOP, MAIN_CELLS, NEIGHBORS, axialToWorld, cellTop, cellAt } from '../scene/hex.js';
import { mulberry32 } from '../scene/random.js';
import { C } from './palette.js';
import { RAT_LANDING } from './rat.js';
import { crowd } from '../show/crowd.js';   // 一群人同時演，名單演到才算

export const id = 'typhoon';
export const labelY = 1.0;
const STORM = 0x6b7280, SCOOTER_R = 1.95;

// 雲的四站（§4.3）：Lv1 101 旁邊上空（颱風錨點，101 那一格、離塔 1.5——修正輪 1：停在塔正上方會被完工的 101 塔頂穿過）、
// Lv2 捷運站上空、Lv3 大巨蛋上空；Lv4 雲散了
export const STOPS = { 1: anchorWorld('typhoon'), 2: anchorWorld('token'), 3: anchorWorld('baseball') };

// 堤防（Lv4）：主島外圍每一條靠海的格邊、離格心 LEVEE_R 的一道矮牆（走路格離格邊 0.35 以外、格面還在的那一圈邊上，
// 不擋路、不算 footprint）；棒球格西南邊留給巨蛋捷運站的月台（同珍奶節的海岸氣球），第一隻老鼠爬上岸的那道牆在爬上來的地方留 LEVEE_OPEN 寬的缺口
// （rat.js RAT_LANDING 投影到牆上那一點）。全部一個零件、一種顏色（深灰水泥，1 個 draw call）
export const LEVEE_R = 2.08, LEVEE_H = 0.08, LEVEE_OPEN = 0.9;
const LEVEE_GAP = '-1,1>-2,2';
const SQ3 = Math.sqrt(3);
// 一道牆：中心 (x, z)、沿牆方向 (tx, tz)、長 len；開口點投影在牆上（離牆線 1 以內）就切成兩段
function wallPieces(x, z, tx, tz, len, open) {
  const s = (open.x - x) * tx + (open.z - z) * tz, off = Math.abs((open.x - x) * tz - (open.z - z) * tx);
  if (off > 1 || Math.abs(s) > len / 2) return [{ x, z, len }];
  const a = -len / 2, b = s - LEVEE_OPEN / 2, c = s + LEVEE_OPEN / 2, d = len / 2;
  return [[a, b], [c, d]].filter(([u, v]) => v - u > 0.1).map(([u, v]) => ({ x: x + tx * (u + v) / 2, z: z + tz * (u + v) / 2, len: v - u }));
}
export const LEVEE_EDGES = MAIN_CELLS.flatMap(cell => NEIGHBORS
  .filter(([dq, dr]) => !MAIN_CELLS.some(c => c[0] === cell[0] + dq && c[1] === cell[1] + dr) && `${cell}>${cell[0] + dq},${cell[1] + dr}` !== LEVEE_GAP)
  .flatMap(([dq, dr]) => {
    const c = axialToWorld(...cell), n = axialToWorld(cell[0] + dq, cell[1] + dr), d = Math.hypot(n.x - c.x, n.z - c.z), ux = (n.x - c.x) / d, uz = (n.z - c.z) / d;
    // 離格心 LEVEE_R 那條平行線在六角裡的弦長（格心是 2R、格邊是 R），兩端各縮一點不戳出相鄰的格邊
    const len = 2 * R - 2 * LEVEE_R / SQ3 - 0.1, yaw = Math.atan2(ux, uz);
    return wallPieces(c.x + ux * LEVEE_R, c.z + uz * LEVEE_R, uz, -ux, len, RAT_LANDING).map(p => ({ ...p, y: cellTop(cell), yaw }));
  }));
function levee() {
  return { kind: 'compound', at: { x: 0, y: 0, z: 0 }, shadow: false, footprint: false, low: false,
    parts: LEVEE_EDGES.map(e => ({ kind: 'box', pos: [e.x, e.y + LEVEE_H / 2, e.z], scale: [e.len, LEVEE_H, 0.07], rot: [0, e.yaw, 0], color: C.window })) };
}

export function view(lv) {
  const n = lv.typhoon, at = anchorWorld('typhoon'), v = {};
  if (!n) return v;
  if (n <= 3) {
    // 暴風圈：一團深灰雲繞 y 轉，停在這一站上空（放下那回合從海上飄進來，之後一回合移一站）
    v['typhoon.main'] = { kind: 'cloud', at: STOPS[n], labelY: 3.9, spin: 0.5, footprint: false, parts: [
      { kind: 'sphere', pos: [0, 4.6, 0], scale: 1.6, color: STORM },
      ...Array.from({ length: 7 }, (_, i) => { const a = i / 7 * Math.PI * 2; return { kind: 'sphere', pos: [Math.cos(a) * 2.2, 4.4 + (i % 2) * 0.2, Math.sin(a) * 2.2], scale: 1.1 - (i % 3) * 0.12, color: STORM }; }),
    ] };
    v['typhoon.rain'] = { kind: 'rain', at: { x: 0, y: 0, z: 0 }, footprint: false };
    if (lv.boba >= 1) v['typhoon.scooter'] = { kind: 'scooter', at: { x: 0, y: TOP, z: 0 }, footprint: false };
    return v;
  }
  // 彩虹：細環（rail）半截沉在水下，立在台地後面當背景，不擋住火山。自己一個零件（雲散了沒有 main）：Lv4 劇本讓它從台地後升起
  v['typhoon.rainbow'] = { kind: 'compound', at, shadow: false, footprint: false, parts: [C.coral, C.yellow, C.blue].map((c, i) => ({ kind: 'rail', pos: [0.6, -0.3, -5.2], scale: 11 - i * 0.6, rot: [0, 0.2, 0], color: c })) };
  const park = landmarkWorld('park');
  // 河濱公園是走得到的草地：footprint 只擋樹（樹冠半徑 0.25，外擴 PAD 後 0.33）和兩張長椅（外擴後 0.22 蓋住 0.36 長的椅面），
  // 不用整個包圍盒——外擴 PAD 後會把 101 南側那條通道堵死（§14.1）
  v['typhoon.park'] = { kind: 'compound', at: park, footprint: [{ x: -0.45, z: -0.1, r: 0.21 }, { x: -0.35, z: 0.25, r: 0.1 }, { x: 0.35, z: -0.2, r: 0.1 }], parts: [
    { kind: 'box', pos: [0, 0.01, 0], scale: [1.1, 0.02, 0.3], rot: [0, 0.6, 0], color: C.sand },
    ...[[-0.35, 0.25], [0.35, -0.2]].flatMap(([x, z]) => [{ kind: 'box', pos: [x, 0.1, z], scale: [0.36, 0.04, 0.12], rot: [0, 0.6, 0], color: C.wood }, { kind: 'box', pos: [x, 0.05, z], scale: [0.3, 0.1, 0.03], rot: [0, 0.6, 0], color: C.ink }]),
    ...[[0.3, 0.35, 0xf2b5c6], [0.45, 0.2, C.yellow], [-0.2, -0.35, 0xf2b5c6]].flatMap(([x, z, c]) => [{ kind: 'cylinder', pos: [x, 0.08, z], scale: [0.015, 0.16, 0.015], color: 0x6f9560 }, { kind: 'sphere', pos: [x, 0.17, z], scale: 0.07, color: c }]),
    { kind: 'trunk', pos: [-0.45, 0.2, -0.1], scale: [0.1, 0.4, 0.1], color: C.wood }, { kind: 'leaf', pos: [-0.45, 0.55, -0.1], scale: 0.5, color: 0x8aaf70 },
  ] };
  v['typhoon.levee'] = levee();
  return v;
}

export const builders = {
  // 雲：上下漂；暴風圈整團繞 y 轉
  cloud(THREE, spec, ctx) {
    const part = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: spec.parts }), object = new THREE.Group();
    object.add(part.object);
    return { object, update(dt, t) { part.object.position.y = Math.sin(t * 0.8) * 0.08; if (spec.spin) part.object.rotation.y += dt * spec.spin; }, dispose: part.dispose };
  },
  // 大雨：240 根半透明雨絲在半徑 8 內從 6 落到 0 循環，不投影。ctx.weather.rain（0–1，app 每幀淡入）決定下幾根、多濃
  rain(THREE, spec, ctx) {
    const N = 240, rnd = mulberry32(5), object = new THREE.Group();
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.35, 0.02), new THREE.MeshBasicMaterial({ color: 0xa4d4da, transparent: true, opacity: 0.6, depthWrite: false }), N);
    mesh.castShadow = mesh.receiveShadow = false; mesh.frustumCulled = false; object.add(mesh);
    const drops = Array.from({ length: N }, () => { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 8; return { x: Math.cos(a) * r, z: Math.sin(a) * r, ph: rnd() }; });
    const m = new THREE.Matrix4(), tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, 0, 0.1)), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    return {
      object,
      update(dt, t) {
        const k = ctx.weather?.rain ?? 1;
        mesh.count = Math.round(N * k); mesh.material.opacity = 0.6 * Math.min(1, 0.4 + k * 0.6);
        drops.forEach((d, i) => { const y = 6 - ((d.ph + t) * 6 % 6); mesh.setMatrixAt(i, m.compose(p.set(d.x, y, d.z), tilt, one)); });
        mesh.instanceMatrix.needsUpdate = true;
      },
      dispose() { mesh.geometry.dispose(); mesh.material.dispose(); },
    };
  },
  // 颱風天外送：珊瑚色機車載著戴黃安全帽的騎士，沿中心格的步道繞圈
  scooter(THREE, spec, ctx) {
    const part = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: [
      { kind: 'box', pos: [0, 0.14, 0], scale: [0.14, 0.12, 0.42], color: C.coral },
      { kind: 'box', pos: [0, 0.24, -0.12], scale: [0.2, 0.12, 0.16], color: C.ink },
      { kind: 'torus', pos: [0, 0.07, 0.17], scale: 0.13, rot: [0, Math.PI / 2, 0], color: C.ink }, { kind: 'torus', pos: [0, 0.07, -0.17], scale: 0.13, rot: [0, Math.PI / 2, 0], color: C.ink },
      { kind: 'box', pos: [0, 0.3, 0.02], scale: [0.1, 0.16, 0.08], color: C.blue },
      { kind: 'sphere', pos: [0, 0.43, 0.02], scale: 0.12, color: C.skin }, { kind: 'dome', pos: [0, 0.44, 0.02], scale: 0.15, color: C.yellow },
    ] }), object = new THREE.Group();
    object.add(part.object);
    return {
      object,
      update(dt, t) { const a = t * 1.2; part.object.position.set(Math.cos(a) * SCOOTER_R, 0, Math.sin(a) * SCOOTER_R); part.object.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a)); },
      dispose: part.dispose,
    };
  },
};

// ── 劇本（§5.1：放下與放晴是 ◆、≤ 8 s；移站一級 ≤ 4.5 s）──
// 名單、位置都是演到那一拍才查（劇本在回合開始時一次建好，那時還不知道誰在哪）；once 查到第一次就記住，整段同一批人。
const HURRY = 2.0, HUDDLE = 0.6;   // 趕著躲雨的走路速度；在門裡躲多久才走出來
const DOOR_MIN = 0.35;   // 算「建築」的 footprint 最小半寬（路燈 0.15、牛奶箱 0.3 不算門）
export const HOP = 1.5;  // 移站：雲從上一站飄到下一站幾秒（設計 §7：1.0–2.0）
// 鏡頭（§13.1、計畫 3.8 Task 6）：雲在 4–5 單位高，對著地面拉近會把雲切掉——注視點抬到雲和地面中間、zoom 0.8。
// 放下（躲雨）、雨過天晴是全島的事：雲到站之後回全景（focus('home')）；移站對著新的那一站上空
const cloudView = p => ({ x: p.x, y: 2.6, z: p.z }), CLOUD_ZOOM = 0.8;
const cloudFocus = (B, p) => B.focus(cloudView(p), { zoom: CLOUD_ZOOM });
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };

// 全島看得見的小人：所有名冊裡 people 的成員（模型的老鼠不算），躲起來的不算
const everyone = c => c.roster.keys().flatMap(k => c.roster.members(k)).filter(m => m.kind === 'people' && !m.hidden);
// 最近的建築門口：離 pos 最近的主島建築（footprint 中心），從它面向 pos 那一側找最近的可走點；沒有建築就原地。
// footprint 帶 door 的照它（溫泉池 false：池子不能躲；小澡堂 true：比 DOOR_MIN 小也算門），其他照大小判斷
function nearestDoor(c, pos) {
  const ext = f => f.r ?? (f.rx != null ? Math.min(f.rx, f.rz) : Math.min(f.w, f.d) / 2);
  const fps = c.stage.footprints().filter(f => (f.door ?? ext(f) >= DOOR_MIN) && cellAt(f.x, f.z));
  if (!fps.length) return pos;
  const f = fps.reduce((a, b) => (Math.hypot(b.x - pos.x, b.z - pos.z) < Math.hypot(a.x - pos.x, a.z - pos.z) ? b : a));
  const d = Math.hypot(pos.x - f.x, pos.z - f.z) || 1, k = ext(f) * 0.9 / d;
  return c.nav.nearestWalkable({ x: f.x + (pos.x - f.x) * k, z: f.z + (pos.z - f.z) * k });
}
// 走到門口就躲進去（藏起來、不閃；躲 HUDDLE 秒後由放下劇本的 comeOut 放出來走回家，跳過時 snap 也會全部露出來）
function toDoor(B, m) {
  const w = B.walk(m, c => nearestDoor(c, m.pos), { speed: HURRY }), end = w.end;
  w.end = c => { end(c); c.roster.hide(m); };
  return w;
}
// 移站：鏡頭對著新的那一站上空 → 雲換到新站（不閃）、雨照舞台變小（Lv2–3 是 LINGER）→ 從上一站的位置飄過來 → LEVEL UP。
// 淹水、外送、巨蛋淹水、鼠災是接著的 fx 事件（turn.js 預設劇本）
function hop(e, s, ctx) {
  const { B } = ctx, at = STOPS[e.to], from = STOPS[e.to - 1];
  return [
    cloudFocus(B, at),
    B.apply(e, { only: ['typhoon.main'], blink: false }), B.worldNow(),
    B.move('typhoon.main', { from: { dx: from.x - at.x, dy: from.y - at.y, dz: from.z - at.z }, to: 0, dur: HOP }),
    B.apply(e), B.levelUp('typhoon'),
  ];
}

export const script = {
  // ◆ 放下（颱風到 101 旁邊上空）：鏡頭對著雲 → 暴風雲從台地後面飄進來（2.5 s）→ 回全景 → 閃白下大雨 → 雲鼓脹，
  // 同一刻全島小人 ！、各自快走到最近的建築門口、到了就躲進去（雨閃完才出發，躲進門的那一刻沒有東西在閃）→ 躲 HUDDLE 秒 →
  // 躲著的時候船消失、風車被吹得搖、外送機車出來（剩下的零件一次閃白）→ 從門口走出來（淋著雨，用走路速度走回家；走回去是背景，不佔劇本秒數）。
  // ◆ ≤ 8 s live（§5.3）：飄進來與舊的登陸併成一段，鼓脹、！、走去門口一起演。放下事件沒有 LEVEL UP（同所有物品的放下）
  placed(e, s, ctx) {
    // 主島上的人（演到 ！ 那一拍才查、整段同一批）：衛星島上的人不走（走路格只有主島），也不被這段劇本放回日常——
    //   2026-10-31 Task 5：以前 comeOut 放回的是全島名單，衛星島上繞圈的人沒被叫過也被 home() 一次，走到一半的那一圈被打斷
    const { B } = ctx, cast = once(c => everyone(c).filter(m => cellAt(m.pos.x, m.pos.z)));
    // 走出來：躲著的人露出來（就在門口，不閃）、交回日常並標 hurry（走路速度、不等焦點），其他被叫去的人一樣放回日常
    const comeOut = { kind: 'home', dur: 0, start(c) { for (const m of cast(c) ?? []) { if (m.hidden) c.roster.show(m); c.roster.home(m, { hurry: true }); } } };
    const shelter = crowd(B, c => cast(c).map(m => toDoor(B, m)));
    return [
      cloudFocus(B, STOPS[1]), B.apply(e, { only: ['typhoon.main'], blink: false }),
      B.move('typhoon.main', { from: { dx: -6, dy: 0, dz: -5 }, to: 0, dur: 2.5 }),   // 飄進來 3 → 2.5 s（裁決 R17）
      B.focus('home'), B.apply(e, { only: ['typhoon.rain'] }), B.world({ storm: 1, rain: 1 }),
      // ！ 跟放晴的 ♪ 一樣只給主島上的人：衛星島最外圈的人在全景邊上（選擇帶動升級裁決 R6）
      B.together([B.gesture('typhoon.main', 'puff'), crowd(B, c => cast(c).map(m => B.bubble(m, '！', 0.8))), shelter]),
      // 躲著的時候剩下的零件一起閃白（船消失、風車搖、外送機車；◆ ≤ 8 s：不另外排一拍），之後走出來
      B.together([B.wait(HUDDLE), B.apply(e)]), comeOut,
    ];
  },
  grow: {
    2: hop,
    3: hop,
    // ◆ 雨過天晴：雲、雨、機車閃白後拿掉 → 天晴 → 彩虹從台地後升起 → 河濱公園與堤防一起閃白 → 主島的小人一起 ♪ → 屋頂換色 → LEVEL UP
    // （躲雨的人在放下的劇本裡就走出來了）
    4(e, s, ctx) {
      const { B } = ctx;
      return [
        B.focus('home'), B.apply(e, { only: ['typhoon.main', 'typhoon.rain', 'typhoon.scooter'] }), B.world({ storm: 0, rain: 0 }),
        B.apply(e, { only: ['typhoon.rainbow'], blink: false }), B.scaleIn('typhoon.rainbow', { dur: 1.2 }),
        B.apply(e, { only: ['typhoon.park', 'typhoon.levee'] }),
        // ♪ 只給主島上的人：衛星島最外圈（遊樂場島、森林島）的人在全景邊上、常常一半在畫面外
        crowd(B, c => everyone(c).filter(m => cellAt(m.pos.x, m.pos.z)).map(m => B.bubble(m, '♪', 0.9))), B.home(everyone),
        B.apply(e), B.levelUp('typhoon'),
      ];
    },
  },
};
// ◆ 關鍵節點（§5.3）：颱風 1（放下：到 101、全島躲雨）、4（放晴）。放下的 ◆ 由 turn.js 讀 script.placed.key
script.placed.key = script.grow[4].key = true;

// 拜訪點（計畫 6 設計 §4）：颱風是天氣——沒有人拜訪它，每一級都是 null
export const visitSpot = () => null;
