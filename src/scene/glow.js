// 發光材質登記表：強度 = night × 3.2 × scale（§9.2）。scale 用在大停電（歸零）。
// 動態零件被換掉時要 remove，登記表才不會越積越多。
export function createGlowRegistry() {
  const mats = new Set();
  let night = 0, scale = 1;
  const intensity = () => night * 3.2 * scale;
  const apply = () => { const k = intensity(); for (const m of mats) m.emissiveIntensity = k; };
  return {
    add(m) { mats.add(m); m.emissiveIntensity = intensity(); },
    remove(m) { mats.delete(m); },
    setNight(n) { night = n; apply(); },
    setScale(k) { scale = k; apply(); },
    get intensity() { return intensity(); },
    get size() { return mats.size; },
  };
}
