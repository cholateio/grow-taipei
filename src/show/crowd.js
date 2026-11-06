// 群演小工具（最終章計畫 5 任務 2）：從 chip.js（R48 起是搭鷹架時全島抬頭）與 typhoon.js（一群人同時冒泡泡、躲雨）抽出來共用，
// 隕石警告（finale.js 全島抬頭看天上的光點）與隕石的群演也用。
// 不 import beats.js：拍的工廠 B 由呼叫的劇本傳進來（ctx.B），跟其他劇本一樣。
import { cellAt } from '../scene/hex.js';

// 島民：主島走路格上、露出來、在日常裡（mode 'home'）、不在走回家的路上（arriving）的小人（people walker）。
// 老鼠等模型沒有 walker、坐車頂的是老鼠（rat 的 ride），都不算；衛星島、橋上的人 cellAt 回 null 也不算。
export const islanders = ctx => ctx.roster.keys().flatMap(k => ctx.roster.members(k))
  .filter(m => m.walker && !m.hidden && !m.arriving && m.mode === 'home' && cellAt(m.pos.x, m.pos.z));

// 全島抬頭：最多 max 個島民同時轉頭看 at（gesture 'look'，dur 秒）；演到第一拍才點名（名單記住，release 放同一批人回日常）。
// look 是 max 個拍（名單不夠的那幾拍目標 null、自己跳過），放進 together 一起演；release：看完馬上放回日常（不凍到回合結束）。
// act(kind, dur)／say(text, dur)：同一批人接著做另一個小動作、頭上冒泡泡（隕石警告：抬頭之後喊「！」、蹲下護頭，計畫 13），
// 一樣 max 個拍放進 together（點完名的人已經被 claim 走、不在日常裡，islanders 點不到，所以要用同一份名單）
export function lookUp(B, at, dur, max = 24) {
  let list = null;
  const who = i => c => (list ??= islanders(c))[i] ?? null;
  const act = (kind, d) => Array.from({ length: max }, (_, i) => B.gesture(who(i), kind, d));
  const say = (text, d) => Array.from({ length: max }, (_, i) => B.bubble(who(i), text, d));
  return { look: Array.from({ length: max }, (_, i) => B.gesture(who(i), 'look', dur, { at })), act, say, release: B.home(() => list ?? []) };
}

// 一群人同時演，名單演到才算：together 要在建拍時給齊子拍，這裡在 start 才建（名單空的就跳過）
export function crowd(B, fn) {
  let inner = null;
  return {
    kind: 'crowd',
    dur: c => (inner ? inner.dur(c) : 0),
    start(c) { const beats = fn(c); if (!beats.length) return false; inner = B.together(beats); inner.start(c); },
    step(k, dt, c) { inner.step(k, dt, c); },
    end(c) { inner?.end(c); inner = null; },
  };
}
