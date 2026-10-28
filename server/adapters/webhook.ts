import type { Platform, VideoReport } from '../../shared/types.js';
import type { VideoAdapter } from './types.js';

type WebhookAdapterOptions = {
  id: string;
  name: string;
  platforms: Platform[];
  endpoint?: string;
  token?: string;
};

export function createWebhookAdapter(options: WebhookAdapterOptions): VideoAdapter {
  return {
    id: options.id,
    name: options.name,
    platforms: options.platforms,
    isReady: () => Boolean(options.endpoint),
    async analyze(url, platform) {
      if (!options.endpoint) throw new Error(`${options.name} 尚未配置连接地址。`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      try {
        const response = await fetch(options.endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
          },
          body: JSON.stringify({ url, platform }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => undefined) as { error?: string } | undefined;
          throw new Error(detail?.error || `${options.name} 返回 HTTP ${response.status}`);
        }
        const payload = await response.json() as VideoReport | { report: VideoReport };
        const report = 'report' in payload ? payload.report : payload;
        if (!report?.title || !Array.isArray(report.comments) || !Array.isArray(report.transcript)) {
          throw new Error(`${options.name} 返回的数据不符合统一报告格式。`);
        }
        return { ...report, connector: options.name, sourceUrl: url, platform };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
