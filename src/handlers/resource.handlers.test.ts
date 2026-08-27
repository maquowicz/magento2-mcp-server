import { searchSchema } from './resource.handlers.js';
import { STORE_CODE_NOTE } from '../lib/store-code.js';

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