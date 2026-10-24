// 六角格幾何（pointy-top，頂點朝 ±z）。數值來自政策島提示詞 §2，純函式、不依賴 three。
export const R = 2.02, SPACING = 2.28, TOP = 0.65, WATER_Y = -0.18, PLATEAU_TOP = 1.15, RING_R = 1.8;
const SQ3 = Math.sqrt(3);

export const MAIN_CELLS = [[0, 0], [1, 0], [-1, 0], [0, 1], [-1, 1], [0, -1], [1, -1]];   // 中心 + 一圈
export const PLATEAU_CELLS = [[0, -1], [1, -1]];                                          // 北側兩格墊高：陽明山、溫泉
export const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
// 衛星島放在主島外約半徑 10 的一圈（軸座標可以是小數），全景畫面裝得下、和主島隔一條水道
export const SATELLITES = [
  { kind: 'lighthouse', q: 2.6, r: 0 }, { kind: 'windmill', q: -2.6, r: 0 }, { kind: 'rocks', q: 1.6, r: 1.6 },
  { kind: 'pyramid', q: -2.6, r: 2.6 }, { kind: 'playground', q: 2.6, r: -2.6 }, { kind: 'forest', q: 0, r: -2.6 }, { kind: 'chest', q: 0, r: 2.6 },
];

export function axialToWorld(q, r) { return { x: SQ3 * SPACING * (q + r / 2), z: 1.5 * SPACING * r }; }

export function hexCorners(cx, cz, radius) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI / 2 + i * Math.PI / 3;          // 第一個角在 −z
    return { x: cx + Math.cos(a) * radius, z: cz + Math.sin(a) * radius };
  });
}

const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const isNeighbor = (a, b) => NEIGHBORS.some(([dq, dr]) => a[0] + dq === b[0] && a[1] + dr === b[1]);

export function adjacentPairs(cells) {
  const out = [];
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) if (isNeighbor(cells[i], cells[j])) out.push([cells[i], cells[j]]);
  return out;
}

export function edgeMidpoint(cellA, cellB, radius = RING_R) {
  const ca = axialToWorld(...cellA), cb = axialToWorld(...cellB);
  const len = Math.hypot(cb.x - ca.x, cb.z - ca.z), dx = (cb.x - ca.x) / len, dz = (cb.z - ca.z) / len;
  return { a: { x: ca.x + dx * radius, z: ca.z + dz * radius }, b: { x: cb.x - dx * radius, z: cb.z - dz * radius } };
}

export function cellTop(cell) { return PLATEAU_CELLS.some(p => same(p, cell)) ? PLATEAU_TOP : TOP; }
