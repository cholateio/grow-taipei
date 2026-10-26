// 動態零件工廠：把 view 裡的 partSpec 做成 three.js 物件。
//   compound：kit 零件合併成「一個黏土 mesh + 每種發光色一個 mesh」，演員再多 draw call 也壓得住（§10 ≤ 150）
//   people：在共用的小人系統裡生 n 個；glb：CC0 模型（可沿路徑走）；smoke：循環冒煙；
//   orbit：一個 glb 從 from 飛進來、繞圓心 at 一圈（高 h、半徑 r、車頭朝切線）、停到 park（飛天車）
// 物品模組可以用 ctx.builders 加自己的 kind。每個零件 = { object, update?(dt, t), dispose?() }。
import { makeGeometry } from '../scene/kit.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { createPathCursor } from '../scene/path.js';

const ease = k => k * k * (3 - 2 * k);
const lerp = (a, b, k) => a + (b - a) * k;
// orbit 的一趟飛行（純函式）：t 秒時的位置與車頭方向。start 'from'（從 spec.from 飛進來）或 'park'（從停車點起飛）；
//   legs = [飛到圓上幾秒, 從圓上飛回停車點幾秒]；圓上那一圈從角 phase 逆時針繞一圈（2π / speed 秒），車頭朝切線（同列車的 yaw）；
//   飛完 done = true、停在 park，車頭朝最後一段的方向（停好不再轉）。
//   每一段開頭車頭從上一段結束的方向轉過來（最短轉角，每秒最多 TURN_RATE、至少 TURN_MIN 秒），交界不瞬間轉向
const TURN_RATE = 3.3, TURN_MIN = 0.3;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const turnIn = (prev, cur, u) => { const d = wrap(prev - cur), T = Math.max(TURN_MIN, Math.abs(d) / TURN_RATE); return cur + d * Math.max(0, 1 - u / T); };
export function orbitPose(spec, t, start = 'from') {
  const { at, r, h, speed, phase = 0, legs: [tin, tout] = [1, 1], park } = spec, from = start === 'park' ? park : spec.from;
  const lap = 2 * Math.PI / speed, E = { x: at.x + Math.cos(phase) * r, y: at.y + h, z: at.z + Math.sin(phase) * r };
  const head = (a, b) => Math.atan2(b.x - a.x, b.z - a.z), tangent = a => Math.atan2(-Math.sin(a), Math.cos(a));
  const hIn = head(from, E), hOut = head(E, park), hPark = hOut;
  const leg = (a, b, k, yaw) => ({ x: lerp(a.x, b.x, ease(k)), y: lerp(a.y, b.y, ease(k)), z: lerp(a.z, b.z, ease(k)), yaw, done: false });
  if (t < tin) return leg(from, E, t / tin, start === 'park' ? turnIn(hPark, hIn, t) : hIn);
  if (t < tin + lap) { const u = t - tin, a = phase + u * speed; return { x: at.x + Math.cos(a) * r, y: at.y + h, z: at.z + Math.sin(a) * r, yaw: turnIn(hIn, tangent(a), u), done: false }; }
  if (t < tin + lap + tout) { const u = t - tin - lap; return leg(E, park, u / tout, turnIn(tangent(phase), hOut, u)); }
  return { x: park.x, y: park.y, z: park.z, yaw: hPark, done: true };
}

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

  // 飛天車：平常停在 park；object.userData.fly({ delay }) 從 from 飛一趟（劇本的拍叫它），land() 立刻停好（跳過）；
  // 有 rest 的話停滿 rest 秒自己從停車點起飛再繞一圈（全島長滿時天上一直有車在動）。模型在 at 底下，位置相對 at
  function orbit(spec) {
    const object = new THREE.Group(), at = spec.at;
    const model = glb({ path: spec.path, h: spec.size, tint: spec.tint, glow: spec.glow, ry: spec.ry ?? 0 });
    object.add(model.object);
    let flying = false, start = 'from', t = 0, idle = 0;
    const put = p => { model.object.position.set(p.x - at.x, p.y - at.y, p.z - at.z); model.object.rotation.y = p.yaw; };
    const land = () => { flying = false; idle = 0; put(orbitPose(spec, Infinity)); };
    land();
    object.userData.fly = ({ delay = 0 } = {}) => { flying = true; start = 'from'; t = -delay; put(orbitPose(spec, 0, 'from')); };
    object.userData.land = land;
    return {
      object,
      update(dt) {
        if (!flying) { if (spec.rest == null || (idle += dt) < spec.rest) return; flying = true; start = 'park'; t = 0; }
        t += dt; const p = orbitPose(spec, Math.max(0, t), start); put(p);
        if (p.done) land();
      },
      dispose: model.dispose,
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

  const KINDS = { compound, people, glb, smoke, fireworks, orbit };
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
