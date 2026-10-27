// GROW 風格的頭頂泡泡（！ …… ♥ ♪ ？、圖框、倒數字 3／2／1——一個倒數回合一個、跑馬燈文字）與「LEVEL UP」字樣，都是跟著頭走的 CSS2D 標籤。
import { CSS2DObject } from '../../vendor/three/addons/renderers/CSS2DRenderer.js';
import { ICONS, BUBBLE_ICONS } from '../ui/icons.js';

export const BUBBLE_KINDS = ['！', '……', '♥', '♪', '？', '3', '2', '1'];
const BUBBLE_DY = 0.25, LEVELUP_DY = 0.2, LEVELUP_DUR = 1.0;

// 泡泡內容：符號放 span，圖框放 span.icon + SVG，跑馬燈 { text }（最終章 §7 賽博：黑塔螢幕上的「飛天跑車今日抵台…」）放 span.text
// （文字跳脫 HTML；CSS 字級比符號小、可換行成兩行）；不認得的種類直接丟錯（腳本寫錯要馬上看到）
const escape = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function bubbleHtml(kind) {
  if (typeof kind === 'string') {
    if (!BUBBLE_KINDS.includes(kind)) throw new Error(`bubble kind ${kind}`);
    return `<span>${kind}</span>`;
  }
  if (typeof kind === 'object' && kind !== null && 'text' in kind) {
    if (typeof kind.text !== 'string' || !kind.text) throw new Error(`bubble kind ${JSON.stringify(kind)}`);
    return `<span class="text">${escape(kind.text)}</span>`;
  }
  const icon = ICONS[kind?.icon] ?? BUBBLE_ICONS[kind?.icon];
  if (!icon) throw new Error(`bubble kind ${JSON.stringify(kind)}`);
  return `<span class="icon">${icon}</span>`;
}

export function createBubbles(THREE, { group }) {
  const items = [];
  const place = it => { const p = it.head(); it.obj.position.set(p.x, p.y + it.dy, p.z); };
  const drop = it => {
    const i = items.indexOf(it); if (i < 0) return;
    items.splice(i, 1); group.remove(it.obj); it.obj.element.remove(); it.resolve();
  };
  // 外層 div 交給 CSS2DRenderer 用 inline transform 定位，動畫只放在內層 span
  function add(el, head, dur, dy) {
    let resolve; const done = new Promise(r => { resolve = r; });
    const it = { obj: new CSS2DObject(el), head, dur, dy, t: 0, resolve };
    place(it); group.add(it.obj); items.push(it);
    return { done, cancel: () => drop(it) };
  }
  function show(head, kind, dur) {
    const html = bubbleHtml(kind);
    const el = document.createElement('div'); el.className = 'bubble'; el.innerHTML = html;
    return add(el, head, dur, BUBBLE_DY);
  }
  // dur：預設 LEVELUP_DUR；蒙太奇倍速時短一點，上升淡出的動畫一起縮短
  function levelUp(head, { text = 'LEVEL UP', down = false, dur = LEVELUP_DUR } = {}) {
    const el = document.createElement('div'); el.className = 'levelup';
    // 中文標籤（101 階段名）描邊細一點、不斜，否則筆畫糊成一團
    const span = document.createElement('span'); span.className = [down ? 'down' : '', /[^\x00-\x7f]/.test(text) ? 'cjk' : ''].filter(Boolean).join(' '); span.textContent = text;
    if (dur !== LEVELUP_DUR) span.style.animationDuration = `${dur}s`;
    el.append(span);
    return add(el, head, dur, LEVELUP_DY);
  }
  function update(dt) {
    for (const it of [...items]) { it.t += dt; if (it.t >= it.dur) drop(it); else place(it); }
  }
  function clear() { for (const it of [...items]) drop(it); }
  return { show, levelUp, update, clear, get count() { return items.length; } };
}
