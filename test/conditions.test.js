import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/rules/conditions.js';

const ctx = { max: { milk: 4, chip: 5 } };
const S = (lv = {}, age = {}, flags = {}, locked = {}) => ({ lv: { milk: 0, chip: 0, ...lv }, age: { milk: -1, chip: -1, ...age }, flags, locked });

test('present / absent', () => {
  assert.equal(compile({ present: 'milk' }, ctx)(S({ milk: 1 })), true);
  assert.equal(compile({ present: 'milk' }, ctx)(S()), false);
  assert.equal(compile({ absent: 'milk' }, ctx)(S()), true);
});
test('minLevel / maxLevel absolute semantics', () => {
  assert.equal(compile({ minLevel: ['chip', 3] }, ctx)(S({ chip: 3 })), true);
  assert.equal(compile({ minLevel: ['chip', 3] }, ctx)(S({ chip: 2 })), false);
  assert.equal(compile({ maxLevel: ['milk', 1] }, ctx)(S()), true, 'unplaced counts as <= n');
  assert.equal(compile({ maxLevel: ['milk', 1] }, ctx)(S({ milk: 2 })), false);
});
test('ltPlus', () => {
  assert.equal(compile({ ltPlus: ['milk', 'chip', 2] }, ctx)(S({ milk: 1, chip: 0 })), true);
  assert.equal(compile({ ltPlus: ['milk', 'chip', 0] }, ctx)(S({ milk: 1, chip: 1 })), false);
});
test('age requires placed', () => {
  assert.equal(compile({ age: ['milk', 2] }, ctx)(S({ milk: 1 }, { milk: 2 })), true);
  assert.equal(compile({ age: ['milk', 2] }, ctx)(S({ milk: 1 }, { milk: 1 })), false);
  assert.equal(compile({ age: ['milk', 0] }, ctx)(S()), false);
});
test('flag / locked / and / or / not / always', () => {
  assert.equal(compile({ flag: 'blackout' }, ctx)(S({}, {}, { blackout: true })), true);
  assert.equal(compile({ locked: 'milk' }, ctx)(S({}, {}, {}, { milk: true })), true);
  assert.equal(compile({ and: [{ always: true }, { absent: 'milk' }] }, ctx)(S()), true);
  assert.equal(compile({ or: [{ present: 'milk' }, { present: 'chip' }] }, ctx)(S({ chip: 1 })), true);
  assert.equal(compile({ not: { present: 'milk' } }, ctx)(S()), true);
});
test('unknown condition throws', () => {
  assert.throws(() => compile({ nope: 1 }, ctx), /bad cond/);
});
test('flag with is: compares the flag value (ratBranch cyber / alien)', () => {
  assert.equal(compile({ flag: 'ratBranch', is: 'alien' }, ctx)(S({}, {}, { ratBranch: 'alien' })), true);
  assert.equal(compile({ flag: 'ratBranch', is: 'alien' }, ctx)(S({}, {}, { ratBranch: 'cyber' })), false);
  assert.equal(compile({ flag: 'ratBranch', is: 'alien' }, ctx)(S()), false);
});
