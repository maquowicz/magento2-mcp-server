# CONTINUATION NOTES — magento2-mcp-server ↔ opencode integration

Session: 2026-08-21 (second session). Goal this session: **better logging / info on
what is happening**, and adapt the spex4less documenting rules into this repo.

---

## 1. STATUS

### MariaDB MCP (`database`, db `s4l2_test`) — WORKING ✅
- Full Magento schema imported (`store`, `theme`, `setup_module`, `admin_user`, `devcore_*`, `mst_*`).
- No deferred notes left in rules.

### Magento REST API MCP (`api`, profile `test`) — AUTH OK ✅, GET/HEAD FIX APPLIED ✅ (verify via opencode)
- Auth verified: admin token issued + used OK.
- **GET/HEAD bug FIXED at server level** — see §2. Verified via stdio smoke test:
  GET `/rest/V1/store/storeConfigs` with a **truthy body `"should_be_ignored"`** returns 200
  (body dropped for GET/HEAD). Before the fix this threw undici `Request with GET/HEAD method cannot have body.`
- **Still to verify:** that opencode's own tool wrapper no longer fails for GET/HEAD (needs session restart — see §4).

---

## 2. ROOT CAUSE (GET body) — FIXED ✅

- Old code: `build/handlers/tool.handlers.js` did `fetch(url, { method, body: body || undefined, ... })`.
  undici throws for GET + any truthy body; opencode apparently forwards a truthy body even for GET.
- **Applied fix (candidate 1):** `body: (method === 'GET' || method === 'HEAD') ? undefined : body || undefined`
  in `src/handlers/tool.handlers.ts`. Server is now immune to whatever body a client sends on GET/HEAD.
- Debug hook added to finally capture what clients actually send:
  `log.debug('Incoming tool args: ' + JSON.stringify(request.params.arguments))`.

---

## 3. LOGGING — improved this session (main goal)

### Log levels (read once at startup; restart to change)
- New `M2_API_MCP_LOG_LEVEL` = `debug|info|warn|error`, **default `info`** (was: debug only with M2_API_MCP_DEBUG=true).
- Legacy `M2_API_MCP_DEBUG=true` still works → maps to debug.
- **`/var/www/spex4less.test/.env.test` now has `M2_API_MCP_LOG_LEVEL=debug`** — lower to `info` for quieter logs.
- Log file: `.data/logs/magento-mcp.log` (repo root). Header line shows active level.

### What's logged now
- `[info] API call: METHOD /rest/...` and `[info] API response: METHOD /rest/... => STATUS TEXT (Nms)` — one line each per request, visible at default level.
- `[debug]` everything else: full URL, request headers, response headers/body, token lifecycle.
- `[debug] Incoming tool args: {...}` — captures the exact raw args a client (opencode) transmits.

### Secret redaction (defense-in-depth, in `src/lib/logger.ts:redact`)
- Scrubs `Bearer <token>`, `"Authorization":"..."`, and JWT-like `header.payload.signature` (segments ≥8/≥8/≥10 chars so hostnames like `www.spex4less.test` are NOT caught).
- Call sites now log tokens as prefix+length (e.g. `eyJraWQ... (153 chars)`), never full.

### Server-side request handling also improved (`src/handlers/tool.handlers.ts`)
- Per-request timing, error logging with method/path context for token-fetch and fetch failures.
- `Content-Type: application/json` only for methods other than GET/HEAD.

---

## 4. HOW THIS MCP IS WIRED TO OPENCODE (unchanged, still true)

- opencode.json at `/var/www/spex4less.test/opencode.json`; `mcp.api` spawns
  `node /home/maxim/mcp-servers/magento2-mcp-server/build/index.js` with profile `test` + `{env:...}` placeholders.
- Server ALSO loads `.env.test` from its CWD (= opencode project root). `M2_API_MCP_LOG_LEVEL` was added there.
- Tool exposed: `api_magento_rest_api` (perm key `mcp__api__magento_rest_api`). Args: `path`, `method`, `body`, `query` (all strings; `body:""` for GET/HEAD — now safe regardless).
- `build/` is gitignored — `npm run build` regenerates from `src/`; needs opencode session restart to take effect.

### Debugging recipe (log-read flow)
1. Edit `src/…` → `npm run build` (in the mcp repo).
2. Restart opencode session (MCP servers respawn).
3. Call the tool; read `.data/logs/magento-mcp.log` (info lines show every call + status + timing).

---

## 5. RULES — adapted spex4less documenting conventions into this repo

- Created `.roo/rules/project.md` (adapted from `/var/www/spex4less.test/.roo/rules/project.md`).
- `.opencode/rules` → symlink to `../.roo/rules` (same pattern as spex4less).
- Key documenting rules now enforced here:
  - README.md in repo root kept in sync.
  - Plans: `plans/*.md` active → `plans/executed/` when done; **deferred items always get a new plan file, never dropped** (`plans/` gitignored).
  - `CONTINUATION-NOTES.md` at repo root = session/state notes; update before restart / end of session.
  - Propose README/plan updates on changes, apply after confirm.
  - Commit only when asked; never commit `.env*`; bump `package.json` on releases.
  - Logs: `.data/logs/magento-mcp.log`, level via `M2_API_MCP_LOG_LEVEL`, never log full tokens.

---

## 6. RESTART CHECKLIST

1. ✅ `src/` edits done, `npm run build` green, `npm test` 10/10, `npm run lint` 0 errors.
2. ✅ `.env.test` (spex4less) has `M2_API_MCP_LOG_LEVEL=debug`.
3. **Restart the opencode session** (kills + respawns MCP servers).
4. Verify via the `api` tool: GET `/rest/V1/store/storeConfigs` → expect 200 JSON (was -32603 before fix).
5. Check `.data/logs/magento-mcp.log` → `[info] API call/API response` lines + `[debug] Incoming tool args` show what opencode sends.
6. Optionally lower `M2_API_MCP_LOG_LEVEL=info` in `.env.test` once debug output is no longer needed.
7. If opencode still fails on GET: read `Incoming tool args` in the log and report the exact `body` value.

## STORE MAP (verified via `GET /rest/V1/store/storeConfigs`)
- website 1 (main): store `1`=uk GBP, `3`=Spex GBP, `4`=us USD, `5`=eu EUR, `9`=au AUD
- website 3 (JPO): `6`=jp_uk GBP, `7`=jp_us USD, `8`=jp_eu EUR, `10`=jp_au AUD
- all locale en_GB, tz Europe/London.

## ENV / CRED LOCATIONS
- `/var/www/spex4less.test/.env.test` → M2_API_MCP_* + MARIADB_MCP_* + BRAVE_API_KEY + M2_API_MCP_LOG_LEVEL.
- opencode.json at `/var/www/spex4less.test/opencode.json`.
- Server log: `/home/maxim/mcp-servers/magento2-mcp-server/.data/logs/magento-mcp.log`.
