// test/visit.test.js：拜訪（計畫 6 設計 §4，show/visit.js）——無頭 live 演一個有原因的升級（拜訪 + 那一級的劇本），
// 量拜訪那一段：幫手的代表走到被升級物品拜訪點的鏡頭側（frontOf(visitSpot, r, nav)；遠的原處閃白、換到路上離站位 VISIT_WALK 秒的那一點閃白、走滿 VISIT_WALK 秒，裁決 R3）、敲門、
// 被升級物品的代表（在場的話）揮手、♥、兩人回日常；整段 ≤ VISIT_CAP；代表不在、正被別的劇本拿著時整段只剩平移。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as spec from '../src/rules/spec.js';
import * as engine from '../src/rules/engine.js';
import { enumerate, stats } from '../src/solver/run.js';
import { headlessShow, turnSteps, ALL } from './helpers/show.js';

const { visit, VISIT_WALK, VISIT_KNOCK, VISIT_LOVE, VISIT_CAP, VISIT_MAX_PER_HELPER } = await import('../src/show/visit.js');
const { frontOf } = await import('../src/actors/anchors.js');
const { FOCUS_BEAT, B } = await import('../src/show/beats.js');
const { BLINK } = await import('../src/show/blink.js');
const { cellAt, NEIGHBORS } = await import('../src/scene/hex.js');
const SOLUTIONS = stats(enumerate(spec), spec).full.map(r => r.order);
const mod = id => ALL.find(m => m.id === id);
const same = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];

// 照 order 放到 pick 那個 grow 所在的回合：之前的回合、這回合它前面的事件都瞬間演完，再 live 單獨演它（拜訪 + 劇本）。
// prepare(h, e, rep)：live 演之前動手腳（把代表交給別的劇本）。每幀記下幫手代表、被升級物品代表的狀態；回傳量到的東西
async function liveVisit(order, pick, { prepare } = {}) {
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  let s = engine.createState(spec);
  for (const step of turnSteps(order)) {
    const r = step(s); s = r.state;
    const i = r.events.findIndex(pick);
    if (i < 0) { await run([...r.events, { kind: 'settle' }], { instant: true }); continue; }
    for (const x of r.events.slice(0, i)) await run([x], { instant: true });
    const e = r.events[i], helper = mod(e.via[0]), target = mod(e.item);
    const ctx = { roster: show.roster, nav: show.nav }, sv = { lv: { ...show.stage.lv, [e.item]: e.to }, flags: show.stage.flags };
    const rep = helper.script.rep(sv, ctx), host = target.script.rep?.(sv, ctx) ?? null, spot = target.visitSpot(e.to, sv);
    const stand = frontOf(spot, spot.r, show.nav), cell = cellAt(spot.x, spot.z);
    prepare?.(h, e, rep);
    const out = { e, rep, host, spot, stand, cell, start: rep && { ...rep.pos }, marks: [], frames: [], after: [], knock: false, wave: false, from: bubblesLog.length };
    const update = show.update;
    show.update = (dt, t) => {
      update(dt, t);
      if (!out.marks.length || !rep) return;
      const f = { t: show.elapsed, pos: { ...rep.pos }, mode: rep.mode, blink: show.blink.has(rep.walker ?? rep.holder) };
      if (out.marks.length > 1) { out.after.push(f); return; }   // 劇本的 mark 之後：幫手走回去的那一段（'away'）
      out.frames.push(f);   // 拜訪段（拜訪的 mark 之後、劇本的 mark 之前）
      if (rep.walker?.gesture?.kind === 'knock') out.knock = true;
      if (host?.walker?.gesture?.kind === 'wave' || host?.waving) out.wave = true;
    };
    await run([e], { onMark: (x, info) => out.marks.push({ info, t: show.elapsed, bubbles: bubblesLog.length, rep: rep && { mode: rep.mode }, host: host && { mode: host.mode }, script: show.roster.keys().flatMap(k => show.roster.members(k)).filter(m => m.mode === 'script').length }) });
    show.update = update;
    out.hearts = bubblesLog.slice(out.marks[0]?.bubbles ?? out.from, out.marks[1]?.bubbles).filter(b => b.kind === '♥');
    out.secs = out.marks.length > 1 ? out.marks[1].t - out.marks[0].t : 0;
    out.show = show;
    return out;
  }
  throw new Error('no such event');
}
const isGrow = (item, to) => e => e.kind === 'grow' && e.item === item && e.to === to;

