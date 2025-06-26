#!/usr/bin/env node
// tools/cli/add_credential.js
// CLI script to add credentials to the secure store

const credentialsManager = require('../credentials_manager');

function printUsage() {
  console.log(`
Usage: node add_credential.js --type <type> --id <id> [options]

Required:
  --type      Credential type: password, apiKey, sshKey, oauthToken, certificate, custom
  --id        Unique credential ID

Common Options:
  --username  Username (if applicable)
  --url       URL/endpoint (if applicable)
  --notes     Notes about this credential

Type-specific Options:
  --password    Password to encrypt (for password type)
  --apiKey      API key to encrypt (for apiKey type)
  --sshKey      SSH private key to encrypt (for sshKey type)
  --oauthToken  OAuth token to encrypt (for oauthToken type)
  --certificate Certificate data to encrypt (for certificate type)
  --custom1     Custom field 1 (for custom type)
  --custom2     Custom field 2 (for custom type)

Examples:
  node add_credential.js --type nagios --id nagios1-creds --apiKey YOUR_API_KEY --url http://nagios-xi
  node add_credential.js --type password --id db-admin --username admin --password secret123 --url db.example.com
  node add_credential.js --type sshKey --id server1-ssh --username root --sshKey "$(cat ~/.ssh/id_rsa)"
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
  
  if (!params.type || !params.id || params.help) {
    printUsage();
    process.exit(params.help ? 0 : 1);
  }
  
  try {
    const { type, id, ...data } = params;
    credentialsManager.addCredential(id, type, data);
    console.log(`✅ Successfully added credential '${id}' of type '${type}'`);
  } catch (error) {
    console.error(`❌ Failed to add credential: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
