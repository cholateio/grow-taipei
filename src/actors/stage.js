// 舞台：演員的外觀只由「等級向量 + 旗標 + meta」決定（§7.1）。每個模組 view(lv, flags, meta) → { key: partSpec }，
// 舞台比對前後兩份 view：沒變的零件不動，變了的立刻換掉，並回報換了哪些鍵（動畫全交給演出層：泡泡出 LEVEL UP；亮一下只剩三種——起因提示、名冊換位／換裝、扶正；建築只長出來不亮，計畫 11 裁決 R15、使用者 2026-10-31「閃一下」）。
// deferred：新零件先藏著、舊零件先留著，等演出層 commit(key) 才換（§13.2）：換零件＝舊的立刻拿掉（新的矮樁蓋住它）、新的出現；
//   新增＝新的出現；移除＝舊的縮下去（blink.shrink），縮完才拿掉。新零件只有會長的建築（growsOn）長出來（不亮），其餘直接出現（計畫 11 §設計 1）。
//   commitAll（跳過、回合收尾）不亮，縮到一半要拿掉的也立刻拿掉；commitAll({ shrinking: true })（拍照常演完）讓縮到一半的縮完自己走。
// blink：show/blink.js 的亮一下／長出來／縮下去；沒給（單元測試）就不長，移除的立刻拿掉。
// kind 'roster' 的零件（小人）不進工廠，交給名冊 declare / retire。
// 回合預熱（計畫 15 C）：prepare(events) 在回合開始把這回合會用到的零件先建好、藏著（不佔 draw call），套用時直接拿來用——
//   不在動畫中途建 mesh；模型都載好之後演出層把它們交給 renderer 先編好 shader（show/index.js 的 compile）。
import { createPartFactory } from './parts.js';
import { anchorWorld, frontOf } from './anchors.js';
import { foldEvent, lockFlags } from '../rules/engine.js';
import { cellAt, axialToWorld } from '../scene/hex.js';

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
// 出問題那棟的門口：那個物品這一級建築的正面（visitSpot 往鏡頭側走 r，不落 nav——老鼠的家用它當散步中心）；
// 正面不在主島格上就用 visitSpot 本身；沒有 visitSpot（颱風、離島那一級）或也不在主島上 → 那個物品的錨點
// 老鼠的散步中心離格心最多 TROUBLE_IN（使用者 2026-11-01 截圖：路燈的門口點剛好落在格邊的橋頭，老鼠繞著它晃就一直走上橋、兩隻在窄橋上互相讓不開）：
//   走路格的格內切半徑約 1.95（橋頭在那裡），老鼠繞 TROUBLE_R 0.4，留 0.65 的餘裕 → 門口點超過 1.3 就沿格心方向拉回 1.3
export const TROUBLE_IN = 1.3;
export function troubleSpot(item, lv, flags, modules) {
  if (!item) return null;
  const n = lv[item] ?? 0, sp = n > 0 ? modules.find(m => m.id === item)?.visitSpot?.(n, { lv, flags }) : null;
  if (sp) {
    const f = frontOf(sp, sp.r ?? 0);
    if (cellAt(f.x, f.z)) return pullIn(f);
    if (cellAt(sp.x, sp.z)) return pullIn({ x: sp.x, y: sp.y, z: sp.z });
  }
  return pullIn(anchorWorld(item));
}
function pullIn(p) {
  const cell = cellAt(p.x, p.z); if (!cell) return p;
  const c = axialToWorld(...cell), d = Math.hypot(p.x - c.x, p.z - c.z);
  if (d <= TROUBLE_IN) return p;
  const k = TROUBLE_IN / d; return { x: c.x + (p.x - c.x) * k, y: p.y, z: c.z + (p.z - c.z) * k };
}

// 長出來（blink.grow，修正批次 2 協調者裁決）只給建築：kind 是 compound／glb／campus、footprint 不是 false、不是 tagAlong 點綴的才長；
// 其他（footprint false 的雲、雨、纜線、軌道與列車、霓虹、光環、UFO、堤防、彩虹、被吹到海裡的攤車、離島點綴……）不長（計畫 11 §設計 1：直接出現）——
// 它們的 at 常在地面或原點、畫在高處，從底部長會變成從地面／水裡升上來。零件 spec 可寫 grow: true／false 蓋過；tagAlong 點綴寫了也不長（跟著主零件，不另外亮）
const GROW_KINDS = new Set(['compound', 'glb', 'campus']);
export const growsOn = spec => !spec?.tagAlong && (typeof spec?.grow === 'boolean' ? spec.grow : GROW_KINDS.has(spec?.kind) && spec.footprint !== false);
// 外形（2026-11-05 使用者：「只有在建築物外觀發生明顯變化時，才需要有建築物由下往上的動畫」——學校＋鐘塔、101 被撞彎）：
// 零件 spec 拿掉不改外形的欄位（顏色、發光、tint、頭的高度、footprint、標籤）之後的字串。換掉的建築外形一樣（颱風後屋頂換色、
// 小孩躲回校舍窗戶亮燈、鐘塔蓋好校舍的頭變高……）就原地換掉，不重長
const PAINT = new Set(['color', 'glow', 'tint', 'labelY', 'label', 'footprint', 'grow']);
export const shapeKey = spec => JSON.stringify(spec, (k, v) => (PAINT.has(k) ? undefined : v));
export const reshaped = (prev, next) => !prev || shapeKey(prev) !== shapeKey(next);

