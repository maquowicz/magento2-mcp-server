# Changelog

- **0.1.0** (2026-08-26) — structured classified API errors (`{kind, message, hint}`) instead of "Connection closed" on Magento outage, boolean→1/0 coercion for int-typed flags, schema resource auth/headers fix.
- **0.0.4** (2026-08-14) — `.env` support with `M2_API_MCP_*` env var naming, `{env:...}` pattern resolution with loop detection, file-based logging with leveled verbosity and secret redaction, fail-fast startup auth, per-profile `.env.<profile>` files via `M2_API_MCP_ENV_PROFILE`, verified `searchCriteria` tool descriptions, MCP env loading fixes for Zoo/Roo clients, GET/HEAD request-body handling.
- **0.0.3** (2025-10-18) — multi-word OR keyword schema search, query trimming, exact-path regex search docs, query parameter handling fix (`?` prefix in URL construction).
- **0.0.2** (2025-10-15) — searchable filtering for the `magento://rest/schema` resource (keyword + regex), file-based schema caching with 1-hour TTL, REST API tool handler body payload fix.
- **0.0.1** (2025-10-15) — initial rewrite of dzmitry-vasileuski/magento2-mcp-server: env variables support, dynamic admin token fetch, debugging, payload issue fixes.
