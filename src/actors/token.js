// 代幣（§5.1）：捷運站 → 環狀線與 3 節列車 → 5 節 → 支線接到兩座衛星島 → 接駁車 → 霓虹無人列車。捷運淹水時站體變游泳池、列車停駛。
// TRACK 與 trainPose 也給老鼠用（老鼠坐在車頂上）。ctx.rail.offset 是共用的列車時鐘偏移（讓列車從站出發）。
import { anchorWorld } from './anchors.js';
import { TOP, groundAt, axialToWorld, SATELLITES } from '../scene/hex.js';
import { C, roofColor, rebuilt, offset } from './palette.js';
import { createPathCursor } from '../scene/path.js';
import { clampLv } from './clamp.js';

export const id = 'token';
export const labelY = 1.0;
// 環狀線沿著主島外圍的水道繞（像淡水線沿河），橋墩立在水裡；放低、放外面才不會擋住島上的東西
export const TRACK = { radius: 8.3, y: TOP - 0.25 };   // 比島面低：從前面看只會切到島的側壁，不會切到建築
const GAP = 0.6;   // 車廂間距（弧長）
const POOL = 0xa4d4da;
const AT = anchorWorld('token');
export const POST = offset(AT, 0.6, 0.55), DOOR = offset(AT, 0, 0.5);   // 站務員的崗位（站門口旁）、站門
// 名冊入口（§13.2）：站體北側（背面），站務員與泳客都從這裡繞過站體走來。計畫給的 offset(AT, 1.6, 0.9) 離崗位只有 1.06；
// 往外推到 ≥ 1.5 的點（+x、+z 那側）又會穿過珍奶攤車前的人龍。這一點離崗位 2.4、離泳客站位 ≥ 1.6，兩條正解每一刻都走得到，
// 走到崗位的路線離 Lv1–2 每個排隊站位 ≥ 0.3、不經過攤車前方
export const STAFF_ENTRY = offset(AT, -0.35, -1.65);

// 第 i 節車廂在時間 t 的位置：逆時針繞島，角速度 speed（rad/s）
export function trainPose(t, i, { speed = 0.35 } = {}) {
  const a = t * speed - i * GAP / TRACK.radius;
  return { x: Math.cos(a) * TRACK.radius, y: TRACK.y, z: Math.sin(a) * TRACK.radius, yaw: Math.atan2(-Math.sin(a), Math.cos(a)) };
}

const pylon = (x, z) => { const base = groundAt(x, z), h = TRACK.y - base; return { kind: 'cylinder', pos: [x, base + h / 2, z], scale: [0.12, h, 0.12], color: C.curb }; };

// 支線的中心線（給接駁車走）：從環上離衛星島最近的點到島上
export function spurPath(kind) {
  const s = SATELLITES.find(x => x.kind === kind), c = axialToWorld(s.q, s.r), d = Math.hypot(c.x, c.z), ux = c.x / d, uz = c.z / d;
  const y0 = TRACK.y + 0.1, y1 = TOP - 0.2 + 0.2;
  return [{ x: ux * TRACK.radius, y: y0, z: uz * TRACK.radius }, { x: ux * (d - 1.0), y: y1, z: uz * (d - 1.0) }];
}

// 環上離衛星島最近的點，用 8 段階梯狀的高架一路降到島上。每 4 段合成一個零件（at 在那 4 段的中間）：
// Lv4 分兩次閃白長出來；一段一個零件會多 16 個 mesh，全開的畫面 draw call 超過 150
export const SPUR_PARTS = 2;
function spur(kind) {
  const s = SATELLITES.find(x => x.kind === kind), c = axialToWorld(s.q, s.r), d = Math.hypot(c.x, c.z), ux = c.x / d, uz = c.z / d;
  const from = TRACK.radius, to = d - 1.0, y0 = TRACK.y, y1 = TOP - 0.2 + 0.1, seg = (to - from) / 8, per = 8 / SPUR_PARTS;
  const point = k => ({ x: ux * (from + seg * k), y: y0 + (y1 - y0) * k / 8, z: uz * (from + seg * k) });   // 第 k 段起點（k 可以是小數）
  return Array.from({ length: SPUR_PARTS }, (_, j) => {
    const at = point(per * (j + 0.5)), parts = [];
    for (let i = per * j; i < per * (j + 1); i++) {
      const p = point(i + 0.5), pos = [p.x - at.x, p.y - at.y, p.z - at.z];
      parts.push({ kind: 'box', pos, scale: [0.3, 0.08, seg * 1.05], rot: [0, Math.atan2(ux, uz), 0], color: C.cream });
      if (i % 2 === 1 && i < 7) { const q = pylon(p.x, p.z); parts.push({ ...q, pos: [pos[0], q.pos[1] - at.y, pos[2]] }); }
    }
    return { kind: 'compound', at, footprint: false, parts };
  });
}

