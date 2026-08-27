import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { ApiRequestError } from './api-error.js';
import { normalizeBody, normalizeBodyFile, parseBodyText, resolveBody } from './body.js';

function expectInvalid(fn: () => unknown, messagePart?: string, hintPart?: string): void {
  let thrown: unknown;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ApiRequestError);
  const classified = (thrown as ApiRequestError).classified;
  expect(classified.kind).toBe('invalid_request');
  if (messagePart) expect(classified.message).toContain(messagePart);
  if (hintPart) expect(classified.hint).toContain(hintPart);
}

describe('normalizeBody', () => {
  it('serializes object bodies', () => {
    const input = { category: { id: 23, is_active: true } };
    const parsed = normalizeBody(input)!;
    expect(parsed.text).toBe(JSON.stringify(input));
    expect(parsed.value).toEqual(input);
  });

  it('serializes array bodies (bulk endpoints)', () => {
    const input = [{ sku: 'A' }, { sku: 'B' }];
    const parsed = normalizeBody(input)!;
    expect(parsed.text).toBe(JSON.stringify(input));
    expect(parsed.value).toEqual(input);
  });

  it('passes a valid JSON string through verbatim', () => {
    const text = '{"category":{"custom_attributes":[{"attribute_code":"content_constructor_content","value":"[{\\"name\\": \\"Image Teaser\\"}]"}]}}';
    const parsed = normalizeBody(text)!;
    expect(parsed.text).toBe(text);
    expect(parsed.value).toEqual({
      category: {
        custom_attributes: [
          { attribute_code: 'content_constructor_content', value: '[{"name": "Image Teaser"}]' }
        ]
      }
    });
  });

  it('rejects malformed JSON with a structured error and position', () => {
    expectInvalid(
      () => normalizeBody('{"category": {"value": "oops}}'),
      'not valid JSON',
      'position'
    );
  });

  it('detects the surrounding-quotes trap (body parses to a JSON string)', () => {
    // Pasted json.dumps/JSON.stringify output with the outer quotes kept.
    expectInvalid(
      () => normalizeBody('"{\\"category\\": {\\"id\\": 23}}"'),
      'not an object/array',
      'surrounding quotes'
    );
  });

  it('rejects top-level primitives', () => {
    expectInvalid(() => normalizeBody('42'), 'not an object/array');
    expectInvalid(() => normalizeBody('true'), 'not an object/array');
    expectInvalid(() => normalizeBody('null'), 'not an object/array');
  });

  it('returns undefined for empty or absent bodies', () => {
    expect(normalizeBody(undefined)).toBeUndefined();
    expect(normalizeBody(null)).toBeUndefined();
    expect(normalizeBody('')).toBeUndefined();
  });

  it('parses the multi-level escaped body from the issue', () => {
    const text = '{"category":{"id":23,"custom_attributes":[{"attribute_code":"content_constructor_content","value":"[{\\"name\\": \\"Image Teaser\\", \\"content\\": \\"<p class=\\\\\\"nv-lead\\\\\\">lead</p>\\"}]"}]}}';
    const parsed = parseBodyText(text);
    expect(parsed.value).toEqual({
      category: {
        id: 23,
        custom_attributes: [
          {
            attribute_code: 'content_constructor_content',
            value: '[{"name": "Image Teaser", "content": "<p class=\\"nv-lead\\">lead</p>"}]'
          }
        ]
      }
    });
  });
});

describe('normalizeBodyFile', () => {
  const tmpDir = path.join(os.tmpdir(), `m2-mcp-body-test-${Date.now()}`);

  beforeAll(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeTemp(name: string, content: string): Promise<string> {
    const file = path.join(tmpDir, name);
    await fs.writeFile(file, content, 'utf8');
    return file;
  }

  it('reads a valid payload file verbatim', async () => {
    const file = await writeTemp('payload.json', '{"category":{"id":23,"is_active":true}}');
    const parsed = await normalizeBodyFile(file);
    expect(parsed.text).toBe('{"category":{"id":23,"is_active":true}}');
    expect(parsed.value).toEqual({ category: { id: 23, is_active: true } });
  });

  it('resolves relative paths against CWD', async () => {
    await fs.writeFile(path.join(process.cwd(), 'tmp-body-test.json'), '{"a":1}', 'utf8');
    try {
      const parsed = await normalizeBodyFile('tmp-body-test.json');
      expect(parsed.value).toEqual({ a: 1 });
    } finally {
      await fs.rm(path.join(process.cwd(), 'tmp-body-test.json'), { force: true });
    }
  });

  it('reports a missing file as invalid_request', async () => {
    const missing = path.join(tmpDir, 'does-not-exist.json');
    let thrown: unknown;
    try {
      await normalizeBodyFile(missing);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ApiRequestError);
    const classified = (thrown as ApiRequestError).classified;
    expect(classified.kind).toBe('invalid_request');
    expect(classified.message).toContain('Could not read body file');
  });

  it('validates file content and reports the parse position', async () => {
    const file = await writeTemp('bad.json', '{"category": {"value": "oops}}');
    let thrown: unknown;
    try {
      await normalizeBodyFile(file);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ApiRequestError);
    expect((thrown as ApiRequestError).classified.kind).toBe('invalid_request');
    expect((thrown as ApiRequestError).classified.message).toContain('not valid JSON');
  });

  it('detects the surrounding-quotes trap in a file', async () => {
    const file = await writeTemp('trapped.json', '"{\\"category\\": {\\"id\\": 23}}"');
    let thrown: unknown;
    try {
      await normalizeBodyFile(file);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ApiRequestError);
    expect((thrown as ApiRequestError).classified.message).toContain('not an object/array');
  });
});

describe('resolveBody', () => {
  it('normalizes inline body when no file is given', async () => {
    const parsed = await resolveBody({ id: 1 }, undefined);
    expect(parsed!.text).toBe('{"id":1}');
  });

  it('reads a file when bodyFile is given', async () => {
    const file = path.join(os.tmpdir(), 'resolve-body-test.json');
    await fs.writeFile(file, '{"id":2}', 'utf8');
    try {
      const parsed = await resolveBody(undefined, file);
      expect(parsed!.value).toEqual({ id: 2 });
    } finally {
      await fs.rm(file, { force: true });
    }
  });

  it('rejects when both body and bodyFile are provided', async () => {
    let thrown: unknown;
    try {
      await resolveBody({ id: 1 }, 'some/path.json');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ApiRequestError);
    const classified = (thrown as ApiRequestError).classified;
    expect(classified.kind).toBe('invalid_request');
    expect(classified.message).toContain('Both');
  });

  it('returns undefined when neither body nor bodyFile is provided', async () => {
    expect(await resolveBody(undefined, undefined)).toBeUndefined();
    expect(await resolveBody('', '')).toBeUndefined();
  });
});