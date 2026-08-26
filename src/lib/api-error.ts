// Classifies transport/HTTP failures between this server and the Magento
// backend into structured, client-friendly errors. Without this, an outage
// (e.g. maintenance mode) surfaces to MCP clients only as a raw undici code
// or, worse, as "Connection closed" when the process exits.

export type ApiErrorKind =
  | 'connection_refused'
  | 'dns_failure'
  | 'tls_error'
  | 'timeout'
  | 'maintenance_mode'
  | 'auth_failed'
  | 'http_error'
  | 'unknown';

export interface ClassifiedApiError {
  kind: ApiErrorKind;
  /** One-line human-readable summary of what went wrong. */
  message: string;
  /** Actionable next step for the caller (LLM or human). */
  hint: string;
  /** Target URL of the failed request, when known. */
  url?: string;
  /** HTTP status code, when the failure came from a response. */
  status?: number;
}

const MAINTENANCE_MARKERS = [
  'service temporarily unavailable',
  'maintenance',
  // Magento 2 default maintenance-mode page title/body.
  '<title>503',
];

function isMaintenanceBody(body: string): boolean {
  if (!body) return false;
  const lower = body.slice(0, 4096).toLowerCase();
  // HTML responses are never valid API output; treat them as maintenance.
  const looksHtml = lower.includes('<!doctype html') || lower.includes('<html');
  return looksHtml || MAINTENANCE_MARKERS.some((m) => lower.includes(m));
}

/** Extract the undici/Node error `code` (e.g. ECONNREFUSED) from any throw site. */
function errorCode(error: unknown): string {
  if (error && typeof error === 'object') {
    const anyErr = error as Record<string, unknown>;
    if (typeof anyErr.code === 'string') return anyErr.code;
    const cause = anyErr.cause as Record<string, unknown> | undefined;
    if (cause && typeof cause.code === 'string') return cause.code;
  }
  return '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Map a thrown network/transport error to a ClassifiedApiError.
 * Covers undici errors (code on the error or its `cause`) and generic throws.
 */
export function classifyTransportError(error: unknown, url?: string): ClassifiedApiError {
  const code = errorCode(error);
  const rawMessage = errorMessage(error);

  switch (code) {
    case 'ECONNREFUSED':
    case 'UND_ERR_CONNECT_ERROR':
    case 'ECONNRESET':
    case 'EPIPE':
      return {
        kind: 'connection_refused',
        message: `Magento host unreachable (${code}): ${rawMessage}`,
        hint:
          'The Magento backend refused or dropped the connection. ' +
          'If maintenance mode was just enabled, or Apache/Nginx/Varnish was restarted, this is expected. ' +
          'Check that the store is up and out of maintenance mode (`bin/magento maintenance:disable`).',
        url,
      };
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return {
        kind: 'dns_failure',
        message: `Cannot resolve Magento hostname (${code}): ${rawMessage}`,
        hint:
          'DNS lookup failed for the configured M2_API_MCP_MAGENTO_URL host. ' +
          'Verify the URL, /etc/hosts entries, and network connectivity.',
        url,
      };
    case 'CERT_HAS_EXPIRED':
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'EPROTO':
      return {
        kind: 'tls_error',
        message: `TLS/certificate error (${code}): ${rawMessage}`,
        hint:
          'The HTTPS handshake with Magento failed. Self-signed certs should already be allowed; ' +
          'check certificate validity and whether a proxy intercepts TLS.',
        url,
      };
  }

  if (
    code === 'ABORT_ERR' ||
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_BODY_TIMEOUT'
  ) {
    return {
      kind: 'timeout',
      message: `Request to Magento timed out: ${rawMessage}`,
      hint:
        'Magento accepted the connection but did not respond in time. ' +
        'It may be overloaded, frozen, or stuck in maintenance mode serving slowly.',
      url,
    };
  }

  return {
    kind: 'unknown',
    message: `Unexpected error talking to Magento: ${rawMessage}`,
    hint:
      'Inspect the MCP server log (.data/logs/magento-mcp.log) for the full stack trace, ' +
      'and verify the Magento instance is reachable.',
    url,
  };
}

/**
 * Map an HTTP response that indicates the backend itself is failing
 * (as opposed to a normal API-level 4xx the caller should see verbatim).
 * Returns null for statuses we pass through untouched.
 */
export function classifyHttpResponse(status: number, body: string, url?: string): ClassifiedApiError | null {
  if (status === 503 || isMaintenanceBody(body)) {
    return {
      kind: 'maintenance_mode',
      message: `Magento returned ${status} Service Unavailable`,
      hint:
        'Maintenance mode is likely enabled on the store, or a gateway cannot reach the backend. ' +
        'Disable it via `bin/magento maintenance:disable` or ask the store admin.',
      url,
      status,
    };
  }
  if (status === 401 || status === 403) {
    return {
      kind: 'auth_failed',
      message: `Magento rejected credentials (HTTP ${status})`,
      hint:
        'Admin token was missing, expired, or revoked. The token refreshes automatically; ' +
        'if this persists, verify M2_API_MCP_ADMIN_USERNAME/PASSWORD and the admin account status.',
      url,
      status,
    };
  }
  return null;
}

export function formatErrorContent(error: ClassifiedApiError): string {
  return JSON.stringify(
    {
      error: true,
      kind: error.kind,
      message: error.message,
      hint: error.hint,
      ...(error.url ? { url: error.url } : {}),
      ...(error.status !== undefined ? { status: error.status } : {}),
    },
    null,
    2
  );
}

/**
 * Error carrying a ClassifiedApiError so request handlers can return a
 * structured, descriptive MCP error result instead of a bare throw that
 * clients render as an opaque protocol failure.
 */
export class ApiRequestError extends Error {
  readonly classified: ClassifiedApiError;

  constructor(classified: ClassifiedApiError) {
    super(classified.message);
    this.name = 'ApiRequestError';
    this.classified = classified;
  }
}
