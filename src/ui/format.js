// 小工具：等級文字、永不丟例外的 localStorage。
export function levelLabel(lv, max) { return lv <= 0 ? '' : lv >= max ? 'Lv.MAX' : `Lv.${lv}`; }

// storage 在 try 裡面才取：localStorage 的 getter 本身會丟（Chrome 封鎖 cookie、沙盒 iframe），放在預設參數會在 try 外面丟出來（整批審查 2026-11-06）
export function storageGet(key, storage) {
  try { return (storage ?? globalThis.localStorage).getItem(key); } catch { return null; }
}
export function storageSet(key, value, storage) {
  try { (storage ?? globalThis.localStorage).setItem(key, value); return true; } catch { return false; }
}
