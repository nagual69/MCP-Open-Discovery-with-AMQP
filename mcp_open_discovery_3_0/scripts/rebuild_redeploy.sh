#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0

set -euo pipefail

CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GRAY='\033[0;37m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

BUILD_ALL=false
TARGETED=false
WITH_AMQP=false
WITH_OAUTH=false
WITH_SNMP=false
WITH_ZABBIX=false
STDIO=false
HTTP=false
AMQP=false
NO_LOGS=false
SKIP_TYPECHECK=false
NO_CACHE=false
SSH_TARGET=""
TRANSPORT_MODE_OVERRIDE=""
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-mcp-open-discovery-3}"
SERVICES=("mcp-server")

usage() {
	echo -e "${CYAN}MCP Open Discovery 3 Typed Docker Deploy${NC}"
	echo
	echo "Usage:"
	echo "  ./scripts/rebuild_redeploy.sh                 # MCP server only"
	echo "  ./scripts/rebuild_redeploy.sh --targeted      # Rebuild/restart only mcp-server"
	echo "  ./scripts/rebuild_redeploy.sh --targeted --services mcp-server,zabbix-web"
	echo "  ./scripts/rebuild_redeploy.sh --with-amqp     # Add RabbitMQ profile"
	echo "  ./scripts/rebuild_redeploy.sh --with-oauth    # Add Keycloak profile"
	echo "  ./scripts/rebuild_redeploy.sh --all           # Full lab stack"
	echo "  ./scripts/rebuild_redeploy.sh --targeted --no-cache"
	echo "  ./scripts/rebuild_redeploy.sh --transport-mode stdio,http"
	echo "  ./scripts/rebuild_redeploy.sh --skip-typecheck"
	echo "  ./scripts/rebuild_redeploy.sh --ssh user@host"
	echo "  ./scripts/rebuild_redeploy.sh --no-logs"
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		-a|--all) BUILD_ALL=true; shift ;;
		--targeted) TARGETED=true; shift ;;
		--with-amqp) WITH_AMQP=true; shift ;;
		--with-oauth) WITH_OAUTH=true; shift ;;
		--with-snmp) WITH_SNMP=true; shift ;;
		--with-zabbix) WITH_ZABBIX=true; shift ;;
		--stdio) STDIO=true; shift ;;
		--http) HTTP=true; shift ;;
		--amqp) AMQP=true; shift ;;
		--transport-mode)
			[[ $# -lt 2 ]] && { echo -e "${RED}--transport-mode requires a value${NC}" >&2; exit 1; }
			TRANSPORT_MODE_OVERRIDE="$2"; shift 2 ;;
		--transport-mode=*) TRANSPORT_MODE_OVERRIDE="${1#*=}"; shift ;;
		--project-name)
			[[ $# -lt 2 ]] && { echo -e "${RED}--project-name requires a value${NC}" >&2; exit 1; }
			PROJECT_NAME="$2"; shift 2 ;;
		--project-name=*) PROJECT_NAME="${1#*=}"; shift ;;
		--services)
			[[ $# -lt 2 ]] && { echo -e "${RED}--services requires a value${NC}" >&2; exit 1; }
			IFS=',' read -r -a SERVICES <<< "$2"; shift 2 ;;
		--services=*) IFS=',' read -r -a SERVICES <<< "${1#*=}"; shift ;;
		--skip-typecheck) SKIP_TYPECHECK=true; shift ;;
		--no-cache) NO_CACHE=true; shift ;;
		--ssh)
			[[ $# -lt 2 ]] && { echo -e "${RED}--ssh requires a value like user@host${NC}" >&2; exit 1; }
			SSH_TARGET="$2"; shift 2 ;;
		--ssh=*) SSH_TARGET="${1#*=}"; shift ;;
		-n|--no-logs) NO_LOGS=true; shift ;;
		-h|--help) usage; exit 0 ;;
		*) echo -e "${RED}Unknown argument: $1${NC}" >&2; usage; exit 1 ;;
	esac
done

if $BUILD_ALL; then
	WITH_AMQP=true
	WITH_OAUTH=true
	WITH_SNMP=true
	WITH_ZABBIX=true
fi

COMPOSE_FILE="docker/compose.yml"
if [[ ! -f "$COMPOSE_FILE" ]]; then
	echo -e "${RED}$COMPOSE_FILE not found in $REPO_ROOT${NC}" >&2
	exit 1
fi

if [[ -n "$SSH_TARGET" ]]; then
	export DOCKER_HOST="ssh://$SSH_TARGET"
	echo -e "${CYAN}Remote Docker host enabled via DOCKER_HOST=${DOCKER_HOST}${NC}"
fi

PROJECT_NAME="$(echo "$PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/-/g')"

