/**
 * Resolves {env:VAR_NAME} patterns in a string value.
 * If value contains {env:VAR_NAME}, looks up process.env.VAR_NAME.
 * If value does not match the pattern, returns it unchanged.
 *
 * Detects recursive loops: if resolved value itself matches {env:...},
 * throws a clear error (the upstream env var is unset in the shell).
 */
export function resolveEnvValue(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const match = value.match(/^\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/);
  if (match) {
    const envName = match[1];
    const resolved = process.env[envName];
    if (resolved === undefined) {
      throw new Error(
        `Environment variable "${envName}" referenced as "{env:${envName}}" is not set. ` +
        `Set it in your shell (export ${envName}=...), in a .env file at the project root, or in a .env.<profile> file when M2_API_MCP_ENV_PROFILE is set.`
      );
    }
    if (/^\{env:[A-Za-z_][A-Za-z0-9_]*\}$/.test(resolved)) {
      throw new Error(
        `Circular {env:...} reference: "{env:${envName}}" resolved to "${resolved}". ` +
        `The underlying environment variable "${envName}" is not set. ` +
        `Set it in your shell (export ${envName}=...), in a .env file at the project root, or in a .env.<profile> file when M2_API_MCP_ENV_PROFILE is set.`
      );
    }
    return resolved;
  }
  return value;
}
