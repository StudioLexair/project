import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
const entries = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'css',
  'js',
  'libs',
  'assets',
];

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

for (const entry of entries) {
  cpSync(resolve(root, entry), resolve(output, entry), { recursive: true });
}

console.log(`Nebula Strike 3D preparado en ${output}`);
