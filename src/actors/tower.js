// 101（§5.2）：不是物品，反映全島進度。總等級 0–8 工地（吊車會動）、9–18 半成品、19–29 完工、30+ 點燈。
// 晶片 Lv5 長出矽盾天線、Lv6 每 3 秒閃一圈淡藍光；燈泡 Lv5 做燈光秀。
import { anchorWorld } from './anchors.js';

export const id = 'tower';

const GLASS = 0x9cc3bf, CREAM = 0xfff8f4, SAND = 0xe9dcc6, CORAL = 0xdb6a41, YELLOW = 0xfcea8b, ICE = 0x9fe8ff, NEON_BLUE = 0x3fe0ff;
const TIER_H = 0.45;

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

export function view(lv) {
  const at = anchorWorld('tower'), total = Object.values(lv).reduce((a, b) => a + b, 0), stage = stageOf(total);
  const { parts, top } = body(stage), v = { 'tower.main': { kind: 'compound', at, parts } };
  if (stage === 'site' || stage === 'half') v['tower.crane'] = { kind: 'crane', at, height: top + 1.2, offset: [0.75, 0, 0.55] };
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
