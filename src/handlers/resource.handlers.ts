import fs from 'fs/promises';
import path from 'path';
import { URL } from 'url';
import { log } from '../lib/logger.js';
import { ApiRequestError, ClassifiedApiError, classifyHttpResponse, classifyTransportError, formatErrorContent } from '../lib/api-error.js';
import { injectStoreCodeNote } from '../lib/store-code.js';

// The schema endpoint is slow (~8 s observed) and has flaked with 500/503, so
// give it generous headroom and retry once on transient failures.
const SCHEMA_FETCH_TIMEOUT_MS = 30000;
const SCHEMA_FETCH_RETRIES = 1;
const SCHEMA_FETCH_RETRY_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetch the full Swagger schema. Retries once on 5xx and on network throws
// (draining the failed body so undici can reuse the connection) and applies a
// timeout. 4xx (e.g. auth) is returned immediately without retrying.
async function fetchSchema(url: string, token: string): Promise<Response> {
  const schemaUrl = `${url}/rest/all/schema`;
  let lastError: unknown;

  for (let attempt = 0; attempt <= SCHEMA_FETCH_RETRIES; attempt++) {
    if (attempt > 0) {
      log.info(`Schema fetch: retrying (attempt ${attempt + 1}/${SCHEMA_FETCH_RETRIES + 1})`);
      await sleep(SCHEMA_FETCH_RETRY_DELAY_MS);
    }
    try {
      const response = await fetch(schemaUrl, {
        headers: {
          // The Accept header is REQUIRED: Magento returns only anonymous-area
          // services (~50 paths) unless the schema request sends
          // "Accept: application/json" (undici's default */* triggers that).
          'Accept': 'application/json',
          // The full schema is ~1.2 MB JSON; gzip shrinks it over the wire and
          // undici decompresses transparently.
          'Accept-Encoding': 'gzip',
          'Authorization': `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(SCHEMA_FETCH_TIMEOUT_MS),
      });
      if (response.ok || response.status < 500 || attempt === SCHEMA_FETCH_RETRIES) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status} ${response.statusText}`);
      await response.body?.cancel();
    } catch (error) {
      lastError = error;
      if (attempt === SCHEMA_FETCH_RETRIES) {
        throw error;
      }
    }
  }
  throw lastError;
}

// Resource requests surface as JSON-RPC errors carrying only the message, so
// classified failures are thrown here as ApiRequestError and returned as
// structured resource content by the handler (see createReadResourceHandler) —
// the generic "Failed to read MCP resource" client message carries no hint.
function failResource(classified: ClassifiedApiError): never {
  throw new ApiRequestError(classified);
}

export function createListResourcesHandler() {
  return async (): Promise<any> => ({
    resources: [
      {
        uri: 'magento://rest/schema',
        name: 'Magento REST API Schema (Searchable)',
        mimeType: "application/json",
        description: "Full Magento REST API schema, or filtered subset via ?search=keyword (multi-word queries use OR logic across words for broader matches, case-insensitive) or ?search=/regex/ (regex, e.g., /customers/i). Searches all string fields (paths, descriptions, etc.) and returns full matching structures to preserve context. For exact paths, use regex with escaped slashes like \\/V1\\/eav\\/attribute-options/i. The schema is cached 1h; a failed refresh falls back to the last cached copy. Add ?refresh=1 to force a fresh fetch.",
      }
    ]
  });
}

export function createReadResourceHandler(url: string, getToken: () => Promise<string>) {
  return async (request: any): Promise<any> => {
    const uri = request.params.uri;

    const urlObj = new URL(uri, 'http://dummy');
    const searchQuery = urlObj.searchParams.get('search');
    const forceRefresh = urlObj.searchParams.get('refresh') === '1' || urlObj.searchParams.get('force') === '1';

    if (uri.startsWith('magento://rest/schema')) {
      const cacheDir = path.join(__dirname, '../..', '.data', 'cache');
      const cacheFile = path.join(cacheDir, 'schema.json');

      log.debug('Cache directory:', cacheDir);

      await fs.mkdir(cacheDir, { recursive: true });

      try {
        let schemaJson: any;
        // A parseable cached schema (even expired) is kept for
        // stale-while-revalidate: an expired-but-valid schema (352 paths,
        // rarely changes) is far better than a hard failure when the endpoint
        // flakes. Only a missing/unusable cache leads to a real error.
        let staleSchema: any;

        if (!forceRefresh) {
          try {
            await fs.access(cacheFile);
            const cachedData = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
            if (cachedData && typeof cachedData === 'object' && cachedData.schema) {
              staleSchema = cachedData.schema;
            }
            const now = Date.now();
            if (!('timestamp' in cachedData) || now - cachedData.timestamp > 3600000) {
              log.debug('Cache expired, fetching schema from API');
            } else {
              log.debug('Schema loaded from cache at:', cacheFile);
              schemaJson = cachedData.schema;
            }
          } catch (cacheError) {
            log.debug('Fetching schema from API (no usable cache):', cacheError instanceof Error ? cacheError.message : cacheError);
          }
        } else {
          log.info('Schema cache bypassed (?refresh=1); fetching fresh schema');
        }

        if (!schemaJson) {
          const token = await getToken().catch((error: unknown) => {
            log.error('Schema fetch: token retrieval failed:', error);
            failResource(classifyTransportError(error, `${url}/rest/V1/integration/admin/token`));
          });

          let response: Response | undefined;
          let responseText = '';
          let fetchError: unknown;
          try {
            response = await fetchSchema(url, token);
            responseText = await response.text();
          } catch (error) {
            fetchError = error;
          }

          if (fetchError) {
            log.error('Schema fetch failed:', fetchError);
            if (staleSchema) {
              log.warn('Schema fetch failed; serving stale cached schema from cache file');
              schemaJson = staleSchema;
            } else {
              failResource(classifyTransportError(fetchError, `${url}/rest/all/schema`));
            }
          } else if (response && !response.ok) {
            log.error(`Schema fetch: HTTP ${response.status} ${response.statusText}`, responseText.slice(0, 500));
            if (staleSchema) {
              log.warn(`Schema fetch failed (HTTP ${response.status}); serving stale cached schema from cache file`);
              schemaJson = staleSchema;
            } else {
              failResource(
                classifyHttpResponse(response.status, responseText, `${url}/rest/all/schema`) ?? {
                  kind: 'http_error',
                  message: `Schema endpoint returned HTTP ${response.status} ${response.statusText}`,
                  hint: 'Verify the store URL and that the admin token has access to the REST schema.',
                  url: `${url}/rest/all/schema`,
                  status: response.status,
                }
              );
            }
          } else {
            // Non-JSON body from a gateway/proxy usually means the backend is
            // serving an error or maintenance page.
            let fresh: any;
            try {
              fresh = JSON.parse(responseText);
            } catch {
              log.error('Schema fetch: non-JSON response', responseText.slice(0, 500));
              if (staleSchema) {
                log.warn('Schema fetch returned a non-JSON response; serving stale cached schema from cache file');
                schemaJson = staleSchema;
              } else {
                failResource(
                  classifyHttpResponse(503, responseText, `${url}/rest/all/schema`) ?? {
                    kind: 'unknown',
                    message: 'Schema endpoint returned a non-JSON response',
                    hint: 'A proxy or gateway likely intercepted the request; check the raw body in the MCP server log.',
                    url: `${url}/rest/all/schema`,
                  }
                );
              }
            }
            if (fresh) {
              schemaJson = fresh;
              const cacheData = { schema: schemaJson, timestamp: Date.now() };
              await fs.writeFile(cacheFile, JSON.stringify(cacheData, null, 2));
              log.debug('Schema cached to file');
            }
          }
        }

        let text: string;
        // Document the store-code URL mechanism (e.g. /rest/all/V1/... = global
        // scope) inside the schema's info.description so it is visible in the
        // full resource AND matched by ?search= keyword queries.
        schemaJson = injectStoreCodeNote(schemaJson);
        if (searchQuery) {
          log.debug('Schema search query:', searchQuery);
          const filteredJson = searchSchema(schemaJson, searchQuery);
          text = JSON.stringify(filteredJson || {}, null, 2);
        } else {
          text = JSON.stringify(schemaJson, null, 2);
        }

        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text,
              description: searchQuery ? `Filtered Magento REST API schema for query: ${searchQuery}` : 'Full Magento REST API schema'
            }
          ]
        };
      } catch (error) {
        // Classified failures are returned as structured content so agents see
        // {kind, message, hint} instead of a generic client-side error.
        if (error instanceof ApiRequestError) {
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: formatErrorContent(error.classified),
                description: 'Schema fetch failed'
              }
            ]
          };
        }
        throw error;
      }
    }

    throw new Error('Resource not found');
  };
}

