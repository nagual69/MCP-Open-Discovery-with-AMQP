#!/usr/bin/env node
// tools/cli/rotate_key.js
// CLI script to rotate the encryption key

const crypto = require('crypto');
const credentialsManager = require('../credentials_manager');

function printUsage() {
  console.log(`
Usage: node rotate_key.js [--key <base64-key>]

Options:
  --key       New 32-byte encryption key (base64 encoded). If not provided, generates a new random key.

Examples:
  node rotate_key.js                          # Generate new random key
  node rotate_key.js --key $(openssl rand -base64 32)  # Use specific key

⚠️  WARNING: This will re-encrypt ALL stored credentials with the new key.
   Make sure to backup your credential store before running this command.
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
    const newKey = params.key ? Buffer.from(params.key, 'base64') : crypto.randomBytes(32);
    
    if (params.key && newKey.length !== 32) {
      console.error('❌ Key must be exactly 32 bytes when base64 decoded.');
      process.exit(1);
    }
    
    console.log('🔄 Rotating encryption key and re-encrypting all credentials...');
    credentialsManager.rotateKey(newKey);
    console.log('✅ Successfully rotated encryption key and re-encrypted all credentials.');
    
    if (!params.key) {
      console.log(`🔑 New key (base64): ${newKey.toString('base64')}`);
      console.log('💡 Store this key securely if you need to use it elsewhere.');
    }
  } catch (error) {
    console.error(`❌ Failed to rotate key: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
