import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadEnv } from './env-loader.js';

const originalCwd = process.cwd();
const originalEnv = { ...process.env };

function setEnv(env: Record<string, string | undefined>): void {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
}

describe('loadEnv', () => {
  let tmpDir: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'magento-mcp-env-'));
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    setEnv(originalEnv);
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('loads .env from CWD when no profile is set', () => {
    fs.writeFileSync(path.join(tmpDir!, '.env'), 'FOO=bar\n');
    setEnv({});
    loadEnv();
    expect(process.env.FOO).toBe('bar');
  });

  it('loads .env.<profile> when M2_API_MCP_ENV_PROFILE is set', () => {
    fs.writeFileSync(path.join(tmpDir!, '.env.test'), 'FOO=from-test\n');
    setEnv({ M2_API_MCP_ENV_PROFILE: 'test' });
    loadEnv();
    expect(process.env.FOO).toBe('from-test');
  });

  it('prefers the profile file over the base .env', () => {
    fs.writeFileSync(path.join(tmpDir!, '.env'), 'FOO=base\n');
    fs.writeFileSync(path.join(tmpDir!, '.env.prod'), 'FOO=prod\n');
    setEnv({ M2_API_MCP_ENV_PROFILE: 'prod' });
    loadEnv();
    expect(process.env.FOO).toBe('prod');
  });

  it('throws when the profile file is missing', () => {
    setEnv({ M2_API_MCP_ENV_PROFILE: 'missing' });
    expect(() => loadEnv()).toThrow('file not found');
  });

  it('continues without the profile file when required credentials are already present', () => {
    setEnv({
      M2_API_MCP_ENV_PROFILE: 'missing',
      M2_API_MCP_MAGENTO_URL: 'https://example.com',
      M2_API_MCP_ADMIN_USERNAME: 'admin',
      M2_API_MCP_ADMIN_PASSWORD: 'secret',
    });

    expect(() => loadEnv()).not.toThrow();
    expect(process.env.M2_API_MCP_MAGENTO_URL).toBe('https://example.com');
  });

  it('still throws when the profile file is missing and required credentials are incomplete', () => {
    setEnv({
      M2_API_MCP_ENV_PROFILE: 'missing',
      M2_API_MCP_MAGENTO_URL: 'https://example.com',
    });

    expect(() => loadEnv()).toThrow('file not found');
  });
it('replaces unresolved {env:VAR} placeholders with file values', () => {
  fs.writeFileSync(path.join(tmpDir!, '.env'), 'FOO=from-file\n');
  setEnv({ FOO: '{env:FOO}' });
  loadEnv();
  expect(process.env.FOO).toBe('from-file');
});

it('replaces empty client-supplied values with file values', () => {
  fs.writeFileSync(path.join(tmpDir!, '.env'), 'FOO=from-file\n');
  setEnv({ FOO: '' });
  loadEnv();
  expect(process.env.FOO).toBe('from-file');
});


  it('does not override real values already present in process.env', () => {
    fs.writeFileSync(path.join(tmpDir!, '.env'), 'FOO=from-file\n');
    setEnv({ FOO: 'from-client' });
    loadEnv();
    expect(process.env.FOO).toBe('from-client');
  });

  it('throws for invalid profile names', () => {
    setEnv({ M2_API_MCP_ENV_PROFILE: '../evil' });
    expect(() => loadEnv()).toThrow('Invalid M2_API_MCP_ENV_PROFILE');
  });
});
