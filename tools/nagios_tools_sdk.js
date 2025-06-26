// tools/nagios_tools_sdk.js
// Nagios XI API integration SDK
// Provides functions to interact with Nagios XI API (host/service status, config, etc.)

const http = require('http');
const https = require('https');
const url = require('url');
const { z } = require('zod');

/**
 * Validate required Nagios parameters
 * @param {string} baseUrl - Nagios XI base URL
 * @param {string} apiKey - Nagios XI API key
 * @returns {object|null} Error response if validation fails, null if valid
 */
function validateNagiosParams(baseUrl, apiKey) {
    if (!baseUrl || !apiKey) {
        return {
            isError: true,
            content: [{ type: 'text', text: 'Nagios error: baseUrl and apiKey are required parameters' }],
            structuredContent: { error: 'baseUrl and apiKey are required parameters' },
        };
    }
    return null;
}

/**
 * Helper to make HTTP(S) requests to Nagios XI API
 * @param {string} apiUrl - Full API URL
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {object} [data] - Data to send (for POST/PUT)
 * @returns {Promise<object>} - Parsed JSON response
 */
function nagiosApiRequest(apiUrl, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const parsedUrl = url.parse(apiUrl);
        const lib = parsedUrl.protocol === 'https:' ? https : http;
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.path,
            method,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        };
        let req = lib.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(new Error('Invalid JSON response'));
                }
            });
        });
        req.on('error', reject);
        if (data && (method === 'POST' || method === 'PUT')) {
            req.write(new URLSearchParams(data).toString());
        }
        req.end();
    });
}

/**
 * Get host status from Nagios XI
 * @param {string} baseUrl - Nagios XI base URL (e.g., http://nagios-server)
 * @param {string} apiKey - API key
 * @returns {Promise<object>} - Host status data
 */
function getHostStatus(baseUrl, apiKey) {
    const apiUrl = `${baseUrl}/nagiosxi/api/v1/objects/hoststatus?apikey=${apiKey}&pretty=1`;
    return nagiosApiRequest(apiUrl, 'GET');
}

// Enhanced: MCP Tool for fetching host status (with filtering)
const nagiosHostStatusTool = {
    name: 'nagios_get_host_status',
    description: 'Fetch status for all hosts from Nagios XI (with optional filtering)',
    inputSchema: z.object({
        baseUrl: z.string().describe('Nagios XI base URL'),
        apiKey: z.string().describe('Nagios XI API key'),
        host_name: z.string().optional().describe('Filter by host name'),
        current_state: z.number().optional().describe('Filter by state (0=up, 1=down, 2=unreachable)'),
        limit: z.number().min(1).max(1000).default(100).describe('Max results to return'),
        cursor: z.string().optional().describe('Pagination cursor (if supported)'),
    }),
    outputSchema: z.any(),
    handler: async ({ baseUrl, apiKey, host_name, current_state, limit, cursor }) => {
        // Validate required parameters
        if (!baseUrl || !apiKey) {
            return {
                isError: true,
                content: [{ type: 'text', text: 'Nagios host status error: baseUrl and apiKey are required parameters' }],
                structuredContent: { error: 'baseUrl and apiKey are required parameters' },
            };
        }
        
        let apiUrl = `${baseUrl}/nagiosxi/api/v1/objects/hoststatus?apikey=${apiKey}&records=${limit}&pretty=1`;
        if (host_name) apiUrl += `&host_name=${encodeURIComponent(host_name)}`;
        if (typeof current_state === 'number') apiUrl += `&current_state=${current_state}`;
        if (cursor) apiUrl += `&cursor=${encodeURIComponent(cursor)}`;
        try {
            const data = await nagiosApiRequest(apiUrl, 'GET');
            return {
                content: [{ type: 'json', json: data }],
                structuredContent: data,
                isError: false,
            };
        } catch (error) {
            return {
                isError: true,
                content: [{ type: 'text', text: `Nagios host status error: ${error.message}` }],
                structuredContent: { error: error.message },
            };
        }
    },
    annotations: {
        title: 'Nagios Host Status',
        readOnlyHint: true,
        openWorldHint: true,
    },
};

