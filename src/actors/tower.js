// 101（§5.2）：不是物品，反映全島進度。總等級（物品 v2 共 61 級）0–6 工地（吊車會動）、7–28 半成品、29–50 完工、51+ 點燈（選擇帶動升級重取）。
// 晶片（物品 v2 §4.3）Lv7 塔頂長出矽盾天線（Cyberpunk Kit 天線 glb＋環）、Lv8 矽盾測試（罩子閃三下又收起）、
// Lv9 矽盾待命（天線環每 3 秒閃一圈淡藍光、罩子淡淡常駐；結局 shieldSpec('full') 全亮擋飛彈）；燈泡 Lv5 做燈光秀。
// 最終章 §7 賽博尾聲：flags.epilogue === 'cyber' → 黑色高塔（body dark：塔身墨黑、白邊換霓虹藍）、頂帽尖塔換成平屋頂
// （紅色飛天跑車停在前緣、機器鼠軍團兩排站在中間），天線桅杆退到屋頂後緣、桅杆頂上一面朝鏡頭的發光螢幕 tower.screen（跑馬燈泡泡掛在它身上）。
// 最終章 §7 外星尾聲：flags.epilogue === 'alien' → 母艦（body ship：整座塔身抬離地面 SHIP_LIFT、底下一片綠光盤、頂帽尖塔換成倒扣的碟＋碟緣），
// 變異鼠王坐碟頂中心（shipTop），天線退到碟緣後側；燈光秀跟著抬高、矽盾照樣全亮。
// 劇本（§8.9、§14.4；計畫 11 §設計 4）：回合最後的 settle 跨門檻時，回全景 → 換零件（塔身長出來）→ 頭上寫階段名。
// 以前先飛去 101 那一格、工人走過去揮鋤頭，使用者 2026-10-31 不要了。
import { anchorWorld } from './anchors.js';
import { C } from './palette.js';

export const id = 'tower';

const GLASS = 0x9cc3bf, CREAM = 0xfff8f4, SAND = 0xe9dcc6, CORAL = 0xdb6a41, YELLOW = 0xfcea8b, ICE = 0x9fe8ff;
// 黑塔（賽博尾聲）：墨黑偏紫一點（純 C.ink 在夜裡跟背景糊在一起），白邊與屋頂邊條發霓虹藍
export const DARK = 0x2a2630, NEON_BLUE = 0x3fe0ff;
const TIER_H = 0.45, LABEL_UP = 0.6;   // LABEL_UP：頭頂（LEVEL UP、泡泡）在塔頂上多高
const AT = anchorWorld('tower');

// 矽盾罩：半球立在 101 底座，半徑蓋過主島七格的每個角（最遠的西南角離 101 約 7.6）
export const SHIELD_R = 7.8;
export const shieldSpec = state => ({ kind: 'shield', at: AT, r: SHIELD_R, state, footprint: false });
// 天線（Quaternius Cyberpunk Kit）：Antenna_1 細桿立在尖塔頂、Antenna_2 碟子掛在尖塔側面朝鏡頭；pos 相對 101 的 at
const ANTENNA_TINT = { '^MetalLight$': C.cream, '^LightGrey$': C.white, '^Grey$': C.curb, '^DarkGrey$': C.ink };
// mast：尖塔（桅杆）在塔軸上的水平位置（黑塔的桅杆在屋頂後緣）；dishZ：碟子的 z（預設貼著桅杆）。
// 母艦的天線細桿立在碟頂、碟子掛在 top − 0.6——那個高度是最上一節塔身（方錐台半寬 0.58）裡面，貼著桅杆會埋進去：往後推出塔身（DISH_OUT）
const antennaModels = (top, mast = { x: 0, z: 0 }, dishZ = mast.z) => [
  { path: 'quat/cyberpunk/Antenna_1.glb', pos: [mast.x, top, mast.z], h: 0.55, tint: ANTENNA_TINT },
  { path: 'quat/cyberpunk/Antenna_2.glb', pos: [mast.x + 0.14, top - 0.6, dishZ + 0.06], h: 0.3, ry: 0.4, tint: ANTENNA_TINT },
];
export const DISH_OUT = 0.3;
// 黑塔的平屋頂（相對 101 的 at）：1.6 見方（跟底座一樣寬，往外挑出塔身）、厚 0.08，外圈一條霓虹藍邊條；
// 桅杆（尖塔）退到後緣 MAST_Z、高 MAST_H。屋頂面要站得下 10 隻機器鼠（兩排、間距 ≥ 0.25）和前緣一台停好的飛天跑車
const DECK_W = 1.6, DECK_H = 0.08, MAST_Z = -0.62, MAST_H = 0.9;
// 螢幕：1.1 × 0.6、厚 0.08，朝 +z（鏡頭）；底邊在桅杆尖上 SCREEN_UP（天線細桿 0.55 高，留 0.05）
const SCREEN = [1.1, 0.6, 0.08], SCREEN_UP = 0.6;

