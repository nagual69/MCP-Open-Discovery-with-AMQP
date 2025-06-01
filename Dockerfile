FROM node:24-alpine

# Install busybox
RUN apk add --no-cache busybox

# Install nmap
RUN apk add --no-cache nmap \
    && wget -O /tmp/nmap.tar.bz2 https://nmap.org/dist/nmap-7.97.tar.bz2 \
    && mkdir -p /tmp/nmap-src \
    && tar -xjf /tmp/nmap.tar.bz2 -C /tmp/nmap-src --strip-components=1 \
    && cp -r /tmp/nmap-src/scripts /usr/share/nmap/ \
    && cp -r /tmp/nmap-src/nselib /usr/share/nmap/ \
    && cp /tmp/nmap-src/nse_main.lua /usr/share/nmap/ \
    && rm -rf /tmp/nmap.tar.bz2 /tmp/nmap-src

# Set NMAPDIR so Nmap can find its scripts
ENV NMAPDIR=/usr/share/nmap

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
