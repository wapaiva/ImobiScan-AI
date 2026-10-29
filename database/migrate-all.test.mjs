import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { migrateDatabase, parseMigrationFileName } from './migrate-all.mjs';
import { DatabaseSync } from './sqlite-driver.mjs';

const migrationsDir = fileURLToPath(new URL('./migrations', import.meta.url));

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'imobiscan-migrate-all-'));
  t.after(async () => { await rm(dir, { recursive: true, force: true }); });
  return join(dir, 'test.sqlite');
}

test('migration file names are parsed strictly', () => {
  assert.deepEqual(parseMigrationFileName('0001_initial.sql'), { version: 1, name: 'initial' });
  assert.equal(parseMigrationFileName('README.md'), null);
  assert.equal(parseMigrationFileName('01_short.sql'), null);
});

test('all migrations apply in order and are idempotent', async (t) => {
  const dbPath = await setup(t);
  const first = await migrateDatabase(dbPath, migrationsDir);
  assert.deepEqual(first.appliedVersions, [1, 2]);
  assert.equal(first.schemaVersion, 2);

  const second = await migrateDatabase(dbPath, migrationsDir);
  assert.deepEqual(second.appliedVersions, []);
  assert.equal(second.schemaVersion, 2);

  const db = new DatabaseSync(dbPath);
  for (const table of ['object_categories', 'object_definitions', 'object_instances', 'plan_versions', 'detected_objects']) {
    db.prepare(`SELECT count(*) AS n FROM ${table}`).get(); // throws if missing
  }
  db.close();
});

