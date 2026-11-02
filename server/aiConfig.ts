import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { AiConfigPublic, AiProviderId, AiQuality } from '../shared/types.js';

const projectRoot = process.cwd();
export const aiConfigPath = path.resolve(process.env.VIDEO_ANALYSIS_CONFIG || path.join(projectRoot, 'data/ai-config.json'));

const providerSchema = z.object({
  apiKey: z.string().max(512).optional(),
  baseUrl: z.url().max(2048),
  modelMap: z.object({
    fast: z.string().min(1).max(160),
    balanced: z.string().min(1).max(160),
    quality: z.string().min(1).max(160),
  }),
});

export const aiConfigUpdateSchema = z.object({
  selectedProvider: z.enum(['alibaba', 'deepseek']),
  quality: z.enum(['fast', 'balanced', 'quality']),
  providers: z.object({
    alibaba: providerSchema,
    deepseek: providerSchema,
  }),
});

type ProviderConfig = {
  apiKey: string;
  baseUrl: string;
  modelMap: Record<AiQuality, string>;
};

type StoredAiConfig = {
  version: 1;
  selectedProvider: AiProviderId;
  quality: AiQuality;
  providers: Record<AiProviderId, ProviderConfig>;
};

export type VideoAiAnalysis = {
  content_summary: string;
  value_judgment?: string;
  deep_analysis?: string;
  extensions?: string;
  action_items?: string;
  related_knowledge?: string;
  tags?: string[];
};

const defaults: StoredAiConfig = {
  version: 1,
  selectedProvider: 'alibaba',
  quality: 'balanced',
  providers: {
    alibaba: {
      apiKey: '',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      modelMap: { fast: 'qwen3.6-flash', balanced: 'qwen3.6-plus', quality: 'qwen3.6-plus' },
    },
    deepseek: {
      apiKey: '',
      baseUrl: 'https://api.deepseek.com/v1',
      modelMap: { fast: 'deepseek-chat', balanced: 'deepseek-chat', quality: 'deepseek-reasoner' },
    },
  },
};

export async function getAiConfig(): Promise<AiConfigPublic> {
  return publicConfig(await readStoredConfig());
}

export async function updateAiConfig(input: z.infer<typeof aiConfigUpdateSchema>): Promise<AiConfigPublic> {
  const existing = await readStoredConfig();
  const parsed = aiConfigUpdateSchema.parse(input);
  const next: StoredAiConfig = {
    version: 1,
    selectedProvider: parsed.selectedProvider,
    quality: parsed.quality,
    providers: {
      alibaba: mergeProvider(existing.providers.alibaba, parsed.providers.alibaba),
      deepseek: mergeProvider(existing.providers.deepseek, parsed.providers.deepseek),
    },
  };
  await atomicWriteConfig(next);
  return publicConfig(next);
}

export async function testAiProvider(providerId: AiProviderId): Promise<{ provider: AiProviderId; model: string; message: string }> {
  const config = await readStoredConfig();
  const provider = config.providers[providerId];
  if (!provider.apiKey) throw new Error(`${providerName(providerId)}尚未配置 API Key。`);
  const model = provider.modelMap[config.quality];
  await requestChat(provider, model, [
    { role: 'system', content: '只回复“连接正常”。' },
    { role: 'user', content: '测试连接。' },
  ], false);
  return { provider: providerId, model, message: '连接正常' };
}

