// 代幣（§5.1）：捷運站 → 高架環狀線與列車 → 支線接到兩座衛星島、5 節車 → 霓虹無人列車。捷運淹水時站體變游泳池、列車停駛。
// TRACK 與 trainPose 也給老鼠用（老鼠坐在車頂上）。
import { TOP } from '../scene/hex.js';

export const id = 'token';
export const labelY = 1.0;
export const TRACK = { radius: 6.6, y: TOP + 1.35 };
const GAP = 0.6;   // 車廂間距（弧長）

// 第 i 節車廂在時間 t 的位置：逆時針繞島，角速度 speed（rad/s）
export function trainPose(t, i, { speed = 0.35 } = {}) {
  const a = t * speed - i * GAP / TRACK.radius;
  return { x: Math.cos(a) * TRACK.radius, y: TRACK.y, z: Math.sin(a) * TRACK.radius, yaw: Math.atan2(-Math.sin(a), Math.cos(a)) };
}

export function view() { return {}; }
