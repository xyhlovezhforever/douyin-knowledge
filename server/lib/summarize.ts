import type { TranscriptSegment } from '../../shared/types.js';

const STOP_WORDS = new Set([
  'the', 'and', 'that', 'this', 'with', 'from', 'have', 'will', 'your', 'about', 'what', 'when',
  'there', 'they', 'their', 'you', 'are', 'was', 'for', 'not', 'but', 'can', 'all', 'just',
  '一个', '我们', '你们', '他们', '这个', '那个', '就是', '因为', '所以', '但是', '如果',
  '然后', '其实', '可以', '没有', '不是', '什么', '怎么', '这样', '这里', '现在', '已经',
]);

function sentencesOf(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[。！？!?])\s*|(?<=[.])\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12 && sentence.length <= 360);
}

function tokensOf(text: string): string[] {
  const english = text.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? [];
  const chineseBlocks = text.match(/[\u3400-\u9fff]{2,8}/g) ?? [];
  const chinese = chineseBlocks.flatMap((block) => {
    const chunks: string[] = [];
    for (let size = 2; size <= Math.min(4, block.length); size += 1) {
      for (let index = 0; index <= block.length - size; index += 1) chunks.push(block.slice(index, index + size));
    }
    return chunks;
  });
  return [...english, ...chinese].filter((token) => !STOP_WORDS.has(token));
}

export function buildSummary(transcript: TranscriptSegment[], fallback = ''): {
  summary: string;
  keyPoints: string[];
  topics: string[];
} {
  const fullText = transcript.map((segment) => segment.text).join(' ').trim() || fallback.trim();
  if (!fullText) return { summary: '暂未获得可分析的文字内容。', keyPoints: [], topics: [] };

  const sentences = sentencesOf(fullText);
  if (sentences.length === 0) {
    const clipped = fullText.slice(0, 420);
    return { summary: clipped, keyPoints: [clipped], topics: topKeywords(fullText, 5) };
  }

  const frequencies = new Map<string, number>();
  for (const token of tokensOf(fullText)) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);

  const ranked = sentences.map((sentence, index) => {
    const unique = new Set(tokensOf(sentence));
    const termScore = [...unique].reduce((total, token) => total + (frequencies.get(token) ?? 0), 0);
    const positionBoost = index < Math.max(2, sentences.length * 0.15) ? 1.18 : 1;
    const lengthFit = sentence.length >= 30 && sentence.length <= 180 ? 1.15 : 0.9;
    return { sentence, index, score: (termScore / Math.max(unique.size, 1)) * positionBoost * lengthFit };
  });

  const selected = [...ranked]
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(5, ranked.length))
    .sort((a, b) => a.index - b.index);
  const summarySentences = selected.slice(0, 3).map((item) => item.sentence);

  return {
    summary: summarySentences.join(' '),
    keyPoints: selected.map((item) => item.sentence),
    topics: topKeywords(fullText, 7),
  };
}

export function topKeywords(text: string, limit: number): string[] {
  const counts = new Map<string, number>();
  for (const token of tokensOf(text)) counts.set(token, (counts.get(token) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([token, count]) => count > 1 && token.length <= 12)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([token]) => token);
}