export async function analyzeVideoMaterial(input: {
  title: string;
  author: string;
  description: string;
  transcript: string;
}): Promise<VideoAiAnalysis> {
  const config = await readStoredConfig();
  const provider = config.providers[config.selectedProvider];
  if (!provider.apiKey) throw new Error(`${providerName(config.selectedProvider)}尚未配置 API Key。`);
  const model = provider.modelMap[config.quality];
  const material = [input.description.trim(), input.transcript.trim()].filter(Boolean).join('\n\n');
  if (!material) return { content_summary: '暂未获得可分析的文字内容。' };
  const prompt = `根据视频描述和转录生成严格 JSON，不要输出 Markdown 或推理过程。
字段：content_summary、value_judgment、deep_analysis、extensions、action_items、related_knowledge、tags。
每个字段使用简洁中文；tags 是 3 到 6 个短标签。不要补造原文没有的事实。
标题：${input.title}
作者：${input.author}
材料：
${material.slice(0, 50000)}`;
  const content = await requestChat(provider, model, [
    { role: 'system', content: '你是视频知识整理助手。只返回一个可解析的 JSON 对象。' },
    { role: 'user', content: prompt },
  ], true);
  const parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim()) as Record<string, unknown>;
  const summary = normalizeText(parsed.content_summary);
  if (!summary) {
    throw new Error('模型返回结果缺少内容摘要。');
  }
  return {
    content_summary: summary,
    value_judgment: normalizeText(parsed.value_judgment),
    deep_analysis: normalizeText(parsed.deep_analysis),
    extensions: normalizeText(parsed.extensions),
    action_items: normalizeText(parsed.action_items, true),
    related_knowledge: normalizeText(parsed.related_knowledge),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).map((tag) => tag.trim()).filter(Boolean).slice(0, 8) : [],
  };
}

function normalizeText(value: unknown, bullets = false): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value)) {
    const parts = value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean);
    if (!parts.length) return undefined;
    return bullets ? parts.map((part) => `- ${part}`).join('\n') : parts.join('；');
  }
  return undefined;
}

async function requestChat(
  provider: ProviderConfig,
  model: string,
  messages: Array<{ role: string; content: string }>,
  jsonMode: boolean,
): Promise<string> {
  const endpoint = `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const payload: Record<string, unknown> = { model, messages, temperature: 0.2, max_tokens: jsonMode ? 1600 : 32 };
  if (jsonMode) payload.response_format = { type: 'json_object' };
  if (/dashscope\.aliyuncs\.com/i.test(provider.baseUrl)) payload.enable_thinking = false;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${provider.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400).replace(provider.apiKey, '[redacted]');
    throw new Error(`模型服务返回 ${response.status}：${detail || '请求失败'}`);
  }
  const body = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('模型服务没有返回文本。');
  return content.trim();
}

async function readStoredConfig(): Promise<StoredAiConfig> {
  try {
    const raw = JSON.parse(await readFile(aiConfigPath, 'utf8')) as Partial<StoredAiConfig>;
    return {
      ...defaults,
      ...raw,
      providers: {
        alibaba: { ...defaults.providers.alibaba, ...raw.providers?.alibaba, modelMap: { ...defaults.providers.alibaba.modelMap, ...raw.providers?.alibaba?.modelMap } },
        deepseek: { ...defaults.providers.deepseek, ...raw.providers?.deepseek, modelMap: { ...defaults.providers.deepseek.modelMap, ...raw.providers?.deepseek?.modelMap } },
      },
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(defaults);
    throw error;
  }
}

function mergeProvider(existing: ProviderConfig, incoming: z.infer<typeof providerSchema>): ProviderConfig {
  return {
    apiKey: incoming.apiKey?.trim() || existing.apiKey,
    baseUrl: incoming.baseUrl.trim().replace(/\/+$/, ''),
    modelMap: incoming.modelMap,
  };
}

function publicConfig(config: StoredAiConfig): AiConfigPublic {
  return {
    selectedProvider: config.selectedProvider,
    quality: config.quality,
    providers: {
      alibaba: publicProvider(config.providers.alibaba),
      deepseek: publicProvider(config.providers.deepseek),
    },
  };
}

function publicProvider(provider: ProviderConfig) {
  return {
    baseUrl: provider.baseUrl,
    modelMap: provider.modelMap,
    configured: Boolean(provider.apiKey),
    apiKeyHint: provider.apiKey ? `••••${provider.apiKey.slice(-4)}` : undefined,
  };
}

function providerName(provider: AiProviderId): string {
  return provider === 'alibaba' ? '阿里云百炼' : 'DeepSeek';
}

async function atomicWriteConfig(config: StoredAiConfig): Promise<void> {
  await mkdir(path.dirname(aiConfigPath), { recursive: true });
  const temporary = `${aiConfigPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, aiConfigPath);
}
