// 渲染器、相機、三盞光、霧、天空、水，以及「設定時間」這一個入口（政策島提示詞 §3–4）。
import { CSS2DRenderer } from '../../vendor/three/addons/renderers/CSS2DRenderer.js';
import { sample, sunDirection } from './daynight.js';
import { createSky } from './sky.js';
import { createWater } from './water.js';

const PIXEL_RATIO = { high: 1.75, medium: 1.4, low: 1 };
const SHADOW_MAP = { high: 2048, medium: 1024, low: 0 };
export const CENTER = { x: 0.4, y: 0.6, z: 0 };

export function pickQuality(param, { width, mobile }) {
  if (param in PIXEL_RATIO) return param;
  return width <= 800 || mobile ? 'medium' : 'high';
}

export function createRenderer(THREE, { canvas, labelsEl, quality = 'high' }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, PIXEL_RATIO[quality]));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = SHADOW_MAP[quality] > 0; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf4eee3, 42, 150);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.3, 320);
  const labels = new CSS2DRenderer({ element: labelsEl });

  const hemi = new THREE.HemisphereLight(0xeef6fa, 0x8f8270, 1.3);
  const sun = new THREE.DirectionalLight(0xfff1de, 2.8);
  const fill = new THREE.DirectionalLight(0xbfd6ff, 0.35);
  fill.position.set(-10, 8, -6);
  sun.target.position.set(CENTER.x, 0, CENTER.z);
  if (SHADOW_MAP[quality]) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP[quality], SHADOW_MAP[quality]);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 22, bottom: -22, near: 1, far: 90 });
    Object.assign(sun.shadow, { bias: -0.0006, normalBias: 0.045, radius: 3 });
  }
  scene.add(hemi, sun, sun.target, fill);

  const sky = createSky(THREE), water = createWater(THREE);
  scene.add(sky.mesh, water.mesh);
  const glows = [];

  function setTime(minute) {
    const s = sample(minute), dir = sunDirection(minute);
    sun.color.setHex(s.sunColor); sun.intensity = s.sunI;
    sun.position.set(CENTER.x + dir.x * 40, dir.y * 40, CENTER.z + dir.z * 40);
    hemi.color.setHex(s.hemiSky); hemi.groundColor.setHex(s.hemiGround); hemi.intensity = s.hemiI;
    scene.fog.color.setHex(s.horizon);
    sky.setTime(s, dir); water.setTime(s);
    for (const m of glows) m.emissiveIntensity = s.night * 3.2;
    return s;
  }

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); labels.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  return {
    renderer, scene, camera, labels, sun, hemi, fill, sky, water, setTime, resize,
    addGlow: materials => glows.push(...materials),
    render() { renderer.render(scene, camera); labels.render(scene, camera); },
  };
}
