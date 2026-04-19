"""Splits proxies.json into N shards for separate Evolution instances.

Usage:
    python scripts/split_proxies_json.py [num_shards]

Default num_shards = 5.

Writes proxies.1.json .. proxies.N.json at the project root. Remainder entries
(when total is not divisible by N) are spread across the first shards so sizes
differ by at most 1.
"""

from __future__ import annotations

import json
import pathlib
import sys

PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = PROJECT_ROOT / "proxies.json"


def split_evenly(entries: list[dict], shards: int) -> list[list[dict]]:
    base, extra = divmod(len(entries), shards)
    result: list[list[dict]] = []
    cursor = 0
    for i in range(shards):
        size = base + (1 if i < extra else 0)
        result.append(entries[cursor : cursor + size])
        cursor += size
    return result


def main() -> int:
    shards = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    if shards < 1:
        print("num_shards must be >= 1", file=sys.stderr)
        return 1

    entries = json.loads(SOURCE.read_text(encoding="utf-8"))
    parts = split_evenly(entries, shards)

    for i, part in enumerate(parts, start=1):
        out = PROJECT_ROOT / f"proxies.{i}.json"
        out.write_text(json.dumps(part, indent=2), encoding="utf-8")
        ports = f"{part[0]['port']}-{part[-1]['port']}" if part else "empty"
        print(f"wrote {out.name}  entries={len(part)}  ports={ports}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
