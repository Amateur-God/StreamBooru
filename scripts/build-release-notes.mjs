#!/usr/bin/env node
/**
 * Combine a CHANGELOG section extract with optional GitHub-generated notes.
 * Usage: node build-release-notes.mjs <outPath> [changelogExtractPath] [githubNotesPath]
 */
import fs from 'node:fs';

const [, , outPath, changelogPath = './CHANGELOG_RELEASE.md', githubPath = './GITHUB_NOTES.md'] = process.argv;

const read = (p) => {
  try {
    if (!p || !fs.existsSync(p)) return '';
    return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n').trim();
  } catch {
    return '';
  }
};

const changelog = read(changelogPath);
const github = read(githubPath);

const parts = [];
if (changelog) parts.push(changelog);
if (github) {
  if (parts.length) parts.push('---', '## Commits & pull requests', '', github);
  else parts.push(github);
}

const body = parts.join('\n').trim();
if (outPath) fs.writeFileSync(outPath, body ? `${body}\n` : '', 'utf8');

if (!body) process.exit(0);
console.log('---BEGIN RELEASE BODY---');
console.log(body);
console.log('---END RELEASE BODY---');
