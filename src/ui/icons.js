// 八個物品的簡筆圖示：白底黑線，跨平台長相一致（不用 emoji，設計文件 §5）。
const svg = body => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" fill="#fff" stroke="#211d1d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  milk: svg('<path d="M22 22 L28 12 H36 L42 22 V54 H22 Z"/><path d="M22 22 H42"/><path d="M27 34 h10" />'),
  chip: svg('<rect x="18" y="18" width="28" height="28" rx="3"/><rect x="26" y="26" width="12" height="12" fill="#211d1d"/><path d="M24 10v8M32 10v8M40 10v8M24 46v8M32 46v8M40 46v8M10 24h8M10 32h8M10 40h8M46 24h8M46 32h8M46 40h8"/>'),
  bulb: svg('<path d="M32 10 a14 14 0 0 1 8 25 v7 h-16 v-7 a14 14 0 0 1 8 -25 Z"/><path d="M26 48 h12 M28 54 h8"/>'),
  token: svg('<circle cx="32" cy="32" r="20"/><circle cx="32" cy="32" r="12"/><path d="M27 32 h10"/>'),
  typhoon: svg('<path d="M32 32 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0" /><path d="M36 30 C 50 22, 46 8, 30 10" fill="none"/><path d="M28 34 C 14 42, 18 56, 34 54" fill="none"/><path d="M34 28 C 48 36, 56 26, 54 18" fill="none"/><path d="M30 36 C 16 28, 8 38, 10 46" fill="none"/>'),
  rat: svg('<path d="M12 40 C 14 26, 36 24, 46 34 L54 36 L46 40 C 40 46, 20 48, 12 40 Z"/><circle cx="40" cy="28" r="5"/><circle cx="46" cy="35" r="1.5" fill="#211d1d"/><path d="M12 40 C 6 42, 6 50, 14 52" fill="none"/>'),
  boba: svg('<path d="M20 22 H44 L40 54 H24 Z"/><path d="M18 22 H46"/><path d="M34 22 L38 8" fill="none"/><circle cx="28" cy="48" r="2" fill="#211d1d"/><circle cx="34" cy="49" r="2" fill="#211d1d"/><circle cx="31" cy="44" r="2" fill="#211d1d"/>'),
  baseball: svg('<circle cx="32" cy="32" r="20"/><path d="M20 16 C 26 26, 26 38, 20 48" fill="none"/><path d="M44 16 C 38 26, 38 38, 44 48" fill="none"/>'),
};

// 泡泡圖框裡的六個圖示（角色「想到」的地方或東西），同一套白底墨線
export const BUBBLE_ICONS = {
  dome: svg('<path d="M10 46 C 10 24, 54 24, 54 46 Z"/><path d="M8 46 H56 V52 H8 Z"/><path d="M22 30 C 26 36, 26 42, 24 46 M42 30 C 38 36, 38 42, 40 46" fill="none"/>'),
  school: svg('<path d="M12 28 L32 14 L52 28 Z"/><rect x="14" y="28" width="36" height="24"/><rect x="28" y="40" width="8" height="12"/><path d="M20 34 h4 M40 34 h4"/><path d="M32 14 V6 L40 8 L32 10" fill="none"/>'),
  mortar: svg('<path d="M32 12 L52 20 L32 28 L12 20 Z"/><path d="M20 24 V34 C 20 40, 44 40, 44 34 V24" /><path d="M52 20 V34" fill="none"/><circle cx="52" cy="36" r="2" fill="#211d1d"/>'),
  islet: svg('<path d="M8 44 C 16 40, 48 40, 56 44"/><path d="M14 44 C 18 32, 46 32, 50 44 Z"/><path d="M32 36 V18" fill="none"/><path d="M32 18 C 24 14, 18 18, 16 22 M32 18 C 40 14, 46 18, 48 22 M32 18 C 30 12, 26 10, 22 10" fill="none"/><path d="M6 52 C 12 49, 18 55, 24 52 C 30 49, 36 55, 42 52 C 48 49, 54 55, 58 52" fill="none"/>'),
  train: svg('<rect x="16" y="10" width="32" height="38" rx="8"/><rect x="21" y="16" width="22" height="12" rx="2"/><circle cx="24" cy="38" r="3" fill="#211d1d"/><circle cx="40" cy="38" r="3" fill="#211d1d"/><path d="M22 48 L16 56 M42 48 L48 56 M12 56 H52" fill="none"/>'),
  lamp: svg('<path d="M32 56 V22" fill="none"/><path d="M22 56 H42"/><path d="M24 22 L28 12 H36 L40 22 Z"/><path d="M26 22 H38"/><path d="M32 8 V4 M20 14 L16 12 M44 14 L48 12" fill="none"/>'),
};

// 跳過鍵（物品列最後一格，修正批次 max-skip §C）：⏭ 兩個往右的三角形＋一條直線，同一套白底墨線（啟用時 CSS 改成白色，ui.css .skip）
export const SKIP_ICON = svg('<path d="M12 18 L30 32 L12 46 Z"/><path d="M30 18 L48 32 L30 46 Z"/><path d="M53 18 V46" fill="none"/>');

// 隱藏選單鍵（使用者 2026-11-06：遊戲結束後跳過鍵變隱藏選單）：兩個朝下的 V 形，同一套白底墨線；側欄時 CSS 轉 −90° 朝右，顯示選單圓鍵再轉 180° 朝上（ui.css .skip／.menu-tab）
export const HIDE_ICON = svg('<path d="M16 16 L32 30 L48 16" fill="none"/><path d="M16 34 L32 48 L48 34" fill="none"/>');

