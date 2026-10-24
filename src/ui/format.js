// 小工具：等級文字、永不丟例外的 localStorage。
export function levelLabel(lv, max) { return lv <= 0 ? '' : lv >= max ? 'Lv.MAX' : `Lv.${lv}`; }

export function storageGet(key, storage = globalThis.localStorage) {
  try { return storage.getItem(key); } catch { return null; }
}
export function storageSet(key, value, storage = globalThis.localStorage) {
  try { storage.setItem(key, value); return true; } catch { return false; }
}
