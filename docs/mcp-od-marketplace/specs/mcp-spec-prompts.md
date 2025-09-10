# MCP Prompts Specification (Marketplace)

Based on MCP 2025-06-18:

- ListPromptsRequest/ListPromptsResult
- GetPromptRequest/GetPromptResult returning description?, messages: PromptMessage[], arguments?: PromptArgument[], \_meta?, and optional embedded ResourceLinks.
- PromptArgument: name, title?, description?, required?.

Marketplace model

- Mongo: name/slug/title/description/category/tags/version/author/isPublic.
- promptSpec stores argsSchema (or arguments array) and a message template (for preview) compatible with the SDK registerPrompt handler signature.

Builder UX

- Form sections: Basics, Arguments (JSON or visual editor; support completable arguments), Preview (render sample GetPrompt result), Completions (optional hints), Docs.
- Generate SDK boilerplate: server.registerPrompt(name, { title, description, argsSchema }, handler).

Publishing

- Private/public, semver, validation of argument schema and sample messages.
