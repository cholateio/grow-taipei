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
