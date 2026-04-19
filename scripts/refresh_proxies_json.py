"""Refreshes proxies.json from the VPS's current 3proxy config.

Counts the `proxy -...` lines on the VPS and regenerates proxies.json with
host=VPS public IPv4 and ports starting at 30000. Run this after you add new
IPv6 addresses to the VPS and run vps_rebuild_3proxy.sh there.
"""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys

VPS_HOST = "186.194.48.234"
SSH_KEY = r"C:\Users\Paulo\.ssh\evolution_proxy_vps"
PASSWORD_FILE = pathlib.Path(r"C:\Users\Paulo\.ssh\evolution_proxy_password.txt")
OUT_FILE = pathlib.Path(__file__).resolve().parents[1] / "proxies.json"
START_PORT = 30000


def ssh_cmd(remote: str) -> str:
    out = subprocess.run(
        [
            "ssh",
            "-i", SSH_KEY,
            "-o", "StrictHostKeyChecking=no",
            "-o", "PasswordAuthentication=no",
            "-o", "IdentitiesOnly=yes",
            f"root@{VPS_HOST}",
            remote,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return out.stdout.strip()


def main() -> int:
    password = PASSWORD_FILE.read_text(encoding="utf-8").strip()
    port_count = int(ssh_cmd("grep -c '^proxy ' /etc/3proxy/3proxy.cfg"))
    entries = [
        {
            "host": VPS_HOST,
            "port": str(START_PORT + i),
            "protocol": "http",
            "username": "evo",
            "password": password,
        }
        for i in range(port_count)
    ]
    OUT_FILE.write_text(json.dumps(entries, indent=2), encoding="utf-8")
    print(f"wrote {OUT_FILE} with {len(entries)} entries")
    return 0


if __name__ == "__main__":
    sys.exit(main())
