jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  access: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

import { createReadResourceHandler, searchSchema } from './resource.handlers.js';
import { STORE_CODE_NOTE } from '../lib/store-code.js';
import fs from 'fs/promises';

const mockFs = fs as jest.Mocked<typeof fs>;

function schemaWithNote(): object {
  return {
    swagger: '2.0',
    info: {
      title: 'Magento API',
      description: `Original info.\n\n${STORE_CODE_NOTE}`,
      version: '1',
    },
    paths: {
      '/V1/categories': {
        get: { description: 'list categories' },
      },
    },
  };
}

const NOTE_SNIPPET = 'Store-code URL mechanism';

describe('searchSchema (store-code note discoverability)', () => {
  it('matches the store-code note via ?search=storeCode', () => {
    const result = searchSchema(schemaWithNote(), 'storeCode');
    expect(JSON.stringify(result)).toContain(NOTE_SNIPPET);
  });

  it('matches the store-code note via ?search=scope', () => {
    const result = searchSchema(schemaWithNote(), 'scope');
    expect(JSON.stringify(result)).toContain(NOTE_SNIPPET);
  });

  it('matches the store-code note via ?search=store', () => {
    const result = searchSchema(schemaWithNote(), 'store');
    expect(JSON.stringify(result)).toContain(NOTE_SNIPPET);
  });

  it('matches the store-code note via regex ?search=/storeCode/i', () => {
    const result = searchSchema(schemaWithNote(), '/storeCode/i');
    expect(JSON.stringify(result)).toContain(NOTE_SNIPPET);
  });

  it('does not match the note for unrelated queries', () => {
    const result = searchSchema(schemaWithNote(), 'random-nonsense-xyz');
    expect(JSON.stringify(result)).not.toContain(NOTE_SNIPPET);
  });
});

function sampleSchema(title = 'Magento API'): object {
  return {
    swagger: '2.0',
    info: { title, version: '1' },
    paths: { '/V1/faq': { get: { description: 'faq list' } } },
  };
}

function okResponse(body: object): any {
  return { ok: true, status: 200, statusText: 'OK', text: () => Promise.resolve(JSON.stringify(body)) };
}

function errResponse(status: number, statusText: string, body: string): any {
  return { ok: false, status, statusText, text: () => Promise.resolve(body) };
}

function makeHandler() {
  const getToken = jest.fn().mockResolvedValue('test-token');
  const handler = createReadResourceHandler('https://store.example', getToken);
  return { handler, getToken };
}

describe('createReadResourceHandler (schema read)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
    mockFs.access.mockRejectedValue(new Error('ENOENT'));
    mockFs.readFile.mockResolvedValue('{}' as any);
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  it('serves the stale cached schema when a fresh fetch fails (stale-while-revalidate)', async () => {
    mockFs.access.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(
      JSON.stringify({ schema: sampleSchema('stale schema'), timestamp: Date.now() - 7200000 })
    );
    (global.fetch as jest.Mock).mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));

    const { handler } = makeHandler();
    const result = await handler({ params: { uri: 'magento://rest/schema?search=faq' } });

    expect(result.contents[0].text).toContain('/V1/faq');
    expect(global.fetch).toHaveBeenCalled();
    // A stale schema must never overwrite the cache file with a fresh timestamp.
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it('serves the stale cached schema on an HTTP 500 (the reported outage)', async () => {
    mockFs.access.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(
      JSON.stringify({ schema: sampleSchema('stale schema'), timestamp: Date.now() - 7200000 })
    );
    (global.fetch as jest.Mock).mockResolvedValue(errResponse(500, 'Internal Server Error', 'oops'));

    const { handler } = makeHandler();
    const result = await handler({ params: { uri: 'magento://rest/schema' } });

    expect(result.contents[0].text).toContain('stale schema');
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it('uses a fresh cache without fetching', async () => {
    mockFs.access.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({ schema: sampleSchema(), timestamp: Date.now() }));

    const { handler } = makeHandler();
    const result = await handler({ params: { uri: 'magento://rest/schema?search=faq' } });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.contents[0].text).toContain('/V1/faq');
  });

  it('bypasses a fresh cache with ?refresh=1', async () => {
    mockFs.access.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({ schema: sampleSchema(), timestamp: Date.now() }));
    (global.fetch as jest.Mock).mockResolvedValue(okResponse(sampleSchema('fresh schema')));

    const { handler } = makeHandler();
    const result = await handler({ params: { uri: 'magento://rest/schema?refresh=1' } });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.contents[0].text).toContain('fresh schema');
  });

  it('returns structured error content when fetch fails and no cache exists', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));

    const { handler } = makeHandler();
    const result = await handler({ params: { uri: 'magento://rest/schema' } });

    expect(result.contents[0].description).toBe('Schema fetch failed');
    const parsed = JSON.parse(result.contents[0].text);
    expect(parsed.error).toBe(true);
    expect(parsed.kind).toBe('connection_refused');
    expect(parsed.message).toContain('ECONNREFUSED');
  });

  it('returns structured error content on an HTTP 500 with no cache', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(errResponse(500, 'Internal Server Error', 'oops'));

    const { handler } = makeHandler();
    const result = await handler({ params: { uri: 'magento://rest/schema' } });

    const parsed = JSON.parse(result.contents[0].text);
    expect(parsed.error).toBe(true);
    expect(parsed.kind).toBe('http_error');
  });
});