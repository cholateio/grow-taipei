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
    try {
      await director.play(events, async (e, opts) => { if (!current()) return; await actors.apply(e, opts); if (current()) syncLevel(e); });
    } finally {
      // 演出可能被跳過或中斷：最後以引擎狀態為準再對一次（被 RESET 掉的就不碰新的一局）
      if (current()) { for (const k of spec.ORDER) if (state.lv[k] > 0) ui.setLevel(k, state.lv[k]); ui.setBusy(false); }
    }
    if (!current()) return false;
    onLevels(state.lv);
    if (engine.isComplete(state)) { finished = true; onFinished(endings.resolve(state, spec), state); }
    return true;
  }

  function reset() { generation++; director.abort?.(); state = engine.createState(spec); finished = false; ui.reset(); actors.reset(); }

  return { pick, reset, get state() { return state; }, get finished() { return finished; } };
}
