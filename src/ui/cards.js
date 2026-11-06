// 卡片：怎麼玩、右上角的工具列（啟動失敗的訊息由 main.js 寫在載入畫面上）。跳過鍵在物品列的最後一格（slots.js，修正批次 max-skip §C）。

import { ENDING_ICONS, UNKNOWN_ICON } from './icons.js';

function card(root, cls, html) {
  root.querySelector(`.card.${cls}`)?.remove();
  const el = document.createElement('div'); el.className = `card ${cls}`; el.setAttribute('role', 'dialog'); el.innerHTML = html;
  root.append(el); return el;
}

// endings／seen：R45 結局圖鑑（使用者 2026-11-06）——endings 是 ENDINGS 表、seen 是看過的結局 id；沒給 endings 就不畫圖鑑
export function showHowTo(root, { onClose, endings, seen = [] }) {
  const el = card(root, 'howto', `
    <h2>怎麼玩</h2>
    <ol><li>一次放一個物品</li><li>放的順序會改變結果</li><li>全部 MAX 看真結局</li></ol>`);
  if (endings) el.append(gallery(endings, seen));
  const start = document.createElement('button'); start.type = 'button'; start.className = 'primary'; start.textContent = '開始';
  start.addEventListener('click', () => { el.remove(); onClose?.(); });
  el.append(start);
  return el;
}

// 結局圖鑑：一條細線下面 4 欄的結局磚，右上角「看過數 / 總數」。順序：賽博（真結局，黃框 .true）第一、其餘照 ENDINGS、再接再厲最後。
// 看過 → 圖示＋名稱；沒看過 → 灰磚問號、沒有名稱（.unknown）。seen 裡不在表上的 id 不算。畫面上的新文字只有數字和看過的結局名稱
function gallery(endings, seen) {
  const ids = Object.keys(endings), order = [...ids.filter(id => id === 'cyber'), ...ids.filter(id => id !== 'cyber' && id !== 'tryAgain'), ...ids.filter(id => id === 'tryAgain')];
  const known = new Set(seen.filter(id => id in endings));
  const box = document.createElement('div'); box.className = 'endings';
  const count = document.createElement('p'); count.className = 'eyebrow';
  const span = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; return s; };
  count.append(span('seen', String(known.size)), span('slash', ' / '), span('total', String(ids.length)));
  const grid = document.createElement('div'); grid.className = 'grid';
  for (const id of order) {
    const lit = known.has(id), tile = document.createElement('div');
    tile.className = ['ending', lit ? '' : 'unknown', id === 'cyber' ? 'true' : ''].filter(Boolean).join(' '); tile.dataset.id = id;
    const icon = span('icon', ''); icon.innerHTML = lit ? ENDING_ICONS[id] : UNKNOWN_ICON;
    tile.append(icon, span('title', lit ? endings[id].title : ''));
    grid.append(tile);
  }
  box.append(count, grid);
  return box;
}

// 頂欄工具：怎麼玩、RESET（遊戲結束後醒目，setFinished）
export function createTopBar(root, { onReset, onHowTo }) {
  const el = document.createElement('div'); el.className = 'topbar';
  el.innerHTML = `<div class="brand"><b>GROW<br>TAIPEI</b><span>台北成長</span></div>
    <div class="tools"><button type="button" data-act="howto" aria-label="怎麼玩">?</button><button type="button" data-act="reset">RESET</button></div>`;
  const reset = el.querySelector('[data-act=reset]');
  reset.addEventListener('click', () => onReset?.());
  el.querySelector('[data-act=howto]').addEventListener('click', () => onHowTo?.());
  root.append(el);
  return {
    el,
    // 遊戲結束：RESET 變醒目（純樣式、沒有文字）——玩家看物品列自己發現沒全 MAX，直接再玩；RESET 之後拿掉
    setFinished(flag) { reset.classList.toggle('glow', !!flag); },
  };
}
