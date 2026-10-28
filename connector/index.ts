import '../server/env.js';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import express, { type Response } from 'express';
import type { Platform, TranscriptSegment, VideoReport } from '../shared/types.js';
import { rankComments, parseCompactNumber, type RawComment } from '../server/lib/comments.js';
import { buildSummary } from '../server/lib/summarize.js';
import { detectPlatform } from '../server/platform.js';

const execFileAsync = promisify(execFile);
const app = express();
const port = Number(process.env.CONNECTOR_PORT || 8902);
const root = process.cwd();
const ytDlp = path.join(root, 'integrations', 'video-fetch-yjf', '.venv', 'Scripts', 'yt-dlp.exe');
const videoFetchPython = path.join(root, 'integrations', 'video-fetch-yjf', '.venv', 'Scripts', 'python.exe');
const xhsMetadataScript = path.join(root, 'connector', 'xhs_meta.py');
const mediaCrawlerBase = process.env.MEDIACRAWLER_API_URL || 'http://127.0.0.1:8901/api';

app.use(express.json({ limit: '64kb' }));

app.get('/health', async (_request, response) => {
  const mediaCrawler = await fetch(`${mediaCrawlerBase}/health`).then((result) => result.ok).catch(() => false);
  response.json({ ok: true, videoFetch: true, mediaCrawler });
});

app.post('/video-fetch/analyze', async (request, response) => {
  await handleAnalyze(response, () => analyzeWithYtDlp(request.body?.url));
});

app.post('/mediacrawler/analyze', async (request, response) => {
  await handleAnalyze(response, () => analyzeWithMediaCrawler(request.body?.url));
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Local connector listening on http://127.0.0.1:${port}`);
});

async function handleAnalyze(response: Response, task: () => Promise<VideoReport>) {
  try {
    response.json({ report: await task() });
  } catch (error) {
    response.status(422).json({ error: messageOf(error) });
  }
}

async function analyzeWithYtDlp(input: unknown): Promise<VideoReport> {
  const url = extractUrl(input);
  const platform = supportedPlatform(url);
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(ytDlp, [
      '--dump-single-json',
      '--skip-download',
      '--no-warnings',
      '--no-playlist',
      '--write-comments',
      '--extractor-retries', '2',
      '--socket-timeout', '20',
      url,
    ], {
      cwd: root,
      windowsHide: true,
      timeout: 100_000,
      maxBuffer: 64 * 1024 * 1024,
    }));
  } catch (error) {
    const detail = messageOf(error);
    if (platform === 'xiaohongshu' && /No video formats found/i.test(detail)) return analyzeXhsImageNote(url);
    throw error;
  }
  const info = JSON.parse(stdout) as Record<string, unknown>;
  const transcript = await transcriptFromInfo(info);
  const rawComments = rawCommentsFromYtDlp(info.comments);
  const comments = rankComments(rawComments);
  const summary = buildSummary(transcript, stringOf(info.description) ?? '');

  return {
    id: stringOf(info.id) ?? url,
    sourceUrl: url,
    platform,
    connector: 'video-fetch-yjf',
    title: stringOf(info.title) ?? '未命名视频',
    author: stringOf(info.uploader) ?? stringOf(info.channel) ?? stringOf(info.creator) ?? '未知作者',
    thumbnailUrl: stringOf(info.thumbnail),
    durationSeconds: numberOf(info.duration),
    viewCount: numberOf(info.view_count),
    engagement: compactEngagement({
      likeCount: numberOf(info.like_count),
      commentCount: numberOf(info.comment_count),
      favoriteCount: numberOf(info.favorite_count),
      shareCount: numberOf(info.repost_count),
    }),
    publishedAt: isoFromTimestamp(info.timestamp ?? info.release_timestamp),
    summary: summary.summary,
    keyPoints: summary.keyPoints,
    topics: summary.topics,
    transcript,
    comments,
    totals: {
      transcriptSegments: transcript.length,
      commentsFetched: rawComments.length,
      commentsRanked: comments.length,
    },
    warnings: buildWarnings(platform, transcript, rawComments),
    analyzedAt: new Date().toISOString(),
  };
}

