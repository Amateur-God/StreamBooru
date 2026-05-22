#!/usr/bin/env node
'use strict';

const { buildQueryTags, ratingToTag } = require('../src/adapters/base');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok:', msg);
  }
}

assert(ratingToTag('safe') === 'rating:safe', 'ratingToTag safe');
assert(ratingToTag('any') === '', 'ratingToTag any');

const site = { rating: 'safe', tags: '1girl solo' };
assert(
  buildQueryTags(site, 'cat_ears') === 'rating:safe 1girl solo cat_ears',
  'merges rating, profile tags, and search'
);
assert(
  buildQueryTags({ rating: 'questionable', tags: 'landscape rating:explicit' }, 'order:rank') === 'rating:questionable landscape rating:explicit order:rank',
  'merges profile tags with rating and popular sort'
);
assert(
  buildQueryTags({ rating: 'safe', tags: '1girl 1girl' }, '1girl cat') === 'rating:safe 1girl cat',
  'dedupes repeated tags'
);

if (process.exitCode) {
  console.error('\nquery tag tests failed');
  process.exit(process.exitCode);
}
console.log('\nAll query tag tests passed');
