// 舞台：演員的外觀只由「等級向量 + 旗標」決定（§7.1）。每個模組 view(lv, flags) → { key: partSpec }，
// 舞台比對前後兩份 view：沒變的零件不動，變了的「舊的縮掉冒煙 → 新的彈出」（GROW 式變身，0.6 秒 easeOutBack）。
// 跳過、reduced-motion、RESET 都只是「立刻套用最終 view」。
import { CSS2DObject } from '../../vendor/three/addons/renderers/CSS2DRenderer.js';
import { createPartFactory } from './parts.js';
import { anchorWorld } from './anchors.js';
import { levelLabel } from '../ui/format.js';

const POP = 0.6, SHRINK = 0.25, SHAKE = 0.6, PUFF = 0.6, FLOAT = 1.4, TURN = 0.6;
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
  const root = new THREE.Group(), partsGroup = new THREE.Group(), labelsGroup = new THREE.Group(), puffsGroup = new THREE.Group(), sparksGroup = new THREE.Group();
  root.name = 'stage'; partsGroup.name = 'stage:parts'; labelsGroup.name = 'stage:labels'; puffsGroup.name = 'stage:puffs'; sparksGroup.name = 'stage:sparks';
  root.add(partsGroup, labelsGroup, puffsGroup, sparksGroup); scene.add(root);
  const puffGeo = new THREE.IcosahedronGeometry(1, 0);

  let lv = Object.fromEntries(spec.ORDER.map(id => [id, 0])), flags = {};
  const live = new Map();          // key → { spec, part, anim }
  const leaving = new Set();       // 正在縮掉的舊零件
  const puffs = [];
  let views = Object.fromEntries(modules.map(m => [m.id, {}]));

  // 物品「頭上」的位置：主零件的 at + labelY；還沒有零件就用錨點
  function headOf(id, k = 1) {
    const mod = modules.find(m => m.id === id), v = views[id] ?? {};
    const key = `${id}.main` in v ? `${id}.main` : Object.keys(v)[0];
    const p = key ? v[key].at : anchorWorld(id), y = key ? (v[key].labelY ?? mod?.labelY ?? 1) : 0.6;
    return { x: p.x, y: p.y + y * k, z: p.z };
  }
  // GROW 式：沒有常駐標籤，等級變化時在物件頭上飄一個「Lv.n」（掉級是灰色往下掉、等待是灰色「…」）
  const floats = [];
  function float(id, text, cls = '') {
    const p = headOf(id);
    const el = document.createElement('div'); el.className = cls ? `actor-float ${cls}` : 'actor-float'; el.textContent = text;
    const obj = new CSS2DObject(el); obj.position.set(p.x, p.y, p.z); labelsGroup.add(obj);
    floats.push({ obj, t: 0 });
  }

  // 因果光點：誰幫了誰（亮）、誰害了誰（黑）。最後一顆到達時在 update 裡同步呼叫 onArrive（接著變身），
  // 這樣變身的彈出動畫和光點走同一個 update 節拍。被跳過／RESET 清掉時只 resolve、不變身。
  const sparks = [];
  function flySparks(pairs, onArrive) {
    return new Promise(resolve => {
      const batch = { left: pairs.length, onArrive, resolve };
      for (const { from, to, dark } of pairs) {
        const part = factory.build({ kind: 'spark', at: headOf(from, 0.6), to: headOf(to, 0.6), dark, color: dark ? 0x211d1d : 0xfcea8b });
        sparksGroup.add(part.object); sparks.push({ part, batch });
      }
    });
  }
  function landSpark(s) {
    s.part.dispose?.(); sparksGroup.remove(s.part.object);
    if (--s.batch.left === 0) s.batch.resolve(s.batch.onArrive ? s.batch.onArrive() : undefined);
  }
  function clearSparks() { for (const s of sparks) { s.batch.onArrive = null; landSpark(s); } sparks.length = 0; }

  // 等待：零件轉頭看它在等的物品，頭上一個灰色「…」
  const turns = [];
  function waitGesture(waits) {
    const out = [];
    for (const w of waits) {
      const target = headOf(w.for[0]);
      float(w.item, '…', 'wait');
      for (const [key, e] of live) {
        if (!key.startsWith(`${w.item}.`)) continue;
        const o = e.part.object, yaw = Math.atan2(target.x - o.position.x, target.z - o.position.z);
        out.push(new Promise(done => turns.push({ o, yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)) * 0.5, t: 0, done })));
      }
    }
    return Promise.all(out);
  }
  function clearTurns() { for (const t of turns) { t.o.rotation.y = 0; t.done(); } turns.length = 0; }
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
    if (instant) { for (const e of live.values()) finish(e); for (const e of [...leaving]) drop(e); clearPuffs(); clearSparks(); clearTurns(); }
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
      if (e.kind === 'wait') return instant ? Promise.resolve() : waitGesture(e.waits).then(() => {});
      const floatIt = () => {
        if (instant) return;
        if (e.kind === 'placed') float(target, 'Lv.1');
        else if (e.kind === 'grow') float(target, levelLabel(e.to, spec.ITEMS[target].max));
        else if (e.delta) float(target, levelLabel(e.delta.to, spec.ITEMS[target].max), e.delta.to < e.delta.from ? 'down' : '');
      };
      // 先飛光點（誰幫的、誰害的），到了才變身
      const helpers = !instant && e.kind === 'grow' ? (e.via ?? []) : [];
      const harm = !instant && e.kind === 'fx' && e.cause && (e.delta || e.lock) ? (e.delta ? e.delta.target : e.lock) : null;
      if (helpers.length || (harm && harm !== e.cause)) {
        const pairs = helpers.length ? helpers.map(from => ({ from, to: target })) : [{ from: e.cause, to: harm, dark: true }];
        return flySparks(pairs, () => { const changed = sync(false); floatIt(); return changed; }).then(() => {});
      }
      const changed = sync(instant);
      floatIt();
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
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]; s.part.update(dt, t);
        if (s.part.done) { const b = s.part.object.children[0].position, o = s.part.object.position; puff({ x: o.x + b.x, y: o.y + b.y - 0.3, z: o.z + b.z }); sparks.splice(i, 1); landSpark(s); }
      }
      for (let i = turns.length - 1; i >= 0; i--) {
        const tr = turns[i]; tr.t = Math.min(1, tr.t + dt / TURN); tr.o.rotation.y = tr.yaw * Math.sin(Math.PI * tr.t);
        if (tr.t >= 1) { tr.o.rotation.y = 0; turns.splice(i, 1); tr.done(); }
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
      live.clear(); clearSparks(); clearTurns(); clearPuffs(); clearFloats();
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
