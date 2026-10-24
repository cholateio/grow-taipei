// 程序天空：BackSide 大球，horizon→top 漸層 + 太陽光暈 + 夜晚星星（政策島提示詞 §4）。
export function createSky(THREE) {
  const uniforms = {
    uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSun: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uNight: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uHorizon, uSun, uSunDir; uniform float uNight;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.55, d.y));
        col += uSun * pow(max(dot(d, normalize(uSunDir)), 0.0), 18.0) * 0.35 * (1.0 - uNight);
        float h = hash(floor(d * 180.0));
        if (uNight > 0.0 && d.y > 0.04 && h > 0.9965) col += vec3(uNight * (h - 0.9965) / 0.0035);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(170, 32, 16), material);
  mesh.renderOrder = -1; mesh.frustumCulled = false;
  return {
    mesh,
    setTime(s, dir) {
      uniforms.uTop.value.setHex(s.skyTop); uniforms.uHorizon.value.setHex(s.horizon); uniforms.uSun.value.setHex(s.sunColor);
      uniforms.uSunDir.value.set(dir.x, dir.y, dir.z); uniforms.uNight.value = s.night;
    },
  };
}
