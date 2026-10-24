import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
for (const f of ['src/rules/conditions.js','src/rules/spec.js','src/rules/engine.js','src/rules/endings.js']) {
  test(`${f} has no node-only imports`, () => {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /from ['"]node:|require\(|process\./);
  });
}
