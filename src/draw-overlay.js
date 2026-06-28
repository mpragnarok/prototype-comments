// src/draw-overlay.js —— CDN 入口：把 draw-layer 暴露給外部 consumer。
// CDN = raw src/（netlify /src/* 開 CORS + no-cache），draw-layer.js 僅相對 import './store.js'，
// 可當 native ESM 直接載入，故此處 re-export 即可，無須改 build.py / dist。
export { initDrawLayer, drawingToDoc } from './draw-layer.js';
