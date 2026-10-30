// 舞台：演員的外觀只由「等級向量 + 旗標 + meta」決定（§7.1）。每個模組 view(lv, flags, meta) → { key: partSpec }，
// 舞台比對前後兩份 view：沒變的零件不動，變了的立刻換掉，並回報換了哪些鍵（動畫全交給演出層：閃白揭露、泡泡出 LEVEL UP）。
// deferred：新零件先藏著、舊零件先留著，等演出層 commit(key) 才換（§13.2）：換零件＝舊的立刻拿掉、新的閃白；
//   新增＝新的閃白；移除＝舊的閃白，閃完才拿掉。commitAll（跳過、回合收尾）不閃，閃到一半要拿掉的也立刻拿掉。
// blink：show/blink.js 的閃白；沒給（單元測試）就不閃，移除的立刻拿掉。
// kind 'roster' 的零件（小人）不進工廠，交給名冊 declare / retire。
import { createPartFactory } from './parts.js';
import { anchorWorld, frontOf } from './anchors.js';
import { foldEvent, lockFlags } from '../rules/engine.js';
import { cellAt } from '../scene/hex.js';

export function diffParts(prev, next) {
  const same = k => k in prev && k in next && JSON.stringify(prev[k]) === JSON.stringify(next[k]);
  return {
    add: Object.keys(next).filter(k => !same(k)),
    remove: Object.keys(prev).filter(k => !same(k)),
    keep: Object.keys(next).filter(same),
  };
}

const WIDE = 2.4;   // 自動 footprint：水平邊長超過 WIDE 的不算（軌道、整圈路燈、彩虹），其餘用整個包圍盒（不再縮，人身寬度由走路格外擴 PAD，§14.1）

// 老鼠咬鮮奶（§8.6 的反應）：鮮奶因老鼠掉級的那個事件
export const bitesMilk = e => !!e.delta && e.delta.target === 'milk' && e.cause === 'rat' && e.delta.to < e.delta.from;

// 老鼠當指標（唯一正解 §5.2）：這回合出問題的物品。照 ORDER 第一個被鎖住的（鎖的旗標照規則資料 engine.lockFlags：停電→燈泡、淹水→代幣、
// 巨蛋淹水→棒球）；沒有就這回合 wait 事件裡第一個等幫手的物品（老鼠自己除外）；都沒有就 null
export function troubleOf(lv, flags, waits, spec) {
  const locks = lockFlags(spec);
  const locked = spec.ORDER.find(id => locks[id] && flags[locks[id]]);   // 鎖的旗標只在那個物品放下了才會立（規則：在場才檢查），不用再看 lv
  return locked ?? waits?.find(w => w.item !== 'rat')?.item ?? null;
}
// 出問題那棟的門口：那個物品這一級建築的正面（visitSpot 往鏡頭側走 r，同撲空的 door，不落 nav——老鼠的家用它當散步中心）；
// 正面不在主島格上就用 visitSpot 本身；沒有 visitSpot（颱風、離島那一級）或也不在主島上 → 那個物品的錨點
export function troubleSpot(item, lv, flags, modules) {
  if (!item) return null;
  const n = lv[item] ?? 0, sp = n > 0 ? modules.find(m => m.id === item)?.visitSpot?.(n, { lv, flags }) : null;
  if (sp) {
    const f = frontOf(sp, sp.r ?? 0);
    if (cellAt(f.x, f.z)) return f;
    if (cellAt(sp.x, sp.z)) return { x: sp.x, y: sp.y, z: sp.z };
  }
  return anchorWorld(item);
}

