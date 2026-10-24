// 日夜：政策島提示詞 §4 的 keyframe 表，keyframe 之間線性插值。純函式。
// 欄位：minute, skyTop, horizon, sunColor, sunI, hemiSky, hemiGround, hemiI, night, water
export const KEYFRAMES = [
  [0, 0x1e2c58, 0x3f4f80, 0xb4c2ff, 1.15, 0x94a2d8, 0x64566a, 1.85, 1, 0x5a88b2],
  [300, 0x26365f, 0x4c5688, 0xb8c4ff, 1.0, 0x96a4da, 0x66586c, 1.85, 1, 0x5c8ab4],
  [360, 0x7f8fc4, 0xf6c3a6, 0xffb48a, 1.3, 0xf3c6b5, 0x6b5a5a, 1.1, 0.55, 0x8fb7c4],
  [450, 0xa9d1ea, 0xfbe6d3, 0xffe2c4, 2.4, 0xeaf2f6, 0x8a7a68, 1.25, 0, 0x9fcfd6],
  [720, 0x9fd0ec, 0xf4eee3, 0xfff1de, 2.9, 0xeef6fa, 0x8f8270, 1.35, 0, 0xa9d8db],
  [960, 0xa6cfe6, 0xf8e7d2, 0xffe3c0, 2.5, 0xf1efe8, 0x8a7a66, 1.25, 0, 0x9fcbd2],
  [1065, 0x8b8fc4, 0xf7b98f, 0xff9f6a, 1.8, 0xf6d2bc, 0x7d6660, 1.2, 0.3, 0x93a9bd],
  [1140, 0x5a5e9e, 0xd99aa6, 0xff9a7a, 1.3, 0xc0b2e0, 0x655868, 1.35, 0.75, 0x6a7cab],
  [1260, 0x22325f, 0x445488, 0xc0ccff, 1.2, 0x98a8dc, 0x685a6e, 1.9, 1, 0x5a88b2],
  [1440, 0x1e2c58, 0x3f4f80, 0xb4c2ff, 1.15, 0x94a2d8, 0x64566a, 1.85, 1, 0x5a88b2],
];
const FIELDS = ['skyTop', 'horizon', 'sunColor', 'sunI', 'hemiSky', 'hemiGround', 'hemiI', 'night', 'water'];
const COLORS = new Set(['skyTop', 'horizon', 'sunColor', 'hemiSky', 'hemiGround', 'water']);

// 開局 10:00；燈泡 Lv3 → 黃昏；燈泡 Lv4／結局 → 夜晚
export const TIMES = { day: 600, dusk: 1065, night: 1260 };

const lerp = (a, b, t) => a * (1 - t) + b * t;
export function lerpColor(a, b, t) {
  let out = 0;
  for (const shift of [16, 8, 0]) out |= Math.round(lerp((a >> shift) & 255, (b >> shift) & 255, t)) << shift;
  return out;
}

export function sample(minute) {
  const m = ((minute % 1440) + 1440) % 1440;
  let i = 0;
  while (KEYFRAMES[i + 1][0] <= m && i < KEYFRAMES.length - 2) i++;
  const a = KEYFRAMES[i], b = KEYFRAMES[i + 1], t = (m - a[0]) / (b[0] - a[0]);
  return Object.fromEntries(FIELDS.map((f, k) => [f, COLORS.has(f) ? lerpColor(a[k + 1], b[k + 1], t) : lerp(a[k + 1], b[k + 1], t)]));
}

export function sunDirection(minute) {
  const m = Math.floor(minute / 10) * 10;
  const t = Math.min(1, Math.max(0, (m - 360) / 720));
  const az = Math.PI * (0.15 + 0.7 * t), el = 0.35 + Math.sin(t * Math.PI) * 0.75;
  const x = Math.cos(az) * Math.cos(el), y = Math.sin(el), z = 0.55 * Math.cos(el) + 0.35, n = Math.hypot(x, y, z);
  return { x: x / n, y: y / n, z: z / n };
}