// Enhanced: MCP Tool for fetching service status (with filtering)
const nagiosServiceStatusTool = {
    name: 'nagios_get_service_status',
    description: 'Fetch status for all services from Nagios XI (with optional filtering)',
    inputSchema: z.object({
        baseUrl: z.string().describe('Nagios XI base URL'),
        apiKey: z.string().describe('Nagios XI API key'),
        host_name: z.string().optional().describe('Filter by host name'),
        service_description: z.string().optional().describe('Filter by service description'),
        current_state: z.number().optional().describe('Filter by state (0=ok, 1=warning, 2=critical, 3=unknown)'),
        limit: z.number().min(1).max(1000).default(100).describe('Max results to return'),
        cursor: z.string().optional().describe('Pagination cursor (if supported)'),
    }),
    outputSchema: z.any(),
    handler: async ({ baseUrl, apiKey, host_name, service_description, current_state, limit, cursor }) => {
        // Validate required parameters
        const validationError = validateNagiosParams(baseUrl, apiKey);
        if (validationError) return validationError;
        
        let apiUrl = `${baseUrl}/nagiosxi/api/v1/objects/servicestatus?apikey=${apiKey}&records=${limit}&pretty=1`;
        if (host_name) apiUrl += `&host_name=${encodeURIComponent(host_name)}`;
        if (service_description) apiUrl += `&service_description=${encodeURIComponent(service_description)}`;
        if (typeof current_state === 'number') apiUrl += `&current_state=${current_state}`;
        if (cursor) apiUrl += `&cursor=${encodeURIComponent(cursor)}`;
        try {
            const data = await nagiosApiRequest(apiUrl, 'GET');
            return {
                content: [{ type: 'json', json: data }],
                structuredContent: data,
                isError: false,
            };
        } catch (error) {
            return {
                isError: true,
                content: [{ type: 'text', text: `Nagios service status error: ${error.message}` }],
                structuredContent: { error: error.message },
            };
        }
    },
    annotations: {
        title: 'Nagios Service Status',
        readOnlyHint: true,
        openWorldHint: true,
    },
};

// Enhanced: MCP Tool for fetching event log (with filtering)
const nagiosEventLogTool = {
    name: 'nagios_get_event_log',
    description: 'Fetch recent Nagios XI event log entries (with optional filtering)',
    inputSchema: z.object({
        baseUrl: z.string().describe('Nagios XI base URL'),
        apiKey: z.string().describe('Nagios XI API key'),
        host_name: z.string().optional().describe('Filter by host name'),
        service_description: z.string().optional().describe('Filter by service description'),
        state: z.number().optional().describe('Filter by state'),
        start_time: z.string().optional().describe('Start time (ISO8601)'),
        end_time: z.string().optional().describe('End time (ISO8601)'),
        limit: z.number().min(1).max(1000).default(100).describe('Max entries to fetch'),
        cursor: z.string().optional().describe('Pagination cursor (if supported)'),
    }),
    outputSchema: z.any(),
    handler: async ({ baseUrl, apiKey, host_name, service_description, state, start_time, end_time, limit, cursor }) => {
        let apiUrl = `${baseUrl}/nagiosxi/api/v1/objects/eventlog?apikey=${apiKey}&records=${limit}&pretty=1`;
        if (host_name) apiUrl += `&host_name=${encodeURIComponent(host_name)}`;
        if (service_description) apiUrl += `&service_description=${encodeURIComponent(service_description)}`;
        if (typeof state === 'number') apiUrl += `&state=${state}`;
        if (start_time) apiUrl += `&start_time=${encodeURIComponent(start_time)}`;
        if (end_time) apiUrl += `&end_time=${encodeURIComponent(end_time)}`;
        if (cursor) apiUrl += `&cursor=${encodeURIComponent(cursor)}`;
        try {
            const data = await nagiosApiRequest(apiUrl, 'GET');
            return {
                content: [{ type: 'json', json: data }],
                structuredContent: data,
                isError: false,
            };
        } catch (error) {
            return {
                isError: true,
                content: [{ type: 'text', text: `Nagios event log error: ${error.message}` }],
                structuredContent: { error: error.message },
            };
        }
    },
    annotations: {
        title: 'Nagios Event Log',
        readOnlyHint: true,
        openWorldHint: true,
    },
};

