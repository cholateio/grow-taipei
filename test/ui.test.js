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
test('there is no end card any more and the floating skip pill is gone: cards.js exports only the how-to card and the top bar', async () => {
  installFakeDom(); const cards = await import('../src/ui/cards.js');
  assert.deepEqual(Object.keys(cards).sort(), ['createTopBar', 'showHowTo']);
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
// 跳過鍵（修正批次 max-skip §C，使用者 2026-11-01「建議跳過按鈕放到下方物品欄裡面，用 Skip icon」）：物品列最後一格，只有 Skip 圖示（沒有文字），
// aria-label／title「跳過」；一直在、不跳版面——沒有演出時停用，演出中（show.skippable）啟用；setSkippable 連續同值不寫 DOM；按下呼叫 onSkip
const slotsWithSkip = async () => {
  installFakeDom(); const { createSlots } = await import('../src/ui/slots.js');
  const root = document.createElement('div'), calls = [];
  const slots = createSlots(root, { items: slotItems(), onPick: id => calls.push(id), onSkip: () => calls.push('skip') });
  return { root, slots, calls, nav: root.querySelector('.slots'), skip: root.querySelector('.slots').children.at(-1) };
};
test('the skip button is the last cell of the item bar: an icon-only button labelled 跳過, disabled until the show is skippable', async () => {
  const { nav, skip, calls } = await slotsWithSkip();
  assert.equal(nav.children.length, 9, 'eight items + skip');
  assert.equal(skip.tagName, 'button'); assert.equal(skip.className, 'skip'); assert.equal(skip.type, 'button');
  assert.equal(skip.getAttribute('aria-label'), '跳過'); assert.equal(skip.getAttribute('title'), '跳過');
  assert.match(skip._html, /^<svg[\s\S]*viewBox="0 0 64 64"/); assert.equal(skip.textContent.trim(), '', 'no text');
  assert.equal(skip.disabled, true, 'disabled by default');
  skip.listeners.click(); assert.deepEqual(calls, [], 'a disabled press does nothing');
});
test('setSkippable enables / disables the skip cell without rewriting the same value; a press calls onSkip; busy and reset leave it alone', async () => {
  const { slots, skip, calls } = await slotsWithSkip();
  const w = () => skip.disabledWrites ?? 0, w0 = w();
  slots.setSkippable(false); slots.setSkippable(false); assert.equal(w(), w0, 'same value: no DOM write');
  slots.setSkippable(true); slots.setSkippable(true); slots.setSkippable(true);
  assert.equal(skip.disabled, false); assert.equal(w(), w0 + 1, 'enabled once');
  slots.setBusy(true); assert.equal(skip.disabled, false, 'busy items do not disable the skip cell');
  skip.listeners.click(); assert.deepEqual(calls, ['skip']);
  slots.setSkippable(false); assert.equal(skip.disabled, true); assert.equal(w(), w0 + 2);
  slots.setSkippable(true); slots.reset(); assert.equal(skip.disabled, false, 'reset does not touch it (the frame loop does)');
});
test('the skip icon: two right-pointing triangles and a bar, in the shared svg style', async () => {
  const { SKIP_ICON } = await import('../src/ui/icons.js');
  assert.match(SKIP_ICON, /^<svg/); assert.match(SKIP_ICON, /viewBox="0 0 64 64"/); assert.match(SKIP_ICON, /stroke="#211d1d"/);
  assert.equal((SKIP_ICON.match(/<path d="M[\d ]+L[\d ]+L[\d ]+Z"/g) ?? []).length, 2, 'two triangles');
  assert.match(SKIP_ICON, /<path d="M\d+ \d+ V\d+"/, 'one vertical bar');
});
// 樣式：物品列高度不變（--slots-h 98／178）；桌機一排、跳過鍵是第 9 欄窄格（寬 44、高 72），間距 6（8×64 + 44 + 8×6 + 24 = 628）；
// 手機兩排（≤ 660 = 628 + 左右各 16：修正輪 1，間距 8 時桌機 644 寬、斷點 640，641–643 寬會溢出）跳過鍵第 5 欄跨兩排；
// 窄螢幕（≤ 380）物品格 58、跳過欄 36（360 寬時整條 4×58 + 36 + 4×6 + 24 = 316 ≤ 328）；停用淡、啟用珊瑚底白圖示；浮動膠囊拿掉了
const cssText = async () => (await import('node:fs')).readFileSync('src/ui/ui.css', 'utf8');
const ruleOf = (css, sel) => new RegExp(`(^|\\n)\\s*${sel.replace(/[.[\]()]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[2] ?? '';
const mediaOf = (css, q) => new RegExp(`@media \\(${q.replace(/[()]/g, '\\$&')}\\)\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1] ?? '';
test('ui.css: the skip cell sits in the item bar — a narrow 9th column on desktop, column 5 spanning both rows on phones, 58 / 36 px on narrow phones', async () => {
  const css = await cssText();
  assert.match(/:root\s*\{([^}]*)\}/.exec(css)[1], /--slots-h:\s*98px/);
  assert.match(ruleOf(css, '.slots'), /grid-template-columns:\s*repeat\(8, 64px\) 44px/); assert.match(ruleOf(css, '.slots'), /(^|[^-])gap:\s*6px/); assert.match(ruleOf(css, '.slots'), /row-gap:\s*8px/, 'rows stay 8 apart (--slots-h 178)');
  const W = (n, cell, skip, gap = 6) => n * cell + skip + n * gap + 24;   // n 欄物品＋跳過欄：n 個間距、左右內距 12 + 12
  assert.equal(W(8, 64, 44), 628); assert.ok(W(8, 64, 44) + 32 <= 661, 'desktop bar fits from 661 px with 16 px gutters');
  assert.ok(W(4, 64, 44) + 32 <= 381, 'phone bar fits from 381 px with 16 px gutters');
  assert.doesNotMatch(css, /max-width: 640px/, 'the old 640 breakpoint is gone');
  const skip = ruleOf(css, '.skip');
  assert.match(skip, /width:\s*44px/); assert.match(skip, /height:\s*72px/); assert.doesNotMatch(skip, /position:\s*fixed/);
  assert.match(ruleOf(css, '.skip:disabled'), /opacity:\s*\.\d/);
  assert.match(ruleOf(css, '.skip:not(:disabled)'), /background:\s*var\(--coral\)/);
  assert.match(ruleOf(css, '.skip:not(:disabled) svg'), /stroke:\s*#fff/);
  const phone = mediaOf(css, 'max-width: 660px');
  assert.match(phone, /--slots-h:\s*178px/); assert.match(ruleOf(phone, '.slots'), /grid-template-columns:\s*repeat\(4, 64px\) 44px/);
  assert.match(ruleOf(phone, '.skip'), /grid-column:\s*5/); assert.match(ruleOf(phone, '.skip'), /grid-row:\s*1 \/ span 2/); assert.match(ruleOf(phone, '.skip'), /height:\s*auto/);
  const narrow = mediaOf(css, 'max-width: 380px');
  assert.match(ruleOf(narrow, '.slots'), /grid-template-columns:\s*repeat\(4, 58px\) 36px/);
  assert.match(ruleOf(narrow, '.slot'), /width:\s*58px/); assert.match(ruleOf(narrow, '.skip'), /width:\s*36px/);
  assert.ok(W(4, 58, 36) <= 360 - 32, '360 wide: the bar fits with 16 px gutters');
  assert.doesNotMatch(css, /\.skip\[hidden\]|var\(--slots-h\) \+ 8px/, 'the floating pill is gone');
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
  assert.match(shot, /'phone360-live=auto=milk,baseball,token,bulb,chip,boba,typhoon,rat&live=1&warp=3&quality=low'/);   // 計畫 14 的正解
  assert.match(shot, /phone360-end=auto=milk,baseball,token,bulb,chip,boba,typhoon,rat&quality=low/);
  assert.match(readFileSync('tools/shot.mjs', 'utf8'), /phone360'\) \? '360,780'/);
});

test('ui.css: phone landscape (orientation landscape, max-height 520) turns the item bar into a right-hand rail', async () => {
  const css = await cssText();
  const block = css.slice(css.indexOf('@media (orientation: landscape) and (max-height: 520px)'));
  for (const rule of ['right: max(12px, env(safe-area-inset-right))', 'left: auto', 'bottom: auto', 'top: calc(50% + 28px)', 'translateY(-50%)', 'repeat(2, 48px)', '.slot .name { display: none; }', 'grid-column: 1 / span 2', 'grid-row: 5']) assert.ok(block.includes(rule), rule);
  assert.ok(css.indexOf('@media (orientation: landscape)') > css.indexOf('@media (max-width: 380px)'), 'after the width queries so it wins');
});
// 使用者 2026-11-06：瀏覽器裡橫放視窗只有 ~280–332 px 高——再縮一階，206 ≤ 280 − 62 − 8
test('ui.css: short landscape viewports (max-height 340) anchor the rail under the top bar and shrink it to 206 px', async () => {
  const css = await cssText();
  const at = css.indexOf('@media (orientation: landscape) and (max-height: 340px)');
  assert.ok(at > css.indexOf('@media (orientation: landscape) and (max-height: 520px)'), 'after the 520 rail so it wins');
  const block = css.slice(at);
  for (const rule of ['top: 62px', 'transform: none', 'repeat(2, 36px)', 'gap: 4px', 'padding: 8px', 'width: 36px; height: 36px', 'width: 22px; height: 22px', '.slot, .skip { min-height: 0; }', '.skip { height: 30px; }', '.slot .lv { bottom: 1px']) assert.ok(block.includes(rule), rule);
  assert.ok(4 * 36 + 4 * 4 + 30 + 2 * 8 <= 280 - 62 - 8);
  assert.ok(css.match(/env\(safe-area-inset-right\)\), -50%\)/) && block.includes('40px + env(safe-area-inset-right)'), 'collapsed rail clears the notch');
});
test('npm run shot includes land-live and land-end at 844×390 (quality low)', async () => {
  const { readFileSync } = await import('node:fs');
  const shot = JSON.parse(readFileSync('package.json', 'utf8')).scripts.shot;
  assert.ok(/\bland-live=[^ ]*quality=low/.test(shot) && /\bland-end=[^ ]*quality=low/.test(shot));
  assert.ok(readFileSync('tools/shot.mjs', 'utf8').includes("name.includes('land') ? '844,390'"));
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

// 使用者 2026-11-06：遊戲結束後跳過鍵變隱藏選單鍵（R43）
test('setMode("hide") turns the skip cell into a hide-menu button; pressing it collapses the bar and shows the menu tab; the tab restores it; reset returns to skip mode', async () => {
  const { nav, skip, slots, root, calls } = await slotsWithSkip();
  slots.setMode('hide');
  assert.equal(skip.getAttribute('aria-label'), '隱藏選單'); assert.equal(skip.disabled, false); assert.ok(skip.innerHTML.includes('<svg'));
  skip.listeners.click(); assert.ok(nav.classList.contains('collapsed')); assert.equal(nav.inert, true, 'collapsed bar is inert'); assert.deepEqual(calls, [], 'hide press never calls onSkip');
  const tab = root.querySelector('.menu-tab'); assert.ok(tab && tab.classList.contains('on')); assert.equal(tab.getAttribute('aria-label'), '顯示選單');
  tab.listeners.click(); assert.equal(nav.inert, false); assert.ok(!nav.classList.contains('collapsed')); assert.ok(!tab.classList.contains('on'));
  slots.setSkippable(true); assert.equal(skip.getAttribute('aria-label'), '隱藏選單', 'hide mode ignores setSkippable');
  slots.setSkippable(false); assert.equal(skip.disabled, false);
  skip.listeners.click(); assert.ok(nav.classList.contains('collapsed'), 'collapsed again before reset');
  slots.reset(); assert.equal(skip.getAttribute('aria-label'), '跳過'); assert.ok(!nav.classList.contains('collapsed')); assert.ok(!tab.classList.contains('on')); assert.equal(nav.inert, false);
});
test('ui.css: collapsed bar slides off-screen (down; right in landscape), the menu tab is a 44px round button at the same edge, no slide under reduced motion', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../src/ui/ui.css', import.meta.url), 'utf8');
  assert.match(css, /\.slots\.collapsed \{ transform: translate\(-50%, calc\(100% \+ 40px\)\); \}/);
  const land = css.slice(css.indexOf('@media (orientation: landscape) and (max-height: 520px)'));
  assert.match(land, /\.slots\.collapsed \{ transform: translate\(calc\(100% \+ 40px \+ env\(safe-area-inset-right\)\), -50%\); \}/, 'landscape collapse sits in the rail block');
  assert.match(land, /\.menu-tab \{[^}]*right: max\(12px[^}]*top: 50%;[^}]*translateY\(-50%\)/);
  assert.match(land, /\.skip\.hide svg \{ transform: rotate\(-90deg\)/); assert.match(land, /\.menu-tab svg \{ transform: rotate\(90deg\)/);
  assert.ok(!css.slice(0, css.indexOf('@media (orientation: landscape) and (max-height: 520px)')).includes('40px + env(safe-area-inset-right)), -50%'), 'not outside the block');
  assert.ok(!/\.slots\s*\{[^}]*transition/.test(css)); assert.ok(css.includes('.slots.sliding { transition: transform .3s; }'));
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.slots\.sliding \{ transition: none; \} \}/);
  assert.match(css, /\.menu-tab \{[^}]*width: 44px; height: 44px;[^}]*border-radius: 22px;[^}]*display: none;/);
  assert.match(css, /\.menu-tab\.on \{ display: grid; place-items: center; \}/);
});

