// test/budget.test.js：人數預算（使用者要求，計畫 4 任務 12、裁決 R16）——唯一正解整局 live 演完，每回合演完那一刻、再放 5 秒日常之後，
// 露出來的名冊成員（所有名冊；老鼠不算，牠們很小）全島 ≤ 30、任何一格主島格 ≤ 8。
// 最終章（計畫 5 任務 8；選擇帶動升級改版）：最後一輪照一般回合演，之後演終局回合
// （finaleStep：警告——全島抬頭看紅光——＋飛彈＋尾聲）多一個點——賽博尾聲的十隻機器鼠站在黑塔屋頂上（rat.pack，本來就不算人）。
// 「全島」＝主島七格（計畫的「全島同時可見」；離島——風車、燈塔、遊樂場、森林——上的人另外印出來，不算進 30）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import { createState } from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { cellAt, SPACING, R } from '../src/scene/hex.js';
import { headlessShow, turnSteps, gameInvariants } from './helpers/show.js';
import { cellOf } from '../src/actors/anchors.js';
import { finaleStep, EXAMPLE } from './helpers/endings.js';

const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);
const TOTAL_MAX = 30, CELL_MAX = 8, SMALL = ['rat.pack'];
// 每格上限的例外（Task 6a 修正輪，控制者裁決）：球場格（巨蛋，最大的一格）11——棒球 Lv5 起、鮮奶 ≥6 時球員 2＋少棒隊小孩 3＋觀眾 4＋草皮觀眾 1
// 是刻意的場面（回到 GROW 之後正解第 5 回合正是這樣），再留一個路過的人；其他格照舊 8，不是整體放寬
// 11 是當時（還有外星正解）量到的最高（外星第 5 回合結束那一刻：這 10 人＋路過的電工）；外星 2026-10-31 改成壞結局之後，
// 唯一正解實測最高 9（第 5 回合：球員 2＋小孩 2＋觀眾 4＋草皮 1），上限照舊 11 沒放寬也沒收緊
const CELL_MAX_AT = { [String(cellOf('baseball'))]: 11 }, cellMax = cell => CELL_MAX_AT[cell] ?? CELL_MAX;
const MAIN_REACH = Math.sqrt(3) * SPACING + R;   // 主島最外圈格子的外緣：橋上的人算主島，再外面是離島

// 露出來的成員：{ total：主島上（格子裡或橋上）, away：離島上, cells: { 'q,r': [名冊鍵…] } }
function census(roster) {
  const out = { total: 0, away: 0, cells: {} };
  for (const k of roster.keys()) {
    if (SMALL.includes(k)) continue;
    for (const m of roster.members(k)) {
      if (m.hidden) continue;
      const c = cellAt(m.pos.x, m.pos.z);
      if (c) (out.cells[String(c)] ??= []).push(k);
      if (c || Math.hypot(m.pos.x, m.pos.z) < MAIN_REACH) out.total++; else out.away++;
    }
  }
  return out;
}

test('people budget: every turn end of the solution, the finale turn included (and 5 s later), shows ≤ 30 roster members, ≤ 8 in any main cell, ≤ 11 in the dome cell (rats excluded)', async () => {
  const bad = [], peak = { total: 0, cell: 0, away: 0 }, pops = [];
  for (const order of SOLUTIONS) {
    const { show, run } = await headlessShow(), inv = gameInvariants(show);   // 同一趟也查換位置一定閃白（裁決 R3）
    let s = createState(spec), t = 1000;
    // 每一回合：放置、最後一輪、最後的終局回合（finale：警告＋飛彈＋尾聲）
    const turns = [...turnSteps(order).map((step, i) => async () => {
      const r = step(s); s = r.state;
      await run([...r.events, { kind: 'settle' }]);   // 最後一輪照一般回合演（同 game.js）
      return `turn ${i + 1}`;
    }), async () => { await run(finaleStep(s).events, { finale: true }); return 'finale'; }];
    for (const play of turns) {
      const turn = await play();
      for (const when of ['end', '+5 s']) {
        if (when === '+5 s') for (let f = 0; f < 150; f++) { show.update(1 / 30, t); t += 1 / 30; }
        const c = census(show.roster), what = `${order.join('>')} ${turn} ${when}`;
        peak.total = Math.max(peak.total, c.total); peak.away = Math.max(peak.away, c.away);
        if (c.total > TOTAL_MAX) bad.push(`${what}: ${c.total} on the island`);
        for (const [cell, keys] of Object.entries(c.cells)) {
          peak.cell = Math.max(peak.cell, keys.length);
          if (keys.length > cellMax(cell)) bad.push(`${what}: ${keys.length} in cell ${cell} (${keys.join(' ')})`);
        }
      }
    }
    pops.push(...inv.pops);
  }
  console.log(`people budget peak: ${peak.total} on the main island, ${peak.cell} in one cell (${peak.away} on the satellites)`);
  assert.deepEqual(bad, [], `peak ${peak.total} on the main island, ${peak.cell} in one cell (${peak.away} on the satellites)`);
  assert.deepEqual(pops.slice(0, 20), [], `${pops.length} silent relocations`);
});

// 裁決 R3：兩局固定的壞結局（EXAMPLE.hit／deflect，亂放：拜訪少、等待多）整局 live 演完（放置、最後一輪、終局回合），
// 劇本手上與拜訪完正走回去的人換位置一定閃白（gameInvariants 的 pops）
test('EXAMPLE.hit and EXAMPLE.deflect live through the finale: no scripted member relocates without a blink', async () => {
  for (const outcome of ['hit', 'deflect']) {
    const { show, run } = await headlessShow(), inv = gameInvariants(show), order = EXAMPLE[outcome];
    let s = createState(spec);
    for (const [i, step] of turnSteps(order).entries()) { const r = step(s); s = r.state; inv.label(`${outcome} turn ${i + 1}`); await run([...r.events, { kind: 'settle' }]); }
    inv.label(`${outcome} finale`);
    await run(finaleStep(s).events, { finale: true });
    assert.deepEqual([...inv.pops].slice(0, 20), [], `${outcome}: ${inv.pops.size} silent relocations`);
  }
});
