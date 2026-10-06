# How to expose the tool to agents: MCP and its alternatives (research 2026-10-05)

Two parts: a landscape of mechanisms (with 2026 sources) and reverse engineering of comparable projects (source read, not READMEs).

## 1. Mechanisms
| Mechanism | What it is | Fit for storeshots |
|---|---|---|
| **CLI + Agent Skill** (SKILL.md open standard, 40+ clients incl. Claude Code, Codex, Gemini CLI, Cursor, Copilot, OpenCode, Goose, Amp; `npx skills add`) | Agent reads a short skill, then shells out to the CLI. Progressive disclosure: only name/description load until used. | **Primary.** Cheapest on tokens (Zechner: ~1.2k vs ~52k for MCP schemas; Anthropic "code execution with MCP": −98.7 %; Arize May 2026: equal accuracy, MCP ~6× more expensive on complex tasks). Works on the user's subscription. |
| **Plugins** (Claude Code `.claude-plugin` + marketplace, Codex plugins since 03/2026, Gemini CLI extensions, Cursor / vendor-neutral Agent Plugins spec) | Packaging of skills + MCP config + commands + hooks | **Distribution layer**, mostly manifests. |
| **MCP** (spec 2026-07-28: stateless core, `input_required` multi-round-trip, Tasks and MCP Apps extensions, JSON Schema 2020-12; **sampling, roots, logging deprecated**) | Typed tools over stdio/HTTP | **Secondary**: hosts without a shell (Claude Desktop, ChatGPT) and a registry listing. Keep it thin (~5 coarse tools). Can't rely on sampling for the critic. |
| **MCP Apps / OpenAI Apps SDK** | Interactive HTML UI inside the chat | **Showcase**: a gallery to review renders, check results, approve upload. |
| **Own agent loop** (Claude Agent SDK, OpenAI Agents SDK, Vercel AI SDK, LangGraph, Mastra, PydanticAI) | Headless agent you ship | **Optional CI mode** with the user's API key. Third-party apps can't use Claude subscription OAuth (02/2026), so it can't be the main path. |
| A2A, Agent Client Protocol (Zed), AG-UI, UTCP, WebMCP, llms.txt | Agent↔agent, editor↔agent, agent↔frontend, alt tool manifests, browser tools, docs | Wrong layer; skip. |

Sources: blog.modelcontextprotocol.io (2026-07-28 spec, MCP Apps 2026-01-26), agentskills.io, vercel.com skills.sh changelog, mariozechner.at (2025-08-15, 2025-11-02), lucumr.pocoo.org (2025-08-18, 2025-12-13), anthropic.com/engineering/code-execution-with-mcp, blog.cloudflare.com/code-mode-mcp, arize.com MCP vs CLI eval (May 2026), cursor.com/docs/plugins, agent-plugins.org, geminicli.com/extensions, code.claude.com agent-sdk docs.

