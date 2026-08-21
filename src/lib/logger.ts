import fs from 'fs';
import path from 'path';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const LOG_DIR = process.env.M2_API_MCP_LOG_DIR || path.join(__dirname, '..', '..', '.data', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'magento-mcp.log');

// Resolved once at startup: M2_API_MCP_LOG_LEVEL (debug|info|warn|error),
// falling back to the legacy M2_API_MCP_DEBUG=true switch, then 'info'.
const CONFIGURED_LEVEL: LogLevel = ((): LogLevel => {
  const raw = (process.env.M2_API_MCP_LOG_LEVEL || '').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  if (process.env.M2_API_MCP_DEBUG === 'true') return 'debug';
  return 'info';
})();

let logStream: fs.WriteStream | null = null;

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getLogStream(): fs.WriteStream {
  if (!logStream) {
    ensureDir(LOG_DIR);
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    logStream.write(`\n=== MCP Server started at ${new Date().toISOString()} (level=${CONFIGURED_LEVEL}) ===\n`);
  }
  return logStream;
}

// Defense-in-depth: never let bearer tokens, Authorization header values, or
// raw JWTs reach the log, even if a call site forgets to redact them.
function redact(message: string): string {
  return message
    .replace(/(Authorization:\s*Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1<redacted>')
    .replace(/("Authorization"\s*:\s*")[^"]+(")/gi, '$1<redacted>$2')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1<redacted>')
    // JWT-like header.payload.signature; segment length guards keep hostnames
    // like "www.spex4less.test" from being caught.
    .replace(/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{10,}/g, '<jwt-redacted>');
}

function formatMessage(level: string, args: unknown[]): string {
  const timestamp = new Date().toISOString();
  const message = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
    .join(' ');
  return `[${timestamp}] [${level}] ${redact(message)}`;
}

function write(level: LogLevel, args: unknown[]): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[CONFIGURED_LEVEL]) return;
  const msg = formatMessage(level, args);
  process.stderr.write(msg + '\n');
  getLogStream().write(msg + '\n');
}

export const log = {
  debug(...args: unknown[]): void {
    write('debug', args);
  },

  info(...args: unknown[]): void {
    write('info', args);
  },

  error(...args: unknown[]): void {
    write('error', args);
  },

  warn(...args: unknown[]): void {
    write('warn', args);
  }
};
