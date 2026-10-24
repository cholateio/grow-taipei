// 八個物品與 101 在主島上的位置（格 + 格內偏移）。純資料，計畫 3 的演員也用這張表。
import { axialToWorld, cellTop } from '../scene/hex.js';

export const ANCHORS = {
  milk: { cell: [-1, 0], dx: -0.4, dz: 0.3 }, chip: { cell: [1, 0], dx: 0.3, dz: -0.3 }, bulb: { cell: [0, 0], dx: -1.1, dz: 0.9 },
  token: { cell: [0, 1], dx: 0, dz: 0.2 }, typhoon: { cell: [0, 0], dx: 0, dz: -1.3 }, rat: { cell: [1, 0], dx: -0.2, dz: 1.0 },
  boba: { cell: [-1, 1], dx: 0.2, dz: 0 }, baseball: { cell: [-1, 1], dx: -0.9, dz: -0.8 }, tower: { cell: [0, 0], dx: 0.6, dz: -0.2 },
};

export function anchorWorld(id) {
  const a = ANCHORS[id], c = axialToWorld(...a.cell);
  return { x: c.x + a.dx, y: cellTop(a.cell), z: c.z + a.dz };
}
