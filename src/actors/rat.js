// 老鼠（§5.1）：一隻 → 一窩 5 隻 → 搭捷運（代幣 ≥2）或泡北投溫泉 → Lv4 分岔：機器鼠排隊跟偵防師（賽博）／變異鼠在溫泉邊對天空揮手（外星）
// → Lv5 最終型態：機器鼠軍團繞 101 ／ 變異鼠頭上盤旋小 UFO。
// 颱風把老鼠沖進大巨蛋：5 隻繞著巨蛋門口跑。模型用 Quaternius Easy Enemies 的 Rat。
import { anchorWorld, landmarkWorld } from './anchors.js';
import { ringPath } from '../scene/people.js';
import { ENGINEER_ROUTE } from './chip.js';
import { trainPose } from './token.js';
import { C, offset } from './palette.js';

export const id = 'rat';
export const labelY = 0.6;
const RAT = 'quat/enemies/Rat.glb';

// 依序判定；分岔旗標還沒到（同一回合稍晚的事件）時退回泡溫泉／搭捷運
export function ratMode(lv, flags) {
  if (!lv.rat) return null;
  if (flags.domeRats) return 'dome';
  if (lv.rat >= 4 && flags.ratBranch === 'alien') return 'alien';
  if (lv.rat >= 4 && flags.ratBranch === 'cyber') return 'cyber';
  if (lv.rat >= 3) return lv.token >= 2 ? 'train' : 'spring';
  return lv.rat >= 2 ? 'nest' : 'one';
}

export function view(lv, flags) {
  const mode = ratMode(lv, flags), at = anchorWorld('rat'), spring = landmarkWorld('spring');
  const rats = (extra) => ({ kind: 'rats', path: RAT, n: 5, h: 0.14, anim: 'Walk', ...extra });
  switch (mode) {
    case null: return {};
    case 'one': return { 'rat.main': rats({ at, n: 1, h: 0.16, loop: { path: ringPath(at, 0.5, at.y), speed: 0.5 } }) };
    case 'nest': return {
      'rat.main': { kind: 'compound', at, parts: [{ kind: 'rbox', pos: [0, 0.12, 0], scale: [0.35, 0.24, 0.3], color: 0x9a6a3c }, { kind: 'sphere', pos: [0, 0.12, 0.15], scale: [0.12, 0.1, 0.04], color: C.ink }] },
      'rat.pack': rats({ at, loop: { path: ringPath(at, 0.7, at.y), speed: 0.6, step: 0.2 } }),
    };
    case 'spring': return { 'rat.pack': rats({ at: spring, anim: 'Idle', spots: Array.from({ length: 5 }, (_, i) => { const a = i / 5 * Math.PI * 2 + 0.3; return { ...offset(spring, Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.1), yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) }; }) }) };
    case 'train': return { 'rat.pack': rats({ at, h: 0.12, anim: 'Idle', train: { cars: lv.token >= 3 ? 5 : 3, speed: flags.flooded ? 0 : 0.35 } }) };
    // Lv5 最終型態：機器鼠軍團 10 隻繞 101 列隊（骨架動畫上限 12：10 + 柴犬）
    case 'cyber': return lv.rat >= 5
      ? { 'rat.pack': rats({ at, n: 10, tint: { Grey: 0xc0c8d0 }, antenna: true, loop: { path: ringPath(anchorWorld('tower'), 1.3, anchorWorld('tower').y), speed: 0.5, step: 0.1 } }) }
      : { 'rat.pack': rats({ at, tint: { Grey: 0xc0c8d0 }, antenna: true, loop: { path: ENGINEER_ROUTE, loop: false, speed: 0.6, phase: 0.1, step: 0.03 } }) };
    case 'alien': {
      const mutant = offset(spring, -0.75, 0.55, 0.05), v = { 'rat.main': rats({ at: mutant, n: 1, h: 0.5, anim: 'Idle', tint: { Grey: C.alien }, glow: { Grey: C.alien }, eye: true, wave: true }) };
      if (lv.rat >= 5) v['rat.ufo'] = { kind: 'ufo', at: offset(mutant, 0, 0, 1.3) };   // 變異鼠加冕：頭上盤旋一艘小 UFO（鋪外星結局）
      return v;
    }
    case 'dome': { const gate = offset(anchorWorld('baseball'), 0, 1.1); return { 'rat.pack': rats({ at: gate, loop: { path: ringPath(gate, 0.9, gate.y), speed: 1.1, step: 0.2 } }) }; }
  }
}

