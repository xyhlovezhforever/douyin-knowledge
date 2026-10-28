import {
  ArrowLeft,
  ArrowSquareOut,
  CheckCircle,
  Clock,
  GearSix,
  Link as LinkIcon,
  ListBullets,
  MagnifyingGlass,
  Play,
  Quotes,
  SlidersHorizontal,
  Sparkle,
  TextAlignLeft,
  ThumbsUp,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { AnalyzeResponse, ApiError, ConnectorStatus, InsightComment, VideoReport } from '../shared/types';

type TabId = 'overview' | 'transcript' | 'comments' | 'sources';
type RequestState = 'idle' | 'loading' | 'success' | 'error';

const TABS: Array<{ id: TabId; label: string; icon: typeof Sparkle }> = [
  { id: 'overview', label: '概览', icon: Sparkle },
  { id: 'transcript', label: '转写', icon: TextAlignLeft },
  { id: 'comments', label: '评论', icon: Quotes },
  { id: 'sources', label: '来源', icon: LinkIcon },
];

const SIGNAL_LABELS: Record<InsightComment['signal'], string> = {
  question: '问题',
  experience: '经验',
  correction: '纠错',
  resource: '资源',
  discussion: '讨论',
};

export default function App() {
  const [url, setUrl] = useState('');
  const [report, setReport] = useState<VideoReport | null>(null);
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [legalView, setLegalView] = useState<'privacy' | 'terms' | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((response) => response.json())
      .then((payload) => setConnectors(payload.connectors ?? []))
      .catch(() => setConnectors([]));
  }, []);

  const readyConnectors = connectors.filter((connector) => connector.status === 'ready').length;

  async function analyze(event: FormEvent) {
    event.preventDefault();
    const input = url.trim();
    if (!input) {
      setError('请输入视频链接。');
      setErrorCode('INVALID_URL');
      setRequestState('error');
      return;
    }
    try {
      new URL(input);
    } catch {
      setError('链接格式不正确，请检查后重试。');
      setErrorCode('INVALID_URL');
      setRequestState('error');
      return;
    }

    setRequestState('loading');
    setError('');
    setErrorCode('');
    setActiveTab('overview');
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: input }),
      });
      const payload = await response.json() as AnalyzeResponse | ApiError;
      if (!response.ok || !('report' in payload)) {
        if ('code' in payload) setErrorCode(payload.code);
        throw new Error('error' in payload ? payload.error : '分析失败，请稍后重试。');
      }
      setReport(payload.report);
      setRequestState('success');
    } catch (cause) {
      setRequestState('error');
      setError(cause instanceof Error ? cause.message : '分析失败，请稍后重试。');
    }
  }

  async function loadDemo() {
    setRequestState('loading');
    setError('');
    setErrorCode('');
    setActiveTab('overview');
    try {
      const response = await fetch('/api/demo');
      const payload = await response.json() as AnalyzeResponse;
      setReport(payload.report);
      setRequestState('success');
    } catch {
      setRequestState('error');
      setError('示例报告载入失败。');
    }
  }

  if (window.location.pathname !== '/') {
    return <NotFound />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="视评台首页">
          <span className="brand-mark"><ListBullets weight="bold" size={20} /></span>
          <span>视评台</span>
        </a>
        <div className="topbar-actions">
          <button className="connector-pill" type="button" onClick={() => setSettingsOpen(true)}>
            <span className="status-dot" aria-hidden="true" />
            {readyConnectors}/{connectors.length || 4} 连接器
          </button>
          <button className="icon-button" type="button" onClick={() => setSettingsOpen(true)} aria-label="连接器设置" title="连接器设置">
            <GearSix size={20} />
          </button>
        </div>
      </header>

      <main id="main-content" className="workspace">
        <section className="command-section" aria-labelledby="workspace-title">
          <div className="command-heading">
            <div>
              <p className="eyebrow">视频研究工作台</p>
              <h1 id="workspace-title">一个链接，看完视频，也看懂评论</h1>
            </div>
            <button className="secondary-button" type="button" onClick={loadDemo} disabled={requestState === 'loading'}>
              <Play size={18} weight="fill" />载入示例
            </button>
          </div>

          <form className="url-form" onSubmit={analyze} noValidate>
            <LinkIcon className="input-icon" size={20} aria-hidden="true" />
            <label className="sr-only" htmlFor="video-url">视频链接</label>
            <input
              id="video-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="视频链接"
              aria-invalid={requestState === 'error'}
              aria-describedby={error ? 'analysis-error' : undefined}
            />
            {url && (
              <button className="clear-button" type="button" onClick={() => setUrl('')} aria-label="清空链接" title="清空链接">
                <X size={18} />
              </button>
            )}
            <button className="primary-button" type="submit" disabled={requestState === 'loading'}>
              <MagnifyingGlass size={18} weight="bold" />
              {requestState === 'loading' ? '分析中' : '开始分析'}
            </button>
          </form>

          {requestState === 'error' && (
            <div id="analysis-error" className="inline-error" role="alert">
              <WarningCircle size={20} weight="fill" />
              <span>{error}</span>
              {(errorCode === 'CONNECTOR_UNCONFIGURED' || errorCode === 'UNSUPPORTED_PLATFORM') && (
                <button type="button" onClick={() => setSettingsOpen(true)}>查看连接器</button>
              )}
            </div>
          )}
        </section>

        {requestState === 'loading' ? <LoadingReport /> : report ? (
          <ReportView report={report} activeTab={activeTab} onTabChange={setActiveTab} />
        ) : (
          <EmptyWorkspace connectors={connectors} />
        )}
      </main>

      <footer className="footer">
        <span>本地优先 · 仅处理公开内容</span>
        <div>
          <button type="button" onClick={() => setLegalView('privacy')}>隐私</button>
          <button type="button" onClick={() => setLegalView('terms')}>使用条款</button>
        </div>
      </footer>

      {settingsOpen && <SettingsPanel connectors={connectors} onClose={() => setSettingsOpen(false)} />}
      {legalView && <LegalDialog view={legalView} onClose={() => setLegalView(null)} />}
    </div>
  );
}

