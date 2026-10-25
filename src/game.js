// 遊戲流程：點物品 → 引擎算出這回合的事件 → 導演一個一個演 → 物品列同步 Lv → 八個放完就結局。
export function createGame({ spec, engine, endings, ui, director, actors, onFinished, onLevels = () => {} }) {
  // generation：每次 reset 加一。舊演出的回呼看到世代不同就什麼都不做（RESET 隨時可按，§4.1）
  let state = engine.createState(spec), finished = false, generation = 0;

  const syncLevel = e => {
    if (e.delta) ui.setLevel(e.delta.target, e.delta.to);
    else if (e.to) ui.setLevel(e.item, e.to);
  };

  async function pick(id) {
    if (director.busy || finished || state.lv[id] > 0) return false;
    const { state: next, events } = engine.place(state, id, spec);
    state = next;
    const mine = generation, current = () => mine === generation;
    ui.setBusy(true); ui.setPlaced(id);
    const show = async evs => {
      try {
        await director.play(evs, async (e, opts) => { if (!current()) return; await actors.apply(e, opts); if (current()) syncLevel(e); });
      } finally {
        // 演出可能被跳過或中斷：最後以引擎狀態為準再對一次（被 RESET 掉的就不碰新的一局）
        if (current()) { for (const k of spec.ORDER) if (state.lv[k] > 0) ui.setLevel(k, state.lv[k]); ui.setBusy(false); }
      }
      if (current()) onLevels(state.lv, state.flags);
    };
    await show(events);
    if (!current()) return false;
    if (engine.isComplete(state)) {
      // 飛彈倒數：第 8 個放完後全島再自己長幾回合（spec.CLOSING_TURNS），晚放的東西才來得及長大
      for (let i = 0; i < (spec.CLOSING_TURNS ?? 0); i++) {
        const r = engine.advance(state, spec); state = r.state; ui.setBusy(true);
        await show(r.events);
        if (!current()) return false;
      }
      finished = true; onFinished(endings.resolve(state, spec), state);
    }
    return true;
  }

  function reset() { generation++; director.abort?.(); state = engine.createState(spec); finished = false; ui.reset(); actors.reset(); }

  return { pick, reset, get state() { return state; }, get finished() { return finished; } };
}
