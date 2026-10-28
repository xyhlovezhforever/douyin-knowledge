import type { ConnectorStatus, Platform, VideoReport } from '../shared/types.js';
import { WECHAT_CONTENT_UNAVAILABLE, WechatChannelsUnavailableError, wechatChannelsAdapter } from './adapters/wechatChannels.js';
import { createWebhookAdapter } from './adapters/webhook.js';
import type { VideoAdapter } from './adapters/types.js';
import { youtubeAdapter } from './adapters/youtube.js';
import { detectPlatform } from './platform.js';

const mediaCrawler = createWebhookAdapter({
  id: 'mediacrawler',
  name: 'MediaCrawler',
  platforms: ['bilibili', 'douyin', 'xiaohongshu'],
  endpoint: process.env.MEDIACRAWLER_CONNECTOR_URL,
  token: process.env.MEDIACRAWLER_CONNECTOR_TOKEN,
});

const videoFetch = createWebhookAdapter({
  id: 'video-fetch',
  name: 'video-fetch-yjf',
  platforms: ['youtube', 'bilibili', 'douyin', 'xiaohongshu', 'tiktok', 'wechat_channels'],
  endpoint: process.env.VIDEO_FETCH_CONNECTOR_URL,
  token: process.env.VIDEO_FETCH_CONNECTOR_TOKEN,
});

const adapters: VideoAdapter[] = [youtubeAdapter, videoFetch, mediaCrawler, wechatChannelsAdapter];

export function connectorStatuses(): ConnectorStatus[] {
  return adapters.map((adapter) => ({
    id: adapter.id,
    name: adapter.name,
    platforms: adapter.platforms,
    status: adapter.isReady() ? 'ready' : 'unconfigured',
    detail: adapter.isReady() ? '连接正常' : '等待配置连接地址',
  }));
}

export async function analyzeUrl(url: string): Promise<VideoReport> {
  const platform = detectPlatform(url);
  if (platform === 'unknown') throw new AnalyzeError('暂不支持该链接来源。', 'UNSUPPORTED_PLATFORM', platform);
  if (platform === 'wechat_channels') return analyzeWechatChannels(url);
  if (platform === 'youtube') return runSingleAdapter(youtubeAdapter, url, platform);

  const candidates = adapters.filter((adapter) => adapter.platforms.includes(platform) && adapter.isReady());
  if (candidates.length === 0) {
    throw new AnalyzeError(
      `${platformName(platform)} 连接器尚未配置。请在 .env 中设置 MediaCrawler 或 video-fetch-yjf 的连接地址。`,
      'CONNECTOR_UNCONFIGURED',
      platform,
    );
  }

  const failures: string[] = [];
  for (const adapter of candidates) {
    try {
      const report = await adapter.analyze(url, platform);
      if (failures.length > 0) report.warnings.unshift(`${failures[0]}，已自动切换到 ${adapter.name}。`);
      return report;
    } catch (error) {
      failures.push(`${adapter.name} 不可用：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }
  const expiredLink = failures.find((failure) => failure.includes('分享链接已失效'));
  if (expiredLink) {
    throw new AnalyzeError(expiredLink.slice(expiredLink.indexOf('：') + 1), 'CONTENT_UNAVAILABLE', platform, candidates.at(-1)?.name);
  }
  throw new AnalyzeError(`提取失败：${failures.join('；')}`, 'EXTRACTION_FAILED', platform, candidates.at(-1)?.name);
}

async function runSingleAdapter(adapter: VideoAdapter, url: string, platform: Platform): Promise<VideoReport> {
  try {
    return await adapter.analyze(url, platform);
  } catch (error) {
    const cause = error instanceof Error ? error.message : '未知错误';
    throw new AnalyzeError(`提取失败：${cause}`, 'EXTRACTION_FAILED', platform, adapter.name);
  }
}

async function analyzeWechatChannels(url: string): Promise<VideoReport> {
  const externalFailure = videoFetch.isReady()
    ? await tryAdapter(videoFetch, url, 'wechat_channels')
    : undefined;
  if (externalFailure?.report) return externalFailure.report;

  try {
    const report = await wechatChannelsAdapter.analyze(url, 'wechat_channels');
    if (externalFailure?.error) {
      report.warnings.unshift('video-fetch-yjf 暂时不可用，已回退到视频号公开元数据。');
    }
    return report;
  } catch (error) {
    if (error instanceof WechatChannelsUnavailableError) {
      throw new AnalyzeError(WECHAT_CONTENT_UNAVAILABLE, 'WECHAT_CONTENT_UNAVAILABLE', 'wechat_channels', wechatChannelsAdapter.name);
    }
    const cause = error instanceof Error ? error.message : '未知错误';
    throw new AnalyzeError(`视频号公开元数据提取失败：${cause}`, 'EXTRACTION_FAILED', 'wechat_channels', wechatChannelsAdapter.name);
  }
}

async function tryAdapter(adapter: VideoAdapter, url: string, platform: Platform): Promise<{ report?: VideoReport; error?: unknown }> {
  try {
    return { report: await adapter.analyze(url, platform) };
  } catch (error) {
    return { error };
  }
}

function platformName(platform: Platform): string {
  return ({ youtube: 'YouTube', bilibili: 'B站', douyin: '抖音', xiaohongshu: '小红书', tiktok: 'TikTok', wechat_channels: '微信视频号', unknown: '未知平台' })[platform];
}

export class AnalyzeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly platform: Platform,
    public readonly connector?: string,
  ) {
    super(message);
  }
}
