#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
service_source="$repo_root/deploy/appliance/lldm-kiosk.service"
launcher_source="$repo_root/deploy/appliance/lldm-kiosk"
service_target="/etc/systemd/system/lldm-kiosk.service"
launcher_target="/usr/local/bin/lldm-kiosk"

echo "install $launcher_source -> $launcher_target (0755)"
echo "install $service_source -> $service_target (0644)"
echo "systemctl daemon-reload"
echo "systemctl enable --now lldm-kiosk.service"

if [[ "${1:-}" != "--apply" ]]; then
  echo "Dry run only. Re-run with --apply as an authorized administrator."
  exit 0
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "--apply requires root." >&2
  exit 1
fi
install -m 0755 "$launcher_source" "$launcher_target"
install -m 0644 "$service_source" "$service_target"
systemctl daemon-reload
systemctl enable --now lldm-kiosk.service