export const STAGE_NAMES = { site: '101 工地', half: null, full: '101 完工', lit: '101 點燈' };

// 選擇帶動升級（計畫 5b 任務 3）：9 回合（8 次放置＋最後一輪），門檻取在（當時）兩條正解總等級曲線的空檔中間——
//   賽博 2 5 9 14 24 35 45 57 61、外星 2 5 9 15 23 34 45 56 61。
// 四個階段各在不同回合跨過、散在整局：第 3 回合（5 → 9）蓋一半、第 6 回合（23／24 → 34／35）完工、第 8 回合（45 → 56／57，倒數第二回合）點燈。
// 唯一正解（2026-10-31）之後亂放的局終局常常停在蓋一半：命中局的總等級最少 20，蓋一半 19973／完工 10174／點燈 91 局（body 的 bent 照各階段彎）
export function stageOf(total) { return total >= 51 ? 'lit' : total >= 29 ? 'full' : total >= 7 ? 'half' : 'site'; }
// view 的階段：照 meta.total（舞台只在回合最後的 settle 更新，101 才不會搭著別人的事件跳階，計畫 3.6）；沒給才自己加總。finale.js 的飛彈也用它
export const stageOfView = (lv, meta = {}) => stageOf(meta.total ?? Object.values(lv).reduce((a, b) => a + b, 0));

