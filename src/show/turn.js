// 回合 → 拍：把引擎這回合吐出的事件，一個一個查物品模組的劇本（script），排成一整串拍交給時間軸演。
// 純粹建構拍、不碰 three.js；拍真正演的時候才讀 ctx 裡的舞台、名冊、鏡頭（§6）。
// 劇本查找：placed → 物品的 script.placed；grow → script.grow[to]；fx／after → 「造成它的」模組（e.cause）的 script.fx；
//   stall → script.stall；settle → 101 的 script.settle；劇本回 null／undefined（或沒寫）就走預設劇本（§6.6）。
// 每個事件的劇本前面插一個 0 秒的 mark 拍（呼叫 ctx.onMark），後面補一個 apply(e)：劇本沒套到的零件在這裡閃白補上（沒剩就 0 秒）。
// 上一回合被撞歪的零件（stage.tilted）在回合一開頭亮一下扶正（§8.6「下回合白光扶正」，§13.2 改成零件自己閃白、計畫 9 §4 再改成亮一下）。
// 鏡頭跟主線（§13.1）：有東西演的事件，劇本前面先 focus 到事件的格子（同一格連續不重複），不同物品之間先空 GAP 秒；
//   劇本第一拍自己就是 focus（或 together 裡有 focus）的不補（101 大升級自己先 focus 101、中途回全景）；回合最後 focus('home', { final: true }) 回全景
//   （拖過也照回；先照舞台上 101 的頭頂更新天際線，§14.4）、名冊全部恢復日常。
// 最終章（選擇帶動升級 2026-10-28 §4，取代計畫 5 的倒數蒙太奇）：最後一輪是一般回合，跟放置回合一模一樣演（1 倍速、不過濾、沒有趕工）。
//   遊戲層合成的事件——隕石警告 warning（終局回合最前面，光點＋全島抬頭）、隕石 missile、尾聲 epilogue——劇本查 finale 模組的
//   script[e.kind]，沒有就 [apply]。這三種的劇本自己管鏡頭：不補 focus、不空拍、不算「上一個物品」。
//   終局回合（finale: true，警告＋隕石＋尾聲）：不扶正零件、整回合不補 focus／GAP；收尾照舊（回日常、全島效果、回全景）。
//   ctx.speed 恆為 1（時間軸、beats.js 讀它的換算都保留，預設 1 就是不換算）。
// 跳級 = 一個事件（回到 GROW 設計 §4.2）：引擎照舊記兩個 grow（第二個 jump: true，中間可能夾著跨過那一級的 onLevel fx）。
//   第一級（同物品後面有 jump: true、from 接著它的 to、中間沒有同物品別的 grow 的那個）只推 mark(e, { gap: 0, key: false, skipped: true })：
//   不套、不閃、不平移、不查劇本。第二級照一般事件演 n 級的劇本（沒寫就預設；n−1 是 ◆、n 不是時演 n−1 的，見下面 ◆），裡面所有 LEVEL UP 換成彈兩次
//   （withTwice，together 裡也換；LEVEL DOWN 不換）；它的 apply 一次套兩級的零件（舞台 foldEvent 直接設 lv = e.to，從 n−2 到 n 一次 diff，
//   兩級的新零件一起閃白出現）。第二級劇本拿到的 s.prev 是 n−2（跟舞台一致）。
// ◆ 關鍵節點（裁決 R11）：劇本函數帶 key: true（script.grow[n].key；放下事件看 script.placed.key，唯一正解 §5.3 颱風放下）——跳級的第二級落在關鍵級時照樣演完整劇本，LEVEL UP 一樣彈兩次。
//   跳級合成時演 {n−1, n} 裡最高的 ◆：n 不是 ◆、n−1 是 ◆ 就演 n−1 的 ◆ 劇本（協調者裁決 2026-10-29：燈泡 Lv7 的風車島不能消失），mark 標 key。
//   n−1 和 n 都是 ◆ 就不合成（Task 6a 修正輪裁決：外星晶片 8 → 9 的矽盾測試）：兩級照一般事件接著演、各自的 ◆ 劇本、各一個 LEVEL UP，起因只在第一級前面。
// 起因提示（幫手那棟亮一下／彈一下、鏡頭先平移過去）2026-10-31 拿掉了（唯一正解設計 R22，使用者：學校閃了好幾次、連彈一下都不要）：grow 的 via 只給引擎用，演出層不看。
// 拜訪（幫手走來敲門，計畫 6 設計 §4）2026-10-29 拿掉了（回到 GROW 設計 §4.2）；撲空（計畫 6 設計 §5，走過去低頭嘆氣）2026-10-31 也拿掉了
//   （唯一正解設計 R10，使用者：看不出意義——失敗的可讀性由颱風（修正批次 2：三級，放下那回合全部檢查、鎖住的反應演給玩家看）、連鎖、老鼠守門口負責）：wait 事件只剩 mark＋不閃白的 apply，不平移、不空拍。
// 剛放下的物品連著演（計畫 15 A，使用者 2026-11-02 錄影回報）：引擎的成長掃描照 ORDER 走，剛放下的物品常常等別人全長完才升 Lv2。
//   建拍前（跳級合成、逐事件折 view 之前）groupPlaced 把它的成長段搬到放下段正後面——只在回合開始的 view 折完放下段之後，
//   那一級的條件（spec 的 up[to]／jump[to]）就已經成立時才搬（不看 via：via 列的是所有成立的幫手，證明不了這回合有沒有靠中間的升級）。
//   搬了之後 s.prev、跳級合成、mark 都照新順序。唯一正解：代幣、燈泡、晶片、珍奶、老鼠的 Lv2 搬；棒球不搬（放下時鮮奶 2，要等鮮奶 3）。
// 颱風放下（唯一正解 2026-10-31 修正輪 1 裁決）：舊的「颱風登陸之後同一回合只演 [apply, LEVEL UP]（indoors）」拿掉了——
//   躲雨是颱風放下劇本裡的一小段（跑到門口躲一下、又走出來淋雨），同一回合後面的事件照一般事件演（人看得到、雨照下）。
import { foldEvent, lockFlags } from '../rules/engine.js';
import { compile } from '../rules/conditions.js';
import { cellOf } from '../actors/anchors.js';
import { worldEffects } from '../actors/world.js';
import { B, together } from './beats.js';
import { BLINK } from './blink.js';

