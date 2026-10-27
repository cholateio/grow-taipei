// test/finale.test.js：最終章（計畫 5）——倒數回合的趕工地點、宣告、飛彈、尾聲
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import { createState } from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { cellAt } from '../src/scene/hex.js';
import { frontOf } from '../src/actors/anchors.js';
import { headlessShow, turnSteps, closingEvents, ALL } from './helpers/show.js';

const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);
const RUSH = ['milk', 'chip', 'bulb', 'token', 'boba', 'baseball'];
const FRONT_TOL = 0.6;

// 趕工（設計 §5）：hero 走到 frontOf(site, r, nav)——請求的站位要在走路格上（nearestWalkable 拉回來不超過 0.6），site 本身在主島上。
// 查的時機是演到那個 grow 之前（走路與揮鋤頭都在 apply 之前）：照兩條正解一回合一回合瞬間演，每個 grow 先查再演
test('every rushSite point of both solutions lies on the main island and its frontOf(site, r, nav) is walkable (within 0.6 of the request)', async () => {
  for (const id of RUSH) assert.equal(typeof ALL.find(m => m.id === id).rushSite, 'function', `${id} has rushSite`);
  const bad = [], seen = new Set();
  for (const order of SOLUTIONS) {
    const { show, run } = await headlessShow();
    let s = createState(spec);
    for (const [i, step] of turnSteps(order).entries()) {
      const r = step(s); s = r.state;
      const events = i >= order.length ? closingEvents(i - order.length, r.events) : [...r.events, { kind: 'settle' }];
      for (const e of events) {
        const mod = e.kind === 'grow' && ALL.find(m => m.id === e.item);
        const site = mod?.rushSite?.(e.to, { lv: { ...show.stage.lv, [e.item]: e.to }, flags: show.stage.flags });
        if (site) {
          const what = `${order.join('>')} ${e.item} Lv${e.to}`, req = frontOf(site, site.r), got = show.nav.nearestWalkable(req), d = Math.hypot(got.x - req.x, got.z - req.z);
          seen.add(`${e.item} ${e.to}`);
          if (!cellAt(site.x, site.z)) bad.push(`${what}: site (${site.x.toFixed(2)}, ${site.z.toFixed(2)}) off the main island`);
          if (!Number.isFinite(site.y) || !(site.r > 0)) bad.push(`${what}: site needs y and r > 0`);
          if (d > FRONT_TOL) bad.push(`${what}: frontOf pulled ${d.toFixed(2)} > ${FRONT_TOL}`);
        }
        await run([e], { instant: true });
      }
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(seen.size >= 10, `rush sites checked: ${[...seen].join(', ')}`);
});
