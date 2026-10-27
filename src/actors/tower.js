// 101（§5.2）：不是物品，反映全島進度。總等級（物品 v2 共 61 級）0–8 工地（吊車會動）、9–25 半成品、26–53 完工、54+ 點燈。
// 晶片（物品 v2 §4.3）Lv7 塔頂長出矽盾天線（Cyberpunk Kit 天線 glb＋環）、Lv8 矽盾測試（罩子閃三下又收起）、
// Lv9 矽盾待命（天線環每 3 秒閃一圈淡藍光、罩子淡淡常駐；結局 shieldSpec('full') 全亮擋飛彈）；燈泡 Lv5 做燈光秀。
// 劇本（§8.9、§14.4）：回合最後的 settle 跨門檻時，鏡頭對著 101，工人（沒有就島民）走到 101 的鏡頭側揮鋤頭 → 回全景 → 閃白跳階 → 頭上寫階段名。
import { anchorWorld, frontOf } from './anchors.js';
import { offset, C } from './palette.js';

export const id = 'tower';

const GLASS = 0x9cc3bf, CREAM = 0xfff8f4, SAND = 0xe9dcc6, CORAL = 0xdb6a41, YELLOW = 0xfcea8b, ICE = 0x9fe8ff, NEON_BLUE = 0x3fe0ff;
const TIER_H = 0.45, LABEL_UP = 0.6;   // LABEL_UP：頭頂（LEVEL UP、泡泡）在塔頂上多高
const AT = anchorWorld('tower'), FOOT = offset(AT, 0.95, 0.25);   // 101 腳下（跟晶片工程師通勤的終點同一點）
// 蓋東西站的鏡頭側距離（§14）：底座 1.6 見方外擴 PAD 後半寬 0.92，鏡頭方向（z 分量 0.96）1.1 才站得到底座外
export const FRONT_R = 1.1;

// 矽盾罩：半球立在 101 底座，半徑蓋過主島七格的每個角（最遠的西南角離 101 約 7.6）
export const SHIELD_R = 7.8;
export const shieldSpec = state => ({ kind: 'shield', at: AT, r: SHIELD_R, state, footprint: false });
// 天線（Quaternius Cyberpunk Kit）：Antenna_1 細桿立在尖塔頂、Antenna_2 碟子掛在尖塔側面朝鏡頭；pos 相對 101 的 at
const ANTENNA_TINT = { '^MetalLight$': C.cream, '^LightGrey$': C.white, '^Grey$': C.curb, '^DarkGrey$': C.ink };
const antennaModels = top => [
  { path: 'quat/cyberpunk/Antenna_1.glb', pos: [0, top, 0], h: 0.55, tint: ANTENNA_TINT },
  { path: 'quat/cyberpunk/Antenna_2.glb', pos: [0.14, top - 0.6, 0.06], h: 0.3, ry: 0.4, tint: ANTENNA_TINT },
];

export const STAGE_NAMES = { site: '101 工地', half: '101 蓋一半', full: '101 完工', lit: '101 點燈' };

// 物品 v2 的 61 級（任務 10）：門檻取在兩條正解總等級曲線的空檔中間（1 3 6 11 16 21 30／31 41 50 57 61），
// 四個階段各在不同回合跨過、散在整局：第 4 回合（6 → 11）蓋一半、第 7 回合（21 → 30／31）完工、倒數第二回合（50 → 57）點燈
export function stageOf(total) { return total >= 54 ? 'lit' : total >= 26 ? 'full' : total >= 9 ? 'half' : 'site'; }

// 塔身：底座 + n 節（上寬下窄的方錐台，每節上緣一圈白邊）+ 完工後的頂帽與尖塔。回傳零件與塔頂高度。
// bent（最終章 §6，飛彈命中）：塔身一半高度（BEND_Y）以上的零件——上面四節、它們的白邊、頂帽、尖塔——繞 z 轉 π/2 往 +x 倒，
//   像吸管折成 L。終局時 101 一定完工或點燈（設計 §6：40320 種順序枚舉過，命中時總等級都 ≥ 26），工地／蓋一半照完工的樣子彎（不丟錯）。
//   回傳的 top 是倒下那段的頂面（頭上的字、泡泡放這裡）
export function body(stage, { bent = false } = {}) {
  if (bent && (stage === 'site' || stage === 'half')) stage = 'full';
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
  if (!bent) return { parts, top: y };
  return { parts: parts.map(p => (p.pos[1] > BEND_Y ? bendPart(p) : p)), top: BEND_Y + BENT_HALF };
}
// 彎角：底座＋座身（0.3 + 1.1）再加 8 節的一半（相對 101 的 at）；倒下那段是方錐台寬 1.16 的一半高
const BEND_Y = 0.3 + 1.1 + 4 * TIER_H, BENT_HALF = 0.6;
// 繞 (0, BEND_Y) 轉 −π/2（往 +x 倒）：(x, y − BEND_Y) → (y − BEND_Y, −x)。
// 零件的 rot（Euler XYZ）只有 [0, 0, 0] 或 [π, 0, 0]（倒放的方錐台）：Rz(−π/2)·Rx(rx) = Rx(rx)·Rz(∓π/2)，rx = π 時 z 角變號
const bendPart = p => {
  const [x, y, z] = p.pos, [rx, ry, rz] = p.rot ?? [0, 0, 0];
  return { ...p, pos: [y - BEND_Y, BEND_Y - x, z], rot: [rx, ry, rz + (Math.cos(rx) > 0 ? -1 : 1) * Math.PI / 2] };
};
// 彎角的世界座標（飛彈命中的點，finale.js 用）：每個階段都照完工／點燈的彎法，所以都一樣
export const bendPoint = () => ({ x: AT.x, y: AT.y + BEND_Y, z: AT.z });

