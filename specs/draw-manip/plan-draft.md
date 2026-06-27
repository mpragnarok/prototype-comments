# Draw 操作改造 — 端點 handle + 硬鎖 live anchor + 吸附

分支：`feat/draw-arrow-endpoints`（off main，含已 merge 的 draw-tooling）
決策（lavish 2026-06-27）：① 端點 handle 取代 bbox（arrow/line）② 硬鎖 live anchor ③ 吸附全開（邊中點/最近邊/角落/其他物件/接近高亮）。A+B 一起做完一次驗收。
標準：TDD（unit + e2e），紅→綠，全 stdout；Func ≤40 行、巢狀 ≤2。

## 介面影響（additive，不破壞匯出）
DrawObject 加 `endAnchors?: { from?: Anchor, to?: Anchor }`。
- Anchor(el)  = `{ kind:'el', selector, relX, relY }`  relX/relY ∈ 0..1（在元件 rect 內相對位置）
- Anchor(obj) = `{ kind:'obj', objId, which }`           which ∈ 'from'|'to'（鎖到另一畫圖物件端點）
geom.from/to 仍是 fallback（未鎖或解析失敗時用）。buildExport/serialize 加 endAnchors（有才寫）。

## 整合點（src/draw-layer.js，行號=改前）
1. renderSelection `:862` — 單選且 tool∈{arrow,line} → 畫 2 個圓 handle `data-endpoint=from|to`（用解析後端點），**不畫 bbox 角**；其餘維持 4 角。
2. onSelectDown `:1008` — 讀 `e.target.dataset.endpoint`；有則 `startEndpointDrag(e, which, rect)`（早於 handle 分支）。
3. startEndpointDrag（新）— 仿 startResize：onMv 算 p→snap→set geom[which]+暫存 anchor＋畫 highlight；onUp commitChange（before/after 含 geom+endAnchors），清 highlight。
4. resolveEndpoints（新）— render/geomBBox/labelAnchor 對 arrow/line 改用「解析後端點」。需 host rect→%。
5. live reposition（新）— 有任何 endAnchors 時：window scroll/resize + ResizeObserver(host) + rAF 比對 anchored 元件 rect 變動 → 變了就 render()。無 anchor 時不啟動（省）。
6. highlight（新）— 拖曳中 snap 到元件 → 該元件位置畫 dashed teal rect；放開清掉。
7. serializeDrawObject/drawingToDoc/rehydrateDrawing/makeDrawObject — 帶上 endAnchors。

## 新純函式（export，unit 測）
- `setEndpoint(geom, which, p)` → 新 geom（immutable）
- `rectAnchorPoints(rect)` → [{x,y,ref}] 4 邊中點+4 角（% rect {x,y,w,h}）
- `nearestPointOnRect(p, rect)` → 邊上最近點 {x,y}
- `objectSnapPoints(objects, exceptId)` → 其他物件端點/邊中點候選
- `nearestSnap(p, candidates, threshold)` → {point, cand} | null
- `anchorRel(p, elRect)` → {relX,relY}
- `resolveAnchorPoint(anchor, elRect)` → {x,y}
- `resolveEndpoints(o, getRectPct)` → {from,to}（el: getRectPct(selector)；obj: 查 objects；無/失敗→geom）

## 座標
geom 為 host-rect %。元件 rect(px viewport)→host %：用現有 pxToPct/clientToPct（rect=host.getBoundingClientRect()）。
吸附閾值：預設 ~2.5%（約 px 換算），可調。

## 測試清單
### unit（test/draw-layer.unit.spec.js 追加）
- setEndpoint：改 to 不動 from；immutable
- rectAnchorPoints：8 點座標正確
- nearestPointOnRect：點在各側→投影正確；內部點→最近邊
- nearestSnap：閾值內回最近、閾值外回 null
- anchorRel ↔ resolveAnchorPoint round-trip
- resolveEndpoints：el anchor 用 getRectPct；obj anchor 用目標端點；無 anchor→geom；解析失敗→geom fallback
- geomBBox/labelAnchor：對有 anchor 的 arrow 用解析端點（注入 resolver）
- serialize/drawingToDoc：endAnchors 有才帶

### e2e（test/e2e/draw-layer.spec.js 追加；harness 已有 fixtures）
- 選 arrow → 出現 2 圓 handle、無 bbox 角
- 拖 to handle → 方向改變（geom.to 變、from 不變）
- 拖 to 到 #submit-btn 邊緣 → 吸附＋endAnchors.to.kind==='el'＋selector 命中
- 移動該元件（改 style.top）→ 重新 render 後箭頭 to 端點跟著移動（live）
- 接近元件 → highlight rect 出現；離開/放開 → 消失
- undo 還原端點＋anchor

## 進度
- [x] 分支 + plan-draft
- [ ] 純函式 + unit（紅→綠）
- [ ] 渲染/pointer/anchor 整合
- [ ] live reposition + highlight
- [ ] e2e（紅→綠）
- [ ] build bundle + 全套回歸（單元/e2e/visual 無 regression）
- [ ] 截圖 + lavish 驗收
