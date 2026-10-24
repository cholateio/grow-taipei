// GLB 載入：clone、量尺寸、縮到指定高度、腳底落地，材質一律轉成島上的霧面黏土。
// 從 spike/v3.html 搬來；試作學到的坑都在這裡處理（骨架模型要先擺骨頭再量、Draco、貼圖、葉色）。
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from '../../vendor/three/addons/loaders/DRACOLoader.js';
import * as SkeletonUtils from '../../vendor/three/addons/utils/SkeletonUtils.js';

export function normalizeHeight(size, h) { return h / size.y; }

const matches = (map, name) => map && Object.keys(map).find(k => new RegExp(k, 'i').test(name || ''));

export function convertMaterial(THREE, m, { tint = null, glow = null } = {}) {
  const out = new THREE.MeshStandardMaterial({
    roughness: 0.78, metalness: 0, map: m.map ?? null, vertexColors: !!m.vertexColors,
    transparent: !!m.transparent, opacity: m.opacity ?? 1, side: m.side ?? THREE.FrontSide, name: m.name,
  });
  out.color.copy(m.color ?? new THREE.Color(0xffffff));
  const t = matches(tint, m.name); if (t) out.color.setHex(tint[t]);
  const g = matches(glow, m.name); if (g) { out.color.setHex(glow[g]); out.emissive.setHex(glow[g]); out.emissiveIntensity = 0.5; }
  return out;
}

export function createAssets(THREE, { base = './assets/', draco = './vendor/three/draco/' } = {}) {
  const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath(draco));
  const cache = new Map(), mixers = [], glowMaterials = [];

  function load(path) {
    if (!cache.has(path)) cache.set(path, new Promise((ok, fail) => loader.load(base + path, ok, undefined, fail)));
    return cache.get(path);
  }

  const measure = obj => {
    obj.updateMatrixWorld(true);
    obj.traverse(o => { if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); } });
    return new THREE.Box3().setFromObject(obj, true);
  };

  async function spawn(path, { x = 0, y = 0, z = 0, h = 1, ry = 0, anim = null, speed = 1, parent = null, tint = null, glow = null } = {}) {
    const src = await load(path), obj = SkeletonUtils.clone(src.scene);
    obj.scale.setScalar(normalizeHeight(measure(obj).getSize(new THREE.Vector3()), h));
    const box = measure(obj), c = box.getCenter(new THREE.Vector3());
    obj.position.set(-c.x, -box.min.y, -c.z);
    obj.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      const conv = m => { const n = convertMaterial(THREE, m, { tint, glow }); if (n.emissiveIntensity > 0 && n.emissive.getHex()) glowMaterials.push(n); return n; };
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    });
    const holder = new THREE.Group(); holder.add(obj); holder.position.set(x, y, z); holder.rotation.y = ry;
    if (anim && src.animations.length) {
      const clip = src.animations.find(a => a.name.toLowerCase().includes(anim.toLowerCase())) ?? src.animations[0];
      const mixer = new THREE.AnimationMixer(obj); const act = mixer.clipAction(clip); act.timeScale = speed; act.play(); mixers.push(mixer);
    }
    parent?.add(holder);
    return holder;
  }

  return { load, spawn, update: dt => { for (const m of mixers) m.update(dt); }, glowMaterials };
}
