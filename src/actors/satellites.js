// 衛星島與海面（§5.3，使用者 2026-10-25「只有中心的島在動，不夠磅礡」）：七座小島和海上的船跟著主島的等級反應。
// 和主島的演員一樣是 view(lv, flags) → 零件；固定的島形與地標在 scene/island.js 的 kit 裡，這裡只畫會變的東西。
import { SATELLITES, axialToWorld, TOP, WATER_Y } from '../scene/hex.js';
import { ringPath } from '../scene/people.js';
import { C } from './palette.js';
import { builders as ratBuilders } from './rat.js';
import { kidAccessory } from './milk.js';
import * as spec from '../rules/spec.js';

export const id = 'satellites';
const TOP_SAT = TOP - 0.2, GOLD = 0xe8c547;
export const island = kind => { const s = SATELLITES.find(x => x.kind === kind), c = axialToWorld(s.q, s.r); return { x: c.x, y: TOP_SAT, z: c.z }; };
const at = (kind, dx = 0, dz = 0, dy = 0) => { const c = island(kind); return { x: c.x + dx, y: c.y + dy, z: c.z + dz }; };
const allMax = lv => spec.ORDER.every(id => lv[id] === spec.ITEMS[id].max);

// 離岸風電（物品 v2 §5）：燈泡 Lv7 電工搭車去風車島按開關之前，風車不轉、燈塔不亮
export const POWERED = 7;
export const powered = (lv, flags = {}) => lv.bulb >= POWERED && !flags.blackout;

export function view(lv, flags) {
  const v = {}, storm = lv.typhoon === 2, on = powered(lv, flags);
  // 風車：通電後慢慢轉；颱風時不管有沒有電都被風吹得狂轉、整座搖（那是風不是電）
  v['sat.windmill'] = { kind: 'blades', at: at('windmill', 0, 0.12, 1.6), speed: storm ? 6 : on ? 1 : 0, wobble: storm };
  if (on) {
    v['sat.lighthouse'] = { kind: 'compound', at: at('lighthouse'), parts: [{ kind: 'sphere', pos: [0, 1.45, 0], scale: 0.38, color: C.yellow, glow: C.yellow }] };
    v['sat.beam'] = { kind: 'beam', at: at('lighthouse', 0, 0, 1.45) };
  }
  // 守塔人（§14.3）：燈塔亮了（燈泡 Lv7）之後一位守塔人繞著燈塔走（衛星島的 wander 是 ringPath，半徑 0.6 在塔身外、樹的內側）
  if (lv.bulb >= POWERED) v['sat.keeper'] = { kind: 'roster', at: at('lighthouse'), n: 1, shirt: C.navy, accessory: 'cap', home: { kind: 'wander', at: at('lighthouse'), r: 0.6 } };
  // 遊樂場的小孩是坐接駁車（代幣 Lv8）來的：代幣的劇本 hold 住這個名冊、在車旁 spawn；日常在島上繞圈（名冊的衛星島 wander）
  // 物品 v2：鮮奶 Lv3 才有小學生（Lv2 是早餐店），配件跟鮮奶格的小孩同一張表
  if (lv.token >= 8 && lv.milk >= 3) {
    v['sat.playground'] = { kind: 'roster', at: at('playground'), n: 2, shirt: C.yellow, accessory: kidAccessory(lv.milk), home: { kind: 'wander', at: at('playground', -0.2, 0.3), r: 0.5 } };
  }
  // 小森林島的觀光客跟著珍奶分店（Lv4）一起來：珍奶 Lv4 的劇本鏡頭移過去時閃白出現（§8.7）
  if (lv.boba >= 4) {
    const f = island('forest'), yaw = Math.atan2(-f.x, -f.z);   // 面向主島拍照
    v['sat.forest'] = { kind: 'roster', at: f, n: 2, accessory: 'suitcase', home: { kind: 'stand', spots: [{ ...at('forest', 0.3, 1.1), yaw }, { ...at('forest', -0.2, 1.25), yaw }] } };
  }
  if (lv.boba >= 4) v['sat.forestShop'] = { kind: 'compound', at: at('forest', 1.0, 0.9), parts: [
    { kind: 'box', pos: [0, 0.22, 0], scale: [0.45, 0.44, 0.35], color: C.wall }, { kind: 'hip', pos: [0, 0.55, 0], scale: [0.55, 0.2, 0.45], color: C.coral },
    { kind: 'cylinder', pos: [0, 0.78, 0], scale: [0.16, 0.22, 0.16], color: 0xc9a27c },
  ] };
  if (lv.chip >= 3) v['sat.camp'] = { kind: 'compound', at: at('pyramid', 0, 0, 0.9), parts: [
    { kind: 'prism', pos: [-0.12, 0.14, 0], scale: [0.36, 0.5, 0.28], rot: [0, 0, Math.PI / 2], color: C.yellow },
    ...[0, 1, 2].map(i => ({ kind: 'trunk', pos: [0.22 + Math.cos(i * 2.1) * 0.05, 0.03, Math.sin(i * 2.1) * 0.05], scale: [0.03, 0.06, 0.12], rot: [Math.PI / 2, i * 2.1, 0], color: C.wood })),
    { kind: 'sphere', pos: [0.22, 0.09, 0], scale: 0.09, color: C.coral, glow: C.coral },
  ] };
  // 石堆上的老鼠；賽博最終型態（10 隻軍團）時不畫，守住骨架動畫 ≤ 12
  if (lv.rat >= 3 && !(lv.rat >= 5 && flags.ratBranch === 'cyber')) v['sat.rocks'] = { kind: 'rats', at: island('rocks'), path: 'quat/enemies/Rat.glb', n: 2, h: 0.14, anim: 'Idle',
    spots: [{ ...at('rocks', -0.4, 0.3, 0.52), yaw: 0.6 }, { ...at('rocks', 0.5, -0.2, 0.44), yaw: -2.2 }] };
  const open = allMax(lv);
  v['sat.chest'] = { kind: 'compound', at: at('chest'), open, parts: open ? [
    { kind: 'rbox', pos: [0.2, 0.52, -0.02], scale: [0.58, 0.08, 0.43], rot: [-1.2, 0, 0], color: GOLD },
    { kind: 'sphere', pos: [0.2, 0.36, 0.2], scale: [0.4, 0.12, 0.28], color: GOLD, glow: GOLD },
    ...Array.from({ length: 6 }, (_, i) => ({ kind: 'cylinder', pos: [0.2 + Math.cos(i) * 0.5, 0.02, 0.2 + Math.sin(i) * 0.45], scale: [0.09, 0.02, 0.09], color: GOLD })),
  ] : [{ kind: 'rbox', pos: [0.2, 0.37, 0.2], scale: [0.58, 0.08, 0.43], color: GOLD }] };
  if (!storm) v['sat.boats'] = { kind: 'boats', at: { x: 0, y: WATER_Y - 0.02, z: 0 }, n: 2 + (lv.boba >= 2 ? 2 : 0) + (lv.boba >= 4 ? 2 : 0) };
  return v;
}

