import './env.js';
import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { analyzeUrl, AnalyzeError, connectorStatuses } from './analyze.js';
import { demoReport } from './demo.js';
import { getDouyinStatus, listDouyinLibrary, startDouyinLogin, startDouyinMonitor, syncDouyin } from './douyinMonitor.js';

const app = express();
const port = Number(process.env.PORT || 8787);
const analyzeSchema = z.object({ url: z.url('请输入有效的视频链接。').max(2048) });
const douyinSourceSchema = z.enum(['collection', 'like', 'all']);

app.disable('x-powered-by');
app.use(cors({ origin: /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/ }));
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, connectors: connectorStatuses(), time: new Date().toISOString() });
});

app.get('/api/demo', (_request, response) => {
  response.json({ report: { ...demoReport, analyzedAt: new Date().toISOString() } });
});

app.get('/api/douyin/status', async (_request, response) => {
  response.json({ status: await getDouyinStatus() });
});

app.get('/api/douyin/library', async (request, response) => {
  const source = request.query.source === 'collection' || request.query.source === 'like' ? request.query.source : undefined;
  const query = typeof request.query.q === 'string' ? request.query.q.trim().toLocaleLowerCase('zh-CN') : '';
  const allItems = await listDouyinLibrary();
  const items = allItems.filter((item) => {
    if (source && item.source !== source) return false;
    if (!query) return true;
    return [item.title, item.author, item.summary, ...item.tags].some((value) => value.toLocaleLowerCase('zh-CN').includes(query));
  });
  response.json({ items, total: items.length });
});

app.post('/api/douyin/sync', async (request, response) => {
  const parsed = douyinSourceSchema.safeParse(request.body?.source ?? 'all');
  if (!parsed.success) {
    response.status(400).json({ error: '同步来源必须是收藏、点赞或全部。', code: 'INVALID_SOURCE' });
    return;
  }
  try {
    const result = await syncDouyin(parsed.data);
    response.json({ result, status: await getDouyinStatus() });
  } catch (error) {
    response.status(503).json({
      error: error instanceof Error ? error.message : '同步失败。',
      code: 'DOUYIN_SYNC_FAILED',
      status: await getDouyinStatus(),
    });
  }
});

app.post('/api/douyin/login', (request, response) => {
  const source = request.body?.source === 'like' ? 'like' : 'collection';
  const started = startDouyinLogin(source);
  response.status(started ? 202 : 409).json(started
    ? { status: 'started' }
    : { error: '已有登录或同步任务正在运行。', code: 'DOUYIN_BUSY' });
});

app.post('/api/analyze', async (request, response) => {
  const parsed = analyzeSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message ?? '链接格式不正确。', code: 'INVALID_URL' });
    return;
  }

  try {
    const report = await analyzeUrl(parsed.data.url);
    response.json({ report });
  } catch (error) {
    if (error instanceof AnalyzeError) {
      const status = error.code === 'CONNECTOR_UNCONFIGURED'
        ? 503
        : error.code === 'WECHAT_CONTENT_UNAVAILABLE' || error.code === 'CONTENT_UNAVAILABLE' ? 422 : 502;
      response.status(status).json({ error: error.message, code: error.code, platform: error.platform, connector: error.connector });
      return;
    }
    response.status(500).json({ error: '服务暂时无法完成分析。', code: 'INTERNAL_ERROR' });
  }
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Video Insight API listening on http://127.0.0.1:${port}`);
});

startDouyinMonitor();
