/** Safe wrapper around localStorage. Never throws: private-mode Safari, quota errors,
 *  and corrupt JSON all degrade to in-memory fallback so the game still runs. */

const memory = new Map<string, string>();
let available: boolean | null = null;

function hasLocalStorage(): boolean {
  if (available !== null) return available;
  try {
    const k = '__lsl_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export function readRaw(key: string): string | null {
  if (hasLocalStorage()) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      /* fall through */
    }
  }
  return memory.get(key) ?? null;
}

export function writeRaw(key: string, value: string): boolean {
  memory.set(key, value);
  if (hasLocalStorage()) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function removeRaw(key: string): void {
  memory.delete(key);
  if (hasLocalStorage()) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

export function load<T>(key: string, fallback: T): T {
  const raw = readRaw(key);
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (err) {
    console.warn(`[storage] corrupt save at "${key}", discarding.`, err);
    removeRaw(key);
    return fallback;
  }
}

export function save(key: string, value: unknown): boolean {
  try {
    return writeRaw(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[storage] failed to serialize "${key}"`, err);
    return false;
  }
}

export const storageIsPersistent = (): boolean => hasLocalStorage();
