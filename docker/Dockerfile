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

# Install libcap for capability management and grant network capabilities to nmap 
RUN apk add --no-cache libcap \
    && setcap cap_net_raw,cap_net_admin,cap_net_bind_service+eip /usr/bin/nmap   # Install SNMP tools (net-snmp packages)
RUN apk add --no-cache net-snmp net-snmp-tools net-snmp-dev 

# Setup SNMP configuration
RUN mkdir -p /etc/snmp \
    && echo "mibs +ALL" > /etc/snmp/snmp.conf

# Install additional tools and download MIBs
RUN apk add --no-cache bash wget curl ca-certificates \
    && mkdir -p /usr/share/snmp/mibs

# Download MIBs with retries and better error handling
RUN for MIB in SNMPv2-MIB IF-MIB IP-MIB HOST-RESOURCES-MIB SNMP-FRAMEWORK-MIB; do \
    echo "Downloading $MIB" && \
    for i in 1 2 3; do \
    wget -q --timeout=30 --tries=3 "https://raw.githubusercontent.com/librenms/librenms/master/mibs/${MIB}" -O "/usr/share/snmp/mibs/${MIB}" && break || \
    echo "Retry $i for $MIB"; \
    sleep 2; \
    done; \
    if [ ! -s "/usr/share/snmp/mibs/${MIB}" ]; then \
    echo "Creating empty $MIB file as placeholder"; \
    touch "/usr/share/snmp/mibs/${MIB}"; \
    fi; \
    done

# Set NMAPDIR so Nmap can find its scripts
ENV NMAPDIR=/usr/share/nmap

# Create a non-root user to run the server
RUN adduser -D -h /home/mcpuser mcpuser
WORKDIR /home/mcpuser/app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install --no-fund --no-audit

# Copy application files
COPY mcp_open_discovery_server.js ./
COPY tools/ ./tools/
COPY scripts/ ./scripts/

## Ensure runtime writable dirs exist so named volumes inherit ownership
RUN mkdir -p /home/mcpuser/app/data /home/mcpuser/app/logs 

# Set permissions
RUN chown -R mcpuser:mcpuser /home/mcpuser/app

# Set default transport mode to HTTP for container deployment
ENV TRANSPORT_MODE=http

# Expose the port
EXPOSE 3000

# Set health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

# Use the non-root user
USER mcpuser

# Start the server
CMD ["node","--use-system-ca", "mcp_open_discovery_server.js"]
