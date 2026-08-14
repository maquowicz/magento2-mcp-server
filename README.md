# Magento 2 MCP Server

A Model Context Protocol (MCP) server implementation for Magento 2 REST API, enabling AI assistants to interact with your Magento store through a standardized interface. This is a rewrite of dzmitry-vasileuski/magento2-mcp-server. Added env variables support, dynamic token fetch, debugging, payload issues fixes. More soon.

## Features

- REST API integration with Magento 2
- Secure authentication handling
- Resource and tool handlers for common Magento operations
- TypeScript implementation for type safety
- Built on the official MCP SDK
- `.env` file support for credentials
- File-based logging for debugging
- `{env:VAR}` pattern resolution for MCP client compatibility

## Prerequisites

- Node.js (v18 or higher)
- npm (v8 or higher)
- Magento 2 instance with REST API access
- Either an admin API access token OR admin username and password for dynamic authentication

## Installation

```bash
npm install @maquowicz/magento2-mcp-server
```

## Usage

### Environment Variables via `.env` File

Create a `.env` file in your **project root** (the directory where opencode runs, i.e. where your `opencode.json` lives). Copy from `.env.example` included with this package:

```bash
M2_API_MCP_MAGENTO_URL=https://your-magento-store.com
M2_API_MCP_ADMIN_USERNAME=admin@example.com
M2_API_MCP_ADMIN_PASSWORD=your_password
M2_API_MCP_DEBUG=false
```

The server loads `.env` automatically from the current working directory (CWD) at startup via `dotenv`. When launched by opencode, CWD is the workspace/project directory. Environment variables set by the MCP client or shell take precedence over `.env` values.

### Starting the Server

The server supports two authentication modes:

#### Static Token Mode
Provide a pre-generated admin API token as the second argument.

```bash
node build/index.js <magento_url> <admin_api_token>
```

Example:
```bash
node build/index.js https://your-magento-store.com eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
```

#### Dynamic Token Mode (Recommended)
Set the `M2_API_MCP_ADMIN_USERNAME` and `M2_API_MCP_ADMIN_PASSWORD` environment variables for automatic token acquisition and refresh. No token argument is needed.

```bash
M2_API_MCP_MAGENTO_URL="https://your-magento-store.com" M2_API_MCP_ADMIN_USERNAME="admin@example.com" M2_API_MCP_ADMIN_PASSWORD="your_password" node build/index.js
```

The URL can also be passed as a CLI argument: `node build/index.js https://your-magento-store.com`. The env var takes precedence.

In dynamic mode, the server fetches a fresh token on startup and automatically refreshes it before expiration (with a 1-minute buffer) using the Magento REST API endpoint `/rest/V1/integration/admin/token`.

### Integration with MCP Client

To use this server with your MCP client (like Cline, Cursor, or opencode), add the following configuration to your MCP settings:

**Inline credentials (recommended for testing):**

```json
{
  "mcpServers": {
    "magento": {
      "disabled": false,
      "timeout": 60,
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "M2_API_MCP_MAGENTO_URL": "https://your-magento-store.com",
        "M2_API_MCP_ADMIN_USERNAME": "admin@example.com",
        "M2_API_MCP_ADMIN_PASSWORD": "your_password"
      }
    }
  }
}
```

**Using `{env:VAR}` syntax (for sharing configs without exposing secrets):**

```json
{
  "mcpServers": {
    "magento": {
      "disabled": false,
      "timeout": 60,
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "M2_API_MCP_MAGENTO_URL": "{env:M2_API_MCP_MAGENTO_URL}",
        "M2_API_MCP_ADMIN_USERNAME": "{env:M2_API_MCP_ADMIN_USERNAME}",
        "M2_API_MCP_ADMIN_PASSWORD": "{env:M2_API_MCP_ADMIN_PASSWORD}"
      }
    }
  }
}
```

