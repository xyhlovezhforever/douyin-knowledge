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

export type DouyinSource = 'collection' | 'like';

export type DouyinLibraryItem = {
  id: string;
  source: DouyinSource;
  sourceUrl: string;
  title: string;
  author: string;
  observedAt: string;
  tags: string[];
  transcriptStatus: string;
  summary: string;
  valueJudgment?: string;
  deepAnalysis?: string;
  extensions?: string;
  actionItems?: string;
  relatedKnowledge?: string;
  notePath: string;
};

export type DouyinMonitorStatus = {
  configured: boolean;
  login: 'unknown' | 'ready' | 'action_required' | 'checking';
  running: boolean;
  autoSync: boolean;
  intervalMinutes: number;
  itemCount: number;
  collectionCount: number;
  likeCount: number;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastResult?: string;
  error?: string;
};

export type DouyinStatusResponse = { status: DouyinMonitorStatus };
export type DouyinLibraryResponse = { items: DouyinLibraryItem[]; total: number };

export type AiProviderId = 'alibaba' | 'deepseek';
export type AiQuality = 'fast' | 'balanced' | 'quality';
export type AiProviderPublic = {
  baseUrl: string;
  modelMap: Record<AiQuality, string>;
  configured: boolean;
  apiKeyHint?: string;
};
export type AiConfigPublic = {
  selectedProvider: AiProviderId;
  quality: AiQuality;
  providers: Record<AiProviderId, AiProviderPublic>;
};
export type AiConfigResponse = { config: AiConfigPublic };

export type ApiError = {
  error: string;
  code: string;
  platform?: Platform;
  connector?: string;
};
