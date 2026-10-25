import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidates, score, tighten } from '../src/solver/tighten.js';
import { check, enumerate } from '../src/solver/run.js';
import * as spec from '../src/rules/spec.js';

test('candidates only touch up[] and never the typhoon skeleton actions', () => {
  const c = candidates(spec);
  assert.ok(c.length > 100);
  assert.ok(c.every(x => x.level >= 2 && x.level <= spec.ITEMS[x.item].max && x.cond));
});
test('score is 0 iff check passes', () => {
  const s = score(spec); const ok = check(enumerate(spec), spec).ok;
  assert.equal(s === 0, ok);
});
test('tighten never increases score and returns a spec that still compiles', { timeout: 600000 }, () => {
  const before = score(spec);
  const r = tighten(spec, { maxSteps: 3, candidateLimit: 20 });
  assert.ok(r.finalScore <= before);
  assert.doesNotThrow(() => enumerate(r.spec));
});
test('tighten reduces a loose spec toward two full solutions', { timeout: 600000 }, () => {
  // 寬鬆版：放下就一路升到滿，颱風骨架照舊
  const loose = { ...spec, ITEMS: structuredClone(spec.ITEMS) };
  for (const id of spec.ORDER) for (let n = 2; n <= loose.ITEMS[id].max; n++) loose.ITEMS[id].up[n] = { always: true };
  const before = score(loose);
  const r = tighten(loose, { maxSteps: 2 });
  assert.ok(r.finalScore < before, `score ${before} → ${r.finalScore}`);
  assert.equal(r.applied.length > 0, true);
});
test('score heavily penalizes specs where one true ending has no solution at all', () => {
  const allCyber = { ...spec, ITEMS: structuredClone(spec.ITEMS) };
  allCyber.ITEMS.rat.onLevel[4] = [{ branch: { flag: 'ratBranch', when: { always: true }, then: 'cyber', else: 'cyber' } }];
  // 同一份規則只差在分岔永遠走賽博龐克：差距必須來自懲罰本身
  const d = score(allCyber) - score(spec);
  assert.ok(d >= 5000, `penalty only ${d}`);
});
test('tighten honours a candidate filter (only levels ≥ 3 get clauses)', { timeout: 600000 }, () => {
  const loose = { ...spec, ITEMS: structuredClone(spec.ITEMS) };
  for (const id of spec.ORDER) for (let n = 2; n <= loose.ITEMS[id].max; n++) loose.ITEMS[id].up[n] = { always: true };
  const seen = new Set();
  const r = tighten(loose, { maxSteps: 1, shortlistSize: 3, filter: c => { seen.add(c.level); return c.level >= 3; } });
  assert.ok(seen.has(2), 'filter saw level-2 candidates'); assert.ok(r.applied.every(c => c.level >= 3));
});
