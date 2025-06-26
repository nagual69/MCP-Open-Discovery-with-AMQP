#!/usr/bin/env node
// tools/cli/list_credentials.js
// CLI script to list stored credentials

const credentialsManager = require('../credentials_manager');

function printUsage() {
  console.log(`
Usage: node list_credentials.js [--type <type>]

Options:
  --type      Filter by credential type: password, apiKey, sshKey, oauthToken, certificate, custom

Examples:
  node list_credentials.js
  node list_credentials.js --type nagios
  node list_credentials.js --type password
`);
}

function main() {
  const args = process.argv.slice(2);
  const params = {};
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace('--', '');
    const value = args[i + 1];
    if (key && value) {
      params[key] = value;
    }
  }
  
  if (params.help) {
    printUsage();
    process.exit(0);
  }
  
  try {
    const credentials = credentialsManager.listCredentials(params.type);
    
    if (credentials.length === 0) {
      console.log(`No credentials found${params.type ? ` of type '${params.type}'` : ''}.`);
      return;
    }
    
    console.log(`\n📋 Stored Credentials${params.type ? ` (type: ${params.type})` : ''}:\n`);
    console.log('ID'.padEnd(20) + 'Type'.padEnd(15) + 'Username'.padEnd(15) + 'URL');
    console.log('-'.repeat(70));
    
    for (const cred of credentials) {
      console.log(
        (cred.id || '').padEnd(20) +
        (cred.type || '').padEnd(15) +
        (cred.username || '').padEnd(15) +
        (cred.url || '')
      );
    }
    console.log('');
  } catch (error) {
    console.error(`❌ Failed to list credentials: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
