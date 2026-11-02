from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

CACHEABLE_STATUSES = {"success", "skipped_image", "screen_text"}


def transcribe_cached(item: dict[str, Any], context: dict[str, Any]) -> dict[str, str]:
    """Reuse a promoted transcript and run local Whisper only for new items."""
    cached = _read_promoted_transcript(item)
    if cached is not None:
        return cached

    from douyin_favorites_knowledge.local_whisper import transcribe

    return transcribe(item, context)


def _read_promoted_transcript(item: dict[str, Any]) -> dict[str, str] | None:
    knowledge_dir = os.getenv("DOUYIN_KNOWLEDGE_DIR", "").strip()
    aweme_id = str(item.get("aweme_id") or "").strip()
    source = "like" if item.get("source") == "like" else "collection"
    if not knowledge_dir or not aweme_id:
        return None

    note_path = Path(knowledge_dir) / f"{source}-{aweme_id}.md"
    try:
        note = note_path.read_text(encoding="utf-8")
    except OSError:
        return None

    status = _frontmatter_value(note, "transcript_status")
    if status not in CACHEABLE_STATUSES:
        return None
    transcript = ""
    if status != "skipped_image":
        match = re.search(r"^### 转录\s*\r?\n+([\s\S]*?)(?=^## 研判\s*$)", note, re.MULTILINE)
        if not match:
            return None
        transcript = match.group(1).strip()

    return {
        "transcript": transcript,
        "transcript_source": _frontmatter_value(note, "transcript_source") or "local_whisper",
        "transcript_status": status,
    }


def _frontmatter_value(note: str, key: str) -> str:
    match = re.search(rf"^{re.escape(key)}:\s*(.+?)\s*$", note, re.MULTILINE)
    if not match:
        return ""
    raw = match.group(1).strip()
    if raw.startswith('"'):
        try:
            value = json.loads(raw)
            return value if isinstance(value, str) else ""
        except json.JSONDecodeError:
            return ""
    return raw
