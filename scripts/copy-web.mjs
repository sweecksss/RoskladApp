import { mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const output = join(root, 'www');
const files = [
  'index.html',
  'admin.html',
  'styles.css',
  'app.js',
  'icon.svg',
  'manifest.webmanifest',
  'sw.js',
  'api-config.js'
];

mkdirSync(output, { recursive: true });
for (const file of files) copyFileSync(join(root, file), join(output, file));
console.log(`Copied ${files.length} web files to ${output}`);
