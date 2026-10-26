// 回合 → 拍：把引擎這回合吐出的事件，一個一個查物品模組的劇本（script），排成一整串拍交給時間軸演。
// 純粹建構拍、不碰 three.js；拍真正演的時候才讀 ctx 裡的舞台、名冊、鏡頭（§6）。
// 劇本查找：placed → 物品的 script.placed；grow → script.grow[to]；fx／after → 「造成它的」模組（e.cause）的 script.fx；
//   stall → script.stall；settle → 101 的 script.settle；劇本回 null／undefined（或沒寫）就走預設劇本（§6.6）。
// 每個事件的劇本前面插一個 0 秒的 mark 拍（呼叫 ctx.onMark），後面補一個 apply(e)：劇本沒套到的零件在這裡閃白補上（沒剩就 0 秒）。
// 上一回合被撞歪的零件（stage.tilted）在回合一開頭閃白扶正（§8.6「下回合白光扶正」，§13.2 改成零件自己閃白）。
// 鏡頭跟主線（§13.1）：有東西演的事件，劇本前面先 focus 到事件的格子（同一格連續不重複），不同物品之間先空 GAP 秒；
//   劇本第一拍自己就是 focus 的不補（101 大升級自己先 focus 101、中途回全景）；回合最後 focus('home', { final: true }) 回全景
//   （拖過也照回；先照舞台上 101 的頭頂更新天際線，§14.4）、名冊全部恢復日常。
// 蒙太奇（飛彈倒數三回合，§4.4）：開頭 101 頭上 3、2、1，每個劇本只留走路／套用／LEVEL UP／出場／回家／鏡頭，太長連走路也拿掉。
// 跳級（物品 v2 §3、§6）：同一物品連兩個 grow、第二個 jump: true——第二個只演 [apply, LEVEL UP]：不平移、不空拍、不查劇本，
//   兩個 LEVEL UP 連著出（跳過時兩級的 apply 都照樣套上）。
// 過渡期（計畫 4 任務 2）：超過舊 max 的級數（actors/clamp.js 的 OLD_MAX）不查模組劇本，走預設。
import { foldEvent } from '../rules/engine.js';
import { anchorWorld, cellOf } from '../actors/anchors.js';
import { worldEffects } from '../actors/world.js';
import { scripted } from '../actors/clamp.js';
import { B, together } from './beats.js';
import { BLINK } from './blink.js';

export const MONTAGE_CAP = 20, MONTAGE_KEEP = ['walk', 'apply', 'levelUp', 'spawn', 'home', 'together', 'focus'];
export const GAP = 0.6;   // 不同物品的事件之間空幾秒（§13.1）
const COUNTDOWN = ['3', '2', '1'], COUNTDOWN_DUR = 0.6, HINT_DUR = 1.2;

const sum = lv => Object.values(lv).reduce((a, b) => a + b, 0);

// 預估一串拍的秒數：有 estimate 用 estimate；數字 dur 直接加；函數 dur（start 之後才知道）算 0；together 取最長的子拍
export function estimateTurn(beats, ctx) {
  const one = b => {
    if (b.kind === 'together' && b.beats) return Math.max(0, ...b.beats.map(one));
    if (b.estimate) return b.estimate(ctx);
    return typeof b.dur === 'number' && b.dur > 0 ? b.dur : 0;
  };
  return beats.reduce((t, b) => t + one(b), 0);
}

// 有沒有一拍（together 裡也算）符合 f
const some = (beats, f) => beats.some(b => f(b) || (b.kind === 'together' && b.beats && some(b.beats, f)));
// 有東西演：除了不閃白的套用（瞬間換上、沒有畫面）以外還有別的拍
const shows = beats => some(beats, b => b.kind !== 'together' && !(b.kind === 'apply' && b.blink === false));
const sameCell = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];

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

// mark：0 秒拍，演到這裡告訴 ctx.onMark「這個事件開始了」（pace 工具用 elapsed 差值量每個事件的秒數，包含平移與空拍）
const mark = e => ({ kind: 'mark', dur: 0, start: c => { c.onMark?.(e); } });

// 名冊裡所有被劇本拿去用（mode 'script'）的人：回合收尾讓他們回日常
function scriptMembers(roster) {
  return roster.keys().flatMap(k => roster.members(k)).filter(m => m.mode === 'script');
}