export const GAP = 0.4;   // 不同物品的事件之間空幾秒（§13.1；裁決 R15 0.6 → 0.4）
// 鎖住的反應（協調者裁決 2026-10-31）：引擎 fx 事件帶 lock（大停電鎖燈泡、捷運站淹水鎖代幣、大巨蛋淹水鎖棒球）是玩家要看到的事——
// 平移到被鎖的那一格、閃白套用、等那個物品的名冊走到新站位（arriving 都清掉；球員爬上巨蛋屋頂），最多 LOCK_HOLD 秒；不冒字
// （鎖不是升降級，標題卡會講災難）。帶 delta 的（大停電的鮮奶 −1）鏡頭照舊在鮮奶格、等完再演鮮奶的 LEVEL DOWN（那是真的降級，字要在畫面裡）
export const LOCK_HOLD = 2.0;
// 遊戲層合成的事件（最終章）：劇本在 finale 模組
const FINALE_KINDS = new Set(['warning', 'missile', 'epilogue']);

const sum = lv => Object.values(lv).reduce((a, b) => a + b, 0);

// 預估一串拍的秒數：有 estimate 用 estimate；數字 dur 直接加；函數 dur（start 之後才知道）算 0；together 取最長的子拍。
// 回真實秒數：拍的長度是演出時間，除以 ctx.speed（現在恆為 1）
export function estimateTurn(beats, ctx) {
  const one = b => {
    if (b.kind === 'together' && b.beats) return Math.max(0, ...b.beats.map(one));
    if (b.estimate) return b.estimate(ctx);
    return typeof b.dur === 'number' && b.dur > 0 ? b.dur : 0;
  };
  return beats.reduce((t, b) => t + one(b), 0) / (ctx?.speed > 0 ? ctx.speed : 1);
}

