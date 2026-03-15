// tools/secrets_provider.js
// Unified secrets provider for MCP Open Discovery
// Supports AWS Secrets Manager, Azure Key Vault, and local encrypted fallback

// Load the credentials manager lazily — supports both active and .deprecated filenames
let _credentialsManager = null;
function getCredentialsManager() {
  if (_credentialsManager) return _credentialsManager;
  const path = require('path');
  const root = path.resolve(__dirname);
  for (const name of ['credentials_manager', 'credentials_manager.js.deprecated']) {
    try {
      _credentialsManager = require(path.join(root, name));
      return _credentialsManager;
    } catch {}
  }
  throw new Error('No credentials manager found');
}

// AWS SDK v3
let AWS;
try { AWS = require('@aws-sdk/client-secrets-manager'); } catch {}
// Azure SDK
let { DefaultAzureCredential } = {};
let { SecretClient } = {};
try {
  ({ DefaultAzureCredential } = require('@azure/identity'));
  ({ SecretClient } = require('@azure/keyvault-secrets'));
} catch {}

async function getSecret({ id, type }) {
  // 1. Try AWS Secrets Manager
  if (process.env.AWS_SECRETS_MANAGER_ARN && AWS) {
    const client = new AWS.SecretsManager({ region: process.env.AWS_REGION });
    try {
      const data = await client.getSecretValue({ SecretId: id });
      return JSON.parse(data.SecretString);
    } catch (e) { /* fallback */ }
  }
  // 2. Try Azure Key Vault
  if (process.env.AZURE_KEY_VAULT_URL && DefaultAzureCredential && SecretClient) {
    const credential = new DefaultAzureCredential();
    const client = new SecretClient(process.env.AZURE_KEY_VAULT_URL, credential);
    try {
      const secret = await client.getSecret(id);
      return JSON.parse(secret.value);
    } catch (e) { /* fallback */ }
  }
  // 3. Fallback to local encrypted store
  try {
    return getCredentialsManager().getCredential(id);
  } catch (e) {
    throw new Error('Secret not found in any provider');
  }
}

async function setSecret({ id, type, data }) {
  // 1. Try AWS Secrets Manager
  if (process.env.AWS_SECRETS_MANAGER_ARN && AWS) {
    const client = new AWS.SecretsManager({ region: process.env.AWS_REGION });
    try {
      await client.createSecret({
        Name: id,
        SecretString: JSON.stringify(data),
      });
      return;
    } catch (e) { /* fallback */ }
  }
  // 2. Try Azure Key Vault
  if (process.env.AZURE_KEY_VAULT_URL && DefaultAzureCredential && SecretClient) {
    const credential = new DefaultAzureCredential();
    const client = new SecretClient(process.env.AZURE_KEY_VAULT_URL, credential);
    try {
      await client.setSecret(id, JSON.stringify(data));
      return;
    } catch (e) { /* fallback */ }
  }
  // 3. Fallback to local encrypted store
  getCredentialsManager().addCredential(id, type, data);
}

module.exports = {
  getSecret,
  setSecret,
};
