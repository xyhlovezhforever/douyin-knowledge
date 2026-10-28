import type { InsightComment } from '../../shared/types.js';

export type RawComment = Omit<InsightComment, 'score' | 'signal' | 'reasons'>;

const RESOURCE_PATTERN = /(https?:\/\/|www\.|github|论文|文档|资料|链接|source|paper|documentation)/i;
const CORRECTION_PATTERN = /(纠正|更正|不准确|错误|实际上|应该是|并不是|补充一点|correction|actually|incorrect)/i;
const EXPERIENCE_PATTERN = /(我用过|我试过|实测|亲测|工作中|项目里|经验|用了\d+|after using|in my experience|i tried)/i;

export function parseCompactNumber(input: string | number | undefined): number {
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
  if (!input) return 0;
  const clean = input.replace(/,/g, '').trim().toUpperCase();
  const value = Number.parseFloat(clean);
  if (!Number.isFinite(value)) return 0;
  if (clean.includes('万')) return Math.round(value * 10_000);
  if (clean.endsWith('K')) return Math.round(value * 1_000);
  if (clean.endsWith('M')) return Math.round(value * 1_000_000);
  return Math.round(value);
}

export function rankComments(comments: RawComment[], limit = 24): InsightComment[] {
  return comments
    .map((comment) => scoreComment(comment))
    .sort((a, b) => b.score - a.score || b.likes - a.likes)
    .slice(0, limit);
}

function scoreComment(comment: RawComment): InsightComment {
  const text = comment.text.trim();
  const reasons: string[] = [];
  let score = Math.min(32, Math.log10(comment.likes + 1) * 12) + Math.min(16, Math.log2(comment.replies + 1) * 4);
  let signal: InsightComment['signal'] = 'discussion';

  if (/[?？]/.test(text)) {
    score += 16;
    signal = 'question';
    reasons.push('提出具体问题');
  }
  if (EXPERIENCE_PATTERN.test(text)) {
    score += 22;
    signal = 'experience';
    reasons.push('包含实践经验');
  }
  if (CORRECTION_PATTERN.test(text)) {
    score += 26;
    signal = 'correction';
    reasons.push('可能包含纠错或补充');
  }
  if (RESOURCE_PATTERN.test(text)) {
    score += 20;
    signal = 'resource';
    reasons.push('提供可追溯资源');
  }
  if (/\d+(?:\.\d+)?%|\d{4}年|\d+(?:天|小时|分钟|个月|years?|hours?)/i.test(text)) {
    score += 10;
    reasons.push('包含具体数据');
  }
  if (text.length >= 48 && text.length <= 420) {
    score += 14;
    reasons.push('信息密度较高');
  } else if (text.length < 12) {
    score -= 14;
  }
  if (comment.likes >= 10) reasons.push('获得较多认同');
  if (comment.replies >= 3) reasons.push('引发持续讨论');
  if (reasons.length === 0) reasons.push('讨论热度较高');

  return { ...comment, text, score: Math.max(0, Math.round(score)), signal, reasons: reasons.slice(0, 3) };
}
