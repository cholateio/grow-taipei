// 演員共用色票（§9.1）與「颱風 Lv3 放晴、災後重建」：所有房子換下一個屋頂色。
export const C = {
  cream: 0xfff8f4, sand: 0xe9dcc6, coral: 0xdb6a41, ink: 0x211d1d, yellow: 0xfcea8b, wall: 0xf1e7da, window: 0x5c5650,
  glass: 0x9cc3bf, cliff: 0xd2b48c, curb: 0xe4d6c3, blue: 0x5a88b2, navy: 0x3f5a8a, skin: 0xf3c9a5, warm: 0xffc777,
  neonPink: 0xff3fa0, neonBlue: 0x3fe0ff, alien: 0x5fcf7a, wood: 0x9c7a4e, white: 0xffffff,
  red: 0xe8322e,   // 跑車紅（尾聲的紅色飛天跑車車身、Roadster 的尾燈條）
};
export const ROOFS = [C.coral, C.navy, C.yellow];
export const roofColor = (base, rebuilt) => rebuilt ? ROOFS[(ROOFS.indexOf(base) + 1) % ROOFS.length] : base;
export const rebuilt = lv => lv.typhoon >= 3;   // 颱風 Lv3 放晴（修正批次 2：三級）
// 相對錨點的偏移 → 世界座標（站位、路徑用）
export const offset = (at, x, z, y = 0) => ({ x: at.x + x, y: at.y + y, z: at.z + z });
