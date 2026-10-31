// 卡片：怎麼玩、右上角的工具列、物品列上方的跳過鍵（啟動失敗的訊息由 main.js 寫在載入畫面上）。

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

// 跳過鍵：物品列正上方置中的浮動膠囊（修正輪 1：放頂欄時 360 寬手機一出現就擠破、每回合抖一下；
// 放這裡拇指搆得到、演出時物品列本來就 busy、所有寬度一樣）。只在演出能跳過時顯示（app.js 每幀 setSkippable）
export function createSkipButton(root, { onSkip }) {
  const el = document.createElement('button');
  el.type = 'button'; el.className = 'skip'; el.textContent = '跳過'; el.hidden = true;
  el.addEventListener('click', () => onSkip?.());
  root.append(el);
  return {
    el,
    // 每幀呼叫：只有變了才碰 DOM；顯示與隱藏不做動畫
    setSkippable(flag) { if (el.hidden === !!flag) el.hidden = !flag; },
  };
}
