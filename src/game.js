// 遊戲流程：點物品 → 引擎算出這回合的事件 → 導演一個一個演 → 物品列同步 Lv → 八個放完就結局。
// 每回合最後補一個 settle 事件（101 跳階、颱風登陸結束）；每個事件當下回報全島狀態給 onLevels（光線、小人、雨）。
export function createGame({ spec, engine, endings, ui, director, actors, onFinished, onLevels = () => {} }) {
  // generation：每次 reset 加一。舊演出的回呼看到世代不同就什麼都不做（RESET 隨時可按，§4.1）
  let state = engine.createState(spec), finished = false, generation = 0;

  const syncLevel = e => {
    if (e.delta) ui.setLevel(e.delta.target, e.delta.to);
    else if (e.to) ui.setLevel(e.item, e.to);
  };

  async function pick(id) {
    if (director.busy || finished || state.lv[id] > 0) return false;
    const start = state, { state: next, events } = engine.place(state, id, spec);
    state = next;
    const mine = generation, current = () => mine === generation;
    ui.setBusy(true); ui.setPlaced(id);
    const show = async (from, evs) => {
      let seen = { lv: from.lv, flags: from.flags };
      try {
        await director.play([...evs, { kind: 'settle' }], async (e, opts) => {
          if (!current()) return false;
          // 物品先從框裡飛到島上（§4.1），落地才彈出
          if (e.kind === 'placed' && !opts.instant) { await ui.fly?.(e.item); if (!current()) return false; }
          // 物品列的 Lv 和全島效果跟彈出同一刻，不等動畫演完
          const shown = actors.apply(e, opts);
          seen = engine.foldEvent(seen, e); syncLevel(e); onLevels(seen.lv, seen.flags, { instant: opts.instant, event: e });
          return shown;
        });
      } finally {
        // 演出可能被跳過或中斷：最後以引擎狀態為準再對一次（被 RESET 掉的就不碰新的一局）
        if (current()) { for (const k of spec.ORDER) if (state.lv[k] > 0) ui.setLevel(k, state.lv[k]); ui.setBusy(false); }
      }
      if (current()) onLevels(state.lv, state.flags, { turnEnd: true });
    };
    await show(start, events);
    if (!current()) return false;
    if (engine.isComplete(state)) {
      // 飛彈倒數：第 8 個放完後全島再自己長幾回合（spec.CLOSING_TURNS），晚放的東西才來得及長大
      for (let i = 0; i < (spec.CLOSING_TURNS ?? 0); i++) {
        const before = state, r = engine.advance(state, spec); state = r.state; ui.setBusy(true);
        await show(before, r.events);
        if (!current()) return false;
      }
      finished = true; onFinished(endings.resolve(state, spec), state);
    }
    return true;
  }

  function reset() { generation++; director.abort?.(); state = engine.createState(spec); finished = false; ui.reset(); actors.reset(); }

  return { pick, reset, get state() { return state; }, get finished() { return finished; } };
}
