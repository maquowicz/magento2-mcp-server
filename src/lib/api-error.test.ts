import { classifyHttpResponse, classifyTransportError, formatErrorContent } from './api-error.js';

describe('classifyTransportError', () => {
  it('classifies ECONNREFUSED (including nested cause) as connection_refused', () => {
    const error = Object.assign(new Error('connect ECONNREFUSED 127.0.1.5:443'), { code: 'UND_ERR_CONNECT_ERROR' });
    const result = classifyTransportError(error, 'https://www.natavit.com/rest/V1/store/storeConfigs');
    expect(result.kind).toBe('connection_refused');
    expect(result.message).toContain('UND_ERR_CONNECT_ERROR');
    expect(result.url).toContain('natavit.com');
    expect(result.hint).toMatch(/maintenance mode/i);
  });

  it('unwraps undici cause chains', () => {
    const inner = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    const error = new Error('fetch failed', { cause: inner });
    const result = classifyTransportError(error);
    expect(result.kind).toBe('connection_refused');
  });

  it('classifies ENOTFOUND as dns_failure', () => {
    const error = Object.assign(new Error('getaddrinfo ENOTFOUND nope.invalid'), { code: 'ENOTFOUND' });
    expect(classifyTransportError(error).kind).toBe('dns_failure');
  });

  it('classifies TLS errors', () => {
    const error = Object.assign(new Error('certificate has expired'), { code: 'CERT_HAS_EXPIRED' });
    expect(classifyTransportError(error).kind).toBe('tls_error');
  });

  it('classifies timeouts', () => {
    const error = Object.assign(new Error('Headers Timeout Error'), { code: 'UND_ERR_HEADERS_TIMEOUT' });
    expect(classifyTransportError(error).kind).toBe('timeout');
  });

  it('falls back to unknown with the raw message preserved', () => {
    const result = classifyTransportError(new Error('something weird'));
    expect(result.kind).toBe('unknown');
    expect(result.message).toContain('something weird');
  });
});

describe('classifyHttpResponse', () => {
  it('detects maintenance mode from a 503 status alone', () => {
    const result = classifyHttpResponse(503, '', 'https://www.natavit.com/rest/V1/products');
    expect(result?.kind).toBe('maintenance_mode');
    expect(result?.status).toBe(503);
    expect(result?.hint).toMatch(/maintenance:disable/);
  });

  it('detects maintenance mode from an HTML body even on another status', () => {
    const html = '<!DOCTYPE html><html><body>Service Temporarily Unavailable</body></html>';
    expect(classifyHttpResponse(200, html)?.kind).toBe('maintenance_mode');
  });

  it('detects auth failures', () => {
    const result = classifyHttpResponse(401, '{"message":"The consumer isn\'t authorized."}');
    expect(result?.kind).toBe('auth_failed');
  });

  it('returns null for normal API-level responses', () => {
    expect(classifyHttpResponse(400, '{"message":"Bad request"}')).toBeNull();
    expect(classifyHttpResponse(200, '{"ok":true}')).toBeNull();
    expect(classifyHttpResponse(404, 'Not Found')).toBeNull();
  });
});

describe('formatErrorContent', () => {
  it('emits stable structured JSON with kind/message/hint/url', () => {
    const classified = classifyHttpResponse(503, '', 'https://example.com/rest/V1/x')!;
    const parsed = JSON.parse(formatErrorContent(classified));
    expect(parsed).toEqual({
      error: true,
      kind: 'maintenance_mode',
      message: 'Magento returned 503 Service Unavailable',
      hint: expect.stringMatching(/maintenance:disable/),
      url: 'https://example.com/rest/V1/x',
      status: 503,
    });
  });
});
