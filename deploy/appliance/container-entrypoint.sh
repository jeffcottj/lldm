#!/bin/sh
set -eu

if [ "$(id -u)" = "0" ]; then
  chown lldm:lldm /var/lib/lldm
  if [ -n "${LLDM_RELAY_CREDENTIAL_FILE:-}" ] &&
    [ -r "$LLDM_RELAY_CREDENTIAL_FILE" ]; then
    install -o lldm -g lldm -m 0400 \
      "$LLDM_RELAY_CREDENTIAL_FILE" \
      /tmp/lldm-relay-credential
    LLDM_RELAY_CREDENTIAL_FILE=/tmp/lldm-relay-credential
    export LLDM_RELAY_CREDENTIAL_FILE
  fi
  exec gosu lldm "$@"
fi

exec "$@"