// 有沒有一拍（together 裡也算）符合 f
const some = (beats, f) => beats.some(b => f(b) || (b.kind === 'together' && b.beats && some(b.beats, f)));
// 有東西演：除了不閃白的套用（瞬間換上、沒有畫面）以外還有別的拍
const shows = beats => some(beats, b => b.kind !== 'together' && !(b.kind === 'apply' && b.blink === false));
const sameCell = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
// 劇本第一拍自己動鏡頭：是 focus，或是一起演的 together 裡有 focus（鏡頭邊飛主角邊走，燈泡 Lv7）——不補平移
const opensOnFocus = b => b?.kind === 'focus' || (b?.kind === 'together' && !!b.beats?.some(x => x.kind === 'focus'));


// 預設劇本（§6.6）。大停電（颱風放下的反應）：電一斷整區同時暗——零件一起閃
//   （計畫 15 B 之後 apply 的預設就是同一刻 commit，{ stagger: 0 } 跟預設一樣，留著寫明大停電不錯開）
const applyOf = e => B.apply(e, e.flag?.name === 'blackout' ? { stagger: 0 } : {});
// 鎖住的反應（見 LOCK_HOLD）：閃白套用、等被鎖那個物品的名冊走到新站位
const lockArrived = id => c => c.roster.keys().filter(k => k.startsWith(`${id}.`)).flatMap(k => c.roster.members(k))
  .every(m => m.hidden || m.gone || m.mode !== 'home' || !m.arriving);
export const lockBeats = e => [applyOf(e), B.until(lockArrived(e.lock), LOCK_HOLD)];
function defaults(e) {
  if (e.kind === 'placed') return [B.apply(e)];
  if (e.kind === 'fx' && e.lock) return e.delta && e.delta.to < e.delta.from ? [...lockBeats(e), B.levelUp(e.delta.target, { down: true, text: 'LEVEL DOWN' })] : lockBeats(e);
  if (e.kind === 'grow') return [B.apply(e), B.levelUp(e.item)];
  if (e.delta && e.delta.to > e.delta.from) return [applyOf(e), B.levelUp(e.delta.target)];
  if (e.delta && e.delta.to < e.delta.from) return [applyOf(e), B.levelUp(e.delta.target, { down: true, text: 'LEVEL DOWN' })];
  return [B.apply(e, { blink: false })];
}

// 跳級合成一段（見檔頭）：LEVEL UP 換成彈兩次的；together 裡也換（裡面沒換到就留原拍）；LEVEL DOWN 不換；
// 別的字（101 頭上的「世界珍奶節」這種標題字，不是升級）也不換——修正批次 trim §A：珍奶 4 → 6 合成演 ◆6 之後它才會落在跳級裡。
// 列車進站拍（trainStop）的 during 也換：拍上的 during 就是它裡面依序演的那個陣列，就地換掉元素（燈泡 Lv7 的 LEVEL UP 在列車停靠的 during 裡）
function withTwice(beats) {
  return beats.map(b => {
    if (b.kind === 'together' && b.beats) { const sub = withTwice(b.beats); return sub.some((x, k) => x !== b.beats[k]) ? together(sub) : b; }
    if (b.kind === 'trainStop' && Array.isArray(b.during)) { withTwice(b.during).forEach((x, k) => { b.during[k] = x; }); return b; }
    return b.kind === 'levelUp' && !b.down && !b.twice && b.text === 'LEVEL UP' ? B.levelUp(b.target, { text: b.text, twice: true }) : b;
  });
}

