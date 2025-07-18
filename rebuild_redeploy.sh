#!/bin/bash
# filepath: c:\Users\nagua\OneDrive\Documents\development\mcp-open-discovery\rebuild_deploy.sh
# Script to rebuild and redeploy MCP Open Discovery server with modular architecture

# Color codes for output
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

echo -e "${CYAN}🔄 Rebuilding and redeploying MCP Open Discovery Server...${NC}"

# Stop any running containers
echo -e "${YELLOW}🛑 Stopping any running containers...${NC}"
docker-compose down

# Build the new image with modular architecture
echo -e "${YELLOW}🏗️ Building Docker image...${NC}"
docker-compose build

# Start the containers
echo -e "${YELLOW}🚀 Starting containers...${NC}"
docker-compose up -d

# Pause to ensure services are up
echo -e "${YELLOW}⏳ Waiting for services to start...${NC}"
sleep 10

# Show running containers
echo -e "${GREEN}📊 Running containers:${NC}"
docker-compose ps

echo -e "${CYAN}✅ Rebuild and redeploy complete!${NC}"
echo -e "${GRAY}To view logs, use: docker-compose logs -f${NC}"
docker-compose logs -f