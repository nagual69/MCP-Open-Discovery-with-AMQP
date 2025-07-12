#!/usr/bin/env node

/**
 * Migration Utility: Proxmox Credentials to General Credential Store
 * 
 * This script migrates existing Proxmox-specific credentials to the new 
 * general credential storage system with enhanced security and compliance features.
 */

const fs = require('fs');
const path = require('path');
const credentialsManager = require('./credentials_manager');

// Paths for old Proxmox credential storage
const PROXMOX_CREDS_STORE_PATH = path.join('/tmp', 'proxmox_creds_store.json');
const PROXMOX_CREDS_KEY_PATH = path.join('/tmp', 'proxmox_creds_key');

// Decrypt function for old Proxmox credentials (copied from proxmox_tools_sdk.js)
function decryptProxmoxPassword(data) {
  const crypto = require('crypto');
  
  if (!fs.existsSync(PROXMOX_CREDS_KEY_PATH)) {
    throw new Error('Proxmox credential key file not found');
  }
  
  const key = fs.readFileSync(PROXMOX_CREDS_KEY_PATH);
  const [ivB64, encrypted] = data.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Load existing Proxmox credentials
 */
function loadProxmoxCredentials() {
  if (!fs.existsSync(PROXMOX_CREDS_STORE_PATH)) {
    console.log('No existing Proxmox credentials found to migrate.');
    return {};
  }
  
  try {
    const data = fs.readFileSync(PROXMOX_CREDS_STORE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading Proxmox credentials:', error.message);
    return {};
  }
}

/**
 * Convert Proxmox credential to new format
 */
function convertProxmoxCredential(id, proxmoxCred) {
  // Decrypt the password
  const decryptedPassword = decryptProxmoxPassword(proxmoxCred.password);
  
  // Create URL from hostname and port
  const url = `https://${proxmoxCred.hostname || proxmoxCred.host}:${proxmoxCred.port || 8006}`;
  
  // Map to new credential structure
  const newCredential = {
    type: 'password',
    username: proxmoxCred.username,
    password: decryptedPassword, // Will be re-encrypted by new system
    url: url,
    realm: proxmoxCred.realm || 'pam',
    port: proxmoxCred.port || 8006,
    verify_ssl: proxmoxCred.verify_ssl !== false,
    hostname: proxmoxCred.hostname || proxmoxCred.host,
    created: proxmoxCred.created || new Date().toISOString(),
    migrated_from: 'proxmox_legacy',
    notes: `Migrated Proxmox credential for ${proxmoxCred.hostname || proxmoxCred.host}`
  };
  
  return newCredential;
}

/**
 * Perform the migration
 */
function migrateCredentials(dryRun = false) {
  console.log('Starting Proxmox credential migration...');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE MIGRATION'}`);
  
  // Load existing Proxmox credentials
  const proxmoxStore = loadProxmoxCredentials();
  const credentialIds = Object.keys(proxmoxStore);
  
  if (credentialIds.length === 0) {
    console.log('No Proxmox credentials found to migrate.');
    return { migrated: 0, errors: 0 };
  }
  
  console.log(`Found ${credentialIds.length} Proxmox credentials to migrate:`);
  credentialIds.forEach(id => {
    const cred = proxmoxStore[id];
    console.log(`  - ${id}: ${cred.username}@${cred.hostname || cred.host}:${cred.port || 8006}`);
  });
  
  let migrated = 0;
  let errors = 0;
  const results = [];
  
  // Process each credential
  for (const id of credentialIds) {
    try {
      const proxmoxCred = proxmoxStore[id];
      const newCred = convertProxmoxCredential(id, proxmoxCred);
      
      if (!dryRun) {
        // Add to new credential store
        credentialsManager.addCredential(id, newCred.type, newCred);
        console.log(`✅ Migrated credential: ${id}`);
      } else {
        console.log(`✅ Would migrate credential: ${id}`);
        console.log(`   New format:`, JSON.stringify({
          id,
          type: newCred.type,
          username: newCred.username,
          url: newCred.url,
          realm: newCred.realm,
          port: newCred.port,
          verify_ssl: newCred.verify_ssl
        }, null, 2));
      }
      
      migrated++;
      results.push({ id, status: 'success', credential: newCred });
    } catch (error) {
      console.error(`❌ Failed to migrate credential ${id}:`, error.message);
      errors++;
      results.push({ id, status: 'error', error: error.message });
    }
  }
  
  // Summary
  console.log('\nMigration Summary:');
  console.log(`  Successfully migrated: ${migrated}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total processed: ${credentialIds.length}`);
  
  return { migrated, errors, results };
}

/**
 * Backup existing Proxmox credentials
 */
function backupProxmoxCredentials() {
  if (!fs.existsSync(PROXMOX_CREDS_STORE_PATH)) {
    console.log('No Proxmox credentials to backup.');
    return null;
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join('/tmp', `proxmox_creds_backup_${timestamp}.json`);
  
  try {
    fs.copyFileSync(PROXMOX_CREDS_STORE_PATH, backupPath);
    console.log(`✅ Backup created: ${backupPath}`);
    return backupPath;
  } catch (error) {
    console.error('❌ Failed to create backup:', error.message);
    return null;
  }
}

/**
 * Main migration function
 */
function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const backup = args.includes('--backup');
  const help = args.includes('--help') || args.includes('-h');
  
  if (help) {
    console.log(`
Proxmox Credential Migration Utility

Usage: node migrate_proxmox_credentials.js [options]

Options:
  --dry-run     Perform a dry run without making changes
  --backup      Create a backup of existing credentials before migration
  --help, -h    Show this help message

Examples:
  node migrate_proxmox_credentials.js --dry-run     # Test migration
  node migrate_proxmox_credentials.js --backup      # Migrate with backup
  node migrate_proxmox_credentials.js               # Direct migration
`);
    return;
  }
  
  console.log('='.repeat(60));
  console.log('  PROXMOX CREDENTIAL MIGRATION UTILITY');
  console.log('='.repeat(60));
  
  // Create backup if requested
  if (backup && !dryRun) {
    console.log('\n📦 Creating backup...');
    backupProxmoxCredentials();
  }
  
  // Perform migration
  console.log('\n🔄 Starting migration...');
  const result = migrateCredentials(dryRun);
  
  if (!dryRun && result.migrated > 0) {
    console.log('\n📋 Verifying migrated credentials...');
    try {
      const newCredentials = credentialsManager.listCredentials();
      const migratedCreds = newCredentials.filter(c => c.type === 'password' || c.migrated_from === 'proxmox_legacy');
      console.log(`✅ Found ${migratedCreds.length} credentials in new store`);
    } catch (error) {
      console.error('❌ Error verifying new credentials:', error.message);
    }
  }
  
  console.log('\n🎉 Migration completed!');
  
  if (dryRun) {
    console.log('\nTo perform the actual migration, run without --dry-run flag.');
  } else if (result.migrated > 0) {
    console.log('\nNext steps:');
    console.log('1. Test Proxmox tools with new credential system');
    console.log('2. Remove old Proxmox credential files if everything works');
    console.log('3. Update any documentation references');
  }
}

// Export functions for testing
module.exports = {
  migrateCredentials,
  convertProxmoxCredential,
  loadProxmoxCredentials,
  backupProxmoxCredentials
};

// Run if called directly
if (require.main === module) {
  main();
}