// 這回合哪些 grow 是跳級的第一級、哪些是合成的第二級（見檔頭）：第 i 個之後同物品的下一個 grow 是 jump: true 而且接著它（from === to）。
// 颱風沒有跳級（放下是 placed，不是 grow）。
// 兩級都是 ◆（isKey(物品, 級)）就不合成（Task 6a 修正輪裁決：外星晶片 8 → 9 不能把矽盾測試吃掉）：兩個 grow 照一般事件接著演，
// 各演自己的 ◆ 劇本、各一個 LEVEL UP
function jumpPairs(events, isKey = () => false) {
  const first = new Set(), second = new Set();
  events.forEach((e, i) => {
    if (e.kind !== 'grow') return;
    const j = events.findIndex((x, k) => k > i && x.kind === 'grow' && x.item === e.item);
    if (!(j > i && events[j].jump && events[j].from === e.to)) return;
    if (isKey(e.item, e.to) && isKey(e.item, events[j].to)) return;
    first.add(i); second.add(j);
  });
  return { first, second };
}


// 剛放下的物品連著演（計畫 15 A，見檔頭）：放下段 = placed 加上緊接在後、item 或 cause 是它的 fx（放下反應、雨中被鎖、被咬）；
// 成長段 = 放下段之後它的第一個 grow，加上緊接在後、item 或 cause 是它的 grow／fx（跳級第二級、onLevel 的 fx）。
// 只收 grow／fx：回合結束反應 after（鮮奶過期，item／cause 是放下的物品）、wait、stall、settle 不算，留在原位（修正輪 1 Important 1）。
// 從回合開始的 view 折完放下段，成長段每個 grow 的條件（spec 的 up[to]，跳級看 jump[to]）都成立才把成長段搬到放下段正後面。
// 條件裡有 age／locked（演出層的 view 只有 lv 與 flags，算不準）或 ltPlus（兩個物品的相對級數，保守起見一律不搬）、找不到條件、沒有 placed、沒有成長段、
// 或成長段本來就緊接著放下段：原樣回傳（同一個陣列參照）。純函數，不改輸入
const UNSAFE_KEYS = ['age', 'locked', 'ltPlus'];   // 條件語言（conditions.js）裡讀 view 以外狀態的那幾種
const readsHidden = c => !!c && typeof c === 'object' && (UNSAFE_KEYS.some(k => k in c) || Object.values(c).some(v => (Array.isArray(v) ? v.some(readsHidden) : readsHidden(v))));
export function groupPlaced(events, spec, view) {
  const p = events.findIndex(e => e.kind === 'placed');
  if (p < 0 || !spec?.ITEMS) return events;
  const id = events[p].item, mine = (e, kinds) => kinds.includes(e.kind) && (e.item === id || e.cause === id);
  let h = p + 1;
  while (h < events.length && mine(events[h], ['fx'])) h++;                          // 放下段 = [p, h)
  const g = events.findIndex((e, k) => k >= h && e.kind === 'grow' && e.item === id);
  if (g < 0 || g === h) return events;
  let end = g + 1;
  while (end < events.length && mine(events[end], ['grow', 'fx'])) end++;           // 成長段 = [g, end)
  let v = { lv: view?.lv ?? {}, flags: view?.flags ?? {} };
  for (let k = 0; k < h; k++) v = foldEvent(v, events[k]);
  const state = { lv: v.lv, flags: v.flags, age: {}, held: {}, locked: {} };
  for (let k = g; k < end; k++) {
    const e = events[k];
    if (e.kind !== 'grow') continue;
    const cond = (e.jump ? spec.ITEMS[e.item]?.jump : spec.ITEMS[e.item]?.up)?.[e.to];
    if (!cond || readsHidden(cond) || !compile(cond, {})(state)) return events;
  }
  return [...events.slice(0, h), ...events.slice(g, end), ...events.slice(h, g), ...events.slice(end)];
}

