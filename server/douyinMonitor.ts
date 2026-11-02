import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import matter from 'gray-matter';
import type { DouyinLibraryItem, DouyinMonitorStatus, DouyinSource } from '../shared/types.js';
import { acquireProcessLock, processLockIsActive } from './lib/processLock.js';

const projectRoot = process.cwd();
const integrationDir = path.resolve(projectRoot, 'integrations/douyin-favorites-to-knowledge');
const adapterDir = path.resolve(projectRoot, 'integrations/douyin-analysis-adapter');
const toolsDir = path.resolve(projectRoot, '.tools/ffmpeg');
const pythonExecutable = path.join(integrationDir, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const configPath = path.resolve(process.env.DOUYIN_FAVORITES_CONFIG || path.join(projectRoot, 'data/douyin-monitor/config.json'));
const knowledgeDir = path.resolve(process.env.DOUYIN_KNOWLEDGE_DIR || path.join(projectRoot, 'data/douyin-knowledge'));
const syncLockPath = path.resolve(projectRoot, 'data/douyin-monitor/sync.lock');
const intervalMinutes = positiveNumber(process.env.DOUYIN_SYNC_INTERVAL_MINUTES, 15);
const maxItems = positiveNumber(process.env.DOUYIN_MAX_ITEMS, 1000);
const autoSync = process.env.DOUYIN_AUTO_SYNC !== 'false';

type RuntimeState = Pick<DouyinMonitorStatus, 'login' | 'running' | 'lastRunAt' | 'lastSuccessAt' | 'lastResult' | 'error'>;

const runtime: RuntimeState = {
  login: 'unknown',
  running: false,
};

let activeRun: Promise<Record<string, unknown>> | undefined;
let timer: NodeJS.Timeout | undefined;

export function startDouyinMonitor(): void {
  if (!autoSync || timer) return;
  timer = setInterval(() => {
    void syncDouyin('all').catch(() => undefined);
  }, intervalMinutes * 60_000);
  timer.unref();
  setTimeout(() => {
    if (existsSync(configPath)) void syncDouyin('all').catch(() => undefined);
  }, 5_000).unref();
}

export async function getDouyinStatus(): Promise<DouyinMonitorStatus> {
  const items = await listDouyinLibrary();
  const externallyRunning = await processLockIsActive(syncLockPath);
  const running = runtime.running || externallyRunning;
  const lastResult = !running && runtime.lastResult === '已有同步任务运行中'
    ? `已入库 ${items.length} 条`
    : runtime.lastResult;
  return {
    configured: existsSync(configPath),
    login: runtime.login,
    running,
    autoSync,
    intervalMinutes,
    itemCount: items.length,
    collectionCount: items.filter((item) => item.source === 'collection').length,
    likeCount: items.filter((item) => item.source === 'like').length,
    lastRunAt: runtime.lastRunAt,
    lastSuccessAt: runtime.lastSuccessAt,
    lastResult,
    error: runtime.error,
  };
}

export async function listDouyinLibrary(): Promise<DouyinLibraryItem[]> {
  if (!existsSync(knowledgeDir)) return [];
  const entries = await readdir(knowledgeDir, { withFileTypes: true });
  const notes = entries
    .filter((entry) => entry.isFile() && /^(collection|like)-.+\.md$/i.test(entry.name))
    .map(async (entry) => parseDouyinNote(path.join(knowledgeDir, entry.name)));
  const items = (await Promise.all(notes)).filter((item): item is DouyinLibraryItem => Boolean(item));
  return items.sort((left, right) => right.observedAt.localeCompare(left.observedAt));
}

export async function parseDouyinNote(notePath: string): Promise<DouyinLibraryItem | null> {
  try {
    const raw = await readFile(notePath, 'utf8');
    const parsed = matter(raw);
    const data = parsed.data as Record<string, unknown>;
    const source = data.source === 'like' ? 'like' : 'collection';
    return {
      id: stringValue(data.aweme_id) || path.basename(notePath, '.md'),
      source,
      sourceUrl: stringValue(data.source_url),
      title: stringValue(data.title) || '未命名视频',
      author: stringValue(data.author) || '未知作者',
      observedAt: stringValue(data.observed_at),
      tags: Array.isArray(data.tags) ? data.tags.map(String).filter(Boolean) : [],
      transcriptStatus: stringValue(data.transcript_status),
      summary: section(parsed.content, '要点') || section(parsed.content, '原始描述') || '等待生成内容摘要。',
      valueJudgment: section(parsed.content, '价值判断') || undefined,
      deepAnalysis: section(parsed.content, '深度分析') || undefined,
      extensions: section(parsed.content, '延展补充') || undefined,
      actionItems: section(parsed.content, '行动启示') || undefined,
      relatedKnowledge: section(parsed.content, '关联知识') || undefined,
      notePath,
    };
  } catch {
    return null;
  }
}

export async function syncDouyin(source: DouyinSource | 'all'): Promise<Record<string, unknown>> {
  if (activeRun) return activeRun;
  activeRun = runSync(source).finally(() => {
    activeRun = undefined;
  });
  return activeRun;
}

export function startDouyinLogin(source: DouyinSource = 'collection'): boolean {
  if (runtime.running) return false;
  runtime.running = true;
  runtime.login = 'checking';
  runtime.error = undefined;
  const child = commandProcess(['login', '--source', source, '--browser-channel', 'msedge'], false);
  let output = '';
  child.stdout.on('data', (chunk) => { output += String(chunk); });
  child.stderr.on('data', (chunk) => { output += String(chunk); });
  child.on('close', (code) => {
    runtime.running = false;
    runtime.login = code === 0 ? 'ready' : 'action_required';
    runtime.lastResult = cleanOutput(output) || (code === 0 ? '登录完成' : '登录未完成');
    runtime.error = code === 0 ? undefined : runtime.lastResult;
  });
  child.on('error', (error) => {
    runtime.running = false;
    runtime.login = 'action_required';
    runtime.error = error.message;
  });
  return true;
}

async function runSync(source: DouyinSource | 'all'): Promise<Record<string, unknown>> {
  if (!existsSync(configPath)) throw new Error('收藏监测尚未初始化，请先运行 npm run douyin:setup。');
  await mkdir(knowledgeDir, { recursive: true });
  const lock = await acquireProcessLock(syncLockPath);
  if (!lock) {
    runtime.lastResult = '已有同步任务运行中';
    runtime.error = undefined;
    return { status: 'already_running' };
  }
  runtime.running = true;
  runtime.lastRunAt = new Date().toISOString();
  runtime.error = undefined;
  try {
    const sources: DouyinSource[] = source === 'all' ? ['collection', 'like'] : [source];
    const results: Record<string, unknown> = {};
    for (const current of sources) {
      results[current] = await runCommand([
        'sync', '--source', current, '--max-items', String(maxItems), '--no-login-prompt', '--browser-channel', 'msedge',
      ]);
    }
    runtime.login = 'ready';
    runtime.lastSuccessAt = new Date().toISOString();
    runtime.lastResult = summarizeResults(results);
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : '同步失败。';
    runtime.error = message;
    runtime.lastResult = message;
    if (/login|登录|authorization|授权/i.test(message)) runtime.login = 'action_required';
    throw error;
  } finally {
    runtime.running = false;
    await lock.release();
  }
}

function runCommand(args: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const child = commandProcess(args, true);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => {
      const output = cleanOutput(stdout);
      if (code !== 0) {
        reject(new Error(cleanOutput(stderr) || output || `同步命令退出，代码 ${code}`));
        return;
      }
      try {
        resolve(output ? JSON.parse(output.split(/\r?\n/).at(-1) || '{}') : {});
      } catch {
        resolve({ status: 'completed', output });
      }
    });
  });
}

