// 六角主島、台地、橋、衛星島。島面與側壁是一般 Mesh，橋與小物件進 kit。
import { R, TOP, WATER_Y, RING_R, MAIN_CELLS, PLATEAU_CELLS, axialToWorld, hexCorners, cellTop, adjacentPairs, edgeMidpoint } from './hex.js';
import { bridgeDecks } from './bridge.js';
import { groundTexture } from './textures.js';

const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const RIM_COLORS = [0xdb6a41, 0xfcea8b, 0x6f7fb5, 0x58a6a6, 0xf2b5c6];
const CELL_GROUND = [[[0, 0], 'brick'], [[1, 0], 'stripes'], [[-1, 0], 'dots'], [[0, 1], 'brick'], [[-1, 1], 'dots']];

export function tileLayout(cells) {
  return cells.map(cell => {
    const center = axialToWorld(...cell);
    return { cell, center, top: cellTop(cell), corners: hexCorners(center.x, center.z, R) };
  });
}

export function tileGround(cell) {
  if (PLATEAU_CELLS.some(p => same(p, cell))) return 'lawn';
  return CELL_GROUND.find(([c]) => same(c, cell))?.[1] ?? 'dots';
}

// pointy-top 六角平面：CircleGeometry 6 段轉 30° 再放平（提示詞 §2）
const flatHex = (THREE, r, segments = 6) => new THREE.CircleGeometry(r, segments).rotateZ(Math.PI / 6).rotateX(-Math.PI / 2);
const flatHexRing = (THREE, inner, outer) => new THREE.RingGeometry(inner, outer, 6).rotateZ(Math.PI / 6).rotateX(-Math.PI / 2);

function worldUV(geo, ox, oz) {
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + ox) / 2.2, (p.getZ(i) + oz) / 2.2);
  uv.needsUpdate = true;
}

function buildTile(THREE, { center, top }, { ground, rim, mats }) {
  const g = new THREE.Group();
  g.position.set(center.x, 0, center.z);
  const surface = flatHex(THREE, R - 0.05); worldUV(surface, center.x, center.z);
  const topMesh = new THREE.Mesh(surface, mats.ground(ground)); topMesh.position.y = top; topMesh.receiveShadow = true;
  const sideH = top - (WATER_Y - 0.6);
  const side = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.97, sideH, 6, 1, true), mats.rock);
  side.position.y = top - sideH / 2; side.castShadow = side.receiveShadow = true;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.012, R + 0.012, 0.16, 6, 1, true), mats.solid(rim));
  band.position.y = top - 0.09;
  const curb = new THREE.Mesh(flatHexRing(THREE, R - 0.16, R), mats.curb); curb.position.y = top + 0.006; curb.receiveShadow = true;
  const ring = new THREE.Mesh(flatHexRing(THREE, RING_R - 0.14, RING_R + 0.14), mats.path); ring.position.y = top + 0.01; ring.receiveShadow = true;
  const shallow = new THREE.Mesh(flatHexRing(THREE, R, R + 0.7), mats.shallow); shallow.position.y = WATER_Y + 0.008;
  const foam = new THREE.Mesh(flatHexRing(THREE, R + 0.05, R + 0.16), mats.foam); foam.position.y = WATER_Y + 0.016;
  g.add(topMesh, side, band, curb, ring, shallow, foam);
  return g;
}

function materials(THREE) {
  const cache = new Map();
  const solid = hex => { if (!cache.has(hex)) cache.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.78, metalness: 0 })); return cache.get(hex); };
  const grounds = new Map();
  return {
    solid,
    ground: kind => { if (!grounds.has(kind)) grounds.set(kind, new THREE.MeshStandardMaterial({ map: groundTexture(THREE, kind), roughness: 0.92, metalness: 0 })); return grounds.get(kind); },
    rock: solid(0xd2b48c),
    curb: new THREE.MeshStandardMaterial({ color: 0xe4d6c3, roughness: 0.78, polygonOffset: true, polygonOffsetFactor: -1 }),
    path: new THREE.MeshStandardMaterial({ color: 0xcdb08c, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }),
    shallow: new THREE.MeshBasicMaterial({ color: 0xe9dcc6, transparent: true, opacity: 0.35, depthWrite: false }),
    foam: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }),
  };
}

// 兩格之間的小拱橋；高低格之間改成往下的階梯
function addBridge(kit, cellA, cellB) {
  const ta = cellTop(cellA), tb = cellTop(cellB);
  const { a, b } = edgeMidpoint(cellA, cellB, RING_R * Math.sqrt(3) / 2);
  if (ta === tb) {
    const decks = bridgeDecks(a, b, { base: ta, arch: 0.08 });
    decks.forEach((d, i) => kit.part('box', { pos: [d.x, d.y, d.z], scale: [0.5, 0.05, d.len * 1.08], rot: [0, d.ry, 0], color: i % 2 ? 0xa77a55 : 0xb48560 }));
    for (const end of [decks[0], decks.at(-1)]) for (const s of [-1, 1]) {
      const ox = Math.cos(end.ry) * 0.27 * s, oz = -Math.sin(end.ry) * 0.27 * s;
      kit.part('cylinder', { pos: [end.x + ox, end.y + 0.12, end.z + oz], scale: [0.05, 0.24, 0.05], color: 0xfff8f4 });
    }
  } else {
    const steps = 5, dx = b.x - a.x, dz = b.z - a.z, ry = Math.atan2(dx, dz), len = Math.hypot(dx, dz) / steps;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps, y = ta + (tb - ta) * t;
      const low = Math.min(ta, tb);
      kit.part('box', { pos: [a.x + dx * t, (y + low - 0.25) / 2, a.z + dz * t], scale: [0.62, y - low + 0.25, len * 1.02], rot: [0, ry, 0], color: 0xe6dccb });
    }
  }
}

