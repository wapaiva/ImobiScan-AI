import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { applyInitialMigration } from './migrate.mjs';
import { createVerifiedBackup, validateBackup, copyValidatedBackup } from './backup.mjs';

const migrationPath = fileURLToPath(new URL('./migrations/0001_initial.sql', import.meta.url));
async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'imobiscan-backup-test-'));
  const databasePath = join(dir, 'source.sqlite');
  await applyInitialMigration(databasePath, migrationPath);
  t.after(async () => { await rm(dir, { recursive: true, force: true }); });
  return { dir, databasePath };
}

test('creates and validates a consistent SQLite backup', async (t) => {
  const { dir, databasePath } = await setup(t);
  const result = await createVerifiedBackup(databasePath, join(dir, 'backup.sqlite'));
  assert.equal(result.valid, true);
  assert.equal(result.schemaVersion, 1);
  assert.match(result.checksumSha256, /^[a-f0-9]{64}$/);
});
test('rejects invalid or incompatible backup before copy', async (t) => {
  const { dir } = await setup(t);
  const invalid = join(dir, 'invalid.sqlite');
  await writeFile(invalid, 'not a sqlite database');
  await assert.rejects(() => validateBackup(invalid));
  await assert.rejects(() => copyValidatedBackup(invalid, join(dir, 'restored.sqlite')));
});
test('copies a validated backup without overwriting existing destination', async (t) => {
  const { dir, databasePath } = await setup(t);
  const backup = join(dir, 'backup.sqlite');
  const destination = join(dir, 'copy.sqlite');
  await createVerifiedBackup(databasePath, backup);
  const copied = await copyValidatedBackup(backup, destination);
  assert.equal(copied.valid, true);
  await assert.rejects(() => copyValidatedBackup(backup, destination), /já existe/);
});
test('backup validation detects checksum mismatch', async (t) => {
  const { dir, databasePath } = await setup(t);
  const backup = join(dir, 'backup.sqlite');
  await createVerifiedBackup(databasePath, backup);
  await assert.rejects(() => validateBackup(backup, { expectedSha256: '0'.repeat(64) }), /checksum/);
});
