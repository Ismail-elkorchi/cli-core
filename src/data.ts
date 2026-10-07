/** Reads indexed own data once, without invoking a caller's iterator or methods. */
export function readDataArray(value: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (lengthDescriptor === undefined || !('value' in lengthDescriptor)) return undefined;
  const length: unknown = lengthDescriptor.value;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) return undefined;
  const output: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (descriptor === undefined || !('value' in descriptor)) return undefined;
    output.push(descriptor.value);
  }
  if (Reflect.ownKeys(value).some((key) => key !== 'length' &&
    !(typeof key === 'string' && /^(?:0|[1-9]\d*)$/u.test(key) && Number(key) < length))) return undefined;
  return Object.freeze(output);
}

/** Adopts all own string data properties, including non-enumerable properties. */
export function readDataRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) return undefined;
    output[key] = descriptor.value;
  }
  return Object.freeze(output);
}
