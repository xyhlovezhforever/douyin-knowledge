import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getWechatChannelsId,
  parseWechatChannelsPayload,
  WECHAT_CONTENT_UNAVAILABLE,
  WechatChannelsUnavailableError,
} from './wechatChannels.js';

test('extracts ids from both WeChat Channels URL forms', () => {
  assert.equal(getWechatChannelsId('https://weixin.qq.com/sph/ACk7oojJzJ'), 'ACk7oojJzJ');
  assert.equal(getWechatChannelsId('https://channels.weixin.qq.com/finder-preview/pages/sph?id=ACk7oojJzJ'), 'ACk7oojJzJ');
});

test('parses public WeChat Channels metadata defensively', () => {
  const metadata = parseWechatChannelsPayload({
    errCode: 0,
    data: {
      feed: {
        description: '如何整理视频研究资料 #知识管理 #效率',
        coverUrl: 'https://finder.video.qq.com/example/cover.jpg',
        likeCountFmt: '1.2万',
        commentCount: 328,
        favCountFmt: '866',
        forwardCountFmt: '99',
        createTime: 1_700_000_000,
      },
      finderAcct: { nickname: '研究工具箱', headImgUrl: 'https://example.com/avatar.jpg' },
    },
  });

  assert.equal(metadata.description, '如何整理视频研究资料 #知识管理 #效率');
  assert.equal(metadata.author, '研究工具箱');
  assert.equal(metadata.coverUrl, 'https://finder.video.qq.com/example/cover.jpg');
  assert.equal(metadata.likeCount, 12_000);
  assert.equal(metadata.commentCount, 328);
  assert.equal(metadata.favoriteCount, 866);
  assert.equal(metadata.shareCount, 99);
  assert.equal(metadata.publishedAt, '2023-11-14T22:13:20.000Z');
});

test('returns the specific unavailable message for private or expired content', () => {
  assert.throws(
    () => parseWechatChannelsPayload({ data: { errMsg: { type: 2, title: '此内容暂时无法播放' } }, errCode: 0 }),
    (error) => error instanceof WechatChannelsUnavailableError && error.message === WECHAT_CONTENT_UNAVAILABLE,
  );
});
