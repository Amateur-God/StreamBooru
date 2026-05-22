#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const privateRoot = path.join(root, 'private', 'atlas-analytics');
const clientSrc = path.join(privateRoot, 'client');
const serverSrc = path.join(privateRoot, 'server');
const clientDest = path.join(root, 'renderer', 'analytics-private');
const serverDest = path.join(root, 'server', 'src', '_analytics_private');

function copyTree(from, to) {
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const srcPath = path.join(from, entry.name);
    const destPath = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
  return true;
}

const hasClient = copyTree(clientSrc, clientDest);
const hasServer = copyTree(serverSrc, serverDest);
if (hasServer) {
  const legacyEntry = path.join(serverDest, 'analytics.js');
  const indexEntry = path.join(serverDest, 'index.js');
  if (!fs.existsSync(indexEntry) && fs.existsSync(legacyEntry)) {
    fs.renameSync(legacyEntry, indexEntry);
  }
}

if (hasClient || hasServer) {
  console.log('Merged private AtlasAnalytics bundle for deploy.');
} else {
  console.log('No private AtlasAnalytics bundle found; running without analytics.');
}
