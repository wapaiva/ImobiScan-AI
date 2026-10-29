import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { applyInitialMigration } from './migrate.mjs';

const migrationPath = new URL('./migrations/0001_initial.sql', import.meta.url).pathname;

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'imobiscan-test-'));
  const dbPath = join(dir, 'test.sqlite');
  t.after(async () => { await rm(dir, { recursive: true, force: true }); });
  return { dir, dbPath };
}

test('migration applies once and is idempotent', async (t) => {
  const { dbPath } = await setup(t);
  assert.deepEqual(await applyInitialMigration(dbPath, migrationPath), { applied: true, version: 1 });
  assert.deepEqual(await applyInitialMigration(dbPath, migrationPath), { applied: false, version: 1 });
  const db = new DatabaseSync(dbPath);
  assert.equal(db.prepare('SELECT count(*) AS n FROM schema_migrations').get().n, 1);
  db.close();
});

test('foreign keys prevent measurements pointing at another survey room', async (t) => {
  const { dbPath } = await setup(t);
  await applyInitialMigration(dbPath, migrationPath);
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  const now = new Date().toISOString();
  db.prepare('INSERT INTO properties(id,name,property_type,country,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('p1','Property','residential','BR',now,now);
  db.prepare('INSERT INTO properties(id,name,property_type,country,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('p2','Property 2','residential','BR',now,now);
  db.prepare('INSERT INTO surveys(id,property_id,title,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1','p1','Survey 1',now,now);
  db.prepare('INSERT INTO surveys(id,property_id,title,created_at,updated_at) VALUES(?,?,?,?,?)').run('s2','p2','Survey 2',now,now);
  db.prepare('INSERT INTO survey_versions(id,survey_id,version_number,created_at) VALUES(?,?,?,?)').run('v1','s1',1,now);
  db.prepare('INSERT INTO survey_versions(id,survey_id,version_number,created_at) VALUES(?,?,?,?)').run('v2','s2',1,now);
  db.prepare('INSERT INTO rooms(id,survey_id,survey_version_id,name,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('r2','s2','v2','Room',now,now);
  assert.throws(() => db.prepare('INSERT INTO measurements(id,survey_id,room_id,quantity,original_value,original_unit,normalized_value,normalized_unit,method,measured_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run('m1','s1','r2','length',3,'m',3,'m','manual',now,now,now));
  db.close();
});

test('confirmed measurement cannot be silently overwritten', async (t) => {
  const { dbPath } = await setup(t);
  await applyInitialMigration(dbPath, migrationPath);
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  const now = new Date().toISOString();
  db.prepare('INSERT INTO properties(id,name,property_type,country,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('p','Property','residential','BR',now,now);
  db.prepare('INSERT INTO surveys(id,property_id,title,created_at,updated_at) VALUES(?,?,?,?,?)').run('s','p','Survey',now,now);
  db.prepare('INSERT INTO measurements(id,survey_id,quantity,original_value,original_unit,normalized_value,normalized_unit,method,measured_at,validation_state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run('m','s','length',3,'m',3,'m','manual',now,'confirmed',now,now);
  assert.throws(() => db.prepare('UPDATE measurements SET original_value = 4, normalized_value = 4 WHERE id = ?').run('m'), /Confirmed measurements/);
  db.close();
});
