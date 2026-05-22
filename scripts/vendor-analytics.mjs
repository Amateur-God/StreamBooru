#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);
const dest = path.join(root, 'private', 'atlas-analytics', 'client', 'swetrix.js');

function copySwetrix(fromPkg) {
  const src = require.resolve(`${fromPkg}/dist/swetrix.js`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('Vendored swetrix.js into private AtlasAnalytics bundle');
}

try {
  copySwetrix('swetrix');
} catch {
  try {
    copySwetrix(path.join(root, 'server/node_modules/swetrix'));
  } catch (e) {
    console.warn('Could not vendor swetrix.js:', e.message);
  }
}
