// 程序地面貼圖：canvas 即時畫，不載入圖片（政策島提示詞 §2）。
import { mulberry32 } from './random.js';

export const GROUND_KINDS = ['brick', 'dots', 'stripes', 'lawn'];
const PALETTE = {
  brick: { base: 0xe9dcc6, accent: 0xe4d6c3 - 0x141414 },
  dots: { base: 0xcfe0a8, accent: 0xbfd39c },
  stripes: { base: 0xe9dcc6, accent: 0xf1e7da },
  lawn: { base: 0xbfd39c, accent: 0xa9c488 },
};

export function groundPalette(kind) {
  if (!PALETTE[kind]) throw new Error(`unknown ground ${kind}`);
  return PALETTE[kind];
}

const css = hex => '#' + hex.toString(16).padStart(6, '0');

export function groundTexture(THREE, kind, size = 256) {
  const { base, accent } = groundPalette(kind), rnd = mulberry32(size + kind.length * 31);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = css(base); g.fillRect(0, 0, size, size);
  g.fillStyle = g.strokeStyle = css(accent);
  if (kind === 'brick') {
    g.lineWidth = 2;
    const h = size / 8, w = size / 4;
    for (let y = 0; y <= size; y += h) { g.beginPath(); g.moveTo(0, y); g.lineTo(size, y); g.stroke(); }
    for (let row = 0; row < 8; row++) for (let x = (row % 2) * w / 2; x < size; x += w) { g.beginPath(); g.moveTo(x, row * h); g.lineTo(x, row * h + h); g.stroke(); }
  } else if (kind === 'dots') {
    for (let i = 0; i < 70; i++) { g.beginPath(); g.arc(rnd() * size, rnd() * size, 2 + rnd() * 3, 0, Math.PI * 2); g.fill(); }
  } else if (kind === 'stripes') {
    g.lineWidth = size / 16;
    for (let x = -size; x < size * 2; x += size / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + size, size); g.stroke(); }
  } else {
    for (let i = 0; i < 400; i++) g.fillRect(rnd() * size, rnd() * size, 2, 3 + rnd() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
