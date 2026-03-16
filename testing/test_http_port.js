// Helper to provide consistent HTTP base URLs for tests.
// Resolves port precedence: process.env.HTTP_PORT > process.env.PORT > default 6270.
// Keeps the test harness aligned with the repo's HTTP MCP port convention.

const port = process.env.HTTP_PORT || process.env.PORT || 6270;
const base = `http://localhost:${port}`;

module.exports = {
  port,
  base,
  mcpUrl: `${base}/mcp`,
  healthUrl: `${base}/health`
};
