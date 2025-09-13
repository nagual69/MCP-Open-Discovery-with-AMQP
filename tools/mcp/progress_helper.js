/**
 * Progress Helper - Emit notifications/progress and support cancellations
 */

const { broadcast, buildNotification } = require('./notification_hub');

// In-memory cancellation registry: token -> boolean
const cancellations = new Map();

function requestCancellation(progressToken) {
  if (progressToken === undefined || progressToken === null) return;
  cancellations.set(String(progressToken), true);
}

function isCancelled(progressToken) {
  if (progressToken === undefined || progressToken === null) return false;
  return !!cancellations.get(String(progressToken));
}

async function emitProgress(progressToken, progress) {
  if (progressToken === undefined || progressToken === null) return false;
  const notification = buildNotification('notifications/progress', {
    progressToken,
    progress
  });
  return await broadcast(notification);
}

// Emit a notifications/cancelled event for a given token
async function emitCancelled(progressToken, reason = 'cancelled') {
  if (progressToken === undefined || progressToken === null) return false;
  const notification = buildNotification('notifications/cancelled', {
    progressToken,
    reason
  });
  return await broadcast(notification);
}

// Helper to wrap long-running steps respecting cancellation
async function runWithProgress({ progressToken, steps = [], onCancel }) {
  for (let i = 0; i < steps.length; i++) {
    if (isCancelled(progressToken)) {
      if (typeof onCancel === 'function') await onCancel();
      await emitCancelled(progressToken, 'runWithProgress cancelled');
      return { cancelled: true };
    }
    const step = steps[i];
    if (typeof step === 'function') {
      await step(i, steps.length);
    }
    await emitProgress(progressToken, {
      kind: 'fraction',
      value: (i + 1) / steps.length
    });
  }
  return { cancelled: false };
}

module.exports = {
  requestCancellation,
  isCancelled,
  emitProgress,
  emitCancelled,
  runWithProgress
};
