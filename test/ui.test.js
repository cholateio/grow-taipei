import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICONS, BUBBLE_ICONS } from '../src/ui/icons.js';
import { levelLabel, storageGet, storageSet } from '../src/ui/format.js';
test('eight inline SVG icons with the shared viewBox and ink stroke', () => {
  assert.deepEqual(Object.keys(ICONS).sort(), ['baseball','boba','bulb','chip','milk','rat','token','typhoon']);
  for (const s of Object.values(ICONS)) { assert.match(s, /^<svg/); assert.match(s, /viewBox="0 0 64 64"/); assert.match(s, /#211d1d/); }
});
test('levelLabel', () => { assert.equal(levelLabel(0, 4), ''); assert.equal(levelLabel(2, 4), 'Lv.2'); assert.equal(levelLabel(4, 4), 'Lv.MAX'); });
test('storage helpers never throw', () => {
  const broken = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  assert.equal(storageGet('k', broken), null); assert.equal(storageSet('k', '1', broken), false);
  const mem = new Map(); const ok = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(storageSet('k', 'v', ok), true); assert.equal(storageGet('k', ok), 'v');
});
import { installFakeDom } from './helpers/fakedom.js';
// 結局卡 2026-11-01 拿掉了（使用者：直接用畫面呈現就好，不用文字描述）：cards.js 只剩怎麼玩與頂欄；重玩按頂欄 RESET
test('there is no end card any more: cards.js exports only the how-to card, the top bar and the skip button', async () => {
  installFakeDom(); const cards = await import('../src/ui/cards.js');
  assert.deepEqual(Object.keys(cards).sort(), ['createSkipButton', 'createTopBar', 'showHowTo']);
});

// 物品列只在回合結束靜靜寫 Lv.n（§9）：沒有飛入、跳動
const slotItems = () => Object.entries(ICONS).map(([id, icon]) => ({ id, name: id, icon, max: 4 }));
test('setLevel writes the label and max class without any animation class', async () => {
  installFakeDom(); const { createSlots } = await import('../src/ui/slots.js');
  const root = document.createElement('div'), slots = createSlots(root, { items: slotItems(), onPick() {} });
  const btn = root.querySelector('.slots').children.find(b => b.dataset.id === 'milk');
  slots.setLevel('milk', 1); assert.equal(btn.querySelector('.lv').textContent, 'Lv.1'); assert.equal(btn.className, 'slot');
  slots.setLevel('milk', 4); assert.equal(btn.querySelector('.lv').textContent, 'Lv.MAX'); assert.equal(btn.className, 'slot max');
  slots.setLevel('milk', 3); assert.equal(btn.className, 'slot');
  assert.equal(slots.fly, undefined); assert.equal(slots.land, undefined);
  slots.setPlaced('milk'); slots.setLevel('milk', 4); slots.reset();
  assert.equal(btn.className, 'slot'); assert.equal(btn.querySelector('.lv').textContent, ''); assert.equal(btn.disabled, false);
});

// 泡泡圖框用的六個圖示：和物品圖示同一套 64 viewBox 白底墨線
test('six bubble icons in the same SVG style', () => {
  assert.deepEqual(Object.keys(BUBBLE_ICONS).sort(), ['dome','islet','lamp','mortar','school','train']);
  for (const s of Object.values(BUBBLE_ICONS)) { assert.match(s, /^<svg/); assert.match(s, /viewBox="0 0 64 64"/); }
});

// 頂欄（計畫 12）：怎麼玩、RESET；跳過鍵修正輪 1 移出頂欄（360 寬手機一出現就擠破、每回合抖一下）
const topBar = async (opts = {}) => {
  installFakeDom(); const { createTopBar } = await import('../src/ui/cards.js');
  const root = document.createElement('div'), calls = [];
  const bar = createTopBar(root, { onReset: () => calls.push('reset'), onHowTo: () => calls.push('howto'), ...opts });
  return { root, bar, calls, btn: act => root.querySelector(`[data-act=${act}]`) };
};
test('the top bar holds only the how-to and RESET buttons (no skip button in it)', async () => {
  const { bar, calls, btn } = await topBar();
  assert.equal(btn('skip'), null);
  assert.deepEqual(btn('reset').parent.children.map(b => b.dataset.act), ['howto', 'reset']);
  assert.equal(bar.setSkippable, undefined);
  btn('reset').listeners.click(); btn('howto').listeners.click(); assert.deepEqual(calls, ['reset', 'howto']);
});
// 跳過鍵（修正輪 1）：物品列正上方置中的浮動膠囊，所有寬度一樣；預設藏著，setSkippable 顯示／隱藏、連續同值不寫 DOM，按下呼叫 onSkip
test('the skip button is its own floating pill: hidden by default, setSkippable toggles it without rewriting the same value, a press calls onSkip', async () => {
  installFakeDom(); const { createSkipButton, createTopBar } = await import('../src/ui/cards.js');
  const root = document.createElement('div'), calls = [];
  createTopBar(root, {});
  const skip = createSkipButton(root, { onSkip: () => calls.push('skip') }), el = skip.el;
  assert.equal(el.tagName, 'button'); assert.equal(el.className, 'skip'); assert.equal(el.textContent, '跳過');
  assert.equal(el.parent, root, 'directly under the UI root, not inside the top bar');
  assert.equal(el.hidden, true, 'hidden by default');
  const writes = () => el.hiddenWrites ?? 0, w0 = writes();
  skip.setSkippable(false); skip.setSkippable(false); assert.equal(writes(), w0, 'same value: no DOM write');
  skip.setSkippable(true); skip.setSkippable(true); skip.setSkippable(true);
  assert.equal(el.hidden, false); assert.equal(writes(), w0 + 1, 'shown once');
  el.listeners.click(); assert.deepEqual(calls, ['skip']);
  skip.setSkippable(false); assert.equal(el.hidden, true); assert.equal(writes(), w0 + 2);
});
// 樣式：fixed、置中、底邊在物品列上方 8 px（--slots-h：桌機一排、手機兩排），高 44；hover 樣式只給滑鼠（觸控點過不黏黃底）
const cssText = async () => (await import('node:fs')).readFileSync('src/ui/ui.css', 'utf8');
const ruleOf = (css, sel) => new RegExp(`(^|\\n)${sel.replace(/[.[\]()]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[2] ?? '';
test('ui.css: the skip pill floats centred 8 px above the item bar on every width', async () => {
  const css = await cssText(), rule = ruleOf(css, '.skip');
  assert.match(rule, /position:\s*fixed/); assert.match(rule, /left:\s*50%/); assert.match(rule, /transform:\s*translateX\(-50%\)/);
  assert.match(rule, /bottom:\s*calc\(max\(14px, env\(safe-area-inset-bottom\)\) \+ var\(--slots-h\) \+ 8px\)/);
  assert.match(rule, /min-height:\s*44px/);
  assert.match(ruleOf(css, '.skip[hidden]'), /display:\s*none/);
  // 物品列高度：一排 10 + 72 + 16 = 98；兩排（≤ 640）10 + 72 + 8 + 72 + 16 = 178
  assert.match(/:root\s*\{([^}]*)\}/.exec(css)[1], /--slots-h:\s*98px/);
  assert.match(/@media \(max-width: 640px\)\s*\{([\s\S]*?)\n\}/.exec(css)[1], /--slots-h:\s*178px/);
  assert.doesNotMatch(css, /\.tools button\[data-act=skip\]|\.tools button\[hidden\]/);
});
test('ui.css: every :hover rule sits inside @media (hover: hover)', async () => {
  let css = await cssText();
  // 拿掉 @media (hover: hover) { … }（數括號）
  for (let i; (i = css.indexOf('@media (hover: hover)')) >= 0;) {
    let j = css.indexOf('{', i) + 1, depth = 1;
    while (depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    css = css.slice(0, i) + css.slice(j);
  }
  assert.doesNotMatch(css, /:hover/);
});
// npm run shot：360 寬的手機也拍（phone360 → 360×780，走手機預算）
test('npm run shot includes phone360-live and phone360-end at 360×780', async () => {
  const { readFileSync } = await import('node:fs');
  const shot = JSON.parse(readFileSync('package.json', 'utf8')).scripts.shot;
  assert.match(shot, /'phone360-live=auto=milk,baseball,token,bulb,chip,typhoon,boba,rat&live=1&warp=3&quality=low'/);
  assert.match(shot, /phone360-end=auto=milk,baseball,token,bulb,chip,typhoon,boba,rat&quality=low/);
  assert.match(readFileSync('tools/shot.mjs', 'utf8'), /phone360'\) \? '360,780'/);
});

// 重玩迴圈（計畫 12 Task 2）：遊戲結束後 RESET 加 glow（珊瑚底白字、輕輕放大），RESET 之後拿掉；沒有任何新文字
test('setFinished toggles the glow class on RESET only, without adding text', async () => {
  const { root, bar, btn } = await topBar();
  const reset = btn('reset'), text = root.textContent;
  assert.equal(reset.classList.contains('glow'), false);
  bar.setFinished(true); assert.equal(reset.classList.contains('glow'), true);
  assert.equal(btn('howto').classList.contains('glow'), false);
  assert.equal(root.textContent, text, 'no new text');
  bar.setFinished(false); assert.equal(reset.classList.contains('glow'), false);
});
test('ui.css: the glowing RESET is coral with white text, pulses 1 → 1.06 every 1.6 s, and stays still under reduced motion', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync('src/ui/ui.css', 'utf8');
  const rule = /\.tools button\.glow\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.match(rule, /background:\s*var\(--coral\)/); assert.match(rule, /color:\s*#fff/); assert.match(rule, /animation:\s*reset-glow 1\.6s/);
  assert.match(css, /@keyframes reset-glow\s*\{[^}]*scale\(1\)[^}]*\}[^}]*scale\(1\.06\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.tools button\.glow\s*\{\s*animation:\s*none/);
});

// 開局載入（計畫 12 Task 4）：柴犬（純點綴、528 KB）等第一幀畫出來之後才載，不擋開局；開局模型 ≤ 1.5 MB
test('startup bytes: the shiba is deferred past the first frame and the opening models stay within 1.5 MB', async () => {
  const { measure, GOAL } = await import('../tools/startup-bytes.mjs');
  const { SHIBA } = await import('../src/app.js');
  const { startup, deferred, glbBytes } = await measure();
  assert.ok(!startup.some(r => r.path === SHIBA.path), 'the shiba is not loaded at startup');
  assert.deepEqual(deferred.map(r => r.path), [SHIBA.path]);
  assert.ok(glbBytes <= GOAL, `startup glb ${glbBytes} > ${GOAL}`);
});
test('createLater runs the queued jobs once, after the first frame is drawn', async () => {
  installFakeDom(); const { createLater } = await import('../src/app.js');
  const queued = [], ran = [];
  const later = createLater(fn => queued.push(fn));
  later.add(() => ran.push('a')); later.add(() => ran.push('b'));
  assert.equal(queued.length, 0, 'nothing before the first frame'); assert.equal(later.done, false);
  later.drawn(); later.drawn();
  assert.equal(queued.length, 1, 'scheduled once'); assert.deepEqual(ran, []);
  queued[0](); assert.deepEqual(ran, ['a', 'b']); assert.equal(later.done, true);
  later.add(() => ran.push('c')); assert.equal(queued.length, 2); queued[1](); assert.deepEqual(ran, ['a', 'b', 'c']);
});
test('app.js spawns the shiba through createLater, calls drawn() after the first render, and waits for it before reporting draw calls', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('src/app.js', 'utf8');
  assert.match(src, /later\.add\(\(\) => assets\.spawn\(SHIBA\.path/);
  const loop = src.slice(src.indexOf('setAnimationLoop('));
  assert.ok(loop.indexOf('later.drawn()') > loop.indexOf('view.render()'), 'drawn() after the render');
  assert.match(loop, /autoDone && later\.done && sampleCalls/);
});
