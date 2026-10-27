// 動態零件工廠：把 view 裡的 partSpec 做成 three.js 物件。
//   compound：kit 零件合併成「一個黏土 mesh + 每種發光色一個 mesh」，演員再多 draw call 也壓得住（§10 ≤ 150）
//   people：在共用的小人系統裡生 n 個；glb：CC0 模型（可沿路徑走）；smoke：循環冒煙；
//   orbit：一個 glb 從 from 飛進來、繞圓心 at 一圈（高 h、半徑 r、車頭朝切線）、停到 park（飛天車）
//   shield：矽盾罩（半球、半透明淡藍、六角格紋）；cable：沿路徑的管子（海底電纜，通電時多一條發光管）
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

// ── 矽盾罩（晶片 Lv8／9、結局 §8）：狀態 test 閃三下（不透明度脈衝）再縮回地面藏起來；standby 淡淡常駐、跟 101 每 3 秒一起亮一下；
// full 全亮（結局擋飛彈）。shieldPose 是純函式：t 秒時的 { opacity, scale, visible }
export const SHIELD = { color: 0xa8e6ff, flashes: 3, period: 0.8, retract: 0.6, test: 0.55, standby: [0.08, 0.2], full: 0.55, pulse: 3 };
export const SHIELD_TEST_DUR = SHIELD.flashes * SHIELD.period + SHIELD.retract;
export function shieldPose(state, t) {
  if (state === 'test') {
    const flash = SHIELD.flashes * SHIELD.period;
    if (t < flash) return { opacity: 0.04 + (SHIELD.test - 0.04) * Math.sin(Math.PI * (t % SHIELD.period) / SHIELD.period) ** 2, scale: 1, visible: true };
    if (t < SHIELD_TEST_DUR) return { opacity: 0.04, scale: 1 - ease((t - flash) / SHIELD.retract), visible: true };
    return { opacity: 0, scale: 0, visible: false };
  }
  if (state === 'full') return { opacity: SHIELD.full, scale: 1, visible: true };
  // standby：跟天線同一個相位（tower.js 的 antenna：(1 + sin(2πt/3)) / 2）
  const [lo, hi] = SHIELD.standby, k = (1 + Math.sin(t * Math.PI * 2 / SHIELD.pulse)) / 2;
  return { opacity: lo + (hi - lo) * k, scale: 1, visible: true };
}
// 六角格紋貼圖（pointy-top，一格貼圖剛好一個週期：寬 √3·s、高 3·s）：邊線不透明白、格心淡；DataTexture 不靠 canvas，Node 測試也做得出來
const HEX_W = 64, HEX_H = 111, hexCache = new WeakMap();
function hexGrid(THREE) {
  if (hexCache.has(THREE)) return hexCache.get(THREE);
  const s = HEX_W / Math.sqrt(3), data = new Uint8Array(HEX_W * HEX_H * 4), ap = s * Math.sqrt(3) / 2;
  // 週期格子裡的六角中心：四角與正中（再加上下左右的鄰格，取最近的）
  const centres = [];
  for (const [cx, cy] of [[0, 0], [HEX_W, 0], [0, HEX_H], [HEX_W, HEX_H], [HEX_W / 2, HEX_H / 2], [HEX_W / 2, -HEX_H / 2], [HEX_W / 2, HEX_H * 1.5], [-HEX_W / 2, HEX_H / 2], [HEX_W * 1.5, HEX_H / 2]]) centres.push([cx, cy]);
  const normals = [0, Math.PI / 3, 2 * Math.PI / 3].map(a => [Math.cos(a), Math.sin(a)]);
  for (let y = 0; y < HEX_H; y++) for (let x = 0; x < HEX_W; x++) {
    let best = Infinity;
    for (const [cx, cy] of centres) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.max(...normals.map(([nx, ny]) => Math.abs(dx * nx + dy * ny)));
      if (r < best) best = r;
    }
    const edge = ap - best, i = (y * HEX_W + x) * 4;   // 離最近的邊幾格
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = edge < 1.5 ? 255 : edge < 3 ? 140 : 46;
  }
  const tex = new THREE.DataTexture(data, HEX_W, HEX_H, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  hexCache.set(THREE, tex);
  return tex;
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
      const key = ctx.quality === 'low' ? 'clay' : p.glow ?? 'clay';   // ?quality=low：發光的部分照顏色併進同一個 mesh（一個零件一個 draw call，裁決 R18）
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
    // ?quality=low：不分發光材質（合併後一個模型一個 mesh，裁決 R18）
    ctx.assets.spawn(spec.path, { h: spec.h, anim: spec.anim, speed: spec.animSpeed, tint: spec.tint, glow: ctx.quality === 'low' ? null : spec.glow, ry: spec.ry ?? 0 }).then(m => {
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
    const { size = 0.2, rise = 1.2, color: hex = 0xffffff, opacity = 0.8, offsetY = 0 } = spec, object = new THREE.Group();
    const n = Math.min(spec.n ?? 4, ctx.quality === 'low' ? 2 : Infinity);   // ?quality=low 最多兩團煙（一團一個 draw call）
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

  // 飛天車：平常停在 park；object.userData.fly({ delay, speed }) 從 from 飛一趟（劇本的拍叫它；delay 與飛行照 speed 倍速，現在恆為 1），land() 立刻停好（跳過）；
  // 有 rest 的話停滿 rest 秒自己從停車點起飛再繞一圈（全島長滿時天上一直有車在動）。模型在 at 底下，位置相對 at
  function orbit(spec) {
    // ?quality=low（手機，裁決 R18 draw call ≤ 150）：飛天車、無人機不畫；fly／land 留著給劇本叫
    if (ctx.quality === 'low') { const object = new THREE.Group(); object.userData.fly = () => {}; object.userData.land = () => {}; return { object, update() {}, dispose() {} }; }
    const object = new THREE.Group(), at = spec.at;
    const model = glb({ path: spec.path, h: spec.size, tint: spec.tint, glow: spec.glow, ry: spec.ry ?? 0 });
    object.add(model.object);
    let flying = false, start = 'from', t = 0, idle = 0, rate = 1;
    const put = p => { model.object.position.set(p.x - at.x, p.y - at.y, p.z - at.z); model.object.rotation.y = p.yaw; };
    const land = () => { flying = false; idle = 0; put(orbitPose(spec, Infinity)); };
    land();
    object.userData.fly = ({ delay = 0, speed = 1 } = {}) => { flying = true; start = 'from'; t = -delay; rate = speed; put(orbitPose(spec, 0, 'from')); };
    object.userData.land = land;
    return {
      object,
      update(dt) {
        if (!flying) { if (spec.rest == null || (idle += dt) < spec.rest) return; flying = true; start = 'park'; t = 0; rate = 1; }
        t += dt * rate; const p = orbitPose(spec, Math.max(0, t), start); put(p);
        if (p.done) land();
      },
      dispose: model.dispose,
    };
  }

  // 煙火：60 顆小球一發，從中心炸開、重力下落、淡出，每 1.2 秒一發；不投影
  // once（最終章 §6：飛彈撞上矽盾碎成一發煙火）：只放一發——用自己的時鐘（累加 dt，不看全域 t），1.2 秒後整個藏起來、一直藏著；
  //   建好即終態（藏著、不自己放）：object.userData.burst() 從頭放一發（飛彈撞上罩子那一刻），finish() 直接藏好（跳過）
  function fireworks(spec) {
    const N = 60, BURST = 1.2, object = new THREE.Group(), colors = spec.colors ?? [0xff3fa0];
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }), N);
    mesh.castShadow = mesh.receiveShadow = false; mesh.frustumCulled = false; object.add(mesh);
    const dirs = Array.from({ length: N }, (_, i) => { const y = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - y * y), a = i * 2.39996; return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r); });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    const pose = t => {
      const k = (t % BURST) / BURST, burst = Math.floor(t / BURST), s = 1.4 * Math.sqrt(k), fade = 1 - k;
      dirs.forEach((d, i) => { mesh.setMatrixAt(i, m4.compose(p.copy(d).multiplyScalar(s).add(sc.set(0, -1.2 * k * k, 0)), q, sc.setScalar(fade + 0.05))); mesh.setColorAt(i, col.setHex(colors[(burst + i) % colors.length])); });
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.material.opacity = fade;
    };
    let own = Infinity;   // once 的時鐘（Infinity = 放完了、藏著）
    const put = () => { mesh.visible = own < BURST; if (mesh.visible) pose(own); };
    if (spec.once) {
      object.userData.burst = () => { own = 0; put(); };
      object.userData.finish = () => { own = Infinity; put(); };
      put();
    }
    return {
      object,
      update(dt, t) { if (!spec.once) { pose(t); return; } if (own < BURST) { own += dt; put(); } },
      dispose() { mesh.geometry.dispose(); mesh.material.dispose(); },
    };
  }

  // 矽盾罩：半徑 r 的半球立在 at（101 底座）；格紋貼圖共用，材質每個零件自己一份（不透明度各演各的）。
  // 單面（FrontSide）：從全景看得到靠鏡頭的那半面，罩裡的島透得出來；不寫深度、不投影，一個 draw call。
  // 演法照 shieldPose；縮放與藏起來動的是裡面的 mesh，劇本的 scaleIn／閃白照樣作用在外層。
  // test 建好時就是演完的樣子（收起來、藏著）：閃三下由劇本叫 object.userData.test({ speed }) 開演、finish() 跳到收好
  //   （跳過、reduced-motion、舞台重建零件都不會重閃）；speed：演出倍速（現在恆為 1；以前蒙太奇 2，裁決 R15），閃三下跟著快
  function shield(spec) {
    const geo = new THREE.SphereGeometry(spec.r, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), map = hexGrid(THREE).clone();
    map.repeat.set(24, 3.5); map.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ color: SHIELD.color, map, transparent: true, depthWrite: false, side: THREE.FrontSide });
    const mesh = new THREE.Mesh(geo, mat), object = new THREE.Group(); mesh.castShadow = mesh.receiveShadow = false; mesh.renderOrder = 2; object.add(mesh);
    let t = spec.state === 'test' ? Infinity : 0, rate = 1;
    const put = () => { const p = shieldPose(spec.state, t); mesh.visible = p.visible; mesh.scale.setScalar(p.scale); mat.opacity = p.opacity; };
    object.userData.test = ({ speed = 1 } = {}) => { t = 0; rate = speed; put(); };
    object.userData.finish = () => { t = Infinity; put(); };
    put();
    return {
      object,
      update(dt) { t += dt * rate; put(); map.offset.y = (map.offset.y + dt * 0.05) % 1; },   // 格紋慢慢往上捲
      dispose() { geo.dispose(); mat.dispose(); map.dispose(); },
    };
  }

  // 海底電纜：path（世界座標）連成平滑的管子。暗的管子和 parts（登陸桿等，相對 at）併成一個黏土 mesh；
  // lit 時外面多一條略粗的自發光管（MeshBasicMaterial，白天也亮），建好時整條亮；object.userData.progress(k) 讓光從 path 的頭跑到 k
  // （劇本在套用這個零件的同一拍把它歸零再跑，中間沒有畫面）
  function cable(spec) {
    const at = spec.at, pts = spec.path.map(p => new THREE.Vector3(p.x - at.x, p.y - at.y, p.z - at.z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), segs = Math.max(16, pts.length * 6), r = spec.r ?? 0.05;
    const tube = new THREE.TubeGeometry(curve, segs, r, 5, false).toNonIndexed();
    tube.deleteAttribute('uv'); color.setHex(spec.color ?? 0x211d1d);
    const n = tube.attributes.position.count, cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { cols[i * 3] = color.r; cols[i * 3 + 1] = color.g; cols[i * 3 + 2] = color.b; }
    tube.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const extra = (spec.parts ?? []).map(partGeometry), geo = mergeGeometries([tube, ...extra]); tube.dispose(); extra.forEach(g => g.dispose());
    const object = new THREE.Group(), dark = new THREE.Mesh(geo, clay); dark.castShadow = dark.receiveShadow = true; object.add(dark);
    let glowGeo = null, glowMat = null;
    if (spec.lit) {
      glowGeo = new THREE.TubeGeometry(curve, segs, r * 1.25, 5, false); glowMat = new THREE.MeshBasicMaterial({ color: spec.glow ?? 0x3fe0ff });
      const lit = new THREE.Mesh(glowGeo, glowMat); lit.castShadow = lit.receiveShadow = false; object.add(lit);
      const total = glowGeo.index.count, tri = 3 * 5 * 2;   // 一段管子（5 邊 × 2 三角形）的索引數，光一段一段往前
      object.userData.progress = k => glowGeo.setDrawRange(0, Math.round(Math.min(1, Math.max(0, k)) * total / tri) * tri);
    } else object.userData.progress = () => {};
    return { object, dispose() { geo.dispose(); glowGeo?.dispose(); glowMat?.dispose(); } };
  }

  const KINDS = { compound, people, glb, smoke, fireworks, orbit, shield, cable };
  // 模組自己的 kind 拿到的 ctx 多一個 build，可以用 compound 等基本零件組出會動的東西
  const builderCtx = { ...ctx, build: s => build(s) };

  // low: false 的零件（燈光秀、堤防、旗子、煙火、船隊這類點綴）在 ?quality=low 不畫：給一個空的 Group（footprint 照宣告的算，劇本照樣找得到零件）
  function build(spec) {
    if (ctx.quality === 'low' && spec.low === false) { const object = new THREE.Group(), { x = 0, y = 0, z = 0 } = spec.at ?? {}; object.position.set(x, y, z); return { object, dispose() {} }; }
    const make = ctx.builders?.[spec.kind] ? s => ctx.builders[spec.kind](THREE, s, builderCtx) : KINDS[spec.kind];
    if (!make) throw new Error(`unknown part kind ${spec.kind}`);
    const part = make(spec);
    const { x = 0, y = 0, z = 0 } = spec.at ?? {};
    part.object.position.set(x, y, z);
    return part;
  }

  return { clay, build };
}
