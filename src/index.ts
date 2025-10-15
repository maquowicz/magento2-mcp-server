import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListResourcesRequestSchema, ReadResourceRequestSchema, ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createListResourcesHandler, createReadResourceHandler } from './handlers/resource.handlers.js';
import { createListToolsHandler, createCallToolHandler } from './handlers/tool.handlers.js';
import { Agent, setGlobalDispatcher, fetch } from 'undici';

async function decodeJWT(token: string): Promise<number> {
  try {
    const payloadStr = token.split('.')[1];
    const decoded = atob(payloadStr.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(decoded);
    if (process.env.DEBUG === 'true') console.log(`Decoded JWT payload: ${JSON.stringify(payload)}`);
    return payload.exp * 1000; // Convert to ms
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    throw new Error('Invalid token format');
  }
}

async function fetchToken(url: string, username: string, password: string): Promise<{token: string, expiration: number}> {
  const tokenUrl = `${url}/rest/V1/integration/admin/token`;
  if (process.env.DEBUG === 'true') {
    console.log(`Fetching token from: ${tokenUrl}`);
    console.log(`Using username: ${username}`);
    console.log(`Password length: ${password.length}`); // Don't log full password for security
  }
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (process.env.DEBUG === 'true') {
    console.log(`Token fetch response status: ${response.status} ${response.statusText}`);
    const responseHeaders = Object.fromEntries(response.headers.entries());
    console.log(`Token fetch response headers: ${JSON.stringify(responseHeaders, null, 2)}`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Token fetch failed body: ${errorText}`);
    throw new Error(`Failed to fetch token: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const text = await response.text();
  const token = text.trim();
  if (process.env.DEBUG === 'true') console.log(`Token fetched successfully: ${token}`);
  const expiration = await decodeJWT(token);
  if (process.env.DEBUG === 'true') console.log(`Token expiration: ${new Date(expiration).toISOString()}`);
  return { token, expiration };
}

function createGetToken(url: string, initialToken?: string): () => Promise<string> {
  let currentToken: string | null = initialToken || null;
  let expiration: number = 0;
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  const REFRESH_BUFFER = 60000; // 1 minute before expiration

  if (process.env.DEBUG === 'true') console.log(`Environment vars - ADMIN_USERNAME present: ${!!username}, ADMIN_PASSWORD present: ${!!password}`);

  if (username && password) {
    // Dynamic token management
    return async (): Promise<string> => {
      const now = Date.now();
      if (process.env.DEBUG === 'true') {
        console.log(`Token check - current valid until ~${new Date(expiration - REFRESH_BUFFER).toISOString()}, now: ${new Date(now).toISOString()}`);
      }
      if (!currentToken || now >= expiration - REFRESH_BUFFER) {
        if (process.env.DEBUG === 'true') console.log('Token expired or missing, refreshing...');
        try {
          const { token, expiration: newExp } = await fetchToken(url, username, password);
          currentToken = token;
          expiration = newExp;
          if (process.env.DEBUG === 'true') console.log('Token refreshed successfully');
        } catch (error) {
          console.error('Token refresh failed:', error);
          throw new Error('Unable to obtain valid token');
        }
      } else {
        if (process.env.DEBUG === 'true') console.log('Using existing token');
      }
      if (process.env.DEBUG === 'true') console.log(`Returning token length: ${currentToken!.length}`);
      return currentToken!;
    };
  } else {
    // Static token fallback
    if (!initialToken) {
      throw new Error('No admin credentials or token provided');
    }
    if (process.env.DEBUG === 'true') console.log('Using static token mode');
    return async () => initialToken;
  }
}

async function main(): Promise<void> {
  try {
    const [url, token] = process.argv.slice(2);

    if (!url) {
      throw new Error('Magento URL is required');
    }

    const normalizedUrl = url.replace(/\/$/, ''); // Remove trailing slash for safe path construction

    const dispatcher = new Agent({
      connect: {
        rejectUnauthorized: false,
      }
    });
  
    setGlobalDispatcher(dispatcher);

    const getToken = createGetToken(normalizedUrl, token);

    // Force token fetch on startup for debugging
    try {
      const startupToken = await getToken();
      if (process.env.DEBUG === 'true') console.log(`Startup token fetched successfully: ${startupToken}`);
    } catch (error) {
      console.error('Failed to fetch token on startup:', error);
    }

    const server = new Server(
      {
        name: 'magento',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        }
      }
    );

    server.setRequestHandler(ListResourcesRequestSchema, createListResourcesHandler());
    server.setRequestHandler(ReadResourceRequestSchema, createReadResourceHandler(normalizedUrl, getToken));
    server.setRequestHandler(ListToolsRequestSchema, createListToolsHandler());
    server.setRequestHandler(CallToolRequestSchema, createCallToolHandler(normalizedUrl, getToken));

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Magento MCP Server running on stdio');
  } catch (error) {
    console.error('Configuration error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
