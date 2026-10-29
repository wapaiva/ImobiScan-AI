import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from './sqlite-driver.mjs';
import { applyInitialMigration } from './migrate.mjs';
import { previewLegacyImport, importLegacyProperties } from './legacy-import.mjs';
import { fileURLToPath } from 'node:url';

const migrationPath = fileURLToPath(new URL('./migrations/0001_initial.sql', import.meta.url));
async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'imobiscan-import-test-'));
  const databasePath = join(dir, 'test.sqlite');
  await applyInitialMigration(databasePath, migrationPath);
  t.after(async () => { await rm(dir, { recursive: true, force: true }); });
  return databasePath;
}
const valid = { id: 'IM-1', name: 'Casa', type: 'Residencial', city: 'SJDR', state: 'MG', area: 100, value: 200000, status: 'Em análise', notes: '' };

test('legacy preview rejects malformed JSON without modifying anything', () => {
  const result = previewLegacyImport('{broken');
  assert.equal(result.validJson, false);
  assert.equal(result.importable.length, 0);
});
test('legacy preview leaves unknown area units pending review', () => {
  const result = previewLegacyImport(JSON.stringify([valid]));
  assert.equal(result.importable.length, 0);
  assert.equal(result.needsReview.length, 1);
  assert.equal(result.needsReview[0].areaUnit, null);
});
test('legacy preview rejects duplicate ids and invalid records', () => {
  const result = previewLegacyImport(JSON.stringify([valid, valid, { ...valid, id: 'IM-2', value: -1 }]));
  assert.equal(result.importable.length, 0);
  assert.equal(result.needsReview.length, 1);
  assert.equal(result.rejected.length, 2);
});
test('legacy import requires explicit confirmation and rolls back on failure', async (t) => {
  const databasePath = await setup(t);
  const preview = previewLegacyImport(JSON.stringify([{ ...valid, areaUnit: 'm2' }]));
  assert.throws(() => importLegacyProperties(databasePath, preview), /Confirmação explícita/);
  const result = importLegacyProperties(databasePath, preview, { confirm: true });
  assert.equal(result.imported, 1);
  const db = new DatabaseSync(databasePath);
  assert.equal(db.prepare('SELECT name FROM properties WHERE id = ?').get('IM-1').name, 'Casa');
  db.close();
});
test('legacy import does not overwrite an existing property', async (t) => {
  const databasePath = await setup(t);
  const preview = previewLegacyImport(JSON.stringify([{ ...valid, areaUnit: 'm2' }]));
  importLegacyProperties(databasePath, preview, { confirm: true });
  const result = importLegacyProperties(databasePath, preview, { confirm: true });
  assert.equal(result.imported, 0);
  assert.equal(result.skippedExisting.length, 1);
});
