#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
# Compatibility wrapper for the unified typed-runtime deploy script.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
cd "$SCRIPT_DIR"

FORWARD_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stdio|--http|--amqp|--project-name|--project-name=*|--ssh|--ssh=*|--no-logs|-h|--help)
      FORWARD_ARGS+=("$1")
      if [[ "$1" == "--project-name" || "$1" == "--ssh" ]]; then
        [[ $# -lt 2 ]] && { echo "${1} requires a value" >&2; exit 1; }
        FORWARD_ARGS+=("$2")
        shift 2
        continue
      fi
      shift ;;
    --with-rabbitmq|--with-amqp)
      FORWARD_ARGS+=("--with-amqp")
      shift ;;
    --with-oauth)
      FORWARD_ARGS+=("--with-oauth")
      shift ;;
    *)
      FORWARD_ARGS+=("$1")
      shift ;;
  esac
done

exec "$SCRIPT_DIR/rebuild_redeploy.sh" "${FORWARD_ARGS[@]}"
