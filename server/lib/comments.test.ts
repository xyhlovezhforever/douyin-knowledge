import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCompactNumber, rankComments } from './comments.js';

test('parses compact social counts', () => {
  assert.equal(parseCompactNumber('1.2K'), 1200);
  assert.equal(parseCompactNumber('3.4万'), 34000);
  assert.equal(parseCompactNumber('987'), 987);
});

test('ranks corrections and concrete experience above short reactions', () => {
  const ranked = rankComments([
    { id: 'short', author: 'A', text: '太棒了', likes: 200, replies: 0 },
    { id: 'useful', author: 'B', text: '补充一点：我实测了 30 天，实际节省约 38% 的时间，原文数据需要纠正。', likes: 18, replies: 4 },
  ]);
  assert.equal(ranked[0]?.id, 'useful');
  assert.equal(ranked[0]?.signal, 'correction');
});
