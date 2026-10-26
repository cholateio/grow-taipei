// test/budget.test.js：人數預算（使用者要求，計畫 4 任務 12、裁決 R16）——兩條正解整局 live 演完，每回合演完那一刻、再放 5 秒日常之後，
// 露出來的名冊成員（所有名冊；老鼠不算，牠們很小）全島 ≤ 30、任何一格主島格 ≤ 8。
// 「全島」＝主島七格（計畫的「全島同時可見」；離島——風車、燈塔、遊樂場、森林——上的人另外印出來，不算進 30）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import { createState } from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { cellAt, SPACING, R } from '../src/scene/hex.js';
import { headlessShow, turnSteps } from './helpers/show.js';

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

test('people budget: every turn end of both solutions (and 5 s later) shows ≤ 30 roster members, ≤ 8 in any main cell (rats excluded)', async () => {
  const bad = [], peak = { total: 0, cell: 0, away: 0 };
  for (const order of SOLUTIONS) {
    const { show, run } = await headlessShow();
    let s = createState(spec), t = 1000;
    for (const [i, step] of turnSteps(order).entries()) {
      const r = step(s); s = r.state;
      await run([...r.events, { kind: 'settle' }], { montage: i >= order.length });
      for (const when of ['end', '+5 s']) {
        if (when === '+5 s') for (let f = 0; f < 150; f++) { show.update(1 / 30, t); t += 1 / 30; }
        const c = census(show.roster), what = `${order.join('>')} turn ${i + 1} ${when}`;
        peak.total = Math.max(peak.total, c.total); peak.away = Math.max(peak.away, c.away);
        if (c.total > TOTAL_MAX) bad.push(`${what}: ${c.total} on the island`);
        for (const [cell, keys] of Object.entries(c.cells)) {
          peak.cell = Math.max(peak.cell, keys.length);
          if (keys.length > CELL_MAX) bad.push(`${what}: ${keys.length} in cell ${cell} (${keys.join(' ')})`);
        }
      }
    }
  }
  assert.deepEqual(bad, [], `peak ${peak.total} on the main island, ${peak.cell} in one cell (${peak.away} on the satellites)`);
});
