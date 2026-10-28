import type { VideoReport } from '../../shared/types.js';
import { parseCompactNumber } from '../lib/comments.js';
import type { VideoAdapter } from './types.js';

const FEED_ENDPOINT = 'https://channels.weixin.qq.com/finder-preview/api/feed/get_feed_info?_pageUrl=https%3A%2F%2Fchannels.weixin.qq.com%2Ffinder-preview%2Fpages%2Fsph';
export const WECHAT_CONTENT_UNAVAILABLE = '该视频号内容在网页端暂时无法播放，可能已失效、需要登录或仅可在微信内查看。';

type JsonRecord = Record<string, unknown>;

export type WechatChannelsMetadata = {
  title?: string;
  description?: string;
  author?: string;
  avatarUrl?: string;
  coverUrl?: string;
  publishedAt?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  favoriteCount?: number;
  shareCount?: number;
};

export class WechatChannelsUnavailableError extends Error {}

export const wechatChannelsAdapter: VideoAdapter = {
  id: 'wechat-channels-public',
  name: '视频号公开元数据',
  platforms: ['wechat_channels'],
  isReady: () => true,
  async analyze(url): Promise<VideoReport> {
    const shortUri = getWechatChannelsId(url);
    if (!shortUri) throw new Error('无法从链接中识别视频号分享编号。');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const previewUrl = `https://channels.weixin.qq.com/finder-preview/pages/sph?id=${encodeURIComponent(shortUri)}`;
      const response = await fetch(FEED_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://channels.weixin.qq.com',
          referer: previewUrl,
        },
        body: JSON.stringify({ baseReq: { generalToken: '' }, shortUri }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`视频号公开接口返回 HTTP ${response.status}`);
      const metadata = parseWechatChannelsPayload(await response.json());
      const description = metadata.description?.trim() ?? '';
      const topics = extractTopics(description);

      return {
        id: shortUri,
        sourceUrl: url,
        platform: 'wechat_channels',
        connector: '视频号公开元数据',
        title: metadata.title ?? titleFromDescription(description) ?? '视频号内容',
        author: metadata.author ?? '未知作者',
        thumbnailUrl: metadata.coverUrl,
        viewCount: metadata.viewCount,
        engagement: compactObject({
          likeCount: metadata.likeCount,
          commentCount: metadata.commentCount,
          favoriteCount: metadata.favoriteCount,
          shareCount: metadata.shareCount,
        }),
        publishedAt: metadata.publishedAt,
        summary: description || '已获取视频号公开元数据，但页面未提供可读取的内容文案。',
        keyPoints: [],
        topics,
        transcript: [],
        comments: [],
        totals: { transcriptSegments: 0, commentsFetched: 0, commentsRanked: 0 },
        warnings: [
          '视频号公开网页不提供视频或音频流，因此未生成转写。',
          '视频号公开网页不提供评论正文，因此无法筛选高价值评论。',
        ],
        analyzedAt: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timeout);
    }
  },
};

export function getWechatChannelsId(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.hostname === 'channels.weixin.qq.com') return cleanId(url.searchParams.get('id'));
    const match = url.pathname.match(/^\/sph\/([^/]+)\/?$/i);
    return cleanId(match?.[1] ?? null);
  } catch {
    return null;
  }
}

