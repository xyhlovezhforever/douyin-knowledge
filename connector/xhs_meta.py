from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "integrations" / "video-fetch-yjf" / "scripts"
sys.path.insert(0, str(SCRIPTS))

import fetch_image_note as xhs  # noqa: E402


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"error": "missing URL"}, ensure_ascii=False))
        return 2
    try:
        url = xhs.normalize_url(sys.argv[1])
        note = xhs.parse_note(xhs._fetch_html(url))
        print(json.dumps({"url": url, "note": note}, ensure_ascii=False))
        return 0
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
