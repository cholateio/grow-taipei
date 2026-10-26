// 八個物品、101 與地標在主島上的位置（格 + 格內偏移）。純資料，演員都用這張表。
import { axialToWorld, cellTop, edgeMidpoint, NEIGHBORS, RING_R } from '../scene/hex.js';

export const ANCHORS = {
  milk: { cell: [-1, 0], dx: 0, dz: 0.1 },       chip: { cell: [1, 0], dx: 0.1, dz: -0.2 },
  bulb: { cell: [0, 0], dx: -1.3, dz: 1.1 },     token: { cell: [0, 1], dx: -0.8, dz: 0.1 },
  typhoon: { cell: [0, 0], dx: -0.6, dz: -1.2 }, rat: { cell: [-1, 1], dx: 1.3, dz: 1.0 },
  boba: { cell: [0, 1], dx: 1.0, dz: 0.4 },      baseball: { cell: [-1, 1], dx: -0.2, dz: -0.2 },
  tower: { cell: [0, 0], dx: 0.6, dz: -0.3 },
};
// 北側台地：陽明山（火山）與北投溫泉；中心格的河濱公園；捷運站旁的夜市
export const LANDMARKS = {
  volcano: { cell: [0, -1], dx: -0.2, dz: 0.1 }, spring: { cell: [1, -1], dx: 0.1, dz: 0.2 },
  park: { cell: [0, 0], dx: 1.2, dz: 1.2 },      market: { cell: [0, 1], dx: 1.0, dz: -0.9 },
};

const toWorld = a => { const c = axialToWorld(...a.cell); return { x: c.x + a.dx, y: cellTop(a.cell), z: c.z + a.dz }; };
export const anchorWorld = id => toWorld(ANCHORS[id]);
export const landmarkWorld = name => toWorld(LANDMARKS[name]);
// 物品（或 'tower'）所在的格子 [q, r]，不認得的 id（'turn'）回 null；格子中心（地面高度）——鏡頭跟主線平移的目標（§13.1）
export const cellOf = id => (ANCHORS[id] ? [...ANCHORS[id].cell] : null);
export const cellCentre = cell => { const c = axialToWorld(...cell); return { x: c.x, y: cellTop(cell), z: c.z }; };

// 相鄰兩格之間的步行路線：起點 → A 的橋頭 → B 的橋頭 → 終點（橋的位置和 island.js 一樣）
export function routeBetween(cellA, pA, cellB, pB) {
  if (!NEIGHBORS.some(([dq, dr]) => cellA[0] + dq === cellB[0] && cellA[1] + dr === cellB[1])) throw new Error('cells not adjacent');
  const ya = cellTop(cellA), yb = cellTop(cellB), { a, b } = edgeMidpoint(cellA, cellB, RING_R * Math.sqrt(3) / 2);
  return [{ x: pA.x, y: ya, z: pA.z }, { x: a.x, y: ya, z: a.z }, { x: b.x, y: yb, z: b.z }, { x: pB.x, y: yb, z: pB.z }];
}