export function buildTurn(events, { modules, spec, lv, flags, meta, montage = false }, ctx) {
  const mod = id => modules.find(m => m.id === id);
  ctx.montage = montage;
  const lastWait = events.map(e => e.kind).lastIndexOf('wait');
  let view = { lv, flags }, settled = meta?.total ?? sum(lv);
  let lastItem = null, lastCell = null;   // 上一個有東西演的事件的物品、鏡頭現在對著的格子（null = 不知道）
  const out = [...(ctx.stage?.tilted ?? [])].map(upright);
  if (montage) out.push(...COUNTDOWN.map(n => B.bubble('tower', n, COUNTDOWN_DUR)));

  events.forEach((e, i) => {
    const prev = view; view = foldEvent(view, e);
    const total = sum(view.lv);
    // settle 的 prevTotal 是上次結算的總等級（101 看的是結算值，不是事件中途的總和）
    const s = { lv: view.lv, flags: view.flags, prev, total, prevTotal: e.kind === 'settle' ? settled : sum(prev.lv) };
    if (e.kind === 'settle') settled = total;
    Object.assign(ctx, { lv: s.lv, flags: s.flags, prev, event: e });

    // 跳級的第二級：緊接在同物品上一級的 grow 後面（中間被別的事件隔開就照一般事件演）
    const jumped = e.kind === 'grow' && e.jump && events[i - 1]?.kind === 'grow' && events[i - 1].item === e.item && events[i - 1].to === e.from;
    let beats;
    if (jumped) {
      out.push(mark(e), B.apply(e), B.levelUp(e.item), B.apply(e));
      return;
    }
    if (e.kind === 'wait') {
      // 等待圖框（§6.5）：一回合只演最後一個 wait；代表角色先問模組，沒有就找離物品最近、看得到的島民
      beats = [B.apply(e, { blink: false })];
      if (i === lastWait && e.waits?.length) {
        // 藏起來的人（颱風登陸躲進門裡）不算；外面一個人都沒有就掛在物品（建築）頭上
        const w = e.waits[0], rep = c => mod(w.item)?.script?.rep?.(s, c) ?? c.roster.nearest('landmarks.islanders', anchorWorld(w.item), { visible: true }) ?? w.item;
        beats.push(B.bubble(rep, { icon: w.for[0] }, HINT_DUR));
      }
    } else {
      const sc = e.kind === 'fx' || e.kind === 'after' ? mod(e.cause)?.script : mod(e.kind === 'settle' ? 'tower' : e.item)?.script;
      const fn = { placed: sc?.placed, grow: scripted(e.item, e.to) ? sc?.grow?.[e.to] : undefined, fx: sc?.fx, after: sc?.fx, stall: sc?.stall, settle: sc?.settle }[e.kind];
      beats = fn?.(e, s, ctx) ?? (e.kind === 'settle' ? [B.apply(e)] : defaults(e));
    }
    if (montage) beats = keepOnly(beats, b => MONTAGE_KEEP.includes(b.kind));
    // 鏡頭：等待事件不平移；fx 事件看 e.item、沒有就看 delta 的目標；settle 是 101。
    // 沒有格子的物品（'turn'）不平移、也不算換物品（不空拍）
    const lead = [];
    if (e.kind !== 'wait' && shows(beats)) {
      const item = e.kind === 'settle' ? 'tower' : e.item ?? e.delta?.target, cell = cellOf(item);
      if (cell) {
        if (!montage && lastItem && item !== lastItem) lead.push(B.wait(GAP));
        if (beats[0]?.kind !== 'focus' && !sameCell(cell, lastCell)) { lead.push(B.focus(cell)); lastCell = cell; }
        lastItem = item;
      }
      // 劇本自己動了鏡頭（focus 拍）：不知道停在哪，下一個事件一定重新平移
      if (some(beats, b => b.kind === 'focus')) lastCell = null;
    }
    out.push(mark(e), ...lead, ...beats, B.apply(e));
  });

  // 收尾：劇本手上的人回日常；全島效果照舞台最後的狀態瞄準（演到這拍才讀，跳過時 ctx.instant 讓它貼齊）；
  // 最後回全景（名冊全部恢復日常；玩家拖過鏡頭也照回）
  out.push(B.home(c => scriptMembers(c.roster)), {
    kind: 'world', dur: 0,
    start(c) { c.world(worldEffects(c.stage.lv, c.stage.flags, c.stage.meta), !!c.instant); },
  }, B.focus('home', { final: true, skyline: c => c.stage.headOf('tower').y }));   // 回全景前全景跟 101 頭頂走（§14.4）
  return montage && estimateTurn(out, ctx) > MONTAGE_CAP ? keepOnly(out, b => b.kind !== 'walk') : out;
}
