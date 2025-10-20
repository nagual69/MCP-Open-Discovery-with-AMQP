# MCP Resources Specification (Marketplace)

From MCP 2025-06-18:

- resources/list → Resource[]
- resources/templates/list → ResourceTemplate[]
- resources/read(uri) → ReadResourceResult with contents: TextResourceContents | BlobResourceContents.
- subscribe/unsubscribe → notifications/resources/updated.

Resource object

- name, title?, uri, description?, mimeType?, annotations?, size?, \_meta?.
  ResourceTemplate
- name, title?, uriTemplate (RFC 6570), description?, mimeType?, annotations?, \_meta?.

Marketplace model

- Mongo stores resourceSpec with either concrete uri or uriTemplate and hints (mimeType, description).

Builder UX

- Choose Static Resource or Template.
- For Template: define uriTemplate and optional completion providers; preview example URIs and read handler shape for SDK.
- Generate code using SDK registerResource(name, template, annotations, handler).

Storage and validation

- Validate that uri or uriTemplate is present and RFC6570 format for templates.
- Optional mimeType.

Note: If a plugin manifest declares `capabilities.resources` (string array), entries must match the resource names registered via the SDK. Hosts may enforce STRICT_CAPABILITIES to fail load on mismatches.
