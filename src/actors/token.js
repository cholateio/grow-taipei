// 代幣（§5.1）：捷運站 → 高架環狀線與列車 → 支線接到兩座衛星島、5 節車 → 霓虹無人列車。捷運淹水時站體變游泳池、列車停駛。
// TRACK 與 trainPose 也給老鼠用（老鼠坐在車頂上）。
import { anchorWorld } from './anchors.js';
import { TOP, groundAt, axialToWorld, SATELLITES } from '../scene/hex.js';
import { C, roofColor, rebuilt, offset } from './palette.js';

export const id = 'token';
export const labelY = 1.0;
export const TRACK = { radius: 6.6, y: TOP + 1.35 };
const GAP = 0.6;   // 車廂間距（弧長）
const POOL = 0xa4d4da;

// 第 i 節車廂在時間 t 的位置：逆時針繞島，角速度 speed（rad/s）
export function trainPose(t, i, { speed = 0.35 } = {}) {
  const a = t * speed - i * GAP / TRACK.radius;
  return { x: Math.cos(a) * TRACK.radius, y: TRACK.y, z: Math.sin(a) * TRACK.radius, yaw: Math.atan2(-Math.sin(a), Math.cos(a)) };
}

const pylon = (x, z) => { const base = groundAt(x, z), h = TRACK.y - base; return { kind: 'cylinder', pos: [x, base + h / 2, z], scale: [0.12, h, 0.12], color: C.curb }; };

// 環上離衛星島最近的點，用 8 段階梯狀的高架一路降到島上
function spur(kind) {
  const s = SATELLITES.find(x => x.kind === kind), c = axialToWorld(s.q, s.r), d = Math.hypot(c.x, c.z), ux = c.x / d, uz = c.z / d;
  const from = TRACK.radius, to = d - 1.0, y0 = TRACK.y, y1 = TOP - 0.2 + 0.3, parts = [], seg = (to - from) / 8;
  for (let i = 0; i < 8; i++) {
    const r = from + seg * (i + 0.5), y = y0 + (y1 - y0) * (i + 0.5) / 8;
    parts.push({ kind: 'box', pos: [ux * r, y, uz * r], scale: [0.3, 0.08, seg * 1.05], rot: [0, Math.atan2(ux, uz), 0], color: C.cream });
    if (i % 2 === 1 && i < 7) parts.push(pylon(ux * r, uz * r));
  }
  return parts;
}

export function view(lv, flags) {
  const n = lv.token, at = anchorWorld('token'), v = {};
  if (!n) return v;
  v['token.main'] = flags.flooded
    ? { kind: 'compound', at, parts: [
      { kind: 'cylinder', pos: [0, 0.05, 0], scale: [1.3, 0.1, 1.3], color: C.cliff },
      { kind: 'cylinder', pos: [0, 0.07, 0], scale: [1.12, 0.1, 1.12], color: POOL },
      { kind: 'box', pos: [0.6, 0.175, 0.3], scale: [0.2, 0.35, 0.2], color: C.blue },
    ] }
    : { kind: 'compound', at, parts: [
      { kind: 'box', pos: [0, 0.25, 0], scale: [0.9, 0.5, 0.7], color: C.wall },
      { kind: 'dome', pos: [0, 0.5, 0], scale: [0.9, 0.6, 0.9], color: roofColor(C.navy, rebuilt(lv)) },
      { kind: 'box', pos: [0, 0.16, 0.36], scale: [0.3, 0.32, 0.02], color: C.window },
      { kind: 'box', pos: [0.6, 0.175, 0.3], scale: [0.2, 0.35, 0.2], color: C.blue },
      { kind: 'cylinder', pos: [0.6, 0.3, 0.41], scale: [0.08, 0.02, 0.08], rot: [Math.PI / 2, 0, 0], color: C.neonBlue },
    ] };
  if (flags.flooded) v['token.swimmers'] = { kind: 'people', at, n: 2, stand: [{ ...offset(at, -0.25, 0.1, -0.12), yaw: 0.5 }, { ...offset(at, 0.25, -0.15, -0.12), yaw: -2 }] };
  if (n >= 2) {
    const origin = { x: 0, y: 0, z: 0 }, parts = [{ kind: 'rail', pos: [0, TRACK.y, 0], scale: TRACK.radius * 2, rot: [Math.PI / 2, 0, 0], color: C.cream }];
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + 0.13; parts.push(pylon(Math.cos(a) * TRACK.radius, Math.sin(a) * TRACK.radius)); }
    v['token.track'] = { kind: 'compound', at: origin, parts };
    if (n >= 3) v['token.spurs'] = { kind: 'compound', at: origin, parts: [...spur('lighthouse'), ...spur('playground')] };
    v['token.train'] = { kind: 'train', at: origin, cars: n >= 3 ? 5 : 3, speed: flags.flooded ? 0 : 0.35, neon: n >= 4 };
  }
  return v;
}

export const builders = {
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
      update(dt, t) { cars.forEach((c, i) => { const p = trainPose(t, i, { speed: spec.speed }); c.object.position.set(p.x, p.y, p.z); c.object.rotation.y = p.yaw; }); },
      dispose() { for (const c of cars) c.dispose(); },
    };
  },
};
