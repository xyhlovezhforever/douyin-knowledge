import {
  Brain,
  CheckCircle,
  Eye,
  EyeSlash,
  FloppyDisk,
  PlugsConnected,
  Sparkle,
  WarningCircle,
} from '@phosphor-icons/react';
import { FormEvent, useEffect, useState } from 'react';
import type { AiConfigPublic, AiConfigResponse, AiProviderId, AiQuality, ApiError } from '../shared/types';

type DraftProvider = {
  apiKey: string;
  baseUrl: string;
  modelMap: Record<AiQuality, string>;
};

type DraftConfig = {
  selectedProvider: AiProviderId;
  quality: AiQuality;
  providers: Record<AiProviderId, DraftProvider>;
};

const providerLabels: Record<AiProviderId, string> = {
  alibaba: '阿里云百炼',
  deepseek: 'DeepSeek',
};

const qualityLabels: Record<AiQuality, string> = {
  fast: '快速',
  balanced: '均衡',
  quality: '高质量',
};

export default function AiSettingsPage() {
  const [config, setConfig] = useState<AiConfigPublic | null>(null);
  const [draft, setDraft] = useState<DraftConfig | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [action, setAction] = useState<'save' | 'test' | 'reanalyze' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/ai/config')
      .then(async (response) => {
        const payload = await response.json() as AiConfigResponse | ApiError;
        if (!response.ok || !('config' in payload)) throw new Error('error' in payload ? payload.error : '无法读取 AI 配置。');
        setConfig(payload.config);
        setDraft(toDraft(payload.config));
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : '无法读取 AI 配置。'));
  }, []);

  if (!config || !draft) {
    return <section className="ai-config-page"><div className="ai-config-loading" aria-busy="true"><span /><span /><span /></div>{error && <InlineMessage error text={error} />}</section>;
  }

  const selected = draft.providers[draft.selectedProvider];
  const savedProvider = config.providers[draft.selectedProvider];

  function updateProvider(update: Partial<DraftProvider>) {
    setDraft((current) => current ? {
      ...current,
      providers: {
        ...current.providers,
        [current.selectedProvider]: { ...current.providers[current.selectedProvider], ...update },
      },
    } : current);
  }

  function updateModel(quality: AiQuality, value: string) {
    updateProvider({ modelMap: { ...selected.modelMap, [quality]: value } });
  }

  async function saveDraft(): Promise<AiConfigPublic> {
    const response = await fetch('/api/ai/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const payload = await response.json() as AiConfigResponse | ApiError;
    if (!response.ok || !('config' in payload)) throw new Error('error' in payload ? payload.error : '保存失败。');
    setConfig(payload.config);
    setDraft(toDraft(payload.config));
    return payload.config;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setAction('save');
    setError('');
    setMessage('');
    try {
      await saveDraft();
      setMessage('AI 配置已保存到本机。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败。');
    } finally {
      setAction(null);
    }
  }

  async function testConnection() {
    setAction('test');
    setError('');
    setMessage('');
    try {
      const saved = await saveDraft();
      const response = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: saved.selectedProvider }),
      });
      const payload = await response.json() as { model?: string; message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || '连接测试失败。');
      setMessage(`${providerLabels[saved.selectedProvider]}连接正常，当前模型 ${payload.model}。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '连接测试失败。');
    } finally {
      setAction(null);
    }
  }

  async function reanalyze() {
    setAction('reanalyze');
    setError('');
    setMessage('');
    try {
      await saveDraft();
      const response = await fetch('/api/ai/reanalyze', { method: 'POST' });
      const payload = await response.json() as { result?: { total: number; updated: number; failed: number }; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || '重新分析失败。');
      setMessage(`已完成 ${payload.result.updated} 条分析${payload.result.failed ? `，失败 ${payload.result.failed} 条` : ''}。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '重新分析失败。');
    } finally {
      setAction(null);
    }
  }

  return (
    <section className="ai-config-page" aria-labelledby="ai-config-title">
      <header className="ai-config-heading">
        <div>
          <p className="eyebrow">智能研判</p>
          <h1 id="ai-config-title">AI 分析配置</h1>
          <p>为新增视频生成摘要、价值判断、深度分析和行动建议。</p>
        </div>
        <span className={`ai-config-state ${savedProvider.configured ? 'ready' : ''}`}><CheckCircle size={18} weight="fill" />{savedProvider.configured ? '已配置' : '等待密钥'}</span>
      </header>

      <div className="ai-config-layout">
        <form className="ai-config-form" onSubmit={save}>
          <fieldset>
            <legend>模型服务</legend>
            <div className="provider-switch" aria-label="模型服务">
              {(Object.keys(providerLabels) as AiProviderId[]).map((provider) => (
                <button key={provider} type="button" className={draft.selectedProvider === provider ? 'active' : ''} onClick={() => { setDraft({ ...draft, selectedProvider: provider }); setShowKey(false); }}>
                  {providerLabels[provider]}
                  {config.providers[provider].configured && <CheckCircle size={16} weight="fill" />}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>分析档位</legend>
            <div className="quality-switch" aria-label="分析档位">
              {(Object.keys(qualityLabels) as AiQuality[]).map((quality) => (
                <button key={quality} type="button" className={draft.quality === quality ? 'active' : ''} onClick={() => setDraft({ ...draft, quality })}>{qualityLabels[quality]}<small>{selected.modelMap[quality]}</small></button>
              ))}
            </div>
          </fieldset>

          <div className="ai-field-grid">
            <label className="ai-field ai-field-wide">
              <span>API Key</span>
              <div className="secret-field">
                <input type={showKey ? 'text' : 'password'} value={selected.apiKey} onChange={(event) => updateProvider({ apiKey: event.target.value })} placeholder={savedProvider.apiKeyHint || '输入 API Key'} autoComplete="off" />
                <button type="button" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? '隐藏密钥' : '显示密钥'} title={showKey ? '隐藏密钥' : '显示密钥'}>{showKey ? <EyeSlash size={18} /> : <Eye size={18} />}</button>
              </div>
            </label>
            <label className="ai-field ai-field-wide"><span>Base URL</span><input type="url" required value={selected.baseUrl} onChange={(event) => updateProvider({ baseUrl: event.target.value })} /></label>
            {(Object.keys(qualityLabels) as AiQuality[]).map((quality) => <label className="ai-field" key={quality}><span>{qualityLabels[quality]}模型</span><input required value={selected.modelMap[quality]} onChange={(event) => updateModel(quality, event.target.value)} /></label>)}
          </div>

          <div className="ai-security-note"><CheckCircle size={18} weight="fill" /><span>密钥保存在本机配置文件中，浏览器只能读取配置状态和末四位。</span></div>

          {error && <InlineMessage error text={error} />}
          {message && <InlineMessage text={message} />}

          <div className="ai-form-actions">
            <button className="secondary-button" type="button" onClick={testConnection} disabled={Boolean(action)}><PlugsConnected size={18} />{action === 'test' ? '测试中' : '测试连接'}</button>
            <button className="primary-button" type="submit" disabled={Boolean(action)}><FloppyDisk size={18} />{action === 'save' ? '保存中' : '保存配置'}</button>
          </div>
        </form>

        <aside className="ai-run-panel">
          <div className="ai-run-icon"><Brain size={24} weight="fill" /></div>
          <h2>分析知识库</h2>
          <dl>
            <div><dt>服务</dt><dd>{providerLabels[draft.selectedProvider]}</dd></div>
            <div><dt>档位</dt><dd>{qualityLabels[draft.quality]}</dd></div>
            <div><dt>模型</dt><dd>{selected.modelMap[draft.quality]}</dd></div>
          </dl>
          <button className="primary-button" type="button" onClick={reanalyze} disabled={Boolean(action)}><Sparkle size={18} weight="fill" />{action === 'reanalyze' ? '分析中' : '重新分析现有内容'}</button>
        </aside>
      </div>
    </section>
  );
}

function toDraft(config: AiConfigPublic): DraftConfig {
  return {
    selectedProvider: config.selectedProvider,
    quality: config.quality,
    providers: {
      alibaba: { apiKey: '', baseUrl: config.providers.alibaba.baseUrl, modelMap: { ...config.providers.alibaba.modelMap } },
      deepseek: { apiKey: '', baseUrl: config.providers.deepseek.baseUrl, modelMap: { ...config.providers.deepseek.modelMap } },
    },
  };
}

function InlineMessage({ text, error = false }: { text: string; error?: boolean }) {
  return <div className={error ? 'ai-message error' : 'ai-message'} role={error ? 'alert' : 'status'}>{error ? <WarningCircle size={18} weight="fill" /> : <CheckCircle size={18} weight="fill" />}<span>{text}</span></div>;
}
