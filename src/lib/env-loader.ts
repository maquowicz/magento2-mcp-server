import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const PLACEHOLDER_RE = /^\{env:[A-Za-z_][A-Za-z0-9_]*\}$/;
const PROFILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const REQUIRED_ENV_KEYS = [
  'M2_API_MCP_MAGENTO_URL',
  'M2_API_MCP_ADMIN_USERNAME',
  'M2_API_MCP_ADMIN_PASSWORD',
];

function envHasRealValue(key: string): boolean {
  const value = process.env[key];
  if (value === undefined || value === '') return false;

  // A value that is not an unresolved {env:VAR} placeholder is already usable.
  if (!PLACEHOLDER_RE.test(value)) return true;

  // Placeholders are only usable when the referenced shell env var resolves to
  // a real value (and does not itself point at another placeholder).
  const referencedKey = value.slice(5, -1);
  const resolved = process.env[referencedKey];
  return resolved !== undefined && resolved !== '' && !PLACEHOLDER_RE.test(resolved);
}

function hasRequiredCredentials(): boolean {
  return REQUIRED_ENV_KEYS.every(envHasRealValue);
}

function applyParsed(parsed: dotenv.DotenvParseOutput): void {
  for (const [key, value] of Object.entries(parsed)) {
    const current = process.env[key];
    // Keep real values already present in the shell or passed by the MCP client.
    // Fill unset keys, empty strings (some clients resolve {env:VAR} to "" when
    // the variable is missing), or unresolved {env:VAR} placeholders that the
    // client forwarded because it could not resolve them from the shell.
    if (current === undefined || current === '' || PLACEHOLDER_RE.test(current)) {
      process.env[key] = value;
    }
  }
}

/**
 * Loads environment variables from an env file:
 * - M2_API_MCP_ENV_PROFILE set -> .env.<profile> in CWD
 * - otherwise                     -> .env in CWD (backward compatible)
 *
 * Throws when a profile is set but invalid or its file is missing, so a typo
 * fails loudly instead of silently loading the wrong configuration.
 */
export function loadEnv(): void {
  const profile = process.env.M2_API_MCP_ENV_PROFILE;

  if (profile) {
    if (!PROFILE_RE.test(profile)) {
      throw new Error(
        `Invalid M2_API_MCP_ENV_PROFILE "${profile}". ` +
        `Profile names must start with a letter or number and contain only letters, numbers, dot, dash, or underscore.`
      );
    }

    const envPath = path.join(process.cwd(), `.env.${profile}`);
    if (!fs.existsSync(envPath)) {
      // A profile file is optional when the MCP client (or shell) already
      // supplied real credentials. Otherwise a missing file is a startup error
      // so a typo fails loudly instead of silently loading the wrong config.
      if (hasRequiredCredentials()) {
        process.stderr.write(
          `[ENV] Warning: M2_API_MCP_ENV_PROFILE="${profile}" is set but ${envPath} was not found. ` +
          `Continuing with values already present in process.env.\n`
        );
        return;
      }

      throw new Error(`M2_API_MCP_ENV_PROFILE="${profile}" but file not found: ${envPath}`);
    }

    applyParsed(dotenv.parse(fs.readFileSync(envPath, 'utf8')));
    return;
  }

  const defaultPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(defaultPath)) {
    applyParsed(dotenv.parse(fs.readFileSync(defaultPath, 'utf8')));
  }
}
