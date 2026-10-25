// 大頭 chibi 小人（政策島提示詞 §6）：高約 0.35、頭占 40%。每種零件一個 InstancedMesh，每幀重算矩陣。
import { mulberry32 } from './random.js';
import { measurePath, locateOnPath } from './path.js';

export const SHIRTS = [0xdb6a41, 0x5a88b2, 0xf2b5c6, 0x8db86f, 0xfcea8b, 0xffffff, 0x3f5a8a, 0xe8b04a];
export const ACCESSORIES = ['none', 'cap', 'coat', 'suitcase', 'glass', 'helmet', 'bike', 'mortar'];
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
    // 配件決定身分（§7.3）：工程師識別證、觀光客行李箱、偵防師放大鏡、工人安全帽、YouBike
    ['badge', new THREE.BoxGeometry(0.02, 0.025, 0.005)],
    ['case', new THREE.BoxGeometry(0.07, 0.09, 0.04)],
    ['lens', new THREE.TorusGeometry(0.028, 0.006, 6, 12)], ['handle', new THREE.CylinderGeometry(0.005, 0.005, 0.05, 5)],
    ['helmet', new THREE.SphereGeometry(0.08, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)],
    ['wheelF', new THREE.TorusGeometry(0.05, 0.012, 6, 14)], ['wheelB', new THREE.TorusGeometry(0.05, 0.012, 6, 14)],
    ['mortar', new THREE.BoxGeometry(0.13, 0.015, 0.13)], ['tassel', new THREE.BoxGeometry(0.008, 0.05, 0.008)],   // 大學生的學士帽
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
    const shirt = w.accessory === 'coat' ? 0xffffff : w.shirt;
    set('legL', w.pants); set('legR', w.pants); set('armL', shirt); set('armR', shirt); set('body', shirt);
    set('head', SKIN); set('hair', HAIR); set('eyeL', INK); set('eyeR', INK); set('cap', 0xfcea8b); set('shadow', 0);
    set('badge', 0x5a88b2); set('case', w.pants); set('lens', INK); set('handle', INK); set('helmet', 0xfcea8b); set('wheelF', INK); set('wheelB', INK); set('mortar', INK); set('tassel', 0xfcea8b);
    for (const m of Object.values(meshes)) m.instanceColor.needsUpdate = true;
  }
  function resize() { for (const m of Object.values(meshes)) m.count = walkers.length; walkers.forEach((w, i) => paint(i, w)); }

  function spawn({ path, stand = null, speed = 0.35, shirt = SHIRTS[Math.floor(rnd() * SHIRTS.length)], accessory = 'none', loop = true, scale = 1 }) {
    if (walkers.length >= max) throw new Error(`people: max ${max} reached`);
    if (stand) { path = [stand]; speed = 0; }
    const lens = measurePath(path, loop);
    // 開放路徑的起點要落在路徑上，否則每幀都會在終點來回翻方向卡住
    const w = { id: nextId++, path, lens, s: rnd() * (loop ? 10 : lens.at(-1)), dir: 1, speed, shirt, pants: PANTS[Math.floor(rnd() * PANTS.length)], accessory, loop, scale, stand, phase: rnd(), pos: { ...path[0] } };
    w.remove = () => { const i = walkers.indexOf(w); if (i >= 0) { walkers.splice(i, 1); resize(); } };
    w.setPath = p => { w.path = p; w.lens = measurePath(p, w.loop); w.s = 0; };
    walkers.push(w); resize(); place(w, 0);
    return w;
  }

  function locate(w) {
    if (w.stand) return { x: w.stand.x, y: w.stand.y, z: w.stand.z, yaw: w.stand.yaw ?? 0 };
    const p = locateOnPath(w.path, w.lens, w.s, w.loop);
    if (w.dir < 0) p.yaw += Math.PI;
    return p;
  }

  const W = new THREE.Matrix4(), M = new THREE.Matrix4(), T = new THREE.Matrix4(), Rm = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const at = (name, i, ...ops) => { M.copy(W); for (const op of ops) M.multiply(op); meshes[name].setMatrixAt(i, M); };
  const tr = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const rx = a => new THREE.Matrix4().makeRotationX(a);

  const show = (on, name, i, ...ops) => { if (on) at(name, i, ...ops); else meshes[name].setMatrixAt(i, hidden); };

  function place(w, t, k = 1) {
    const i = walkers.indexOf(w), p = locate(w), still = w.speed === 0, pose = still ? walkPose(0) : walkPose(t * 9 + w.phase * 20);
    const acc = w.accessory, bike = acc === 'bike', lift = bike ? -0.03 : 0, ks = k * w.scale;
    w.pos = { x: p.x, y: p.y, z: p.z };
    W.compose(new THREE.Vector3(p.x, p.y + (bike ? 0.04 : pose.bob), p.z), q.setFromAxisAngle(up, p.yaw), new THREE.Vector3(ks, ks, ks));
    show(!bike, 'legL', i, tr(-0.025, 0.09, 0), rx(pose.leg), tr(0, -0.045, 0));
    show(!bike, 'legR', i, tr(0.025, 0.09, 0), rx(-pose.leg), tr(0, -0.045, 0));
    at('armL', i, tr(-0.065, 0.2 + lift, 0), rx(bike ? -0.9 : pose.arm), tr(0, -0.04, 0));
    at('armR', i, tr(0.065, 0.2 + lift, 0), rx(bike ? -0.9 : -pose.arm), tr(0, -0.04, 0));
    at('body', i, tr(0, 0.15 + lift, 0));
    at('head', i, tr(0, 0.28 + lift, 0));
    show(acc !== 'helmet', 'hair', i, tr(0, 0.292 + lift, -0.006));
    at('eyeL', i, tr(-0.024, 0.285 + lift, 0.064)); at('eyeR', i, tr(0.024, 0.285 + lift, 0.064));
    show(acc === 'cap', 'cap', i, tr(0, 0.362, 0.004));
    show(acc === 'coat', 'badge', i, tr(0.03, 0.17, 0.052));
    show(acc === 'suitcase', 'case', i, tr(0.1, 0.045, 0));
    show(acc === 'glass', 'lens', i, tr(0.09, 0.2, 0.06));
    show(acc === 'glass', 'handle', i, tr(0.09, 0.15, 0.06));
    show(acc === 'helmet', 'helmet', i, tr(0, 0.3 + lift, 0));
    show(acc === 'mortar', 'mortar', i, tr(0, 0.36, 0)); show(acc === 'mortar', 'tassel', i, tr(0.055, 0.34, 0.03));
    const ry = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    show(bike, 'wheelF', i, tr(0, 0.01, 0.07), ry); show(bike, 'wheelB', i, tr(0, 0.01, -0.07), ry);
    W.compose(new THREE.Vector3(p.x, p.y + 0.005, p.z), q, new THREE.Vector3(ks, ks, ks)); meshes.shadow.setMatrixAt(i, W);
  }

  function update(dt, t, cameraDistance = 20) {
    const k = Math.min(1.45, Math.max(1, cameraDistance / 20));
    for (const w of walkers) {
      w.s += w.speed * dt * w.dir;
      if (!w.loop) { const total = w.lens.at(-1); if (w.s >= total) { w.s = total; w.dir = -1; } else if (w.s <= 0) { w.s = 0; w.dir = 1; } }
      place(w, t, k);
    }
    for (const m of Object.values(meshes)) m.instanceMatrix.needsUpdate = true;
  }

  return { group, spawn, update, get walkers() { return walkers; } };
}
