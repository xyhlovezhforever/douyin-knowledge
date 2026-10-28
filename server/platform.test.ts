import assert from 'node:assert/strict';
import test from 'node:test';
import { detectPlatform, getYouTubeVideoId } from './platform.js';

test('detects supported platforms', () => {
  assert.equal(detectPlatform('https://www.bilibili.com/video/BV123'), 'bilibili');
  assert.equal(detectPlatform('https://v.douyin.com/example'), 'douyin');
  assert.equal(detectPlatform('https://youtu.be/dQw4w9WgXcQ'), 'youtube');
  assert.equal(detectPlatform('https://weixin.qq.com/sph/ACk7oojJzJ'), 'wechat_channels');
  assert.equal(detectPlatform('https://channels.weixin.qq.com/finder-preview/pages/sph?id=ACk7oojJzJ'), 'wechat_channels');
  assert.equal(detectPlatform('https://weixin.qq.com/'), 'unknown');
});

test('extracts common YouTube video ids', () => {
  assert.equal(getYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(getYouTubeVideoId('https://youtube.com/shorts/abc123'), 'abc123');
});
