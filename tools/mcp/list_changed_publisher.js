const { broadcast, buildNotification } = require('./notification_hub');

async function publishToolsListChanged() {
  const n = buildNotification('notifications/tools/list_changed', {});
  return broadcast(n);
}

async function publishResourcesListChanged() {
  const n = buildNotification('notifications/resources/list_changed', {});
  return broadcast(n);
}

async function publishPromptsListChanged() {
  const n = buildNotification('notifications/prompts/list_changed', {});
  return broadcast(n);
}

module.exports = {
  publishToolsListChanged,
  publishResourcesListChanged,
  publishPromptsListChanged
};
