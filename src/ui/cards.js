// 卡片：怎麼玩、結局、錯誤，以及右上角的工具列。
import { levelLabel } from './format.js';

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

export function showEndCard(root, { title, line, levels, onRestart }) {
  const el = card(root, 'end', `
    <p class="eyebrow">THE END</p>
    <h2>${title}</h2>
    <p class="line">${line}</p>
    <ul class="levels">${levels.map(l => `<li class="${l.lv >= l.max ? 'max' : ''}"><span>${l.name}</span><b>${levelLabel(l.lv, l.max)}</b></li>`).join('')}</ul>
    <button type="button" class="primary">再玩一次</button>`);
  el.querySelector('button').addEventListener('click', () => { el.remove(); onRestart?.(); });
  return el;
}

export function showError(root, message) { return card(root, 'error', `<h2>無法啟動 3D 畫面</h2><p>${message}</p>`); }

export function createTopBar(root, { onReset, onHowTo }) {
  const el = document.createElement('div'); el.className = 'topbar';
  el.innerHTML = `<div class="brand"><b>GROW<br>TAIPEI</b><span>台北成長</span></div>
    <div class="tools"><button type="button" data-act="howto" aria-label="怎麼玩">?</button><button type="button" data-act="reset">RESET</button></div>`;
  el.querySelector('[data-act=reset]').addEventListener('click', () => onReset?.());
  el.querySelector('[data-act=howto]').addEventListener('click', () => onHowTo?.());
  root.append(el); return { el };
}
