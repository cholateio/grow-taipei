// 下方物品列：每格一個按鈕，顯示圖示、名稱、Lv。已放的變淡停用；演出中全部停用。
// Lv 只在回合結束靜靜寫上（§9）：島上的閃白與 LEVEL UP 已經說了是誰在變，物品列不飛、不跳。
// 最後一格是跳過鍵（修正批次 max-skip §C，使用者 2026-11-01「建議跳過按鈕放到下方物品欄裡面，用 Skip icon」；取代物品列上方的浮動膠囊）：
//   只有 Skip 圖示、aria-label／title「跳過」；一直在、不跳版面——沒有演出時停用，演出中（show.skippable，app.js 每幀 setSkippable）啟用，
//   正好跟物品格相反（演出中物品格停用）。setBusy／reset 不碰它
import { levelLabel } from './format.js';
import { SKIP_ICON, HIDE_ICON } from './icons.js';

export function createSlots(root, { items, onPick, onSkip }) {
  const nav = document.createElement('nav'); nav.className = 'slots'; nav.setAttribute('aria-label', '城市發展物品');
  const max = Object.fromEntries(items.map(it => [it.id, it.max]));
  const buttons = {}, labels = {}, badges = {};
  for (const it of items) {
    const b = document.createElement('button');
    b.className = 'slot'; b.dataset.id = it.id; b.type = 'button'; b.innerHTML = it.icon;
    const name = document.createElement('span'); name.className = 'name'; name.textContent = it.name;
    const lv = document.createElement('em'); lv.className = 'lv';
    // 使用者 2026-11-06：左上角小圓牌記這局第幾個放的（1–8），空的不顯示
    const n = document.createElement('i'); n.className = 'n';
    b.append(name, lv, n);
    b.addEventListener('click', () => onPick(it.id));
    buttons[it.id] = b; labels[it.id] = lv; badges[it.id] = n; nav.append(b);
  }
  const skip = document.createElement('button');
  skip.className = 'skip'; skip.type = 'button'; skip.innerHTML = SKIP_ICON; skip.setAttribute('aria-label', '跳過'); skip.setAttribute('title', '跳過'); skip.disabled = true;
  // 使用者 2026-11-06：遊戲結束後物品列用不到，跳過鍵變「隱藏選單」，收起後邊緣一顆圓鍵叫回來
  let mode = 'skip';
  const tab = document.createElement('button');
  tab.className = 'menu-tab'; tab.type = 'button'; tab.innerHTML = HIDE_ICON; tab.setAttribute('aria-label', '顯示選單'); tab.setAttribute('title', '顯示選單');
  // 使用者 2026-11-06（R46）：滑動只在收合／展開那一下；平常（旋轉、剛載入）不帶 transition，免得從錯的位置滑一下
  let slideTimer = null;
  const endSlide = () => { clearTimeout(slideTimer); slideTimer = null; nav.classList.remove('sliding'); };
  const slide = () => { clearTimeout(slideTimer); nav.classList.add('sliding'); slideTimer = setTimeout(endSlide, 350); };
  nav.addEventListener('transitionend', e => { if (!e || e.target === nav) endSlide(); });
  const expand = () => { if (nav.classList.contains('collapsed')) slide(); nav.classList.remove('collapsed'); nav.inert = false; tab.classList.remove('on'); };
  // 收起時 inert：Tab 鍵不會跑到看不見的按鈕；焦點跟著移到圓鍵、展開後回到隱藏鍵（a11y）
  const collapse = () => { slide(); nav.classList.add('collapsed'); nav.inert = true; tab.classList.add('on'); tab.focus?.(); };
  skip.addEventListener('click', () => {
    if (mode === 'hide') { collapse(); return; }
    if (!skip.disabled) onSkip?.();
  });
  tab.addEventListener('click', () => { expand(); skip.focus?.(); });
  nav.append(skip);
  root.append(nav, tab);
  const setSkipLook = () => {
    const hide = mode === 'hide';
    skip.innerHTML = hide ? HIDE_ICON : SKIP_ICON;
    const label = hide ? '隱藏選單' : '跳過';
    skip.setAttribute('aria-label', label); skip.setAttribute('title', label);
    skip.disabled = !hide; skip.classList.toggle('hide', hide);
  };
  const placed = new Set();
  const refresh = busy => { for (const [id, b] of Object.entries(buttons)) b.disabled = busy || placed.has(id); };
  return {
    setLevel(id, lv) { labels[id].textContent = levelLabel(lv, max[id]); buttons[id].classList.toggle('max', lv >= max[id]); },
    setPlaced(id) { if (!placed.has(id)) badges[id].textContent = String(placed.size + 1); placed.add(id); buttons[id].classList.add('placed'); refresh(nav.classList.contains('busy')); },
    setBusy(flag) { nav.classList.toggle('busy', flag); refresh(flag); },
    // 每幀呼叫：只有變了才碰 DOM
    setMode(m) { m = m === 'hide' ? 'hide' : 'skip'; if (m === mode) return; mode = m; expand(); setSkipLook(); },
    setSkippable(flag) { if (mode === 'hide') return; if (skip.disabled === !!flag) skip.disabled = !flag; },
    reset() {
      placed.clear(); nav.classList.remove('busy'); expand(); if (mode !== 'skip') { mode = 'skip'; setSkipLook(); }
      for (const [id, b] of Object.entries(buttons)) { b.classList.remove('placed', 'max'); labels[id].textContent = ''; badges[id].textContent = ''; b.disabled = false; }
    },
  };
}
