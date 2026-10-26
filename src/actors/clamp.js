// 物品 v2 過渡期（計畫 4 任務 2）：規則已經是 61 級，演員的 view 與劇本還是舊階梯。
// OLD_MAX：還沒改寫的物品的舊 max。view 一開頭用 clampLv 把每個這樣的物品夾到舊 max（別的物品讀到的也是夾過的），
// 超過舊 max 的級數不查模組劇本、走預設的 apply + LEVEL UP（turn.js 用 scripted 判斷）。
// 任務 4–9 改寫一個物品就把它從這裡拿掉；全部拿掉後這個檔案也刪掉。
export const OLD_MAX = { chip: 6, bulb: 5, token: 6, typhoon: 3, rat: 5, boba: 4, baseball: 6 };

// 等級向量裡每個列在 OLD_MAX 的物品夾到舊 max；沒超過就原樣回傳同一個物件
export function clampLv(lv) {
  if (!lv || !Object.keys(OLD_MAX).some(id => lv[id] > OLD_MAX[id])) return lv;
  const out = { ...lv };
  for (const id in OLD_MAX) if (out[id] > OLD_MAX[id]) out[id] = OLD_MAX[id];
  return out;
}

// 這個物品升到第 n 級時，模組劇本還認得嗎（不在 OLD_MAX 的物品一律認得）
export const scripted = (id, n) => !(id in OLD_MAX) || n <= OLD_MAX[id];
