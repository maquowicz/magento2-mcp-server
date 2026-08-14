import { Agent, fetch } from 'undici';
import { log } from '../lib/logger.js';

export function createListToolsHandler() {
  return async (): Promise<any> => ({
    tools: [{
      name: 'magento_rest_api',
      description: 'Run Magento REST API request',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'REST API path to call starting with /rest',
          },
          method: {
            type: 'string',
            description: 'HTTP method to use',
          },
          body: {
            type: 'string',
            description: 'JSON body to send with the request',
          },
          query: {
            type: 'string',
            description: 'Query parameters to send with the request starting with ?',
          },
        },
        required: ['path', 'method', 'body', 'query']
      }
    }]
  });
}

export function createCallToolHandler(url: string, getToken: () => Promise<string>) {
  return async (request: any): Promise<any> => {
    if (request.params.name === 'magento_rest_api') {
      const { path, method, body, query } = request.params.arguments;

      log.debug(`Making API call: ${method} ${url}${path}${query}`);
      log.debug(`Body: ${body || 'none'}`);

      const token = await getToken();
      log.debug(`Using token: ${token}`);

      const fullUrl = `${url}${path}${query ? (query.startsWith('?') ? query : '?' + query) : ''}`;
      const requestHeaders = {
        ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`.replace(/"/g, '')
      };
      log.debug(`Request URL: ${fullUrl}`);
      log.debug(`Request method: ${method}`);
      log.debug(`Authorization header value: ${requestHeaders.Authorization}`);
      log.debug(`Request headers: ${JSON.stringify(requestHeaders, null, 2)}`);

      const dispatcher = new Agent({
        connect: {
          rejectUnauthorized: false,
        }
      });
      const apiResponse = await fetch(fullUrl, {
        method,
        body: body || undefined,
        headers: requestHeaders,
        dispatcher
      });

      log.debug(`API response status: ${apiResponse.status} ${apiResponse.statusText}`);
      log.debug(`API response headers: ${JSON.stringify(Object.fromEntries(apiResponse.headers.entries()), null, 2)}`);

      const responseText = await apiResponse.text();
      log.debug(`API response body: ${responseText}`);

      let json;
      try {
        json = JSON.parse(responseText);
      } catch (parseError) {
        log.error(`Failed to parse API response: ${parseError}`);
        json = { error: 'Failed to parse response', raw: responseText };
      }

      return {
        content: [
          {
            type: 'text',
            mimeType: 'application/json',
            text: JSON.stringify(json, null, 2)
          }
        ]
      };
    }

    throw new Error('Tool not found');
  };
}