resolve_transport_mode() {
	local explicit_mode="$1"
	local modes=()

	if [[ -n "$explicit_mode" ]]; then
		IFS=',' read -r -a modes <<< "$explicit_mode"
	else
		$STDIO && modes+=("stdio")
		$HTTP && modes+=("http")
		$AMQP && modes+=("amqp")
		if (( ${#modes[@]} == 0 )); then
			if $WITH_AMQP || $AMQP; then
				modes=("http" "amqp")
			else
				modes=("http")
			fi
		fi
	fi

	local normalized=()
	local seen=""
	for mode in "${modes[@]}"; do
		mode="$(echo "$mode" | xargs | tr '[:upper:]' '[:lower:]')"
		[[ "$mode" != "stdio" && "$mode" != "http" && "$mode" != "amqp" ]] && continue
		[[ ",$seen," == *",$mode,"* ]] && continue
		normalized+=("$mode")
		seen+="${mode},"
	done

	local has_http=false
	local has_amqp=false
	for mode in "${normalized[@]}"; do
		[[ "$mode" == "http" ]] && has_http=true
		[[ "$mode" == "amqp" ]] && has_amqp=true
	done

	if $has_amqp && ! $has_http; then
		normalized=("http" "${normalized[@]}")
		echo -e "${YELLOW}Added http to TRANSPORT_MODE so the container health check remains valid.${NC}" >&2
	fi

	local joined=""
	local first=true
	for mode in "${normalized[@]}"; do
		if $first; then
			joined="$mode"
			first=false
		else
			joined="$joined,$mode"
		fi
	done
	echo "$joined"
}

compose() {
	if command -v docker-compose >/dev/null 2>&1; then
		docker-compose "$@"
	elif command -v docker >/dev/null 2>&1; then
		docker compose "$@"
	else
		echo -e "${RED}Docker (compose) not found. Install Docker and ensure it is on PATH.${NC}" >&2
		exit 1
	fi
}

run_zabbix_bootstrap() {
	echo -e "${YELLOW}Bootstrapping Zabbix lab hosts...${NC}"
	compose "${COMPOSE_ARGS[@]}" run --rm zabbix-bootstrap
}

build_compose_args() {
	local result=( -p "$PROJECT_NAME" )
	for profile in "$@"; do
		result+=( --profile "$profile" )
	done
	result+=( -f "$COMPOSE_FILE" )
	printf '%s\n' "${result[@]}"
}

TRANSPORT_MODE_VALUE="$(resolve_transport_mode "$TRANSPORT_MODE_OVERRIDE")"
export TRANSPORT_MODE="$TRANSPORT_MODE_VALUE"
$WITH_OAUTH && export OAUTH_ENABLED=true

PROFILES=()
$WITH_AMQP && PROFILES+=("amqp")
$WITH_OAUTH && PROFILES+=("oauth")
$WITH_SNMP && PROFILES+=("snmp")
$WITH_ZABBIX && PROFILES+=("zabbix")

ALL_PROFILES=("amqp" "oauth" "snmp" "zabbix")
mapfile -t COMPOSE_ARGS < <(build_compose_args "${PROFILES[@]}")
mapfile -t COMPOSE_ARGS_DOWN < <(build_compose_args "${ALL_PROFILES[@]}")

echo -e "${YELLOW}Running TypeScript typecheck...${NC}"
if ! $SKIP_TYPECHECK; then
	npm run typecheck
else
	echo -e "${YELLOW}Skipping TypeScript typecheck by request.${NC}"
fi

echo -e "${CYAN}Deploying typed runtime from docker/compose.yml${NC}"
echo -e "${CYAN}TRANSPORT_MODE = ${TRANSPORT_MODE}${NC}"
if (( ${#PROFILES[@]} > 0 )); then
	echo -e "${CYAN}Profiles = ${PROFILES[*]}${NC}"
else
	echo -e "${GRAY}Profiles = none (server only)${NC}"
fi

if $TARGETED; then
	echo -e "${CYAN}Running targeted rebuild for services: ${SERVICES[*]}${NC}"
else
	echo -e "${YELLOW}Stopping existing containers for this compose project...${NC}"
	compose "${COMPOSE_ARGS_DOWN[@]}" down --remove-orphans || true
fi

echo -e "${YELLOW}Building typed MCP server image...${NC}"
BUILD_CMD=( "${COMPOSE_ARGS[@]}" build )
$NO_CACHE && BUILD_CMD+=( --no-cache )
BUILD_CMD+=( "${SERVICES[@]}" )
compose "${BUILD_CMD[@]}"

if $TARGETED; then
	echo -e "${YELLOW}Restarting selected services without recreating dependencies...${NC}"
	compose "${COMPOSE_ARGS[@]}" up -d --no-deps "${SERVICES[@]}"
else
	echo -e "${YELLOW}Starting containers...${NC}"
	compose "${COMPOSE_ARGS[@]}" up -d --remove-orphans
fi

echo -e "${YELLOW}Waiting for services to settle...${NC}"
sleep 10

compose "${COMPOSE_ARGS[@]}" ps

if $WITH_ZABBIX; then
	run_zabbix_bootstrap
fi

if ! $NO_LOGS; then
	compose "${COMPOSE_ARGS[@]}" logs -f
fi