export type Platform = 'youtube' | 'bilibili' | 'douyin' | 'xiaohongshu' | 'tiktok' | 'wechat_channels' | 'unknown';

export type ConnectorStatus = {
  id: string;
  name: string;
  platforms: Platform[];
  status: 'ready' | 'unconfigured' | 'offline';
  detail: string;
};

export type TranscriptSegment = {
  startMs: number;
  endMs: number;
  text: string;
};

export type InsightComment = {
  id: string;
  author: string;
  avatarUrl?: string;
  text: string;
  likes: number;
  replies: number;
  publishedAt?: string;
  score: number;
  signal: 'question' | 'experience' | 'correction' | 'resource' | 'discussion';
  reasons: string[];
};

export type VideoReport = {
  id: string;
  sourceUrl: string;
  platform: Platform;
  connector: string;
  title: string;
  author: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  viewCount?: number;
  engagement?: {
    likeCount?: number;
    commentCount?: number;
    favoriteCount?: number;
    shareCount?: number;
  };
  publishedAt?: string;
  summary: string;
  keyPoints: string[];
  topics: string[];
  transcript: TranscriptSegment[];
  comments: InsightComment[];
  totals: {
    transcriptSegments: number;
    commentsFetched: number;
    commentsRanked: number;
  };
  warnings: string[];
  analyzedAt: string;
};

export type AnalyzeResponse = { report: VideoReport };

export type ApiError = {
  error: string;
  code: string;
  platform?: Platform;
  connector?: string;
};