test('v2 schema enforces licence metadata on library objects and cross-survey isolation', async (t) => {
  const dbPath = await setup(t);
  await migrateDatabase(dbPath, migrationsDir);
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  const now = new Date().toISOString();

  db.prepare('INSERT INTO object_categories(id,name,created_at) VALUES(?,?,?)').run('cat-doors', 'Portas', now);
  // Licence and origin are mandatory — never assumed.
  assert.throws(() => db.prepare('INSERT INTO object_definitions(id,category_id,name,default_dimensions_json,model_origin,license,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .run('d1', 'cat-doors', 'Porta padrão', '{"width":0.86,"height":2.10}', 'ImobiScan', '', now, now));
  db.prepare('INSERT INTO object_definitions(id,category_id,name,default_dimensions_json,model_origin,license,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .run('d1', 'cat-doors', 'Porta padrão', '{"width":0.86,"height":2.10}', 'ImobiScan builtin', 'ImobiScan-internal', now, now);

  db.prepare('INSERT INTO properties(id,name,property_type,country,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('p1', 'P1', 'residential', 'BR', now, now);
  db.prepare('INSERT INTO properties(id,name,property_type,country,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('p2', 'P2', 'residential', 'BR', now, now);
  db.prepare('INSERT INTO surveys(id,property_id,title,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1', 'p1', 'S1', now, now);
  db.prepare('INSERT INTO surveys(id,property_id,title,created_at,updated_at) VALUES(?,?,?,?,?)').run('s2', 'p2', 'S2', now, now);
  db.prepare('INSERT INTO survey_versions(id,survey_id,version_number,created_at) VALUES(?,?,?,?)').run('v1', 's1', 1, now);
  db.prepare('INSERT INTO survey_versions(id,survey_id,version_number,created_at) VALUES(?,?,?,?)').run('vx', 's2', 1, now);

  // Object instance referencing a room of another survey must fail.
  db.prepare('INSERT INTO rooms(id,survey_id,survey_version_id,name,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('r2', 's2', 'vx', 'Room', now, now);
  assert.throws(() => db.prepare('INSERT INTO object_instances(id,survey_id,definition_id,room_id,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run('i1', 's1', 'd1', 'r2', now, now));

  // Plan version numbers are unique per survey and geometry must be valid JSON.
  db.prepare('INSERT INTO plan_versions(id,survey_id,survey_version_id,version_number,geometry_json,created_at) VALUES(?,?,?,?,?,?)')
    .run('pv1', 's1', 'v1', 1, '{"walls":[]}', now);
  assert.throws(() => db.prepare('INSERT INTO plan_versions(id,survey_id,survey_version_id,version_number,geometry_json,created_at) VALUES(?,?,?,?,?,?)')
    .run('pv2', 's1', 'v1', 1, '{"walls":[]}', now));
  assert.throws(() => db.prepare('INSERT INTO plan_versions(id,survey_id,survey_version_id,version_number,geometry_json,created_at) VALUES(?,?,?,?,?,?)')
    .run('pv3', 's1', 'v1', 2, 'not-json', now));

  // Detected objects keep dimensions_unknown by default; source is constrained.
  db.prepare('INSERT INTO detected_objects(id,survey_id,object_class,detection_source,created_at) VALUES(?,?,?,?,?)')
    .run('do1', 's1', 'door', 'manual_annotation', now);
  const row = db.prepare('SELECT dimensions_known FROM detected_objects WHERE id=?').get('do1');
  assert.equal(row.dimensions_known, 0);
  assert.throws(() => db.prepare('INSERT INTO detected_objects(id,survey_id,object_class,detection_source,created_at) VALUES(?,?,?,?,?)')
    .run('do2', 's1', 'window', 'hallucinated_api', now));
  db.close();
});

test('v2 detected_objects media link enforces referential integrity and survey isolation', async (t) => {
  const dbPath = await setup(t);
  await migrateDatabase(dbPath, migrationsDir);
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  const now = new Date().toISOString();

  db.prepare('INSERT INTO properties(id,name,property_type,country,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('p1', 'P1', 'residential', 'BR', now, now);
  db.prepare('INSERT INTO properties(id,name,property_type,country,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('p2', 'P2', 'residential', 'BR', now, now);
  db.prepare('INSERT INTO surveys(id,property_id,title,created_at,updated_at) VALUES(?,?,?,?,?)').run('s1', 'p1', 'S1', now, now);
  db.prepare('INSERT INTO surveys(id,property_id,title,created_at,updated_at) VALUES(?,?,?,?,?)').run('s2', 'p2', 'S2', now, now);
  db.prepare('INSERT INTO media_assets(id,survey_id,kind,file_name,relative_path,created_at) VALUES(?,?,?,?,?,?)')
    .run('m-s1', 's1', 'photo', 'a.jpg', 'files/a.jpg', now);
  db.prepare('INSERT INTO media_assets(id,survey_id,kind,file_name,relative_path,created_at) VALUES(?,?,?,?,?,?)')
    .run('m-s2', 's2', 'photo', 'b.jpg', 'files/b.jpg', now);

  // 1. Valid insertion: media asset of the same survey.
  db.prepare('INSERT INTO detected_objects(id,survey_id,media_asset_id,object_class,detection_source,created_at) VALUES(?,?,?,?,?,?)')
    .run('det-ok', 's1', 'm-s1', 'door', 'manual_annotation', now);

  // 2. Rejected: reference to a non-existent media asset. The BEFORE INSERT
  // guard trigger fires first (its message does not contain the word
  // "constraint"), so match either the trigger message or a FK error, and
  // verify no row remains in the table afterwards.
  assert.throws(() => db.prepare('INSERT INTO detected_objects(id,survey_id,media_asset_id,object_class,detection_source,created_at) VALUES(?,?,?,?,?,?)')
    .run('det-ghost', 's1', 'does-not-exist', 'door', 'local_model', now), /same survey|constraint/i);
  assert.equal(db.prepare("SELECT count(*) AS n FROM detected_objects WHERE id='det-ghost'").get().n, 0);

  // 3. Rejected: media asset that belongs to another survey (trigger guard).
  assert.throws(() => db.prepare('INSERT INTO detected_objects(id,survey_id,media_asset_id,object_class,detection_source,created_at) VALUES(?,?,?,?,?,?)')
    .run('det-cross', 's1', 'm-s2', 'door', 'local_model', now), /same survey/);

  // 4. Rejected on UPDATE as well (both column change and cross-survey move).
  assert.throws(() => db.prepare('UPDATE detected_objects SET media_asset_id=? WHERE id=?').run('m-s2', 'det-ok'), /same survey/);
  assert.throws(() => db.prepare('UPDATE detected_objects SET media_asset_id=? WHERE id=?').run('does-not-exist', 'det-ok'), /same survey|constraint/i);

  // 5. NULL media link remains valid (detections without associated capture).
  db.prepare('INSERT INTO detected_objects(id,survey_id,media_asset_id,object_class,detection_source,created_at) VALUES(?,?,?,?,?,?)')
    .run('det-null', 's1', null, 'window', 'cloud_model', now);

  // 6. Deleting a referenced media asset is RESTRICTed (no silent orphaning).
  assert.throws(() => db.prepare('DELETE FROM media_assets WHERE id=?').run('m-s1'), /FOREIGN KEY constraint failed/);

  // 7. PRAGMA foreign_key_check reports no violations after all of the above.
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);

  db.close();
});
