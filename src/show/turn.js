// 回合 → 拍：把引擎這回合吐出的事件，一個一個查物品模組的劇本（script），排成一整串拍交給時間軸演。
// 純粹建構拍、不碰 three.js；拍真正演的時候才讀 ctx 裡的舞台、名冊、鏡頭（§6）。
// 劇本查找：placed → 物品的 script.placed；grow → script.grow[to]；fx／after → 「造成它的」模組（e.cause）的 script.fx；
//   stall → script.stall；settle → 101 的 script.settle；劇本回 null／undefined（或沒寫）就走預設劇本（§6.6）。
// 每個事件的劇本前面插一個 0 秒的 mark 拍（呼叫 ctx.onMark），後面補一個 apply(e)：劇本沒套到的零件在這裡閃白補上（沒剩就 0 秒）。
// 上一回合被撞歪的零件（stage.tilted）在回合一開頭閃白扶正（§8.6「下回合白光扶正」，§13.2 改成零件自己閃白）。
// 鏡頭跟主線（§13.1）：有東西演的事件，劇本前面先 focus 到事件的格子（同一格連續不重複），不同物品之間先空 GAP 秒；
//   劇本第一拍自己就是 focus（或 together 裡有 focus）的不補（101 大升級自己先 focus 101、中途回全景）；回合最後 focus('home', { final: true }) 回全景
//   （拖過也照回；先照舞台上 101 的頭頂更新天際線，§14.4）、名冊全部恢復日常。
// 蒙太奇（飛彈倒數三回合，§4.4）：每個劇本只留走路／套用／LEVEL UP／出場／回家／鏡頭，太長連走路也拿掉；
//   整串拍用 MONTAGE_SPEED 倍速演（裁決 R15：ctx.speed，時間軸統一換算——等待、泡泡、停格、小動作、走路、關鍵劇本一起快）。
//   例外：等待圖框是給玩家讀的字，長度乘回 MONTAGE_SPEED（真實秒數照舊 1.2 s）。
// 最終章（計畫 5，設計 §9）：遊戲層合成的事件——倒數字 countdown（每個倒數回合最前面，101 頭上 3／2／1，取代以前蒙太奇自己冒的 3、2、1）、
//   飛彈 missile、尾聲 epilogue——劇本查 finale 模組的 script[e.kind]，沒有就 [apply]。這三種的劇本自己管鏡頭：不補 focus、不空拍、
//   不算「上一個物品」；每一拍標 keep（蒙太奇不過濾：倒數字要留著；字的長度由劇本乘回倍速）。
//   終局回合（finale: true，飛彈＋尾聲）：1 倍速、不扶正零件、整回合不補 focus／GAP；收尾照舊（回日常、全島效果、回全景）。
//   MONTAGE_CAP（20）比的是真實秒數：estimateTurn 已經除以倍速，所以超過 20 秒真實時間才拿掉走路。
// 跳級（物品 v2 §3、§6）：同一物品連兩個 grow、第二個 jump: true——帶 jump 的那個只演 [apply, LEVEL UP]：不平移、不空拍、不查劇本，
//   兩個 LEVEL UP 連著出（跳過時兩級的 apply 都照樣套上）。
// ◆ 關鍵節點（裁決 R11）：劇本函數帶 key: true（script.grow[n].key）——跳級的第二級落在關鍵級時照樣演完整劇本（不是只有 apply + LEVEL UP）；
//   關鍵劇本的每一拍（together 裡也是）標 keep，蒙太奇不過濾、超過 MONTAGE_CAP 拿掉走路時也不拿，倒數回合裡照樣看得到。
// 颱風登陸之後（使用者規則，計畫 4 任務 9）：登陸事件（landsTyphoon）演完，同一回合後面的事件只演 [apply, LEVEL UP]——
//   大家躲在屋裡，沒有人走路：不查劇本、不補鏡頭平移、不空拍，閃白照常（indoors）。◆ 關鍵級例外（裁決 R14）：照演完整劇本
//   （老鼠不躲雨、霓虹不用人；劇本要拉的人若躲在門裡，walk／gesture／bubble／jump 拍自己跳過，beats.js）。等待圖框照舊（謎題提示）；
//   回合末的 settle 照 101 的劇本，但只留套用、LEVEL UP 與回全景（換塔頂要全景裝得下）。
//   鏡頭：登陸自己回全景；◆ 關鍵劇本把鏡頭帶走之後（最後一個 focus 不是全景），下一個 indoors 事件前面補一拍 focus('home')，
//   之後的 LEVEL UP 才在畫面裡（審稿：外星倒數 1 老鼠 Lv4 對著溫泉）；其他 indoors 事件照樣不平移。
import { foldEvent, landsTyphoon } from '../rules/engine.js';
import { anchorWorld, cellOf } from '../actors/anchors.js';
import { worldEffects } from '../actors/world.js';
import { B, together } from './beats.js';
import { BLINK } from './blink.js';

