// 最終章（計畫 5，設計 §3、§9）：飛彈倒數的宣告與數字、飛彈、真結局尾聲——都不是物品，是遊戲層合成的事件。
// 遊戲層（game.js）在每個倒數回合最前面插 countdown 事件（n = 3、2、1，flag alarm = n），第 8 個放完、倒數演完之後
// 演一個終局回合：missile 事件（flag missile = shield／deflect／hit），真結局再接 epilogue（flag epilogue = 結局 id）。
// 旗標只折進舞台（stage.flags，foldEvent 照 e.flag 折），引擎狀態不碰。turn.js 把這三種事件的劇本交給這個模組（script[e.kind]）。
// 任務 1 是骨架：view 還沒畫東西（紅光、飛彈、尾聲的零件在後面的任務）；countdown 只在 101 頭上冒一個數字，
// missile／epilogue 只套用事件（旗標進舞台）。
export const id = 'finale';

// 數字泡泡的真實秒數（設計 §4 第 3 步：「3」「2」「1」各 1.2 秒，取代以前每回合連冒 3、2、1 各 0.6 秒）
export const DIGIT = 1.2;

export function view() { return {}; }

export const script = {
  // 倒數字：101 頭上冒 n。倒數回合是蒙太奇 2 倍速（ctx.speed）——字是給玩家讀的，演出時間乘回倍速，真實秒數照舊 1.2
  countdown: (e, s, ctx) => [ctx.B.bubble('tower', String(e.n), DIGIT * ctx.speed)],
  missile: (e, s, ctx) => [ctx.B.apply(e)],
  epilogue: (e, s, ctx) => [ctx.B.apply(e)],
};
