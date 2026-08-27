# Changelog

## Unreleased
- Documented Magento's store-code URL mechanism (`/rest/{storeCode}/V1/...`, `all` = global scope / store_id 0) in the `magento://rest/schema` resource (searchable via `store`/`all`/`storeCode`/`scope`) and in the `magento_rest_api` tool descriptions.
- Added optional `storeCode` parameter to `magento_rest_api`: rewrites `/rest/V1/...` to `/rest/{storeCode}/V1/...` so agents can target any store (including global `all`) without knowing the URL convention. Conflicts/malformed codes return a structured `invalid_request` error.

- **0.1.0** (2026-08-26) — structured classified API errors (`{kind, message, hint}`) instead of "Connection closed" on Magento outage, boolean→1/0 coercion for int-typed flags, schema resource auth/headers fix.
- **0.0.4** (2026-08-14) — `.env` support with `M2_API_MCP_*` env var naming, `{env:...}` pattern resolution with loop detection, file-based logging with leveled verbosity and secret redaction, fail-fast startup auth, per-profile `.env.<profile>` files via `M2_API_MCP_ENV_PROFILE`, verified `searchCriteria` tool descriptions, MCP env loading fixes for Zoo/Roo clients, GET/HEAD request-body handling.
- **0.0.3** (2025-10-18) — multi-word OR keyword schema search, query trimming, exact-path regex search docs, query parameter handling fix (`?` prefix in URL construction).
- **0.0.2** (2025-10-15) — searchable filtering for the `magento://rest/schema` resource (keyword + regex), file-based schema caching with 1-hour TTL, REST API tool handler body payload fix.
- **0.0.1** (2025-10-15) — initial rewrite of dzmitry-vasileuski/magento2-mcp-server: env variables support, dynamic admin token fetch, debugging, payload issue fixes.
