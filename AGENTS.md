# AGENTS.md

Guidance for AI coding agents (opencode, Claude Code, Cursor, etc.) working on this repository.

## What this project is

A Model Context Protocol (MCP) server exposing a Magento 2 REST API to AI assistants. TypeScript, stdio transport, built on the official MCP SDK. See [README.md](README.md) for full user documentation.

## Tech stack

- Node.js 18+, TypeScript 5
- `@modelcontextprotocol/sdk`, `undici` (HTTP client), `dotenv`, `jsonpath-plus`
- Jest + ts-jest for tests

## Commands

```bash
npm install        # install dependencies
npm run dev        # dev server with ts-node-dev (respawn)
npm run build      # tsc -p tsconfig.build.json -> build/ + chmod
npm test           # jest (coverage enabled)
npm run lint       # eslint
npm run format     # prettier over src/**/*.ts
```

## Project layout

```
src/
  index.ts                  # entrypoint: token fetch/refresh, MCP server wiring
  handlers/tool.handlers.ts     # magento_rest_api tool handler
  handlers/resource.handlers.ts # magento://rest/schema resource + search filtering
  lib/
    env-bootstrap.ts        # dotenv bootstrap (import first)
    env-loader.ts           # .env / .env.<profile> loading
    env.ts                  # {env:VAR} resolver with loop detection
    api-error.ts            # classified API errors (kind/message/hint)
    bool-coerce.ts          # boolean->1/0 coercion for Magento int flags
    logger.ts               # leveled file logger with secret redaction
```

Tests are colocated next to sources as `*.test.ts`.

## Conventions and rules

### Before writing code
- Read the related source files first; never assume method names, field names, or payload shapes.
- Match existing code style. Do not add comments unless necessary.
- Never commit secrets: no `.env*` (except `.env.example`), no hardcoded credentials or tokens.

### Testing
- Add or update `*.test.ts` unit tests for changes in `src/lib/`.
- Run `npm run lint && npm test` before considering work done.
- Integration checks require a real Magento instance — never point tests at production stores.

### Error handling
- Transport/HTTP failures must go through `lib/api-error.ts` classification so MCP clients get structured `{kind, message, hint}` errors instead of raw stack traces or "Connection closed".
- Startup is fail-fast only for config errors (missing URL/credentials); if the backend is unreachable, start anyway and return descriptive per-request errors.

### Logging and secrets
- All output goes through `lib/logger.ts`. stdout is reserved for MCP protocol messages — never `console.log` there; use the logger (file + stderr).
- Secrets are auto-redacted by the logger; do not log tokens or credentials directly.

### Docs and changelog
- Keep [README.md](README.md) accurate when behavior changes.
- Maintain [CHANGELOG.md](CHANGELOG.md): add an entry per notable change under Unreleased; bump on release.
- Update the MCP tool/resource descriptions in `src/handlers/` when their behavior changes — these descriptions are what LLM clients see.

## Environment variables

| Variable | Purpose |
|---|---|
| `M2_API_MCP_MAGENTO_URL` | Base URL of the Magento store |
| `M2_API_MCP_ADMIN_USERNAME` / `M2_API_MCP_ADMIN_PASSWORD` | Admin credentials for dynamic token mode |
| `M2_API_MCP_ENV_PROFILE` | Load `.env.<profile>` instead of `.env` |
| `M2_API_MCP_LOG_LEVEL` | `debug\|info\|warn\|error` (default `info`) |
| `M2_API_MCP_LOG_DIR` | Override log directory |

Copy `.env.example` to `.env` for local development. The server uses `rejectUnauthorized: false` for self-signed certs — acceptable for test instances only.
