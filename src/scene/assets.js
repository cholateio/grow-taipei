// GLB 載入：clone、量尺寸、縮到指定高度、腳底落地，材質一律轉成島上的霧面黏土。
// 從 spike/v3.html 搬來；試作學到的坑都在這裡處理（骨架模型要先擺骨頭再量、Draco、貼圖、葉色）。
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from '../../vendor/three/addons/loaders/DRACOLoader.js';
import * as SkeletonUtils from '../../vendor/three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

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

// 色票圖的像素（瀏覽器：畫到 canvas 讀回來）。Kenney 新版套件整個模型只有一個 colormap 材質，顏色全在這張小圖裡。
function canvasPixels(image) {
  const { width: w, height: h } = image;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d'); g.drawImage(image, 0, 0);
  return g.getImageData(0, 0, w, h);
}

const GLOW_PER_VERTEX = s => { s.fragmentShader = s.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vColor.rgb;'); };

// 把整個 glb 併成最多兩個 mesh：不發光的一個、發光的一個，顏色寫進頂點色（一個模型 ≤ 2 個 draw call）。
//   顏色：材質名命中 tint／glow 就用那色；有貼圖（色票圖）就取三角形中心 uv 的那格顏色，該格的 '#rrggbb' 也能當 tint／glow 的鍵。
//   骨架、形變、半透明的模型不併（回傳 null，照舊逐 mesh 換材質）。
export function mergeModel(THREE, root, { tint = null, glow = null, pixels = canvasPixels, cache = new WeakMap() } = {}) {
  const meshes = []; root.traverse(o => { if (o.isMesh) meshes.push(o); });
  if (!meshes.length || meshes.some(o => o.isSkinnedMesh || o.morphTargetInfluences?.length || [].concat(o.material).some(m => m.transparent && m.opacity < 1))) return null;
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), parts = { solid: [], lit: [] }, glows = new Set();
  const texels = map => {
    if (!map?.image) return null;
    if (!cache.has(map.image)) { let px = null; try { px = pixels(map.image); } catch { /* 讀不到就只用材質色 */ } cache.set(map.image, px); }
    return cache.get(map.image);
  };
  const c = new THREE.Color(), texel = new THREE.Color(), uv = new THREE.Vector2();
  const cell = (f, n) => Math.min(n - 1, Math.floor((f - Math.floor(f)) * n));   // uv 超出 0–1 就照 repeat 繞回來
  // 一個三角形的顏色與是否發光（來源的頂點色不讀：目前收的 glb 都沒有 COLOR_0）
  const paint = (m, px, uvs, tri) => {
    let key = m.name;
    c.copy(m.color ?? texel.set(0xffffff));
    if (px && uvs) {
      uv.set(0, 0); for (let k = 0; k < 3; k++) uv.x += uvs.getX(tri + k) / 3, uv.y += uvs.getY(tri + k) / 3;
      if (m.map.matrixAutoUpdate) m.map.updateMatrix();
      uv.applyMatrix3(m.map.matrix);   // KHR_texture_transform 的位移／縮放
      const i = (cell(uv.y, px.height) * px.width + cell(uv.x, px.width)) * 4;   // glTF 貼圖 flipY = false：v = 0 是圖的第一列
      texel.setRGB(px.data[i] / 255, px.data[i + 1] / 255, px.data[i + 2] / 255, THREE.SRGBColorSpace);
      if (!matches(tint, key) && !matches(glow, key)) key = '#' + texel.getHexString();
      c.multiply(texel);
    }
    const g = matches(glow, key); if (g) return { hex: glow[g], lit: true };
    const t = matches(tint, key); return t ? { hex: tint[t], lit: false } : { color: c, lit: false };
  };
  for (const o of meshes) {
    const flat = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    flat.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const mats = [].concat(o.material), pos = flat.attributes.position, total = pos.count;
    const groups = Array.isArray(o.material) && flat.groups.length ? flat.groups : [{ start: 0, count: total, materialIndex: 0 }];
    for (const { start, count, materialIndex = 0 } of groups) {
      const m = mats[materialIndex]; if (!m) continue;
      const px = texels(m.map), uvs = m.map ? flat.attributes[m.map.channel ? `uv${m.map.channel}` : 'uv'] : null;
      const out = { solid: [[], []], lit: [[], []] };
      for (let tri = start; tri + 2 < Math.min(start + count, total); tri += 3) {
        const p = paint(m, px, uvs, tri), col = p.color ?? c.setHex(p.hex), [P, C] = out[p.lit ? 'lit' : 'solid'];
        if (p.lit) glows.add(p.hex);
        for (let k = 0; k < 3; k++) { P.push(pos.getX(tri + k), pos.getY(tri + k), pos.getZ(tri + k)); C.push(col.r, col.g, col.b); }
      }
      for (const kind of ['solid', 'lit']) {
        const [P, C] = out[kind]; if (!P.length) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
        parts[kind].push(g);
      }
    }
    flat.dispose();
  }
  const group = new THREE.Group(), owned = [];
  for (const kind of ['solid', 'lit']) {
    if (!parts[kind].length) continue;
    const geo = mergeGeometries(parts[kind]); for (const g of parts[kind]) g.dispose();
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0, flatShading: true, vertexColors: true, name: `merged-${kind}` });
    if (kind === 'lit') {
      // 一種發光色：emissive 就是它；多種：emissive 白色乘頂點色
      if (glows.size === 1) mat.emissive.setHex([...glows][0]);
      else { mat.emissive.setHex(0xffffff); mat.onBeforeCompile = GLOW_PER_VERTEX; mat.customProgramCacheKey = () => 'glow-per-vertex'; }
      mat.emissiveIntensity = 0.5;
    }
    group.add(new THREE.Mesh(geo, mat)); owned.push(geo, mat);
  }
  return { group, owned };
}