export function view(lv, flags) {
  lv = clampLv(lv);   // 過渡期：超過舊 max 的級數先照舊 max 畫（clamp.js）
  const n = lv.token, at = anchorWorld('token'), v = {};
  if (!n) return v;
  // 站體的 footprint（§14.1，錄影裡有人站進站體）：平常是站房＋圓頂＋售票機的框，淹水是整個泳池
  v['token.main'] = flags.flooded
    ? { kind: 'compound', at, footprint: { r: 0.65 }, parts: [
      { kind: 'cylinder', pos: [0, 0.05, 0], scale: [1.3, 0.1, 1.3], color: C.cliff },
      { kind: 'cylinder', pos: [0, 0.07, 0], scale: [1.12, 0.1, 1.12], color: POOL },
      { kind: 'box', pos: [0.6, 0.175, 0.3], scale: [0.2, 0.35, 0.2], color: C.blue },
    ] }
    : { kind: 'compound', at, footprint: { x: 0.125, z: 0, w: 1.15, d: 0.9 }, parts: [
      { kind: 'box', pos: [0, 0.25, 0], scale: [0.9, 0.5, 0.7], color: C.wall },
      { kind: 'dome', pos: [0, 0.5, 0], scale: [0.9, 0.6, 0.9], color: roofColor(C.navy, rebuilt(lv)) },
      { kind: 'box', pos: [0, 0.16, 0.36], scale: [0.3, 0.32, 0.02], color: C.window },
      { kind: 'box', pos: [0.6, 0.175, 0.3], scale: [0.2, 0.35, 0.2], color: C.blue },
      { kind: 'cylinder', pos: [0.6, 0.3, 0.41], scale: [0.08, 0.02, 0.08], rot: [Math.PI / 2, 0, 0], color: C.neonBlue },
    ] };
  // 站務員站在站門口、面向外；淹水時他原地換成泳客（from），再多一個泳客；Lv6 無人列車就沒有站務員。
  // 站位落在站體（含 PAD）裡就站到最近的可走點（rescue）：泳客站在池邊、站務員站在售票機前
  if (flags.flooded) v['token.swimmers'] = { kind: 'roster', at, n: 2, accessory: 'none', from: 'token.staff', home: { kind: 'stand', spots: [{ ...offset(at, -0.25, 0.1, -0.12), yaw: 0.5 }, { ...offset(at, 0.25, -0.15, -0.12), yaw: -2 }], rescue: true, entry: STAFF_ENTRY } };
  else if (n < 6) v['token.staff'] = { kind: 'roster', at, n: 1, accessory: 'uniform', home: { kind: 'stand', spots: [{ ...POST, yaw: 0 }], rescue: true, entry: STAFF_ENTRY } };
  if (n >= 2) {
    const origin = { x: 0, y: 0, z: 0 }, parts = [{ kind: 'rail', pos: [0, TRACK.y, 0], scale: TRACK.radius * 2, rot: [Math.PI / 2, 0, 0], color: C.cream }];
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + 0.13; parts.push(pylon(Math.cos(a) * TRACK.radius, Math.sin(a) * TRACK.radius)); }
    v['token.track'] = { kind: 'compound', at: origin, parts, footprint: false };
    if (n >= 4) for (const kind of ['lighthouse', 'playground']) spur(kind).forEach((p, i) => { v[`token.spur.${kind}.${i}`] = p; });
    // 接駁車走遊樂場島的支線（at 在支線起點：從那裡閃白出現）
    if (n >= 5) { const path = spurPath('playground'); v['token.shuttle'] = { kind: 'shuttle', at: path[0], path, speed: flags.flooded ? 0 : 0.6, footprint: false }; }
    v['token.train'] = { kind: 'train', at: origin, cars: n >= 3 ? 5 : 3, speed: flags.flooded ? 0 : 0.35, neon: n >= 6, footprint: false };
  }
  return v;
}

