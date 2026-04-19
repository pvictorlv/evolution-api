#!/bin/bash
# Rebuilds /etc/3proxy/3proxy.cfg from every global IPv6 on eth0
# and restarts the service. Preserves existing credentials.
set -euo pipefail

CFG=/etc/3proxy/3proxy.cfg
START_PORT=30000

current_creds=$(awk '/^users /{print; exit}' "$CFG" 2>/dev/null || true)
if [ -z "$current_creds" ]; then
  echo "ERROR: could not find existing 'users' line in $CFG" >&2
  exit 1
fi

mapfile -t ipv6s < <(ip -6 -o addr show scope global | awk '{print $4}' | sed 's|/.*||' | sort -u)

if [ "${#ipv6s[@]}" -eq 0 ]; then
  echo "ERROR: no global IPv6 addresses found" >&2
  exit 1
fi

{
  echo "pidfile /run/3proxy.pid"
  echo "nserver 8.8.8.8"
  echo "nserver 1.1.1.1"
  echo "nserver 2001:4860:4860::8888"
  echo "nscache 65536"
  echo "nscache6 65536"
  echo "timeouts 1 5 30 60 180 1800 15 60"
  echo "log /var/log/3proxy/3proxy.log D"
  echo 'logformat "L%d-%m-%Y %H:%M:%S %N.%p %E %U %C:%c %R:%r %O %I %T"'
  echo "rotate 30"
  echo "maxconn 2000"
  echo "auth strong"
  echo "$current_creds"
  echo "allow evo"
  echo ""
  i=0
  for ip in "${ipv6s[@]}"; do
    port=$((START_PORT + i))
    echo "proxy -6 -n -a -p${port} -i0.0.0.0 -e${ip}"
    i=$((i + 1))
  done
} > "$CFG.new"

chmod 600 "$CFG.new"
mv "$CFG.new" "$CFG"
systemctl restart 3proxy
sleep 1
systemctl is-active 3proxy
echo "rebuilt: ${#ipv6s[@]} IPv6 addresses, ports $START_PORT-$((START_PORT + ${#ipv6s[@]} - 1))"
