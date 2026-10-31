# 台北成長 GROW TAIPEI

向 GROW 系列致敬的 three.js 網頁益智遊戲：八個物品放進台北島，放的順序決定台北長成什麼樣子，全部 MAX 看真結局。
原生 ES modules、沒有打包，three.js 放在 `vendor/`，模型在 `assets/`（授權見 `assets/LICENSES.md`）。

## 本機開發

需要 Node 18 以上（開發用 Node 24），不用 `npm install`。

```sh
npm run serve          # http://127.0.0.1:8766/index.html
npm test               # node --test，整套要跑幾分鐘
npm run check          # 規則層剛好一解
npm run pace -- --check  # 演出秒數
npm run shot           # 無頭 Chrome 截圖到 shots/（需要 Playwright 的 Chromium，或用 CHROME=… 指定）
```

網址參數（除錯、截圖用）：`?auto=milk,baseball,…` 自動依序放、`&live=1&warp=N` 最後一個照常演、`?time=night`、`?quality=low`、`?cam=…`。

## 部署（GitHub Pages）

`.github/workflows/pages.yml`：push 到 `main` 就發布。

1. 在 GitHub 開 repo、推上去。
2. repo 的 **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**（沒開的話 workflow 會失敗並寫出這一步）。
3. 之後每次 push 到 `main`，workflow 用 `npm run dist`（rsync）把 `index.html`、`src/`、`vendor/`、`assets/` 複製到 `dist/` 上傳，
   並把 `og:image` 改成完整網址。`docs/`、`test/`、`tools/`、`shots/`、`grow_prototype/` 不發布。

本機先看部署出來的樣子：

```sh
npm run dist                          # 產出 dist/（不進 git）
node tools/serve.mjs 8766 --root dist # 從 dist/ 開
node tools/shot.mjs --root dist open= # 從 dist/ 截圖
```
