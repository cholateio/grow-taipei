#!/usr/bin/env bash
# 把 three.js r170 需要的檔案抓進 vendor/，之後完全不靠 CDN。
# addons 裡的 `from 'three'` 改成相對路徑，Node 測試也能直接 import；
# 瀏覽器解析出來的 URL 和 importmap 指的是同一個檔，所以只有一份 three。
set -euo pipefail
cd "$(dirname "$0")/.."
BASE=https://cdn.jsdelivr.net/npm/three@0.170.0
OUT=vendor/three
ADDONS=(controls/OrbitControls renderers/CSS2DRenderer geometries/RoundedBoxGeometry utils/BufferGeometryUtils utils/SkeletonUtils math/SimplexNoise loaders/GLTFLoader loaders/DRACOLoader)
DRACO=(draco_decoder.wasm draco_wasm_wrapper.js draco_decoder.js)

fetch() { mkdir -p "$(dirname "$2")"; curl -fsSL "$1" -o "$2"; [ "$(wc -c < "$2")" -gt 1000 ] || { echo "too small: $2" >&2; exit 1; }; }

fetch "$BASE/build/three.module.js" "$OUT/three.module.js"
for a in "${ADDONS[@]}"; do
  f="$OUT/addons/$a.js"
  fetch "$BASE/examples/jsm/$a.js" "$f"
  depth=$(( $(tr -cd '/' <<< "$a" | wc -c) + 1 ))
  rel=$(printf '../%.0s' $(seq 1 "$depth"))three.module.js
  sed -i "s#from 'three'#from '$rel'#g; s#from \"three\"#from \"$rel\"#g" "$f"
done
for d in "${DRACO[@]}"; do fetch "$BASE/examples/jsm/libs/draco/$d" "$OUT/draco/$d"; done
grep -rn "from 'three/\|from \"three/" "$OUT/addons" && { echo "unexpected three/ import" >&2; exit 1; } || true
echo "vendored three r170 → $OUT"
