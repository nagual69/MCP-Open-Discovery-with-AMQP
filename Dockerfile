FROM node:24-alpine

# Install busybox
RUN apk add --no-cache busybox

# Create a non-root user to run the server
RUN adduser -D -h /home/mcpuser mcpuser
WORKDIR /home/mcpuser/app

# Copy package.json and install dependencies (we have no runtime dependencies)
COPY package.json ./
# We don't have any runtime dependencies, so no need to run npm install
# RUN npm install --omit=dev

# Copy server code
COPY mcp_server.js ./

# Set permissions
RUN chown -R mcpuser:mcpuser /home/mcpuser

# Use the non-root user
USER mcpuser

# Expose the port
EXPOSE 3000

# Set health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

# Start the server
CMD ["node", "mcp_server.js"]
