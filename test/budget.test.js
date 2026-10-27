// test/budget.test.js：人數預算（使用者要求，計畫 4 任務 12、裁決 R16）——兩條正解整局 live 演完，每回合演完那一刻、再放 5 秒日常之後，
// 露出來的名冊成員（所有名冊；老鼠不算，牠們很小）全島 ≤ 30、任何一格主島格 ≤ 8。
// 最終章（計畫 5 任務 8）：倒數回合照 game.js 演（closingEvents，最前面是倒數字；倒數 3 全島抬頭看紅光），倒數演完再演終局回合
// （finaleStep：飛彈＋尾聲）多一個點——賽博尾聲的十隻機器鼠站在黑塔屋頂上（rat.pack，本來就不算人）。
// 「全島」＝主島七格（計畫的「全島同時可見」；離島——風車、燈塔、遊樂場、森林——上的人另外印出來，不算進 30）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import { createState } from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { cellAt, SPACING, R } from '../src/scene/hex.js';
import { headlessShow, turnSteps, closingEvents } from './helpers/show.js';
import { finaleStep } from './helpers/endings.js';

const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);
const TOTAL_MAX = 30, CELL_MAX = 8, SMALL = ['rat.pack'];
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

test('people budget: every turn end of both solutions, the finale turn included (and 5 s later), shows ≤ 30 roster members, ≤ 8 in any main cell (rats excluded)', async () => {
  const bad = [], peak = { total: 0, cell: 0, away: 0 };
  for (const order of SOLUTIONS) {
    const { show, run } = await headlessShow();
    let s = createState(spec), t = 1000;
    // 每一回合：放置、倒數（montage）、最後的終局回合（finale）
    const turns = [...turnSteps(order).map((step, i) => async () => {
      const r = step(s), montage = i >= order.length; s = r.state;
      await run(montage ? closingEvents(i - order.length, r.events) : [...r.events, { kind: 'settle' }], { montage });
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
          if (keys.length > CELL_MAX) bad.push(`${what}: ${keys.length} in cell ${cell} (${keys.join(' ')})`);
        }
      }
    }
  }
  console.log(`people budget peak: ${peak.total} on the main island, ${peak.cell} in one cell (${peak.away} on the satellites)`);
  assert.deepEqual(bad, [], `peak ${peak.total} on the main island, ${peak.cell} in one cell (${peak.away} on the satellites)`);
});