// R45 結局圖鑑（使用者 2026-11-06）：每個結局一個圖示，同一套 64 viewBox 白底墨線；每個只用幾筆，32 px 也認得出來。鍵 = endings.js 的 ENDINGS
export const ENDING_ICONS = {
  // 賽博：101 與飛天跑車
  cyber: svg('<path d="M8 58 H34"/><path d="M14 58 V22 L21 6 L28 22 V58 Z"/><path d="M14 34 h14 M14 46 h14"/><path d="M37 24 C 39 13, 55 13, 57 24 Z"/><rect x="32" y="24" width="30" height="10" rx="5"/><path d="M38 44 h12 M44 51 h12" fill="none"/>'),
  // 變異鼠稱王：戴王冠的老鼠
  alien: svg('<path d="M12 46 C 14 32, 36 30, 46 40 L54 42 L46 46 C 40 52, 20 54, 12 46 Z"/><circle cx="40" cy="34" r="5"/><circle cx="46" cy="41" r="1.5" fill="#211d1d"/><path d="M12 46 C 6 48, 6 56, 14 58" fill="none"/><path d="M31 26 L29 12 L35 18 L40 8 L45 18 L51 12 L49 26 Z"/>'),
  // 大停電：劃掉的燈泡
  blackout: svg('<path d="M32 10 a14 14 0 0 1 8 25 v7 h-16 v-7 a14 14 0 0 1 8 -25 Z"/><path d="M26 48 h12 M28 54 h8"/><path d="M12 12 L52 52" fill="none"/>'),
  // 捷運淹水：車站與波浪（水淹到半身）
  flood: svg('<path d="M12 28 L32 14 L52 28 Z"/><rect x="15" y="28" width="34" height="22"/><rect x="21" y="32" width="22" height="6" rx="1"/><path d="M4 44 C 10 40, 16 48, 22 44 C 28 40, 34 48, 40 44 C 46 40, 52 48, 60 44 V60 H4 Z"/><path d="M10 53 C 16 50, 20 56, 26 53 C 32 50, 36 56, 42 53" fill="none"/>'),
  // 大巨蛋淹水：巨蛋與波浪
  domeFlood: svg('<path d="M8 42 C 8 16, 56 16, 56 42 Z"/><path d="M22 24 C 26 30, 26 36, 24 42 M42 24 C 38 30, 38 36, 40 42" fill="none"/><path d="M4 40 C 10 36, 16 44, 22 40 C 28 36, 34 44, 40 40 C 46 36, 52 44, 60 40 V60 H4 Z"/><path d="M10 50 C 16 47, 20 53, 26 50 C 32 47, 36 53, 42 50" fill="none"/>'),
  // 珍奶攤被吹走：歪掉的攤車與風線
  cartBlown: svg('<g transform="rotate(-14 42 34)"><rect x="28" y="26" width="26" height="16"/><path d="M25 26 L29 16 H53 L57 26 Z"/><circle cx="34" cy="46" r="4"/><circle cx="48" cy="46" r="4"/></g><path d="M4 22 H18 M4 32 H16 C 22 32, 22 25, 17 25 M8 42 H20" fill="none"/>'),
  // 大巨蛋鼠災：巨蛋與老鼠
  domeRats: svg('<path d="M4 40 C 4 16, 42 16, 42 40 Z"/><path d="M2 40 H44 V46 H2 Z"/><path d="M26 54 C 28 42, 46 40, 54 48 L60 50 L54 53 C 48 60, 30 62, 26 54 Z"/><circle cx="47" cy="44" r="4"/><circle cx="53" cy="49" r="1.5" fill="#211d1d"/>'),
  // 矽盾未就緒：彎成 L 形的 101
  shieldDown: svg('<path d="M6 58 H34"/><path d="M13 58 V30 H25 V58 Z"/><path d="M13 39 h12 M13 48 h12"/><g transform="rotate(62 25 30)"><path d="M13 30 V12 L19 0 L25 12 V30 Z"/><path d="M13 21 h12"/></g>'),
  // 颱風吹偏隕石：颱風漩渦與石頭
  typhoonDeflect: svg('<circle cx="22" cy="42" r="4"/><path d="M26 40 C 38 34, 34 22, 20 24" fill="none"/><path d="M18 44 C 6 50, 10 60, 24 58" fill="none"/><path d="M26 44 C 36 52, 44 46, 44 40" fill="none"/><path d="M43 9 L53 5 L60 13 L57 24 L46 27 L40 18 Z"/><path d="M47 15 l3 2" fill="none"/><path d="M28 12 H35 M30 21 H36" fill="none"/>'),
  // 鮮奶過期：長腳跑掉的牛奶箱
  milkExpired: svg('<path d="M22 16 L28 6 H36 L42 16 V44 H22 Z"/><path d="M22 16 H42"/><path d="M27 28 h10"/><path d="M27 44 L22 54 H16 M37 44 L44 54 H50" fill="none"/><path d="M50 12 C 54 16, 46 18, 50 24 M56 18 C 60 22, 52 24, 56 30" fill="none"/>'),
  // 再接再厲：發芽的種子
  tryAgain: svg('<path d="M8 54 H56" fill="none"/><ellipse cx="32" cy="48" rx="11" ry="7"/><path d="M32 41 V22" fill="none"/><path d="M32 32 C 24 32, 18 26, 18 18 C 26 18, 32 24, 32 32 Z"/><path d="M32 26 C 40 26, 46 20, 46 12 C 38 12, 32 18, 32 26 Z"/>'),
};

// 圖鑑裡還沒看過的結局：圓圈裡一個問號
export const UNKNOWN_ICON = svg('<circle cx="32" cy="32" r="22"/><path d="M25 26 C 25 17, 39 17, 39 26 C 39 32, 32 32, 32 38" fill="none"/><circle cx="32" cy="46" r="2" fill="#211d1d"/>');
