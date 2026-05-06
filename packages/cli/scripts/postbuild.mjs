import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(packageDir, 'dist/core/assets');

fs.mkdirSync(assetsDir, { recursive: true });
fs.copyFileSync(
  path.join(packageDir, 'src/core/assets/n8n-workflows.d.ts'),
  path.join(assetsDir, 'n8n-workflows.d.ts'),
);

if (process.platform !== 'win32') {
  fs.chmodSync(path.join(packageDir, 'dist/index.js'), 0o755);
}
