// 程序水面：淺 #a4d4da → 深 #6fa9b8，兩組正弦波色彩漂移，離島越遠越深，微小閃光，支援霧。
import { WATER_Y } from './hex.js';

export function createWater(THREE) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uShallow: { value: new THREE.Color(0xa4d4da) }, uDeep: { value: new THREE.Color(0x6fa9b8) },
    uTint: { value: new THREE.Color(0x5a88b2) }, uNight: { value: 0 }, uTime: { value: 0 },
  }]);
  const material = new THREE.ShaderMaterial({
    uniforms, fog: true,
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vXZ;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0); vXZ = wp.xz;
        vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uShallow, uDeep, uTint; uniform float uNight, uTime;
      varying vec2 vXZ;
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y);
      }
      void main() {
        float w = sin(vXZ.x * 0.35 + uTime * 0.6) * 0.5 + sin(vXZ.y * 0.28 - uTime * 0.45 + vXZ.x * 0.12) * 0.5;
        vec3 col = mix(uShallow, uDeep, clamp(smoothstep(8.0, 60.0, length(vXZ)) + w * 0.08, 0.0, 1.0));
        // 雜湊 value noise 做閃光：不週期，不會排成格子
        float g = vnoise(vXZ * 2.3 + vec2(uTime * 0.35, -uTime * 0.25)) * vnoise(vXZ * 1.1 - vec2(uTime * 0.2, uTime * 0.3));
        col += smoothstep(0.62, 0.9, g) * 0.07 * (1.0 - uNight);
        col = mix(col, uTint * 0.85, uNight * 0.75);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(160, 64).rotateX(-Math.PI / 2), material);
  mesh.position.y = WATER_Y; mesh.receiveShadow = true;
  return {
    mesh,
    update(t) { uniforms.uTime.value = t; },
    setTime(s) { uniforms.uTint.value.setHex(s.water); uniforms.uNight.value = s.night; },
  };
}
