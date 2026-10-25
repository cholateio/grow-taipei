// 動態零件工廠：把 view 裡的 partSpec 做成 three.js 物件。
//   compound：kit 零件合併成「一個黏土 mesh + 每種發光色一個 mesh」，演員再多 draw call 也壓得住（§10 ≤ 150）
//   people：在共用的小人系統裡生 n 個；glb：CC0 模型（可沿路徑走）；smoke：循環冒煙
// 物品模組可以用 ctx.builders 加自己的 kind。每個零件 = { object, update?(dt, t), dispose?() }。
import { makeGeometry } from '../scene/kit.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { createPathCursor } from '../scene/path.js';

export function createPartFactory(THREE, ctx) {
  const unit = new Map(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), color = new THREE.Color();
  const clay = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0, vertexColors: true });
  const puffGeo = new THREE.IcosahedronGeometry(1, 0);

  // 每種 kind 一份非索引的單位幾何，合併時 clone 再套矩陣
  const baseGeo = kind => {
    if (!unit.has(kind)) { const g = makeGeometry(THREE, kind); unit.set(kind, g.index ? g.toNonIndexed() : g); }
    return unit.get(kind);
  };

  function partGeometry({ kind, pos, scale = 1, rot = [0, 0, 0], color: hex }) {
    const g = baseGeo(kind).clone(), s = Array.isArray(scale) ? scale : [scale, scale, scale];
    g.applyMatrix4(m4.compose(new THREE.Vector3(...pos), q.setFromEuler(e.set(...rot)), new THREE.Vector3(...s)));
    color.setHex(hex);
    const n = g.attributes.position.count, cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { cols[i * 3] = color.r; cols[i * 3 + 1] = color.g; cols[i * 3 + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    if (g.attributes.uv) g.deleteAttribute('uv');
    return g;
  }

  function compound(spec) {
    const object = new THREE.Group(), groups = new Map(), owned = [];
    for (const p of spec.parts) {
      const key = p.glow ?? 'clay';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(partGeometry(p));
    }
    for (const [key, geos] of groups) {
      const geo = mergeGeometries(geos); geos.forEach(g => g.dispose());
      let mat = clay;
      if (key !== 'clay') { mat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0, vertexColors: true, emissive: key }); ctx.glow.add(mat); owned.push(mat); }
      const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = mesh.receiveShadow = spec.shadow !== false;
      object.add(mesh);
    }
    return {
      object, materials: owned,
      dispose() { object.traverse(o => o.geometry?.dispose()); for (const m of owned) { ctx.glow.remove(m); m.dispose(); } },
    };
  }

  function people(spec) {
    const { n = 1, path, stand, loop = true, speed = 0.35, accessory = 'none', shirt, scale } = spec;
    const walkers = Array.from({ length: n }, (_, i) => ctx.people.spawn({
      ...(stand ? { stand: stand[i % stand.length] } : { path }), loop, speed, accessory, ...(shirt !== undefined ? { shirt: Array.isArray(shirt) ? shirt[i % shirt.length] : shirt } : {}), ...(scale ? { scale } : {}),
    }));
    return { object: new THREE.Group(), walkers, dispose() { for (const w of walkers) w.remove(); } };
  }

  function glb(spec) {
    const object = new THREE.Group(), mats = [];
    let model = null, disposed = false;
    const cursor = spec.loop ? createPathCursor(spec.loop.path, { loop: spec.loop.loop ?? true }) : null;
    if (cursor && spec.loop.phase) cursor.advance(spec.loop.phase * cursor.total);
    ctx.assets.spawn(spec.path, { h: spec.h, anim: spec.anim, speed: spec.animSpeed, tint: spec.tint, glow: spec.glow, ry: spec.ry ?? 0 }).then(m => {
      if (disposed) { ctx.assets.release?.(m); return; }
      model = m; object.add(m);
      m.traverse(o => { if (o.isMesh) for (const mt of [].concat(o.material)) if (mt.emissiveIntensity > 0 && mt.emissive?.getHex()) { ctx.glow.add(mt); mats.push(mt); } });
      place();
    }).catch(err => console.warn('模型載入失敗', spec.path, err));
    const place = () => {
      if (!model || !cursor) return;
      const p = cursor.locate(), at = spec.at;
      model.position.set(p.x - at.x, p.y - at.y, p.z - at.z); model.rotation.y = p.yaw;
    };
    return {
      object,
      update(dt) { if (cursor) { cursor.advance(dt * spec.loop.speed); place(); } },
      dispose() { disposed = true; for (const m of mats) ctx.glow.remove(m); if (model) ctx.assets.release?.(model); },
    };
  }

  function smoke(spec) {
    const { n = 4, size = 0.2, rise = 1.2, color: hex = 0xffffff, opacity = 0.8, offsetY = 0 } = spec, object = new THREE.Group();
    const puffs = Array.from({ length: n }, (_, i) => {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: hex, transparent: true, depthWrite: false }));
      object.add(m); return { m, ph: i / n };
    });
    return {
      object,
      update(dt, t) {
        for (const p of puffs) {
          const k = (p.ph + t * 0.18) % 1;
          p.m.position.set(Math.sin(k * 5 + p.ph * 7) * 0.15, offsetY + k * rise, 0);
          p.m.scale.setScalar(size * (0.5 + k)); p.m.material.opacity = opacity * (1 - k) + 1e-3;
        }
      },
      dispose() { for (const p of puffs) p.m.material.dispose(); },
    };
  }

  // 煙火：60 顆小球一發，從中心炸開、重力下落、淡出，每 1.2 秒一發；不投影
  function fireworks(spec) {
    const N = 60, object = new THREE.Group(), colors = spec.colors ?? [0xff3fa0];
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }), N);
    mesh.castShadow = mesh.receiveShadow = false; mesh.frustumCulled = false; object.add(mesh);
    const dirs = Array.from({ length: N }, (_, i) => { const y = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - y * y), a = i * 2.39996; return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r); });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    return {
      object,
      update(dt, t) {
        const k = (t % 1.2) / 1.2, burst = Math.floor(t / 1.2), s = 1.4 * Math.sqrt(k), fade = 1 - k;
        dirs.forEach((d, i) => { mesh.setMatrixAt(i, m4.compose(p.copy(d).multiplyScalar(s).add(sc.set(0, -1.2 * k * k, 0)), q, sc.setScalar(fade + 0.05))); mesh.setColorAt(i, col.setHex(colors[(burst + i) % colors.length])); });
        mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.material.opacity = fade;
      },
      dispose() { mesh.geometry.dispose(); mesh.material.dispose(); },
    };
  }

  // 因果光點：發光小球（扣級是不發光的黑球）從 at 沿拋物線飛到 to，0.35 秒，到了 done = true
  function spark(spec) {
    const { at, to, color = 0xfcea8b, dark = false } = spec, object = new THREE.Group(), owned = [];
    const mat = dark ? new THREE.MeshStandardMaterial({ color: 0x211d1d, roughness: 0.78 }) : new THREE.MeshStandardMaterial({ color, emissive: color, roughness: 0.78 });
    if (!dark) { ctx.glow.add(mat); owned.push(mat); mat.emissiveIntensity = Math.max(1.5, mat.emissiveIntensity); }
    const ball = new THREE.Mesh(puffGeo, mat); ball.scale.setScalar(0.1); object.add(ball); object.userData.dark = dark;
    const dx = to.x - at.x, dy = to.y - at.y, dz = to.z - at.z;
    let t = 0;
    const part = {
      object, done: false,
      update(dt) {
        t = Math.min(1, t + dt / 0.35);
        ball.position.set(dx * t, dy * t + 0.8 * 4 * t * (1 - t), dz * t);
        if (t >= 1) part.done = true;
      },
      dispose() { for (const m of owned) ctx.glow.remove(m); mat.dispose(); },
    };
    return part;
  }

  const KINDS = { compound, people, glb, smoke, fireworks, spark };
  // 模組自己的 kind 拿到的 ctx 多一個 build，可以用 compound 等基本零件組出會動的東西
  const builderCtx = { ...ctx, build: s => build(s) };

  function build(spec) {
    const make = ctx.builders?.[spec.kind] ? s => ctx.builders[spec.kind](THREE, s, builderCtx) : KINDS[spec.kind];
    if (!make) throw new Error(`unknown part kind ${spec.kind}`);
    const part = make(spec);
    const { x = 0, y = 0, z = 0 } = spec.at ?? {};
    part.object.position.set(x, y, z);
    return part;
  }

  return { clay, build };
}
