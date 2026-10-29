// 回合 → 拍：把引擎這回合吐出的事件，一個一個查物品模組的劇本（script），排成一整串拍交給時間軸演。
// 純粹建構拍、不碰 three.js；拍真正演的時候才讀 ctx 裡的舞台、名冊、鏡頭（§6）。
// 劇本查找：placed → 物品的 script.placed；grow → script.grow[to]；fx／after → 「造成它的」模組（e.cause）的 script.fx；
//   stall → script.stall；settle → 101 的 script.settle；劇本回 null／undefined（或沒寫）就走預設劇本（§6.6）。
// 每個事件的劇本前面插一個 0 秒的 mark 拍（呼叫 ctx.onMark），後面補一個 apply(e)：劇本沒套到的零件在這裡閃白補上（沒剩就 0 秒）。
// 上一回合被撞歪的零件（stage.tilted）在回合一開頭閃白扶正（§8.6「下回合白光扶正」，§13.2 改成零件自己閃白）。
// 鏡頭跟主線（§13.1）：有東西演的事件，劇本前面先 focus 到事件的格子（同一格連續不重複），不同物品之間先空 GAP 秒；
//   劇本第一拍自己就是 focus（或 together 裡有 focus）的不補（101 大升級自己先 focus 101、中途回全景）；回合最後 focus('home', { final: true }) 回全景
//   （拖過也照回；先照舞台上 101 的頭頂更新天際線，§14.4）、名冊全部恢復日常。
// 最終章（選擇帶動升級 2026-10-28 §4，取代計畫 5 的倒數蒙太奇）：最後一輪是一般回合，跟放置回合一模一樣演（1 倍速、不過濾、沒有趕工）。
//   遊戲層合成的事件——飛彈警告 warning（終局回合最前面，紅光＋全島抬頭）、飛彈 missile、尾聲 epilogue——劇本查 finale 模組的
//   script[e.kind]，沒有就 [apply]。這三種的劇本自己管鏡頭：不補 focus、不空拍、不算「上一個物品」。
//   終局回合（finale: true，警告＋飛彈＋尾聲）：不扶正零件、整回合不補 focus／GAP；收尾照舊（回日常、全島效果、回全景）。
//   ctx.speed 恆為 1（時間軸、beats.js 讀它的換算都保留，預設 1 就是不換算）。
// 跳級 = 一個事件（回到 GROW 設計 §4.2）：引擎照舊記兩個 grow（第二個 jump: true，中間可能夾著跨過那一級的 onLevel fx）。
//   第一級（同物品後面有 jump: true、from 接著它的 to、中間沒有同物品別的 grow 的那個）只推 mark(e, { gap: 0, key: false, skipped: true })：
//   不套、不閃、不平移、不查劇本。第二級照一般事件演 n 級的劇本（沒寫就預設；n−1 是 ◆、n 不是時演 n−1 的，見下面 ◆），裡面所有 LEVEL UP 換成彈兩次
//   （withTwice，together 裡也換；LEVEL DOWN 不換）；它的 apply 一次套兩級的零件（舞台 foldEvent 直接設 lv = e.to，從 n−2 到 n 一次 diff，
//   兩級的新零件一起閃白出現）。登陸之後（indoors）第二級 [apply, LEVEL UP×2, apply]。第二級劇本拿到的 s.prev 是 n−2（跟舞台一致）。
// ◆ 關鍵節點（裁決 R11）：劇本函數帶 key: true（script.grow[n].key）——跳級的第二級落在關鍵級時照樣演完整劇本，LEVEL UP 一樣彈兩次。
//   跳級合成時演 {n−1, n} 裡最高的 ◆：n 不是 ◆、n−1 是 ◆ 就演 n−1 的 ◆ 劇本（協調者裁決 2026-10-29：燈泡 Lv7 的風車島不能消失），mark 標 key。
//   n−1 和 n 都是 ◆ 就不合成（Task 6a 修正輪裁決：外星晶片 8 → 9 的矽盾測試）：兩級照一般事件接著演、各自的 ◆ 劇本、各一個 LEVEL UP，起因只在第一級前面。
// 起因閃一下（回到 GROW 設計 §4.2）：grow 的 via 非空（阻擋解除的 +1、所有跳級）→ 劇本前面先（換物品的空拍之後）平移到 via[0] 那一格
//   （鏡頭已經在那一格就不動）、那棟本體（CAUSE_HELPER_KEY = <id>.main）閃白 CAUSE_FLASH 秒，再照常平移到被升級的那一格。
//   via 兩個以上只閃第一個（引擎把第一級的幫手排在前面）。颱風當 via（天氣）、登陸之後、跳級的第一級、終局回合都不插。
//   幫手這一級沒有本體零件（演到才知道）→ 不閃、不停鏡頭，平移照沒有起因時的帳。起因段前面另一個 mark（info.cause: via[0]），劇本前面再一個 mark——pace 單獨量起因段（≤ CAUSE_CAP）。
// 拜訪（幫手走來敲門，計畫 6 設計 §4）2026-10-29 拿掉了（回到 GROW 設計 §4.2）；撲空照舊（下一段）。
// 撲空（計畫 6 設計 §5，show/visit.js 的 miss；取代舊的等待圖框——沒有泡泡、沒有圖框）：wait 事件裡前 MISS_PER_TURN 個叫得到代表的 waits（照 ORDER）各一段
//   （叫不叫得到建串時看模組的 script.hasRep(現在的等級)：鮮奶 Lv2 起（Lv2 借最近的島民）、代幣 Lv2 起、燈泡 Lv7 起電工在離島上叫不到、颱風永遠沒有——不佔位子，往後補；最終審稿 3）：
//   mark(e, { miss: true, item, gap }) → （不同物品先空 GAP；代表叫不到這拍也跳過）→ 平移到代表那一格、跟走過去一起演 → 失望 → 回日常。
//   等待物品沒有代表劇本、這一級沒有代表（hasRep 假）→ 那一項不插、照 ORDER 往後補。代表演到才叫不到（藏著、在劇本手上）→ 整段 0 秒（不再往後補）。
//   颱風登陸之後（大家躲在屋裡）、終局回合不插。之後 wait 事件自己照舊 mark + 不閃白的 apply（沒有別的拍）。
//   pace 看 mark 的 info.miss 把撲空當獨立一段量（≤ MISS_CAP）。
// 颱風登陸之後（使用者規則，計畫 4 任務 9）：登陸事件（landsTyphoon）演完，同一回合後面的事件只演 [apply, LEVEL UP]——
//   大家躲在屋裡，沒有人走路：不查劇本、不補鏡頭平移、不空拍，閃白照常（indoors）。◆ 關鍵級例外（裁決 R14）：照演完整劇本
//   （老鼠不躲雨、霓虹不用人；劇本要拉的人若躲在門裡，walk／gesture／bubble／jump 拍自己跳過，beats.js）。撲空不演（大家躲著）；
//   回合末的 settle 照 101 的劇本，但只留套用、LEVEL UP 與回全景（換塔頂要全景裝得下）。
//   鏡頭：登陸自己回全景；◆ 關鍵劇本把鏡頭帶走之後（最後一個 focus 不是全景），下一個 indoors 事件前面補一拍 focus('home')，
//   之後的 LEVEL UP 才在畫面裡（審稿：老鼠 Lv4 對著溫泉）；其他 indoors 事件照樣不平移。
import { foldEvent, landsTyphoon } from '../rules/engine.js';
import { cellOf } from '../actors/anchors.js';
import { worldEffects } from '../actors/world.js';
import { B, together, CAUSE_FLASH } from './beats.js';
import { BLINK } from './blink.js';
import { miss, MISS_PER_TURN } from './visit.js';