export function parseWechatChannelsPayload(payload: unknown): WechatChannelsMetadata {
  const errorTitle = nestedErrorTitle(payload);
  if (errorTitle) throw new WechatChannelsUnavailableError(WECHAT_CONTENT_UNAVAILABLE);

  const root = asRecord(payload);
  const errorCode = root ? numberValue(root.errCode) : undefined;
  if (errorCode !== undefined && errorCode !== 0) {
    throw new Error(firstString(root?.errMsg) ?? `视频号公开接口返回错误 ${errorCode}`);
  }

  const metadata: WechatChannelsMetadata = {
    title: findString(payload, ['title', 'feedTitle']),
    description: findString(payload, ['description', 'desc', 'contentDesc']),
    author: findString(payload, ['nickname', 'nickName', 'authorName', 'author']),
    avatarUrl: findUrl(payload, ['headImgUrl', 'avatarUrl', 'avatar']),
    coverUrl: findUrl(payload, ['coverUrl', 'coverImgUrl', 'coverImg', 'thumbUrl', 'cover'], /finder\.video\.qq\.com|mmbiz\.qpic\.cn/i),
    publishedAt: normalizePublishedAt(findValue(payload, ['createTime', 'create_time', 'publishTime', 'publishedAt'])),
    viewCount: findCount(payload, ['readCountFmt', 'readCount', 'playCountFmt', 'playCount', 'viewCountFmt', 'viewCount']),
    likeCount: findCount(payload, ['likeCountFmt', 'likeCount']),
    commentCount: findCount(payload, ['commentCountFmt', 'commentCount']),
    favoriteCount: findCount(payload, ['favCountFmt', 'favCount', 'favoriteCountFmt', 'favoriteCount']),
    shareCount: findCount(payload, ['forwardCountFmt', 'forwardCount', 'shareCountFmt', 'shareCount']),
  };

  if (!metadata.description && !metadata.author && !metadata.coverUrl) {
    throw new WechatChannelsUnavailableError(WECHAT_CONTENT_UNAVAILABLE);
  }
  return metadata;
}

function cleanId(value: string | null): string | null {
  const id = value?.trim();
  return id && /^[A-Za-z0-9_-]{6,128}$/.test(id) ? id : null;
}

function nestedErrorTitle(value: unknown): string | undefined {
  for (const record of walkRecords(value)) {
    const errMsg = asRecord(record.errMsg);
    const title = firstString(errMsg?.title);
    if (title && /(无法播放|不可播放|已失效|不存在|权限|登录)/.test(title)) return title;
  }
  return undefined;
}

function findString(value: unknown, keys: string[]): string | undefined {
  const found = findValue(value, keys);
  return firstString(found);
}

function findUrl(value: unknown, keys: string[], fallback?: RegExp): string | undefined {
  const direct = firstString(findValue(value, keys));
  if (direct && /^https?:\/\//i.test(direct)) return direct;
  if (!fallback) return undefined;
  for (const item of walkValues(value)) {
    if (typeof item === 'string' && /^https?:\/\//i.test(item) && fallback.test(item)) return item;
  }
  return undefined;
}

function findCount(value: unknown, keys: string[]): number | undefined {
  const found = findValue(value, keys);
  if (typeof found !== 'string' && typeof found !== 'number') return undefined;
  const count = parseCompactNumber(found);
  return Number.isFinite(count) ? count : undefined;
}

function findValue(value: unknown, keys: string[]): unknown {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  for (const record of walkRecords(value)) {
    for (const [key, item] of Object.entries(record)) {
      if (wanted.has(key.toLowerCase()) && item !== null && item !== '') return item;
    }
  }
  return undefined;
}

function* walkRecords(value: unknown): Generator<JsonRecord> {
  for (const item of walkValues(value)) {
    const record = asRecord(item);
    if (record) yield record;
  }
}

function* walkValues(value: unknown): Generator<unknown> {
  const queue: unknown[] = [value];
  const seen = new Set<object>();
  while (queue.length > 0) {
    const item = queue.shift();
    yield item;
    if (item && typeof item === 'object') {
      if (seen.has(item)) continue;
      seen.add(item);
      if (Array.isArray(item)) queue.push(...item);
      else queue.push(...Object.values(item));
    }
  }
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function firstString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function normalizePublishedAt(value: unknown): string | undefined {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
    const timestamp = Number(value);
    const date = new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  return firstString(value);
}

function extractTopics(description: string): string[] {
  return [...description.matchAll(/#([^\s#，。！？、]+)/g)].map((match) => match[1]).filter(Boolean).slice(0, 12);
}

function titleFromDescription(description: string): string | undefined {
  const text = description.replace(/\s*#[^\s#]+/g, '').trim();
  if (!text) return undefined;
  const firstSentence = text.split(/[。！？\n]/, 1)[0]?.trim() ?? text;
  return firstSentence.length > 56 ? `${firstSentence.slice(0, 56)}…` : firstSentence;
}

function compactObject<T extends Record<string, number | undefined>>(value: T): T | undefined {
  return Object.values(value).some((item) => item !== undefined) ? value : undefined;
}
