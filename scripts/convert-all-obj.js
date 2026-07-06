/**
 * 批量转换 OBJ 文件为 GLB 格式
 *
 * 使用方法: npm run convert-all
 */

import { execSync } from 'child_process';
import { readdirSync } from 'fs';
import { join, basename } from 'path';

const MODELS_DIR = 'public/models';

// 获取所有 OBJ 文件
const files = readdirSync(MODELS_DIR).filter(f => f.endsWith('.obj'));

console.log(`找到 ${files.length} 个 OBJ 文件\n`);

let success = 0;
let failed = 0;

for (const file of files) {
  const input = join(MODELS_DIR, file);
  const output = join(MODELS_DIR, file.replace('.obj', '.glb'));

  console.log(`转换: ${file} -> ${basename(output)}`);

  try {
    execSync(`npx obj2gltf -i "${input}" -o "${output}"`, {
      stdio: 'pipe',
      timeout: 120000,  // 2 分钟超时
    });
    console.log(`  ✅ 成功\n`);
    success++;
  } catch (err) {
    console.error(`  ❌ 失败: ${err.message}\n`);
    failed++;
  }
}

console.log('='.repeat(50));
console.log(`转换完成: ${success} 成功, ${failed} 失败`);
