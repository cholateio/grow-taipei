// 下方物品列：每格一個按鈕，顯示圖示、名稱、Lv。已放的變淡停用；演出中全部停用。
// Lv 只在回合結束靜靜寫上（§9）：島上的閃白與 LEVEL UP 已經說了是誰在變，物品列不飛、不跳。
// 最後一格是跳過鍵（修正批次 max-skip §C，使用者 2026-11-01「建議跳過按鈕放到下方物品欄裡面，用 Skip icon」；取代物品列上方的浮動膠囊）：
//   只有 Skip 圖示、aria-label／title「跳過」；一直在、不跳版面——沒有演出時停用，演出中（show.skippable，app.js 每幀 setSkippable）啟用，
//   正好跟物品格相反（演出中物品格停用）。setBusy／reset 不碰它
import { levelLabel } from './format.js';
import { SKIP_ICON } from './icons.js';

export function createSlots(root, { items, onPick, onSkip }) {
  const nav = document.createElement('nav'); nav.className = 'slots'; nav.setAttribute('aria-label', '城市發展物品');
  const max = Object.fromEntries(items.map(it => [it.id, it.max]));
  const buttons = {}, labels = {};
  for (const it of items) {
    const b = document.createElement('button');
    b.className = 'slot'; b.dataset.id = it.id; b.type = 'button'; b.innerHTML = it.icon;
    const name = document.createElement('span'); name.className = 'name'; name.textContent = it.name;
    const lv = document.createElement('em'); lv.className = 'lv';
    b.append(name, lv);
    b.addEventListener('click', () => onPick(it.id));
    buttons[it.id] = b; labels[it.id] = lv; nav.append(b);
  }
  const skip = document.createElement('button');
  skip.className = 'skip'; skip.type = 'button'; skip.innerHTML = SKIP_ICON; skip.setAttribute('aria-label', '跳過'); skip.setAttribute('title', '跳過'); skip.disabled = true;
  skip.addEventListener('click', () => { if (!skip.disabled) onSkip?.(); });
  nav.append(skip);
  root.append(nav);
  const placed = new Set();
  const refresh = busy => { for (const [id, b] of Object.entries(buttons)) b.disabled = busy || placed.has(id); };
  return {
    setLevel(id, lv) { labels[id].textContent = levelLabel(lv, max[id]); buttons[id].classList.toggle('max', lv >= max[id]); },
    setPlaced(id) { placed.add(id); buttons[id].classList.add('placed'); refresh(nav.classList.contains('busy')); },
    setBusy(flag) { nav.classList.toggle('busy', flag); refresh(flag); },
    // 每幀呼叫：只有變了才碰 DOM
    setSkippable(flag) { if (skip.disabled === !!flag) skip.disabled = !flag; },
    reset() {
      placed.clear(); nav.classList.remove('busy');
      for (const [id, b] of Object.entries(buttons)) { b.classList.remove('placed', 'max'); labels[id].textContent = ''; b.disabled = false; }
    },
  };
}
