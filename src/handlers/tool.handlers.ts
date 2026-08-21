import { Agent, fetch } from 'undici';
import { log } from '../lib/logger.js';

export function createListToolsHandler() {
  return async (): Promise<any> => ({
    tools: [{
      name: 'magento_rest_api',
      description: [
        'Run a Magento 2 REST API request against the configured store.',
        'Discover exact endpoints and field names via the magento://rest/schema resource (add ?search= to filter).',
        'Reads (GET/HEAD) are safe on any endpoint; writes (POST/PUT/PATCH/DELETE) require a JSON body.'
      ].join(' '),
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: [
              'REST API path starting with /rest, e.g. /rest/V1/products, /rest/V1/products/{sku},',
              '/rest/V1/orders, /rest/V1/customers/search, /rest/V1/cmsPage/search, /rest/V1/cmsBlock/search,',
              '/rest/V1/categories/list, /rest/V1/products/attributes, /rest/V1/store/storeConfigs, /rest/V1/search.'
            ].join(' ')
          },
          method: {
            type: 'string',
            enum: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
            description: 'HTTP method. GET/HEAD for reads (no body). POST=create, PUT=update, PATCH=partial update, DELETE=remove (JSON body required).'
          },
          body: {
            type: 'string',
            description: 'JSON request body string. Required for POST/PUT/PATCH/DELETE; use empty string "" for GET/HEAD.'
          },
          query: {
            type: 'string',
            description: [
              'URL-encoded query string (leading ? optional; omit for no params). Magento list endpoints accept searchCriteria:',
              'Pagination: searchCriteria[pageSize]=N&searchCriteria[currentPage]=1',
              'Sorting: searchCriteria[sortOrders][0][field]=entity_id&searchCriteria[sortOrders][0][direction]=DESC (ASC|DESC)',
              'Field projection: fields=items[sku,name,price] (add total_count,search_criteria to include them; custom attrs require custom_attributes)',
              'Filters: searchCriteria[filterGroups][G][filters][F][field]=...&[value]=...&[conditionType]=...',
              '  AND = separate filterGroups (G=0,1,...); OR = multiple filters within one group (F=0,1,...).',
              'conditionType: eq, neq, like, in, nin, gt, gteq, lt, lteq, notnull, null, finset. URL-encode % as %25 and space as %20 (value=%25kolagen%25 = LIKE %kolagen%).',
              'Category filter: field=category_id&conditionType=eq (do NOT use finset). Price/date range: two filterGroups gteq + lteq (from/to ignored for price).',
              'Full-text: GET /rest/V1/search with searchCriteria[requestName]=quick_search_container and filter field=search_term&value=<term>&conditionType=eq (items return only ids).'
            ].join(' ')
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

      // Capture exactly what the client sent (e.g. opencode's body handling
      // quirks) before any transformation.
      log.debug(`Incoming tool args: ${JSON.stringify(request.params.arguments)}`);

      const startedAt = Date.now();
      const fullUrl = `${url}${path}${query ? (query.startsWith('?') ? query : '?' + query) : ''}`;
      log.info(`API call: ${method} ${path}${query ? '?' + query : ''}`);
      log.debug(`Body: ${body || 'none'}`);
      log.debug(`Full URL: ${fullUrl}`);

      let token: string;
      try {
        token = await getToken();
      } catch (error) {
        log.error(`Token retrieval failed for ${method} ${path}: ${error instanceof Error ? error.message : error}`);
        throw error;
      }
      log.debug(`Using token: ${token.slice(0, 8)}... (${token.length} chars)`);

      const requestHeaders = {
        ...(method !== 'GET' && method !== 'HEAD' ? { 'Content-Type': 'application/json' } : {}),
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`.replace(/"/g, '')
      };
      log.debug(`Request headers: ${JSON.stringify(requestHeaders)}`);

      const dispatcher = new Agent({
        connect: {
          rejectUnauthorized: false,
        }
      });

      let apiResponse: Awaited<ReturnType<typeof fetch>>;
      try {
        apiResponse = await fetch(fullUrl, {
          method,
          // GET/HEAD never carry a request body; drop it regardless of what the
          // client sent (some clients forward a truthy body for GET/HEAD).
          body: method === 'GET' || method === 'HEAD' ? undefined : body || undefined,
          headers: requestHeaders,
          dispatcher
        });
      } catch (error) {
        log.error(`Request failed for ${method} ${path}: ${error instanceof Error ? error.message : error}`);
        throw error;
      }

      const duration = Date.now() - startedAt;
      log.info(`API response: ${method} ${path} => ${apiResponse.status} ${apiResponse.statusText} (${duration}ms)`);
      log.debug(`API response headers: ${JSON.stringify(Object.fromEntries(apiResponse.headers.entries()))}`);

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