// 使用者 2026-11-06：放置順序編號
test('setPlaced numbers the cell with the order it was placed (1…8); reset clears the numbers and restarts the count', async () => {
  installFakeDom(); const { createSlots } = await import('../src/ui/slots.js');
  const root = document.createElement('div'), slots = createSlots(root, { items: slotItems(), onPick() {} });
  const nav = root.querySelector('.slots');
  const n = id => nav.children.find(b => b.dataset.id === id).querySelector('.n').textContent;
  slots.setPlaced('milk'); slots.setPlaced('rat'); assert.equal(n('milk'), '1'); assert.equal(n('rat'), '2'); assert.equal(n('chip'), '');
  slots.setPlaced('rat'); assert.equal(n('rat'), '2');
  slots.reset(); assert.equal(n('milk'), ''); slots.setPlaced('chip'); assert.equal(n('chip'), '1');
});
test('ui.css: the order badge is an 18px ink circle top-left of the cell, 16px in the landscape rail and 14px in the short rail; empty badges are hidden', async () => {
  const css = await cssText();
  assert.match(css, /\.slot \.n \{ position: absolute; top: -6px; left: -6px; width: 18px; height: 18px; border-radius: 9px; background: var\(--ink\); color: #fff; font: 900 11px\/18px sans-serif; text-align: center; font-style: normal; \}/);
  assert.match(css, /\.slot \.n:empty \{ display: none; \}/);
  const rail = css.slice(css.indexOf('(max-height: 520px)'), css.indexOf('(max-height: 340px)')), short = css.slice(css.indexOf('(max-height: 340px)'));
  assert.match(rail, /\.slot \.n \{ width: 16px; height: 16px;[^}]*font-size: 10px/);
  assert.match(short, /\.slot \.n \{ width: 14px; height: 14px;[^}]*font-size: 9px/);
});

// R45 結局圖鑑（使用者 2026-11-06）：怎麼玩卡片下方，每個結局一格；看過的點亮（圖示＋名稱），沒看過的灰磚問號
test('ENDING_ICONS has one shared-style icon per ending id, plus UNKNOWN_ICON', async () => {
  const { ENDINGS } = await import('../src/rules/endings.js'); const { ENDING_ICONS, UNKNOWN_ICON } = await import('../src/ui/icons.js');
  assert.deepEqual(Object.keys(ENDING_ICONS).sort(), Object.keys(ENDINGS).sort());
  for (const s of [...Object.values(ENDING_ICONS), UNKNOWN_ICON]) assert.ok(s.startsWith('<svg viewBox="0 0 64 64"') && s.includes('stroke="#211d1d"'));
});
test('the how-to card draws the ending gallery: cyber first (true ring), tryAgain last, seen endings get their icon and title, unseen are unknown tiles without a title; the count reads seen / total; unknown ids are ignored; no endings → no gallery', async () => {
  installFakeDom(); const { showHowTo } = await import('../src/ui/cards.js'); const { ENDINGS } = await import('../src/rules/endings.js');
  const root = document.createElement('div');
  const el = showHowTo(root, { onClose() {}, endings: ENDINGS, seen: ['flood', 'bogus'] });
  const tiles = [...el.querySelectorAll('.ending')]; assert.equal(tiles.length, Object.keys(ENDINGS).length);
  assert.equal(tiles[0].dataset.id, 'cyber'); assert.ok(tiles[0].classList.contains('true')); assert.equal(tiles.at(-1).dataset.id, 'tryAgain');
  const flood = tiles.find(t => t.dataset.id === 'flood'); assert.ok(!flood.classList.contains('unknown')); assert.equal(flood.querySelector('.title').textContent, '捷運淹水');
  assert.ok(tiles[0].classList.contains('unknown')); assert.equal(tiles[0].querySelector('.title').textContent, '');
  assert.equal(el.querySelector('.seen').textContent, '1'); assert.equal(el.querySelector('.total').textContent, String(tiles.length));
  assert.equal(showHowTo(root, { onClose() {} }).querySelector('.endings'), null);
});
// R45 修正輪：存進 localStorage 的 "constructor" 之類的原型鍵不算看過；卡片高度先 vh 後 dvh（手機網址列）；≤340 寬名稱縮小、超出就省略號
test('the gallery ignores prototype keys in seen ("constructor" does not count)', async () => {
  installFakeDom(); const { showHowTo } = await import('../src/ui/cards.js'); const { ENDINGS } = await import('../src/rules/endings.js');
  const el = showHowTo(document.createElement('div'), { onClose() {}, endings: ENDINGS, seen: ['constructor', 'toString', '__proto__'] });
  assert.equal(el.querySelector('.seen').textContent, '0');
  assert.ok([...el.querySelectorAll('.ending')].every(t => t.classList.contains('unknown')));
});
test('ui.css: the card scrolls inside 100vh − 32 then 100dvh − 32; gallery titles ellipsize, and shrink to 9 px with a 4 px gap at ≤ 340 px', async () => {
  const css = await cssText();
  assert.match(css, /\n\.card \{ max-height: calc\(100vh - 32px\); max-height: calc\(100dvh - 32px\); overflow: auto; \}/);
  const title = ruleOf(css, '.ending .title');
  assert.match(title, /overflow:\s*hidden/); assert.match(title, /text-overflow:\s*ellipsis/); assert.match(title, /max-width:\s*100%/); assert.match(title, /white-space:\s*nowrap/);
  const tiny = mediaOf(css, 'max-width: 340px');
  assert.match(ruleOf(tiny, '.endings .grid'), /gap:\s*4px/); assert.match(ruleOf(tiny, '.ending .title'), /font-size:\s*9px/);
});

test('collapse/expand add .sliding for the slide and drop it after transitionend or 350 ms; the hide cell is cream, not coral', async () => {
  const css = (await import('node:fs')).readFileSync(new URL('../src/ui/ui.css', import.meta.url), 'utf8');
  assert.ok(css.includes('.skip.hide:not(:disabled) { background: var(--cream)'));
  assert.ok(css.indexOf('.skip.hide:not(:disabled) {') > css.indexOf('.skip:not(:disabled) { background: var(--coral)'));
  const { nav, skip, slots, root } = await slotsWithSkip();
  slots.setMode('hide'); assert.ok(!nav.classList.contains('sliding'), 'no slide when merely switching mode');
  skip.listeners.click();
  assert.ok(nav.classList.contains('sliding') && nav.classList.contains('collapsed'));
  nav.listeners.transitionend({ target: nav }); assert.ok(!nav.classList.contains('sliding'), 'transitionend');
  root.querySelector('.menu-tab').listeners.click(); assert.ok(nav.classList.contains('sliding') && !nav.classList.contains('collapsed'));
  await new Promise(r => setTimeout(r, 400)); assert.ok(!nav.classList.contains('sliding'), 'safety timer');
});
