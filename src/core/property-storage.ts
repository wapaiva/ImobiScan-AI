/**
 * Typed façade over `property-storage-impl.mjs`, which holds the single
 * runtime implementation (no duplicated logic). The Node test runner imports
 * the .mjs module directly because it cannot load .ts files without a
 * transpiler; application code keeps importing this typed façade.
 */

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

import impl from './property-storage-impl.mjs'

export const PROPERTY_STORAGE_KEY: string = impl.PROPERTY_STORAGE_KEY

/**
 * Loads JSON records without modifying or deleting the original stored value.
 * Invalid JSON and non-array payloads fall back to the supplied initial records.
 */
export function loadJsonRecords<T>(
  storage: KeyValueStorage,
  key: string,
  fallback: T[],
): T[] {
  return loadImpl(storage, key, fallback) as T[]
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
  return saveImpl(storage, key, records) as boolean
}

/** Browser-safe wrappers also catch failures while accessing localStorage itself. */
export function loadBrowserJsonRecords<T>(key: string, fallback: T[]): T[] {
  return loadBrowserImpl(key, fallback) as T[]
}

export function saveBrowserJsonRecords<T>(key: string, records: T[]): boolean {
  return saveBrowserImpl(key, records) as boolean
}
