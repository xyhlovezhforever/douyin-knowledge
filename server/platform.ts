import type { Platform } from '../shared/types.js';

const HOSTS: Array<[Platform, RegExp]> = [
  ['youtube', /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i],
  ['bilibili', /(^|\.)bilibili\.com$|(^|\.)b23\.tv$/i],
  ['douyin', /(^|\.)douyin\.com$|(^|\.)iesdouyin\.com$/i],
  ['xiaohongshu', /(^|\.)xiaohongshu\.com$|(^|\.)xhslink\.com$/i],
  ['tiktok', /(^|\.)tiktok\.com$/i],
];

export function detectPlatform(input: string): Platform {
  try {
    const url = new URL(input);
    if (isWechatChannelsUrl(url)) return 'wechat_channels';
    return HOSTS.find(([, pattern]) => pattern.test(url.hostname))?.[0] ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function isWechatChannelsUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  if ((hostname === 'weixin.qq.com' || hostname.endsWith('.weixin.qq.com')) && /^\/sph\/[^/]+\/?$/i.test(url.pathname)) {
    return true;
  }
  return hostname === 'channels.weixin.qq.com'
    && /^\/finder-preview\/pages\/sph\/?$/i.test(url.pathname)
    && Boolean(url.searchParams.get('id'));
}

export function getYouTubeVideoId(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.hostname.endsWith('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] ?? null;
    if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] ?? null;
    if (url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2] ?? null;
    return url.searchParams.get('v');
  } catch {
    return null;
  }
}
