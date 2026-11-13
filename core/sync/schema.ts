import type { Memory, NewMemory } from '../types';
import {
  decodeImportedMemory,
  decodeStoredMemory,
  decodeSyncMemory,
} from '../memory/codec';
export function parseValidatedArray<T>(
  file: string,
  content: string,
  validate: (value: unknown, path: string) => T,
): T[] {
  const parsed = parseValidatedJson(file, content, (value) => value);

  if (!Array.isArray(parsed)) {
    throw new Error(`Remote ${file} is malformed: expected an array, download stopped`);
  }

  return parsed.map((item, index) => validate(item, `${file}[${index}]`));
}

export function parseValidatedJson<T>(
  file: string,
  content: string,
  validate: (value: unknown, path: string) => T,
): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Remote ${file} is not valid JSON, download stopped`);
  }
  return validate(parsed, file);
}

export function validateStoredMemory(value: unknown, path = 'memory'): Omit<Memory, 'id'> {
  return decodeStoredMemory(value, path);
}

export function validateSyncMemory(value: unknown, path = 'memory'): Omit<Memory, 'id'> {
  return decodeSyncMemory(value, path);
}

export function validateImportedMemory(value: unknown, path = 'memory'): NewMemory {
  return decodeImportedMemory(value, path);
}
