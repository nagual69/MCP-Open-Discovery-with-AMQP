# MCP Tools Specification (Marketplace)

This document summarizes the MCP 2025-06-18 spec for Tools and how the Marketplace models them.

Key MCP definitions

- ListToolsRequest/ListToolsResult
- CallToolRequest/CallToolResult with content (Text/Image/Audio/ResourceLink/EmbeddedResource), optional structuredContent, isError flag.
- Tool object fields: name, description, inputSchema (JSON Schema object), optional outputSchema, annotations (title, readOnlyHint, destructiveHint, idempotentHint, openWorldHint), optional title and \_meta.

Marketplace model

- Mongo model captures name/slug/title/description/category/tags/version/author/isPublic/isFeatured.
- Stores tool package bundle (packageJson, serverCode, additional files) for Node SDK usage.
- Validation ensures inputSchema/outputSchema are valid JSON Schemas; annotations treated as hints.

Builder UX

- Form sections: Basics (name/title/description), Parameters (inputSchema JSON editor with live validation), Output schema (optional), Safety hints (annotations), Preview (auto-generated README and display name precedence: title → annotations.title → name).
- Wizard templates for common tools (HTTP fetcher, file lister, SQL query, ping) using @modelcontextprotocol/sdk registerTool.

Publishing

- Private/public toggle, semantic versioning, changelog. Server-side validation runs JSON schema checks and minimal linting.