export function searchSchema(schema: any, query: string): any {
  if (!schema || typeof schema !== 'object' || !schema.paths || typeof schema.paths !== 'object') {
    return {};
  }

  const queryTrim = query.trim();
  let isRegex = false;
  let regex: RegExp | null = null;
  let keyword: string = '';

  if (queryTrim.startsWith('/')) {
    const lastSlashIndex = queryTrim.lastIndexOf('/');
    if (lastSlashIndex > 0) {
      const pattern = queryTrim.substring(1, lastSlashIndex);
      const flagsStr = queryTrim.substring(lastSlashIndex + 1).trim();
      if (/^[gimyus]*$/.test(flagsStr)) {
        try {
          const flags = flagsStr || 'i';
          regex = new RegExp(pattern, flags);
          isRegex = true;
        } catch (e) {
          log.debug('Invalid regex:', e);
          return {};
        }
      } else {
        keyword = queryTrim.toLowerCase();
      }
    } else {
      keyword = queryTrim.toLowerCase();
    }
  } else {
    keyword = queryTrim.toLowerCase();
  }

  const words = keyword.split(/\s+/).filter(w => w.length > 0);

  function checkMatch(value: string): boolean {
    if (isRegex && regex) {
      return regex.test(value);
    } else {
      const lowerValue = value.toLowerCase();
      if (words.length === 0) {
        return false;
      }
      return words.some(word => lowerValue.includes(word.toLowerCase()));
    }
  }

  function filterSchema(obj: any): any | null {
    if (obj == null || typeof obj !== 'object') {
      if (typeof obj === 'string' && checkMatch(obj)) {
        return obj;
      }
      return null;
    }

    const isArray = Array.isArray(obj);
    const result: any = isArray ? [] : {};
    let hasMatch = false;

    if (isArray) {
      obj.forEach((item: any) => {
        const filtered = filterSchema(item);
        if (filtered !== null) {
          result.push(filtered);
          hasMatch = true;
        }
      });
    } else {
      for (const key in obj) {
        const value = obj[key];
        let filteredValue: any = null;
        if (checkMatch(key)) {
          filteredValue = value;
          hasMatch = true;
        } else {
          filteredValue = filterSchema(value);
        }
        if (filteredValue !== null) {
          result[key] = filteredValue;
          hasMatch = true;
        }
      }
    }

    return hasMatch ? result : null;
  }

  const filteredSchema = filterSchema(schema);
  return filteredSchema || {};
}
