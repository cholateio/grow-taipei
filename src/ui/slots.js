// 下方物品列：每格一個按鈕，顯示圖示、名稱、Lv。已放的變淡停用；演出中全部停用。
// 計畫 3.6：放置時圖示從格子飛到島上（§4.1）；等級一變那格就跳一下，玩家知道島上哪個變化是誰的。
import { levelLabel } from './format.js';

const FLY_MS = 450;

export function createSlots(root, { items, onPick }) {
  const nav = document.createElement('nav'); nav.className = 'slots'; nav.setAttribute('aria-label', '城市發展物品');
  const max = Object.fromEntries(items.map(it => [it.id, it.max])), icons = Object.fromEntries(items.map(it => [it.id, it.icon]));
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
  root.append(nav);
  const placed = new Set(), flying = new Map();   // 飛行中的圖示 → 它的動畫
  const refresh = busy => { for (const [id, b] of Object.entries(buttons)) b.disabled = busy || placed.has(id); };
  return {
    setLevel(id, lv) {
      const b = buttons[id], text = levelLabel(lv, max[id]);
      if (labels[id].textContent !== text) { b.classList.remove('bump'); void b.offsetWidth; if (lv > 0) b.classList.add('bump'); }   // offsetWidth：重播動畫
      labels[id].textContent = text; b.classList.toggle('max', lv >= max[id]);
    },
    setPlaced(id) { placed.add(id); buttons[id].classList.add('placed'); refresh(nav.classList.contains('busy')); },
    setBusy(flag) { nav.classList.toggle('busy', flag); refresh(flag); },
    // 圖示沿弧線從格子飛到 to（螢幕座標）；沒有目標（在畫面外）或瀏覽器不支援動畫就直接結束
    fly(id, to) {
      const from = buttons[id].getBoundingClientRect?.(), el = document.createElement('div');
      if (!to || !from || typeof el.animate !== 'function') return Promise.resolve();
      el.className = 'fly'; el.innerHTML = icons[id];
      const x0 = from.left + from.width / 2, y0 = from.top + from.height / 2, dx = to.x - x0, dy = to.y - y0;
      Object.assign(el.style, { left: `${x0}px`, top: `${y0}px` });
      document.body.append(el);
      const at = (k, lift, s) => `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k - lift}px)) scale(${s})`;
      const anim = el.animate([{ transform: at(0, 0, 1) }, { transform: at(0.5, 70, 1.25), offset: 0.45 }, { transform: at(1, 0, 0.55), opacity: 0.85 }],
        { duration: FLY_MS, easing: 'cubic-bezier(.35,.6,.45,1)' });
      flying.set(el, anim);
      const done = () => { el.remove(); flying.delete(el); };
      return anim.finished.then(done, done);
    },
    // 跳過／RESET：飛行中的圖示立刻落地，演出不被它卡住
    land() { for (const anim of [...flying.values()]) anim.finish(); },
    reset() {
      this.land();
      placed.clear(); nav.classList.remove('busy');
      for (const [id, b] of Object.entries(buttons)) { b.classList.remove('placed', 'max', 'bump'); labels[id].textContent = ''; b.disabled = false; }
    },
  };
}
