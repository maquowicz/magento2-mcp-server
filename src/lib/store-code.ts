import { ApiRequestError } from './api-error.js';

/**
 * Explains Magento's store-code URL mechanism: prepending a store code after
 * /rest targets a specific store for BOTH reads and writes. The code "all" is
 * special — it means global scope (All Store Views, store_id 0). Write
 * endpoints (POST/PUT/PATCH/DELETE) do NOT accept a storeId query parameter;
 * the scope is chosen only by the store code in the URL path.
 *
 * Injected into schema.info.description so it is visible in the full
 * magento://rest/schema resource and matched by ?search= keyword queries
 * (store, all, storeCode, scope, store_id, storeId).
 */
export const STORE_CODE_NOTE = [
  'Store-code URL mechanism: prepend a store code after /rest to target a store for BOTH reads and writes, e.g. /rest/{storeCode}/V1/...',
  'The special code "all" = global scope (All Store Views, store_id 0).',
  'Without a store code, requests use the default store view scope.',
  'IMPORTANT: write endpoints (POST/PUT/PATCH/DELETE) do NOT accept a storeId query parameter; the scope is chosen only by the store code in the URL path.',
  'Examples: PUT /rest/all/V1/categories/23 = global-scope write; PUT /rest/V1/categories/23 = default store view write.',
  'Read endpoints additionally accept a storeId=0 query parameter as equivalent to /rest/all/.',
].join(' ');

/**
 * Append STORE_CODE_NOTE to the schema's info.description (Swagger 2.0 free
 * text). Pure: returns a new object and never mutates the input.
 */
export function injectStoreCodeNote(schema: any): any {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return schema;
  }
  const info = schema.info && typeof schema.info === 'object' ? { ...schema.info } : {};
  const existing = typeof info.description === 'string' ? info.description : '';
  info.description = existing ? `${existing}\n\n${STORE_CODE_NOTE}` : STORE_CODE_NOTE;
  return { ...schema, info };
}

const STORE_CODE_PATTERN = /^[A-Za-z0-9_.-]+$/;
const REST_PREFIX = '/rest/';

function invalid(message: string, hint: string): never {
  throw new ApiRequestError({ kind: 'invalid_request', message, hint });
}

/**
 * Rewrite a tool path to target a specific store by inserting the store code
 * into the URL: /rest/V1/... -> /rest/{storeCode}/V1/....
 *
 * - No storeCode -> path unchanged.
 * - Path already contains the SAME store code -> unchanged.
 * - Path already contains a DIFFERENT store code -> invalid_request error.
 * - Malformed store code or path -> invalid_request error.
 */
export function applyStoreCode(path: string, storeCode: string | undefined): string {
  if (!storeCode) {
    return path;
  }
  if (!STORE_CODE_PATTERN.test(storeCode)) {
    invalid(
      `Invalid storeCode "${storeCode}"`,
      'Store codes may contain only letters, digits, underscores, dots, and dashes (e.g. "all", "default").'
    );
  }
  if (!path.startsWith(REST_PREFIX)) {
    invalid(
      `Cannot apply storeCode: path must start with ${REST_PREFIX}`,
      `Got "${path}". Pass a path like /rest/V1/products/{sku} and the storeCode separately, or put the code directly in the path.`
    );
  }
  const rest = path.slice(REST_PREFIX.length);
  if (!rest) {
    invalid(
      'Cannot apply storeCode: empty path after /rest/',
      'Pass a full path like /rest/V1/products/{sku}.'
    );
  }
  const firstSegment = rest.split('/', 1)[0];
  if (firstSegment === 'V1') {
    return `${REST_PREFIX}${storeCode}/${rest}`;
  }
  if (firstSegment === storeCode) {
    return path;
  }
  invalid(
    `storeCode "${storeCode}" conflicts with store code "${firstSegment}" already in the path`,
    'Either omit storeCode (the path already targets a store) or make them match.'
  );
}