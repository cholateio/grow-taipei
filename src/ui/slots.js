// 下方物品列：每格一個按鈕，顯示圖示、名稱、Lv。已放的變淡停用；演出中全部停用。
import { levelLabel } from './format.js';

export function createSlots(root, { items, onPick }) {
  const nav = document.createElement('nav'); nav.className = 'slots'; nav.setAttribute('aria-label', '城市發展物品');
  const max = Object.fromEntries(items.map(it => [it.id, it.max])), buttons = {};
  for (const it of items) {
    const b = document.createElement('button');
    b.className = 'slot'; b.dataset.id = it.id; b.type = 'button';
    b.innerHTML = `${it.icon}<span class="name">${it.name}</span><em class="lv"></em>`;
    b.addEventListener('click', () => onPick(it.id));
    buttons[it.id] = b; nav.append(b);
  }
  root.append(nav);
  const placed = new Set();
  const refresh = busy => { for (const [id, b] of Object.entries(buttons)) b.disabled = busy || placed.has(id); };
  return {
    setLevel(id, lv) { const em = buttons[id].querySelector('.lv'); em.textContent = levelLabel(lv, max[id]); buttons[id].classList.toggle('max', lv >= max[id]); },
    setPlaced(id) { placed.add(id); buttons[id].classList.add('placed'); refresh(nav.classList.contains('busy')); },
    setBusy(flag) { nav.classList.toggle('busy', flag); refresh(flag); },
    reset() { placed.clear(); nav.classList.remove('busy'); for (const [id, b] of Object.entries(buttons)) { b.classList.remove('placed', 'max'); b.querySelector('.lv').textContent = ''; b.disabled = false; } },
  };
}
