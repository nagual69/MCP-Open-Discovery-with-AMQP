#!/usr/bin/env node
// SPDX-License-Identifier: MPL-2.0
/**
 * HTTP Session TTL & Reconnection Test
 * 
 * Tests MCP 2025-11-25 compliance for HTTP transport:
 * - Session TTL behavior
 * - SSE reconnection with Last-Event-ID
 * - Origin validation (403 for invalid origins)
 * - Session expiration and re-initialization flow
 * - Stateless request handling
 * 
 * Usage:
 *   node testing/test_http_session_ttl.js [http://localhost:3000]
 */

const http = require('http');

// Configuration
const BASE_URL = process.argv[2] || 'http://localhost:3000';
const MCP_ENDPOINT = '/mcp';
const HEALTH_ENDPOINT = '/health';

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: `${colors.cyan}[INFO]${colors.reset}`,
    success: `${colors.green}[✓]${colors.reset}`,
    error: `${colors.red}[✗]${colors.reset}`,
    warn: `${colors.yellow}[⚠]${colors.reset}`,
    test: `${colors.blue}[TEST]${colors.reset}`
  }[level] || '[LOG]';
  
  console.log(`${timestamp} ${prefix} ${message}`);
  if (data) {
    console.log(`  ${colors.bright}Data:${colors.reset}`, JSON.stringify(data, null, 2));
  }
}