// 兩條正解裡挑幾種：人走去人（少棒的球員 → 小學）、小孩走去人龍、小孩走去鼠窩（被升級的是模型）、站務員走去巨蛋（從別格來：閃白換到路上再走過來）
const CASES = [[0, 'milk', 3], [0, 'boba', 2], [0, 'rat', 2], [1, 'baseball', 6], [1, 'milk', 8]];
const seen = { far: [], wave: [], away: [] };   // 這幾種裡真的量到「閃白換位置再走過來」、「被升級物品的代表揮手」與「背景走回去」（最後一條測試查）
for (const [n, item, to] of CASES) {
  test(`visit live (${SOLUTIONS[n].join('>')} ${item} ${to}): the helper rep reaches frontOf(visitSpot) within VISIT_WALK (far ones blink out and reappear on the route VISIT_WALK from it), knocks, the target rep waves, ♥, both home; ≤ 3.5 s; nobody left in script mode`, async () => {
    const v = await liveVisit(SOLUTIONS[n], isGrow(item, to)), what = `${v.e.via[0]}→${item}${to}`;
    assert.ok(v.rep && !v.rep.hidden, `${what}: the helper has a rep`);
    assert.equal(v.marks.length, 2, `${what}: a visit mark and the script mark`); assert.equal(v.marks[0].info.visit, true); assert.ok(!v.marks[1].info.visit);
    // 走到拜訪點：第一次到站位那一刻離拜訪段開始 ≤ BLINK + VISIT_WALK（平移跟走路一起演；遠的人先在原處閃白 BLINK 秒）
    const reach = v.frames.find(f => Math.hypot(f.pos.x - v.stand.x, f.pos.z - v.stand.z) < 0.1);
    assert.ok(reach, `${what}: reached the stand (closest ${Math.min(...v.frames.map(f => Math.hypot(f.pos.x - v.stand.x, f.pos.z - v.stand.z))).toFixed(2)})`);
    assert.ok(reach.t - v.marks[0].t <= BLINK + VISIT_WALK + 0.1, `${what}: walked ${(reach.t - v.marks[0].t).toFixed(2)} s`);
    const far = Math.hypot(v.start.x - v.stand.x, v.start.z - v.stand.z) > VISIT_WALK * v.rep.speed;
    if (far) {
      // 裁決 R3：原處閃白、換位置的那一幀也在閃；換到的點離站位真的要走——走滿 VISIT_WALK 秒的路（直線不超過）、至少 0.6 公尺
      const k = v.frames.findIndex((f, i) => i > 0 && Math.hypot(f.pos.x - v.frames[i - 1].pos.x, f.pos.z - v.frames[i - 1].pos.z) > 0.3), to = v.frames[k]?.pos;
      assert.ok(k > 0, `${what}: relocated once`);
      assert.ok(v.frames[0].blink && v.frames[k].blink, `${what}: blinks at the origin and where it appears`);
      const d = Math.hypot(to.x - v.stand.x, to.z - v.stand.z);
      assert.ok(d <= VISIT_WALK * v.rep.speed + 0.1 && d >= 0.6, `${what}: appears ${d.toFixed(2)} from the stand`);
      assert.ok(reach.t - v.frames[k].t >= VISIT_WALK - 0.2, `${what}: walks the full VISIT_WALK (${(reach.t - v.frames[k].t).toFixed(2)} s)`);
    }
    assert.ok(v.knock, `${what}: knocks`);
    if (v.host && same(cellAt(v.host.pos.x, v.host.pos.z), v.cell)) assert.ok(v.wave, `${what}: the target rep waves`);
    if (v.wave) seen.wave.push(what); if (far) seen.far.push(what);
    // ♥ 冒在幫手頭上
    assert.equal(v.hearts.length, 1, `${what}: one ♥`);
    assert.ok(Math.hypot(v.hearts[0].at.x - v.stand.x, v.hearts[0].at.z - v.stand.z) < 0.3, `${what}: the ♥ over the helper at the door`);
    // 兩人回日常（換過位置、回家的路又長的幫手背景走回他出現的那一點、閃白換回原處再回日常：'away'），劇本手上沒有人；整段 ≤ VISIT_CAP（含跟走路一起演的平移）
    assert.notEqual(v.marks[1].rep.mode, 'script', `${what}: the helper is back to daily life`);
    if (v.host) assert.notEqual(v.marks[1].host.mode, 'script', `${what}: the target rep is back to daily life`);
    assert.equal(v.marks[1].script, 0, `${what}: nobody left in script mode`);
    assert.ok(v.secs <= VISIT_CAP && v.secs >= VISIT_KNOCK, `${what}: visit ${v.secs.toFixed(2)} s`);   // ♥ 不擋拍（裁決 R4）：段長是閃白＋走路＋敲門
    if (far && v.marks[1].rep.mode === 'away') {
      // 遠處叫來、回家的路又長：背景走回出現的那一點、閃白換回原本站的地方（也閃）、回日常（不在日常裡橫越半個島）
      const fr = [...v.after];
      for (let i = 0; i < 300 && v.rep.mode === 'away'; i++) { v.show.update(1 / 30, 500 + i / 30); fr.push({ pos: { ...v.rep.pos }, mode: v.rep.mode, blink: v.show.blink.has(v.rep.walker ?? v.rep.holder) }); }
      const k = fr.findIndex(f => f.mode !== 'away');
      assert.ok(k > 0, `${what}: home again`);
      assert.ok(Math.hypot(fr[k].pos.x - v.start.x, fr[k].pos.z - v.start.z) < 0.05 && fr[k].blink, `${what}: back where it stood, blinking`);
      assert.ok(fr.slice(0, k).filter(f => f.blink).length >= 4, `${what}: blinked before leaving too`);
      seen.away.push(what);
    }
  });
}

