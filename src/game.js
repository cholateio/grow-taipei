// 遊戲流程：點物品 → 引擎算出這回合的事件 → 演出層演完一整回合 → 物品列寫 Lv → 八個放完就結局。
// 每回合最後補一個 settle 事件（101 跳階、颱風登陸結束）。物品列只在回合結束靜靜寫 Lv.n（§9）；
// 全島效果在回合裡由演出層的 world 拍瞄準，回合結束再以引擎狀態對一次（onLevels）。
// 最終章（選擇帶動升級 2026-10-28，設計 §4；取代計畫 5 的倒數三回合）：第 8 個放完後全島再長 CLOSING_TURNS（1）輪，
// 照一般回合演（沒有倒數字、沒有蒙太奇）；之後遊戲層把結局算好（endings.resolve），合成終局回合的事件
// （隕石警告、隕石、真結局與六個壞結局再接收尾）交給演出層演（finale: true），
// 再停 TITLE_HOLD 秒（不能跳過）才算結束（onFinished；標題卡 2026-11-01 拿掉了，畫面就是結局）。合成事件帶 flag：舞台折進 stage.flags（alarm／missile／epilogue），
// 引擎狀態不碰（state 只有引擎自己的回合）。
import { ENDINGS, BAD_EPILOGUES } from './rules/endings.js';

// 隕石警告（終局回合的第一個事件；trim §C 從飛彈換成隕石，政治風險）：舞台旗標 alarm = 1，天上的光點出現（finale.js script.warning、view 看它）
export const WARNING = { kind: 'warning', flag: { name: 'alarm', value: 1 } };
// 終局回合的事件：警告 → 隕石（outcome = shield／deflect／hit），真結局（唯一正解 2026-10-31：只有賽博）或有收尾的壞結局
// （計畫 17：endings.js BAD_EPILOGUES——大停電、捷運淹水、變異鼠稱王、大巨蛋淹水、攤車被吹走、鮮奶過期）再接 epilogue
export function finaleEvents(ending) {
  const out = [{ ...WARNING, flag: { ...WARNING.flag } }, {   // 每局一個新物件：舞台用 WeakSet 認事件，共用同一個物件時同一個 show 不 reset 連演兩次終局，第二次紅光不出現（最終審稿）
    kind: 'missile', outcome: ending.missile, flag: { name: 'missile', value: ending.missile } }];
  if (ENDINGS[ending.id].kind === 'true' || BAD_EPILOGUES.includes(ending.id)) out.push({ kind: 'epilogue', ending: ending.id, flag: { name: 'epilogue', value: ending.id } });
  return out;
}
export const TITLE_HOLD = 2;   // 終局演完再停幾秒才算結束（設計 §7：不能跳過；reduced-motion 0 秒，show.hold 管）

export function createGame({ spec, engine, endings, ui, show, onFinished, onLevels = () => {} }) {
  // generation：每次 reset 加一。舊回合結束後看到世代不同就什麼都不做（RESET 隨時可按，§4.1）
  let state = engine.createState(spec), finished = false, generation = 0;

  async function pick(id) {
    if (show.busy || finished || state.lv[id] > 0) return false;
    const mine = generation, current = () => mine === generation;
    const play = async (events, opts) => {
      try {
        await show.turn([...events, { kind: 'settle' }], opts);
      } finally {
        // 演完、跳過或出錯都以引擎狀態為準寫一次（被 RESET 掉的就不碰新的一局）
        if (current()) { for (const k of spec.ORDER) if (state.lv[k] > 0) ui.setLevel(k, state.lv[k]); ui.setBusy(false); }
      }
      if (current()) onLevels(state.lv, state.flags, { turnEnd: true });
    };
    const r = engine.place(state, id, spec);
    state = r.state;
    ui.setBusy(true); ui.setPlaced(id);
    await play(r.events);
    if (!current()) return false;
    if (engine.isComplete(state)) {
      // 最後一輪：第 8 個放完後全島再自己長 spec.CLOSING_TURNS 輪（1 輪），最後放的東西也有機會長；照一般回合演（設計 §4）
      for (let i = 0; i < (spec.CLOSING_TURNS ?? 0); i++) {
        const c = engine.advance(state, spec); state = c.state; ui.setBusy(true);
        await play(c.events);
        if (!current()) return false;
      }
      // 終局回合（警告＋隕石＋尾聲；不是引擎回合：沒有 settle、不寫 Lv、不呼叫 onLevels——全島效果由回合末的 world 拍照舞台旗標瞄準，
      // 用引擎旗標再對一次會蓋掉隕石／尾聲的效果）→ 停 TITLE_HOLD 秒 → 結束。RESET 隨時可按：世代不同就什麼都不做
      const ending = endings.resolve(state, spec);
      ui.setBusy(true);
      try {
        await show.turn(finaleEvents(ending), { finale: true });
        if (current()) await show.hold(TITLE_HOLD);
      } finally {
        if (current()) ui.setBusy(false);
      }
      if (!current()) return false;
      finished = true; onFinished(ending, state);
    }
    return true;
  }

  function reset() { generation++; show.abort(); show.reset(); state = engine.createState(spec); finished = false; ui.reset(); }

  return { pick, reset, get state() { return state; }, get finished() { return finished; } };
}