export const builders = {
  // 小島接駁車：一節黃色小車在支線上來回
  shuttle(THREE, spec, ctx) {
    const car = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: [{ kind: 'rbox', pos: [0, 0.14, 0], scale: [0.25, 0.22, 0.4], color: C.yellow }, { kind: 'box', pos: [0, 0.18, 0], scale: [0.26, 0.06, 0.32], color: C.white }] });
    const object = new THREE.Group(), cursor = createPathCursor(spec.path, { loop: false }), o = spec.at; object.add(car.object);   // path 是世界座標，車放在 at 底下
    return { object, update(dt) { cursor.advance(dt * spec.speed); const p = cursor.locate(); car.object.position.set(p.x - o.x, p.y - o.y, p.z - o.z); car.object.rotation.y = p.yaw; }, dispose: car.dispose };
  },
  // 列車：每節一個圓角車廂 + 白色窗帶，沿環狀線跑；霓虹列車整節發藍光
  train(THREE, spec, ctx) {
    const object = new THREE.Group(), body = spec.neon ? { color: C.neonBlue, glow: C.neonBlue } : { color: C.blue };
    const cars = Array.from({ length: spec.cars }, () => {
      const c = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: [
        { kind: 'rbox', pos: [0, 0.17, 0], scale: [0.3, 0.3, 0.55], ...body },
        { kind: 'box', pos: [0, 0.22, 0], scale: [0.31, 0.08, 0.45], color: C.white },
      ] });
      object.add(c.object); return c;
    });
    return {
      object,
      update(dt, t) { const tt = t + (ctx.rail?.offset ?? 0); cars.forEach((c, i) => { const p = trainPose(tt, i, { speed: spec.speed }); c.object.position.set(p.x, p.y, p.z); c.object.rotation.y = p.yaw; }); },
      dispose() { for (const c of cars) c.dispose(); },
    };
  },
};

// ── 劇本（§8.4）──
// 角色都是演到那一拍才找（還沒出來就回 null，那拍跳過）；once 找到第一次就記住，整段劇本同一個人。
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };
const staffOf = () => once(c => c.roster.members('token.staff').find(m => !m.hidden) ?? null);
const kid = i => c => c.roster.members('sat.playground')[i] ?? null;
const STATION_BEARING = Math.atan2(AT.z, AT.x);
// 站前島緣：站的方位上、半徑 7 的那點（在水裡）最近的可走點；footprint 會變，演到才算
const shore = c => c.nav.nearestWalkable({ x: Math.cos(STATION_BEARING) * 7.0, z: Math.sin(STATION_BEARING) * 7.0 });
const satCentre = kind => { const s = SATELLITES.find(x => x.kind === kind), c = axialToWorld(s.q, s.r); return { x: c.x, y: TOP - 0.2, z: c.z }; };
const LIGHTHOUSE = satCentre('lighthouse'), PLAYGROUND = satCentre('playground');
// 接駁車在遊樂場島那頭的終點往島心收 0.3：小孩下車的地方；溜滑梯腳下兩個點（相距 0.4）
const KID_OFF = (() => { const e = spurPath('playground').at(-1), d = Math.hypot(e.x, e.z), k = (d + 0.3) / d; return { x: e.x * k, y: TOP - 0.2, z: e.z * k }; })();
const SLIDE = [offset(PLAYGROUND, 0.1, 1.1), offset(PLAYGROUND, 0.5, 1.1)];
// 鏡頭（§13.1）：衛星島拉近 0.8（島和支線都要進畫面）；LEVEL UP 在站上，鏡頭跟 LEVEL UP 一起轉回代幣格（levelUp 1 秒 ≥ focus 拍，不多佔時間）
const ISLAND_ZOOM = 0.8;
const levelUpAtStation = B => B.together([B.focus('token'), B.levelUp('token')]);
// 站務員跑進站體：名冊把他藏起來（Lv6 的 view 不再宣告站務員，apply 時名冊收走）
const hide = who => ({ kind: 'hide', dur: 0, start(c) { const m = who(c); if (m) c.roster.hide(m); return false; } });