test('the cases above cover a far helper blinking in on its route, a target rep waving back, and a walk back in the background', () => {
  assert.ok(seen.far.length >= 1, `far helpers: ${seen.far}`); assert.ok(seen.wave.length >= 1, `waves: ${seen.wave}`); assert.ok(seen.away.length >= 1, `walked back: ${seen.away}`);
  console.log(`# far: ${seen.far.join(', ')} | wave: ${seen.wave.join(', ')} | away: ${seen.away.join(', ')}`);
});

test('helper rep busy in its own script this turn: the visit waits for it (plays after) or is skipped — never steals it mid-script (review focus 2)', async () => {
  // 代表在拜訪開演前被別的劇本拿走（claim，站著不動）：整段只剩平移（≤ 一個 FOCUS_BEAT），他不動、不冒 ♥，劇本照演
  let held = null;
  const v = await liveVisit(SOLUTIONS[0], isGrow('boba', 2), { prepare: (h, e, rep) => { h.show.roster.claim(rep); held = { ...rep.pos }; } });
  assert.equal(v.marks.length, 2);
  assert.equal(v.hearts.length, 0, 'no ♥'); assert.equal(v.knock, false, 'no knock');
  assert.ok(v.frames.every(f => Math.hypot(f.pos.x - held.x, f.pos.z - held.z) < 1e-9 && f.mode === 'script'), 'the busy rep stays where his script left him');
  assert.ok(v.secs <= FOCUS_BEAT + 0.1, `visit collapsed to the pan (${v.secs.toFixed(2)} s)`);
  // 兩條正解裡真的碰到一次：外星第 8 回合站務員剛演完代幣 Lv10 前的劇本還在劇本手上，燈泡 Lv9 的拜訪略過（pace：拜訪 token→bulb→9略）
});

