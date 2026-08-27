import { STORE_CODE_NOTE, applyStoreCode, injectStoreCodeNote } from './store-code.js';
import { ApiRequestError } from './api-error.js';

describe('STORE_CODE_NOTE', () => {
  it('contains the keywords searchable via magento://rest/schema?search=', () => {
    for (const keyword of ['store', 'all', 'storeCode', 'scope', 'store_id', 'storeId']) {
      expect(STORE_CODE_NOTE.toLowerCase()).toContain(keyword.toLowerCase());
    }
  });

  it('documents the global scope code "all"', () => {
    expect(STORE_CODE_NOTE).toContain('all');
    expect(STORE_CODE_NOTE).toContain('store_id 0');
  });

  it('states that write endpoints scope only via the URL store code', () => {
    expect(STORE_CODE_NOTE).toContain('/rest/all/V1/categories/23');
  });
});

describe('injectStoreCodeNote', () => {
  it('appends the note to an existing info.description', () => {
    const schema = { swagger: '2.0', info: { title: 'Magento', description: 'Original', version: '1' } };
    const out = injectStoreCodeNote(schema);
    expect(out.info.description).toBe(`Original\n\n${STORE_CODE_NOTE}`);
    expect(schema.info.description).toBe('Original');
  });

  it('creates info when missing', () => {
    const out = injectStoreCodeNote({ paths: {} });
    expect(out.info.description).toBe(STORE_CODE_NOTE);
    expect(out.paths).toEqual({});
  });

  it('preserves other keys', () => {
    const schema = { swagger: '2.0', paths: { '/V1/products': {} }, definitions: {} };
    const out = injectStoreCodeNote(schema);
    expect(out.swagger).toBe('2.0');
    expect(out.paths).toEqual(schema.paths);
    expect(out.definitions).toEqual(schema.definitions);
  });

  it('passes non-objects through unchanged', () => {
    expect(injectStoreCodeNote(null)).toBeNull();
    expect(injectStoreCodeNote('x')).toBe('x');
  });
});

describe('applyStoreCode', () => {
  it('returns the path unchanged when no storeCode is given', () => {
    expect(applyStoreCode('/rest/V1/categories/23', undefined)).toBe('/rest/V1/categories/23');
    expect(applyStoreCode('/rest/V1/categories/23', '')).toBe('/rest/V1/categories/23');
  });

  it('inserts the store code after /rest for V1 paths', () => {
    expect(applyStoreCode('/rest/V1/categories/23', 'all')).toBe('/rest/all/V1/categories/23');
    expect(applyStoreCode('/rest/V1/products/{sku}', 'default')).toBe('/rest/default/V1/products/{sku}');
    expect(applyStoreCode('/rest/V1/products', 'all')).toBe('/rest/all/V1/products');
    expect(applyStoreCode('/rest/V1', 'all')).toBe('/rest/all/V1');
  });

  it('leaves the path unchanged when the same store code is already present', () => {
    expect(applyStoreCode('/rest/all/V1/categories/23', 'all')).toBe('/rest/all/V1/categories/23');
    expect(applyStoreCode('/rest/default/V1/products/x', 'default')).toBe('/rest/default/V1/products/x');
  });

  it('throws invalid_request when the path already targets a different store code', () => {
    try {
      applyStoreCode('/rest/all/V1/categories/23', 'default');
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).classified.kind).toBe('invalid_request');
      expect((error as ApiRequestError).classified.message).toContain('conflicts');
    }
  });

  it('throws invalid_request for malformed store codes', () => {
    for (const bad of ['all/store', 'store?code', 'bad#', 'a b', 'foo/bar']) {
      try {
        applyStoreCode('/rest/V1/categories/23', bad);
        throw new Error('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        expect((error as ApiRequestError).classified.kind).toBe('invalid_request');
      }
    }
  });

  it('throws invalid_request for non-/rest paths and empty remainder', () => {
    for (const [path, code] of [
      ['/api/V1/products', 'all'],
      ['/rest/', 'all'],
    ] as const) {
      try {
        applyStoreCode(path, code);
        throw new Error('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiRequestError);
        expect((error as ApiRequestError).classified.kind).toBe('invalid_request');
      }
    }
  });
});