## 2. How comparable projects do it
| Project | Agent surface | Notable |
|---|---|---|
| **asc** (rorkai, Go, 7.6k★) | CLI only, 84 commands + 25 skills; **no MCP** | JSON by default when not a TTY; typed exit codes (2 usage, 3 auth, 4 not found, 6 read-only…); `--confirm` instead of prompts, `--dry-run`, plan/apply; checksum-idempotent upload with `--resume`; `asc schema` / `asc search` / `asc capabilities` so agents self-serve instead of reading docs; skills pinned to a reviewed commit; drift-check skill. Weak: plain-text errors, long skills. |
| **ParthJadhav** (7.1k★) | One skill (7.7k words + 18 style files); copies a Next.js editor into the app repo | Git-tracked JSON project file shared by agent and GUI, atomic writes + ETag. Weak: token-heavy, agent can't export or see renders, no upload. |
| **open-screenshot-generator** | MCP with **51 tools** + CLI (21 commands) + 5 skills | One renderer for UI/MCP/CLI; `--json` on stdout, human text on stderr; contractual exit codes with a one-line `fix`; manifest file the agent reads instead of walking the tree; save-to-path instead of base64; lazy browser boot (tools/list from a prebuilt json). Weak: 51 tools cost lots of schema tokens; docs say 49 (drift). |
| **hypershots** | Skill (83 lines, router to 12 references) + 10 scripts; no MCP | Agent writes panel HTML against a frame kit; `fit.js` measures overflow; render exit codes (2 fit failure, 3 wrong size); warnings for copy < 15 CSS px and mock UI (2.3.3); failed render deletes its PNG; "read every PNG yourself" loop. |
| **shots** (hypersocial) | Skill + scripts calling gpt-image-2 | Strong strategy docs; no QA in code; cover-crop cuts content. |
| **Argent** (Software Mansion 0.21.0, installed locally) | Long-lived HTTP tool-server (bearer token) + thin MCP stdio adapter + CLI on the same server; 74 tools (~37k tokens of definitions), 14 marked `_meta["anthropic/alwaysLoad"]`, the rest with `searchHint` for deferred tool search; `argent init` merges config into 10 agents, adds itself to Claude's `permissions.allow`, injects a 2.1k-word always-on rule and 16 skills (~25k words); PostHog telemetry on by default | `argent link argent://token@host:port` routes the CLI/MCP to a **remote tool-server** — the case of a Linux or Windows machine driving a remote Mac. Recorded flows (`.argent/flows/*.yaml`). |
| **Goldie** (Software Mansion, v0.4.0, read from source) | 9 CLI commands + 1 skill; **no own MCP** (its `.mcp.json` only registers Argent); Claude plugin, no Codex manifest | Agent explores with Argent once and writes flow YAML; replay is deterministic, no LLM. Renders with @napi-rs/canvas (11 layouts, 6 templates). Exit code 2 = flow failure + a "repair brief" (failed step, reason, next command). Skill has a table "follow-up request → field to edit → cheapest stage to rerun". Studio shares the CLI's `compose()`. Weak: no `--json`, can't redo one scene, no upload, no copy lint. |

## 3. Decision for this project
1. **Core = `shots` CLI** with `--json` (stdout) / human text (stderr), contractual exit codes with a `fix` hint, `--dry-run` default for anything that writes outside the repo, `--confirm` for upload, a run manifest the agent reads.
2. **Agent Skill** short (router + references), progressive disclosure; pinned to the CLI version; a drift check in CI.
3. **Thin MCP server** over the same functions (≈5–7 coarse tools: `plan`, `capture`, `render`, `check`, `critique_inputs`, `upload`, `assets_search`), returning file paths + structured results, never inline base64 by default.
4. **Plugins**: Claude Code marketplace + Codex plugin + Agent Plugins manifest; `npx skills add`.
5. **Remote device**: adopt Argent's pattern (a tool-server on the Mac + `link` from the PC) instead of a machine-specific SSH wrapper.
6. **Showcase**: MCP Apps review gallery; eval harness comparing skill vs MCP vs baseline across Claude Code / Codex / Gemini CLI (success, tokens, tool calls, time); ADR explaining CLI-first.

## 4. Extra lessons from the full reverse-engineering pass
- Commands coarse (10–14 verbs, one per stage) with `--scene` / `--locale` on every stage so one slide can be redone.
- One JSON document on stdout, logs on stderr; JSON by default off-TTY; typed exit codes; every failure carries a `fix` and the next command (goldie's repair brief).
- Rule violations found deterministically (DOM probe sidecar `<slide>.check.json`), vision only for taste; critique emits a ~0.3-scale contact sheet + findings, agent opens PNGs only when needed.
- State: one committed config with a schema; `out/manifest.json`; `approved.json` from review; upload as plan (diff vs ASC) → apply `--confirm`.
- Capture as replayable flows without device ids; the agent explores only to author or repair a flow.
- Skill 1–2k words: intent router + "follow-up → field → cheapest rerun" table; depth in references; CLI self-documents (`--help`, `docs`, `schema`).
- Packaging: npm bin run as `npx -y tool@0`; `skills/` for `npx skills add`; `.claude-plugin/{plugin,marketplace}.json`, `.codex-plugin/plugin.json`, `agents/openai.yaml`. When writing agent configs: merge one key, preserve comments, refuse on parse errors. Avoid Argent-style heavy always-on context.
- If MCP: thin adapter, ≤ 8–10 coarse tools, `tools/list` from a static manifest, `alwaysLoad` on 2–3 tools, plus `tool call <name> '<json>'` for Bash-only agents.
- Secrets never in agent context; telemetry opt-out with `DO_NOT_TRACK`.