test('helper without a rep (typhoon; electrician away) → no visit beats', async () => {
  // 颱風當幫手：建拍時就是 []（天氣不拜訪）；颱風也不被拜訪
  const s = { lv: { chip: 9 }, flags: {} }, ctx = { B };
  assert.deepEqual(visit({ kind: 'grow', item: 'chip', from: 8, to: 9, via: ['typhoon'] }, s, ctx, { helper: mod('typhoon'), target: mod('chip') }), []);
  assert.deepEqual(visit({ kind: 'grow', item: 'typhoon', from: 2, to: 3, via: ['bulb'] }, s, ctx, { helper: mod('bulb'), target: mod('typhoon') }), []);
  // 電工 Lv7 起住在風車島上（燈泡的 rep 不認主島外的人）：賽博第 7 回合鮮奶 Lv9 的幫手是燈泡——拜訪段只剩平移，沒有人走、沒有 ♥
  const v = await liveVisit(SOLUTIONS[0], isGrow('milk', 9));
  assert.equal(v.e.via[0], 'bulb'); assert.ok(v.show.stage.lv.bulb >= 7, 'the electrician is on the windmill island');
  assert.equal(v.rep, null, 'bulb has no rep on the main island');
  assert.equal(v.marks[0].info.visit, true, 'the visit mark is still there (turn.js cannot know before the beat)');
  assert.equal(v.hearts.length, 0); assert.ok(v.secs <= FOCUS_BEAT + 0.1, `visit collapsed to the pan (${v.secs.toFixed(2)} s)`);
  assert.equal(VISIT_MAX_PER_HELPER, 2);   // 裁決 R2
});

