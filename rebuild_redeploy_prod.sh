#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
# Minimal production deploy for MCP Open Discovery (Bash)
# Uses docker/docker-file-mcpod-server.yml and optional RabbitMQ profile
set -euo pipefail

CYAN='\033[0;36m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'

# Flags (defaults)
STDIO=false; HTTP=false; AMQP=false
WITH_RABBITMQ=false; WITH_AMQP_ALIAS=false
NO_LOGS=false

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="docker/docker-file-mcpod-server.yml"
# Default compose project name (can be overridden by --project-name or COMPOSE_PROJECT_NAME)
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-mcp-open-discovery-production}"

usage(){
  echo -e "${CYAN}Minimal production deploy${NC}";
  echo "Usage:";
  echo "  ./rebuild_redeploy_prod.sh --http                    # HTTP-only (default if no flags/env)";
  echo "  ./rebuild_redeploy_prod.sh --amqp --with-rabbitmq    # AMQP transport + RabbitMQ container";
  echo "  ./rebuild_redeploy_prod.sh --amqp                    # AMQP transport only (external broker)";
  echo "  ./rebuild_redeploy_prod.sh --stdio --http           # StdIO + HTTP transports";
  echo "  ./rebuild_redeploy_prod.sh --project-name <name>     # Set docker compose project name (lowercase)";
  echo "  ./rebuild_redeploy_prod.sh --no-logs                 # Do not tail logs";
  echo "  Deprecated: --with-amqp (equivalent to --amqp --with-rabbitmq)";
  echo "  Note: Compose project is scoped as '${PROJECT_NAME}' (override with --project-name or COMPOSE_PROJECT_NAME)";
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stdio) STDIO=true; shift ;;
    --http) HTTP=true; shift ;;
    --amqp) AMQP=true; shift ;;
    --with-rabbitmq) WITH_RABBITMQ=true; shift ;;
    --with-amqp) WITH_AMQP_ALIAS=true; shift ;;
    --project-name)
      if [[ $# -lt 2 ]]; then echo -e "${RED}--project-name requires a value${NC}"; usage; exit 1; fi
      PROJECT_NAME="$2"; shift 2 ;;
    --project-name=*)
      PROJECT_NAME="${1#*=}"; shift ;;
    --no-logs) NO_LOGS=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo -e "${RED}Unknown arg: $1${NC}"; usage; exit 1 ;;
  esac
done

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo -e "${RED}$COMPOSE_FILE not found in $SCRIPT_DIR${NC}" >&2; exit 1
fi

# Normalize project name to lowercase for Docker Compose compatibility
if [[ -n "$PROJECT_NAME" ]]; then
  PROJECT_NAME_LOWER="$(echo "$PROJECT_NAME" | tr '[:upper:]' '[:lower:]')"
  if [[ "$PROJECT_NAME" != "$PROJECT_NAME_LOWER" ]]; then
    echo -e "${YELLOW}Note: Docker requires lowercase project names; converting '${PROJECT_NAME}' -> '${PROJECT_NAME_LOWER}'.${NC}"
    PROJECT_NAME="$PROJECT_NAME_LOWER"
  fi
fi

compose(){
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
  elif command -v docker >/dev/null 2>&1; then
    docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
  else
    echo -e "${RED}Docker (compose) not found${NC}" >&2; exit 1
  fi
}

# Handle deprecated alias mapping
if $WITH_AMQP_ALIAS; then
  echo -e "${YELLOW}DEPRECATED: --with-amqp is replaced by --amqp --with-rabbitmq${NC}"
  AMQP=true
  $WITH_RABBITMQ || WITH_RABBITMQ=true
fi

# Build TRANSPORT_MODE from flags
selected_transports=()
$STDIO && selected_transports+=("stdio")
$HTTP && selected_transports+=("http")
$AMQP && selected_transports+=("amqp")

if (( ${#selected_transports[@]} > 0 )); then
  export TRANSPORT_MODE="$(IFS=,; echo "${selected_transports[*]}")"
elif [[ -z "${TRANSPORT_MODE:-}" ]]; then
  export TRANSPORT_MODE="http"
fi

echo -e "${CYAN}TRANSPORT_MODE = ${TRANSPORT_MODE}${NC}"

# Compose profile args
PROFILE_ARGS=()
$WITH_RABBITMQ && PROFILE_ARGS=(--profile with-amqp)

# Helper: remove a container by exact name if present
remove_container_if_exists(){
  local name="$1"
  local id
  id=$(docker ps -a --filter "name=^/${name}$" -q | head -n1 || true)
  if [[ -n "$id" ]]; then
    # Only remove if the container belongs to this compose project (safety guard)
    local label
    label=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$name" 2>/dev/null || true)
    if [[ -n "$label" && "$label" == "$PROJECT_NAME" ]]; then
      echo -e "${YELLOW}Removing existing container: ${name} (project: ${label})${NC}"
      docker rm -f "$name" >/dev/null 2>&1 || true
    else
      echo -e "${YELLOW}Skip removing container '${name}' — not owned by compose project '${PROJECT_NAME}'.${NC}"
      echo -e "${YELLOW}If this causes a name conflict, set COMPOSE_PROJECT_NAME to a unique value or remove it manually.${NC}"
    fi
  fi
}

echo -e "${YELLOW}Stopping containers...${NC}"
compose "${PROFILE_ARGS[@]}" down --remove-orphans || true

# Proactively resolve name conflicts from other projects
remove_container_if_exists mcp-open-discovery
$WITH_RABBITMQ && remove_container_if_exists mcp-rabbitmq

echo -e "${YELLOW}Building images...${NC}"
compose "${PROFILE_ARGS[@]}" build --no-cache

ARGS=( up -d --remove-orphans )

echo -e "${YELLOW}Starting containers...${NC}"
compose "${PROFILE_ARGS[@]}" "${ARGS[@]}"

sleep 8
compose "${PROFILE_ARGS[@]}" ps

if ! $NO_LOGS; then
  compose "${PROFILE_ARGS[@]}" logs -f
fi