async function analyzeXhsImageNote(url: string): Promise<VideoReport> {
  const { stdout } = await execFileAsync(videoFetchPython, [xhsMetadataScript, url], {
    cwd: root,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    windowsHide: true,
    timeout: 40_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const payload = JSON.parse(stdout) as { url?: string; note?: Record<string, unknown>; error?: string };
  if (!payload.note) throw new Error(payload.error || '小红书公开页面没有返回笔记数据。');
  const note = payload.note;
  const user = isRecord(note.user) ? note.user : {};
  const interaction = isRecord(note.interactInfo) ? note.interactInfo : {};
  const images = Array.isArray(note.imageList) ? note.imageList.filter(isRecord) : [];
  const description = stringOf(note.desc) ?? '';
  const summary = buildSummary([], description);
  const tags = Array.isArray(note.tagList)
    ? note.tagList.flatMap((item) => typeof item === 'string' ? [item] : isRecord(item) && typeof item.name === 'string' ? [item.name] : [])
    : [];

  return {
    id: stringOf(note.noteId) ?? url,
    sourceUrl: payload.url ?? url,
    platform: 'xiaohongshu',
    connector: 'video-fetch-yjf',
    title: stringOf(note.title) ?? description.split(/\r?\n/, 1)[0] ?? '小红书图文笔记',
    author: stringOf(user.nickname) ?? '未知作者',
    thumbnailUrl: images.map((image) => firstString(image, ['urlDefault', 'urlPre', 'url'])).find(Boolean),
    engagement: compactEngagement({
      likeCount: numberOf(interaction.likedCount),
      commentCount: numberOf(interaction.commentCount),
      favoriteCount: numberOf(interaction.collectedCount),
      shareCount: numberOf(interaction.shareCount),
    }),
    publishedAt: isoFromTimestamp(note.time),
    summary: summary.summary,
    keyPoints: summary.keyPoints,
    topics: tags.slice(0, 12),
    transcript: [],
    comments: [],
    totals: { transcriptSegments: 0, commentsFetched: 0, commentsRanked: 0 },
    warnings: [
      '该内容是图文笔记，没有音视频轨，因此不生成转写。',
      '匿名公开页面不提供评论正文；可使用已登录的 MediaCrawler 获取评论。',
    ],
    analyzedAt: new Date().toISOString(),
  };
}

async function analyzeWithMediaCrawler(input: unknown): Promise<VideoReport> {
  let url = extractUrl(input);
  const platform = supportedPlatform(url);
  if (platform === 'douyin') url = await resolveDouyinUrl(url);
  const crawlerPlatform = ({ bilibili: 'bili', douyin: 'dy', xiaohongshu: 'xhs' } as Partial<Record<Platform, string>>)[platform];
  if (!crawlerPlatform) throw new Error('MediaCrawler 当前不支持该平台。');

  const health = await fetch(`${mediaCrawlerBase}/health`).catch(() => undefined);
  if (!health?.ok) throw new Error('MediaCrawler 服务未启动。');
  const startedAt = Date.now() / 1000;
  const start = await fetch(`${mediaCrawlerBase}/crawler/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      platform: crawlerPlatform,
      login_type: 'qrcode',
      crawler_type: 'detail',
      specified_ids: url,
      enable_comments: true,
      enable_sub_comments: false,
      enable_media: false,
      save_option: 'json',
      headless: false,
      max_notes_count: 1,
      max_comments_count: 24,
    }),
  });
  if (!start.ok) {
    const detail = await start.text();
    throw new Error(detail.includes('already running')
      ? 'MediaCrawler 正在等待登录或处理上一条任务，请完成浏览器中的扫码后重试。'
      : `MediaCrawler 启动失败：${detail}`);
  }

  const completed = await waitForMediaCrawler();
  if (!completed) throw new Error('MediaCrawler 正在等待平台扫码登录，请在弹出的浏览器中完成登录后重试。');
  const { contents, comments } = await readMediaCrawlerOutput(crawlerPlatform, startedAt);
  if (contents.length === 0) throw new Error('MediaCrawler 未返回内容，链接可能失效或当前登录态无权访问。');

  const content = contents.at(-1) as Record<string, unknown>;
  const contentId = firstString(content, ['aweme_id', 'note_id', 'video_id', 'bvid']) ?? url;
  const related = comments.filter((comment) => {
    const id = firstString(comment, ['aweme_id', 'note_id', 'video_id']);
    return !id || id === contentId;
  });
  const rawComments = related.map(rawCommentFromCrawler).filter((item): item is RawComment => Boolean(item));
  const ranked = rankComments(rawComments);
  const summary = buildSummary([], firstString(content, ['desc', 'description', 'title']) ?? '');

  return {
    id: contentId,
    sourceUrl: url,
    platform,
    connector: 'MediaCrawler',
    title: firstString(content, ['title', 'desc']) ?? '未命名内容',
    author: firstString(content, ['nickname', 'user_name']) ?? '未知作者',
    thumbnailUrl: firstUrl(content, ['cover_url', 'image_list']),
    engagement: compactEngagement({
      likeCount: firstNumber(content, ['liked_count']),
      commentCount: firstNumber(content, ['comment_count']),
      favoriteCount: firstNumber(content, ['collected_count']),
      shareCount: firstNumber(content, ['share_count']),
    }),
    publishedAt: isoFromTimestamp(firstValue(content, ['create_time', 'time', 'publish_time'])),
    summary: summary.summary,
    keyPoints: summary.keyPoints,
    topics: splitTopics(firstString(content, ['tag_list'])),
    transcript: [],
    comments: ranked,
    totals: { transcriptSegments: 0, commentsFetched: rawComments.length, commentsRanked: ranked.length },
    warnings: ['MediaCrawler 提供公开内容与评论，但当前结果没有可用字幕。'],
    analyzedAt: new Date().toISOString(),
  };
}

async function resolveDouyinUrl(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.hostname !== 'v.douyin.com') return url;
  const response = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  const resolved = new URL(response.url);
  if (resolved.hostname === 'www.douyin.com' && (resolved.pathname === '/' || resolved.pathname === '/home')) {
    throw new Error('该抖音分享链接已失效或没有指向具体视频，请重新复制视频分享链接。');
  }
  return resolved.toString();
}

async function waitForMediaCrawler(): Promise<boolean> {
  const deadline = Date.now() + 105_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const response = await fetch(`${mediaCrawlerBase}/crawler/status`);
    if (!response.ok) throw new Error('无法读取 MediaCrawler 任务状态。');
    const status = await response.json() as { status?: string; error_message?: string };
    if (status.status === 'idle') return true;
    if (status.status === 'error') throw new Error(status.error_message || 'MediaCrawler 执行失败。');
  }
  return false;
}

async function readMediaCrawlerOutput(platform: string, startedAt: number): Promise<{ contents: unknown[]; comments: Array<Record<string, unknown>> }> {
  const response = await fetch(`${mediaCrawlerBase}/data/files?platform=${encodeURIComponent(platform)}&file_type=json`);
  if (!response.ok) throw new Error('无法读取 MediaCrawler 输出文件。');
  const payload = await response.json() as { files?: Array<{ name: string; path: string; modified_at: number }> };
  const files = (payload.files ?? []).filter((file) => file.modified_at >= startedAt - 2);
  const contentFile = files.find((file) => /contents|videos/i.test(file.name));
  const commentFile = files.find((file) => /comments/i.test(file.name));
  return {
    contents: contentFile ? await readCrawlerFile(contentFile.path) : [],
    comments: (commentFile ? await readCrawlerFile(commentFile.path) : []).filter(isRecord),
  };
}

async function readCrawlerFile(filePath: string): Promise<unknown[]> {
  const encoded = filePath.split(/[\\/]/).map(encodeURIComponent).join('/');
  const response = await fetch(`${mediaCrawlerBase}/data/files/${encoded}?limit=200`);
  if (!response.ok) return [];
  const payload = await response.json() as { data?: unknown };
  return Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
}

async function transcriptFromInfo(info: Record<string, unknown>): Promise<TranscriptSegment[]> {
  const subtitles: Record<string, unknown> = {
    ...(isRecord(info.automatic_captions) ? info.automatic_captions : {}),
    ...(isRecord(info.subtitles) ? info.subtitles : {}),
  };
  const languages = ['zh-Hans', 'zh-CN', 'zh', 'ai-zh', 'en', ...Object.keys(subtitles)];
  for (const language of languages) {
    const tracks = subtitles[language];
    if (!Array.isArray(tracks)) continue;
    const track = tracks.find((item) => isRecord(item) && ['json3', 'vtt', 'srv3'].includes(String(item.ext))) ?? tracks[0];
    if (!isRecord(track) || typeof track.url !== 'string') continue;
    try {
      const response = await fetch(track.url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) continue;
      const parsed = parseSubtitle(await response.text());
      if (parsed.length > 0) return parsed;
    } catch {
      continue;
    }
  }
  return [];
}

function parseSubtitle(text: string): TranscriptSegment[] {
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    if (Array.isArray(json.body)) {
      return json.body.flatMap((item) => isRecord(item) && typeof item.content === 'string' ? [{
        startMs: Math.round(Number(item.from) * 1000),
        endMs: Math.round(Number(item.to) * 1000),
        text: item.content.trim(),
      }] : []);
    }
    if (Array.isArray(json.events)) {
      return json.events.flatMap((event) => {
        if (!isRecord(event) || !Array.isArray(event.segs)) return [];
        const value = event.segs.map((segment) => isRecord(segment) ? stringOf(segment.utf8) ?? '' : '').join('').trim();
        const startMs = numberOf(event.tStartMs) ?? 0;
        return value ? [{ startMs, endMs: startMs + (numberOf(event.dDurationMs) ?? 0), text: value }] : [];
      });
    }
  } catch {
    // Continue with WebVTT parsing.
  }
  const cue = /(\d{2}:\d{2}:\d{2}[.,]\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}[.,]\d{3})[^\n]*\n([\s\S]*?)(?=\n\s*\n|$)/g;
  return [...text.matchAll(cue)].flatMap((match) => {
    const value = match[3].replace(/<[^>]+>/g, '').replace(/\n/g, ' ').trim();
    return value ? [{ startMs: cueTime(match[1]), endMs: cueTime(match[2]), text: value }] : [];
  });
}

function rawCommentsFromYtDlp(value: unknown): RawComment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const text = firstString(item, ['text', 'content']);
    if (!text) return [];
    return [{
      id: firstString(item, ['id']) ?? `comment-${index}`,
      author: firstString(item, ['author', 'author_id']) ?? '平台用户',
      text,
      likes: firstNumber(item, ['like_count', 'likes']) ?? 0,
      replies: firstNumber(item, ['reply_count', 'replies']) ?? 0,
      publishedAt: firstString(item, ['time_text']) ?? isoFromTimestamp(firstValue(item, ['timestamp'])),
    }];
  });
}

function rawCommentFromCrawler(item: Record<string, unknown>): RawComment | undefined {
  const text = firstString(item, ['content', 'text']);
  if (!text) return undefined;
  return {
    id: firstString(item, ['comment_id', 'id']) ?? `${Date.now()}-${Math.random()}`,
    author: firstString(item, ['nickname', 'user_name']) ?? '平台用户',
    text,
    likes: firstNumber(item, ['like_count', 'liked_count']) ?? 0,
    replies: firstNumber(item, ['sub_comment_count']) ?? 0,
    publishedAt: isoFromTimestamp(firstValue(item, ['create_time'])),
  };
}

function extractUrl(input: unknown): string {
  if (typeof input !== 'string') throw new Error('缺少视频链接。');
  const match = input.match(/https?:\/\/[^\s]+/i);
  if (!match) throw new Error('分享文本中没有可识别的视频链接。');
  return match[0].replace(/[，。！？、；;,)）\]]+$/g, '');
}

function supportedPlatform(url: string): Exclude<Platform, 'unknown'> {
  const platform = detectPlatform(url);
  if (platform === 'unknown') throw new Error('暂不支持该链接来源。');
  return platform;
}

function firstValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) if (record[key] !== undefined && record[key] !== null && record[key] !== '') return record[key];
  return undefined;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  return stringOf(firstValue(record, keys));
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  const value = firstValue(record, keys);
  return typeof value === 'string' || typeof value === 'number' ? parseCompactNumber(value) : undefined;
}

function firstUrl(record: Record<string, unknown>, keys: string[]): string | undefined {
  const value = firstString(record, keys);
  return value?.split(',').find((item) => /^https?:\/\//i.test(item));
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : typeof value === 'string' && Number.isFinite(Number(value)) ? Number(value) : undefined;
}

function isoFromTimestamp(value: unknown): string | undefined {
  const number = numberOf(value);
  if (number === undefined) return stringOf(value);
  const date = new Date(number < 10_000_000_000 ? number * 1000 : number);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function compactEngagement(value: NonNullable<VideoReport['engagement']>): VideoReport['engagement'] {
  return Object.values(value).some((item) => item !== undefined) ? value : undefined;
}

function buildWarnings(platform: Platform, transcript: TranscriptSegment[], comments: RawComment[]): string[] {
  const warnings: string[] = [];
  if (transcript.length === 0) warnings.push('该平台没有返回可用字幕；需要完整文字稿时可启用本地 ASR。');
  if (comments.length === 0) warnings.push(platform === 'tiktok'
    ? 'TikTok 没有向匿名连接器返回评论正文。'
    : '该平台没有向匿名连接器返回评论正文，可尝试已登录的 MediaCrawler。');
  return warnings;
}

function splitTopics(value: string | undefined): string[] {
  return value?.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 12) ?? [];
}

function cueTime(value: string): number {
  const [hours, minutes, rest] = value.replace(',', '.').split(':');
  return Math.round((Number(hours) * 3600 + Number(minutes) * 60 + Number(rest)) * 1000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string') {
    const lines = error.stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return lines.at(-1)?.replace(/^ERROR:\s*/i, '') ?? '连接器执行失败。';
  }
  return error instanceof Error ? error.message : '连接器执行失败。';
}
