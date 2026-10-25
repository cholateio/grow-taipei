// 回合 → 拍：把引擎這回合吐出的事件，一個一個查物品模組的劇本（script），排成一整串拍交給時間軸演。
// 純粹建構拍、不碰 three.js；拍真正演的時候才讀 ctx 裡的舞台、名冊、鏡頭（§6）。
// 劇本查找：placed → 物品的 script.placed；grow → script.grow[to]；fx／after → 「造成它的」模組（e.cause）的 script.fx；
//   stall → script.stall；settle → 101 的 script.settle；劇本回 null／undefined（或沒寫）就走預設劇本（§6.6）。
// 每個事件的劇本前面插一個 0 秒的 mark 拍（呼叫 ctx.onMark），後面補一個 apply(e)：劇本沒套到的零件在這裡白光補上（沒剩就 0 秒）。
// 上一回合被撞歪的零件（stage.tilted）在回合一開頭白光扶正（§8.6「下回合白光扶正」）。
// 蒙太奇（飛彈倒數三回合，§4.4）：開頭 101 頭上 3、2、1，每個劇本只留走路／套用／LEVEL UP／出場／回家，太長連走路也拿掉。
import { foldEvent } from '../rules/engine.js';
import { anchorWorld } from '../actors/anchors.js';
import { worldEffects } from '../actors/world.js';
import { B, together } from './beats.js';
import { FLASH } from './flash.js';

export const MONTAGE_CAP = 20, MONTAGE_KEEP = ['walk', 'apply', 'levelUp', 'spawn', 'home', 'together'];
const COUNTDOWN = ['3', '2', '1'], COUNTDOWN_DUR = 0.6, HINT_DUR = 1.5;

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
  return [B.apply(e, { flash: false })];
}

// 扶正：白光閃在零件上、最亮那一刻轉回來；跳過時 end 直接轉回來
function upright(key) {
  const fix = c => { const o = c.stage.partObject(key); if (o) o.rotation.z = 0; };
  return {
    kind: 'apply', dur: FLASH,
    start(c) {
      c.stage.tilted.delete(key);
      const o = c.stage.partObject(key); if (!o || !o.rotation.z) return false;
      c.flash.at(o.position, { onPeak: () => fix(c) });
    },
    end: fix,
  };
}

// 名冊裡所有被劇本拿去用（mode 'script'）的人：回合收尾讓他們回日常
function scriptMembers(roster) {
  return roster.keys().flatMap(k => roster.members(k)).filter(m => m.mode === 'script');
}

export function buildTurn(events, { modules, spec, lv, flags, meta, montage = false }, ctx) {
  const mod = id => modules.find(m => m.id === id);
  ctx.montage = montage;
  const lastWait = events.map(e => e.kind).lastIndexOf('wait');
  let view = { lv, flags }, settled = meta?.total ?? sum(lv);
  const out = [...(ctx.stage?.tilted ?? [])].map(upright);
  if (montage) out.push(...COUNTDOWN.map(n => B.bubble('tower', n, COUNTDOWN_DUR)));

  events.forEach((e, i) => {
    const prev = view; view = foldEvent(view, e);
    const total = sum(view.lv);
    // settle 的 prevTotal 是上次結算的總等級（101 看的是結算值，不是事件中途的總和）
    const s = { lv: view.lv, flags: view.flags, prev, total, prevTotal: e.kind === 'settle' ? settled : sum(prev.lv) };
    if (e.kind === 'settle') settled = total;
    Object.assign(ctx, { lv: s.lv, flags: s.flags, prev, event: e });

    let beats;
    if (e.kind === 'wait') {
      // 等待圖框（§6.5）：一回合只演最後一個 wait；代表角色先問模組，沒有就找離物品最近的島民
      beats = [B.apply(e, { flash: false })];
      if (i === lastWait && e.waits?.length) {
        const w = e.waits[0], rep = c => mod(w.item)?.script?.rep?.(s, c) ?? c.roster.nearest('landmarks.islanders', anchorWorld(w.item));
        beats.push(B.bubble(rep, { icon: w.for[0] }, HINT_DUR));
      }
    } else {
      const sc = e.kind === 'fx' || e.kind === 'after' ? mod(e.cause)?.script : mod(e.kind === 'settle' ? 'tower' : e.item)?.script;
      const fn = { placed: sc?.placed, grow: sc?.grow?.[e.to], fx: sc?.fx, after: sc?.fx, stall: sc?.stall, settle: sc?.settle }[e.kind];
      beats = fn?.(e, s, ctx) ?? (e.kind === 'settle' ? [B.apply(e)] : defaults(e));
    }
    if (montage) beats = keepOnly(beats, b => MONTAGE_KEEP.includes(b.kind));
    // mark：0 秒拍，演到這裡告訴 ctx.onMark「這個事件開始了」（pace 工具用 elapsed 差值量每個事件的秒數）
    out.push({ kind: 'mark', dur: 0, start: c => { c.onMark?.(e); } }, ...beats, B.apply(e));
  });

  // 收尾：劇本手上的人回日常；全島效果照舞台最後的狀態瞄準（演到這拍才讀，跳過時 ctx.instant 讓它貼齊）
  out.push(B.home(c => scriptMembers(c.roster)), {
    kind: 'world', dur: 0,
    start(c) { c.world(worldEffects(c.stage.lv, c.stage.flags, c.stage.meta), !!c.instant); },
  });
  return montage && estimateTurn(out, ctx) > MONTAGE_CAP ? keepOnly(out, b => b.kind !== 'walk') : out;
}
