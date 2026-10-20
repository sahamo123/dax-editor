# Security policy

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's private reporting instead:

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Describe the problem, how to reproduce it, and what you think the impact is.

We aim to acknowledge reports within a few days. This is a volunteer-run project, so please be patient, and we will credit you in the fix unless you prefer otherwise.

## Supported versions

The project is pre-release. Only the latest `main` is supported until the first tagged release.

## What is in scope

dax-editor runs local tools (FFmpeg, speech models, optionally Blender) on files you give it, and exposes editing actions to AI agents. Reports we especially want:

- Any way for an agent, a malicious media file, a transcript, a file name or cloud-file content to make the app run commands, read or write files outside the allowed folders, or leak credentials (prompt injection, path traversal, argument injection into FFmpeg).
- Unsafe handling of API keys or OAuth tokens.
- Vulnerabilities in the update or download mechanisms once they exist.

## Design rules that support this

- Agent-facing tools take typed, validated parameters. They never accept arbitrary shell commands or FFmpeg arguments.
- Credentials are never written into project files.
- Local file access can be restricted to allowed folders (see `LocalConnector`).
- Destructive or irreversible actions (export, delete, publish) require explicit approval when requested by an external agent.
