#!/usr/bin/env bash
# Script to rebuild and redeploy MCP Open Discovery server with modular architecture (feature parity with PowerShell)

set -euo pipefail

# Color codes for output
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
GRAY='\033[0;37m'
RED='\033[0;31m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
cd "$SCRIPT_DIR"

usage() {
	echo -e "MCP Open Discovery Rebuild Script";
	echo;
	echo -e "Usage:";
	echo -e "  ./rebuild_redeploy.sh            # Rebuild only the MCP server container (default)";
	echo -e "  ./rebuild_redeploy.sh -a|--all   # Rebuild all containers (MCP server, RabbitMQ, SNMP agents, Zabbix stack)";
	echo -e "  ./rebuild_redeploy.sh -h|--help  # Show this help message";
	echo -e "  ./rebuild_redeploy.sh -n|--no-logs # Do not tail logs after start";
	echo;
	echo -e "Examples:";
	echo -e "  ./rebuild_redeploy.sh            # Fast rebuild for code changes";
	echo -e "  ./rebuild_redeploy.sh --all      # Full rebuild for infrastructure changes";
}

BUILD_ALL=false
NO_LOGS=false

while [[ $# -gt 0 ]]; do
	case "$1" in
		-a|--all)
			BUILD_ALL=true; shift ;;
		-n|--no-logs)
			NO_LOGS=true; shift ;;
		-h|--help)
			usage; exit 0 ;;
		*)
			echo -e "${RED}Unknown argument: $1${NC}" >&2; usage; exit 1 ;;
	esac
done

if [[ ! -f "docker-compose.yml" ]]; then
	echo -e "${RED}docker-compose.yml not found in $SCRIPT_DIR. Run from repo root.${NC}" >&2
	exit 1
fi

compose() {
	if command -v docker-compose >/dev/null 2>&1; then
		docker-compose "$@"
	elif command -v docker >/dev/null 2>&1; then
		docker compose "$@"
	else
		echo -e "${RED}Docker (compose) not found. Install Docker and ensure it's on PATH.${NC}" >&2
		exit 1
	fi
}

if $BUILD_ALL; then
	echo -e "${CYAN}Rebuilding and redeploying ALL MCP Open Discovery containers...${NC}"
else
	echo -e "${CYAN}Rebuilding and redeploying MCP Server container only...${NC}"
	echo -e "${GRAY}Use --all to rebuild all containers (RabbitMQ, Zabbix, etc.)${NC}"
fi

# Stop containers based on scope
if $BUILD_ALL; then
	echo -e "${YELLOW}Stopping ALL containers...${NC}"
	compose down
else
	echo -e "${YELLOW}Stopping MCP server container only...${NC}"
	compose stop mcp-server || true
	compose rm -f mcp-server || true
fi

# Build the image(s)
if $BUILD_ALL; then
	echo -e "${YELLOW}Building ALL Docker images...${NC}"
	compose build --no-cache
else
	echo -e "${YELLOW}Building MCP server Docker image...${NC}"
	compose build --no-cache mcp-server
fi

# Start the containers
echo -e "${YELLOW}Starting containers...${NC}"
compose up -d

# Pause to ensure services are up
echo -e "${YELLOW}Waiting for services to start...${NC}"
sleep 10

# Show running containers
echo -e "${GREEN}Running containers:${NC}"
compose ps

echo -e "${CYAN}Rebuild and redeploy complete!${NC}"
echo -e "${GRAY}To view logs, use: docker-compose logs -f${NC}"

if ! $NO_LOGS; then
	compose logs -f
fi