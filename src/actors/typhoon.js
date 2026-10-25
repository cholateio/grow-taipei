// 颱風（§5.1）：灰雲 → 暴風圈與大雨（有珍奶就有外送機車在雨中繞）→ 雨過天晴：彩虹、河濱公園。
// 「所有房子換新屋頂」由各模組的 roofColor(…, rebuilt(lv)) 處理。
import { anchorWorld, landmarkWorld } from './anchors.js';
import { TOP } from '../scene/hex.js';
import { mulberry32 } from '../scene/random.js';
import { C } from './palette.js';

export const id = 'typhoon';
export const labelY = 1.0;
const CLOUD = 0x9aa7b8, STORM = 0x6b7280, SCOOTER_R = 1.95;

export function view(lv) {
  const n = lv.typhoon, at = anchorWorld('typhoon'), v = {};
  if (!n) return v;
  if (n === 1) v['typhoon.main'] = { kind: 'cloud', at, labelY: 3.9, parts: [
    { kind: 'sphere', pos: [0, 4.5, 0], scale: 1.4, color: CLOUD }, { kind: 'sphere', pos: [0.8, 4.35, 0.1], scale: 1.0, color: CLOUD }, { kind: 'sphere', pos: [-0.75, 4.4, -0.1], scale: 0.9, color: CLOUD },
  ] };
  else if (n === 2) v['typhoon.main'] = { kind: 'cloud', at, labelY: 3.9, spin: 0.5, parts: [
    { kind: 'sphere', pos: [0, 4.6, 0], scale: 1.6, color: STORM },
    ...Array.from({ length: 7 }, (_, i) => { const a = i / 7 * Math.PI * 2; return { kind: 'sphere', pos: [Math.cos(a) * 2.2, 4.4 + (i % 2) * 0.2, Math.sin(a) * 2.2], scale: 1.1 - (i % 3) * 0.12, color: STORM }; }),
  ] };
  else {
    // 彩虹：細環（rail）半截沉在水下，立在台地後面當背景，不擋住火山
    v['typhoon.main'] = { kind: 'compound', at, shadow: false, parts: [C.coral, C.yellow, C.blue].map((c, i) => ({ kind: 'rail', pos: [0.6, -0.3, -5.2], scale: 11 - i * 0.6, rot: [0, 0.2, 0], color: c })) };
    const park = landmarkWorld('park');
    v['typhoon.park'] = { kind: 'compound', at: park, parts: [
      { kind: 'box', pos: [0, 0.01, 0], scale: [1.1, 0.02, 0.3], rot: [0, 0.6, 0], color: C.sand },
      ...[[-0.35, 0.25], [0.35, -0.2]].flatMap(([x, z]) => [{ kind: 'box', pos: [x, 0.1, z], scale: [0.36, 0.04, 0.12], rot: [0, 0.6, 0], color: C.wood }, { kind: 'box', pos: [x, 0.05, z], scale: [0.3, 0.1, 0.03], rot: [0, 0.6, 0], color: C.ink }]),
      ...[[0.3, 0.35, 0xf2b5c6], [0.45, 0.2, C.yellow], [-0.2, -0.35, 0xf2b5c6]].flatMap(([x, z, c]) => [{ kind: 'cylinder', pos: [x, 0.08, z], scale: [0.015, 0.16, 0.015], color: 0x6f9560 }, { kind: 'sphere', pos: [x, 0.17, z], scale: 0.07, color: c }]),
      { kind: 'trunk', pos: [-0.45, 0.2, -0.1], scale: [0.1, 0.4, 0.1], color: C.wood }, { kind: 'leaf', pos: [-0.45, 0.55, -0.1], scale: 0.5, color: 0x8aaf70 },
    ] };
  }
  if (n === 2) {
    v['typhoon.rain'] = { kind: 'rain', at: { x: 0, y: 0, z: 0 } };
    if (lv.boba >= 1) v['typhoon.scooter'] = { kind: 'scooter', at: { x: 0, y: TOP, z: 0 } };
  }
  return v;
}

export const builders = {
  // 雲：上下漂；暴風圈整團繞 y 轉
  cloud(THREE, spec, ctx) {
    const part = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: spec.parts }), object = new THREE.Group();
    object.add(part.object);
    return { object, update(dt, t) { part.object.position.y = Math.sin(t * 0.8) * 0.08; if (spec.spin) part.object.rotation.y += dt * spec.spin; }, dispose: part.dispose };
  },
  // 大雨：240 根半透明雨絲在半徑 8 內從 6 落到 0 循環，不投影。ctx.weather.rain（0–1，app 每幀淡入）決定下幾根、多濃
  rain(THREE, spec, ctx) {
    const N = 240, rnd = mulberry32(5), object = new THREE.Group();
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.35, 0.02), new THREE.MeshBasicMaterial({ color: 0xa4d4da, transparent: true, opacity: 0.6, depthWrite: false }), N);
    mesh.castShadow = mesh.receiveShadow = false; mesh.frustumCulled = false; object.add(mesh);
    const drops = Array.from({ length: N }, () => { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 8; return { x: Math.cos(a) * r, z: Math.sin(a) * r, ph: rnd() }; });
    const m = new THREE.Matrix4(), tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, 0, 0.1)), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    return {
      object,
      update(dt, t) {
        const k = ctx.weather?.rain ?? 1;
        mesh.count = Math.round(N * k); mesh.material.opacity = 0.6 * Math.min(1, 0.4 + k * 0.6);
        drops.forEach((d, i) => { const y = 6 - ((d.ph + t) * 6 % 6); mesh.setMatrixAt(i, m.compose(p.set(d.x, y, d.z), tilt, one)); });
        mesh.instanceMatrix.needsUpdate = true;
      },
      dispose() { mesh.geometry.dispose(); mesh.material.dispose(); },
    };
  },
  // 颱風天外送：珊瑚色機車載著戴黃安全帽的騎士，沿中心格的步道繞圈
  scooter(THREE, spec, ctx) {
    const part = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: [
      { kind: 'box', pos: [0, 0.14, 0], scale: [0.14, 0.12, 0.42], color: C.coral },
      { kind: 'box', pos: [0, 0.24, -0.12], scale: [0.2, 0.12, 0.16], color: C.ink },
      { kind: 'torus', pos: [0, 0.07, 0.17], scale: 0.13, rot: [0, Math.PI / 2, 0], color: C.ink }, { kind: 'torus', pos: [0, 0.07, -0.17], scale: 0.13, rot: [0, Math.PI / 2, 0], color: C.ink },
      { kind: 'box', pos: [0, 0.3, 0.02], scale: [0.1, 0.16, 0.08], color: C.blue },
      { kind: 'sphere', pos: [0, 0.43, 0.02], scale: 0.12, color: C.skin }, { kind: 'dome', pos: [0, 0.44, 0.02], scale: 0.15, color: C.yellow },
    ] }), object = new THREE.Group();
    object.add(part.object);
    return {
      object,
      update(dt, t) { const a = t * 1.2; part.object.position.set(Math.cos(a) * SCOOTER_R, 0, Math.sin(a) * SCOOTER_R); part.object.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a)); },
      dispose: part.dispose,
    };
  },
};