export const GAP = 0.4;   // 不同物品的事件之間空幾秒（§13.1；裁決 R15 0.6 → 0.4）
// 起因閃一下（見檔頭）：閃幾秒（beats.js 的 B.flash 預設同一個數）、閃哪個零件（每個演員模組的本體都是 <id>.main）
export { CAUSE_FLASH };
export const CAUSE_HELPER_KEY = id => `${id}.main`;
// 起因段（mark 的 info.cause 到同一個事件下一個 mark：空拍之後平移到幫手 FOCUS_BEAT、閃白 CAUSE_FLASH、平移回目標 FOCUS_BEAT）的上限，
// pace 與測試單獨量（扣掉空拍）；不算進那一級劇本與 ◆ 的秒數
export const CAUSE_CAP = 2.0;
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
// 一串拍裡所有 focus 拍（together 裡也算），照演出順序
const focusesOf = beats => beats.flatMap(b => (b.kind === 'together' && b.beats ? focusesOf(b.beats) : b.kind === 'focus' ? [b] : []));
// 劇本第一拍自己動鏡頭：是 focus，或是一起演的 together 裡有 focus（鏡頭邊飛主角邊走，燈泡 Lv7）——不補平移
const opensOnFocus = b => b?.kind === 'focus' || (b?.kind === 'together' && !!b.beats?.some(x => x.kind === 'focus'));