// 扶正：零件當場轉回來、閃白 BLINK 秒；跳過時 end 照樣轉回來（閃白由 snap 收掉）
function upright(key) {
  const fix = c => { const o = c.stage.partObject(key); if (o) o.rotation.z = 0; };
  return {
    kind: 'apply', dur: BLINK,
    start(c) {
      c.stage.tilted.delete(key);
      const o = c.stage.partObject(key); if (!o || !o.rotation.z) return false;
      o.rotation.z = 0; c.blink.part(o);
    },
    end: fix,
  };
}

// mark：0 秒拍，演到這裡告訴 ctx.onMark「這個事件開始了」（pace 工具用 elapsed 差值量每個事件的秒數，包含平移與空拍）；
// 第二個參數 info = { gap, key }：gap 是劇本前面補的空拍（不同物品之間的 GAP）真實秒數——pace 用「不含 focus 拍的秒數」量劇本本身，
// 再扣掉它；key 是不是 ◆ 關鍵劇本
const mark = (e, info = { gap: 0, key: false }) => ({ kind: 'mark', dur: 0, start: c => { c.onMark?.(e, info); } });

// 名冊裡所有被劇本拿去用（mode 'script'）的人：回合收尾讓他們回日常
function scriptMembers(roster) {
  return roster.keys().flatMap(k => roster.members(k)).filter(m => m.mode === 'script');
}

