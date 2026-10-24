// 背景：盆地地形、背景樹、遠山剪影、雲（政策島提示詞 §4「遠景層次」）。全部不投影。
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './random.js';

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const SEA_FLOOR = -0.6;

// 中心是海床；半徑 25–50 隆起成環狀山；鏡頭那一側（+z）壓低，免得擋住島
export function basinHeight(x, z, noise2 = () => 0) {
  const r = Math.hypot(x, z);
  const fbm = (noise2(x * 0.025, z * 0.025) * 3 + noise2(x * 0.05, z * 0.05) * 1.5 + noise2(x * 0.1, z * 0.1) * 0.75) * smoothstep(18, 30, r);
  const rise = (smoothstep(25, 50, r) * 26 + fbm) * (1 - 0.65 * smoothstep(0, 40, z));
  const y = SEA_FLOOR + Math.max(0, rise);
  return y > 3 ? Math.round(y / 0.6) * 0.6 : y;
}

export function heightColor(y) {
  if (y <= 0) return 0x8fb3ad;
  if (y <= 2) return 0xd9c9a3;
  if (y <= 6) return 0xaec493;
  if (y <= 12) return 0xa3b986;
  if (y <= 20) return 0x6f8a62;
  return 0xb2a38d;
}

export function treeSpots(count, rnd, heightFn) {
  const out = [];
  for (let tries = 0; out.length < count && tries < count * 5; tries++) {
    const a = rnd() * Math.PI * 2, r = 16 + rnd() * 36, x = Math.cos(a) * r, z = Math.sin(a) * r, y = heightFn(x, z), s = 0.8 + rnd();
    if (y >= 1.5) out.push({ x, z, y, s, conifer: rnd() < 0.6 });
  }
  return out;
}

const TREE_COUNT = { high: 3000, medium: 1800, low: 800 };
const TREE_COLORS = [0x6f8a62, 0x728f5f, 0x8aaf70, 0x9cc27a, 0x5f7a55];

export function buildTerrain(THREE, { noise2 = () => 0, quality = 'high', seed = 99 } = {}) {
  const group = new THREE.Group(), rnd = mulberry32(seed), height = (x, z) => basinHeight(x, z, noise2);

  // 地形
  const seg = quality === 'low' ? 80 : 160, plane = new THREE.PlaneGeometry(170, 170, seg, seg).rotateX(-Math.PI / 2);
  const p = plane.attributes.position, colors = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = height(p.getX(i), p.getZ(i)); p.setY(i, y);
    c.setHex(heightColor(y)).toArray(colors, i * 3);
  }
  plane.setAttribute('color', new THREE.BufferAttribute(colors, 3)); plane.computeVertexNormals();
  const ground = new THREE.Mesh(plane, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }));
  ground.receiveShadow = false; group.add(ground);

  // 背景樹：針葉 = 3 個圓錐疊、闊葉 = 4 顆抖動多面體
  const conifer = mergeGeometries([0, 1, 2].map(i => new THREE.ConeGeometry(0.55 - i * 0.12, 0.7, 6).translate(0, 0.45 + i * 0.32, 0)));
  const broad = mergeGeometries([[0, 0.6, 0, 0.45], [0.25, 0.5, 0.1, 0.32], [-0.22, 0.52, -0.08, 0.3], [0.05, 0.85, 0.05, 0.3]].map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 0).translate(x, y, z)));
  const spots = treeSpots(TREE_COUNT[quality], rnd, height);
  const mat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9, metalness: 0 });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (const [geo, list] of [[conifer, spots.filter(s => s.conifer)], [broad, spots.filter(s => !s.conifer)]]) {
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((t, i) => {
      q.setFromAxisAngle(up, rnd() * 6.28);
      inst.setMatrixAt(i, m4.compose(new THREE.Vector3(t.x, t.y - 0.1, t.z), q, new THREE.Vector3(t.s, t.s * (0.9 + rnd() * 0.3), t.s)));
      inst.setColorAt(i, c.setHex(TREE_COLORS[Math.floor(rnd() * TREE_COLORS.length)]));
    });
    group.add(inst);
  }

  // 三圈遠山剪影帶，顏色往 horizon 混
  const bands = [[96, 14, 0x9fb39a], [112, 20, 0xaebfa8], [128, 26, 0xbfcab8]].map(([radius, h, col], k) => {
    const n = 120, pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2, top = h * (0.55 + 0.45 * (noise2(Math.cos(a) * 2 + k * 9, Math.sin(a) * 2) * 0.5 + 0.5));
      pos.push(Math.cos(a) * radius, -2, Math.sin(a) * radius, Math.cos(a) * radius, top, Math.sin(a) * radius);
      if (i < n) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, fog: false }));
    m.userData = { base: col, mix: 0.35 + k * 0.2 };
    group.add(m); return m;
  });

  // 12 團雲，沿 +x 漂
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, flatShading: true });
  const clouds = Array.from({ length: 12 }, () => {
    const cl = new THREE.Group();
    for (let i = 0, n = 3 + Math.floor(rnd() * 3); i < n; i++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 + rnd() * 1.4, 1), cloudMat);
      s.position.set((i - n / 2) * 1.6, rnd() * 0.8, rnd() * 1.2); cl.add(s);
    }
    cl.position.set(-90 + rnd() * 180, 16 + rnd() * 8, -75 + rnd() * 60); cl.scale.y = 0.6;
    group.add(cl); return cl;
  });

  let last = 0;
  return {
    group,
    update(t) { const dt = Math.min(0.08, t - last); last = t; for (const cl of clouds) { cl.position.x += dt * 0.6; if (cl.position.x > 90) cl.position.x = -90; } },
    setHorizon(hex) { const h = new THREE.Color(hex); for (const b of bands) b.material.color.setHex(b.userData.base).lerp(h, b.userData.mix); },
  };
}