// Tool: Fetch Nagios host config (inventory)
const nagiosHostConfigTool = {
    name: 'nagios_get_host_config',
    description: 'Fetch Nagios XI host configuration (inventory)',
    inputSchema: z.object({
        baseUrl: z.string().describe('Nagios XI base URL'),
        apiKey: z.string().describe('Nagios XI API key'),
    }),
    outputSchema: z.any(),
    handler: async ({ baseUrl, apiKey }) => {
        const apiUrl = `${baseUrl}/nagiosxi/api/v1/config/host?apikey=${apiKey}&pretty=1`;
        try {
            const data = await nagiosApiRequest(apiUrl, 'GET');
            return {
                content: [{ type: 'json', json: data }],
                structuredContent: data,
                isError: false,
            };
        } catch (error) {
            return {
                isError: true,
                content: [{ type: 'text', text: `Nagios host config error: ${error.message}` }],
                structuredContent: { error: error.message },
            };
        }
    },
    annotations: {
        title: 'Nagios Host Config',
        readOnlyHint: true,
        openWorldHint: true,
    },
};

// Tool: Fetch Nagios service config (inventory)
const nagiosServiceConfigTool = {
    name: 'nagios_get_service_config',
    description: 'Fetch Nagios XI service configuration (inventory)',
    inputSchema: z.object({
        baseUrl: z.string().describe('Nagios XI base URL'),
        apiKey: z.string().describe('Nagios XI API key'),
    }),
    outputSchema: z.any(),
    handler: async ({ baseUrl, apiKey }) => {
        const apiUrl = `${baseUrl}/nagiosxi/api/v1/config/service?apikey=${apiKey}&pretty=1`;
        try {
            const data = await nagiosApiRequest(apiUrl, 'GET');
            return {
                content: [{ type: 'json', json: data }],
                structuredContent: data,
                isError: false,
            };
        } catch (error) {
            return {
                isError: true,
                content: [{ type: 'text', text: `Nagios service config error: ${error.message}` }],
                structuredContent: { error: error.message },
            };
        }
    },
    annotations: {
        title: 'Nagios Service Config',
        readOnlyHint: true,
        openWorldHint: true,
    },
};

// Tool: Acknowledge alert (host or service)
const nagiosAcknowledgeAlertTool = {
    name: 'nagios_acknowledge_alert',
    description: 'Acknowledge a problem on a host or service in Nagios XI',
    inputSchema: z.object({
        baseUrl: z.string().describe('Nagios XI base URL'),
        apiKey: z.string().describe('Nagios XI API key'),
        host: z.string().describe('Target host'),
        service: z.string().optional().describe('Target service (optional)'),
        comment: z.string().describe('Acknowledgement comment'),
        author: z.string().default('mcp-open-discovery').describe('Author of acknowledgement'),
        sticky: z.boolean().default(true),
        notify: z.boolean().default(true),
        persistent: z.boolean().default(false),
        expire: z.number().default(0).describe('Expiry timestamp (0=never)'),
    }),
    outputSchema: z.any(),
    handler: async ({ baseUrl, apiKey, ...params }) => {
        const apiUrl = `${baseUrl}/nagiosxi/api/v1/system/command?apikey=${apiKey}`;
        // Nagios XI expects POST data for acknowledgement
        const postData = {
            cmd: 'ACKNOWLEDGE_HOST_PROBLEM',
            ...params,
        };
        try {
            const data = await nagiosApiRequest(apiUrl, 'POST', postData);
            return {
                content: [{ type: 'json', json: data }],
                structuredContent: data,
                isError: false,
            };
        } catch (error) {
            return {
                isError: true,
                content: [{ type: 'text', text: `Nagios acknowledge error: ${error.message}` }],
                structuredContent: { error: error.message },
            };
        }
    },
    annotations: {
        title: 'Nagios Acknowledge Alert',
        readOnlyHint: false,
        openWorldHint: true,
    },
};