export function createStage(THREE, { scene, spec, modules, ctx, roster = null, blink = null }) {
  const builders = Object.assign({}, ...modules.map(m => m.builders ?? {}));
  // flags：零件可以每幀讀目前的舞台旗標（getter，不是快照）。以前 finale.flare 照倒數 alarm 變快；選擇帶動升級之後紅光固定 2 Hz，目前沒有零件讀它
  // crowd：零件每幀讀名冊裡露出來的人（roster.bodies()：{ x, z, r, dx, dz }；外送機車看前面有沒有人、要不要煞車，修正批次 fix3 §B）
  const factory = createPartFactory(THREE, { ...ctx, builders, THREE, flags: () => flags, crowd: () => roster?.bodies?.() ?? [] });
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
  const live = new Map();          // key → { spec, part, fp, bounds }（pending 的新零件也在這裡；bounds：建零件時量的世界包圍盒，空的是 null）
  const pending = new Map();       // key → { old, fresh }：等 commit 才換的零件
  const dying = new Set();         // 已經 commit 的移除：閃白中，閃完才拿掉
  let views = Object.fromEntries(modules.map(m => [m.id, {}]));
  let seen = new WeakSet();        // 已經折進 lv / flags / meta 的事件（同一事件再 apply 只套剩下的零件）
  // 每個事件真的變了的零件鍵（計畫 15 D：LEVEL UP 冒在這些零件上）：apply 套到的新增／換掉的鍵，tagAlong 點綴、名冊的人、移除的不算；
  // 零件 spec 寫 label: false 的也不算（天上的煙火、會跑走的接駁車：建零件時量的位置不是字該冒的地方，劇本把鏡頭留在物品格）；
  // 同一事件分幾次 only 套用會累加
  let touched = new WeakMap();
  const tilted = new Set();        // 被劇本撞歪的零件鍵（beats.js 的 tilt 記下、turn.js 下一回合開頭閃白扶正）

  // 物品「頭上」的位置：主零件的 at + labelY；還沒有零件就用錨點
  function headOf(id) {
    const mod = modules.find(m => m.id === id), v = views[id] ?? {};
    const key = `${id}.main` in v ? `${id}.main` : Object.keys(v)[0];
    const p = key ? v[key].at : anchorWorld(id), y = key ? (v[key].labelY ?? mod?.labelY ?? 1) : 0.6;
    return { x: p.x, y: p.y + y, z: p.z };
  }
  // 事件 e 變了的、物品 id 的零件頭上（計畫 15 D；使用者 2026-11-02 錄影：燈泡 Lv6 變電所的 LEVEL UP 冒在隔壁學校頭上，以為學校升了兩次）：
  //   每個鍵的頭 = spec 有 labelY 就 at + labelY，否則建零件時量的包圍盒頂上 0.3（不看現在的縮放：長出來是從 0.15 的矮樁開始，計畫 15 B）；
  //   包圍盒是空的（glb 模型還在載）就跳過。全部鍵合起來 x、z 取平均、y 取最高。
  //   沒有鍵、或合起來水平邊長超過 WIDE（整島的霓虹、整圈路燈）→ 退回 headOf
  const span = new THREE.Box3(), spanSize = new THREE.Vector3(), mid = new THREE.Vector3(), point = new THREE.Vector3();
  function headOfEvent(e, id) {
    const heads = []; span.makeEmpty();
    for (const key of touched.get(e) ?? []) {
      const entry = key.startsWith(`${id}.`) ? live.get(key) : null; if (!entry) continue;
      const { spec: s, bounds } = entry, at = s.at ?? { x: 0, y: 0, z: 0 };
      if (bounds) span.union(bounds);
      if (s.labelY !== undefined) {
        const p = { x: at.x, y: (at.y ?? 0) + s.labelY, z: at.z }; heads.push(p); span.expandByPoint(point.set(p.x, p.y, p.z));
      } else if (bounds) { bounds.getCenter(mid); heads.push({ x: mid.x, y: bounds.max.y + 0.3, z: mid.z }); }
    }
    if (!heads.length) return headOf(id);
    span.getSize(spanSize); if (Math.max(spanSize.x, spanSize.z) > WIDE) return headOf(id);
    const avg = k => heads.reduce((a, h) => a + h[k], 0) / heads.length;
    return { x: avg('x'), y: Math.max(...heads.map(h => h.y)), z: avg('z') };
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
  // 預熱好的零件：鍵 + '\n' + JSON.stringify(spec) → { spec, part, fp, bounds }（藏著、已經在 partsGroup 裡；同一個鍵同一個 spec 只建一次，用掉就拿走）
  const prebuilt = new Map();
  const prebuiltId = (key, s) => key + '\n' + JSON.stringify(s);
  // 套用時要一個零件：先拿預熱好的（同鍵同 spec）；沒有才當場建
  function make(s, key) {
    const id = prebuiltId(key, s), hit = prebuilt.get(id);
    if (hit) { prebuilt.delete(id); hit.spec = s; return hit; }
    return construct(s);
  }
  function construct(s) {
    const part = factory.build(s);
    partsGroup.add(part.object);
    // 頭的高度（headOfEvent）：建好這一刻量（零件已經放在 at、還沒長，就是原尺寸的世界座標）；glb／campus 模型非同步載入，這時還是空的 → null
    const bounds = new THREE.Box3().setFromObject(part.object);
    return { spec: s, part, fp: footprintOf(s, part.object), bounds: bounds.isEmpty() ? null : bounds };
  }
  // 亮一下／長出來／縮下去中的零件先換回原材質、原大小再拿掉（模型會放回池子、煙火會 dispose 自己的材質）
  function drop(entry) { blink?.stop(entry.part.object); entry.part.dispose?.(); partsGroup.remove(entry.part.object); }

  // glint：要不要演（commitAll、換裝前收掉舊的 pending 都不演，直接換）。計畫 11 §設計 1／裁決 R15（舞台的 commit 管建築長出來）：
  //   新零件是會長的建築（growsOn）才長出來（blink.grow，修正批次 2），其餘直接出現、不亮——
  //   長的建築也不亮（不再 blink.part）：使用者 2026-10-31「閃一下」，30 fps 錄影裡整棟一片白就是這道光（長出來的曲線見 blink.js grow）；
  //   使用者 2026-10-31「建築物還是會閃一下」：鏡頭對著正面時，背面的點綴（圍欄、路燈、煙、離島三段……）換掉也在亮；
  //   換零件的舊的立刻拿掉（新的矮樁蓋住它）；只拿掉的舊零件縮下去（blink.shrink），縮完才拿掉、不亮；
  //   換掉的建築外形沒變（reshaped，只換色／換燈／換頭高）就原地換、不重長（2026-11-05）
  function commit(key, glint = true) {
    const p = pending.get(key); if (!p) return;
    pending.delete(key);
    if (p.fresh) {
      if (p.old) drop(p.old);
      const o = p.fresh.part.object; o.visible = true;
      if (glint && growsOn(p.fresh.spec) && reshaped(p.old?.spec, p.fresh.spec)) blink?.grow(o);
    } else if (glint && blink) {
      dying.add(p.old);
      blink.shrink(p.old.part.object, undefined, () => { if (dying.delete(p.old)) drop(p.old); });
    } else drop(p.old);
  }
  function dropDying() { for (const d of [...dying]) { dying.delete(d); drop(d); } }

  // 一個鍵的換裝：名冊零件交給名冊，其餘進工廠；deferred 時新的先藏、舊的先留
  function swap(key, prev, next, { hold, deferred }) {
    if (prev?.kind === 'roster' && next?.kind !== 'roster') roster?.retire(key);
    if (next?.kind === 'roster') roster?.declare(key, next, { hold: hold.includes(key) });
    commit(key, false);
    const old = live.get(key) ?? null; live.delete(key);
    const fresh = next && next.kind !== 'roster' ? make(next, key) : null;
    if (fresh) live.set(key, fresh);
    if (deferred && (old || fresh)) {
      if (fresh) fresh.part.object.visible = false;
      pending.set(key, { old, fresh });
    } else {
      if (fresh) fresh.part.object.visible = true;   // 預熱的零件是藏著的
      if (old) drop(old);
    }
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

  // 折一個事件：state = { lv, flags, meta, waits, stale } → 新的 state（純函數，不碰閉包；apply 寫回、prepare 拿副本往前推）
  function foldStage(st, e) {
    let { lv, flags, meta, waits, stale } = st;
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
    return { lv, flags, meta, waits, stale };
  }

  // 回合預熱（計畫 15 C）：從現在的 state 逐事件往前折，每一步每個模組的 view 跟上一步比（起點是現在的 views），
  //   新出現／換掉的零件先建好、藏著（object.visible = false，不佔 draw call；不進 live，所以不在 partKeys／footprints／obstacles 裡）。
  //   名冊的人不進工廠；kind 'people' 的零件（舊的小人零件，現在只有單元測試用）建的時候就把人放上島，也不預熱。
  //   不動 views、live、pending、touched 與 lv／flags／meta。回 { parts：這次新建的物件, ready：它們的 glb 模型都載好（失敗也算）}
  function prepare(events) {
    let st = { lv, flags, meta, waits, stale };
    const prev = { ...views }, parts = [], loads = [], folded = new Set();
    for (const e of events) {
      if (seen.has(e) || folded.has(e)) continue;   // 同 apply：一個事件只折一次
      folded.add(e); st = foldStage(st, e);
      for (const mod of modules) {
        const next = mod.view(st.lv, st.flags, st.meta);
        for (const key of diffParts(prev[mod.id], next).add) {
          const s = next[key], id = prebuiltId(key, s);
          if (s.kind === 'roster' || s.kind === 'people' || prebuilt.has(id)) continue;
          const entry = construct(s); entry.part.object.visible = false;
          prebuilt.set(id, entry); parts.push(entry.part.object);
          if (entry.part.ready) loads.push(entry.part.ready);
        }
        prev[mod.id] = next;
      }
    }
    return { parts, ready: Promise.all(loads).then(() => {}) };
  }
  // 預熱了沒用到的全部丟掉（回合結束：照常演完、跳過、中止；RESET）
  function dropPrepared() { for (const entry of prebuilt.values()) drop(entry); prebuilt.clear(); }

  sync();

  return {
    // 同步、瞬間：回 { changed: [{ key, at, kind }], rest: [key] }；順便把這次變了的鍵記進 touched（名冊的人不進 live，也就不算）
    apply(e, opts) {
      if (!seen.has(e)) { seen.add(e); ({ lv, flags, meta, waits, stale } = foldStage({ lv, flags, meta, waits, stale }, e)); }
      const r = sync(opts);
      for (const c of r.changed) {
        if (c.kind === 'remove' || c.tagAlong || !live.has(c.key) || live.get(c.key).spec.label === false) continue;
        if (!touched.has(e)) touched.set(e, new Set());
        touched.get(e).add(c.key);
      }
      return r;
    },
    commit,
    prepare,
    dropPrepared,
    // shrinking：拍照常演完（beats.apply 的 end、回合照常結束）時傳 true——縮到一半的零件縮完自己走（不在拍尾截成半截再消失）；
    // 跳過、中止、RESET（show/index.js snap）不傳：立刻拿掉
    commitAll({ shrinking = false } = {}) { for (const key of [...pending.keys()]) commit(key, false); if (!shrinking) dropDying(); },
    pendingKeys: () => [...pending.keys()],
    footprints: () => [...live.values()].flatMap(e => e.fp),
    // 會動的障礙（修正批次 fix3 §B）：零件 builder 回傳的物件帶 obstacle()（回這一幀的 { x, z, r, ahead? } 或陣列、世界座標）就收進來——
    // 外送機車；名冊每幀拿去讓路。還沒露出來（deferred 藏著）的零件不算
    obstacles: () => [...live.values()].filter(e => e.part.obstacle && e.part.object.visible).flatMap(e => [].concat(e.part.obstacle() ?? [])),
    update(dt, t) {
      for (const e of live.values()) e.part.update?.(dt, t);
      for (const p of pending.values()) p.old?.part.update?.(dt, t);
      for (const d of dying) d.part.update?.(dt, t);
    },
    reset() {
      dropPrepared();
      for (const e of live.values()) drop(e);
      for (const p of pending.values()) if (p.old) drop(p.old);
      dropDying();
      live.clear(); pending.clear(); tilted.clear(); roster?.reset?.();
      lv = Object.fromEntries(spec.ORDER.map(id => [id, 0])); flags = {}; meta = META0; stale = null; waits = null; seen = new WeakSet(); touched = new WeakMap();
      views = Object.fromEntries(modules.map(m => [m.id, {}]));
      sync();
    },
    headOf,
    headOfEvent,
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