function ReportView({ report, activeTab, onTabChange }: { report: VideoReport; activeTab: TabId; onTabChange: (tab: TabId) => void }) {
  return (
    <article className="report" aria-labelledby="report-title">
      <header className="report-header">
        <div className="thumbnail-wrap">
          {report.thumbnailUrl ? <img src={report.thumbnailUrl} alt="视频封面" /> : <div className="thumbnail-placeholder"><Play size={32} /></div>}
          {report.durationSeconds ? <span className="duration-badge">{formatDuration(report.durationSeconds)}</span> : null}
        </div>
        <div className="report-meta">
          <div className="meta-row">
            <span className={`platform-badge platform-${report.platform}`}>{platformLabel(report.platform)}</span>
            <span>{report.connector}</span>
            {report.sourceUrl.startsWith('http') && (
              <a href={report.sourceUrl} target="_blank" rel="noreferrer" aria-label="打开原视频" title="打开原视频">
                <ArrowSquareOut size={18} />
              </a>
            )}
          </div>
          <h2 id="report-title">{report.title}</h2>
          <p>{report.author}</p>
          <div className="report-stats">
            <span><Clock size={16} />{formatDate(report.analyzedAt)}</span>
            {report.viewCount !== undefined && <span><Play size={16} />{formatNumber(report.viewCount)} 次观看</span>}
            {report.engagement?.likeCount !== undefined && <span><ThumbsUp size={16} />{formatNumber(report.engagement.likeCount)} 次点赞</span>}
            <span><TextAlignLeft size={16} />{report.totals.transcriptSegments} 段</span>
            <span><Quotes size={16} />{report.totals.commentsFetched} 条评论</span>
          </div>
        </div>
      </header>

      {report.warnings.length > 0 && (
        <div className="warning-strip">
          <WarningCircle size={18} />
          <span>{report.warnings.join(' ')}</span>
        </div>
      )}

      <nav className="tabs" aria-label="报告视图">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} type="button" className={activeTab === tab.id ? 'active' : ''} onClick={() => onTabChange(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined}>
              <Icon size={18} />{tab.label}
              {tab.id === 'comments' && <span>{report.comments.length}</span>}
            </button>
          );
        })}
      </nav>

      <div className="tab-content">
        {activeTab === 'overview' && <Overview report={report} />}
        {activeTab === 'transcript' && <TranscriptView report={report} />}
        {activeTab === 'comments' && <CommentsView report={report} />}
        {activeTab === 'sources' && <SourcesView report={report} />}
      </div>
    </article>
  );
}

