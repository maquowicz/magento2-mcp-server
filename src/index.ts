import './lib/env-bootstrap.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListResourcesRequestSchema, ReadResourceRequestSchema, ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createListResourcesHandler, createReadResourceHandler } from './handlers/resource.handlers.js';
import { createListToolsHandler, createCallToolHandler } from './handlers/tool.handlers.js';
import { Agent, setGlobalDispatcher, fetch } from 'undici';
import { log } from './lib/logger.js';
import { resolveEnvValue } from './lib/env.js';

async function decodeJWT(token: string): Promise<number> {
  try {
    const payloadStr = token.split('.')[1];
    const decoded = atob(payloadStr.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(decoded);
    log.debug(`Decoded JWT payload: ${JSON.stringify(payload)}`);
    return payload.exp * 1000;
  } catch (error) {
    log.error('Failed to decode JWT:', error);
    throw new Error('Invalid token format');
  }
}

async function fetchToken(url: string, username: string, password: string): Promise<{token: string, expiration: number}> {
  const tokenUrl = `${url}/rest/V1/integration/admin/token`;
  log.debug(`Fetching token from: ${tokenUrl}`);
  log.debug(`Using username: ${username}`);
  log.debug(`Password length: ${password.length}`);
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  log.debug(`Token fetch response status: ${response.status} ${response.statusText}`);
  log.debug(`Token fetch response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2)}`);

  if (!response.ok) {
    const errorText = await response.text();
    log.error(`Token fetch failed body: ${errorText}`);
    throw new Error(`Failed to fetch token: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const text = await response.text();
  // Magento may return the token wrapped in JSON string quotes depending on
  // content negotiation ("eyJ..." vs eyJ...). Strip them here once so every
  // consumer (tools AND resources) gets a bare token.
  const token = text.trim().replace(/"/g, '');
  log.debug(`Token fetched successfully: ${token.slice(0, 8)}... (${token.length} chars)`);
  const expiration = await decodeJWT(token);
  log.debug(`Token expiration: ${new Date(expiration).toISOString()}`);
  return { token, expiration };
}

function createGetToken(url: string, initialToken?: string): () => Promise<string> {
  let currentToken: string | null = initialToken || null;
  let expiration: number = 0;
  let username: string | undefined;
  let password: string | undefined;

  try {
    username = resolveEnvValue(process.env.M2_API_MCP_ADMIN_USERNAME);
    password = resolveEnvValue(process.env.M2_API_MCP_ADMIN_PASSWORD);
  } catch (error) {
    log.error('Failed to resolve env variables:', error);
    throw error;
  }

  const REFRESH_BUFFER = 60000;

  log.debug(`Environment vars - M2_API_MCP_ADMIN_USERNAME present: ${!!username}, M2_API_MCP_ADMIN_PASSWORD present: ${!!password}`);

  if (username && password) {
    return async (): Promise<string> => {
      const now = Date.now();
      log.debug(`Token check - current valid until ~${new Date(expiration - REFRESH_BUFFER).toISOString()}, now: ${new Date(now).toISOString()}`);
      if (!currentToken || now >= expiration - REFRESH_BUFFER) {
        log.debug('Token expired or missing, refreshing...');
        try {
          const { token, expiration: newExp } = await fetchToken(url, username!, password!);
          currentToken = token;
          expiration = newExp;
          log.debug('Token refreshed successfully');
        } catch (error) {
          log.error('Token refresh failed:', error);
          throw new Error('Unable to obtain valid token');
        }
      } else {
        log.debug('Using existing token');
      }
      log.debug(`Returning token length: ${currentToken!.length}`);
      return currentToken!;
    };
  } else {
    if (!initialToken) {
      throw new Error('No admin credentials or token provided');
    }
    log.debug('Using static token mode');
    return async () => initialToken;
  }
}

async function main(): Promise<void> {
  try {
    log.info(`Env profile: ${process.env.M2_API_MCP_ENV_PROFILE || 'default'}`);
    log.info(`CWD: ${process.cwd()}`);
    const [url, token] = process.argv.slice(2);
    const magentoUrl = url || resolveEnvValue(process.env.M2_API_MCP_MAGENTO_URL);

    if (!magentoUrl) {
      throw new Error('Magento URL is required (pass as CLI arg or set M2_API_MCP_MAGENTO_URL env var)');
    }

    const normalizedUrl = magentoUrl.replace(/\/$/, '');

    const dispatcher = new Agent({
      connect: {
        rejectUnauthorized: false,
      }
    });

    setGlobalDispatcher(dispatcher);

    const getToken = createGetToken(normalizedUrl, token);

    const startupToken = await getToken();
    log.debug(`Startup token fetched successfully: ${startupToken.slice(0, 8)}... (${startupToken.length} chars)`);

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
    log.info('Magento MCP Server running on stdio');
  } catch (error) {
    log.error('Configuration error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch((error) => {
  log.error('Fatal error in main():', error);
  process.exit(1);
});