// 塔身：底座 + n 節（上寬下窄的方錐台，每節上緣一圈白邊）+ 完工後的頂帽與尖塔。回傳零件與塔頂高度。
// bent（最終章 §6，飛彈命中）：在這一階段自己的高度（bendY(stage)）彎——彎角以上的零件繞 z 轉 π/2 往 +x 倒，像吸管折成 L。
//   完工／點燈：八節的一半（上面四節、它們的白邊、頂帽、尖塔倒下）；蓋一半：四節的一半（第 2 節頂，上面兩節與白邊倒下）；
//   工地：沒有塔身可彎，照原樣（吊車由 view 拿掉）。回傳的 top 是彎過的形狀的頂（倒下那段的頂面；工地是底座頂）——view 的頭頂照它
// dark（最終章 §7 賽博）：玻璃、底座都是 DARK，白邊發霓虹藍；八節之上不放頂帽尖塔，改成平屋頂（'deck'）＋後緣的桅杆。
//   回傳多帶 roof（屋頂面高度）與 mast（桅杆的水平位置），都相對 101 的 at。賽博尾聲時 101 一定點燈（全 MAX，總等級 61）；
//   其他階段照點燈的樣子畫（不丟錯）。
// ship（最終章 §7 外星母艦）：點燈的塔拿掉頂帽與尖塔，其餘每個零件 y + SHIP_LIFT（底座懸浮離地 1.0）；底下 y 0.5 一片綠光盤
//   （cylinder r 1.2，C.alien 發光）；八節之上一個倒扣的碟（dome 繞 x 翻 π：碗朝下壓在最上一節上）＋碟緣（扁 cylinder，碗口沒有蓋，
//   從上面看得到的是碟緣的頂面）。回傳多帶 deck（碟頂面高度，變異鼠王坐的地方）、mast（天線在碟緣後側）、lift，都相對 101 的 at；
//   top = deck（天線細桿立在碟頂高度）。外星尾聲時 101 一定點燈（全 MAX）；其他階段照點燈的樣子畫（不丟錯）
export function body(stage, { bent = false, dark = false, ship = false } = {}) {
  if (dark) return darkBody();
  if (ship) return shipBody();
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
  if (!bent || stage === 'site') return { parts, top: y };
  const by = bendY(stage);
  return { parts: parts.map(p => (p.pos[1] > by ? bendPart(p, by) : p)), top: by + BENT_HALF };
}
function darkBody() {
  const trim = { color: NEON_BLUE, glow: NEON_BLUE }, parts = [
    { kind: 'box', pos: [0, 0.15, 0], scale: [1.6, 0.3, 1.6], color: DARK },
    { kind: 'frustum4', pos: [0, 0.3 + 1.1 / 2, 0], scale: [1.24, 1.1, 1.24], color: DARK },
  ];
  let y = 0.3 + 1.1;
  for (let i = 0; i < 8; i++) {
    parts.push({ kind: 'frustum4', pos: [0, y + 0.21, 0], scale: [1.16, 0.42, 1.16], rot: [Math.PI, 0, 0], color: DARK });
    parts.push({ kind: 'box', pos: [0, y + 0.43, 0], scale: [0.84, 0.05, 0.84], ...trim });
    y += TIER_H;
  }
  parts.push({ kind: 'box', name: 'deck', pos: [0, y + DECK_H / 2, 0], scale: [DECK_W, DECK_H, DECK_W], color: DARK });
  parts.push({ kind: 'box', pos: [0, y + 0.02, 0], scale: [DECK_W + 0.04, 0.03, DECK_W + 0.04], ...trim });   // 屋頂邊條（從屋頂板四邊露出 0.02）
  const roof = y + DECK_H, mast = { x: 0, z: MAST_Z };
  parts.push({ kind: 'cylinder', pos: [mast.x, roof + MAST_H / 2, mast.z], scale: [0.08, MAST_H, 0.08], ...trim });
  return { parts, top: roof + MAST_H, roof, mast };
}
// 母艦（外星尾聲）：抬 1.0、綠光盤 r 1.2 在 y 0.5；碗（dome 1.4 × 0.5 → 半徑 0.7、深 0.25）的碗口在最上一節頂面上 BOWL_UP，
// 碗底壓進最上一節 0.03（不留縫）；碟緣 1.6 寬、厚 0.06，跟碗口同高。天線退到碟緣後側 SHIP_MAST_Z（碟頂中心留給變異鼠王）
export const SHIP_LIFT = 1.0;
const DISC_Y = 0.5, DISC_R = 1.2, BOWL = [1.4, 0.5, 1.4], BOWL_UP = BOWL[1] / 2 - 0.03, RIM = [1.6, 0.06, 1.6], SHIP_MAST_Z = -0.55;
const SILVER = 0xc0c8d0, RIM_GREY = 0x9aa7b8;   // 同老鼠 Lv5 小 UFO 的碟身與碟緣（rat.js UFO_PARTS）
function shipBody() {
  const lit = body('lit'), tiersTop = lit.top - 1.5 + SHIP_LIFT;   // 點燈的塔：八節頂上 1.5 是頂帽＋尖塔
  const parts = lit.parts.slice(0, -2).map(p => ({ ...p, pos: [p.pos[0], p.pos[1] + SHIP_LIFT, p.pos[2]] }));   // 最後兩件是頂帽與尖塔
  const rimY = tiersTop + BOWL_UP, deck = rimY + RIM[1] / 2;
  parts.push({ kind: 'cylinder', name: 'disc', pos: [0, DISC_Y, 0], scale: [2 * DISC_R, 0.06, 2 * DISC_R], color: C.alien, glow: C.alien });
  parts.push({ kind: 'dome', name: 'saucer', pos: [0, rimY, 0], scale: BOWL, rot: [Math.PI, 0, 0], color: SILVER });
  parts.push({ kind: 'cylinder', name: 'rim', pos: [0, rimY, 0], scale: RIM, color: RIM_GREY });
  return { parts, top: deck, deck, mast: { x: 0, z: SHIP_MAST_Z }, lift: SHIP_LIFT };
}
// 碟頂的世界 y（變異鼠王坐的高度，rat.js SHIP_SPOT）
export const shipTop = () => AT.y + shipBody().deck;
// 螢幕的中心（相對 101 的 at）：桅杆尖上 SCREEN_UP 是底邊
export function screenAt() {
  const b = darkBody();
  return { x: b.mast.x, y: b.top + SCREEN_UP + SCREEN[1] / 2, z: b.mast.z };
}
// 彎角（相對 101 的 at）：底座＋座身（0.3 + 1.1）再加這一階段塔節的一半——完工／點燈 8 節的 4 節、蓋一半 4 節的 2 節；
// 工地不彎，這個高度只給飛彈當撞點（工地座身 0.5 的中段）。倒下那段是方錐台寬 1.16 的一半高
const bendY = stage => (stage === 'site' ? 0.3 + 0.5 / 2 : 0.3 + 1.1 + (stage === 'half' ? 2 : 4) * TIER_H), BENT_HALF = 0.6;
// 繞 (0, by) 轉 −π/2（往 +x 倒）：(x, y − by) → (y − by, −x)。
// 零件的 rot（Euler XYZ）只有 [0, 0, 0] 或 [π, 0, 0]（倒放的方錐台）：Rz(−π/2)·Rx(rx) = Rx(rx)·Rz(∓π/2)，rx = π 時 z 角變號
const bendPart = (p, by) => {
  const [x, y, z] = p.pos, [rx, ry, rz] = p.rot ?? [0, 0, 0];
  return { ...p, pos: [y - by, by - x, z], rot: [rx, ry, rz + (Math.cos(rx) > 0 ? -1 : 1) * Math.PI / 2] };
};
// 彎角的世界座標（飛彈命中的點，finale.js 用）：照這一階段的彎角（工地是底座中段）
export const bendPoint = stage => ({ x: AT.x, y: AT.y + bendY(stage), z: AT.z });