function Overview({ report }: { report: VideoReport }) {
  return (
    <div className="overview-grid">
      <section className="summary-section">
        <div className="section-title"><Sparkle size={20} weight="fill" /><h3>内容摘要</h3></div>
        <p className="summary-copy">{report.summary}</p>
        <div className="topic-list" aria-label="主题">
          {report.topics.map((topic) => <span key={topic}>{topic}</span>)}
        </div>
      </section>

      <section className="points-section">
        <div className="section-title"><CheckCircle size={20} weight="fill" /><h3>关键结论</h3></div>
        {report.keyPoints.length > 0 ? (
          <ol>{report.keyPoints.map((point, index) => <li key={`${point}-${index}`}><span>{index + 1}</span><p>{point}</p></li>)}</ol>
        ) : <EmptyLine text="没有可用的关键结论" />}
      </section>

      <section className="comment-highlights">
        <div className="section-heading-row">
          <div className="section-title"><Quotes size={20} weight="fill" /><h3>高价值评论</h3></div>
          <span>{report.comments.length} 条入选</span>
        </div>
        <div className="comment-grid">
          {report.comments.slice(0, 4).map((comment) => <CommentCard key={comment.id} comment={comment} />)}
        </div>
      </section>
    </div>
  );
}

function TranscriptView({ report }: { report: VideoReport }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => report.transcript.filter((segment) => segment.text.toLowerCase().includes(query.toLowerCase())), [query, report.transcript]);
  return (
    <section className="transcript-section">
      <div className="filter-bar">
        <div className="search-field"><MagnifyingGlass size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索转写" aria-label="搜索转写" /></div>
        <span>{filtered.length} 段</span>
      </div>
      {filtered.length > 0 ? <div className="transcript-list">{filtered.map((segment, index) => (
        <div className="transcript-row" key={`${segment.startMs}-${index}`}>
          <time>{formatTimestamp(segment.startMs)}</time><p>{segment.text}</p>
        </div>
      ))}</div> : <EmptyLine text="没有匹配的转写内容" />}
    </section>
  );
}

function CommentsView({ report }: { report: VideoReport }) {
  const [signal, setSignal] = useState<InsightComment['signal'] | 'all'>('all');
  const comments = signal === 'all' ? report.comments : report.comments.filter((comment) => comment.signal === signal);
  return (
    <section className="comments-section">
      <div className="filter-bar">
        <div className="segmented-control" aria-label="评论类型">
          {(['all', 'correction', 'experience', 'question', 'resource'] as const).map((item) => (
            <button key={item} type="button" className={signal === item ? 'active' : ''} onClick={() => setSignal(item)}>{item === 'all' ? '全部' : SIGNAL_LABELS[item]}</button>
          ))}
        </div>
        <span>{comments.length} 条</span>
      </div>
      {comments.length > 0 ? <div className="comment-grid full">{comments.map((comment) => <CommentCard key={comment.id} comment={comment} />)}</div> : <EmptyLine text="没有这一类型的评论" />}
    </section>
  );
}

function CommentCard({ comment }: { comment: InsightComment }) {
  return (
    <article className="comment-card">
      <div className="comment-card-top">
        <div className="comment-author">
          {comment.avatarUrl ? <img src={comment.avatarUrl} alt="" /> : <span>{comment.author.slice(0, 1).toUpperCase()}</span>}
          <strong>{comment.author}</strong>
        </div>
        <span className={`signal signal-${comment.signal}`}>{SIGNAL_LABELS[comment.signal]}</span>
      </div>
      <p>{comment.text}</p>
      <div className="reason-list">{comment.reasons.map((reason) => <span key={reason}>{reason}</span>)}</div>
      <div className="comment-metrics">
        <span><ThumbsUp size={16} />{formatNumber(comment.likes)}</span>
        <span><Quotes size={16} />{formatNumber(comment.replies)}</span>
        <strong>{comment.score} 分</strong>
      </div>
    </article>
  );
}

function SourcesView({ report }: { report: VideoReport }) {
  return (
    <section className="sources-section">
      <dl>
        <div><dt>原始链接</dt><dd>{report.sourceUrl.startsWith('http') ? <a href={report.sourceUrl} target="_blank" rel="noreferrer">{report.sourceUrl}<ArrowSquareOut size={16} /></a> : report.sourceUrl}</dd></div>
        <div><dt>平台</dt><dd>{platformLabel(report.platform)}</dd></div>
        <div><dt>连接器</dt><dd>{report.connector}</dd></div>
        <div><dt>视频编号</dt><dd>{report.id}</dd></div>
        <div><dt>分析时间</dt><dd>{new Date(report.analyzedAt).toLocaleString('zh-CN')}</dd></div>
        <div><dt>采集范围</dt><dd>{report.totals.transcriptSegments} 段转写，{report.totals.commentsFetched} 条评论，筛选 {report.totals.commentsRanked} 条</dd></div>
        {report.engagement && <div><dt>公开互动数</dt><dd>{formatEngagement(report.engagement)}</dd></div>}
      </dl>
    </section>
  );
}

