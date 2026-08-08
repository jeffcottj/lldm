#!/usr/bin/env bash
set -euo pipefail

service_target="/etc/systemd/system/lldm-kiosk.service"
launcher_target="/usr/local/bin/lldm-kiosk"

echo "systemctl disable --now lldm-kiosk.service"
echo "remove exact file $service_target"
echo "remove exact file $launcher_target"
echo "systemctl daemon-reload"

if [[ "${1:-}" != "--apply" ]]; then
  echo "Dry run only. Re-run with --apply as an authorized administrator."
  exit 0
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "--apply requires root." >&2
  exit 1
fi
systemctl disable --now lldm-kiosk.service || true
rm -f -- "$service_target"
rm -f -- "$launcher_target"
systemctl daemon-reload