export const MONTAGE_CAP = 20, MONTAGE_KEEP = ['walk', 'apply', 'levelUp', 'spawn', 'home', 'together', 'focus'], MONTAGE_SPEED = 2;
export const GAP = 0.4;   // 不同物品的事件之間空幾秒（§13.1；裁決 R15 0.6 → 0.4）
const HINT_DUR = 1.2;
// 遊戲層合成的事件（最終章）：劇本在 finale 模組
const FINALE_KINDS = new Set(['countdown', 'missile', 'epilogue']);

const sum = lv => Object.values(lv).reduce((a, b) => a + b, 0);

// 預估一串拍的秒數：有 estimate 用 estimate；數字 dur 直接加；函數 dur（start 之後才知道）算 0；together 取最長的子拍。
// 回真實秒數：拍的長度是演出時間，除以 ctx.speed（蒙太奇 2 倍速）
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

// 關鍵劇本：每一拍（together 裡也是）標 keep
function markKeep(beats) { for (const b of beats) { b.keep = true; if (b.kind === 'together' && b.beats) markKeep(b.beats); } return beats; }
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

// 預設劇本（§6.6）
function defaults(e) {
  if (e.kind === 'placed') return [B.apply(e)];
  if (e.kind === 'grow') return [B.apply(e), B.levelUp(e.item)];
  if (e.delta && e.delta.to > e.delta.from) return [B.apply(e), B.levelUp(e.delta.target)];
  if (e.delta && e.delta.to < e.delta.from) return [B.apply(e), B.levelUp(e.delta.target, { down: true, text: 'LEVEL DOWN' })];
  return [B.apply(e, { blink: false })];
}

// 登陸之後的事件（indoors）：升級 → [apply, LEVEL UP]；改級的反應 → [apply, LEVEL UP／DOWN]；其他 → 閃白套用
function indoors(e) {
  if (e.kind === 'grow') return [B.apply(e), B.levelUp(e.item)];
  return e.delta && e.delta.to !== e.delta.from ? defaults(e) : [B.apply(e)];
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

// 演到才找、找到第一次就記住（等待圖框的平移和泡泡對著同一個人）
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };

// 名冊裡所有被劇本拿去用（mode 'script'）的人：回合收尾讓他們回日常
function scriptMembers(roster) {
  return roster.keys().flatMap(k => roster.members(k)).filter(m => m.mode === 'script');
}

