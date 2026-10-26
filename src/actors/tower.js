// 101（§5.2）：不是物品，反映全島進度。總等級 0–8 工地（吊車會動）、9–18 半成品、19–29 完工、30+ 點燈。
// 晶片 Lv5 長出矽盾天線、Lv6 每 3 秒閃一圈淡藍光；燈泡 Lv5 做燈光秀。
// 劇本（§8.9、§14.4）：回合最後的 settle 跨門檻時，鏡頭對著 101，工人（沒有就島民）走到 101 的鏡頭側揮鋤頭 → 回全景 → 閃白跳階 → 頭上寫階段名。
import { anchorWorld, frontOf } from './anchors.js';
import { offset } from './palette.js';

export const id = 'tower';

const GLASS = 0x9cc3bf, CREAM = 0xfff8f4, SAND = 0xe9dcc6, CORAL = 0xdb6a41, YELLOW = 0xfcea8b, ICE = 0x9fe8ff, NEON_BLUE = 0x3fe0ff;
const TIER_H = 0.45, LABEL_UP = 0.6;   // LABEL_UP：頭頂（LEVEL UP、泡泡）在塔頂上多高
const AT = anchorWorld('tower'), FOOT = offset(AT, 0.95, 0.25);   // 101 腳下（跟晶片工程師通勤的終點同一點）
// 蓋東西站的鏡頭側距離（§14）：底座 1.6 見方外擴 PAD 後半寬 0.92，鏡頭方向（z 分量 0.96）1.1 才站得到底座外
export const FRONT_R = 1.1;

export const STAGE_NAMES = { site: '101 工地', half: '101 蓋一半', full: '101 完工', lit: '101 點燈' };

// 41 級後門檻跟著放大（原本 7/15/23）
export function stageOf(total) { return total >= 30 ? 'lit' : total >= 19 ? 'full' : total >= 9 ? 'half' : 'site'; }

// 塔身：底座 + n 節（上寬下窄的方錐台，每節上緣一圈白邊）+ 完工後的頂帽與尖塔。回傳零件與塔頂高度。
function body(stage) {
  const lit = stage === 'lit', trim = lit ? { color: ICE, glow: ICE } : { color: CREAM };
  const baseH = stage === 'site' ? 0.5 : 1.1, parts = [
    { kind: 'box', pos: [0, 0.15, 0], scale: [1.6, 0.3, 1.6], color: SAND },
    { kind: 'frustum4', pos: [0, 0.3 + baseH / 2, 0], scale: [1.24, baseH, 1.24], color: GLASS },
  ];
  let y = 0.3 + baseH;
  const n = stage === 'site' ? 0 : stage === 'half' ? 4 : 8;
  for (let i = 0; i < n; i++) {
    parts.push({ kind: 'frustum4', pos: [0, y + 0.21, 0], scale: [1.16, 0.42, 1.16], rot: [Math.PI, 0, 0], color: GLASS });
    parts.push({ kind: 'box', pos: [0, y + 0.43, 0], scale: [0.84, 0.05, 0.84], ...trim });
    y += TIER_H;
  }
  if (stage === 'full' || lit) {
    parts.push({ kind: 'frustum4', pos: [0, y + 0.2, 0], scale: [0.68, 0.4, 0.68], color: GLASS });
    parts.push({ kind: 'cylinder', pos: [0, y + 0.95, 0], scale: [0.08, 1.1, 0.08], ...trim });
    y += 1.5;
  }
  if (stage === 'site') for (const [x, z] of [[-0.6, 0.7], [0.1, 0.72], [-0.7, 0.15]]) parts.push({ kind: 'cone', pos: [x, 0.39, z], scale: [0.14, 0.18, 0.14], color: CORAL });
  return { parts, top: y };
}

// meta.total：舞台只在回合最後（settle）更新，101 才不會搭著別人的事件跳階（計畫 3.6）
export function view(lv, flags, meta = {}) {
  const at = anchorWorld('tower'), total = meta.total ?? Object.values(lv).reduce((a, b) => a + b, 0), stage = stageOf(total);
  const { parts, top } = body(stage), v = { 'tower.main': { kind: 'compound', at, labelY: top + LABEL_UP, parts } };
  if (stage === 'site' || stage === 'half') v['tower.crane'] = { kind: 'crane', at, height: top + 1.2, offset: [0.75, 0, 0.55], footprint: { x: 0.75, z: 0.55, w: 0.2, d: 0.2 } };   // footprint 擋塔架（at + offset）：0.2 外擴 PAD 後 0.44，剛好蓋住 0.4 的底座，塔架和格邊之間留得出走道（§14.1）
  if (lv.chip >= 5) {
    // 矽盾天線：塔頂的環
    const ring = { kind: 'torus', pos: [0, top, 0], scale: 1.2, rot: [Math.PI / 2, 0, 0], color: CREAM };
    v['tower.antenna'] = lv.chip >= 6 ? { kind: 'pulse', at, parts: [{ ...ring, color: NEON_BLUE, glow: NEON_BLUE }, { kind: 'torus', pos: [0, top * 0.55, 0], scale: 2.2, rot: [Math.PI / 2, 0, 0], color: NEON_BLUE, glow: NEON_BLUE }] }
      : { kind: 'compound', at, parts: [ring] };
  }
  if (lv.bulb >= 5) v['tower.show'] = { kind: 'lightshow', at, parts: Array.from({ length: 8 }, (_, i) => {
    const a = i / 8 * Math.PI * 2, y = 1.0 + (i % 4) * (top - 1.2) / 4;
    return { kind: 'box', pos: [Math.cos(a) * 0.5, y, Math.sin(a) * 0.5], scale: [0.08, 0.3, 0.08], color: CREAM, glow: [0xff3fa0, NEON_BLUE, YELLOW, 0x5fcf7a][i % 4] + i };   // + i：八個燈條各自一個材質，才能各轉各的色相
  }) };
  return v;
}

