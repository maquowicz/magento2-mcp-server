# Magento 2 MCP Server

A Model Context Protocol (MCP) server implementation for Magento 2 REST API, enabling AI assistants to interact with your Magento store through a standardized interface. This is a rewrite of dzmitry-vasileuski/magento2-mcp-server. Added env variables support, dynamic token fetch, debugging, payload issues fixes. More soon.

## Features

- REST API integration with Magento 2
- Secure authentication handling
- Resource and tool handlers for common Magento operations
- TypeScript implementation for type safety
- Built on the official MCP SDK

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
Set the `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables for automatic token acquisition and refresh. No token argument is needed.

```bash
ADMIN_USERNAME="your_admin_username" ADMIN_PASSWORD="your_admin_password" node build/index.js <magento_url>
```

Example:
```bash
ADMIN_USERNAME="admin@example.com" ADMIN_PASSWORD="your_password" node build/index.js https://your-magento-store.com
```

In dynamic mode, the server fetches a fresh token on startup and automatically refreshes it before expiration (with a 1-minute buffer) using the Magento REST API endpoint `/rest/V1/integration/admin/token`.

### Integration with MCP Client

To use this server with your MCP client (like Cline or Cursor), add the following configuration to your MCP settings (e.g., `cline_mcp_settings.json`):

For dynamic mode (recommended):

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
        "https://your-magento-store.com"
      ],
      "env": {
        "ADMIN_USERNAME": "your_admin_username",
        "ADMIN_PASSWORD": "your_admin_password"
      }
    }
  }
}
```

For static mode:

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

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Start development server: `npm run dev`
4. Make your changes
5. Run tests: `npm test`
6. Build for production: `npm run build`

## Authentication

The server now supports dynamic authentication:

- **Static Mode**: Uses a provided Bearer token (expires quickly, manual refresh needed).
- **Dynamic Mode**: Uses admin credentials to automatically obtain and refresh tokens via the Magento admin token API. Tokens are refreshed proactively before expiration to ensure seamless operation.

In dynamic mode, the server decodes the JWT token to check expiration and refreshes it using a POST request to `/rest/V1/integration/admin/token` with the provided credentials.

## Security

- Never commit your Magento admin token or credentials
- Use environment variables for sensitive information (ADMIN_USERNAME, ADMIN_PASSWORD, or token args)
- The server uses insecure HTTPS connections (rejectUnauthorized: false) for self-signed certs; ensure your production setup is secure
- Keep your Node.js and npm versions up to date
- Regularly update dependencies

## Debugging

To enable verbose logging for troubleshooting authentication, token refresh, and API calls, set the `DEBUG` environment variable to `true` when starting the server.

Example in dynamic mode:
```bash
DEBUG=true ADMIN_USERNAME="your_admin_username" ADMIN_PASSWORD="your_admin_password" node build/index.js https://your-magento-store.com
```

In the MCP client config, add it to the env:
```json
"env": {
  "DEBUG": "true",
  "ADMIN_USERNAME": "your_admin_username",
  "ADMIN_PASSWORD": "your_admin_password"
}
```

Logs will include token fetch details, request/response headers, and expiration checks. Set `DEBUG=false` or omit it for production to reduce output.

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
        "ADMIN_USERNAME": "your_admin_username",
        "ADMIN_PASSWORD": "your_admin_password"
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
- **Conditional Logging**: All debug logs are now toggled via DEBUG env var.
- **MCP Integration**: Tested with Cline; supports stdio transport for tools like magento_rest_api.
- **Known Issues**: None; server is production-ready for REST API interactions.

## License

MIT
