FROM node:24-alpine AS builder

WORKDIR /workspace

COPY package.json ./

RUN set -eux; \
    apk add --no-cache --virtual .build-deps \
        build-base \
        python3 \
        python3-dev \
        py3-pip \
        py3-setuptools \
        sqlite-dev \
        linux-headers; \
    ln -sf /usr/bin/python3 /usr/bin/python || true; \
    npm_config_build_from_source=true npm install --no-fund --no-audit

COPY tsconfig*.json ./
COPY src/ ./src/
COPY plugins/ ./plugins/
COPY docs/ ./docs/
COPY tools/plugins/ ./tools/plugins/

RUN npm run build:ts

FROM node:24-alpine

RUN sed -i -E 's#https?://[^/]+/alpine#https://dl-4.alpinelinux.org/alpine#g' /etc/apk/repositories \
    && apk update

RUN set -eux; \
    for i in 1 2 3; do \
        apk add --no-cache \
            bash \
            ca-certificates \
            curl \
            libcap \
            net-snmp \
            net-snmp-tools \
            nmap \
            wget \
        && setcap cap_net_raw,cap_net_admin,cap_net_bind_service+eip /usr/bin/nmap \
        && break \
        || (echo 'apk add failed, retrying...' && apk update && sleep 3); \
    done

RUN mkdir -p /etc/snmp /usr/share/snmp/mibs \
    && echo 'mibs +ALL' > /etc/snmp/snmp.conf

RUN for MIB in SNMPv2-MIB IF-MIB IP-MIB HOST-RESOURCES-MIB SNMP-FRAMEWORK-MIB; do \
        echo "Downloading $MIB"; \
        for i in 1 2 3; do \
            wget -q --timeout=30 --tries=3 "https://raw.githubusercontent.com/librenms/librenms/master/mibs/${MIB}" -O "/usr/share/snmp/mibs/${MIB}" && break || true; \
            echo "Retry $i for $MIB"; \
            sleep 2; \
        done; \
        if [ ! -s "/usr/share/snmp/mibs/${MIB}" ]; then \
            touch "/usr/share/snmp/mibs/${MIB}"; \
        fi; \
    done

ENV NMAPDIR=/usr/share/nmap

RUN adduser -D -h /home/mcpuser mcpuser

WORKDIR /home/mcpuser/app

COPY --from=builder /workspace/package.json ./
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/dist-ts ./dist-ts
COPY --from=builder /workspace/src ./src
COPY --from=builder /workspace/plugins ./plugins
COPY --from=builder /workspace/docs ./docs
COPY --from=builder /workspace/tools/plugins ./tools/plugins

RUN npm prune --omit=dev \
    && mkdir -p /home/mcpuser/app/data /home/mcpuser/app/logs /home/mcpuser/plugins \
    && chown -R mcpuser:mcpuser /home/mcpuser/app /home/mcpuser/plugins

ENV DOCKER_CONTAINER=true
ENV HTTP_PORT=6270
ENV HTTP_HOST=0.0.0.0
ENV TRANSPORT_MODE=http
ENV PLUGINS_ROOT=/home/mcpuser/plugins
ENV SCHEMA_PATH=/home/mcpuser/app/docs/mcp-od-marketplace/specs/schemas/mcp-plugin.schema.v2.json

EXPOSE 6270

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:6270/health || exit 1

USER mcpuser

CMD ["node", "--use-system-ca", "dist-ts/src/main.js"]