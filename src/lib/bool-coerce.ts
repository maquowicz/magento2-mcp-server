export function containsBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return true;
  }
  if (value === null || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(containsBoolean);
  }
  return Object.values(value).some((v) => typeof v === 'boolean' || containsBoolean(v));
}

/**
 * Recursively convert JSON booleans to 1/0. Magento declares many status
 * flags (e.g. is_active, status) as int in service-contract docblocks, so
 * its TypeProcessor rejects JSON true/false for them.
 */
export function coerceBooleans<T>(value: T): T {
  if (typeof value === 'boolean') {
    return (value ? 1 : 0) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map(coerceBooleans) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = coerceBooleans(v);
    }
    return out as T;
  }
  return value;
}

// Matches Magento webapi type-validation failures, e.g.:
// - 'Invalid data type of input value. Expected "integer".'
// - 'Error occurred during "is_active" processing. The "1" value's type is
//    invalid. The "int" type was expected.'  ((string)true === "1")
const TYPE_ERROR_PATTERN =
  /invalid data type|type error|must be of the type|value's type is invalid|type was expected|\bexpected\b.*\b(int|integer|bool|string)\b/i;

export function isTypeValidationError(status: number, responseText: string): boolean {
  if (status < 400 || status >= 500) {
    return false;
  }
  return TYPE_ERROR_PATTERN.test(responseText);
}

export function parseJsonSafe(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
