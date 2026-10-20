// Writing object keys that come from a model or a file. A plain `obj[key] = value` with the key "__proto__" changes the
// object's prototype instead of adding a key, so every write of an untrusted key goes through here.

/**
 * Set `key` as an own, enumerable data property of `target`, whatever the key is (including `__proto__`).
 * Use for any key that was typed by a model or read from text.
 */
export function setOwn<T>(target: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/**
 * The value under `key` if it is an own property of `source`, else undefined. A plain index would also return things
 * inherited from `Object.prototype` for names such as `constructor`.
 */
export function getOwn<T>(source: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(source, key) ? source[key] : undefined;
}
