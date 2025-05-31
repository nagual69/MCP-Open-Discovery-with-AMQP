#!/usr/bin/env node
/**
 * MCP Proxy Server
 * This script creates a proxy that sits between VS Code and our MCP server
 * to log all requests and responses to help diagnose connection issues.
 */

const http = require('http');
const net = require('net');
const url = require('url');

const TARGET_HOST = 'localhost';
const TARGET_PORT = 3000;
const PROXY_PORT = 3001;

// Create an HTTP server that will act as a proxy
const proxyServer = http.createServer((req, res) => {
  console.log(`[PROXY] Received ${req.method} request for ${req.url}`);
  
  // Log headers
  console.log('[PROXY] Request headers:', req.headers);
  
  // Collect the request body
  let requestBody = '';
  req.on('data', (chunk) => {
    requestBody += chunk.toString();
  });
  
  req.on('end', () => {
    // Log the request body
    if (requestBody) {
      try {
        const jsonRequest = JSON.parse(requestBody);
        console.log('[PROXY] Request body (JSON):', JSON.stringify(jsonRequest, null, 2));
      } catch (e) {
        console.log('[PROXY] Request body (raw):', requestBody);
      }
    }
    
    // Create options for the proxy request
    const options = {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers
    };
    
    // Create the proxy request
    const proxyReq = http.request(options, (proxyRes) => {
      console.log(`[PROXY] Received response: ${proxyRes.statusCode}`);
      console.log('[PROXY] Response headers:', proxyRes.headers);
      
      // Set the status code and headers
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      
      // Collect the response body
      let responseBody = '';
      proxyRes.on('data', (chunk) => {
        responseBody += chunk.toString();
        res.write(chunk);
      });
      
      proxyRes.on('end', () => {
        // Log the response body
        if (responseBody) {
          try {
            const jsonResponse = JSON.parse(responseBody);
            console.log('[PROXY] Response body (JSON):', JSON.stringify(jsonResponse, null, 2));
          } catch (e) {
            console.log('[PROXY] Response body (raw):', responseBody);
          }
        }
        
        res.end();
      });
    });
    
    // Handle errors in the proxy request
    proxyReq.on('error', (error) => {
      console.error('[PROXY] Error:', error.message);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Proxy error: ${error.message}`);
    });
    
    // Write the request body to the proxy request
    if (requestBody) {
      proxyReq.write(requestBody);
    }
    
    proxyReq.end();
  });
});

proxyServer.listen(PROXY_PORT, () => {
  console.log(`MCP Proxy Server running on port ${PROXY_PORT}`);
  console.log(`Forwarding requests to ${TARGET_HOST}:${TARGET_PORT}`);
  console.log(`To use with VS Code, update the URL in settings.json to: http://localhost:${PROXY_PORT}`);
});
