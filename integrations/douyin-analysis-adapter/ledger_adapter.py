from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path

from douyin_favorites_knowledge.config import load_config
from douyin_favorites_knowledge.workflow import normalize_item


def refresh(config_path: Path) -> int:
    config = load_config(config_path)
    updates: list[tuple[str, str]] = []
    for note_path in config.knowledge_dir.glob("*.md"):
        match = re.fullmatch(r"(collection|like)-([0-9]+)\.md", note_path.name)
        if not match:
            continue
        note = note_path.read_text(encoding="utf-8")
        source, aweme_id = match.groups()
        transcript_status = _frontmatter(note, "transcript_status")
        raw = {
            "aweme_id": aweme_id,
            "title": _frontmatter(note, "title"),
            "author": _frontmatter(note, "author"),
            "description": _section(note, "原始描述"),
            "transcript": "" if transcript_status == "skipped_image" else (_section(note, "转录") or _section(note, "画面上的字")),
            "transcript_source": _frontmatter(note, "transcript_source"),
            "transcript_status": transcript_status,
            "tags": _frontmatter_json(note, "tags", []),
            "observed_at": _frontmatter(note, "observed_at"),
            "source": source,
            "analysis": {
                key: value
                for key, heading in {
                    "content_summary": "要点",
                    "value_judgment": "价值判断",
                    "deep_analysis": "深度分析",
                    "extensions": "延展补充",
                    "action_items": "行动启示",
                    "related_knowledge": "关联知识",
                }.items()
                if (value := _section(note, heading))
            },
        }
        item = normalize_item(raw)
        updates.append((item["content_sha256"], f"{source}:{aweme_id}"))

    with sqlite3.connect(config.ledger_path, timeout=30) as connection:
        connection.execute("pragma busy_timeout=30000")
        connection.executemany("update promotions set content_sha256 = ? where aweme_id = ?", updates)
        connection.commit()
    return len(updates)


def _frontmatter(note: str, key: str) -> str:
    value = _frontmatter_json(note, key, "")
    return value if isinstance(value, str) else ""


def _frontmatter_json(note: str, key: str, fallback):
    match = re.search(rf"^{re.escape(key)}:\s*(.+?)\s*$", note, re.MULTILINE)
    if not match:
        return fallback
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return match.group(1).strip()


def _section(note: str, heading: str) -> str:
    match = re.search(rf"^#{{2,3}} {re.escape(heading)}\s*\r?\n+([\s\S]*?)(?=^#{{2,3}} )", f"{note}\n## __END__", re.MULTILINE)
    return match.group(1).strip() if match else ""


if __name__ == "__main__":
    count = refresh(Path(sys.argv[1]).expanduser().resolve())
    print(json.dumps({"updated": count}))
