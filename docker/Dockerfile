FROM node:24-alpine

# Improve APK reliability: switch to an alternate mirror and refresh indexes
RUN sed -i -E 's#https?://[^/]+/alpine#https://dl-4.alpinelinux.org/alpine#g' /etc/apk/repositories \
    && cat /etc/apk/repositories \
    && apk update

# Base packages first (certs + tools) and discovery tooling in one layer
# - ca-certificates before any HTTPS fetches
# - nmap from Alpine repo (includes NSE scripts)
# - libcap provides setcap; grant capabilities to nmap
# - SNMP tools (no dev headers to keep image slim)
RUN set -eux; \
        for i in 1 2 3; do \
        apk add --no-cache \
        ca-certificates \
        wget \
        curl \
        bash \
        nmap \
        libcap \
        net-snmp \
        && setcap cap_net_raw,cap_net_admin,cap_net_bind_service+eip /usr/bin/nmap \
        && break \
        || (echo 'apk add failed, retrying...' && apk update && sleep 3); \
        done

# Setup SNMP configuration
RUN mkdir -p /etc/snmp \
    && echo "mibs +ALL" > /etc/snmp/snmp.conf

# Create MIBs directory (some images may not include it)
RUN mkdir -p /usr/share/snmp/mibs

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
# Install build dependencies needed for native modules, run npm install, then remove build deps
RUN set -eux; \
    apk update; \
    apk add --no-cache --virtual .build-deps \
        build-base \
        python3 \
        python3-dev \
        py3-pip \
        py3-setuptools \
        sqlite-dev \
        linux-headers \
    ; \
    ln -sf /usr/bin/python3 /usr/bin/python || true; \
    # Prefer building native modules from source to avoid prebuilt download/SSL issues
    npm_config_build_from_source=true npm install --no-fund --no-audit; \
    apk del .build-deps || true

# Copy application files
COPY mcp_open_discovery_server.js ./
COPY tools/ ./tools/
COPY scripts/ ./scripts/

## Ensure runtime writable dirs exist so named volumes inherit ownership
RUN mkdir -p /home/mcpuser/app/data /home/mcpuser/app/logs /home/mcpuser/plugins 

# Set permissions
RUN chown -R mcpuser:mcpuser /home/mcpuser/app /home/mcpuser/plugins

# Set default transport mode to HTTP for container deployment
ENV TRANSPORT_MODE=http

# Default plugins root inside the container (can be overridden by env)
ENV PLUGINS_ROOT=/home/mcpuser/plugins

# Expose the port
EXPOSE 6270

# Set health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:6270/health || exit 1

# Use the non-root user
USER mcpuser

# Start the server
CMD ["node","--use-system-ca", "mcp_open_discovery_server.js"]
