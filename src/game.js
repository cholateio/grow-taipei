// 遊戲流程：點物品 → 引擎算出這回合的事件 → 演出層演完一整回合 → 物品列寫 Lv → 八個放完就結局。
// 每回合最後補一個 settle 事件（101 跳階、颱風登陸結束）。物品列只在回合結束靜靜寫 Lv.n（§9）；
// 全島效果在回合裡由演出層的 world 拍瞄準，回合結束再以引擎狀態對一次（onLevels）。
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
      // 飛彈倒數：第 8 個放完後全島再自己長幾回合（spec.CLOSING_TURNS），晚放的東西才來得及長大；演成蒙太奇（§4.4）
      for (let i = 0; i < (spec.CLOSING_TURNS ?? 0); i++) {
        const c = engine.advance(state, spec); state = c.state; ui.setBusy(true);
        await play(c.events, { montage: true });
        if (!current()) return false;
      }
      finished = true; onFinished(endings.resolve(state, spec), state);
    }
    return true;
  }

  function reset() { generation++; show.abort(); show.reset(); state = engine.createState(spec); finished = false; ui.reset(); }

  return { pick, reset, get state() { return state; }, get finished() { return finished; } };
}
