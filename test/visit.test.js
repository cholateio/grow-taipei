// test/visit.test.js：拜訪（計畫 6 設計 §4，show/visit.js）——無頭 live 演一個有原因的升級（拜訪 + 那一級的劇本），
// 量拜訪那一段：幫手的代表走到被升級物品拜訪點的鏡頭側（frontOf(visitSpot, r, nav)；遠的在格邊出現再走剩下的）、敲門、
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
const { cellAt } = await import('../src/scene/hex.js');
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

// 兩條正解裡挑幾種：人走去人（少棒的球員 → 小學）、小孩走去人龍、小孩走去鼠窩（被升級的是模型）、站務員走去巨蛋（從別格來，在格邊出現）
const CASES = [[0, 'milk', 3], [0, 'boba', 2], [0, 'rat', 2], [1, 'baseball', 6], [1, 'milk', 8]];
const seen = { far: [], wave: [], away: [] };   // 這幾種裡真的量到「在格邊出現」與「被升級物品的代表揮手」（最後一條測試查）
for (const [n, item, to] of CASES) {
  test(`visit live (${SOLUTIONS[n].join('>')} ${item} ${to}): the helper rep reaches frontOf(visitSpot) within VISIT_WALK (or appears at the cell edge), knocks, the target rep waves, ♥, both home; ≤ 3.5 s; nobody left in script mode`, async () => {
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
    // 兩人回日常（幫手從別格來的話走回格邊再回日常：'away'），劇本手上沒有人；整段 ≤ VISIT_CAP（含跟走路一起演的平移）
    assert.notEqual(v.marks[1].rep.mode, 'script', `${what}: the helper is back to daily life`);
    if (v.host) assert.notEqual(v.marks[1].host.mode, 'script', `${what}: the target rep is back to daily life`);
    assert.equal(v.marks[1].script, 0, `${what}: nobody left in script mode`);
    assert.ok(v.secs <= VISIT_CAP && v.secs >= VISIT_KNOCK + VISIT_LOVE, `${what}: visit ${v.secs.toFixed(2)} s`);
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

test('the cases above cover a helper appearing at the cell edge and a target rep waving back', () => {
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
