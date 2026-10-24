import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORDER, ITEMS } from '../src/rules/spec.js';
import { missile, satisfied, resolve, ENDINGS } from '../src/rules/endings.js';
import { createState, place } from '../src/rules/engine.js';
import * as spec from '../src/rules/spec.js';

const full = (over = {}, flags = {}) => ({ lv: Object.fromEntries(ORDER.map(id => [id, ITEMS[id].max])), age: {}, locked: {}, flags, order: ORDER, turn: 8, ...over });
const lv = (o) => ({ ...Object.fromEntries(ORDER.map(id => [id, 1])), ...o });

test('missile: shield when chip max, deflect only when typhoon is exactly Lv2, else hit', () => {
  assert.equal(missile(full(), spec), 'shield');
  assert.equal(missile({ ...full({ lv: lv({ chip: 4, typhoon: 2 }) }) }, spec), 'deflect');
  assert.equal(missile({ ...full({ lv: lv({ chip: 4, typhoon: 1 }) }) }, spec), 'hit', 'typhoon placed last is still Lv1');
  assert.equal(missile({ ...full({ lv: lv({ chip: 4, typhoon: 3 }) }) }, spec), 'hit');
});
test('all max is always a true ending, branch by ratBranch, extras still listed', () => {
  assert.equal(resolve(full({}, { ratBranch: 'cyber', milkExpired: true }), spec).id, 'cyber');
  assert.deepEqual(resolve(full({}, { ratBranch: 'cyber', milkExpired: true }), spec).extras, ['milkExpired']);
  assert.equal(resolve(full({}, { ratBranch: 'alien' }), spec).id, 'alien');
});
test('bad ending priority follows the table', () => {
  const s = full({ lv: lv({ chip: 2, typhoon: 1 }) }, { blackout: true, flooded: true, bobaSugar: true });
  const r = resolve(s, spec);
  assert.equal(r.id, 'blackout'); assert.equal(r.missile, 'hit');
  assert.deepEqual(r.extras, ['flood', 'shieldDown', 'bobaSugar']);
  assert.deepEqual(satisfied(s, spec), ['blackout', 'flood', 'shieldDown', 'bobaSugar']);
});
test('bobaSugar is a flag, so it holds even though milk is placed at the end', () => {
  const r = resolve(full({ lv: lv({ chip: 5, milk: 4, boba: 3 }) }, { bobaSugar: true }), spec);
  assert.ok(r.extras.includes('bobaSugar') || r.id === 'bobaSugar');
});
test('engine sets bobaSugar when boba maxes while milk is not placed yet', () => {
  // 不寫死順序：找任何一條「鮮奶還沒放、珍奶就升滿」的前綴
  const others = ORDER.filter(id => id !== 'milk');
  const perms = a => a.length ? a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p])) : [[]];
  let found = 0;
  for (const order of perms(others)) {
    let s = createState(spec);
    for (const id of order) { s = place(s, id, spec).state; if (s.lv.boba === ITEMS.boba.max) break; }
    if (s.lv.boba !== ITEMS.boba.max) continue;
    found++; assert.equal(s.lv.milk, 0); assert.equal(s.flags.bobaSugar, true);
  }
  assert.ok(found > 0, 'no order maxes boba before milk');
});
test('deflect games light both typhoonDeflect and shieldDown, title card is the deflect', () => {
  const s = full({ lv: lv({ chip: 4, typhoon: 2 }) });
  assert.deepEqual(satisfied(s, spec), ['typhoonDeflect', 'shieldDown']);
  assert.equal(resolve(s, spec).id, 'typhoonDeflect');
});
test('nothing satisfied and not all max → tryAgain', () => {
  assert.equal(resolve(full({ lv: lv({ chip: 5 }) }), spec).id, 'tryAgain');
});
test('ENDINGS has ten entries with Chinese titles', () => {
  assert.equal(Object.keys(ENDINGS).length, 10);
  assert.equal(ENDINGS.shieldDown.title, '矽盾未就緒'); assert.equal(ENDINGS.cyber.kind, 'true');
});
test('typhoon placed 8th is still Lv1 at the end, so the missile is never deflected', () => {
  const rest = ORDER.filter(id => id !== 'typhoon');
  let s = createState(spec);
  for (const id of [...rest, 'typhoon']) s = place(s, id, spec).state;
  assert.equal(s.lv.typhoon, 1);
  assert.notEqual(missile(s, spec), 'deflect');
});