export const script = {
  // 閃白車站 → 站務員從月台外側（入口）走到崗位 → ♪
  placed(e, s, ctx) {
    const { B } = ctx, st = staffOf();
    return [B.apply(e, { hold: ['token.staff'] }), B.spawn('token.staff', STAFF_ENTRY), B.walk(st, POST), B.bubble(st, '♪'), B.home(st)];
  },
  grow: {
    // 環狀線：站務員走到站前島緣 → …… → 圖框「列車」→ 軌道從海面升起 → 列車從站後面駛出（車頭在站後面閃白出現）
    2(e, s, ctx) {
      const { B } = ctx, st = staffOf();
      return [
        B.walk(st, shore), B.bubble(st, '……'), B.bubble(st, { icon: 'train' }),
        B.apply(e, { only: ['token.track'], blink: false }), B.scaleIn('token.track', { dur: 0.8 }),
        B.together([B.apply(e), B.trainDepart()]),   // 先建好列車（藏著）再改時鐘，列車才在站後面閃白
        B.home(st), B.levelUp('token'),
      ];
    },
    // 五節：列車進站停 → 站務員揮手 → 閃白多兩節 → 開走
    3(e, s, ctx) {
      const { B } = ctx, st = staffOf();
      return [B.trainStop({ during: [B.gesture(st, 'wave')] }), B.apply(e), B.levelUp('token')];
    },
    // 支線（棒球 ≥3）：站務員 …… → 圖框「小島」→ 鏡頭到燈塔島（zoom 0.8）→ 兩條支線從環上往島上分段閃白長出（兩條同一段一起）→
    // 鏡頭跟 LEVEL UP 一起回代幣格
    4(e, s, ctx) {
      const { B } = ctx, st = staffOf();
      return [
        B.bubble(st, '……', 0.9), B.bubble(st, { icon: 'islet' }, 0.9), B.focus(LIGHTHOUSE, { zoom: ISLAND_ZOOM }),
        ...Array.from({ length: SPUR_PARTS }, (_, i) => B.apply(e, { only: [`token.spur.lighthouse.${i}`, `token.spur.playground.${i}`] })),
        levelUpAtStation(B),
      ];
    },
    // 接駁車：鏡頭到遊樂場島（zoom 0.8）→ 閃白接駁車在支線起點 → 開到島上 → 鮮奶 ≥2 時兩個小孩下車走到溜滑梯 → 鏡頭跟 LEVEL UP 一起回代幣格
    5(e, s, ctx) {
      const { B } = ctx, kids = s.lv.milk >= 2;
      return [
        B.focus(PLAYGROUND, { zoom: ISLAND_ZOOM }),
        B.apply(e, { only: ['token.shuttle', ...(kids ? ['sat.playground'] : [])], hold: ['sat.playground'] }),
        B.wait(3),   // 車速 0.6，支線約 2.2：開到島那頭
        ...(kids ? [
          B.spawn('sat.playground', KID_OFF), B.spawn('sat.playground', offset(KID_OFF, 0.25, 0.15)),
          B.together([0, 1].map(i => B.walk(kid(i), SLIDE[i]))), B.home([kid(0), kid(1)]),
        ] : []),
        B.apply(e), levelUpAtStation(B),
      ];
    },
    // 無人霓虹（老鼠 ≥3）：列車進站停 → 車頂老鼠 ♪ → 站務員 ！ → 跑進站體（消失）→ 列車閃白變霓虹 → 開走
    6(e, s, ctx) {
      const { B } = ctx, st = staffOf();
      return [
        B.trainStop({ during: [B.bubble(B.trainHead(ctx), '♪'), B.bubble(st, '！'), B.walk(st, DOOR), hide(st)] }),
        B.apply(e), B.levelUp('token'),
      ];
    },
  },
  fx: () => null,   // 捷運淹水是颱風的劇本（cause 是颱風）
  rep: (s, ctx) => ctx.roster.members('token.staff').find(m => !m.hidden) ?? null,   // 等待圖框的代表：藏起來的人（躲進門裡）不算
};
