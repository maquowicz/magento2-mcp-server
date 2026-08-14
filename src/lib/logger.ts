import fs from 'fs';
import path from 'path';

const LOG_DIR = process.env.M2_API_MCP_LOG_DIR || path.join(__dirname, '..', '..', '.data', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'magento-mcp.log');

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
    logStream.write(`\n=== MCP Server started at ${new Date().toISOString()} ===\n`);
  }
  return logStream;
}

function formatMessage(level: string, args: unknown[]): string {
  const timestamp = new Date().toISOString();
  const message = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
    .join(' ');
  return `[${timestamp}] [${level}] ${message}`;
}

function isDebug(): boolean {
  return process.env.M2_API_MCP_DEBUG === 'true';
}

export const log = {
  debug(...args: unknown[]): void {
    if (!isDebug()) return;
    const msg = formatMessage('DEBUG', args);
    process.stderr.write(msg + '\n');
    getLogStream().write(msg + '\n');
  },

  info(...args: unknown[]): void {
    const msg = formatMessage('INFO', args);
    process.stderr.write(msg + '\n');
    getLogStream().write(msg + '\n');
  },

  error(...args: unknown[]): void {
    const msg = formatMessage('ERROR', args);
    process.stderr.write(msg + '\n');
    getLogStream().write(msg + '\n');
  },

  warn(...args: unknown[]): void {
    const msg = formatMessage('WARN', args);
    process.stderr.write(msg + '\n');
    getLogStream().write(msg + '\n');
  }
};
