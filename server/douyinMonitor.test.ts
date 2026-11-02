import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseDouyinNote } from './douyinMonitor.js';

test('parses a promoted Douyin knowledge note', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'douyin-note-'));
  const note = path.join(root, 'collection-123.md');
  await writeFile(note, `---
aweme_id: "123"
title: "一份真实标题"
author: "林知远"
source_url: "https://www.douyin.com/video/123"
observed_at: "2026-11-02T08:10:00+08:00"
tags: ["效率", "知识管理"]
source: "collection"
transcript_status: "success"
---

# 一份真实标题

## 要点

视频解释了如何把收藏内容整理成可检索笔记。

## 研判

### 价值判断

方法具体，可直接复用。

### 深度分析

重点是把收藏、转写和研判串成同一条流程。

### 关联知识

个人知识库、语音识别
`, 'utf8');

  const parsed = await parseDouyinNote(note);
  assert.equal(parsed?.id, '123');
  assert.equal(parsed?.title, '一份真实标题');
  assert.deepEqual(parsed?.tags, ['效率', '知识管理']);
  assert.match(parsed?.summary ?? '', /可检索笔记/);
  assert.match(parsed?.valueJudgment ?? '', /直接复用/);
  assert.match(parsed?.deepAnalysis ?? '', /同一条流程/);
  assert.match(parsed?.relatedKnowledge ?? '', /个人知识库/);
});
