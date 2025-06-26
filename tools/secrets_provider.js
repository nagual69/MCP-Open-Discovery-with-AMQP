// tools/secrets_provider.js
// Unified secrets provider for MCP Open Discovery
// Supports AWS Secrets Manager, Azure Key Vault, and local encrypted fallback

const credentialsManager = require('./credentials_manager');

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
    return credentialsManager.getCredential(id);
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
  credentialsManager.addCredential(id, type, data);
}

module.exports = {
  getSecret,
  setSecret,
};
