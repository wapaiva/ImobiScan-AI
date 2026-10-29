import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PROPERTY_STORAGE_KEY,
  loadJsonRecords,
  saveJsonRecords,
} from './property-storage.ts'

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null },
    setItem(key, value) { values.set(key, value) },
  }
}

test('uses the legacy property key without changing it', () => {
  assert.equal(PROPERTY_STORAGE_KEY, 'imobiscanai.properties.v1')
})

test('loads existing property records from the legacy key', () => {
  const records = [{ id: 'IM-1', name: 'Casa' }]
  const storage = memoryStorage({ [PROPERTY_STORAGE_KEY]: JSON.stringify(records) })
  assert.deepEqual(loadJsonRecords(storage, PROPERTY_STORAGE_KEY, []), records)
})

test('falls back for missing, malformed, or non-array JSON', () => {
  const fallback = [{ id: 'sample' }]
  assert.deepEqual(loadJsonRecords(memoryStorage(), PROPERTY_STORAGE_KEY, fallback), fallback)
  assert.deepEqual(loadJsonRecords(memoryStorage({ [PROPERTY_STORAGE_KEY]: '{' }), PROPERTY_STORAGE_KEY, fallback), fallback)
  assert.deepEqual(loadJsonRecords(memoryStorage({ [PROPERTY_STORAGE_KEY]: '{"id":"x"}' }), PROPERTY_STORAGE_KEY, fallback), fallback)
})

test('writes records to the existing storage key', () => {
  const storage = memoryStorage()
  const records = [{ id: 'IM-2', name: 'Terreno' }]
  assert.equal(saveJsonRecords(storage, PROPERTY_STORAGE_KEY, records), true)
  assert.equal(storage.getItem(PROPERTY_STORAGE_KEY), JSON.stringify(records))
})

test('reports storage write failures instead of throwing', () => {
  const storage = {
    getItem() { return null },
    setItem() { throw new Error('quota exceeded') },
  }
  assert.equal(saveJsonRecords(storage, PROPERTY_STORAGE_KEY, []), false)
})
