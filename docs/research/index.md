# Research

## Documents

* [Creator editing styles as engine templates](creator-editing-styles.md) - Sixteen creator and format editing styles reduced to measurable parameters, mapped onto the engine's presets, with the engine gaps ranked by how many styles need them.
* [Cut intelligence](cut-intelligence.md) - Open-source state of the art for making good automatic cuts, with a recommended cut-engine design, default parameters, cut-quality metrics and the pitfalls behind each rule.
* [Industry video templates](industry-video-templates.md) - Per-industry recipes for what a good video looks like, a template schema that expresses them, and three worked examples for applying them to uploaded footage.
* [Landscape, risks and gaps](landscape.md) - Survey of existing open-source video editors, MCP servers and renderers, with the licensing and technical risks that shaped the plan.
* [Open-source radar and intake policy](open-source-radar.md) - Twenty open-source projects for AI video editing, creator tools and generators, checked against their LICENSE files and commit dates, plus the autonomous intake policy a scout agent must follow before adopting a tool.
* [OpenChatCut learnings](openchatcut-learnings.md) - Ideas we take from OpenChatCut, a conversational AI video editor under AGPL-3.0, plus where dax-editor will adopt them or differ.
* [Open-source effects and transitions](oss-effects-and-transitions.md) - Which Premiere, After Effects and CapCut style effects can run as pure FFmpeg filters, which need a separate plugin process, and which open-source licences rule options out.
* [Open-source voice and audio for video](oss-voice-and-audio.md) - Free, offline text-to-speech, voice cloning, speech enhancement, source separation and CC0-safe sound sources for dax-editor, with licence verdicts checked against the intake rules.
* [Plugin architecture for dax-editor](plugin-architecture.md) - Recommends separate-process plugins that speak JSON-RPC over stdio, described by a plugin.json manifest with declared permissions, hashed downloads and data-only template packs, based on how other extensible tools handle trust.