// meta.total：舞台只在回合最後（settle）更新，101 才不會搭著別人的事件跳階（計畫 3.6；stageOfView）
export function view(lv, flags = {}, meta = {}) {
  const at = anchorWorld('tower');
  // 最終章 §6：命中 → 塔身在這一階段的高度彎 L（工地不彎）、天線燈光秀罩子吊車都拿掉；矽盾擋下 → 罩子全亮
  const hit = flags.missile === 'hit', stage = stageOfView(lv, meta);
  // 彎過的塔頭頂（labelY）照彎過的形狀的頂（body 回傳的 top）：天際線跟著降，全景裡 setSkyline 是飛過去的（camera.js，最終審稿 2），
  // 不會瞬間跳鏡頭（2026-10-31 最終修正：以前蓋一半照完工塔彎、頭頂照沒彎的半塔，兩邊對不上）
  // 賽博尾聲（§7）：黑塔＋螢幕；頭頂一樣照點燈的塔（天際線不變，尾聲收尾的 focus home 不跳鏡頭；螢幕頂在頭頂下）
  // 外星尾聲（§7）：母艦；頭頂一樣照點燈的塔（碟頂比尖塔低，坐上去的王冠鼠也在頭頂下；天際線不變、收尾不跳鏡頭）
  const dark = flags.epilogue === 'cyber' && !hit, ship = flags.epilogue === 'alien' && !hit;
  const { parts, top, mast, lift = 0 } = body(stage, { bent: hit, dark, ship }), head = dark || ship ? body('lit').top : top;
  const v = { 'tower.main': { kind: 'compound', at, labelY: head + LABEL_UP, parts } };
  // 母艦底下的綠光盤比底座寬、黑塔屋頂的霓虹邊條（1.64）比底座寬 0.04：站位照底座 1.6 見方（同彎 L 的塔、同點燈的塔自動算出來的）
  if (ship || dark) v['tower.main'].footprint = { x: 0, z: 0, w: 1.6, d: 1.6 };
  if (dark) {
    // 螢幕：墨黑外框＋朝鏡頭那面霓虹藍發光板＋底下一條霓虹粉跑馬燈條；at 就是螢幕中心（泡泡掛在零件位置上，tower.screen 的泡泡就在螢幕上）
    const c = screenAt(), [w, hh, d] = SCREEN;
    v['tower.screen'] = { kind: 'compound', at: { x: at.x + c.x, y: at.y + c.y, z: at.z + c.z }, labelY: 0, footprint: false, shadow: false, parts: [
      { kind: 'box', pos: [0, 0, 0], scale: [w, hh, d], color: DARK },
      { kind: 'box', pos: [0, 0.04, d / 2 + 0.005], scale: [w - 0.1, hh - 0.18, 0.01], color: NEON_BLUE, glow: NEON_BLUE },
      { kind: 'box', pos: [0, -hh / 2 + 0.07, d / 2 + 0.005], scale: [w - 0.1, 0.06, 0.01], color: C.neonPink, glow: C.neonPink },
    ] };
  }
  // 彎過的塔倒下那段伸出底座外（自動 footprint 的包圍盒會變寬、超過 WIDE 就整個不算）：站位照底座 1.6 見方，走路格跟沒彎一樣
  if (hit) { v['tower.main'].footprint = { x: 0, z: 0, w: 1.6, d: 1.6 }; return v; }
  if (stage === 'site' || stage === 'half') v['tower.crane'] = { kind: 'crane', at, height: top + 1.2, offset: [0.75, 0, 0.55], footprint: { x: 0.75, z: 0.55, w: 0.2, d: 0.2 } };   // footprint 擋塔架（at + offset）：0.2 外擴 PAD 後 0.44，剛好蓋住 0.4 的底座，塔架和格邊之間留得出走道（§14.1）
  if (lv.chip >= 7) {
    // 矽盾天線：塔頂的環＋天線 glb；待命（Lv9）時環發淡藍光，塔身半高再一圈大環，一起每 3 秒亮一次
    const pulse = lv.chip >= 9, glow = pulse ? { glow: NEON_BLUE } : {};
    const parts = [{ kind: 'torus', pos: [mast?.x ?? 0, top - 0.25, mast?.z ?? 0], scale: 1.0, rot: [Math.PI / 2, 0, 0], color: pulse ? NEON_BLUE : CREAM, ...glow }];
    if (pulse) parts.push({ kind: 'torus', pos: [0, top * 0.55, 0], scale: 2.2, rot: [Math.PI / 2, 0, 0], color: NEON_BLUE, glow: NEON_BLUE });
    v['tower.antenna'] = { kind: 'antenna', at, models: antennaModels(top, mast, ship ? mast.z - DISH_OUT : undefined), parts, pulse, footprint: false };
  }
  if (flags.missile === 'shield') v['tower.shield'] = shieldSpec('full');
  else if (lv.chip === 8) v['tower.shield'] = shieldSpec('test');
  else if (lv.chip >= 9) v['tower.shield'] = shieldSpec('standby');
  if (lv.bulb >= 5) v['tower.show'] = { kind: 'lightshow', at, low: false, parts: Array.from({ length: 8 }, (_, i) => {
    const a = i / 8 * Math.PI * 2, y = lift + 1.0 + (i % 4) * (top - lift - 1.2) / 4;   // 母艦整座抬高 lift
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
export const script = {
  // 沒跨門檻：0 拍、不佔時間（turn.js 之後補的 apply 照樣套用 settle 的其他變化）
  settle(e, s, ctx) {
    const stage = stageOf(s.total);
    if (stage === stageOf(s.prevTotal)) return [];
    const { B } = ctx;
    // 換零件前回全景（§14.4）：停 0.8 s 等鏡頭飛到；天際線先用新階段的頭頂，換上去的塔頂與 LEVEL UP 才不出框。
    // 開場就是 focus：turn.js 不再先平移到 101 那一格（opensOnFocus）；沒有人被叫來，也就不用叫誰回家
    const skyline = AT.y + body(stage).top + LABEL_UP;
    return [B.focus('home', { hold: 0.8, skyline }), B.apply(e), B.levelUp('tower', STAGE_NAMES[stage] ? { text: STAGE_NAMES[stage] } : {})];
  },
};
