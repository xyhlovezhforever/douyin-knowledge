from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from collections import Counter
from typing import Any

ANALYSIS_FIELDS = (
    "content_summary",
    "value_judgment",
    "deep_analysis",
    "extensions",
    "action_items",
    "related_knowledge",
)


def analyze(item: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    """Analyze one authorized item without changing its identity or source URL."""
    text = "\n\n".join(
        part.strip()
        for part in (str(item.get("description") or ""), str(item.get("transcript") or ""))
        if part.strip()
    )
    if not text:
        return {
            "analysis": {"content_summary": "暂未获得可分析的文字内容。"},
            "tags": [],
        }

    endpoint = os.getenv("VIDEO_ANALYSIS_API_URL", "").strip()
    model = os.getenv("VIDEO_ANALYSIS_MODEL", "").strip() or str(context.get("model") or "")
    if endpoint and model:
        try:
            result = _analyze_with_model(endpoint, model, text, item)
            return {"analysis": _clean_analysis(result), "tags": _clean_tags(result.get("tags"))}
        except (ValueError, urllib.error.URLError, TimeoutError):
            pass

    return _extractive_analysis(text)


def _analyze_with_model(endpoint: str, model: str, text: str, item: dict[str, Any]) -> dict[str, Any]:
    prompt = f"""你是视频知识整理助手。根据视频描述和转录生成严格 JSON，不要输出 Markdown 或推理过程。
字段：content_summary、value_judgment、deep_analysis、extensions、action_items、related_knowledge、tags。
每个字段使用简洁中文；tags 是 3 到 6 个短标签。不要补造原文没有的事实。
标题：{item.get('title') or ''}
作者：{item.get('author') or ''}
材料：
{text[:50000]}
"""
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "只返回一个可解析的 JSON 对象。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    headers = {"Content-Type": "application/json"}
    api_key = os.getenv("VIDEO_ANALYSIS_API_KEY", "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        body = json.loads(response.read().decode("utf-8"))
    content = body.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not isinstance(content, str):
        raise ValueError("model response has no text content")
    content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip(), flags=re.I)
    parsed = json.loads(content)
    if not isinstance(parsed, dict):
        raise ValueError("model response must be an object")
    return parsed


def _extractive_analysis(text: str) -> dict[str, Any]:
    compact = re.sub(r"\s+", " ", text).strip()
    sentences = [part.strip() for part in re.split(r"(?<=[。！？!?])\s*", compact) if len(part.strip()) >= 8]
    summary = "".join(sentences[:3]) or compact[:420]
    tags = _keywords(compact, 5)
    action_candidates = [sentence for sentence in sentences if re.search(r"应该|建议|可以|需要|步骤|方法|先|再|最后", sentence)]
    action_items = "\n".join(f"- {sentence}" for sentence in action_candidates[:4])
    return {
        "analysis": {
            "content_summary": summary[:600],
            "value_judgment": "已完成基础文本分析。接入兼容模型接口后可进一步判断论据、适用边界与可信度。",
            "deep_analysis": "当前结论来自视频描述与语音转录的抽取，不包含外部事实核验。",
            "action_items": action_items,
            "related_knowledge": "、".join(tags),
        },
        "tags": tags,
    }


def _keywords(text: str, limit: int) -> list[str]:
    tokens = re.findall(r"[\u4e00-\u9fff]{2,8}|[A-Za-z][A-Za-z0-9_]{2,}", text)
    stop = {"这个", "那个", "我们", "你们", "他们", "就是", "可以", "一个", "什么", "怎么", "因为", "所以", "视频", "内容"}
    counts = Counter(token.lower() for token in tokens if token.lower() not in stop)
    return [token for token, _ in counts.most_common(limit)]


def _clean_analysis(raw: dict[str, Any]) -> dict[str, str]:
    cleaned = {}
    for field in ANALYSIS_FIELDS:
        value = raw.get(field)
        if isinstance(value, str) and value.strip():
            cleaned[field] = value.strip()[:4000]
    if not cleaned.get("content_summary"):
        raise ValueError("model response is missing content_summary")
    return cleaned


def _clean_tags(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [str(tag).strip()[:24] for tag in raw if str(tag).strip()][:8]
