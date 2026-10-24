// 開機引導：這裡刻意沒有任何靜態 import。遊戲本體（含 three.js）用動態 import 在 try 裡載入，
// 這樣不管是 WebGL 失敗、還是任何 vendor／模組檔 404，都會顯示錯誤，而不是永遠停在載入畫面。
const loading = document.getElementById('loading');
const params = new URLSearchParams(location.search);
try {
  // ?simulateFail=vendor 真的去載入一個不存在的模組，模擬部署缺檔
  const { start } = await import(params.get('simulateFail') === 'vendor' ? './missing-module-for-test.js' : './app.js');
  await start({ params, loading });
} catch (e) {
  loading.hidden = false;
  loading.textContent = `無法啟動 3D 畫面：${e.message}`;
  console.warn(e);
}
