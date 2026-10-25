// 舞台：演員的外觀只由「等級向量 + 旗標」決定（§7.1）。每個模組 view(lv, flags) → { key: partSpec }，
// 舞台比對前後兩份 view：沒變的零件不動，變了的「舊的縮掉冒煙 → 新的彈出」（GROW 式變身，0.6 秒 easeOutBack）。
// 跳過、reduced-motion、RESET 都只是「立刻套用最終 view」。
import { CSS2DObject } from '../../vendor/three/addons/renderers/CSS2DRenderer.js';
import { createPartFactory } from './parts.js';
import { anchorWorld } from './anchors.js';
import { levelLabel } from '../ui/format.js';

const POP = 0.6, SHRINK = 0.25, SHAKE = 0.6, PUFF = 0.6, FLOAT = 1.4;
const easeOutBack = x => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);

export function diffParts(prev, next) {
  const same = k => k in prev && k in next && JSON.stringify(prev[k]) === JSON.stringify(next[k]);
  return {
    add: Object.keys(next).filter(k => !same(k)),
    remove: Object.keys(prev).filter(k => !same(k)),
    keep: Object.keys(next).filter(same),
  };
}

export function createStage(THREE, { scene, spec, modules, ctx }) {
  const builders = Object.assign({}, ...modules.map(m => m.builders ?? {}));
  const factory = createPartFactory(THREE, { ...ctx, builders, THREE });
  const root = new THREE.Group(), partsGroup = new THREE.Group(), labelsGroup = new THREE.Group(), puffsGroup = new THREE.Group();
  root.name = 'stage'; partsGroup.name = 'stage:parts'; labelsGroup.name = 'stage:labels'; puffsGroup.name = 'stage:puffs';
  root.add(partsGroup, labelsGroup, puffsGroup); scene.add(root);
  const puffGeo = new THREE.IcosahedronGeometry(1, 0);

  let lv = Object.fromEntries(spec.ORDER.map(id => [id, 0])), flags = {};
  const live = new Map();          // key → { spec, part, anim }
  const leaving = new Set();       // 正在縮掉的舊零件
  const puffs = [];
  let views = Object.fromEntries(modules.map(m => [m.id, {}]));

  // 物品「頭上」的位置：主零件的 at + labelY；還沒有零件就用錨點
  function headOf(id) {
    const mod = modules.find(m => m.id === id), v = views[id] ?? {};
    const key = `${id}.main` in v ? `${id}.main` : Object.keys(v)[0];
    const p = key ? v[key].at : anchorWorld(id), y = key ? (v[key].labelY ?? mod?.labelY ?? 1) : 0.6;
    return { x: p.x, y: p.y + y, z: p.z };
  }
  // GROW 式：沒有常駐標籤，等級變化時在物件頭上飄一個「Lv.n」（掉級是灰色往下掉）
  const floats = [];
  function float(id, text, cls = '') {
    const p = headOf(id);
    const el = document.createElement('div'); el.className = cls ? `actor-float ${cls}` : 'actor-float'; el.textContent = text;
    const obj = new CSS2DObject(el); obj.position.set(p.x, p.y, p.z); labelsGroup.add(obj);
    floats.push({ obj, t: 0 });
  }

  function clearFloats() { for (const f of floats) { labelsGroup.remove(f.obj); f.obj.element.remove(); } floats.length = 0; }

  function finish(entry) {
    const a = entry.anim; if (!a) return;
    entry.anim = null; entry.part.object.scale.setScalar(1); entry.part.object.rotation.z = 0; a.done();
  }
  function drop(entry) {
    entry.anim?.done(); entry.anim = null;
    entry.part.dispose?.(); partsGroup.remove(entry.part.object); leaving.delete(entry);
  }
  function puff(at) {
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
      const a = i / 3 * Math.PI * 2;
      m.position.set(at.x, at.y + 0.3, at.z); puffsGroup.add(m);
      puffs.push({ m, t: 0, v: new THREE.Vector3(Math.cos(a) * 0.6, 0.5, Math.sin(a) * 0.6) });
    }
  }
  function clearPuffs() { for (const p of puffs) { puffsGroup.remove(p.m); p.m.material.dispose(); } puffs.length = 0; }

  function sync(instant) {
    const waits = [];
    if (instant) { for (const e of live.values()) finish(e); for (const e of [...leaving]) drop(e); clearPuffs(); }
    for (const mod of modules) {
      const next = mod.view(lv, flags), { add, remove } = diffParts(views[mod.id], next);
      for (const key of remove) {
        const e = live.get(key); if (!e) continue;
        live.delete(key); finish(e);
        if (instant) { drop(e); continue; }
        leaving.add(e); puff(e.spec.at ?? e.part.object.position);
        e.anim = { kind: 'shrink', t: 0, dur: SHRINK, done: () => {} };
      }
      for (const key of add) {
        const part = factory.build(next[key]), e = { spec: next[key], part, anim: null };
        partsGroup.add(part.object); live.set(key, e);
        if (!instant) { part.object.scale.setScalar(1e-3); waits.push(new Promise(done => { e.anim = { kind: 'pop', t: 0, dur: POP, done }; })); }
      }
      views[mod.id] = next;
    }
    return Promise.all(waits);
  }

  function shake(id) {
    const waits = [];
    for (const [key, e] of live) {
      if (!key.startsWith(`${id}.`)) continue;
      finish(e);
      waits.push(new Promise(done => { e.anim = { kind: 'shake', t: 0, dur: SHAKE, done }; }));
    }
    return Promise.all(waits);
  }

  sync(true);

  return {
    apply(e, { instant = false } = {}) {
      const target = e.delta ? e.delta.target : e.item;
      if (e.kind === 'placed') lv = { ...lv, [e.item]: 1 };
      else if (e.kind === 'grow') lv = { ...lv, [e.item]: e.to };
      if (e.delta) lv = { ...lv, [e.delta.target]: e.delta.to };
      if (e.flag) flags = { ...flags, [e.flag.name]: e.flag.value };
      // 等待事件不演（使用者 2026-10-25：光點與轉頭讓畫面太亂）；扣不動的扣級（1→1）也不演
      if (e.kind === 'wait' || (e.delta && e.delta.from === e.delta.to && !e.lock && !e.flag)) return Promise.resolve();
      const changed = sync(instant);
      if (!instant) {
        if (e.kind === 'placed') float(target, 'Lv.1');
        else if (e.kind === 'grow') float(target, levelLabel(e.to, spec.ITEMS[target].max));
        else if (e.delta) float(target, levelLabel(e.delta.to, spec.ITEMS[target].max), e.delta.to < e.delta.from ? 'down' : '');
      }
      // 純演出的事件（老鼠撞翻攤車、颱風假、卡住）：該物品的零件搖一搖
      if (!instant && (e.kind === 'stall' || (e.kind === 'fx' && !e.delta && !e.flag))) return Promise.all([changed, shake(e.item)]).then(() => {});
      return changed.then(() => {});
    },
    update(dt, t) {
      for (const e of [...live.values(), ...leaving]) {
        e.part.update?.(dt, t);
        const a = e.anim; if (!a) continue;
        a.t = Math.min(1, a.t + dt / a.dur);
        const o = e.part.object;
        if (a.kind === 'pop') o.scale.setScalar(Math.max(1e-3, easeOutBack(a.t)));
        else if (a.kind === 'shrink') o.scale.setScalar(Math.max(1e-3, 1 - a.t));
        else o.rotation.z = Math.sin(a.t * Math.PI * 4) * 0.12 * (1 - a.t);
        if (a.t >= 1) { if (a.kind === 'shrink') drop(e); else finish(e); }
      }
      for (let i = floats.length - 1; i >= 0; i--) if ((floats[i].t += dt) >= FLOAT) { labelsGroup.remove(floats[i].obj); floats[i].obj.element.remove(); floats.splice(i, 1); }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i], u = (p.t += dt / PUFF);
        p.m.position.addScaledVector(p.v, dt * (1 - Math.min(1, u)));
        p.m.scale.setScalar(0.12 + u * 0.25); p.m.material.opacity = Math.max(0, 1 - u);
        if (u >= 1) { puffsGroup.remove(p.m); p.m.material.dispose(); puffs.splice(i, 1); }
      }
    },
    reset() {
      for (const e of live.values()) drop(e);
      for (const e of [...leaving]) drop(e);
      live.clear(); clearPuffs(); clearFloats();
      lv = Object.fromEntries(spec.ORDER.map(id => [id, 0])); flags = {};
      views = Object.fromEntries(modules.map(m => [m.id, {}]));
      sync(true);
    },
    levelOf: id => lv[id],
    get lv() { return lv; },
    get flags() { return flags; },
    partKeys: () => [...live.keys()],
  };
}
