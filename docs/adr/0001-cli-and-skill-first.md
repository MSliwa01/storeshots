# ADR 0001: a CLI plus an Agent Skill first, MCP later and thin

Date: 2026-10-05. Status: accepted.

## Context
storeshots is used mostly by coding agents (Claude Code, Codex, Gemini CLI, Cursor) on behalf of an app developer. The pipeline stages are batch jobs that take files and produce files: capture, render, check, upload. Options for exposing it: an MCP server, an Agent Skill driving a CLI, editor plugins, or a standalone agent (research: docs/research/interfaces.md).

## Decision
1. The product is the `storeshots` CLI. Every command prints one JSON document on stdout (logs on stderr), returns contractual exit codes (1 usage, 2 capture/render, 3 check, 4 upload, 5 environment) and errors with `{error, fix, next}`.
2. Agents learn it from one short Agent Skill (`skills/store-screenshots`): a workflow router, a "request → file to edit → cheapest stage to rerun" table, and references loaded on demand.
3. An MCP server, if added, is a thin adapter over the same functions with a handful of coarse tools that return file paths, not images.
4. No bundled agent loop; the user's own agent (on their subscription) is the agent.

## Why
- Token cost: CLI + skill costs a fraction of an MCP tool catalogue in context (published measurements: ~1.2k vs ~52k tokens; Arize 2026 eval: same accuracy, ~6× cheaper). The closest comparable projects (asc, goldie, hypershots) ship CLI + skills; the one with a 51-tool MCP is the most expensive to drive.
- MCP sampling is deprecated in the 2026-07-28 spec, so a server could not borrow the host's model for the visual critique anyway; the agent must look at the renders itself.
- Third-party apps cannot use Claude subscription OAuth (2026-02), so a bundled agent would force users onto API keys.
- Batch stages with files in and out are what shells and agents already do well; a JSON contract makes them scriptable for CI too.

## Consequences
- The skill must stay in sync with the CLI (a test should check that every command the skill names exists).
- Hosts without a shell (Claude Desktop, ChatGPT) need the MCP adapter; it is planned, not built.
- Visual quality is checked twice: deterministic rules in `storeshots check`, taste by the agent reading `output/review/*`.
