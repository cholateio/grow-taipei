// test/visit.test.js：撲空（計畫 6 設計 §5，show/visit.js 的 miss）——無頭 live 演一個 wait 事件，量每段撲空：代表走到對的地方、失望、回日常；
// 沒有泡泡、不換位置、≤ MISS_CAP。拜訪（幫手走來敲門）2026-10-29 回到 GROW 時拿掉了（設計 §4.2），這裡只剩撲空
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { headlessShow, turnSteps, ALL } from './helpers/show.js';

const { frontOf } = await import('../src/actors/anchors.js');
const { B } = await import('../src/show/beats.js');
const { cellAt, NEIGHBORS } = await import('../src/scene/hex.js');
const mod = id => ALL.find(m => m.id === id);

// 撲空（計畫 6 設計 §5，show/visit.js 的 miss）：無頭 live 演一個 wait 事件——照 order 瞬間演完那幾個放置回合（不演最後一輪：
// 回到 GROW 之後最後一輪物品會自己長，等級就不是放完的樣子），再 live 演給的 waits 合成的 wait。每段撲空記下：等待物品的代表（mark 那一刻問模組）、起點、
// 段尾（下一個 mark 那一刻）站在哪、有沒有做 sigh、段裡冒了幾個泡泡、段長（扣掉空拍）、段尾他回日常了沒、劇本手上還有幾個人
const { miss, SIGH, MISS_CAP, MISS_WALK, MISS_CLEAR, MISS_PER_TURN } = await import('../src/show/visit.js');
const { anchorWorld } = await import('../src/actors/anchors.js');
const { inShape } = await import('./helpers/show.js');
async function liveMiss(order, waits, { prep } = {}) {
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  let s = engine.createState(spec);
  for (const step of turnSteps(order).slice(0, order.length)) {
    const r = step(s); s = r.state;
    await run([...r.events, { kind: 'settle' }], { instant: true });
  }
  const e = { kind: 'wait', item: waits[0].item, waits };
  const segs = [], update = show.update;
  let cur = null;
  show.update = (dt, t) => { update(dt, t); if (cur?.rep?.walker?.gesture?.kind === 'sigh') cur.sigh = true; if (cur?.rep) cur.frames.push({ ...cur.rep.pos }); };
  const close = () => { if (!cur) return; cur.end = cur.rep && { ...cur.rep.pos }; cur.mode = cur.rep?.mode; cur.secs = show.elapsed - cur.t - cur.info.gap; cur.bubbles = bubblesLog.length - cur.from; cur = null; };
  let script = null;
  await prep?.(show);   // 測試要的起點（例如把代表挪遠一點）：wait 事件演之前
  await run([e], { onMark: (x, info) => {
    close();
    if (!info?.miss) { script = show.roster.keys().flatMap(k => show.roster.members(k)).filter(m => m.mode === 'script').length; return; }
    const item = mod(info.item), sv = { lv: { ...show.stage.lv }, flags: show.stage.flags }, rep = item.script.rep(sv, { roster: show.roster, nav: show.nav });
    const w = x.waits.find(y => y.item === info.item);
    cur = { w, info, rep, sv, start: rep && { ...rep.pos }, startMode: rep?.mode, t: show.elapsed, from: bubblesLog.length, sigh: false, frames: [] };
    segs.push(cur);
  } });
  close(); show.update = update;
  return { e, segs, script, show, bubbles: bubblesLog };
}
const doorOf = (show, id, sv) => { const sp = mod(id).visitSpot(sv.lv[id], sv); return frontOf(sp, sp.r, show.nav); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 共同的檢查：代表在、做了 sigh、段裡沒有泡泡、≤ MISS_CAP、走的路 ≤ MISS_WALK 秒、沒有換位置（每幀 ≤ 走路速度）、段尾回日常、劇本手上沒人
function common(v, g, what) {
  assert.ok(g.rep && g.startMode === 'home', `${what}: the waiting item has a rep in daily life`);
  assert.ok(g.sigh || !g.rep.walker, `${what}: sighs`);
  assert.equal(g.bubbles, 0, `${what}: no bubble (design §5)`);
  assert.ok(g.secs <= MISS_CAP && g.secs >= SIGH, `${what}: ${g.secs.toFixed(2)} s`);
  const walked = g.frames.reduce((a, p, i) => a + (i ? dist(p, g.frames[i - 1]) : 0), 0);
  assert.ok(walked <= MISS_WALK * g.rep.speed + 0.05, `${what}: walked ${walked.toFixed(2)} m`);
  assert.ok(g.frames.every((p, i) => !i || dist(p, g.frames[i - 1]) <= g.rep.speed / 30 + 1e-6), `${what}: no relocation (misses never blink-jump)`);
  assert.equal(g.mode, 'home', `${what}: back to daily life`);
  assert.equal(v.script, 0, `${what}: nobody left in script mode`);
  assert.equal(v.bubbles.filter(b => b.kind && typeof b.kind === 'object').length, 0, `${what}: no icon bubble`);
}

test('miss live: helper absent → rep walks to a walkable point near the helper anchor (≥ MISS_CLEAR from buildings); sigh; home; ≤ 3 s', async () => {
  // 珍奶先放、捷運站還沒放：老闆走到同一格捷運站錨點旁的空地
  const v = await liveMiss(['boba'], [{ item: 'boba', for: ['token'] }]), [g] = v.segs, what = 'boba<token0';
  assert.equal(v.segs.length, 1); common(v, g, what);
  const at = anchorWorld('token');
  assert.ok(dist(g.end, at) <= 1.2 + 0.1, `${what}: ends ${dist(g.end, at).toFixed(2)} from the token anchor`);
  assert.ok(dist(g.end, g.start) > 0.3, `${what}: walked over (${dist(g.end, g.start).toFixed(2)})`);
  assert.ok(dist(g.end, doorOf(v.show, 'boba', g.sv)) > 1, `${what}: not its own door`);
  const fps = v.show.stage.footprints();
  for (let k = 0; k < 24; k++) { const a = 2 * Math.PI * k / 24, x = g.end.x + (MISS_CLEAR - 0.01) * Math.sin(a), z = g.end.z + (MISS_CLEAR - 0.01) * Math.cos(a); assert.ok(!fps.some(f => inShape(f, x, z)), `${what}: ≥ ${MISS_CLEAR} from buildings`); }
  assert.ok(v.show.nav.walkable(g.end.x, g.end.z));
});

test('miss live: helper placed but too low → rep walks to frontOf(its visitSpot); sigh; home; ≤ 3 s', async () => {
  // 捷運站 Lv1、珍奶 Lv1：老闆走到捷運站這一級的拜訪點正面（同一格）
  const v = await liveMiss(['token', 'boba'], [{ item: 'boba', for: ['token'] }]), [g] = v.segs, what = 'boba<token1';
  common(v, g, what);
  const to = doorOf(v.show, 'token', g.sv);
  assert.ok(dist(g.end, to) < 0.15, `${what}: ends ${dist(g.end, to).toFixed(2)} from the token visit stand`);
  assert.ok(dist(g.end, doorOf(v.show, 'boba', g.sv)) > 1 && dist(g.end, anchorWorld('token')) > 0.3, `${what}: not its own door, not the empty-lot point`);
});

test('miss live: too far → own door (helper not adjacent; adjacent but over MISS_WALK); door further than MISS_WALK → walks MISS_WALK toward it; ≤ 2 segments in ORDER', async () => {
  // 回到 GROW（2026-10-29）之後這幾種等待在真的局裡已經不會發生（只剩 8 條阻擋），改成放完那幾個物品後合成 waits（同上面兩個測試）：
  // 撲空走哪一支只看兩邊的格子與路線，跟等待從哪條規則來無關。
  // 代幣 Lv3、珍奶 Lv2，waits [鮮奶 < 棒球, 代幣 < 鮮奶, 珍奶 < 代幣]：鮮奶還沒放（沒有代表，不佔位子，最終審稿 3），演代幣、珍奶兩段；
  // 代幣在 [0,1]、鮮奶在 [-1,0]，不相鄰：站務員走回自己的站門口
  const v = await liveMiss(['token', 'boba'], [{ item: 'milk', for: ['baseball'] }, { item: 'token', for: ['milk'] }, { item: 'boba', for: ['token'] }]);
  const want = v.e.waits.filter(w => mod(w.item).script.hasRep(v.show.stage.lv[w.item])).slice(0, MISS_PER_TURN).map(w => w.item);
  assert.deepEqual(want, ['token', 'boba'], 'precondition: milk has nobody to send');
  assert.deepEqual(v.segs.map(g => g.w.item), want, 'the first two waits with a rep, in ORDER');
  const t = v.segs.find(g => g.w.item === 'token');
  common(v, t, 'token<milk'); assert.ok(dist(t.end, doorOf(v.show, 'token', t.sv)) < 0.15, `token<milk: at its own door (${dist(t.end, doorOf(v.show, 'token', t.sv)).toFixed(2)})`);
  // 燈泡 Lv3、晶片 Lv2：晶片 < 燈泡（相鄰格），工程師走過去超過 MISS_WALK 秒 → 回自己門口
  const n = await liveMiss(['bulb', 'chip'], [{ item: 'chip', for: ['bulb'] }]), c = n.segs.find(g => g.w.item === 'chip');
  common(n, c, 'chip<bulb3');
  const sp = mod('bulb').visitSpot(c.sv.lv.bulb, c.sv), far = n.show.nav.routeLength(n.show.nav.route(c.start, frontOf(sp, sp.r, n.show.nav)));
  // 前提：燈泡的拜訪點那一格跟工程師站的那一格相鄰（不是「不相鄰所以回門口」那一支）
  const [cq, cr] = cellAt(c.start.x, c.start.z), [bq, br] = cellAt(sp.x, sp.z);
  assert.ok(NEIGHBORS.some(([dq, dr]) => cq + dq === bq && cr + dr === br), `chip<bulb3: the engineer's cell [${cq},${cr}] is next to the bulb's [${bq},${br}]`);
  assert.ok(far > MISS_WALK * c.rep.speed, `chip<bulb3: the bulb is ${far.toFixed(2)} m away`);
  assert.ok(dist(c.end, doorOf(n.show, 'chip', c.sv)) < 0.15, `chip<bulb3: at its own door`);
  // 晶片 Lv3、燈泡 Lv2：燈泡 < 晶片，電工散步到很遠，自己門口也超過 MISS_WALK 秒：往門口走 MISS_WALK 秒、在路上失望（不換位置）。
  // 前面的回合瞬間演完時電工站在固定的地方，離門口不到 MISS_WALK 秒——live 的局裡他常散步得更遠；這裡把他放到自己巡路（bulb.ROAD）上
  // 一個走到門口要 MISS_WALK 秒再多 0.3–2 m 的點（日常裡本來就走得到；前後 2 m 都在主島格上：焦點裡他會沿路走，代表要站在主島格上才叫得到）讓前提成立
  const away = async show => {
    const { ROAD } = await import('../src/actors/bulb.js'), { createPathCursor } = await import('../src/scene/path.js');
    const sv = { lv: show.stage.lv, flags: show.stage.flags }, m = mod('bulb').script.rep(sv, { roster: show.roster, nav: show.nav }), door = doorOf(show, 'bulb', sv), nav = show.nav;
    const cap = MISS_WALK * m.speed, len = p => { const r = nav.route(p, door); return dist(r.at(-1), door) < 0.3 ? nav.routeLength(r) : Infinity; };
    const at = s => createPathCursor(ROAD, { s }).locate(), total = createPathCursor(ROAD).total;
    for (let s = 0; s < total; s += 0.1) {
      const p = at(s), l = len(p);
      if (!(l > cap + 0.3 && l < cap + 2) || ![-2, -1, 0, 1, 2].every(k => cellAt(at((s + k + total) % total).x, at((s + k + total) % total).z))) continue;
      show.roster.claim(m); show.roster.setPose(m, { ...p, walking: false }); show.roster.home(m); return;   // 放回日常：從這一點接著巡路
    }
    throw new Error('no point on the road far enough from the door');
  };
  const d = await liveMiss(['chip', 'bulb'], [{ item: 'bulb', for: ['chip'] }], { prep: away }), b = d.segs.find(g => g.w.item === 'bulb');
  common(d, b, 'bulb<chip3');
  const door = doorOf(d.show, 'bulb', b.sv), len = d.show.nav.routeLength(d.show.nav.route(b.start, door));
  assert.ok(len > MISS_WALK * b.rep.speed, `bulb<chip3: precondition — the door is ${len.toFixed(2)} m away (> ${(MISS_WALK * b.rep.speed).toFixed(2)})`);
  assert.ok(dist(b.end, door) < dist(b.start, door) - 1, `bulb<chip3: walked toward its door (${dist(b.start, door).toFixed(2)} → ${dist(b.end, door).toFixed(2)})`);
});

test('miss: nobody to send (no rep function, typhoon, busy rep) → no beats or every beat skipped', async () => {
  assert.deepEqual(miss({ item: 'typhoon', for: ['bulb'] }, { lv: {}, flags: {} }, { B }, { item: mod('typhoon'), helper: mod('bulb') }), []);
  assert.deepEqual(miss({ item: 'chip', for: ['bulb'] }, { lv: {}, flags: {} }, { B }, { item: null, helper: mod('bulb') }), []);
  // 代表正被別的劇本拿著：整段 0 秒，他不動
  const v = await liveMiss(['token', 'boba'], [{ item: 'boba', for: ['token'] }]);
  const busy = await (async () => {
    const h = await headlessShow(); let s = engine.createState(spec);
    for (const id of ['token', 'boba']) { const r = engine.place(s, id, spec); s = r.state; await h.run([...r.events, { kind: 'settle' }], { instant: true }); }
    const sv = { lv: h.show.stage.lv, flags: h.show.stage.flags }, rep = mod('boba').script.rep(sv, { roster: h.show.roster, nav: h.show.nav });
    h.show.roster.claim(rep); const at = { ...rep.pos }, marks = [];
    // 段尾（wait 事件自己的 mark）那一刻他站在哪：回合收尾放回日常之後，旁邊的人推他一下不算撲空動了他（回到 GROW：捷運站 Lv3 的人就站在旁邊）
    await h.run([{ kind: 'wait', item: 'boba', waits: [{ item: 'boba', for: ['token'] }] }], { onMark: (x, info) => marks.push([info, h.show.elapsed, { ...rep.pos }, rep.mode]) });
    return { at, rep, marks };
  })();
  assert.ok(v.segs[0].secs > SIGH, 'with the rep free the miss plays');
  assert.ok(busy.marks[0][0].miss && busy.marks[1][1] - busy.marks[0][1] < 0.05, 'busy rep: the miss collapses to 0 s');
  assert.ok(dist(busy.marks[1][2], busy.at) < 1e-9 && busy.marks[1][3] === 'script', 'the busy rep stays put, still in his script');
});
