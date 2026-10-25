// 舞台：演員的外觀只由「等級向量 + 旗標 + meta」決定（§7.1）。每個模組 view(lv, flags, meta) → { key: partSpec }，
// 舞台比對前後兩份 view：沒變的零件不動，變了的立刻換掉，並回報換了哪些鍵（動畫全交給演出層：白光揭露、泡泡出 LEVEL UP）。
// deferred：新零件先藏著、舊零件先留著，等演出層在白光最亮那一刻 commit(key) 才換。
// kind 'roster' 的零件（小人）不進工廠，交給名冊 declare / retire。
import { createPartFactory } from './parts.js';
import { anchorWorld } from './anchors.js';
import { foldEvent, landsTyphoon } from '../rules/engine.js';

export function diffParts(prev, next) {
  const same = k => k in prev && k in next && JSON.stringify(prev[k]) === JSON.stringify(next[k]);
  return {
    add: Object.keys(next).filter(k => !same(k)),
    remove: Object.keys(prev).filter(k => !same(k)),
    keep: Object.keys(next).filter(same),
  };
}

const WIDE = 2.4, SHRINK = 0.9;   // 自動 footprint：水平邊長超過 WIDE 的不算（軌道、整圈路燈、彩虹），其餘縮 0.9

export function createStage(THREE, { scene, spec, modules, ctx, roster = null }) {
  const builders = Object.assign({}, ...modules.map(m => m.builders ?? {}));
  const factory = createPartFactory(THREE, { ...ctx, builders, THREE });
  const root = new THREE.Group(), partsGroup = new THREE.Group();
  root.name = 'stage'; partsGroup.name = 'stage:parts';
  root.add(partsGroup); scene.add(root);

  // meta：回合層級的狀態，只在回合最後的 settle 事件結算（計畫 3.6）。
  //   total：101 看的總等級（不搭別人的事件跳階）；landing：颱風這回合剛登陸（小人、小孩躲起來，到下一回合開始）
  const META0 = { total: 0, landing: false };
  let lv = Object.fromEntries(spec.ORDER.map(id => [id, 0])), flags = {}, meta = META0;
  let landingStale = false;   // 登陸回合已結算：撐過回合結束畫面，下一回合第一個事件才收（審查：跳過的人也要看得到人躲雨）
  const live = new Map();          // key → { spec, part, fp }（pending 的新零件也在這裡）
  const pending = new Map();       // key → { old, fresh }：等 commit 才換的零件
  let views = Object.fromEntries(modules.map(m => [m.id, {}]));
  let seen = new WeakSet();        // 已經折進 lv / flags / meta 的事件（同一事件再 apply 只套剩下的零件）

  // 物品「頭上」的位置：主零件的 at + labelY；還沒有零件就用錨點
  function headOf(id) {
    const mod = modules.find(m => m.id === id), v = views[id] ?? {};
    const key = `${id}.main` in v ? `${id}.main` : Object.keys(v)[0];
    const p = key ? v[key].at : anchorWorld(id), y = key ? (v[key].labelY ?? mod?.labelY ?? 1) : 0.6;
    return { x: p.x, y: p.y + y, z: p.z };
  }

  // footprint（§5.3）：宣告的圓 { r } 或矩形 { w, d, x?, z? }（相對 at）；false 不算；
  // 沒宣告的 compound 建好時量一次包圍盒（零件已經放在 at，包圍盒就是世界座標）；其他 kind 沒宣告就沒有
  const box = new THREE.Box3(), size = new THREE.Vector3(), centre = new THREE.Vector3();
  function footprintOf(s, object) {
    const f = s.footprint, at = s.at ?? { x: 0, z: 0 };
    if (f === false) return null;
    if (f?.r !== undefined) return { x: at.x, z: at.z, r: f.r };
    if (f) return { x: at.x + (f.x ?? 0), z: at.z + (f.z ?? 0), w: f.w, d: f.d };
    if (s.kind !== 'compound') return null;
    box.setFromObject(object); if (box.isEmpty()) return null;
    box.getSize(size); box.getCenter(centre);
    return Math.max(size.x, size.z) > WIDE ? null : { x: centre.x, z: centre.z, w: size.x * SHRINK, d: size.z * SHRINK };
  }
  function make(s) {
    const part = factory.build(s);
    partsGroup.add(part.object);
    return { spec: s, part, fp: footprintOf(s, part.object) };
  }
  function drop(entry) { entry.part.dispose?.(); partsGroup.remove(entry.part.object); }

  function commit(key) {
    const p = pending.get(key); if (!p) return;
    pending.delete(key);
    if (p.old) drop(p.old);
    if (p.fresh) p.fresh.part.object.visible = true;
  }

  // 一個鍵的換裝：名冊零件交給名冊，其餘進工廠；deferred 時新的先藏、舊的先留
  function swap(key, prev, next, { hold, deferred }) {
    if (prev?.kind === 'roster' && next?.kind !== 'roster') roster?.retire(key);
    if (next?.kind === 'roster') roster?.declare(key, next, { hold: hold.includes(key) });
    commit(key);
    const old = live.get(key) ?? null; live.delete(key);
    const fresh = next && next.kind !== 'roster' ? make(next) : null;
    if (fresh) live.set(key, fresh);
    if (deferred && (old || fresh)) {
      if (fresh) fresh.part.object.visible = false;
      pending.set(key, { old, fresh });
    } else if (old) drop(old);
  }

  // 套用目前的 view：only 只套這些鍵，其餘留著舊 view（下次 diff 還會出現）並回報在 rest
  function sync({ only = null, hold = [], deferred = false } = {}) {
    const changed = [], rest = [];
    for (const mod of modules) {
      const prev = views[mod.id], next = mod.view(lv, flags, meta), { add, remove } = diffParts(prev, next);
      const keys = [...add, ...remove.filter(k => !add.includes(k))], v = { ...prev };
      for (const key of keys) {
        if (only && !only.includes(key)) { rest.push(key); continue; }
        const kind = !(key in next) ? 'remove' : key in prev ? 'replace' : 'add';
        swap(key, prev[key], next[key], { hold, deferred });
        changed.push({ key, at: (next[key] ?? prev[key]).at, kind });
        if (key in next) v[key] = next[key]; else delete v[key];
      }
      views[mod.id] = v;
    }
    roster?.flush?.();   // 名冊把退人延後到這一刻（轉身分的人才接得到）
    return { changed, rest };
  }

  function fold(e) {
    if (landingStale) { landingStale = false; meta = { ...meta, landing: false }; }
    ({ lv, flags } = foldEvent({ lv, flags }, e));
    if (landsTyphoon(e)) meta = { ...meta, landing: true };
    if (e.kind === 'settle') {
      landingStale = meta.landing;
      meta = { ...meta, total: Object.values(lv).reduce((a, b) => a + b, 0) };
    }
  }

  sync();

  return {
    // 同步、瞬間：回 { changed: [{ key, at, kind }], rest: [key] }
    apply(e, opts) {
      if (!seen.has(e)) { seen.add(e); fold(e); }
      return sync(opts);
    },
    commit,
    commitAll() { for (const key of [...pending.keys()]) commit(key); },
    pendingKeys: () => [...pending.keys()],
    footprints: () => [...live.values()].map(e => e.fp).filter(Boolean),
    update(dt, t) {
      for (const e of live.values()) e.part.update?.(dt, t);
      for (const p of pending.values()) p.old?.part.update?.(dt, t);
    },
    reset() {
      for (const e of live.values()) drop(e);
      for (const p of pending.values()) if (p.old) drop(p.old);
      live.clear(); pending.clear(); roster?.reset?.();
      lv = Object.fromEntries(spec.ORDER.map(id => [id, 0])); flags = {}; meta = META0; landingStale = false; seen = new WeakSet();
      views = Object.fromEntries(modules.map(m => [m.id, {}]));
      sync();
    },
    headOf,
    partObject: key => live.get(key)?.part.object ?? null,   // 試作用：直接操作零件（藏起來、換時機露出）
    levelOf: id => lv[id],
    get meta() { return meta; },
    get lv() { return lv; },
    get flags() { return flags; },
    partKeys: () => [...live.keys()],
  };
}
