#!/usr/bin/env node
/**
 * Extract a single release section from a CHANGELOG.md.
 * Usage: node extract-changelog.mjs <tag> <changelogPath> <outPath>
 * Examples:
 *  - node extract-changelog.mjs v0.2.2 ./CHANGELOG.md ./CHANGELOG_RELEASE.md
 *
 * Matches headings:
 *  - ## [vX.Y.Z] — YYYY-MM-DD
 *  - ## vX.Y.Z
 *  - ## X.Y.Z
 */
import fs from 'node:fs';

const [,, rawTag, changelogPath, outPath] = process.argv;

const die = (msg, code = 1) => { console.error(msg); process.exit(code); };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeTag = (t) => {
  if (!t) return '';
  const m = String(t).match(/v?(\d+\.\d+\.\d+.*)/);
  return m ? m[1] : String(t).replace(/^v/, '');
};

if (!rawTag) die('extract-changelog: missing <tag> argument');
if (!changelogPath) die('extract-changelog: missing <changelogPath> argument');
if (!outPath) die('extract-changelog: missing <outPath> argument');
if (!fs.existsSync(changelogPath)) die(`extract-changelog: changelog not found at ${changelogPath}`);

const tag = String(rawTag).trim();
const bare = normalizeTag(tag);

// Supports: [vX.Y.Z] — date | vX.Y.Z | X.Y.Z (with or without brackets), em dash or hyphen date suffix
const reHeading = new RegExp(
  String.raw`^##\s*(?:\[\s*)?(?:v?${esc(bare)})\s*(?:\]\s*)?(?:\s*[—-]\s*\d{4}-\d{2}-\d{2})?\s*$`,
  'mi'
);

const content = fs.readFileSync(changelogPath, 'utf8');
const match = content.match(reHeading);

if (!match) {
  fs.writeFileSync(outPath, '');
  process.exit(0);
}

const startIdx = match.index;
// Find next "## " after start
const tail = content.slice(startIdx + 1);
const nextHeadingRel = tail.search(/^##\s+/m);
const endIdx = nextHeadingRel >= 0 ? startIdx + 1 + nextHeadingRel : content.length;

let section = content.slice(startIdx, endIdx)
  .replace(/\r\n/g, '\n')
  .trim();

fs.writeFileSync(outPath, section, 'utf8');
console.log('---BEGIN CHANGELOG EXTRACT---');
console.log(section);
console.log('---END CHANGELOG EXTRACT---');