// 撲空（計畫 6 設計 §5，show/visit.js 的 miss）：無頭 live 演一個 wait 事件——照 order 瞬間演完前面的回合（real：最後一回合 wait 之前的事件也瞬間演），
// 再 live 演 wait（real：引擎這回合吐出的那個；否則給的 waits 合成一個）。每段撲空記下：等待物品的代表（mark 那一刻問模組）、起點、
// 段尾（下一個 mark 那一刻）站在哪、有沒有做 sigh、段裡冒了幾個泡泡、段長（扣掉空拍）、段尾他回日常了沒、劇本手上還有幾個人
const { miss, SIGH, MISS_CAP, MISS_WALK, MISS_CLEAR, MISS_PER_TURN } = await import('../src/show/visit.js');
const { anchorWorld } = await import('../src/actors/anchors.js');
const { inShape } = await import('./helpers/show.js');
async function liveMiss(order, waits = null, { prep } = {}) {
  const h = await headlessShow(), { show, run, bubblesLog } = h;
  let s = engine.createState(spec), e = null;
  for (const [i, step] of turnSteps(order).entries()) {
    const r = step(s); s = r.state;
    const at = r.events.findIndex(x => x.kind === 'wait');
    if (!waits && i === order.length - 1 && at >= 0) { for (const x of r.events.slice(0, at)) await run([x], { instant: true }); e = r.events[at]; break; }
    await run([...r.events, { kind: 'settle' }], { instant: true });
  }
  e ??= { kind: 'wait', item: waits[0].item, waits };
  if (!e.waits) throw new Error('no wait event');
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
  const { EXAMPLE } = await import('./helpers/endings.js');
  // 命中第 5 回合：waits [晶片 < 燈泡, 代幣 < 鮮奶]——代幣在 [0,1]、鮮奶在 [-1,0]，不相鄰：站務員走回自己的站門口
  const v = await liveMiss(EXAMPLE.hit.slice(0, 5));
  assert.deepEqual(v.segs.map(g => g.w.item), v.e.waits.slice(0, MISS_PER_TURN).map(w => w.item), 'the first two waits, in ORDER');
  const t = v.segs.find(g => g.w.item === 'token');
  common(v, t, 'token<milk'); assert.ok(dist(t.end, doorOf(v.show, 'token', t.sv)) < 0.15, `token<milk: at its own door (${dist(t.end, doorOf(v.show, 'token', t.sv)).toFixed(2)})`);
  // 命中第 3 回合：晶片 < 燈泡（相鄰格），工程師走過去超過 MISS_WALK 秒 → 回自己門口
  const n = await liveMiss(EXAMPLE.hit.slice(0, 3)), c = n.segs.find(g => g.w.item === 'chip');
  common(n, c, 'chip<bulb2');
  const sp = mod('bulb').visitSpot(c.sv.lv.bulb, c.sv), far = n.show.nav.routeLength(n.show.nav.route(c.start, frontOf(sp, sp.r, n.show.nav)));
  // 前提：燈泡的拜訪點那一格跟工程師站的那一格相鄰（不是「不相鄰所以回門口」那一支）
  const [cq, cr] = cellAt(c.start.x, c.start.z), [bq, br] = cellAt(sp.x, sp.z);
  assert.ok(NEIGHBORS.some(([dq, dr]) => cq + dq === bq && cr + dr === br), `chip<bulb2: the engineer's cell [${cq},${cr}] is next to the bulb's [${bq},${br}]`);
  assert.ok(far > MISS_WALK * c.rep.speed, `chip<bulb2: the bulb is ${far.toFixed(2)} m away`);
  assert.ok(dist(c.end, doorOf(n.show, 'chip', c.sv)) < 0.15, `chip<bulb2: at its own door`);
  // 吹歪第 6 回合：燈泡 < 晶片，電工散步到很遠，自己門口也超過 MISS_WALK 秒：往門口走 MISS_WALK 秒、在路上失望（不換位置）。
  // 前面的回合瞬間演完時電工站在固定的地方，離門口 2.8 m（剛好在 MISS_WALK 以內）——live 的局裡他常散步得更遠（pace 量到吹歪第 6、8 回合、
  // 最後一輪都是這一支）；這裡把他放到自己巡路（bulb.ROAD）上一個走到門口要 MISS_WALK 秒再多 0.3–2 m 的點（日常裡本來就走得到；
  // 前後 2 m 都在主島格上：焦點裡他會沿路走，代表要站在主島格上才叫得到）讓前提成立
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
  const d = await liveMiss(EXAMPLE.deflect.slice(0, 6), null, { prep: away }), b = d.segs.find(g => g.w.item === 'bulb');
  common(d, b, 'bulb<chip2');
  const door = doorOf(d.show, 'bulb', b.sv), len = d.show.nav.routeLength(d.show.nav.route(b.start, door));
  assert.ok(len > MISS_WALK * b.rep.speed, `bulb<chip2: precondition — the door is ${len.toFixed(2)} m away (> ${(MISS_WALK * b.rep.speed).toFixed(2)})`);
  assert.ok(dist(b.end, door) < dist(b.start, door) - 1, `bulb<chip2: walked toward its door (${dist(b.start, door).toFixed(2)} → ${dist(b.end, door).toFixed(2)})`);
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
    await h.run([{ kind: 'wait', item: 'boba', waits: [{ item: 'boba', for: ['token'] }] }], { onMark: (x, info) => marks.push([info, h.show.elapsed]) });
    return { at, rep, marks };
  })();
  assert.ok(v.segs[0].secs > SIGH, 'with the rep free the miss plays');
  assert.ok(busy.marks[0][0].miss && busy.marks[1][1] - busy.marks[0][1] < 0.05, 'busy rep: the miss collapses to 0 s');
  assert.ok(dist(busy.rep.pos, busy.at) < 1e-9, 'the busy rep stays put');
});
