/**
 * Runtime implementation of the property storage adapter.
 *
 * This .mjs module is the single source of truth for the behaviour; the
 * TypeScript façade `property-storage.ts` re-exports it with typed signatures,
 * so there is no duplicated logic between .ts and .mjs. The Node test runner
 * (which cannot import .ts files without a transpiler) imports this module
 * directly, while the browser bundle keeps going through the typed façade.
 */

export const PROPERTY_STORAGE_KEY = 'imobiscanai.properties.v1'

/**
 * Loads JSON records without modifying or deleting the original stored value.
 * Invalid JSON and non-array payloads fall back to the supplied initial records.
 */
export function loadJsonRecords(storage, key, fallback) {
  try {
    const raw = storage.getItem(key)
    if (raw === null) return fallback
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

/**
 * Saves the current records to the existing browser key.
 * Storage quota/security errors are intentionally caught so they do not crash
 * rendering; callers should surface a user-facing persistence warning separately.
 */
export function saveJsonRecords(storage, key, records) {
  try {
    storage.setItem(key, JSON.stringify(records))
    return true
  } catch {
    return false
  }
}

/** Browser-safe wrappers also catch failures while accessing localStorage itself. */
export function loadBrowserJsonRecords(key, fallback) {
  try {
    return loadJsonRecords(globalThis.localStorage, key, fallback)
  } catch {
    return fallback
  }
}

export function saveBrowserJsonRecords(key, records) {
  try {
    return saveJsonRecords(globalThis.localStorage, key, records)
  } catch {
    return false
  }
}
