// Helper to provide consistent HTTP base URLs for tests.
// Resolves port precedence: process.env.HTTP_PORT > process.env.PORT > default 3000.
// Allows convention override (example.env now recommends 6270) without touching test code.

const port = process.env.HTTP_PORT || process.env.PORT || 3000;
const base = `http://localhost:${port}`;

module.exports = {
  port,
  base,
  mcpUrl: `${base}/mcp`,
  healthUrl: `${base}/health`
};