export function buildTurn(events, { modules, spec, lv, flags, meta, finale = false }, ctx) {
  const mod = id => modules.find(m => m.id === id);
  events = groupPlaced(events, spec, { lv, flags });   // 剛放下的物品連著演（計畫 15 A）：跳級合成、逐事件折 view 都照搬過的順序
  ctx.speed = 1;
  let view = { lv, flags }, settled = meta?.total ?? sum(lv);
  let lastItem = null, lastCell = null;   // 上一個有東西演的事件的物品、鏡頭現在對著的格子（null = 不知道）
  const out = finale ? [] : [...(ctx.stage?.tilted ?? [])].map(upright);
  const { first: jumpFirst, second: jumpSecond } = jumpPairs(events, (id, n) => !!mod(id)?.script?.grow?.[n]?.key);
  events.forEach((e, i) => {
    // 跳級合成的第二級：「這次升級前」是舞台上看得到的樣子——第一級沒有套，物品還在 n−2（中間的 fx 照樣折進去）。
    // 劇本看 s.prev 判斷升級前的狀態（老鼠 Lv4 看升級前有沒有在車頂上），要跟舞台一致
    const before = view; view = foldEvent(view, e);
    const prev = jumpSecond.has(i) ? { ...before, lv: { ...before.lv, [e.item]: e.from - 1 } } : before;
    const total = sum(view.lv);
    // settle 的 prevTotal 是上次結算的總等級（101 看的是結算值，不是事件中途的總和）
    const s = { lv: view.lv, flags: view.flags, prev, total, prevTotal: e.kind === 'settle' ? settled : sum(prev.lv) };
    if (e.kind === 'settle') settled = total;
    Object.assign(ctx, { lv: s.lv, flags: s.flags, prev, event: e });

    // 這個 grow 演哪一級的劇本：一般是 script.grow[to]；跳級合成的第二級演 {n−1, n} 裡最高的 ◆——n 是 ◆ 演 n，
    // 不然 n−1 是 ◆ 就演 n−1 的 ◆ 劇本（協調者裁決：燈泡 Lv7 風車島這種大場面不能從正解裡消失；它的 apply 落在 n 級事件上，
    // n 級的零件跟補的 apply 一起出現），都不是就演 n
    const grows = e.kind === 'grow' ? mod(e.item)?.script?.grow : null;
    const keyFn = grows && (jumpSecond.has(i) && !grows[e.to]?.key && grows[e.to - 1]?.key ? grows[e.to - 1] : grows[e.to]);
    const key = e.kind === 'placed' ? !!mod(e.item)?.script?.placed?.key : !!keyFn?.key;   // 放下的 ◆（颱風到 101、全島躲雨）
    // 跳級的第一級：只有 mark（0 秒）；第二級（twice）照一般事件演、LEVEL UP 彈兩次、它的 apply 一次套兩級
    if (jumpFirst.has(i)) { out.push(mark(e, { gap: 0, key: false, skipped: true })); return; }
    const twice = jumpSecond.has(i), twiced = beats => (twice ? withTwice(beats) : beats);
    // 合成事件（警告、隕石、尾聲）：finale 劇本整串照演，鏡頭由劇本自己管（不補平移、不空拍、不算上一個物品）
    if (FINALE_KINDS.has(e.kind)) {
      const beats = mod('finale')?.script?.[e.kind]?.(e, s, ctx) ?? [B.apply(e)];
      if (some(beats, b => b.kind === 'focus')) lastCell = null;
      out.push(mark(e), ...beats, B.apply(e));
      return;
    }
    let beats;
    if (e.kind === 'wait') beats = [B.apply(e, { blink: false })];
    else {
      const sc = e.kind === 'fx' || e.kind === 'after' ? mod(e.cause)?.script : mod(e.kind === 'settle' ? 'tower' : e.item)?.script;
      const fn = { placed: sc?.placed, grow: keyFn, fx: sc?.fx, after: sc?.fx, stall: sc?.stall, settle: sc?.settle }[e.kind];
      beats = twiced(fn?.(e, s, ctx) ?? (e.kind === 'settle' ? [B.apply(e)] : defaults(e)));
    }
    // 鏡頭：等待事件不補平移（只有不閃白的 apply，沒有東西演）；fx 事件看 e.item、沒有就看 delta 的目標；settle 是 101。
    // 沒有格子的物品（'turn'）不平移、也不算換物品（不空拍）
    const lead = [];
    if (!finale && e.kind !== 'wait' && shows(beats)) {
      // 鎖住的反應平移到被鎖的那一格（e.item 是造成它的颱風）——除非同一條真的降了級（大停電鮮奶 −1：鏡頭留在鮮奶格演 LEVEL DOWN）；
      // 鮮奶 Lv1 被打（delta 1 → 1，沒真的掉級、沒有 LEVEL DOWN）照樣平移到燈泡那格（第一批審稿 Minor）
      const lockPan = e.kind === 'fx' && e.lock && !(e.delta && e.delta.to < e.delta.from);
      const item = e.kind === 'settle' ? 'tower' : lockPan ? e.lock : e.item ?? e.delta?.target, cell = cellOf(item);
      let pan = null;        // 平移到這個事件那一格的拍（null = 鏡頭已經在那一格）
      if (cell) {
        if (lastItem && item !== lastItem) lead.push(B.wait(GAP));
        pan = sameCell(cell, lastCell) ? null : B.focus(cell);
        lastItem = item;
      }
      // 劇本開場自己平移（opensOnFocus）就不補平移；下面那行也會因為劇本有 focus 把 lastCell 清掉
      if (cell && !opensOnFocus(beats[0])) { if (pan) lead.push(pan); lastCell = cell; }
      // 劇本自己動了鏡頭（focus 拍）：不知道停在哪，下一個事件一定重新平移
      if (some(beats, b => b.kind === 'focus')) lastCell = null;
    }
    const gap = estimateTurn(lead.filter(b => b.kind === 'wait'), ctx);
    out.push(mark(e, { gap, key }), ...lead);
    out.push(...beats, B.apply(e));
  });

  // 收尾：劇本手上的人回日常；全島效果照舞台最後的狀態瞄準（演到這拍才讀，跳過時 ctx.instant 讓它貼齊）；
  // 最後回全景（名冊全部恢復日常；玩家拖過鏡頭也照回）
  out.push(B.home(c => scriptMembers(c.roster)), {
    kind: 'world', dur: 0,
    start(c) { c.world(worldEffects(c.stage.lv, c.stage.flags, c.stage.meta), !!c.instant); },
  }, B.focus('home', { final: true, skyline: c => c.stage.headOf('tower').y }));   // 回全景前全景跟 101 頭頂走（§14.4）
  return out;
}