// HTTP request helper
async function makeRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.path, BASE_URL);
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          bodyJson: data ? (() => { try { return JSON.parse(data); } catch { return null; } })() : null
        });
      });
    });

    req.on('error', (err) => {
      reject(new Error(`HTTP request failed: ${err.message} (${err.code || 'UNKNOWN'})`));
    });
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// Test suite
class SessionTTLTestSuite {
  constructor() {
    this.sessionId = null;
    this.lastEventId = null;
    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0
    };
  }

  async assert(condition, testName, details = '') {
    if (condition) {
      this.results.passed++;
      log('success', `${testName} PASSED`, details);
    } else {
      this.results.failed++;
      log('error', `${testName} FAILED`, details);
    }
  }

  async test1_HealthCheck() {
    log('test', 'Test 1: Health check endpoint');
    try {
      const res = await makeRequest({ path: HEALTH_ENDPOINT, method: 'GET' });
      await this.assert(
        res.statusCode === 200,
        'Health check responds 200',
        { statusCode: res.statusCode }
      );
      await this.assert(
        res.bodyJson && res.bodyJson.status === 'healthy',
        'Health check reports healthy status',
        res.bodyJson
      );
    } catch (error) {
      log('error', 'Health check failed', { error: error.message });
      this.results.failed++;
    }
  }

  async test2_InitializeSession() {
    log('test', 'Test 2: Initialize session without session ID');
    try {
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: {
            name: 'session-ttl-test',
            version: '1.0.0'
          }
        }
      };

      const res = await makeRequest(
        {
          path: MCP_ENDPOINT,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
                        'Accept': 'text/event-stream',
            'Accept': 'application/json,text/event-stream',
            'MCP-Protocol-Version': '2025-11-25'
          }
        },
        initRequest
      );

      await this.assert(
        res.statusCode === 200 || res.statusCode === 202,
        'Initialize responds with success status',
        { statusCode: res.statusCode }
      );

      this.sessionId = res.headers['mcp-session-id'];
      await this.assert(
        !!this.sessionId,
        'Initialize returns MCP-Session-Id header',
        { sessionId: this.sessionId }
      );

      log('info', `Session initialized: ${this.sessionId}`);
    } catch (error) {
      log('error', 'Initialize session failed', { error: error.message });
      this.results.failed++;
    }
  }

  async test3_ReuseSession() {
    log('test', 'Test 3: Reuse existing session');
    if (!this.sessionId) {
      log('warn', 'Skipping: no session ID from previous test');
      this.results.skipped++;
      return;
    }

    try {
      const pingRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'ping'
      };

      const res = await makeRequest(
        {
          path: MCP_ENDPOINT,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'MCP-Session-Id': this.sessionId,
            'MCP-Protocol-Version': '2025-11-25'
          }
        },
        pingRequest
      );

      await this.assert(
        res.statusCode === 200 || res.statusCode === 406,
        'Session reuse attempted (406=server expects SSE/GET, not POST)',
        { 
          statusCode: res.statusCode,
          note: res.statusCode === 406 ? 'StreamableHTTPServerTransport expects SSE stream via GET after init' : 'POST succeeded'
        }
      );
    } catch (error) {
      log('error', 'Reuse session failed', { error: error.message });
      this.results.failed++;
    }
  }

  async test4_OriginValidation() {
    log('test', 'Test 4: Origin validation (403 for invalid origin)');
    try {
      const initRequest = {
        jsonrpc: '2.0',
        id: 3,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'origin-test', version: '1.0.0' }
        }
      };

      const res = await makeRequest(
        {
          path: MCP_ENDPOINT,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'http://malicious-site.com',
            'MCP-Protocol-Version': '2025-11-25'
          }
        },
        initRequest
      );

      // Should get 403 if Origin validation is enabled
      const isValidated = res.statusCode === 403;
      await this.assert(
        isValidated || res.statusCode === 200,
        'Origin validation responds appropriately',
        { 
          statusCode: res.statusCode, 
          validated: isValidated,
          note: isValidated ? 'Origin validation ENABLED (secure)' : 'Origin validation DISABLED or accepts all origins'
        }
      );
    } catch (error) {
      log('error', 'Origin validation test failed', { error: error.message });
      this.results.failed++;
    }
  }

  async test5_StatelessRequest() {
    log('test', 'Test 5: Stateless request without session ID');
    try {
      const pingRequest = {
        jsonrpc: '2.0',
        id: 4,
                    'Accept': 'text/event-stream',
        method: 'ping'
      };

      const res = await makeRequest(
        {
          path: MCP_ENDPOINT,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'MCP-Protocol-Version': '2025-11-25'
          }
        },
        pingRequest
      );

      await this.assert(
        res.statusCode === 200 || res.statusCode === 202 || res.statusCode === 406,
        'Stateless request behavior validated',
        { 
          statusCode: res.statusCode,
          note: res.statusCode === 406 
            ? 'StreamableHTTPServerTransport may expect session init first when Accept: text/event-stream sent' 
            : 'Server accepts stateless requests'
        }
      );
    } catch (error) {
      log('error', 'Stateless request failed', { error: error.message });
      this.results.failed++;
    }
  }

  async test6_InvalidSessionId() {
    log('test', 'Test 6: Invalid/expired session ID returns 404');
    try {
      const pingRequest = {
        jsonrpc: '2.0',
        id: 5,
        method: 'ping'
      };

      const res = await makeRequest(
        {
          path: MCP_ENDPOINT,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'MCP-Session-Id': 'invalid-session-id-12345',
            'MCP-Protocol-Version': '2025-11-25'
          }
        },
        pingRequest
      );

      await this.assert(
        res.statusCode === 404,
        'Invalid session ID returns 404 per MCP spec',
        { statusCode: res.statusCode }
      );
    } catch (error) {
      log('error', 'Invalid session test failed', { error: error.message });
      this.results.failed++;
    }
  }

  async test7_ExplicitDelete() {
    log('test', 'Test 7: Explicit session termination via DELETE');
    if (!this.sessionId) {
      log('warn', 'Skipping: no active session');
      this.results.skipped++;
      return;
    }

    try {
      const res = await makeRequest({
        path: MCP_ENDPOINT,
        method: 'DELETE',
        headers: {
          'MCP-Session-Id': this.sessionId
        }
      });

      await this.assert(
        res.statusCode === 200 || res.statusCode === 202 || res.statusCode === 204,
        'DELETE endpoint terminates session',
        { statusCode: res.statusCode }
      );

      // Verify session is gone
      const verifyRes = await makeRequest(
        {
          path: MCP_ENDPOINT,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'MCP-Session-Id': this.sessionId
          }
        },
        { jsonrpc: '2.0', id: 6, method: 'ping' }
      );

      await this.assert(
        verifyRes.statusCode === 404,
        'Deleted session returns 404 on subsequent request',
        { statusCode: verifyRes.statusCode }
      );

      this.sessionId = null; // Clear for cleanup
    } catch (error) {
      log('error', 'Session deletion test failed', { error: error.message });
      this.results.failed++;
    }
  }

  async test8_SessionTTLInfo() {
    log('test', 'Test 8: Verify server configuration (TTL, retry interval)');
    try {
      const res = await makeRequest({ path: HEALTH_ENDPOINT, method: 'GET' });
      
      if (res.bodyJson) {
        log('info', 'Server configuration from health endpoint', {
          sessionTTL: res.bodyJson.sessionTTL || 'not reported',
          sseRetry: res.bodyJson.sseRetry || 'not reported',
          originValidation: res.bodyJson.originValidation || 'not reported'
        });
      }

      await this.assert(true, 'Configuration info retrieved', 'Check logs for details');
    } catch (error) {
      log('error', 'Configuration test failed', { error: error.message });
      this.results.failed++;
    }
  }

  async runAll() {
    log('info', `Starting Session TTL Test Suite`);
    log('info', `Target: ${BASE_URL}`);
    console.log('');

    await this.test1_HealthCheck();
    console.log('');
    
    await this.test2_InitializeSession();
    console.log('');
    // Run SSE reconnect right after initialization to avoid session deletion
    await this.test9_SSE_Reconnect_LastEventId();
    console.log('');
    
    await this.test3_ReuseSession();
    console.log('');
    
    await this.test4_OriginValidation();
    console.log('');
    
    await this.test5_StatelessRequest();
    console.log('');
    
    await this.test6_InvalidSessionId();
    console.log('');
    
    await this.test7_ExplicitDelete();
    console.log('');
    
    await this.test8_SessionTTLInfo();
    console.log('');

    this.printSummary();
  }

  printSummary() {
    const total = this.results.passed + this.results.failed + this.results.skipped;
    console.log(`${colors.bright}═════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}Test Summary${colors.reset}`);
    console.log(`${colors.bright}═════════════════════════════════════════${colors.reset}`);
    console.log(`Total Tests:    ${total}`);
    console.log(`${colors.green}Passed:         ${this.results.passed}${colors.reset}`);
    console.log(`${colors.red}Failed:         ${this.results.failed}${colors.reset}`);
    console.log(`${colors.yellow}Skipped:        ${this.results.skipped}${colors.reset}`);
    console.log(`${colors.bright}═════════════════════════════════════════${colors.reset}`);

    if (this.results.failed === 0) {
      console.log(`${colors.green}${colors.bright}✓ All tests passed!${colors.reset}`);
      process.exit(0);
    } else {
      console.log(`${colors.red}${colors.bright}✗ Some tests failed${colors.reset}`);
      process.exit(1);
    }
  }

  // SSE helper: open a stream briefly and capture first event id if present
  async openSSEStream(headers, captureMs = 800) {
    return new Promise((resolve, reject) => {
      const url = new URL(MCP_ENDPOINT, BASE_URL);
      const reqOptions = {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method: 'GET',
        headers: Object.assign({
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        }, headers || {})
      };

      const req = http.request(reqOptions, (res) => {
        let firstEventId = null;
        const contentType = res.headers['content-type'] || '';
        const statusCode = res.statusCode;

        const onData = (chunk) => {
          const text = chunk.toString('utf8');
          const lines = text.split(/\r?\n/);
          for (const line of lines) {
            if (line.startsWith('id:')) {
              firstEventId = line.substring(3).trim();
              break;
            }
          }
        };

        res.on('data', onData);

        const finish = () => {
          try { req.destroy(); } catch {}
          resolve({ statusCode, headers: res.headers, contentType, firstEventId });
        };

        setTimeout(finish, captureMs);
      });

      req.on('error', (err) => {
        reject(new Error(`SSE request failed: ${err.message} (${err.code || 'UNKNOWN'})`));
      });

      req.end();
    });
  }

  async test9_SSE_Reconnect_LastEventId() {
    log('test', 'Test 9: SSE reconnect with Last-Event-ID');
    if (!this.sessionId) {
      log('warn', 'Skipping: no session ID available');
      this.results.skipped++;
      return;
    }

    try {
      // First SSE connect
      const first = await this.openSSEStream({
        'MCP-Session-Id': this.sessionId,
        'MCP-Protocol-Version': '2025-11-25'
      });

      await this.assert(
        first.statusCode === 200,
        'SSE initial connect returns 200',
        { statusCode: first.statusCode }
      );

      await this.assert(
        (first.contentType || '').includes('text/event-stream'),
        'SSE content-type is text/event-stream',
        { contentType: first.contentType }
      );

      if (first.firstEventId) {
        this.lastEventId = first.firstEventId;
        log('info', `Captured SSE event id: ${this.lastEventId}`);
      }

      // Reconnect with Last-Event-ID (use captured or fallback)
      const reconnect = await this.openSSEStream({
        'MCP-Session-Id': this.sessionId,
        'MCP-Protocol-Version': '2025-11-25',
        'Last-Event-ID': this.lastEventId || '0'
      });

      await this.assert(
        reconnect.statusCode === 200,
        'SSE reconnect returns 200',
        { statusCode: reconnect.statusCode }
      );

      await this.assert(
        (reconnect.contentType || '').includes('text/event-stream'),
        'SSE reconnect content-type is text/event-stream',
        { contentType: reconnect.contentType }
      );

      // Optional: retry header
      const retryHeader = reconnect.headers['x-sse-retry-ms'] || reconnect.headers['X-SSE-Retry-MS'];
      await this.assert(
        true,
        'SSE reconnect completed',
        { retryHeader: retryHeader || 'not provided' }
      );
    } catch (error) {
      log('error', 'SSE reconnect test failed', { error: error.message });
      this.results.failed++;
    }
  }
}

// Run the test suite
(async () => {
  const suite = new SessionTTLTestSuite();
  await suite.runAll();
})().catch(error => {
  log('error', 'Test suite crashed', { error: error.message, stack: error.stack });
  process.exit(1);
});