function commandProcess(args: string[], hideWindow: boolean) {
  return spawn(pythonExecutable, ['-m', 'douyin_favorites_knowledge', '--config', configPath, ...args], {
    cwd: projectRoot,
    windowsHide: hideWindow,
    env: {
      ...process.env,
      DOUYIN_FAVORITES_CONFIG: configPath,
      DOUYIN_KNOWLEDGE_DIR: knowledgeDir,
      PYTHONPATH: [path.join(integrationDir, 'src'), adapterDir, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      PATH: [toolsDir, process.env.PATH].filter(Boolean).join(path.delimiter),
      OMP_NUM_THREADS: process.env.OMP_NUM_THREADS || String(Math.max(1, Math.floor(os.cpus().length / 2))),
    },
  });
}

function section(markdown: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = `${markdown}\n## __END__`.match(new RegExp(`^#{2,3} ${escaped}\\s*\\r?\\n+([\\s\\S]*?)(?=^#{2,3} )`, 'm'));
  return match?.[1]?.trim().replace(/\n{3,}/g, '\n\n') ?? '';
}

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cleanOutput(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '').trim().slice(-2000);
}

function summarizeResults(results: Record<string, unknown>): string {
  return Object.entries(results).map(([source, raw]) => {
    const result = raw as Record<string, unknown>;
    const label = source === 'collection' ? '收藏' : '点赞';
    const count = Number(result.promoted_count ?? result.candidate_count ?? 0);
    if (result.status === 'already_running') return `${label}已有同步任务运行中`;
    return result.status === 'no_changes' ? `${label}无新增` : `${label}新增 ${count} 条`;
  }).join('，');
}
