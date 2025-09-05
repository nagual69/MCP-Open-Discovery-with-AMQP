#!/usr/bin/env bash
# Minimal production deploy for MCP Open Discovery (Bash)
# Uses docker/docker-file-mcpod-server.yml and optional RabbitMQ profile
set -euo pipefail

CYAN='\033[0;36m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
WITH_AMQP=false; NO_LOGS=false

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="docker/docker-file-mcpod-server.yml"

usage(){
  echo -e "${CYAN}Minimal production deploy${NC}";
  echo "Usage:";
  echo "  ./rebuild_redeploy_prod.sh              # HTTP-only server";
  echo "  ./rebuild_redeploy_prod.sh --with-amqp  # Server + RabbitMQ profile";
  echo "  ./rebuild_redeploy_prod.sh --no-logs    # Do not tail logs";
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-amqp) WITH_AMQP=true; shift ;;
    --no-logs) NO_LOGS=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo -e "${RED}Unknown arg: $1${NC}"; usage; exit 1 ;;
  esac
done

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo -e "${RED}$COMPOSE_FILE not found in $SCRIPT_DIR${NC}" >&2; exit 1
fi

compose(){
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$COMPOSE_FILE" "$@"
  elif command -v docker >/dev/null 2>&1; then
    docker compose -f "$COMPOSE_FILE" "$@"
  else
    echo -e "${RED}Docker (compose) not found${NC}" >&2; exit 1
  fi
}

# Ensure TRANSPORT_MODE aligns with selected profile
if $WITH_AMQP; then
  export TRANSPORT_MODE="http,amqp"
else
  export TRANSPORT_MODE="http"
fi

echo -e "${YELLOW}Stopping containers...${NC}"
if $WITH_AMQP; then compose --profile with-amqp down || true; else compose down || true; fi

echo -e "${YELLOW}Building images...${NC}"
if $WITH_AMQP; then compose --profile with-amqp build --no-cache; else compose build --no-cache; fi

ARGS=( up -d )
if $WITH_AMQP; then ARGS=( --profile with-amqp "${ARGS[@]}" ); fi

echo -e "${YELLOW}Starting containers...${NC}"
compose "${ARGS[@]}"

sleep 8
if $WITH_AMQP; then compose --profile with-amqp ps; else compose ps; fi

if ! $NO_LOGS; then
  if $WITH_AMQP; then compose --profile with-amqp logs -f; else compose logs -f; fi
fi