export const builders = {
  // 工地吊車：黃色桅杆，吊臂慢慢左右擺
  crane(THREE, spec, ctx) {
    const object = new THREE.Group(), h = spec.height, [ox, oy, oz] = spec.offset ?? [0, 0, 0];
    const mast = ctx.build({ kind: 'compound', at: { x: ox, y: oy, z: oz }, parts: [
      { kind: 'box', pos: [0, h / 2, 0], scale: [0.09, h, 0.09], color: YELLOW },
      { kind: 'box', pos: [0, 0.05, 0], scale: [0.4, 0.1, 0.4], color: 0x5c5650 },
    ] });
    const jib = ctx.build({ kind: 'compound', at: { x: ox, y: oy + h, z: oz }, parts: [
      { kind: 'box', pos: [-0.35, 0.05, 0], scale: [1.6, 0.08, 0.08], color: YELLOW },
      { kind: 'box', pos: [0.32, -0.05, 0], scale: [0.25, 0.18, 0.2], color: 0x5c5650 },
      { kind: 'cylinder', pos: [-0.95, -0.35, 0], scale: [0.012, 0.7, 0.012], color: 0x211d1d },
      { kind: 'box', pos: [-0.95, -0.72, 0], scale: [0.1, 0.06, 0.1], color: CORAL },
    ] });
    jib.object.name = 'jib'; object.add(mast.object, jib.object);
    return { object, update(dt, t) { jib.object.rotation.y = Math.sin(t * 0.4) * 0.9; }, dispose() { mast.dispose(); jib.dispose(); } };
  },
  // 矽盾待命：天線環每 3 秒亮一次（白天也看得到，所以底強度不跟著夜晚歸零）
  pulse(THREE, spec, ctx) {
    const part = ctx.build({ ...spec, kind: 'compound', at: { x: 0, y: 0, z: 0 } });
    return { ...part, update(dt, t) { const k = (1 + Math.sin(t * Math.PI * 2 / 3)) / 2; for (const m of part.materials) m.emissiveIntensity = (1.2 + ctx.glow.intensity) * k; } };
  },
  // 全島 LED：塔身八個燈條沿色相轉，每 4 秒一圈
  lightshow(THREE, spec, ctx) {
    const part = ctx.build({ ...spec, kind: 'compound', at: { x: 0, y: 0, z: 0 } });
    return { ...part, update(dt, t) { part.materials.forEach((m, i) => m.emissive.setHSL((t / 4 + i / 8) % 1, 1, 0.55)); } };
  },
};

// ── 劇本（§8.9）──
// 角色演到那一拍才找（劇本在回合開始就整串建好，那時誰在哪還不準）；once 找到第一次就記住，整段同一個人。
// 颱風登陸回合躲起來（hidden）的人不算。
const once = fn => { let m = null; return c => (m ??= fn(c) ?? null); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const visible = (ctx, key) => (ctx.roster.members(key) ?? []).filter(m => !m.hidden);
const heroAt = (ctx, p) => visible(ctx, 'chip.worker')[0] ?? visible(ctx, 'landmarks.islanders').sort((a, b) => dist(a.pos, p) - dist(b.pos, p))[0];

export const script = {
  // 沒跨門檻：0 拍、不佔時間（turn.js 之後補的 apply 照樣套用 settle 的其他變化）
  settle(e, s, ctx) {
    const stage = stageOf(s.total);
    if (stage === stageOf(s.prevTotal)) return [];
    const { B } = ctx, hero = once(c => heroAt(c, FOOT)), front = c => frontOf(AT, FRONT_R, c.nav);
    // 換零件前回全景（§14.4）：停 0.8 s 等鏡頭飛到；天際線先用新階段的頭頂，換上去的塔頂與 LEVEL UP 才不出框
    const skyline = AT.y + body(stage).top + LABEL_UP;
    return [
      B.focus('tower'), B.walk(hero, front), B.gesture(hero, 'build', { at: AT }),
      B.focus('home', { hold: 0.8, skyline }), B.apply(e), B.levelUp('tower', { text: STAGE_NAMES[stage] }), B.home(hero),
    ];
  },
};
