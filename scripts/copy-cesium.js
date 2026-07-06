/**
 * 确保 public/Cesium 可用（Workers/Assets），供 CESIUM_BASE_URL='/Cesium/' 加载。
 * - 若已存在 Cesium.js（含目录联接 / 已有复制）则跳过
 * - 否则从 node_modules/cesium/Build/Cesium 复制
 */
import { cpSync, existsSync, lstatSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/cesium/Build/Cesium');
const dest = join(root, 'public/Cesium');
const destEntry = join(dest, 'Cesium.js');

if (!existsSync(src)) {
  console.warn('[copy-cesium] 未找到 cesium/Build/Cesium，请先执行 npm install');
  process.exit(0);
}

if (existsSync(destEntry)) {
  const linkHint = existsSync(dest) && lstatSync(dest).isSymbolicLink()
    ? '（目录联接/符号链接）'
    : '';
  console.log(`[copy-cesium] public/Cesium 已就绪${linkHint}，跳过`);
  process.exit(0);
}

mkdirSync(join(root, 'public'), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('[copy-cesium] 已复制到 public/Cesium');
