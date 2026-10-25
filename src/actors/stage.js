// 舞台：演員的外觀只由「等級向量 + 旗標 + meta」決定（§7.1）。每個模組 view(lv, flags, meta) → { key: partSpec }，
// 舞台比對前後兩份 view：沒變的零件不動，變了的「舊的縮掉冒煙 → 新的彈出」（GROW 式變身，0.6 秒 easeOutBack）。
// 跳過、reduced-motion、RESET 都只是「立刻套用最終 view」。
import { CSS2DObject } from '../../vendor/three/addons/renderers/CSS2DRenderer.js';
import { createPartFactory } from './parts.js';
import { anchorWorld } from './anchors.js';
import { levelLabel } from '../ui/format.js';
import { foldEvent, landsTyphoon } from '../rules/engine.js';
import { stageOf, STAGE_NAMES } from './tower.js';

// 變身（計畫 3.6）：舊的先壓扁 ANTICIPATE 秒再縮掉、新的晚一拍彈出；同一事件多個新零件依序晚 STAGGER 秒。
// 回彈依零件大小：小東西彈得多、整圈軌道幾乎不晃。不冒白煙（使用者 2026-10-25）。
const ANTICIPATE = 0.15, SHRINK = 0.2, POP = 0.75, STAGGER = 0.05, MAX_STAGGER = 0.3, SHAKE = 0.6, FLOAT = 2.2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const easeOutBack = (x, c1) => 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
export const overshoot = r => clamp(2.2 - 0.25 * r, 0.15, 1.9);

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
  const root = new THREE.Group(), partsGroup = new THREE.Group(), labelsGroup = new THREE.Group();
  root.name = 'stage'; partsGroup.name = 'stage:parts'; labelsGroup.name = 'stage:labels';
  root.add(partsGroup, labelsGroup); scene.add(root);

  // meta：回合層級的狀態，只在回合最後的 settle 事件結算（計畫 3.6）。
  //   total：101 看的總等級（不搭別人的事件跳階）；landing：颱風這回合剛登陸（小人、小孩躲起來，到下一回合開始）
  const META0 = { total: 0, landing: false };
  let lv = Object.fromEntries(spec.ORDER.map(id => [id, 0])), flags = {}, meta = META0;
  let landingStale = false;   // 登陸回合已結算：撐過回合結束畫面，下一回合第一個事件才收（審查：跳過的人也要看得到人躲雨）
  const live = new Map();          // key → { spec, part, anim }
  const leaving = new Set();       // 正在縮掉的舊零件
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
    // 外層由 CSS2DRenderer 用 inline transform 定位，動畫放內層 span（CSS 動畫會蓋掉 inline transform，字會全跑到左上角）
    const el = document.createElement('div'); el.className = 'actor-float';
    const inner = document.createElement('span'); inner.className = cls ? `rise ${cls}` : 'rise'; inner.textContent = text; el.append(inner);
    const obj = new CSS2DObject(el); obj.position.set(p.x, p.y, p.z); labelsGroup.add(obj);
    floats.push({ obj, t: 0 });
  }

  function clearFloats() { for (const f of floats) { labelsGroup.remove(f.obj); f.obj.element.remove(); } floats.length = 0; }

  function finish(entry) {
    const a = entry.anim; if (!a) return;
    entry.anim = null; entry.part.object.scale.setScalar(1); entry.part.object.rotation.z = 0; a.done();
  }
  // 零件的半徑：建好時量一次包圍盒（還沒載入的模型、共用小人系統的零件當小東西）
  const box = new THREE.Box3(), boxSize = new THREE.Vector3();
  function radius(object) { box.setFromObject(object); return box.isEmpty() ? 0.3 : box.getSize(boxSize).length() / 2; }
  function drop(entry) {
    entry.anim?.done(); entry.anim = null;
    entry.part.dispose?.(); partsGroup.remove(entry.part.object); leaving.delete(entry);
  }

  // 回傳 { done, added }：done 等所有新零件彈完，added 是這次換上的零件鍵（沒變就是空的）
  function sync(instant) {
    const waits = [], added = [];
    let order = 0;   // 這次第幾個新零件（依序晚一點彈）
    if (instant) { for (const e of live.values()) finish(e); for (const e of [...leaving]) drop(e); }
    for (const mod of modules) {
      const next = mod.view(lv, flags, meta), { add, remove } = diffParts(views[mod.id], next);
      added.push(...add); if (remove.length && !add.length) added.push(...remove);
      const replaced = new Set();
      for (const key of remove) {
        const e = live.get(key); if (!e) continue;
        live.delete(key); finish(e);
        if (instant) { drop(e); continue; }
        leaving.add(e); replaced.add(key);
        e.anim = { kind: 'squash', t: 0, dur: ANTICIPATE, done: () => {} };
      }
      for (const key of add) {
        const part = factory.build(next[key]), e = { spec: next[key], part, anim: null };
        partsGroup.add(part.object); live.set(key, e);
        if (instant) continue;
        const r = radius(part.object);   // 先量再縮
        // 替換：等舊的壓扁完才彈
        const delay = (replaced.has(key) ? ANTICIPATE : 0) + Math.min(MAX_STAGGER, STAGGER * order++);
        part.object.scale.setScalar(1e-3);
        waits.push(new Promise(done => { e.anim = { kind: 'pop', t: 0, dur: POP, delay, c1: overshoot(r), done }; }));
      }
      views[mod.id] = next;
    }
    return { done: Promise.all(waits), added };
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
    // 回傳 Promise<boolean>：false = 畫面上什麼都沒變（導演就不等）
    apply(e, { instant = false } = {}) {
      const target = e.delta ? e.delta.target : e.item;
      if (landingStale) { landingStale = false; meta = { ...meta, landing: false }; }
      ({ lv, flags } = foldEvent({ lv, flags }, e));
      if (landsTyphoon(e)) meta = { ...meta, landing: true };
      if (e.kind === 'settle') {
        const before = stageOf(meta.total);
        landingStale = meta.landing;
        meta = { ...meta, total: Object.values(lv).reduce((a, b) => a + b, 0) };
        const { done, added } = sync(instant);
        if (!added.length) return Promise.resolve(false);
        if (!instant && stageOf(meta.total) !== before) float('tower', STAGE_NAMES[stageOf(meta.total)]);
        return done.then(() => true);
      }
      // 等待事件不演（使用者 2026-10-25：光點與轉頭讓畫面太亂）；扣不動的扣級（1→1）也不演
      if (e.kind === 'wait' || (e.delta && e.delta.from === e.delta.to && !e.lock && !e.flag)) return Promise.resolve(false);
      const changed = sync(instant).done;
      if (!instant) {
        if (e.kind === 'placed') float(target, 'Lv.1');
        else if (e.kind === 'grow') float(target, levelLabel(e.to, spec.ITEMS[target].max));
        else if (e.delta) float(target, levelLabel(e.delta.to, spec.ITEMS[target].max), e.delta.to < e.delta.from ? 'down' : '');
      }
      // 純演出的事件（老鼠撞翻攤車、颱風假、卡住）：該物品的零件搖一搖
      if (!instant && (e.kind === 'stall' || (e.kind === 'fx' && !e.delta && !e.flag))) return Promise.all([changed, shake(e.item)]).then(() => true);
      return changed.then(() => true);
    },
    update(dt, t) {
      for (const e of [...live.values(), ...leaving]) {
        e.part.update?.(dt, t);
        const a = e.anim; if (!a) continue;
        if (a.delay > 0) { a.delay -= dt; continue; }
        a.t = Math.min(1, a.t + dt / a.dur);
        const o = e.part.object;
        if (a.kind === 'pop') o.scale.setScalar(Math.max(1e-3, easeOutBack(a.t, a.c1)));
        else if (a.kind === 'squash') { const k = Math.sin(a.t * Math.PI / 2); o.scale.set(1 + 0.1 * k, 1 - 0.18 * k, 1 + 0.1 * k); }
        else if (a.kind === 'shrink') { const k = Math.max(1e-3, 1 - a.t); o.scale.set(1.1 * k, 0.82 * k, 1.1 * k); }
        else o.rotation.z = Math.sin(a.t * Math.PI * 4) * 0.12 * (1 - a.t);
        if (a.t >= 1) { if (a.kind === 'squash') e.anim = { kind: 'shrink', t: 0, dur: SHRINK, done: a.done }; else if (a.kind === 'shrink') drop(e); else finish(e); }
      }
      for (let i = floats.length - 1; i >= 0; i--) if ((floats[i].t += dt) >= FLOAT) { labelsGroup.remove(floats[i].obj); floats[i].obj.element.remove(); floats.splice(i, 1); }
    },
    reset() {
      for (const e of live.values()) drop(e);
      for (const e of [...leaving]) drop(e);
      live.clear(); clearFloats();
      lv = Object.fromEntries(spec.ORDER.map(id => [id, 0])); flags = {}; meta = META0; landingStale = false;
      views = Object.fromEntries(modules.map(m => [m.id, {}]));
      sync(true);
    },
    headOf,
    levelOf: id => lv[id],
    get meta() { return meta; },
    get lv() { return lv; },
    get flags() { return flags; },
    partKeys: () => [...live.keys()],
  };
}