export const builders = {
  rats: ratBuilders.rats,
  // 風車葉片：三片繞 hub 轉；暴風時整座搖
  blades(THREE, spec, ctx) {
    const part = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: [0, 1, 2].map(i => { const a = i * Math.PI * 2 / 3; return { kind: 'box', pos: [Math.sin(a) * 0.38, Math.cos(a) * 0.38, 0], scale: [0.08, 0.75, 0.03], rot: [0, 0, -a], color: C.cream }; }) });
    const object = new THREE.Group(); object.add(part.object);
    return { object, update(dt, t) { part.object.rotation.z -= dt * spec.speed; object.rotation.z = spec.wobble ? Math.sin(t * 8) * 0.05 : 0; }, dispose: part.dispose };
  },
  // 燈塔光束：半透明長錐，每 4 秒掃一圈
  beam(THREE) {
    const geo = new THREE.ConeGeometry(0.5, 4, 12, 1, true).translate(0, -2, 0).rotateZ(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    const object = new THREE.Group(); object.add(mesh);
    return { object, update(dt, t) { mesh.rotation.y = t * Math.PI / 2; }, dispose() { geo.dispose(); mesh.material.dispose(); } };
  },
  // 海上的船：小船／帆船交錯，各自繞一圈；觀光船隨珍奶變多
  boats(THREE, spec, ctx) {
    const object = new THREE.Group();
    const subs = Array.from({ length: spec.n }, (_, i) => {
      const r = 15.5 + i * 0.9, sail = i % 2 === 1;
      const sub = ctx.build({ kind: 'glb', at: { x: 0, y: 0, z: 0 }, path: `quat/ships/${sail ? 'BoatWSail' : 'Boat'}.glb`, h: sail ? 0.8 : 0.35,
        loop: { path: ringPath({ x: 0, z: 0 }, r, 0, 48), speed: (0.05 + i * 0.01) * r, phase: i / spec.n } });
      object.add(sub.object); return sub;
    });
    return { object, update(dt, t) { subs.forEach((s, i) => { s.update(dt, t); s.object.position.y = Math.sin(t * 2 + i) * 0.02; }); }, dispose() { for (const s of subs) s.dispose(); } };
  },
};
