// 大頭 chibi 小人（政策島提示詞 §6）：高約 0.35、頭占 40%。每種零件一個 InstancedMesh，每幀重算矩陣。
import { mulberry32 } from './random.js';

export const SHIRTS = [0xdb6a41, 0x5a88b2, 0xf2b5c6, 0x8db86f, 0xfcea8b, 0xffffff, 0x3f5a8a, 0xe8b04a];
export const ACCESSORIES = ['none', 'cap', 'coat', 'suitcase', 'glass'];
// 六角內切半徑 2.165，步道帶在邊中點只到 2.1 左右，用 2.0 走才不會踩出島外
export const WALK_RADIUS = 2.0;
const SKIN = 0xf3c9a5, HAIR = 0x3a2a22, INK = 0x211d1d, PANTS = [0x3a3a4a, 0x3f5a8a, 0x5c5650];

export function walkPose(ph) { const s = Math.sin(ph); return { leg: 0.55 * s, arm: -0.45 * s, bob: Math.abs(s) * 0.012 }; }

export function ringPath(center, radius, y, n = 24) {
  return Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return { x: center.x + Math.cos(a) * radius, y, z: center.z + Math.sin(a) * radius }; });
}

// 零件：名稱、幾何、每人幾個、顏色
function partDefs(THREE) {
  return [
    ['legL', new THREE.CapsuleGeometry(0.022, 0.06, 3, 6)], ['legR', new THREE.CapsuleGeometry(0.022, 0.06, 3, 6)],
    ['armL', new THREE.CapsuleGeometry(0.018, 0.06, 3, 6)], ['armR', new THREE.CapsuleGeometry(0.018, 0.06, 3, 6)],
    ['body', new THREE.CapsuleGeometry(0.05, 0.07, 4, 8)], ['head', new THREE.SphereGeometry(0.07, 14, 10)],
    ['hair', new THREE.SphereGeometry(0.075, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)],
    ['eyeL', new THREE.SphereGeometry(0.01, 6, 4)], ['eyeR', new THREE.SphereGeometry(0.01, 6, 4)],
    ['cap', new THREE.CylinderGeometry(0.078, 0.078, 0.022, 12)],
    ['shadow', new THREE.CircleGeometry(0.07, 16).rotateX(-Math.PI / 2)],
  ];
}

export function createPeople(THREE, { max = 48, seed = 21 } = {}) {
  const rnd = mulberry32(seed), group = new THREE.Group(), meshes = {};
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
  for (const [name, geo] of partDefs(THREE)) {
    const m = new THREE.InstancedMesh(geo, name === 'shadow' ? shadowMat : mat, max);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false;
    m.castShadow = name !== 'shadow'; m.name = `people:${name}`;
    m.setColorAt(0, new THREE.Color());           // 建立 instanceColor
    meshes[name] = m; group.add(m);
  }
  const walkers = [];
  let nextId = 1;
  const color = new THREE.Color(), hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  function paint(i, w) {
    const set = (name, hex) => meshes[name].setColorAt(i, color.setHex(hex));
    set('legL', w.pants); set('legR', w.pants); set('armL', w.shirt); set('armR', w.shirt); set('body', w.shirt);
    set('head', SKIN); set('hair', HAIR); set('eyeL', INK); set('eyeR', INK); set('cap', 0xfcea8b); set('shadow', 0);
    for (const m of Object.values(meshes)) m.instanceColor.needsUpdate = true;
  }
  function resize() { for (const m of Object.values(meshes)) m.count = walkers.length; walkers.forEach((w, i) => paint(i, w)); }

  function measure(path) {
    const lens = [0];
    for (let i = 1; i <= path.length; i++) { const a = path[i - 1], b = path[i % path.length]; lens.push(lens[i - 1] + Math.hypot(b.x - a.x, b.z - a.z)); }
    return lens;
  }

  function spawn({ path, speed = 0.35, shirt = SHIRTS[Math.floor(rnd() * SHIRTS.length)], accessory = 'none', loop = true }) {
    if (walkers.length >= max) throw new Error(`people: max ${max} reached`);
    const w = { id: nextId++, path, lens: measure(path), s: rnd() * 10, dir: 1, speed, shirt, pants: PANTS[Math.floor(rnd() * PANTS.length)], accessory, loop, phase: rnd(), pos: { ...path[0] } };
    w.remove = () => { const i = walkers.indexOf(w); if (i >= 0) { walkers.splice(i, 1); resize(); } };
    w.setPath = p => { w.path = p; w.lens = measure(p); w.s = 0; };
    walkers.push(w); resize(); place(w, 0);
    return w;
  }

  function locate(w) {
    const total = w.lens.at(-1), n = w.path.length;
    let s = w.loop ? ((w.s % total) + total) % total : Math.min(total, Math.max(0, w.s));
    let i = 0; while (i < n - 1 && w.lens[i + 1] < s) i++;
    const a = w.path[i], b = w.path[(i + 1) % n], t = (s - w.lens[i]) / (w.lens[i + 1] - w.lens[i] || 1);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2(b.x - a.x, b.z - a.z) + (w.dir < 0 ? Math.PI : 0) };
  }

  const W = new THREE.Matrix4(), M = new THREE.Matrix4(), T = new THREE.Matrix4(), Rm = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const at = (name, i, ...ops) => { M.copy(W); for (const op of ops) M.multiply(op); meshes[name].setMatrixAt(i, M); };
  const tr = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const rx = a => new THREE.Matrix4().makeRotationX(a);

  function place(w, t, k = 1) {
    const i = walkers.indexOf(w), p = locate(w), pose = walkPose(t * 9 + w.phase * 20);
    w.pos = { x: p.x, y: p.y, z: p.z };
    W.compose(new THREE.Vector3(p.x, p.y + pose.bob, p.z), q.setFromAxisAngle(up, p.yaw), new THREE.Vector3(k, k, k));
    at('legL', i, tr(-0.025, 0.09, 0), rx(pose.leg), tr(0, -0.045, 0));
    at('legR', i, tr(0.025, 0.09, 0), rx(-pose.leg), tr(0, -0.045, 0));
    at('armL', i, tr(-0.065, 0.2, 0), rx(pose.arm), tr(0, -0.04, 0));
    at('armR', i, tr(0.065, 0.2, 0), rx(-pose.arm), tr(0, -0.04, 0));
    at('body', i, tr(0, 0.15, 0));
    at('head', i, tr(0, 0.28, 0));
    at('hair', i, tr(0, 0.292, -0.006));
    at('eyeL', i, tr(-0.024, 0.285, 0.064)); at('eyeR', i, tr(0.024, 0.285, 0.064));
    if (w.accessory === 'cap') at('cap', i, tr(0, 0.362, 0.004)); else meshes.cap.setMatrixAt(i, hidden);
    W.compose(new THREE.Vector3(p.x, p.y + 0.005, p.z), q, new THREE.Vector3(k, k, k)); meshes.shadow.setMatrixAt(i, W);
  }

  function update(dt, t, cameraDistance = 20) {
    const k = Math.min(1.45, Math.max(1, cameraDistance / 20));
    for (const w of walkers) {
      w.s += w.speed * dt * w.dir;
      if (!w.loop && (w.s <= 0 || w.s >= w.lens.at(-1))) w.dir *= -1;
      place(w, t, k);
    }
    for (const m of Object.values(meshes)) m.instanceMatrix.needsUpdate = true;
  }

  return { group, spawn, update, get walkers() { return walkers; } };
}
