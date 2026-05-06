import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(packageDir, 'assets');

fs.mkdirSync(assetsDir, { recursive: true });
fs.copyFileSync(path.join(packageDir, '../../res/logo.png'), path.join(assetsDir, 'logo.png'));
fs.copyFileSync(path.join(packageDir, 'res/spacer.png'), path.join(assetsDir, 'spacer.png'));
