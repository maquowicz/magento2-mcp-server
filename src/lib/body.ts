import fs from 'fs/promises';
import path from 'path';
import { ApiRequestError } from './api-error.js';

/**
 * Normalized HTTP request body. `text` is the exact bytes sent to Magento;
 * `value` is the parsed JSON value (used by the boolean->1/0 coercion retry).
 */
export interface ParsedBody {
  text: string;
  value: unknown;
}

function invalidBody(message: string, hint: string): never {
  throw new ApiRequestError({ kind: 'invalid_request', message, hint });
}

const NESTED_ESCAPING_HINT = [
  'The body must be valid JSON at the top level (an object or array).',
  'Nested JSON-string attributes (e.g. content_constructor_content) need their quotes escaped for the body string:',
  '  {"category": {"custom_attributes": [{"attribute_code": "content_constructor_content", "value": "[{\\"name\\": \\"Teaser\\"}]"}]}}',
  'If the framework unescapes the body once (opencode), a nested \\" in the document must be typed as \\\\\\" in the tool call.',
  'The recommended alternative is to pass `body` as a JSON object/array directly so the server serializes it for you.'
].join(' ');

function invalidJsonError(error: unknown): never {
  const position = extractPosition(error);
  const message = error instanceof Error ? error.message : String(error);
  invalidBody(
    `Request body is not valid JSON${position !== null ? ` (at position ${position})` : ''}: ${message}`,
    [
      `Inspect the body around position ${position ?? 'the reported offset'} — a missing or extra backslash before a quote is the usual cause.`,
      NESTED_ESCAPING_HINT
    ].join(' ')
  );
}

function extractPosition(error: unknown): number | null {
  if (!(error instanceof Error)) {
    return null;
  }
  const match = /at position\s+(\d+)/.exec(error.message);
  return match ? Number(match[1]) : null;
}

/**
 * Validate and normalize a raw body *text* string. Throws an invalid_request
 * ApiRequestError when the text is malformed JSON or parses to a top-level
 * primitive (the "pasted json.dumps output with surrounding quotes" trap).
 */
export function parseBodyText(text: string): ParsedBody {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    invalidJsonError(error);
  }
  if (value === null || typeof value !== 'object') {
    invalidBody(
      'Request body parses as a JSON string or primitive, not an object/array',
      [
        'Magento REST bodies are always JSON objects (or arrays for bulk endpoints).',
        'This usually means the body was pasted with surrounding quotes (raw JSON.stringify/json.dumps output) — remove the leading and trailing " characters.',
        'Alternatively pass `body` as a JSON object/array directly, or use `bodyFile` to read a prepared payload file.'
      ].join(' ')
    );
  }
  return { text, value };
}

/**
 * Normalize the `body` tool argument into the exact HTTP body text.
 * - object/array -> serialized here (no multi-level escaping needed);
 * - string       -> validated via parseBodyText (sent verbatim);
 * - empty/absent -> undefined (no body).
 * Throws an invalid_request ApiRequestError for malformed input.
 */
export function normalizeBody(body: unknown): ParsedBody | undefined {
  if (body === undefined || body === null || body === '') {
    return undefined;
  }
  if (typeof body === 'string') {
    return parseBodyText(body);
  }
  const text = JSON.stringify(body);
  if (text === undefined) {
    invalidBody(
      'Request body could not be serialized to JSON',
      'Pass a JSON object/array, a JSON document string, or a bodyFile path.'
    );
  }
  return { text, value: body };
}

/**
 * Read a prepared JSON payload file (the build-body.py -> put-body-global.json
 * workflow) and send its contents verbatim. Relative paths resolve against
 * the server's CWD (the MCP client workspace).
 */
export async function normalizeBodyFile(bodyFile: string): Promise<ParsedBody> {
  const resolvedPath = path.resolve(process.cwd(), bodyFile);
  let text: string;
  try {
    text = await fs.readFile(resolvedPath, 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    invalidBody(
      `Could not read body file "${bodyFile}": ${detail}`,
      'Pass an existing JSON payload file path. Relative paths resolve against the MCP client workspace (CWD); use an absolute path otherwise.'
    );
  }
  return parseBodyText(text);
}

/**
 * Resolve the `body`/`bodyFile` tool arguments into a ParsedBody (or undefined
 * when neither is provided). `body` and `bodyFile` are mutually exclusive.
 */
export async function resolveBody(body: unknown, bodyFile: string | undefined): Promise<ParsedBody | undefined> {
  if (bodyFile !== undefined && bodyFile !== null && bodyFile !== '') {
    if (body !== undefined && body !== null && body !== '') {
      invalidBody(
        'Both `body` and `bodyFile` were provided',
        'Supply only one: pass `body` for inline JSON (object/array/string) or `bodyFile` to read a prepared payload file.'
      );
    }
    return normalizeBodyFile(bodyFile);
  }
  return normalizeBody(body);
}