// 開機：之後各任務逐步把場景、介面、遊戲接上來。
const loading = document.getElementById('loading');
const params = new URLSearchParams(location.search);
try {
  if (params.get('simulateFail') === 'vendor') throw new Error('模擬 vendor 失敗');
  const THREE = await import('three');
  const canvas = document.getElementById('c');
  if (params.get('simulateFail') === 'webgl') throw new Error('瀏覽器不支援 WebGL');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setClearColor(0x4fa6b4);
  renderer.render(new THREE.Scene(), new THREE.PerspectiveCamera());
  loading.hidden = true;
} catch (e) {
  loading.hidden = false;
  loading.textContent = `無法啟動 3D 畫面：${e.message}`;
  console.warn(e);
}
