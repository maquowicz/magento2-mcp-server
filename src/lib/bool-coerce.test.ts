import { coerceBooleans, containsBoolean, isTypeValidationError, parseJsonSafe } from './bool-coerce.js';

describe('containsBoolean', () => {
  it('finds top-level booleans', () => {
    expect(containsBoolean({ is_active: true })).toBe(true);
    expect(containsBoolean({ is_active: false })).toBe(true);
  });

  it('finds nested booleans in objects and arrays', () => {
    expect(containsBoolean({ faq: { flags: [false, 1] } })).toBe(true);
    expect(containsBoolean([{ ext: { flag: true } }])).toBe(true);
  });

  it('returns false when there are no booleans', () => {
    expect(containsBoolean({ is_active: 1 })).toBe(false);
    expect(containsBoolean({ a: { b: ['true', null] } })).toBe(false);
    expect(containsBoolean('string')).toBe(false);
    expect(containsBoolean(null)).toBe(false);
  });
});

describe('coerceBooleans', () => {
  it('converts booleans to 1/0 recursively', () => {
    expect(coerceBooleans({ is_active: true, nested: { off: false } }))
      .toEqual({ is_active: 1, nested: { off: 0 } });
  });

  it('handles arrays and preserves other value types', () => {
    expect(coerceBooleans({ list: [true, 'yes', 0, null], n: 3.5, s: 'x' }))
      .toEqual({ list: [1, 'yes', 0, null], n: 3.5, s: 'x' });
  });

  it('does not mutate the input object', () => {
    const input = { flag: true };
    coerceBooleans(input);
    expect(input.flag).toBe(true);
  });
});

describe('isTypeValidationError', () => {
  it('matches Magento TypeProcessor messages on 4xx', () => {
    expect(isTypeValidationError(400, '{"message":"Invalid data type of input value. Expected \\"integer\\"."}')).toBe(true);
    expect(isTypeValidationError(400, 'Type error occurred')).toBe(true);
    expect(isTypeValidationError(400, 'Error occurred during "is_active" processing. The "1" value\'s type is invalid. The "int" type was expected. Verify and try again.')).toBe(true);
    expect(isTypeValidationError(400, '{"message":"The entity was not found"}')).toBe(false);
  });

  it('ignores non-4xx statuses', () => {
    expect(isTypeValidationError(200, 'Invalid data type')).toBe(false);
    expect(isTypeValidationError(500, 'Invalid data type')).toBe(false);
  });
});

describe('parseJsonSafe', () => {
  it('parses valid JSON and returns undefined otherwise', () => {
    expect(parseJsonSafe('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonSafe('not json')).toBeUndefined();
  });
});