// meta.total：舞台只在回合最後（settle）更新，101 才不會搭著別人的事件跳階（計畫 3.6）
export function view(lv, flags = {}, meta = {}) {
  const at = anchorWorld('tower'), total = meta.total ?? Object.values(lv).reduce((a, b) => a + b, 0);
  // 最終章 §6：命中 → 塔身彎 L、天線燈光秀罩子都拿掉（工地／蓋一半照完工的彎法，吊車也不畫）；矽盾擋下 → 罩子全亮
  const hit = flags.missile === 'hit', stage = stageOf(total);
  const { parts, top } = body(stage, { bent: hit }), v = { 'tower.main': { kind: 'compound', at, labelY: top + LABEL_UP, parts } };
  // 彎過的塔倒下那段伸出底座外（自動 footprint 的包圍盒會變寬、超過 WIDE 就整個不算）：站位照底座 1.6 見方，走路格跟沒彎一樣
  if (hit) { v['tower.main'].footprint = { x: 0, z: 0, w: 1.6, d: 1.6 }; return v; }
  if (stage === 'site' || stage === 'half') v['tower.crane'] = { kind: 'crane', at, height: top + 1.2, offset: [0.75, 0, 0.55], footprint: { x: 0.75, z: 0.55, w: 0.2, d: 0.2 } };   // footprint 擋塔架（at + offset）：0.2 外擴 PAD 後 0.44，剛好蓋住 0.4 的底座，塔架和格邊之間留得出走道（§14.1）
  if (lv.chip >= 7) {
    // 矽盾天線：塔頂的環＋天線 glb；待命（Lv9）時環發淡藍光，塔身半高再一圈大環，一起每 3 秒亮一次
    const pulse = lv.chip >= 9, glow = pulse ? { glow: NEON_BLUE } : {};
    const parts = [{ kind: 'torus', pos: [0, top - 0.25, 0], scale: 1.0, rot: [Math.PI / 2, 0, 0], color: pulse ? NEON_BLUE : CREAM, ...glow }];
    if (pulse) parts.push({ kind: 'torus', pos: [0, top * 0.55, 0], scale: 2.2, rot: [Math.PI / 2, 0, 0], color: NEON_BLUE, glow: NEON_BLUE });
    v['tower.antenna'] = { kind: 'antenna', at, models: antennaModels(top), parts, pulse, footprint: false };
  }
  if (flags.missile === 'shield') v['tower.shield'] = shieldSpec('full');
  else if (lv.chip === 8) v['tower.shield'] = shieldSpec('test');
  else if (lv.chip >= 9) v['tower.shield'] = shieldSpec('standby');
  if (lv.bulb >= 5) v['tower.show'] = { kind: 'lightshow', at, low: false, parts: Array.from({ length: 8 }, (_, i) => {
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
  // 矽盾天線：環（compound）＋天線 glb；pulse 時環每 3 秒亮一次（白天也看得到，所以底強度不跟著夜晚歸零；相位同 parts.js 的 shieldPose）
  antenna(THREE, spec, ctx) {
    const object = new THREE.Group(), ring = ctx.build({ kind: 'compound', at: { x: 0, y: 0, z: 0 }, parts: spec.parts, shadow: false });
    const subs = spec.models.map(m => ctx.build({ kind: 'glb', at: { x: m.pos[0], y: m.pos[1], z: m.pos[2] }, path: m.path, h: m.h, ry: m.ry ?? 0, tint: m.tint }));
    object.add(ring.object, ...subs.map(p => p.object));
    const dispose = () => { ring.dispose(); for (const p of subs) p.dispose(); };
    if (!spec.pulse) return { object, materials: ring.materials, dispose };
    return { object, materials: ring.materials, dispose, update(dt, t) { const k = (1 + Math.sin(t * Math.PI * 2 / 3)) / 2; for (const m of ring.materials) m.emissiveIntensity = (1.2 + ctx.glow.intensity) * k; } };
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
