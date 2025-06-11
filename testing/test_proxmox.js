#!/usr/bin/env node

// Standalone Proxmox API integration test script (ACTIVE)
//
// This script tests direct integration with the Proxmox API, including credential encryption/decryption
// and API request/response handling. Maintained and reusable for integration testing.

// This is a standalone test script for Proxmox API integration
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

// ==================== CREDENTIAL HANDLING ====================
// Store credentials in /tmp which is a writable tmpfs in the Docker container
const CREDS_STORE_PATH = path.join('/tmp', 'proxmox_creds_store.json');
const CREDS_KEY_PATH = path.join('/tmp', 'proxmox_creds_key');

function getCredsKey() {
  // Use a persistent key file, or generate one if missing
  if (!fs.existsSync(CREDS_KEY_PATH)) {
    const key = crypto.randomBytes(32);
    fs.writeFileSync(CREDS_KEY_PATH, key);
    return key;
  }
  return fs.readFileSync(CREDS_KEY_PATH);
}

function encrypt(text) {
  const key = getCredsKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return iv.toString('base64') + ':' + encrypted;
}

function decrypt(data) {
  const key = getCredsKey();
  const [ivB64, encrypted] = data.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function loadCredsStore() {
  if (!fs.existsSync(CREDS_STORE_PATH)) return {};
  return JSON.parse(fs.readFileSync(CREDS_STORE_PATH, 'utf-8'));
}

function getProxmoxCredsById(id) {
  const store = loadCredsStore();
  if (!store[id]) throw new Error(`Credential not found: ${id}`);
  const c = store[id];
  return { ...c, password: decrypt(c.password) };
}

// ==================== API INTERACTION FUNCTIONS ====================
async function fetchProxmoxTicket(creds) {
  return new Promise((resolve, reject) => {
    const url = new URL(creds.host.replace(/\/$/, '') + '/api2/json/access/ticket');
    const realm = creds.realm || 'pam';
    const postData = `username=${encodeURIComponent(creds.username)}@${encodeURIComponent(realm)}&password=${encodeURIComponent(creds.password)}`;
    
    console.log(`[TEST] Auth request URL: ${url.origin}${url.pathname}`);
    console.log(`[TEST] Using username: ${creds.username}@${realm}`);
    
    const options = {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'Accept-Encoding': 'identity',
        'Accept': 'application/json'
      },
      rejectUnauthorized: false // Allow self-signed certs
    };
    
    console.log(`[TEST] Request headers: ${JSON.stringify(options.headers)}`);
    
    const req = https.request(url, options, (res) => {
      console.log(`[TEST] Auth response status: ${res.statusCode}`);
      console.log(`[TEST] Auth response headers: ${JSON.stringify(res.headers)}`);
      
      let data = '';
      res.on('data', chunk => {
        data += chunk;
        console.log(`[TEST] Received chunk: ${chunk.length} bytes`);
      });
      
      res.on('end', () => {
        console.log(`[TEST] Total response data length: ${data.length} bytes`);
        if (data.length > 0) {
          console.log(`[TEST] First 200 chars of response: ${data.substring(0, 200)}`);
        }
        
        try {
          // Handle HTTP errors
          if (res.statusCode >= 400) {
            reject(new Error(`Auth failed with status code ${res.statusCode}: ${data || 'No response data'}`));
            return;
          }
          
          // Trim any whitespace to avoid parsing errors
          const trimmedData = data.trim();
          if (!trimmedData) {
            reject(new Error('Empty response from Proxmox API'));
            return;
          }
          
          const parsed = JSON.parse(trimmedData);
          console.log(`[TEST] Response parsed successfully`);
          
          if (!parsed.data) {
            reject(new Error(`Proxmox API error: ${parsed.message || JSON.stringify(parsed)}`));
            return;
          }
          
          // Log success but hide sensitive data
          console.log(`[TEST] Successfully obtained auth ticket and CSRF token`);
          resolve(parsed.data);
        } catch (e) {
          console.error(`[TEST] Parse error: ${e.message}`);
          reject(new Error(`Failed to parse response: ${e.message}\nRaw response: ${data.substring(0, 100)}...`));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error(`[TEST] Auth request error: ${error.message}`);
      reject(error);
    });
    
    req.write(postData);
    req.end();
  });
}

async function proxmoxApiRequest(creds, endpoint, method = 'GET', body = null) {
  console.log(`[TEST] Starting API request to ${endpoint}`);
  
  // First get auth ticket
  console.log(`[TEST] Fetching authentication ticket...`);
  const authRes = await fetchProxmoxTicket(creds);
  const ticket = authRes.ticket;
  const csrf = authRes.CSRFPreventionToken;
  console.log(`[TEST] Auth successful, obtained ticket and CSRF token`);
  
  const baseUrl = creds.host.replace(/\/$/, '');
  const fullUrl = new URL(baseUrl + endpoint);
  
  console.log(`[TEST] Making ${method} request to ${fullUrl.origin}${fullUrl.pathname}`);
  
  return new Promise((resolve, reject) => {
    const headers = {
      'Cookie': `PVEAuthCookie=${ticket}`,
      'Accept-Encoding': 'identity',
      'Accept': 'application/json'
    };
    
    // Add CSRF token for non-GET requests
    if (method !== 'GET' && csrf) {
      headers['CSRFPreventionToken'] = csrf;
    }
    
    // Set content type and length for requests with body
    if (body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    
    const options = {
      method,
      headers,
      rejectUnauthorized: false // Allow self-signed certs
    };
    
    console.log(`[TEST] Request headers: ${JSON.stringify(headers, (key, value) => 
      key === 'Cookie' || key === 'CSRFPreventionToken' ? '[REDACTED]' : value)}`);
    
    const req = https.request(fullUrl, options, (res) => {
      console.log(`[TEST] Response status: ${res.statusCode}`);
      console.log(`[TEST] Response headers: ${JSON.stringify(res.headers)}`);
      
      let data = '';
      res.on('data', chunk => {
        data += chunk;
        console.log(`[TEST] Received chunk: ${chunk.length} bytes`);
      });
      
      res.on('end', () => {
        console.log(`[TEST] Total response data length: ${data.length} bytes`);
        if (data.length > 0) {
          console.log(`[TEST] First 200 chars of response: ${data.substring(0, 200)}`);
        }
        
        try {
          // Handle HTTP errors
          if (res.statusCode >= 400) {
            reject(new Error(`API request failed with status code ${res.statusCode}: ${data || 'No response data'}`));
            return;
          }
          
          // Check if we got any data
          if (!data || data.trim() === '') {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              // Empty response with success status code is OK for some operations
              resolve({});
              return;
            }
            reject(new Error('Empty response from Proxmox API'));
            return;
          }
          
          // Parse the response
          const trimmedData = data.trim();
          const parsed = JSON.parse(trimmedData);
          
          console.log(`[TEST] Response parsed successfully`);
          
          // Check for Proxmox error responses
          if (parsed.status && parsed.status !== 'OK') {
            reject(new Error(`Proxmox API error: ${parsed.message || JSON.stringify(parsed)}`));
            return;
          }
          
          // Make sure we have data
          if (parsed.data === undefined) {
            // Some Proxmox API endpoints return the result directly without a data wrapper
            if (Object.keys(parsed).length > 0) {
              resolve(parsed);
              return;
            }
            reject(new Error(`Proxmox API returned no data: ${JSON.stringify(parsed)}`));
            return;
          }
          
          resolve(parsed.data);
        } catch (e) {
          console.error(`[TEST] Parse error: ${e.message}`);
          reject(new Error(`Failed to parse response: ${e.message}\nRaw response: ${data.substring(0, 100)}...`));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error(`[TEST] Request error: ${error.message}`);
      reject(error);
    });
    
    if (body) {
      req.write(body);
    }
    
    req.end();
  });
}

// ==================== TEST EXECUTION ====================
async function runTest() {
  try {
    // Check if we have credentials
    const store = loadCredsStore();
    const credIds = Object.keys(store);
    
    if (credIds.length === 0) {
      console.log(`[TEST] No stored credentials found. Please add credentials first.`);
      return;
    }
    
    console.log(`[TEST] Found ${credIds.length} credentials: ${credIds.join(', ')}`);
    
    // Use the credential ID specified in command line or first available
    const credId = process.argv[2] || credIds[0];
    console.log(`[TEST] Using credential: ${credId}`);
    
    const creds = getProxmoxCredsById(credId);
    console.log(`[TEST] Retrieved credentials for ${creds.username}@${creds.realm || 'pam'} at ${creds.host}`);
    
    // Test authentication
    console.log(`\n[TEST] TESTING AUTHENTICATION`);
    const authResult = await fetchProxmoxTicket(creds);
    console.log(`[TEST] Authentication successful, received ticket and CSRF token`);
    
    // Test API request
    console.log(`\n[TEST] TESTING API REQUEST - CLUSTER RESOURCES`);
    const apiResult = await proxmoxApiRequest(creds, '/api2/json/cluster/resources');
    console.log(`[TEST] API request successful`);
    console.log(`[TEST] Found ${apiResult.length || 0} resources`);
    
    // Print first resource as sample
    if (apiResult.length > 0) {
      console.log(`[TEST] First resource sample:`, JSON.stringify(apiResult[0], null, 2));
    }
    
    console.log(`\n[TEST] ALL TESTS PASSED SUCCESSFULLY`);
  } catch (error) {
    console.error(`\n[TEST] TEST FAILED: ${error.message}`);
    process.exit(1);
  }
}

// Run the test
runTest();
