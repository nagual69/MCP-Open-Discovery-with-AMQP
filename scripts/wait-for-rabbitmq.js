#!/usr/bin/env node

/**
 * Wait for RabbitMQ to be ready before starting AMQP transport
 */

const amqp = require('amqplib');

const AMQP_URL = process.env.AMQP_URL || 'amqp://mcp:discovery@rabbitmq:5672';
const MAX_ATTEMPTS = 30;
const RETRY_DELAY = 2000; // 2 seconds

async function waitForRabbitMQ() {
  console.log(`[Wait Script] Waiting for RabbitMQ at ${AMQP_URL}...`);
  
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`[Wait Script] Attempt ${attempt}/${MAX_ATTEMPTS} - Testing connection...`);
      
      const connection = await amqp.connect(AMQP_URL);
      await connection.close();
      
      console.log(`[Wait Script] ✅ RabbitMQ is ready! (took ${attempt} attempts)`);
      return true;
      
    } catch (error) {
      console.log(`[Wait Script] ❌ Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt === MAX_ATTEMPTS) {
        console.error(`[Wait Script] 🔥 RabbitMQ failed to become ready after ${MAX_ATTEMPTS} attempts`);
        return false;
      }
      
      console.log(`[Wait Script] ⏱️  Waiting ${RETRY_DELAY/1000}s before retry...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }
  
  return false;
}

// Run if called directly
if (require.main === module) {
  waitForRabbitMQ().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error(`[Wait Script] 💥 Unexpected error:`, error);
    process.exit(1);
  });
}

module.exports = { waitForRabbitMQ };
