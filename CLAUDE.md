@AGENTS.md

## Notes for Claude Code
- The rules above live in `AGENTS.md` so Codex and other agents read the same ones. Edit them there, not here.
- Linear is connected through MCP: read the issue (`get_issue`) before starting, and post the verification comment there when done.
- Figma is connected through MCP: use the frame named in the issue for exact spacing, colors and copy.
- Text another person will read (PR descriptions, commit messages, Linear comments, docs): draft it, then run `/anthropic-skills:declauding` on the draft before committing, posting or opening the PR.
- Code you write or change: run `/anthropic-skills:unslop-code` on it before committing.
