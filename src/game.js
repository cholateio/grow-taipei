// 遊戲流程：點物品 → 引擎算出這回合的事件 → 演出層演完一整回合 → 物品列寫 Lv → 八個放完就結局。
// 每回合最後補一個 settle 事件（101 跳階、颱風登陸結束）。物品列只在回合結束靜靜寫 Lv.n（§9）；
// 全島效果在回合裡由演出層的 world 拍瞄準，回合結束再以引擎狀態對一次（onLevels）。
// 最終章（計畫 5，設計 §3、§9）：倒數三回合每回合最前面插一個倒數字事件（countdown，n = 3、2、1）；倒數演完
// 遊戲層把結局算好（endings.resolve），合成終局回合的事件（飛彈、真結局再接尾聲）交給演出層演（finale: true），
// 再停 TITLE_HOLD 秒（不能跳過）才出標題卡（onFinished）。合成事件帶 flag：舞台折進 stage.flags（alarm／missile／epilogue），
// 引擎狀態不碰（state 只有引擎自己的回合）。
import { ENDINGS } from './rules/endings.js';

// 倒數字事件（n = 3、2、1）：舞台旗標 alarm = n（紅光的脈動、宣告看它）
export const countdownEvent = n => ({ kind: 'countdown', n, flag: { name: 'alarm', value: n } });
// 終局回合的事件：飛彈（outcome = shield／deflect／hit），真結局（8 個全 MAX）再接尾聲（ending = cyber／alien）
export function finaleEvents(ending) {
  const out = [{ kind: 'missile', outcome: ending.missile, flag: { name: 'missile', value: ending.missile } }];
  if (ENDINGS[ending.id]?.kind === 'true') out.push({ kind: 'epilogue', ending: ending.id, flag: { name: 'epilogue', value: ending.id } });
  return out;
}
export const TITLE_HOLD = 2;   // 標題卡前停幾秒（設計 §7：不能跳過；reduced-motion 0 秒，show.hold 管）

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
      // 飛彈倒數：第 8 個放完後全島再自己長幾回合（spec.CLOSING_TURNS），晚放的東西才來得及長大；演成蒙太奇（§4.4）。
      // 每回合最前面 101 頭上冒一個倒數字（一回合一個：3 → 2 → 1，設計 §4）
      for (let i = 0; i < (spec.CLOSING_TURNS ?? 0); i++) {
        const c = engine.advance(state, spec); state = c.state; ui.setBusy(true);
        await play([countdownEvent(3 - i), ...c.events], { montage: true });
        if (!current()) return false;
      }
      // 終局回合（不是引擎回合：沒有 settle、不寫 Lv、不呼叫 onLevels——全島效果由回合末的 world 拍照舞台旗標瞄準，
      // 用引擎旗標再對一次會蓋掉飛彈／尾聲的效果）→ 停 TITLE_HOLD 秒 → 標題卡。RESET 隨時可按：世代不同就什麼都不做
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
