import {
  Archive as ArchiveBox,
  ArrowLeft,
  ArrowSquareOut,
  ArrowsClockwise,
  CheckCircle,
  Clock,
  GearSix,
  Heart,
  Link as LinkIcon,
  ListBullets,
  MagnifyingGlass,
  Play,
  Quotes,
  SignIn,
  SlidersHorizontal,
  Sparkle,
  TextAlignLeft,
  ThumbsUp,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import type {
  ConnectorStatus,
  DouyinLibraryItem,
  DouyinLibraryResponse,
  DouyinMonitorStatus,
  DouyinStatusResponse,
  InsightComment,
  VideoReport,
} from '../shared/types';
import AiSettingsPage from './AiSettings';

type TabId = 'overview' | 'transcript' | 'comments' | 'sources';
type WorkspaceMode = 'monitor' | 'ai';

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
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('monitor');
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
        <nav className="workspace-switch" aria-label="工作台模式">
          <button type="button" className={workspaceMode === 'monitor' ? 'active' : ''} onClick={() => setWorkspaceMode('monitor')} aria-current={workspaceMode === 'monitor' ? 'page' : undefined}>
            <ArchiveBox size={18} />收藏监测
          </button>
          <button type="button" className={workspaceMode === 'ai' ? 'active' : ''} onClick={() => setWorkspaceMode('ai')} aria-current={workspaceMode === 'ai' ? 'page' : undefined}>
            <Sparkle size={18} />AI 配置
          </button>
        </nav>
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
        {workspaceMode === 'monitor' ? <DouyinMonitor /> : <AiSettingsPage />}
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

function DouyinMonitor() {
  const [status, setStatus] = useState<DouyinMonitorStatus | null>(null);
  const [items, setItems] = useState<DouyinLibraryItem[]>([]);
  const [source, setSource] = useState<'all' | 'collection' | 'like'>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'login' | 'sync' | null>(null);
  const [error, setError] = useState('');
  const [selectedItem, setSelectedItem] = useState<DouyinLibraryItem | null>(null);

  async function refresh() {
    try {
      const [statusResponse, libraryResponse] = await Promise.all([
        fetch('/api/douyin/status'),
        fetch('/api/douyin/library'),
      ]);
      const statusPayload = await statusResponse.json() as DouyinStatusResponse;
      const libraryPayload = await libraryResponse.json() as DouyinLibraryResponse;
      setStatus(statusPayload.status);
      setItems(libraryPayload.items);
      setError('');
    } catch {
      setError('无法读取收藏监测服务，请确认本地 API 已启动。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), status?.running ? 4_000 : 20_000);
    return () => window.clearInterval(timer);
  }, [status?.running]);

  async function syncNow() {
    setAction('sync');
    setError('');
    try {
      const response = await fetch('/api/douyin/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'all' }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || '同步失败。');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '同步失败。');
    } finally {
      setAction(null);
    }
  }

  async function login() {
    setAction('login');
    setError('');
    try {
      const response = await fetch('/api/douyin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'collection' }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || '无法启动登录。');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法启动登录。');
    } finally {
      setAction(null);
    }
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN');
    return items.filter((item) => {
      if (source !== 'all' && item.source !== source) return false;
      if (!normalized) return true;
      return [item.title, item.author, item.summary, ...item.tags].some((value) => value.toLocaleLowerCase('zh-CN').includes(normalized));
    });
  }, [items, query, source]);

  return (
    <section className="monitor-workspace" aria-labelledby="monitor-title">
      <header className="monitor-heading">
        <div>
          <p className="eyebrow">抖音知识库</p>
          <h1 id="monitor-title">点赞与收藏监测</h1>
          <p className="monitor-state">{monitorState(status)}</p>
        </div>
        <div className="monitor-actions">
          {status?.login !== 'ready' && (
            <button className="secondary-button" type="button" onClick={login} disabled={!status?.configured || Boolean(action) || status?.running}>
              <SignIn size={18} />{action === 'login' ? '等待扫码' : '登录抖音'}
            </button>
          )}
          <button className="primary-button" type="button" onClick={syncNow} disabled={!status?.configured || Boolean(action) || status?.running}>
            <ArrowsClockwise size={18} />{action === 'sync' || status?.running ? '同步中' : '立即同步'}
          </button>
        </div>
      </header>

      {error && <div className="inline-error" role="alert"><WarningCircle size={20} weight="fill" /><span>{error}</span></div>}

      <div className="monitor-stats" aria-label="监测统计">
        <div><strong>{status?.itemCount ?? 0}</strong><span>全部视频</span></div>
        <div><strong>{status?.collectionCount ?? 0}</strong><span>收藏</span></div>
        <div><strong>{status?.likeCount ?? 0}</strong><span>点赞</span></div>
        <div><strong>{status?.intervalMinutes ?? 15}<small> 分钟</small></strong><span>检查间隔</span></div>
      </div>

      <div className="library-toolbar">
        <div className="segmented-control" aria-label="内容来源">
          {(['all', 'collection', 'like'] as const).map((item) => (
            <button key={item} type="button" className={source === item ? 'active' : ''} onClick={() => setSource(item)}>
              {item === 'all' ? '全部' : item === 'collection' ? '收藏' : '点赞'}
            </button>
          ))}
        </div>
        <div className="search-field"><MagnifyingGlass size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、作者或摘要" aria-label="搜索知识库" /></div>
        <span>{filtered.length} 条</span>
      </div>

      {loading ? <LibraryLoading /> : filtered.length > 0 ? (
        <div className="library-grid">
          {filtered.map((item) => <LibraryItem key={`${item.source}-${item.id}`} item={item} onOpen={() => setSelectedItem(item)} />)}
        </div>
      ) : (
        <div className="library-empty">
          <ArchiveBox size={40} />
          <h2>{status?.configured ? '知识库暂无内容' : '收藏监测尚未初始化'}</h2>
          <p>{status?.configured ? '登录后执行一次同步，新增视频会出现在这里。' : '运行 npm run douyin:setup 完成本地初始化。'}</p>
        </div>
      )}
      {selectedItem && <AnalysisPanel item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </section>
  );
}

function LibraryItem({ item, onOpen }: { item: DouyinLibraryItem; onOpen: () => void }) {
  return (
    <article className="library-item">
      <div className="library-item-top">
        <span className={`source-badge source-${item.source}`}>{item.source === 'collection' ? <ArchiveBox size={14} /> : <Heart size={14} weight="fill" />}{item.source === 'collection' ? '收藏' : '点赞'}</span>
        {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" aria-label="打开原视频" title="打开原视频"><ArrowSquareOut size={18} /></a>}
      </div>
      <h2>{item.title}</h2>
      <p className="library-author">{item.author}{item.observedAt ? ` · ${formatDate(item.observedAt)}` : ''}</p>
      <p className="library-summary">{item.summary}</p>
      <div className="topic-list">{item.tags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}</div>
      <div className="library-foot">
        <div><span>{transcriptLabel(item.transcriptStatus)}</span><span>分析已完成</span></div>
        <button type="button" onClick={onOpen}><Sparkle size={16} weight="fill" />查看分析</button>
      </div>
    </article>
  );
}

function AnalysisPanel({ item, onClose }: { item: DouyinLibraryItem; onClose: () => void }) {
  const sections = [
    ['内容摘要', item.summary],
    ['价值判断', item.valueJudgment],
    ['深度分析', item.deepAnalysis],
    ['延展补充', item.extensions],
    ['行动建议', item.actionItems],
    ['关联知识', item.relatedKnowledge],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="analysis-panel" aria-labelledby="analysis-title">
        <div className="drawer-header">
          <div><p className="eyebrow">智能研判</p><h2 id="analysis-title">{item.title}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭分析"><X size={20} /></button>
        </div>
        <div className="analysis-meta"><span>{item.author}</span><span>{item.source === 'collection' ? '收藏' : '点赞'}</span><span>{formatDate(item.observedAt)}</span></div>
        <div className={`analysis-status ${item.transcriptStatus === 'skipped_image' ? 'image' : ''}`}>
          <CheckCircle size={18} weight="fill" />
          <p>{item.transcriptStatus === 'skipped_image' ? '图文作品，当前研判基于作品文案。画面文字尚未进入分析。' : transcriptLabel(item.transcriptStatus)}</p>
        </div>
        <div className="analysis-sections">
          {sections.map(([title, content]) => <section key={title}><h3>{title}</h3><p>{content}</p></section>)}
        </div>
        {item.sourceUrl && <a className="analysis-source" href={item.sourceUrl} target="_blank" rel="noreferrer">打开原作品<ArrowSquareOut size={18} /></a>}
      </aside>
    </div>
  );
}

function LibraryLoading() {
  return <div className="library-grid" aria-label="正在读取知识库" aria-busy="true">{[0, 1, 2, 3].map((item) => <div className="library-skeleton" key={item}><span /><span /><span /><span /></div>)}</div>;
}

function monitorState(status: DouyinMonitorStatus | null): string {
  if (!status) return '正在读取本地状态';
  if (!status.configured) return '等待初始化';
  if (status.running) return '正在检查新增内容';
  if (status.login === 'action_required') return '登录已失效，需要重新扫码';
  if (status.lastResult) return status.lastResult;
  return status.autoSync ? `每 ${status.intervalMinutes} 分钟自动检查` : '自动检查已关闭';
}

function transcriptLabel(status: string): string {
  return ({ success: '语音已转写', screen_text: '画面文字已识别', skipped_image: '图文，仅分析文案', not_requested: '仅分析文案' } as Record<string, string>)[status] ?? '转写未完成';
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