// 只留 keep(拍) 為真的拍；together 裡面也過濾，過濾完空了就整個拿掉
function keepOnly(beats, keep) {
  const out = [];
  for (const b of beats) {
    if (!keep(b)) continue;
    if (b.kind === 'together' && b.beats) { const sub = keepOnly(b.beats, keep); if (sub.length) out.push(together(sub)); continue; }
    out.push(b);
  }
  return out;
}

// 預設劇本（§6.6）。大停電（颱風登陸的反應）：電一斷整區同時暗——零件一起閃，不一盞一盞錯開
//   （選擇帶動升級：燈泡 ≤4 也會停電，Lv4 有九盞路燈，錯開要 2.3 s）
const applyOf = e => B.apply(e, e.flag?.name === 'blackout' ? { stagger: 0 } : {});
function defaults(e) {
  if (e.kind === 'placed') return [B.apply(e)];
  if (e.kind === 'grow') return [B.apply(e), B.levelUp(e.item)];
  if (e.delta && e.delta.to > e.delta.from) return [applyOf(e), B.levelUp(e.delta.target)];
  if (e.delta && e.delta.to < e.delta.from) return [applyOf(e), B.levelUp(e.delta.target, { down: true, text: 'LEVEL DOWN' })];
  return [B.apply(e, { blink: false })];
}

// 跳級合成一段（見檔頭）：LEVEL UP 換成彈兩次的；together 裡也換（裡面沒換到就留原拍）；LEVEL DOWN 不換。
// 列車進站拍（trainStop）的 during 也換：拍上的 during 就是它裡面依序演的那個陣列，就地換掉元素（燈泡 Lv7 的 LEVEL UP 在列車停靠的 during 裡）
function withTwice(beats) {
  return beats.map(b => {
    if (b.kind === 'together' && b.beats) { const sub = withTwice(b.beats); return sub.some((x, k) => x !== b.beats[k]) ? together(sub) : b; }
    if (b.kind === 'trainStop' && Array.isArray(b.during)) { withTwice(b.during).forEach((x, k) => { b.during[k] = x; }); return b; }
    return b.kind === 'levelUp' && !b.down && !b.twice ? B.levelUp(b.target, { text: b.text, twice: true }) : b;
  });
}

// 這回合哪些 grow 是跳級的第一級、哪些是合成的第二級（見檔頭）：第 i 個之後同物品的下一個 grow 是 jump: true 而且接著它（from === to）。
// 颱風登陸的事件不當第一級（登陸要演；颱風也沒有跳級）。
// 兩級都是 ◆（isKey(物品, 級)）就不合成（Task 6a 修正輪裁決：外星晶片 8 → 9 不能把矽盾測試吃掉）：兩個 grow 照一般事件接著演，
// 各演自己的 ◆ 劇本、各一個 LEVEL UP；起因閃一下只在第一個前面（apart 記第二個，causeOf 不插）
function jumpPairs(events, isKey = () => false) {
  const first = new Set(), second = new Set(), apart = new Set();
  events.forEach((e, i) => {
    if (e.kind !== 'grow' || landsTyphoon(e)) return;
    const j = events.findIndex((x, k) => k > i && x.kind === 'grow' && x.item === e.item);
    if (!(j > i && events[j].jump && events[j].from === e.to)) return;
    if (isKey(e.item, e.to) && isKey(e.item, events[j].to)) { apart.add(j); return; }
    first.add(i); second.add(j);
  });
  return { first, second, apart };
}

