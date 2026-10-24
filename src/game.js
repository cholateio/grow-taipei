// 遊戲流程：點物品 → 引擎算出這回合的事件 → 導演一個一個演 → 物品列同步 Lv → 八個放完就結局。
export function createGame({ spec, engine, endings, ui, director, actors, onFinished, onLevels = () => {} }) {
  let state = engine.createState(spec), finished = false;

  const syncLevel = e => {
    if (e.delta) ui.setLevel(e.delta.target, e.delta.to);
    else if (e.to) ui.setLevel(e.item, e.to);
  };

  async function pick(id) {
    if (director.busy || finished || state.lv[id] > 0) return false;
    const { state: next, events } = engine.place(state, id, spec);
    state = next;
    ui.setBusy(true); ui.setPlaced(id);
    try {
      await director.play(events, async (e, opts) => { await actors.apply(e, opts); syncLevel(e); });
    } finally {
      // 演出可能被跳過或中斷：最後以引擎狀態為準再對一次
      for (const k of spec.ORDER) if (state.lv[k] > 0) ui.setLevel(k, state.lv[k]);
      ui.setBusy(false);
    }
    onLevels(state.lv);
    if (engine.isComplete(state)) { finished = true; onFinished(endings.resolve(state, spec), state); }
    return true;
  }

  function reset() { state = engine.createState(spec); finished = false; ui.reset(); actors.reset(); }

  return { pick, reset, get state() { return state; }, get finished() { return finished; } };
}