> **How `{env:VAR}` works with opencode**: opencode resolves `{env:VAR}` from the shell environment when loading config. For this to work, the env var must be set in your shell. The simplest approach is to create a `.env` file at your project root (where `opencode.json` lives). The server loads it automatically via `dotenv` — no shell config needed. If opencode passes the literal `{env:...}` string (because the var isn't in the shell), the server's fallback resolver catches it and throws a clear error explaining what's missing.

**Static mode:**

```json
{
  "mcpServers": {
    "magento": {
      "disabled": false,
      "timeout": 60,
      "type": "stdio",
      "command": "node",
      "args": [
        "/path/to/build/index.js",
        "https://your-magento-store.com",
        "your-admin-api-token"
      ]
    }
  }
}
```

This will enable the following capabilities:
- REST API access to your Magento instance
- Schema introspection
- Resource listing and reading
- Tool execution for common Magento operations

## Available Tools

### magento_rest_api

Makes REST API calls to your Magento instance.

Parameters:
- `path`: API endpoint path
- `method`: HTTP method (GET, POST, PUT, DELETE)
- `body`: Request body (JSON string)
- `query`: Query parameters

Example usage in MCP client:
```typescript
const response = await mcp.magento_rest_api({
  path: "rest/V1/orders",
  method: "GET",
  body: "",
  query: "searchCriteria[pageSize]=3&searchCriteria[currentPage]=1"
});
```

## Available Resources

### Magento REST API Schema (Searchable)

Access the full Magento REST API schema or a filtered subset to avoid large context loads.

- **Full Schema**: `magento://rest/schema`

- **Keyword Search**: `magento://rest/schema?search=customer`
  Matches any string field (e.g., paths, descriptions) containing any of the keywords (multi-word queries use OR logic across words for broader matches, case-insensitive). Returns full matching resource structures.

- **Regex Search**: `magento://rest/schema?search=/^\/V1\/products/`
  Matches using regex (e.g., paths starting with /V1/products). Flags like /i for case-insensitive can be added. For exact paths, use regex with escaped slashes like `/V1/eav\/attribute-options/i`.

Returns a filtered JSON subset mirroring the schema structure, or `{}` if no matches.

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure credentials
4. Start development server: `npm run dev`
5. Make your changes
6. Run tests: `npm test`
7. Build for production: `npm run build`

## Authentication

The server now supports dynamic authentication:

- **Static Mode**: Uses a provided Bearer token (expires quickly, manual refresh needed).
- **Dynamic Mode**: Uses admin credentials to automatically obtain and refresh tokens via the Magento admin token API. Tokens are refreshed proactively before expiration to ensure seamless operation.

In dynamic mode, the server decodes the JWT token to check expiration and refreshes it using a POST request to `/rest/V1/integration/admin/token` with the provided credentials.

## Security

- Never commit your Magento admin token or credentials
- The `.env` file is gitignored — use `.env.example` as a template
- Use environment variables for all sensitive configuration (M2_API_MCP_MAGENTO_URL, M2_API_MCP_ADMIN_USERNAME, M2_API_MCP_ADMIN_PASSWORD)
- The server uses insecure HTTPS connections (rejectUnauthorized: false) for self-signed certs; ensure your production setup is secure
- Keep your Node.js and npm versions up to date
- Regularly update dependencies

## Finding Logs

### Log File

When the server starts, it writes logs to:

```
.data/logs/magento-mcp.log
```

This file is created automatically. All server output (info, warnings, errors, debug messages) is written here. By default only `INFO`, `WARN`, and `ERROR` messages are logged. Set `M2_API_MCP_DEBUG=true` to get full verbose logging including token values, request/response headers, and API call details.

### Console Output

Since the server uses **stdio transport** to communicate with MCP clients:
- **stdout** is reserved for MCP JSON-RPC protocol messages — never mix debug output here
- **stderr** receives server log messages (via `console.error`), but these are typically captured internally by the MCP client and are **not visible to the end user**

**To see live logs**, run the server manually from the terminal:
```bash
M2_API_MCP_DEBUG=true M2_API_MCP_MAGENTO_URL="https://your-magento-store.com" M2_API_MCP_ADMIN_USERNAME="admin@example.com" M2_API_MCP_ADMIN_PASSWORD="your_password" node build/index.js
```
All output goes to stderr in the terminal.

### MCP Client Logs

Each MCP client has its own logging:

| Client | Log Location |
|--------|-------------|
| **opencode** | `~/.config/opencode/logs/` |
| **Cline** (VS Code) | Output panel → "Cline" channel |
| **Cursor** | Developer Tools → Console |

Check these locations if the MCP server fails to start or authenticate — the client logs often contain the server's stderr output and any spawn errors.

### Custom Log Directory

Override the default log location by setting `M2_API_MCP_LOG_DIR`:

```bash
M2_API_MCP_LOG_DIR=/tmp/magento-logs node build/index.js https://your-store.com
```

## Debugging

To enable verbose logging for troubleshooting authentication, token refresh, and API calls, set `M2_API_MCP_DEBUG=true`. This enables detailed debug output in both the log file and stderr.

Example in dynamic mode:
```bash
M2_API_MCP_DEBUG=true M2_API_MCP_MAGENTO_URL="https://your-magento-store.com" M2_API_MCP_ADMIN_USERNAME="your_admin_username" M2_API_MCP_ADMIN_PASSWORD="your_admin_password" node build/index.js
```

In the MCP client config, add it to the env:
```json
"env": {
  "M2_API_MCP_DEBUG": "true",
  "M2_API_MCP_ADMIN_USERNAME": "your_admin_username",
  "M2_API_MCP_ADMIN_PASSWORD": "your_admin_password"
}
```

Logs will include token fetch details, request/response headers, and expiration checks. Set `M2_API_MCP_DEBUG=false` or omit it for production to reduce output.

> **Warning**: With `M2_API_MCP_DEBUG=true`, full token values and API response bodies are logged. Do not share log files from debug sessions.

### Troubleshooting Connection Issues

If the server fails to connect to Magento:

1. **Enable debug logging**: Set `M2_API_MCP_DEBUG=true` and check `.data/logs/magento-mcp.log`
2. **Run the server manually** from a terminal to see live output
3. **Verify credentials**: Run `echo $M2_API_MCP_ADMIN_USERNAME` and `echo $M2_API_MCP_ADMIN_PASSWORD` in the same environment where the MCP client runs
4. **Test the token endpoint directly**:
   ```bash
   curl -X POST https://your-store.com/rest/V1/integration/admin/token \
     -H "Content-Type: application/json" \
     -d '{"username":"admin@example.com","password":"your_password"}'
   ```
5. **Check `{env:VAR}` resolution**: If using `{env:M2_API_MCP_ADMIN_USERNAME}` syntax, verify the env var is exported in your shell. The server will log an error if it receives an unresolved `{env:...}` pattern.
6. **Check `.env` file**: Ensure a `.env` file exists at the project root (where `opencode.json` lives) with `M2_API_MCP_MAGENTO_URL`, `M2_API_MCP_ADMIN_USERNAME`, and `M2_API_MCP_ADMIN_PASSWORD` set

### Node Inspector for Debugging

For Node.js debugging with inspector, add `--inspect=9229` (or your preferred port) as the first argument in the MCP config's `args` array. This enables remote debugging via Chrome DevTools.

Example config:
```json
{
  "mcpServers": {
    "magento": {
      "args": [
        "--inspect=9229",
        "/path/to/build/index.js",
        "https://your-magento-store.com"
      ],
      "env": {
        "M2_API_MCP_ADMIN_USERNAME": "your_admin_username",
        "M2_API_MCP_ADMIN_PASSWORD": "your_admin_password"
      }
    }
  }
}
```

Connect to `chrome://inspect` in Chrome and attach to the process on port 9229. Note: This may interfere with stdio transport in some MCP clients; test in development only. To enable, simply insert the flag before the script path in args; to disable, remove it.

### VSCode Debugging

To debug the server using VSCode, create a `.vscode/launch.json` file in your project root with the following configuration:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Attach to Magento MCP Server",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "restart": true,
      "protocol": "inspector",
      "skipFiles": [
        "<node_internals>/**"
      ]
    }
  ]
}
```

Then, start the server with `--inspect=9229` as described above, and use the "Attach to Magento MCP Server" configuration in VSCode to attach the debugger.

This will allow you to set breakpoints, inspect variables, and step through the code.

## Current State

- **Dynamic Token Management**: Fully functional with automatic fetch and refresh using admin credentials.
- **Authorization Fix**: Resolved issue with extra quotes in Bearer token header.
- **Conditional Logging**: All debug logs are toggled via M2_API_MCP_DEBUG env var. INFO/WARN/ERROR always logged.
- **File-based Logging**: All output written to `.data/logs/magento-mcp.log` relative to the project root. Stderr also used.
- **`.env` Support**: Credentials and URL loaded from `.env` at the project root (CWD) via dotenv.
- **`{env:...}` Resolution**: Server resolves `{env:VAR}` patterns as a fallback with circular-loop detection.
- **MCP Integration**: Tested with Cline and opencode; supports stdio transport for tools like magento_rest_api.
- **Schema Caching**: File-based caching for REST API schema in .data/cache/schema.json with 1-hour expiration.

- **Version 0.0.5**: Added `.env` support, `{env:...}` pattern resolution, file-based logging, fail-fast startup auth, and M2_API_MCP_* env var naming convention.

## License

MIT