export function createAssets(THREE, { base = './assets/', draco = './vendor/three/draco/', loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath(draco)), pixels = canvasPixels } = {}) {
  const cache = new Map(), mixers = [], glowMaterials = [], texels = new WeakMap();

  function load(path) {
    if (!cache.has(path)) cache.set(path, new Promise((ok, fail) => loader.load(base + path, ok, undefined, fail)));
    return cache.get(path);
  }

  const measure = obj => {
    obj.updateMatrixWorld(true);
    obj.traverse(o => { if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); } });
    return new THREE.Box3().setFromObject(obj, true);
  };

  // merge（預設）：整個模型併成 ≤ 2 個 mesh；要播動畫的模型不併。merge: false = 逐 mesh 換材質（舊行為）。
  async function spawn(path, { x = 0, y = 0, z = 0, h = 1, ry = 0, anim = null, speed = 1, parent = null, tint = null, glow = null, merge = true } = {}) {
    const src = await load(path);
    const merged = merge && !anim ? mergeModel(THREE, src.scene, { tint, glow, pixels, cache: texels }) : null;
    const obj = merged ? merged.group : SkeletonUtils.clone(src.scene);
    obj.scale.setScalar(normalizeHeight(measure(obj).getSize(new THREE.Vector3()), h));
    const box = measure(obj), c = box.getCenter(new THREE.Vector3()), mine = [];
    obj.position.set(-c.x, -box.min.y, -c.z);
    obj.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      if (merged) { if (o.material.emissiveIntensity > 0 && o.material.emissive.getHex()) { glowMaterials.push(o.material); mine.push(o.material); } return; }
      const conv = m => { const n = convertMaterial(THREE, m, { tint, glow }); if (n.emissiveIntensity > 0 && n.emissive.getHex()) { glowMaterials.push(n); mine.push(n); } return n; };
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    });
    const holder = new THREE.Group(); holder.add(obj); holder.position.set(x, y, z); holder.rotation.y = ry;
    if (anim && src.animations.length) {
      const clip = src.animations.find(a => a.name.toLowerCase().includes(anim.toLowerCase())) ?? src.animations[0];
      const mixer = new THREE.AnimationMixer(obj); const act = mixer.clipAction(clip); act.timeScale = speed; act.play(); mixers.push(mixer);
      holder.userData.mixer = mixer;
    }
    holder.userData.glow = mine; holder.userData.owned = merged?.owned ?? [];
    parent?.add(holder);
    return holder;
  }

  // 演員被換掉時放掉模型：停掉並移除它的動畫 mixer，發光材質也不再列管（否則每局都在累積）
  function release(holder) {
    const m = holder?.userData.mixer;
    if (m) { m.stopAllAction(); const i = mixers.indexOf(m); if (i >= 0) mixers.splice(i, 1); }
    for (const g of holder?.userData.glow ?? []) { const i = glowMaterials.indexOf(g); if (i >= 0) glowMaterials.splice(i, 1); }
    for (const x of holder?.userData.owned ?? []) x.dispose();   // 合併出來的幾何與材質是這個 holder 自己的
    holder?.removeFromParent();
  }

  return { load, spawn, release, update: dt => { for (const m of mixers) m.update(dt); }, glowMaterials, get mixerCount() { return mixers.length; } };
}
