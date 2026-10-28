import './env.js';
import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { analyzeUrl, AnalyzeError, connectorStatuses } from './analyze.js';
import { demoReport } from './demo.js';

const app = express();
const port = Number(process.env.PORT || 8787);
const analyzeSchema = z.object({ url: z.url('请输入有效的视频链接。').max(2048) });

app.disable('x-powered-by');
app.use(cors({ origin: /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/ }));
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, connectors: connectorStatuses(), time: new Date().toISOString() });
});

app.get('/api/demo', (_request, response) => {
  response.json({ report: { ...demoReport, analyzedAt: new Date().toISOString() } });
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