function EmptyWorkspace({ connectors }: { connectors: ConnectorStatus[] }) {
  return (
    <section className="empty-workspace" aria-label="空工作区">
      <div className="empty-visual">
        <div className="scan-line" />
        <Play size={36} weight="fill" />
        <div className="signal-stack"><span /><span /><span /></div>
      </div>
      <div className="empty-status">
        {connectors.slice(0, 3).map((connector) => (
          <span key={connector.id} className={connector.status === 'ready' ? 'ready' : ''}>{connector.name}</span>
        ))}
      </div>
    </section>
  );
}

function LoadingReport() {
  return (
    <section className="loading-report" aria-label="正在分析" aria-busy="true">
      <div className="skeleton skeleton-media" />
      <div className="skeleton-lines"><span /><span /><span /></div>
      <div className="skeleton-tabs"><span /><span /><span /><span /></div>
      <div className="skeleton-content"><span /><span /><span /></div>
    </section>
  );
}

function SettingsPanel({ connectors, onClose }: { connectors: ConnectorStatus[]; onClose: () => void }) {
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="settings-panel" aria-labelledby="settings-title">
        <div className="drawer-header"><div><p className="eyebrow">系统</p><h2 id="settings-title">连接器</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="关闭设置"><X size={20} /></button></div>
        <div className="connector-list">
          {connectors.map((connector) => (
            <div className="connector-item" key={connector.id}>
              <div className="connector-icon"><SlidersHorizontal size={20} /></div>
              <div><strong>{connector.name}</strong><p>{connector.platforms.map(platformLabel).join(' · ')}</p></div>
              <span className={connector.status}>{connector.status === 'ready' ? '已连接' : '未配置'}</span>
            </div>
          ))}
        </div>
        <div className="config-note">
          <code>.env</code>
          <p>MEDIACRAWLER_CONNECTOR_URL<br />VIDEO_FETCH_CONNECTOR_URL</p>
        </div>
      </aside>
    </div>
  );
}

function LegalDialog({ view, onClose }: { view: 'privacy' | 'terms'; onClose: () => void }) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="legal-dialog" role="dialog" aria-modal="true" aria-labelledby="legal-title">
        <div className="drawer-header"><h2 id="legal-title">{view === 'privacy' ? '隐私说明' : '使用条款'}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X size={20} /></button></div>
        {view === 'privacy' ? <p>应用默认在本机运行。视频链接会发送给已启用的连接器，分析结果不会由本应用另行上传。第三方连接器的数据处理方式以其部署配置为准。</p> : <p>仅处理你有权访问的公开内容。使用者需要遵守目标平台的服务条款、著作权规则与适用法律，不应将连接器用于大规模采集或规避访问控制。</p>}
      </section>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="empty-line"><TextAlignLeft size={20} /><span>{text}</span></div>;
}

function NotFound() {
  return <main className="not-found"><div className="brand-mark"><ListBullets weight="bold" size={24} /></div><p>404</p><h1>页面不存在</h1><a href="/"><ArrowLeft size={18} />返回工作台</a></main>;
}

function formatTimestamp(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number) {
  return formatTimestamp(seconds * 1000);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN', { notation: value >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function platformLabel(platform: string) {
  return ({ youtube: 'YouTube', bilibili: 'B站', douyin: '抖音', xiaohongshu: '小红书', tiktok: 'TikTok', wechat_channels: '微信视频号', unknown: '未知' } as Record<string, string>)[platform] ?? platform;
}

function formatEngagement(engagement: NonNullable<VideoReport['engagement']>) {
  const items = [
    engagement.likeCount !== undefined ? `${formatNumber(engagement.likeCount)} 次点赞` : '',
    engagement.commentCount !== undefined ? `${formatNumber(engagement.commentCount)} 条评论` : '',
    engagement.favoriteCount !== undefined ? `${formatNumber(engagement.favoriteCount)} 次收藏` : '',
    engagement.shareCount !== undefined ? `${formatNumber(engagement.shareCount)} 次转发` : '',
  ].filter(Boolean);
  return items.join('，') || '未公开';
}