export function buildIsland(THREE, kit, { cells = MAIN_CELLS } = {}) {
  const mats = materials(THREE), group = new THREE.Group(), tiles = tileLayout(cells);
  tiles.forEach((t, i) => group.add(buildTile(THREE, t, { ground: tileGround(t.cell), rim: RIM_COLORS[i % RIM_COLORS.length], mats })));
  for (const [a, b] of adjacentPairs(cells)) addBridge(kit, a, b);
  return { group, tiles, mats };
}

// 衛星島：單格，比主島矮一點，上面一個小地標
export function buildSatellite(THREE, kit, sat, mats) {
  const center = axialToWorld(sat.q, sat.r), top = TOP - 0.2;
  const group = buildTile(THREE, { center, top }, { ground: sat.kind === 'rocks' ? 'stripes' : 'lawn', rim: 0xe4d6c3, mats });
  const P = (kind, [x, y, z], scale, color, rot) => kit.part(kind, { pos: [center.x + x, top + y, center.z + z], scale, color, rot });
  const tree = (x, z, s = 1, leaf = 0x9bbd7e) => { P('trunk', [x, 0.25 * s, z], [0.12 * s, 0.5 * s, 0.12 * s], 0x9c7a4e); P('leaf', [x, 0.72 * s, z], 0.75 * s, leaf); };
  switch (sat.kind) {
    case 'lighthouse':
      for (let i = 0; i < 4; i++) P('cylinder', [0, 0.17 + i * 0.32, 0], [0.5 - i * 0.04, 0.32, 0.5 - i * 0.04], i % 2 ? 0xdb6a41 : 0xfff8f4);
      P('glowsphere', [0, 1.45, 0], 0.32, 0xfcea8b); P('cone', [0, 1.72, 0], [0.42, 0.3, 0.42], 0x211d1d); tree(0.9, 0.5, 0.8); break;
    case 'windmill':
      P('cylinder', [0, 0.8, 0], [0.1, 1.6, 0.1], 0xfff8f4); P('sphere', [0, 1.6, 0.08], 0.14, 0xfff8f4);
      for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; P('box', [Math.sin(a) * 0.38, 1.6 + Math.cos(a) * 0.38, 0.12], [0.08, 0.75, 0.03], 0xfff8f4, [0, 0, -a]); }
      P('rbox', [-0.7, 0.25, 0.4], [0.6, 0.5, 0.5], 0xf1e7da); P('hip', [-0.7, 0.66, 0.4], [0.68, 0.34, 0.58], 0x5a88b2); break;
    case 'rocks':
      [[-0.4, 0.3, 0.8], [0.5, -0.2, 0.65], [0.1, 0.6, 0.5], [-0.3, -0.6, 0.45]].forEach(([x, z, s], i) => P('ico', [x, s * 0.35, z], [s, s * 0.7, s], [0xc9b9a4, 0xb8a892, 0xd6c8b4][i % 3], [0, i, 0])); break;
    case 'pyramid':
      for (let i = 0; i < 5; i++) P('cylinder', [0, 0.09 + i * 0.18, 0], [1.9 - i * 0.34, 0.18, 1.9 - i * 0.34], i % 2 ? 0xa9c488 : 0xcfe0a8); break;
    case 'playground':
      P('box', [0.3, 0.38, 0], [0.4, 0.76, 0.4], 0xfcea8b); P('hip', [0.3, 0.92, 0], [0.55, 0.32, 0.55], 0x5a88b2);
      P('box', [0.3, 0.32, 0.55], [0.26, 0.06, 0.95], 0xdb6a41, [0.6, 0, 0]); tree(-0.7, 0.3, 0.8); break;
    case 'forest':
      [[0, 0, 1.1], [0.7, 0.4, 0.8], [-0.6, 0.5, 0.9], [0.4, -0.7, 0.7], [-0.5, -0.5, 0.85]].forEach(([x, z, s], i) => tree(x, z, s, [0x9bbd7e, 0x8aaf70, 0x6f9560][i % 3])); break;
    case 'chest':
      P('rbox', [0.2, 0.17, 0.2], [0.55, 0.34, 0.4], 0x9a6a3c); P('rbox', [0.2, 0.37, 0.2], [0.58, 0.08, 0.43], 0xe8c547); tree(-0.6, -0.3, 0.9); break;
  }
  return group;
}
