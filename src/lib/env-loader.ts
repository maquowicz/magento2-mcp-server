import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const PLACEHOLDER_RE = /^\{env:[A-Za-z_][A-Za-z0-9_]*\}$/;
const PROFILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function applyParsed(parsed: dotenv.DotenvParseOutput): void {
  for (const [key, value] of Object.entries(parsed)) {
    const current = process.env[key];
    // Keep real values already present in the shell or passed by the MCP client.
    // Only fill unset keys, or replace unresolved {env:VAR} placeholders that the
    // client forwarded because it could not resolve them from the shell.
    if (current === undefined || PLACEHOLDER_RE.test(current)) {
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
