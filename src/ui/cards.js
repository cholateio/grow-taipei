// 卡片：怎麼玩、右上角的工具列（啟動失敗的訊息由 main.js 寫在載入畫面上）。跳過鍵在物品列的最後一格（slots.js，修正批次 max-skip §C）。

function card(root, cls, html) {
  root.querySelector(`.card.${cls}`)?.remove();
  const el = document.createElement('div'); el.className = `card ${cls}`; el.setAttribute('role', 'dialog'); el.innerHTML = html;
  root.append(el); return el;
}

export function showHowTo(root, { onClose }) {
  const el = card(root, 'howto', `
    <h2>怎麼玩</h2>
    <ol><li>一次放一個物品</li><li>放的順序會改變結果</li><li>全部 MAX 看真結局</li></ol>
    <button type="button" class="primary">開始</button>`);
  el.querySelector('button').addEventListener('click', () => { el.remove(); onClose?.(); });
  return el;
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