// Expand resource scaffolding
const nagiosResources = [
    {
        uri: 'nagios://eventlog/recent',
        name: 'Nagios Recent Event Log',
        description: 'Recent Nagios XI event log entries as a resource',
        mimeType: 'application/json',
        /**
         * getContent handler for event log resource
         * @param {object} params - { baseUrl, apiKey, host_name, service_description, state, start_time, end_time, limit, cursor }
         */
        getContent: async (params) => {
            const { baseUrl, apiKey, host_name, service_description, state, start_time, end_time, limit = 100, cursor } = params || {};
            let apiUrl = `${baseUrl}/nagiosxi/api/v1/objects/eventlog?apikey=${apiKey}&records=${limit}&pretty=1`;
            if (host_name) apiUrl += `&host_name=${encodeURIComponent(host_name)}`;
            if (service_description) apiUrl += `&service_description=${encodeURIComponent(service_description)}`;
            if (typeof state === 'number') apiUrl += `&state=${state}`;
            if (start_time) apiUrl += `&start_time=${encodeURIComponent(start_time)}`;
            if (end_time) apiUrl += `&end_time=${encodeURIComponent(end_time)}`;
            if (cursor) apiUrl += `&cursor=${encodeURIComponent(cursor)}`;
            try {
                const data = await nagiosApiRequest(apiUrl, 'GET');
                return {
                    content: [{ type: 'json', json: data }],
                    structuredContent: data,
                    isError: false,
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [{ type: 'text', text: `Nagios event log error: ${error.message}` }],
                    structuredContent: { error: error.message },
                };
            }
        },
    },
    {
        uri: 'nagios://inventory/hosts',
        name: 'Nagios Host Inventory',
        description: 'Snapshot of all Nagios XI hosts',
        mimeType: 'application/json',
        /**
         * getContent handler for host inventory resource
         * @param {object} params - { baseUrl, apiKey, limit, cursor }
         */
        getContent: async (params) => {
            const { baseUrl, apiKey, limit = 1000, cursor } = params || {};
            let apiUrl = `${baseUrl}/nagiosxi/api/v1/objects/host?apikey=${apiKey}&records=${limit}&pretty=1`;
            if (cursor) apiUrl += `&cursor=${encodeURIComponent(cursor)}`;
            try {
                const data = await nagiosApiRequest(apiUrl, 'GET');
                return {
                    content: [{ type: 'json', json: data }],
                    structuredContent: data,
                    isError: false,
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [{ type: 'text', text: `Nagios host inventory error: ${error.message}` }],
                    structuredContent: { error: error.message },
                };
            }
        },
    },
    {
        uri: 'nagios://config/hosts',
        name: 'Nagios Host Config',
        description: 'Current Nagios XI host configuration as a resource',
        mimeType: 'application/json',
        /**
         * getContent handler for host config resource
         * @param {object} params - { baseUrl, apiKey }
         */
        getContent: async (params) => {
            const { baseUrl, apiKey } = params || {};
            const apiUrl = `${baseUrl}/nagiosxi/api/v1/config/host?apikey=${apiKey}&pretty=1`;
            try {
                const data = await nagiosApiRequest(apiUrl, 'GET');
                return {
                    content: [{ type: 'json', json: data }],
                    structuredContent: data,
                    isError: false,
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [{ type: 'text', text: `Nagios host config error: ${error.message}` }],
                    structuredContent: { error: error.message },
                };
            }
        },
    },
    {
        uri: 'nagios://config/services',
        name: 'Nagios Service Config',
        description: 'Current Nagios XI service configuration as a resource',
        mimeType: 'application/json',
        /**
         * getContent handler for service config resource
         * @param {object} params - { baseUrl, apiKey }
         */
        getContent: async (params) => {
            const { baseUrl, apiKey } = params || {};
            const apiUrl = `${baseUrl}/nagiosxi/api/v1/config/service?apikey=${apiKey}&pretty=1`;
            try {
                const data = await nagiosApiRequest(apiUrl, 'GET');
                return {
                    content: [{ type: 'json', json: data }],
                    structuredContent: data,
                    isError: false,
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [{ type: 'text', text: `Nagios service config error: ${error.message}` }],
                    structuredContent: { error: error.message },
                };
            }
        },
    },
];

// Update tool export
function getNagiosTools() {
    return [
        nagiosHostStatusTool,
        nagiosServiceStatusTool,
        nagiosEventLogTool,
        nagiosHostConfigTool,
        nagiosServiceConfigTool,
        nagiosAcknowledgeAlertTool,
    ];
}

function getNagiosResources() {
    return nagiosResources;
}

module.exports = {
    nagiosApiRequest,
    getHostStatus,
    getNagiosTools,
    getNagiosResources,
};
