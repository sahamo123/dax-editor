# Specifications

## Documents

* [Spec template](_template.md) - Copy this to start a feature spec: problem, user stories, acceptance criteria, design, risks and how it will be verified.
* [Browser imports and responsive offline chat](browser-import-and-responsive-chat.md) - Select local video files in the browser preview and receive bounded, streamed offline assistant replies.
* [Chat tasks, steering and planning mode](chat-task-queue.md) - Persistent local task metadata, serial chat requests, steering, video attachments and enforced read-only planning.
* [Effects layers (zoom, music with ducking, image overlays)](effects-layers.md) - How the engine zooms the picture, mixes music and sound effects under speech with automatic ducking, and draws logos and stickers, and how templates use them.
* [Functional desktop release](functional-desktop-release.md) - Delivery contract and acceptance gates for manual editing, optional AI providers, speech, live MCP and Blender templates.
* [Lightweight local AI and API provider setup](lightweight-ai-providers.md) - Measure a smaller local model and provide explicit OpenRouter and direct API configuration without making hosted services mandatory.
* [Manual effects controls](manual-effects.md) - Manual zoom, music, sound effect and image controls over the existing validated editing registry.
* [Named API connections](named-connections.md) - Explicit immutable snapshots of provider configuration and isolated private credentials.
* [Product v1 specification](product-v1.md) - How the desktop editor fits together and what each package must deliver: agent, local model runtime, server, desktop UI and Tauri shell.
* [Rendered effects preview](rendered-effects-preview.md) - Review the complete edit through the existing renderer without exporting a user-managed file or changing the project.