// 登陸之後的事件（indoors）：升級 → [apply, LEVEL UP]；改級的反應 → [apply, LEVEL UP／DOWN]；其他 → 閃白套用
function indoors(e) {
  if (e.kind === 'grow') return [B.apply(e), B.levelUp(e.item)];
  return e.delta && e.delta.to !== e.delta.from ? defaults(e) : [applyOf(e)];
}
// 登陸回合的 settle（101 跳階）：只留套用、LEVEL UP 與回全景（換塔頂要全景裝得下）——不走路、不先飛去 101
const indoorSettle = b => b.kind === 'apply' || b.kind === 'levelUp' || (b.kind === 'focus' && b.target === 'home');

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
  ctx.speed = 1;
  let view = { lv, flags }, settled = meta?.total ?? sum(lv);
  let lastItem = null, lastCell = null;   // 上一個有東西演的事件的物品、鏡頭現在對著的格子（null = 不知道）
  let landed = false;   // 這回合颱風已經登陸（之後的事件 indoors）
  let away = false;     // 鏡頭不在全景：上次回全景之後有過對著格子的 focus（回合開頭在全景）
  const out = finale ? [] : [...(ctx.stage?.tilted ?? [])].map(upright);
  // 撲空演到才知道有沒有人演（代表叫不到、在劇本手上……整段 0 秒）：missFirst 記下撲空之前的帳（上一個物品、鏡頭對著的格）與
  // 每段撲空演了沒有（played）。之後第一個有東西演的事件，空拍與平移包成演到才決定的拍（afterMiss）：撲空全沒演就照撲空之前的帳——
  // 不多空一拍、鏡頭本來就在那一格就不再平移一次（審稿：collapsed 的撲空不動鏡頭的帳）
  let pending = null;   // { item, cell, segs: [{ item, played(c) }] }
  const lastShown = (p, c) => p.segs.filter(x => x.played(c)).at(-1);
  // 演到才決定的空拍：need(c) 真才等 GAP；info（mark 的）的 gap 照實際等了沒有回報（還沒演到時報 GAP——建串時的估計）
  const gapBeat = need => { let ran = null; return { beat: { kind: 'wait', dur: GAP, start(c) { ran = !!need(c); if (!ran) return false; } }, gap: () => (ran === false ? 0 : GAP) }; };
  // 撲空之後第一個事件的開頭：{ gap: beat 或 null, info, focus: 要平移的話演到才決定的平移拍 }；用掉 pending
  const afterMiss = (item, cell) => {
    const p = pending; pending = null;
    const prevItem = c => lastShown(p, c)?.item ?? p.item, need = c => { const li = prevItem(c); return !!li && item !== li; };
    const maybe = [p.item, ...p.segs.map(x => x.item)].some(li => li && item !== li), g = maybe ? gapBeat(need) : null;
    // 演到才決定的平移（to 預設是這個事件的格子；起因閃一下先平移到幫手那一格也用它）：撲空全沒演、鏡頭本來就在 to 那一格就不動
    const focusTo = to => to && { ...B.focus(to), start(c) { if (!lastShown(p, c) && sameCell(to, p.cell)) return false; return B.focus(to).start(c); } };
    return { gap: g?.beat ?? null, gapOf: () => (g ? g.gap() : 0), focus: focusTo(cell), focusTo };
  };

  // 撲空段（見檔頭）：wait 事件裡前 MISS_PER_TURN 個「這一級叫得到代表」的 waits 各一段 mark＋（空拍）＋平移跟走過去一起演＋失望＋回日常。
  // 叫不叫得到先看模組的 script.hasRep(現在的等級)（沒寫就看有沒有 rep）：沒有代表的那一級不佔位子，照 ORDER 往後補（最終審稿 3）
  const canMiss = (w, s) => { const sc = mod(w.item)?.script; return !!sc?.rep && (sc.hasRep ? !!sc.hasRep(s.lv?.[w.item] ?? 0) : true); };
  const missFirst = (e, s) => {
    if (finale || landed) return;
    const p = pending ?? { item: lastItem, cell: lastCell, segs: [] };
    for (const w of (e.waits ?? []).filter(w => canMiss(w, s)).slice(0, MISS_PER_TURN)) {
      const beats = miss(w, s, ctx, { item: mod(w.item), helper: mod(w.for?.[0]) });
      if (!beats.length) continue;
      const [walk, ...rest] = beats, before = [...p.segs];
      // 空拍：代表叫不到就連空拍也不等（整段 0 秒）；叫得到的話這拍就定案、把他拿到劇本手上站著等。
      // 要不要空拍看「真的演了的上一段」是哪個物品（前一段撲空沒演就看再前面的帳）
      const prevItem = c => before.filter(x => x.played(c)).at(-1)?.item ?? p.item;
      const maybe = [p.item, ...before.map(x => x.item)].some(li => li && w.item !== li), g = maybe ? gapBeat(c => walk.ready(c) && !!prevItem(c) && w.item !== prevItem(c)) : null;
      out.push(mark(e, { key: false, miss: true, item: w.item, get gap() { return g ? g.gap() : 0; } }), ...(g ? [g.beat] : []), together([B.focus(walk.cell), walk]), ...rest);
      p.segs.push({ item: w.item, played: c => walk.ready(c) });
      lastItem = w.item; lastCell = null; away = true;   // 鏡頭停在代表那一格（演到才知道是哪格）：下一個事件重新平移（撲空沒演的話 afterMiss 照之前的帳）
    }
    if (p.segs.length) pending = p;
  };

  // 起因閃一下（見檔頭）：這個事件要不要插、閃誰（null = 不插）
  const { first: jumpFirst, second: jumpSecond, apart: jumpApart } = jumpPairs(events, (id, n) => !!mod(id)?.script?.grow?.[n]?.key);
  const causeOf = (e, i) => (e.kind === 'grow' && e.via?.length && e.via[0] !== 'typhoon' && !jumpFirst.has(i) && !jumpApart.has(i) && !landed && !finale ? e.via[0] : null);
  // 起因的拍：toHelper 是平移到幫手那一格的拍（null = 鏡頭已經在那一格）。幫手這一級有沒有本體零件演到才知道（記一次）：
  // 沒有就不平移過去、也不閃（B.flash 自己回 false）。then(main, fallback)：之後平移到目標格的拍——起因演了照 main（鏡頭在幫手那一格），
  // 沒演照 fallback（原本的帳）；兩個都是 null 就不用平移
  const causeBeats = (helper, toHelper) => {
    const key = CAUSE_HELPER_KEY(helper);
    let has = null;
    const shown = c => (has ??= !!c.stage.partObject?.(key));
    const go = toHelper && { ...toHelper, start(c) { if (!shown(c)) return false; return toHelper.start(c); } };
    const then = (main, fallback) => {
      const base = main ?? fallback; if (!base) return null;
      return { ...base, start(c) { const b = shown(c) ? main : fallback; return b ? b.start(c) : false; } };
    };
    return { beats: [...(go ? [go] : []), B.flash(key, CAUSE_FLASH)], then };
  };

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
    const keyFn = grows && (jumpSecond.has(i) && !grows[e.to]?.key && grows[e.to - 1]?.key ? grows[e.to - 1] : grows[e.to]), key = !!keyFn?.key;
    // 跳級的第一級：只有 mark（0 秒）；第二級（twice）照一般事件演、LEVEL UP 彈兩次、它的 apply 一次套兩級
    if (jumpFirst.has(i)) { out.push(mark(e, { gap: 0, key: false, skipped: true })); return; }
    const twice = jumpSecond.has(i), twiced = beats => (twice ? withTwice(beats) : beats);
    // 合成事件（警告、飛彈、尾聲）：finale 劇本整串照演，鏡頭由劇本自己管（不補平移、不空拍、不算上一個物品）
    if (FINALE_KINDS.has(e.kind)) {
      const beats = mod('finale')?.script?.[e.kind]?.(e, s, ctx) ?? [B.apply(e)];
      if (some(beats, b => b.kind === 'focus')) lastCell = null;
      const last = focusesOf(beats).at(-1);
      if (last) away = last.target !== 'home';
      out.push(mark(e), ...beats, B.apply(e));
      return;
    }
    if (landed && !key && e.kind !== 'wait' && e.kind !== 'settle') {
      out.push(mark(e), ...(away ? [B.focus('home')] : []), ...twiced(indoors(e)), B.apply(e)); away = false;
      return;
    }
    let beats;
    if (e.kind === 'wait') {
      missFirst(e, s);
      beats = [B.apply(e, { blink: false })];
    } else {
      const sc = e.kind === 'fx' || e.kind === 'after' ? mod(e.cause)?.script : mod(e.kind === 'settle' ? 'tower' : e.item)?.script;
      const fn = { placed: sc?.placed, grow: keyFn, fx: sc?.fx, after: sc?.fx, stall: sc?.stall, settle: sc?.settle }[e.kind];
      beats = twiced(fn?.(e, s, ctx) ?? (e.kind === 'settle' ? [B.apply(e)] : defaults(e)));
      if (landed && e.kind === 'settle') beats = keepOnly(beats, indoorSettle);
    }
    // 鏡頭：等待事件不補平移（撲空段自己平移到代表那一格）；fx 事件看 e.item、沒有就看 delta 的目標；settle 是 101。
    // 沒有格子的物品（'turn'）不平移、也不算換物品（不空拍）
    const lead = [];
    let gapOf = null;   // 撲空之後演到才決定的空拍：mark 的 info.gap 演完才知道
    let cause = null;   // 起因閃一下插了的話是幫手（mark 的 info.cause）
    if (!finale && e.kind !== 'wait' && (!landed || key) && shows(beats)) {
      const item = e.kind === 'settle' ? 'tower' : e.item ?? e.delta?.target, cell = cellOf(item);
      const helper = causeOf(e, i), hc = helper ? cellOf(helper) : null;
      let pan = null;   // 平移到這個事件那一格的拍（null = 鏡頭已經在那一格）
      if (cell && pending) {   // 撲空之後：空拍、平移演到才決定（見 pending）；起因的平移也算一次平移（用同一本帳）
        const a = afterMiss(item, cell);
        if (a.gap) { lead.push(a.gap); gapOf = a.gapOf; }
        pan = a.focus;
        if (hc) { const k = causeBeats(helper, a.focusTo(hc)); lead.push(...k.beats); pan = k.then(sameCell(cell, hc) ? null : B.focus(cell), pan); cause = helper; }
        lastItem = item;
      } else if (cell) {
        if (lastItem && item !== lastItem) lead.push(B.wait(GAP));
        pan = sameCell(cell, lastCell) ? null : B.focus(cell);
        if (hc) { const k = causeBeats(helper, sameCell(hc, lastCell) ? null : B.focus(hc)); lead.push(...k.beats); pan = k.then(sameCell(cell, hc) ? null : B.focus(cell), pan); cause = helper; }
        lastItem = item;
      }
      if (cell && !opensOnFocus(beats[0])) { if (pan) lead.push(pan); lastCell = cell; }
      else if (cause) lastCell = hc;
      // 劇本自己動了鏡頭（focus 拍）：不知道停在哪，下一個事件一定重新平移
      if (some(beats, b => b.kind === 'focus')) lastCell = null;
    }
    const last = focusesOf([...lead, ...beats]).at(-1);
    if (last) away = last.target !== 'home';
    const gap = gapOf ? null : estimateTurn(lead.filter(b => b.kind === 'wait'), ctx);
    const info = gapOf ? { key, get gap() { return gapOf(); } } : { gap, key };
    // 起因段自己一個 mark（Task 3 裁決 B，同撲空的 info.miss）：mark(e, { cause, gap, key: false }) → 空拍、平移到幫手、閃白、平移回目標，
    // 之後同一個事件再一個 mark(e, { gap: 0, key }) 才是劇本——pace 與測試的 ◆／劇本秒數不含起因段，起因段另外量（≤ CAUSE_CAP）
    if (cause) out.push(mark(e, { ...(gapOf ? { get gap() { return gapOf(); } } : { gap }), key: false, cause }), ...lead, mark(e, { gap: 0, key }));
    else out.push(mark(e, info), ...lead);
    out.push(...beats, B.apply(e));
    if (landsTyphoon(e)) landed = true;
  });

  // 收尾：劇本手上的人回日常；全島效果照舞台最後的狀態瞄準（演到這拍才讀，跳過時 ctx.instant 讓它貼齊）；
  // 最後回全景（名冊全部恢復日常；玩家拖過鏡頭也照回）
  out.push(B.home(c => scriptMembers(c.roster)), {
    kind: 'world', dur: 0,
    start(c) { c.world(worldEffects(c.stage.lv, c.stage.flags, c.stage.meta), !!c.instant); },
  }, B.focus('home', { final: true, skyline: c => c.stage.headOf('tower').y }));   // 回全景前全景跟 101 頭頂走（§14.4）
  return out;
}