export function buildTurn(events, { modules, spec, lv, flags, meta, montage = false, finale = false }, ctx) {
  const mod = id => modules.find(m => m.id === id);
  if (finale) montage = false;   // 終局回合 1 倍速、不過濾
  ctx.montage = montage; ctx.speed = montage ? MONTAGE_SPEED : 1;
  const lastWait = events.map(e => e.kind).lastIndexOf('wait');
  let view = { lv, flags }, settled = meta?.total ?? sum(lv);
  let lastItem = null, lastCell = null;   // 上一個有東西演的事件的物品、鏡頭現在對著的格子（null = 不知道）
  let landed = false;   // 這回合颱風已經登陸（之後的事件 indoors）
  let away = false;     // 鏡頭不在全景：上次回全景之後有過對著格子的 focus（回合開頭在全景）
  const out = finale ? [] : [...(ctx.stage?.tilted ?? [])].map(upright);

  events.forEach((e, i) => {
    const prev = view; view = foldEvent(view, e);
    const total = sum(view.lv);
    // settle 的 prevTotal 是上次結算的總等級（101 看的是結算值，不是事件中途的總和）
    const s = { lv: view.lv, flags: view.flags, prev, total, prevTotal: e.kind === 'settle' ? settled : sum(prev.lv) };
    if (e.kind === 'settle') settled = total;
    Object.assign(ctx, { lv: s.lv, flags: s.flags, prev, event: e });

    const keyFn = e.kind === 'grow' ? mod(e.item)?.script?.grow?.[e.to] : null, key = !!keyFn?.key;
    // 合成事件（倒數字、飛彈、尾聲）：finale 劇本整串照演，鏡頭由劇本自己管（不補平移、不空拍、不算上一個物品）
    if (FINALE_KINDS.has(e.kind)) {
      const beats = markKeep(mod('finale')?.script?.[e.kind]?.(e, s, ctx) ?? [B.apply(e)]);
      if (some(beats, b => b.kind === 'focus')) lastCell = null;
      const last = focusesOf(beats).at(-1);
      if (last) away = last.target !== 'home';
      out.push(mark(e), ...beats, B.apply(e));
      return;
    }
    if (landed && !key && e.kind !== 'wait' && e.kind !== 'settle') {
      out.push(mark(e), ...(away ? [B.focus('home')] : []), ...indoors(e), B.apply(e)); away = false;
      return;
    }
    // 跳級的第二級：只看 e.jump（引擎只把它標在同物品 +2 的第二個 grow 上；中間插了第一級的 fx 也一樣）
    const jumped = e.kind === 'grow' && e.jump;
    let beats;
    if (jumped && !key) {
      out.push(mark(e), B.apply(e), B.levelUp(e.item), B.apply(e));
      return;
    }
    if (e.kind === 'wait') {
      // 等待圖框（§6.5）：一回合只演最後一個 wait；代表角色先問模組，沒有就找離物品最近、看得到的島民
      beats = [B.apply(e, { blink: false })];
      if (i === lastWait && e.waits?.length) {
        // 藏起來的人（颱風登陸躲進門裡）不算；外面一個人都沒有就掛在物品（建築）頭上。演到才找、找到就記住：平移與圖框同一個對象
        const w = e.waits[0], rep = once(c => mod(w.item)?.script?.rep?.(s, c) ?? c.roster.nearest('landmarks.islanders', anchorWorld(w.item), { visible: true }) ?? w.item);
        // 鏡頭先平移到他身上（人：他站的地方；物品：它的格子），圖框才在畫面裡（審稿：兩條正解唯一的等待圖框在畫面外）
        const pan = Object.assign(B.focus(c => { const r = rep(c); return typeof r === 'string' ? r : r?.pos ? { x: r.pos.x, y: r.pos.y, z: r.pos.z } : null; }), { keep: true });
        beats.push(pan, Object.assign(B.bubble(rep, { icon: w.for[0] }, HINT_DUR * ctx.speed), { keep: true }));   // 謎題提示：蒙太奇裡也留著、真實 1.2 s
        lastCell = null;
      }
    } else {
      const sc = e.kind === 'fx' || e.kind === 'after' ? mod(e.cause)?.script : mod(e.kind === 'settle' ? 'tower' : e.item)?.script;
      const fn = { placed: sc?.placed, grow: sc?.grow?.[e.to], fx: sc?.fx, after: sc?.fx, stall: sc?.stall, settle: sc?.settle }[e.kind];
      beats = fn?.(e, s, ctx) ?? (e.kind === 'settle' ? [B.apply(e)] : defaults(e));
      if (landed && e.kind === 'settle') beats = keepOnly(beats, indoorSettle);
    }
    if (key) markKeep(beats);
    if (montage) beats = keepOnly(beats, b => b.keep || MONTAGE_KEEP.includes(b.kind));
    // 鏡頭：等待事件不補平移（演圖框的那個自己平移到代表角色）；fx 事件看 e.item、沒有就看 delta 的目標；settle 是 101。
    // 沒有格子的物品（'turn'）不平移、也不算換物品（不空拍）
    const lead = [];
    if (!finale && e.kind !== 'wait' && (!landed || key) && shows(beats)) {
      const item = e.kind === 'settle' ? 'tower' : e.item ?? e.delta?.target, cell = cellOf(item);
      if (cell) {
        if (!montage && lastItem && item !== lastItem) lead.push(B.wait(GAP));
        if (!opensOnFocus(beats[0]) && !sameCell(cell, lastCell)) { lead.push(B.focus(cell)); lastCell = cell; }
        lastItem = item;
      }
      // 劇本自己動了鏡頭（focus 拍）：不知道停在哪，下一個事件一定重新平移
      if (some(beats, b => b.kind === 'focus')) lastCell = null;
    }
    const last = focusesOf([...lead, ...beats]).at(-1);
    if (last) away = last.target !== 'home';
    out.push(mark(e, { gap: estimateTurn(lead.filter(b => b.kind === 'wait'), ctx), key }), ...lead, ...beats, B.apply(e));
    if (landsTyphoon(e)) landed = true;
  });

  // 收尾：劇本手上的人回日常；全島效果照舞台最後的狀態瞄準（演到這拍才讀，跳過時 ctx.instant 讓它貼齊）；
  // 最後回全景（名冊全部恢復日常；玩家拖過鏡頭也照回）
  out.push(B.home(c => scriptMembers(c.roster)), {
    kind: 'world', dur: 0,
    start(c) { c.world(worldEffects(c.stage.lv, c.stage.flags, c.stage.meta), !!c.instant); },
  }, B.focus('home', { final: true, skyline: c => c.stage.headOf('tower').y }));   // 回全景前全景跟 101 頭頂走（§14.4）
  return montage && estimateTurn(out, ctx) > MONTAGE_CAP ? keepOnly(out, b => b.keep || b.kind !== 'walk') : out;
}