export const builders = {
  // 小 UFO：銀色碟 + 綠色底光，在原地小圓盤旋、上下飄
  ufo(THREE, spec, ctx) {
    const part = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: [
      { kind: 'dome', pos: [0, 0, 0], scale: [0.9, 0.3, 0.9], color: 0xc0c8d0 }, { kind: 'cylinder', pos: [0, 0, 0], scale: [1.0, 0.04, 1.0], color: 0x9aa7b8 },
      { kind: 'sphere', pos: [0, -0.06, 0], scale: [0.35, 0.12, 0.35], color: C.alien, glow: C.alien },
    ] }), object = new THREE.Group(); object.add(part.object);
    return { object, update(dt, t) { part.object.position.set(Math.cos(t * 0.8) * 0.3, Math.sin(t * 1.7) * 0.08, Math.sin(t * 0.8) * 0.3); part.object.rotation.y += dt * 2; }, dispose: part.dispose };
  },
  // 一群老鼠：沿路徑（loop）、站定點（spots）、或坐在列車車頂（train）
  rats(THREE, spec, ctx) {
    const object = new THREE.Group(), at = spec.at, extras = [];
    const subs = Array.from({ length: spec.n }, (_, i) => {
      const spot = spec.spots?.[i];
      const sub = ctx.build({ kind: 'glb', at: spot ?? at, path: spec.path, h: spec.h, anim: spec.anim, tint: spec.tint, glow: spec.glow, ry: spot?.yaw ?? 0,
        ...(spec.loop ? { loop: { ...spec.loop, phase: (spec.loop.phase ?? 0) + i * (spec.loop.step ?? 0) } } : {}) });
      sub.object.position.sub(new THREE.Vector3(at.x, at.y, at.z));
      const extra = s => { const p = ctx.build(s); extras.push(p); sub.object.add(p.object); };
      if (spec.antenna) extra({ kind: 'compound', at: { x: 0, y: spec.h, z: 0 }, shadow: false, parts: [{ kind: 'cylinder', pos: [0, 0.04, 0], scale: [0.01, 0.08, 0.01], color: C.ink }, { kind: 'sphere', pos: [0, 0.09, 0], scale: 0.025, color: C.neonBlue, glow: C.neonBlue }] });
      if (spec.eye) extra({ kind: 'compound', at: { x: 0, y: spec.h * 0.78, z: spec.h * 0.32 }, shadow: false, parts: [{ kind: 'sphere', pos: [0, 0, 0], scale: [0.09, 0.09, 0.05], color: C.white }, { kind: 'sphere', pos: [0, 0, 0.02], scale: [0.04, 0.04, 0.03], color: C.ink }] });
      object.add(sub.object);
      return sub;
    });
    return {
      object,
      update(dt, t) {
        subs.forEach((s, i) => {
          s.update?.(dt, t);
          if (spec.train) { const p = trainPose(t, i % spec.train.cars, { speed: spec.train.speed }); s.object.position.set(p.x - at.x, p.y + 0.18 - at.y, p.z - at.z); s.object.rotation.y = p.yaw; }
          if (spec.wave) s.object.rotation.z = Math.sin(t * 3) * 0.15;
        });
      },
      dispose() { for (const s of [...subs, ...extras]) s.dispose?.(); },
    };
  },
};
