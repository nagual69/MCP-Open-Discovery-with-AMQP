#!/usr/bin/env node
// tools/cli/remove_credential.js
// CLI script to remove credentials from the secure store

const credentialsManager = require('../credentials_manager');

function printUsage() {
  console.log(`
Usage: node remove_credential.js --id <id>

Required:
  --id        Credential ID to remove

Examples:
  node remove_credential.js --id proxmox1-creds
  node remove_credential.js --id db-admin
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
  
  if (!params.id || params.help) {
    printUsage();
    process.exit(params.help ? 0 : 1);
  }
  
  try {
    // Check if credential exists first
    try {
      credentialsManager.getCredential(params.id);
    } catch (error) {
      console.error(`❌ Credential '${params.id}' not found.`);
      process.exit(1);
    }
    
    credentialsManager.removeCredential(params.id);
    console.log(`✅ Successfully removed credential '${params.id}'`);
  } catch (error) {
    console.error(`❌ Failed to remove credential: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
