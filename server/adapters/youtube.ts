import { Innertube } from 'youtubei.js';
import type { TranscriptSegment, VideoReport } from '../../shared/types.js';
import { getYouTubeVideoId } from '../platform.js';
import { rankComments, parseCompactNumber, type RawComment } from '../lib/comments.js';
import { buildSummary } from '../lib/summarize.js';
import type { VideoAdapter } from './types.js';

let clientPromise: Promise<Innertube> | undefined;

function getClient(): Promise<Innertube> {
  clientPromise ??= Innertube.create({ retrieve_player: false });
  return clientPromise;
}

export const youtubeAdapter: VideoAdapter = {
  id: 'youtubei',
  name: 'YouTube.js',
  platforms: ['youtube'],
  isReady: () => true,
  async analyze(url): Promise<VideoReport> {
    const videoId = getYouTubeVideoId(url);
    if (!videoId) throw new Error('无法从链接中识别 YouTube 视频编号。');

    const youtube = await getClient();
    const info = await youtube.getInfo(videoId);
    const basic = info.basic_info;
    const warnings: string[] = [];
    let transcript: TranscriptSegment[] = [];
    let rawComments: RawComment[] = [];

    try {
      const transcriptInfo = await info.getTranscript();
      const segments = transcriptInfo.transcript.content?.body?.initial_segments ?? [];
      transcript = segments.flatMap((segment: any) => {
        if (segment.constructor?.name !== 'TranscriptSegment') return [];
        const text = segment.snippet?.toString().trim();
        if (!text) return [];
        return [{ startMs: Number(segment.start_ms) || 0, endMs: Number(segment.end_ms) || 0, text }];
      });
    } catch (error) {
      warnings.push(`字幕不可用：${messageOf(error)}`);
    }

    try {
      const comments = await youtube.getComments(videoId, 'TOP_COMMENTS');
      rawComments = comments.contents.flatMap((thread: any) => {
        const comment = thread.comment;
        const text = comment?.content?.toString().trim();
        if (!comment || !text) return [];
        return [{
          id: comment.comment_id,
          author: comment.author?.name || 'YouTube 用户',
          avatarUrl: comment.author?.best_thumbnail?.url,
          text,
          likes: parseCompactNumber(comment.like_count),
          replies: parseCompactNumber(comment.reply_count),
          publishedAt: comment.published_time,
        } satisfies RawComment];
      });
    } catch (error) {
      warnings.push(`评论不可用：${messageOf(error)}`);
    }

    const summary = buildSummary(transcript, basic.short_description ?? '');
    const rankedComments = rankComments(rawComments);
    const thumbnails = basic.thumbnail ?? [];

    return {
      id: videoId,
      sourceUrl: url,
      platform: 'youtube',
      connector: 'YouTube.js',
      title: basic.title || '未命名视频',
      author: basic.author || basic.channel?.name || '未知作者',
      thumbnailUrl: thumbnails.at(-1)?.url,
      durationSeconds: basic.duration,
      viewCount: basic.view_count,
      summary: summary.summary,
      keyPoints: summary.keyPoints,
      topics: summary.topics,
      transcript,
      comments: rankedComments,
      totals: {
        transcriptSegments: transcript.length,
        commentsFetched: rawComments.length,
        commentsRanked: rankedComments.length,
      },
      warnings,
      analyzedAt: new Date().toISOString(),
    };
  },
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}