export function createStage(THREE, { scene, spec, modules, ctx, roster = null, blink = null }) {
  const builders = Object.assign({}, ...modules.map(m => m.builders ?? {}));
  // flags：零件可以每幀讀目前的舞台旗標（getter，不是快照）。以前 finale.flare 照倒數 alarm 變快；選擇帶動升級之後紅光固定 2 Hz，目前沒有零件讀它
  const factory = createPartFactory(THREE, { ...ctx, builders, THREE, flags: () => flags });
  const root = new THREE.Group(), partsGroup = new THREE.Group();
  root.name = 'stage'; partsGroup.name = 'stage:parts';
  root.add(partsGroup); scene.add(root);

  // meta：回合層級的狀態，只在回合最後的 settle 事件結算（計畫 3.6）。
  //   total：101 看的總等級（不搭別人的事件跳階）；bitten：老鼠這回合咬了鮮奶（小孩躲回校舍，到下一回合開始）。
  //   （颱風的 landing 拿掉了：躲雨是颱風放下劇本裡的一小段，不是回合狀態——唯一正解修正輪 1）
  //   trouble／troubleAt：這回合出問題的物品與它門口的點（troubleOf／troubleSpot；老鼠 Lv1／Lv2 的家搬到那裡，§5.2）
  const META0 = { total: 0, bitten: false, trouble: null, troubleAt: null };
  let lv = Object.fromEntries(spec.ORDER.map(id => [id, 0])), flags = {}, meta = META0;
  let waits = null;   // 這回合 wait 事件的 waits（經過 apply 時記下，settle 結算 trouble 後清掉）
  let stale = null;   // 被咬的回合已結算：撐過回合結束畫面，下一回合第一個事件才收（審查：跳過的人也要看得到人躲雨）
  const live = new Map();          // key → { spec, part, fp }（pending 的新零件也在這裡）
  const pending = new Map();       // key → { old, fresh }：等 commit 才換的零件
  const dying = new Set();         // 已經 commit 的移除：閃白中，閃完才拿掉
  let views = Object.fromEntries(modules.map(m => [m.id, {}]));
  let seen = new WeakSet();        // 已經折進 lv / flags / meta 的事件（同一事件再 apply 只套剩下的零件）
  const tilted = new Set();        // 被劇本撞歪的零件鍵（beats.js 的 tilt 記下、turn.js 下一回合開頭閃白扶正）

  // 物品「頭上」的位置：主零件的 at + labelY；還沒有零件就用錨點
  function headOf(id) {
    const mod = modules.find(m => m.id === id), v = views[id] ?? {};
    const key = `${id}.main` in v ? `${id}.main` : Object.keys(v)[0];
    const p = key ? v[key].at : anchorWorld(id), y = key ? (v[key].labelY ?? mod?.labelY ?? 1) : 0.6;
    return { x: p.x, y: p.y + y, z: p.z };
  }

  // footprint（§5.3）：宣告的圓 { r, x?, z? }、橢圓 { rx, rz, x?, z? } 或矩形 { w, d, x?, z? }（相對 at），或幾個這樣的形狀的陣列；false 不算；
  // 沒宣告的 compound 建好時量一次包圍盒（零件已經放在 at，包圍盒就是世界座標）；其他 kind 沒宣告就沒有
  const box = new THREE.Box3(), size = new THREE.Vector3(), centre = new THREE.Vector3();
  // 回傳 footprint 的陣列（沒有就空陣列）
  // door（可省）：颱風登陸時算不算能躲進去的門（true／false 蓋過照大小判斷，見 typhoon.js nearestDoor）
  const shapeOf = (f, at) => {
    const x = at.x + (f.x ?? 0), z = at.z + (f.z ?? 0), door = f.door !== undefined ? { door: f.door } : {};
    return f.r !== undefined ? { x, z, r: f.r, ...door } : f.rx !== undefined ? { x, z, rx: f.rx, rz: f.rz, ...door } : { x, z, w: f.w, d: f.d, ...door };
  };
  function footprintOf(s, object) {
    const f = s.footprint, at = s.at ?? { x: 0, z: 0 };
    if (f === false) return [];
    if (f) return [].concat(f).map(g => shapeOf(g, at));
    if (s.kind !== 'compound') return [];
    box.setFromObject(object); if (box.isEmpty()) return [];
    box.getSize(size); box.getCenter(centre);
    return Math.max(size.x, size.z) > WIDE ? [] : [{ x: centre.x, z: centre.z, w: size.x, d: size.z }];
  }
  function make(s) {
    const part = factory.build(s);
    partsGroup.add(part.object);
    return { spec: s, part, fp: footprintOf(s, part.object) };
  }
  // 亮一下／彈一下中的零件先換回原材質、原大小再拿掉（模型會放回池子、煙火會 dispose 自己的材質）
  function drop(entry) { blink?.stop(entry.part.object); entry.part.dispose?.(); partsGroup.remove(entry.part.object); }

  // glint：要不要亮一下（commitAll、換裝前收掉舊的 pending 都不亮）。新零件亮一下＋小彈一下；要拿掉的舊零件只亮、不彈，亮完才拿掉
  function commit(key, glint = true) {
    const p = pending.get(key); if (!p) return;
    pending.delete(key);
    if (p.fresh) {
      if (p.old) drop(p.old);
      p.fresh.part.object.visible = true;
      if (glint) { blink?.part(p.fresh.part.object); blink?.pop(p.fresh.part.object); }
    } else if (glint && blink) {
      dying.add(p.old);
      blink.part(p.old.part.object, undefined, () => { if (dying.delete(p.old)) drop(p.old); });
    } else drop(p.old);
  }
  function dropDying() { for (const d of [...dying]) { dying.delete(d); drop(d); } }

  // 一個鍵的換裝：名冊零件交給名冊，其餘進工廠；deferred 時新的先藏、舊的先留
  function swap(key, prev, next, { hold, deferred }) {
    if (prev?.kind === 'roster' && next?.kind !== 'roster') roster?.retire(key);
    if (next?.kind === 'roster') roster?.declare(key, next, { hold: hold.includes(key) });
    commit(key, false);
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
        changed.push({ key, at: (next[key] ?? prev[key]).at, kind, ...((next[key] ?? prev[key]).tagAlong && { tagAlong: true }) });
        if (key in next) v[key] = next[key]; else delete v[key];
      }
      views[mod.id] = v;
    }
    roster?.flush?.();   // 名冊把退人延後到這一刻（轉身分的人才接得到）
    return { changed, rest };
  }

  function fold(e) {
    if (stale) { meta = { ...meta, ...stale }; stale = null; }
    ({ lv, flags } = foldEvent({ lv, flags }, e));
    if (bitesMilk(e)) meta = { ...meta, bitten: true };
    if (e.kind === 'wait') waits = e.waits ?? null;
    if (e.kind === 'settle') {
      if (meta.bitten) stale = { bitten: false };
      const trouble = troubleOf(lv, flags, waits, spec);
      meta = { ...meta, total: Object.values(lv).reduce((a, b) => a + b, 0), trouble, troubleAt: troubleSpot(trouble, lv, flags, modules) };
      waits = null;
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
    commitAll() { for (const key of [...pending.keys()]) commit(key, false); dropDying(); },
    pendingKeys: () => [...pending.keys()],
    footprints: () => [...live.values()].flatMap(e => e.fp),
    update(dt, t) {
      for (const e of live.values()) e.part.update?.(dt, t);
      for (const p of pending.values()) p.old?.part.update?.(dt, t);
      for (const d of dying) d.part.update?.(dt, t);
    },
    reset() {
      for (const e of live.values()) drop(e);
      for (const p of pending.values()) if (p.old) drop(p.old);
      dropDying();
      live.clear(); pending.clear(); tilted.clear(); roster?.reset?.();
      lv = Object.fromEntries(spec.ORDER.map(id => [id, 0])); flags = {}; meta = META0; stale = null; waits = null; seen = new WeakSet();
      views = Object.fromEntries(modules.map(m => [m.id, {}]));
      sync();
    },
    headOf,
    build: spec => factory.build(spec),   // 名冊用它做模型成員的天線／眼睛
    partObject: key => live.get(key)?.part.object ?? null,   // 試作用：直接操作零件（藏起來、換時機露出）
    levelOf: id => lv[id],
    get meta() { return meta; },
    get lv() { return lv; },
    get flags() { return flags; },
    partKeys: () => [...live.keys()],
    tilted,
  };
}
