export const PROPERTY_STORAGE_KEY = 'imobiscanai.properties.v1'

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * Loads JSON records without modifying or deleting the original stored value.
 * Invalid JSON and non-array payloads fall back to the supplied initial records.
 */
export function loadJsonRecords<T>(
  storage: KeyValueStorage,
  key: string,
  fallback: T[],
): T[] {
  try {
    const raw = storage.getItem(key)
    if (raw === null) return fallback
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as T[] : fallback
  } catch {
    return fallback
  }
}

/**
 * Saves the current records to the existing browser key.
 * Storage quota/security errors are intentionally caught so they do not crash
 * rendering; callers should surface a user-facing persistence warning separately.
 */
export function saveJsonRecords<T>(
  storage: KeyValueStorage,
  key: string,
  records: T[],
): boolean {
  try {
    storage.setItem(key, JSON.stringify(records))
    return true
  } catch {
    return false
  }
}

/** Browser-safe wrappers also catch failures while accessing localStorage itself. */
export function loadBrowserJsonRecords<T>(key: string, fallback: T[]): T[] {
  try {
    return loadJsonRecords(globalThis.localStorage, key, fallback)
  } catch {
    return fallback
  }
}

export function saveBrowserJsonRecords<T>(key: string, records: T[]): boolean {
  try {
    return saveJsonRecords(globalThis.localStorage, key, records)
  } catch {
    return false
  }
}
