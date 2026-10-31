// 卡片：怎麼玩，以及右上角的工具列（啟動失敗的訊息由 main.js 寫在載入畫面上）。

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

// 頂欄工具：跳過（只在演出能跳過時顯示，app.js 每幀 setSkippable）、怎麼玩、RESET
export function createTopBar(root, { onReset, onHowTo, onSkip }) {
  const el = document.createElement('div'); el.className = 'topbar';
  el.innerHTML = `<div class="brand"><b>GROW<br>TAIPEI</b><span>台北成長</span></div>
    <div class="tools"><button type="button" data-act="skip" hidden>跳過</button><button type="button" data-act="howto" aria-label="怎麼玩">?</button><button type="button" data-act="reset">RESET</button></div>`;
  const skip = el.querySelector('[data-act=skip]');
  skip.addEventListener('click', () => onSkip?.());
  el.querySelector('[data-act=reset]').addEventListener('click', () => onReset?.());
  el.querySelector('[data-act=howto]').addEventListener('click', () => onHowTo?.());
  root.append(el);
  return {
    el,
    // 每幀呼叫：只有變了才碰 DOM；顯示與隱藏不做動畫
    setSkippable(flag) { if (skip.hidden === !!flag) skip.hidden = !flag; },
  };
}
